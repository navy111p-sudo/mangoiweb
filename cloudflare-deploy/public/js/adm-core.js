// ═══════════════════════════════════════════════════════════════
// adm-core.js — admin.html 핵심 로직 (2단계 스크립트 추출, 2026-07-14)
//   원복: 이 파일 내용을 admin.html 의 <script src=.../adm-core.js> 위치에 인라인.
//   외부 classic script 라 admin.html 의 다른 <script> 와 전역 스코프를 공유한다.
// ═══════════════════════════════════════════════════════════════
/* 💳 PG 수수료율 «표기» 정본 (2026-08-18)
   ⚠️ 화면에 요율 숫자를 손으로 박지 말 것. 서버(accounting-reports.ts 의 PG_FEE_RATE)만
      바뀌면 화면이 조용히 갈라진다 — 실제로 그랬다: 서버가 2.86% 로 바뀐 뒤에도
      회계 화면 3곳이 「3.3%」 라고 쓰고 있었다.
   대사 API 응답에 pg_fee_rate 가 오면 그 값으로 갱신하고, 못 받았을 때만 기본값을 쓴다. */
window.__pgFeeRate = (typeof window.__pgFeeRate === 'number') ? window.__pgFeeRate : 0.0286;
window.pgFeeRateLabel = function(){ return (window.__pgFeeRate * 100).toFixed(2) + '%'; };

/* 🔐 «이 카드가 지금 이 계정에게 감춰져 있는가» — 판정 정본 (2026-08-18)

   카드를 감추는 방법이 **세 갈래**로 늘어났는데 읽는 쪽이 각자 판단하고 있었다.
   그래서 「사이드바엔 없는데 검색에는 나오는」 식의 불일치가 계속 생겼다.
   판정을 여기 한 곳으로 모은다 — 새 숨김 방식이 생기면 **이 함수만** 고칠 것.

     ① `.rbac-hide`         역할 등급 (CARD_POLICY → _applyMenuVisibility)
     ② `.ph118-card-hidden` 권한 매트릭스 (adm-q10.js PERMS)
     ③ 인라인 display:none  옛 방식. 남아 있을 수 있어 계속 인정한다

   ⛔ `.ia6-hide` 는 **넣지 않는다.** 그건 «항목을 누르면 관련 카드만 보이기»(showOnly)의
      일시적 화면 상태이지 «이 사람이 볼 수 있는가» 가 아니다. 넣으면 카드 하나를 고른
      순간 나머지가 전부 «권한 없음» 으로 판정돼 검색·바로가기가 통째로 비워진다.
   ⚠️ 인라인 display 로 감춘 카드는 PC(≥1024px)에서 **실제로는 화면에 보인다**
      (#legacy-cards 복구 규칙이 이긴다 — CLAUDE.md 2장 함정 참고). 그래도 «감춤 의도» 로
      읽는 것이 맞다. 보이는 것이 버그이지 판정이 버그가 아니다. */
window.mangoiCardHidden = function (el) {
  if (!el) return true;
  if (el.classList && (el.classList.contains('rbac-hide') ||
                       el.classList.contains('ph118-card-hidden'))) return true;
  return !!(el.style && el.style.display === 'none');
};
window.notePgFeeRate = function(v){ if (typeof v === 'number' && v > 0) window.__pgFeeRate = v; };

let chartAtt = null, chartRwd = null;
// 🌐 (2026-07-22) 부팅 언어 — admin.html <head> 의 adm-lang-boot 이 저장값·계정 이름으로 미리 판정.
//   영문 이름 계정(해외 매니저·강사)은 로그인 직후부터 영어 화면으로 뜬다.
var adminLang = (window.__ADM_BOOT_LANG === 'en') ? 'en' : 'ko';
// i18n-sweep.js 가 현재 언어를 인식하도록 노출
try { window.getLang = function(){ return adminLang; }; } catch(e){}
// currentLang — 학생관리 load 함수들이 사용. adminLang 와 동기화.
var currentLang = adminLang;
try { window.currentLang = currentLang; } catch{}

// 🗑 (2026-08-15 「A안」) 상단 헤더 접기 토글(toggleTopHeader)·자동숨김(thAutoHide) 제거.
//   접거나 숨길 .top-header 자체가 없어졌다(admin.html 에서 제거, 컨트롤은 #ph162-dock 으로 이관).
//   · 자동숨김은 이미 2026-06-23 에 AUTO_HIDE_ENABLED=false 로 꺼져 있던 죽은 코드였다.
//   · window.toggleTopHeader 는 admin.html 의 ph81 블록이 여전히 빈 함수로 정의하므로,
//     혹시 남아 있는 옛 onclick 이 있어도 ReferenceError 는 나지 않는다.

// 🌐 (2026-07-22) 정적 마크업(data-ko/data-en)만 즉시 바꾸는 부분 — 부팅 시에도 재사용.
//   toggleAdminLang 은 여기에 더해 동적 카드 재조회(load 등)까지 수행한다.
function applyAdminLangDom() {
  // i18n-sweep 트리거 (data-en 없는 한국어 텍스트 자동 영어화)
  try { document.documentElement.lang = adminLang; } catch(e){}
  var newLabel = (adminLang === 'ko') ? 'EN' : 'KO';
  var lbl = document.getElementById('admin-lang-label');
  if (lbl) lbl.textContent = newLabel;
  // textContent
  document.querySelectorAll('[data-ko]').forEach(function(el){
    var txt = el.getAttribute('data-' + adminLang);
    if (txt !== null) {
      el.textContent = txt;
      // 풍선 텍스트 광택 레이어 (::before content: attr(data-text)) 동기화
      if (el.hasAttribute('data-text')) el.setAttribute('data-text', txt);
    }
  });
  // placeholder
  document.querySelectorAll('[data-ko-placeholder]').forEach(function(el){
    var txt = el.getAttribute('data-' + adminLang + '-placeholder');
    if (txt !== null) el.placeholder = txt;
  });
  /* 🌐 (2026-07-23) 짧은 표기(data-ko-ph / data-en-ph)도 함께 처리.
     이 표기는 mango-i18n.js 가 담당하는데 admin.html 은 그 파일을 안 불러온다.
     그래서 영어 문구를 이미 적어 둔 입력칸 52곳이 관리자 화면에서만 한국어로 남아 있었다.
     두 표기를 모두 받아주면 기존 마크업을 안 고치고도 전부 살아난다. */
  document.querySelectorAll('[data-ko-ph]').forEach(function(el){
    var txt = el.getAttribute('data-' + adminLang + '-ph');
    if (txt !== null) el.placeholder = txt;
  });
  // title (tooltip)
  document.querySelectorAll('[data-ko-title]').forEach(function(el){
    var txt = el.getAttribute('data-' + adminLang + '-title');
    if (txt !== null) el.title = txt;
  });
  // innerHTML (HTML 포함 마크업용 — kbd 등)
  document.querySelectorAll('[data-ko-html]').forEach(function(el){
    var txt = el.getAttribute('data-' + adminLang + '-html');
    if (txt !== null) el.innerHTML = txt;
  });
}

function toggleAdminLang() {
  adminLang = (adminLang === 'ko') ? 'en' : 'ko';
  currentLang = adminLang;
  try { window.currentLang = currentLang; } catch{}
  // 🌐 사용자가 직접 고른 언어는 저장 — 새로고침에도 유지되고 자동판정보다 우선.
  //   ⚠️ 단 **그 계정에 한해서만**(mangoi_lang_uid). 이게 없으면 예전에 아무 계정으로든 한 번
  //   누른 값이 해외 스태프 계정까지 영구히 덮어쓴다. (2026-07-23)
  try {
    localStorage.setItem('mangoi_lang', adminLang);
    localStorage.setItem('mangoi_lang_by', 'user');
    var _s = JSON.parse(localStorage.getItem('mangoi_admin_session') || '{}') || {};
    localStorage.setItem('mangoi_lang_uid', String(_s.uid || ''));
  } catch(e){}
  applyAdminLangDom();
  // Re-render dynamic content
  load();
  // 🔒 녹화 목록은 자동 로드하지 않음 — 사용자가 검색하거나 "그래도 전체 목록 보기" 누를 때만 표시
  // 단, 이미 테이블이 노출된 상태라면 언어 변경에 맞춰 다시 그림
  try {
    var _recWrap = document.getElementById('rec-table-wrap');
    if (_recWrap && _recWrap.style.display !== 'none') loadRecordings();
  } catch(e){}
  loadRetention();
  loadActiveRooms();
  // 권한 매트릭스 한/영 즉시 갱신
  if (typeof renderPermMatrix === 'function') { try { renderPermMatrix(); } catch(e){} }
  // Phase 8 v2 동적 갱신
  if (typeof renderPayrollTable === 'function' && _lastPayrollRows && _lastPayrollRows.length > 0) renderPayrollTable();
  if (typeof refreshPayrollSummary === 'function') refreshPayrollSummary();
  if (typeof _updateSortArrows === 'function') _updateSortArrows();
  if (typeof renderPayrollCharts === 'function') {
    var cw = document.getElementById('payroll-charts-wrap');
    if (cw && cw.style.display === 'block' && _lastPayrollRows && _lastPayrollRows.length > 0) renderPayrollCharts();
  }
  // 🌐 동적 카드들에 언어 변경 신호 발송 — MBTI 리스트, 통계 등 자체 재렌더
  try { document.dispatchEvent(new CustomEvent('mangoi:lang-changed', { detail: { lang: adminLang } })); } catch(e){}
}

// 🌐 (2026-07-22) 부팅 언어가 영어면 EN 버튼을 누르지 않아도 첫 화면부터 영어로 그린다.
//   (data-ko/data-en 정적 라벨 — 사전 기반 나머지 문장은 i18n-sweep 이 처리)
(function bootAdminLang(){
  if (adminLang !== 'en') return;
  var run = function(){ try { applyAdminLangDom(); } catch(e){} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
  // 늦게 삽입되는 카드(외부 adm-*.js)까지 한 번 더 훑는다
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(run, 400); });
})();

function fmtMs(ms) {
  if (!ms) return adminLang === 'ko' ? '0초' : '0s';
  const s = Math.round(ms / 1000);
  if (adminLang === 'en') {
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return m + 'm ' + (s%60) + 's';
    return Math.floor(m/60) + 'h ' + (m%60) + 'm';
  }
  if (s < 60) return s + '초';
  const m = Math.floor(s / 60);
  if (m < 60) return m + '분 ' + (s%60) + '초';
  return Math.floor(m/60) + '시간 ' + (m%60) + '분';
}

/* ════════════════════════════════════════════════════════════
   🐢 대시보드 차트 게이트 (2026-08-08)

   왜 —
     관리자 첫 화면은 <details> 카드가 전부 «접힘» 으로 시작한다. 그런데 부팅 때
     load() 가 무조건 끝까지 돌면서, 아무도 안 보는 접힌 카드 안에
       · API 를 10번 (그중 /api/admin/stats/revenue 만 6번 — 스파크라인 5 + 매출차트 1)
       · Chart 인스턴스를 9개 (크기가 0×0 인 캔버스에)
     만들고 있었다. 이게 관리자 첫 화면이 무거운 가장 큰 이유였다.

   어떻게 —
     ① 차트를 품은 카드가 하나라도 열려 있을 때만 그린다.
     ② 닫혀 있으면 _admDashPending 만 세워 두고 조용히 빠진다.
     ③ 사용자가 카드를 펼치면 admDashOnOpen() 이 그때 한 번 그린다.
     ④ 한 번 그린 뒤로는 평소처럼 동작한다(언어 변경·수동 새로고침 등).

   ⚠️ #kpi · #kpi-today 4박스는 카드 밖(항상 보임)이라 이 게이트 위에서 이미 채워진다.
      즉 «화면이 비어 보이는» 구간은 없다.
════════════════════════════════════════════════════════════ */
var ADM_DASH_CARDS = ['card-dashboard', 'card-daily-charts', 'card-kpi-dashboard', 'card-rankings'];
function admDashWanted() {
  try {
    for (var i = 0; i < ADM_DASH_CARDS.length; i++) {
      var el = document.getElementById(ADM_DASH_CARDS[i]);
      if (el && el.open) return true;
    }
  } catch (e) { return true; }   // 판단이 안 되면 예전처럼 그린다 (기능이 사라지는 쪽으로 실패하지 않게)
  return false;
}
function admDashOnOpen() {
  // ⚠️ «_admDashPending 이 서 있을 때만» 으로 두면 안 된다 —
  //   load() 는 /api/dashboard 가 실패하면 그 위(`if (!data) return`)에서 먼저 빠져나가므로
  //   플래그가 안 서고, 그러면 카드를 펼쳐도 영영 아무것도 안 그려진다.
  //   → «아직 한 번도 안 그렸으면» 그린다. 이러면 첫 요청이 실패했어도 펼칠 때 다시 시도한다.
  if (window._admDashDrawn) return;
  window._admDashPending = false;
  try { load(); } catch (e) {}
}
(function bindDashOpen(){
  var bind = function(){
    ADM_DASH_CARDS.forEach(function(id){
      var el = document.getElementById(id);
      if (el && !el.__admDashBound) {
        el.__admDashBound = true;
        el.addEventListener('toggle', function(){ if (this.open) admDashOnOpen(); });
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

async function load() {
  const _pe = document.getElementById('period');
  const days = (_pe && _pe.value) || '7';   // #period 제거됨 → 기본 7일
  let data;
  let httpStatus = null;
  let rawBody = '';

  // ♻️ (2026-08-08) 부팅 때 한 번, 차트 탭을 열 때 또 한 번 — 같은 주소를 두 번 부르고 있었다.
  //   부팅 호출은 카드 밖 #kpi 4박스를 채우려고 꼭 필요하고(항상 보인다), 차트 탭 호출은
  //   그 응답을 그대로 다시 쓰면 된다. 90초 안·같은 기간이면 방금 받은 것을 재사용한다.
  //   ⚠️ «렌더까지 건너뛰지» 않는다 — 아래 그리는 코드는 그대로 탄다. 건너뛰는 건 fetch 뿐이다.
  //      (기간이 다르거나 90초가 지나면 평소처럼 새로 받는다. 오래된 값을 붙잡고 있지 않는다)
  const _c = window._admDashCache;
  const _fresh = !!(_c && _c.days === days && (Date.now() - _c.at) < 90000);

  if (_fresh) {
    data = _c.data;
  } else try {
    const r = await fetch('/api/dashboard?days=' + days);
    httpStatus = r.status;
    rawBody = await r.text();      // 먼저 text로 받아서 비JSON 응답도 진단 가능
    try {
      data = JSON.parse(rawBody);
    } catch (jsonErr) {
      throw new Error('응답이 JSON이 아님 (HTML 에러 페이지 가능성)');
    }
    if (!r.ok || (data && data.ok === false)) {
      throw new Error('서버 에러: ' + (data && data.error ? data.error : rawBody.slice(0, 200)));
    }
  } catch (e) {
    console.warn('[admin] dashboard API 에러:', e, '| HTTP', httpStatus, '| body:', rawBody.slice(0, 500));
    const L = adminLang === 'en';
    const statusLabel = httpStatus ? ('HTTP ' + httpStatus) : (L ? 'Network error' : '네트워크 에러');
    const msg = String(e && e.message || e).replace(/</g, '&lt;');
    document.getElementById('kpi').innerHTML =
      '<div class="card" style="grid-column:1/-1;background:#fdf4f4;border:1px solid #f0d2d2;">' +
        '<div class="card-label" style="color:#dc2626;font-weight:700;">⚠️ ' + (L?'Dashboard Load Failed':'데이터 로드 실패') + ' · ' + statusLabel + '</div>' +
        '<div style="margin-top:10px;font-size:13px;color:#374151;white-space:pre-wrap;word-break:break-all;font-family:MangoiHanSC,ui-monospace,monospace;">' + msg + '</div>' +
        '<div style="margin-top:10px;font-size:11px;color:#6b7280;line-height:1.5;">' +
          (L?'Check F12 Console for full details. Most likely cause: D1 migration not applied yet — run <code>npx wrangler d1 execute mango-db --remote --file=migration-attendance-fields.sql</code>'
             :'F12 콘솔에서 자세한 내용을 확인하세요.<br>가장 흔한 원인: D1 마이그레이션 미적용 → <code style="background:#f3f4f6;padding:2px 4px;border-radius:3px;">npx wrangler d1 execute mango-db --remote --file=migration-attendance-fields.sql</code> 실행 필요.') +
        '</div>' +
      '</div>';
    return;
  }
  if (!data) return;
  // 방금 받은 것을 담아 둔다 — 차트 탭을 열 때 같은 주소를 또 부르지 않게
  if (!_fresh) { try { window._admDashCache = { days: days, at: Date.now(), data: data }; } catch (e) {} }

  // KPI 카드
  const totalSessions = data.connection?.total_sessions || 0;
  const totalDisconnects = data.connection?.total_disconnects || 0;
  const avgActivePct = (data.connection?.avg_active_pct || 0).toFixed(1);
  // totalEmergency 제거 — 비상 이벤트 KPI 카드를 뗀 뒤부터 사용처 없음 (백엔드는 유지)
  const totalRewards = (data.rewards || []).reduce((s,e) => s+e.c, 0);
  const disconnectRate = totalSessions > 0 ? ((totalDisconnects/totalSessions)*100).toFixed(1) : '0';

  const L = adminLang === 'en';
  document.getElementById('kpi').innerHTML = `
    <div class="card"><div class="card-label">${L?'📊 Total Sessions':'📊 총 출석 세션'}</div><div class="card-value">${data.attendance.total}</div><div class="card-sub">${L?'Last '+days+' days':'최근 '+days+'일 누적'}</div></div>
    <div class="card"><div class="card-label">${L?'🗣️ Avg Speaking Ratio':'🗣️ 평균 발화 비율'}</div><div class="card-value">${avgActivePct}%</div><div class="card-sub">${L?'Active / Total session':'활성 발화 / 총 세션시간'}</div></div>
    <div class="card"><div class="card-label">${L?'🔄 Reconnect Rate':'🔄 재연결 발생률'}</div><div class="card-value">${disconnectRate}%</div><div class="card-sub">${L?totalDisconnects+' / '+totalSessions+' sessions':totalDisconnects+'회 / '+totalSessions+'세션'}</div></div>
    <div class="card"><div class="card-label">${L?'🎁 Rewards':'🎁 보상 발급'}</div><div class="card-value">${totalRewards}</div><div class="card-sub">${L?'Stickers + Coupons':'스티커+쿠폰 합산'}</div></div>
  `;

  // 🥭 Phase 20 — 오늘의 KPI 4박스 갱신 (병렬 fetch, 실패해도 다른 위젯에 영향 없음)
  loadTodayKpi();

  // 🐢 (2026-08-08) 여기서부터는 «차트» 구역이다. 접혀 있는 카드에는 그리지 않는다.
  //   지금까지는 카드가 접혀 있어도 부팅 때 무조건 여기까지 내려와, 크기가 0×0 인 캔버스에
  //   Chart 인스턴스를 9개 만들고 API 를 10번 불렀다. 직원이 열어보지도 않는 화면이다.
  //   → 카드가 닫혀 있으면 조용히 돌아가고, 나중에 카드를 펼칠 때 admDashOnOpen() 이 다시 부른다.
  if (!admDashWanted()) { window._admDashPending = true; return; }
  window._admDashDrawn = true;   // 여기부터는 실제로 그린다 — 펼침 재시도 루프를 끊는 표시

  // 🐛 fix(2026-07-14): Chart.js 가 없으면 'Chart is not defined' 로 죽어 이하 위젯이 전부 멈췄음.
  //   미로드면 불러온 뒤 load() 1회 재실행하고 지금은 조용히 반환.
  //   🚚 (2026-08-08) 받는 곳을 jsdelivr → 우리 서버 /vendor/chartjs/ 로 옮겼다.
  //     같은 파일(chart.umd.min.js 4.4.1, 205KB)이 이미 저장소에 있는데 남의 CDN 에서 받고 있었다.
  //     필리핀 회선에서 아픈 건 파일 굵기가 아니라 «왕복»이고, 외부 도메인은 DNS+TLS 왕복을 통째로 더한다.
  if (typeof Chart === 'undefined') {
    if (!window._admChartLoading) {
      window._admChartLoading = true;
      var _cs = document.createElement('script');
      _cs.src = '/vendor/chartjs/chart.umd.min.js';
      _cs.onload = function(){ window._admChartLoading = false; try { load(); } catch(e){} };
      _cs.onerror = function(){
        // 우리 서버에서 못 받으면 예전 CDN 으로 한 번만 물러선다 (차트가 통째로 사라지지 않게)
        window._admChartLoading = false;
        if (window._admChartCdnTried) return;
        window._admChartCdnTried = true;
        var _c2 = document.createElement('script');
        _c2.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
        _c2.onload = function(){ try { load(); } catch(e){} };
        document.head.appendChild(_c2);
      };
      document.head.appendChild(_cs);
    }
    return;
  }

  // 출석 차트
  const byDay = (data.attendance.by_day || []).slice().reverse();
  if (chartAtt) chartAtt.destroy();
  chartAtt = new Chart(document.getElementById('chart-attendance'), {
    type: 'bar',
    data: {
      labels: byDay.map(d => d.date),
      datasets: [
        { label: L?'Unique Users':'고유 사용자', data: byDay.map(d => d.unique_users), backgroundColor: '#f59e0b' },
        { label: L?'Total Sessions':'총 세션', data: byDay.map(d => d.sessions), backgroundColor: '#fde68a' }
      ]
    },
    options: { maintainAspectRatio: false, responsive: true }
  });

  // 보상 차트
  if (chartRwd) chartRwd.destroy();
  chartRwd = new Chart(document.getElementById('chart-rewards'), {
    type: 'doughnut',
    data: {
      labels: (data.rewards || []).map(r => r.type),
      datasets: [{ data: (data.rewards || []).map(r => r.c), backgroundColor: ['#f59e0b','#10b981','#3b82f6','#ef4444'] }]
    },
    options: { maintainAspectRatio: false, responsive: true }
  });

  // TOP 발화자
  // 🐛 fix(2026-07-14): #top-speakers DOM 이 마크업에서 제거됐는데 load() 는 계속 참조 →
  //   getElementById(null).innerHTML 로 죽어 이하 KPI·매출추이 위젯이 전부 0/미갱신이었음
  //   (269행 #emergency-table 과 동일 패턴, 이 줄만 가드 누락. 태초 버그, 리팩토링 무관).
  const _tsEl = document.getElementById('top-speakers');
  const speakers = data.top_speakers || [];
  if (_tsEl) _tsEl.innerHTML = speakers.length === 0
    ? '<tr><td colspan="4" class="empty">'+(adminLang==='en'?'No data':'데이터 없음')+'</td></tr>'
    : speakers.map(s => {
        const pct = s.session_ms > 0 ? ((s.active_ms/s.session_ms)*100).toFixed(1) : '0';
        const displayName = (s.username || s.user_id || '').toString();
        const safeName = displayName.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const uidEnc = encodeURIComponent(s.user_id || '');
        const nameCell = `<a href="/admin/student?uid=${uidEnc}" title="학생 상세보기 열기" style="color:#0984e3;text-decoration:none;border-bottom:1px dotted #0984e3;">${safeName}</a>`;
        return `<tr><td>${nameCell}</td><td>${fmtMs(s.active_ms)}</td><td>${fmtMs(s.session_ms)}</td><td><span class="badge ${pct>=30?'ok':'warn'}">${pct}%</span></td></tr>`;
      }).join('');

  // 비상 이벤트 렌더 블록 제거됨 — #emergency-table DOM 이 없으므로 null 참조 방지.
  //   백엔드 /api/dashboard 는 여전히 emergency 배열을 반환하지만, UI 에서 쓰지 않음.

  // 매출·학생흐름 차트 + 학생 랭킹 — 무겁고 화면 하단이라, 브라우저가 한가할 때 지연 로드
  //   (2026-07-18 성능: 이 4개 fetch 가 초기 렌더/탭 로딩 스피너를 붙잡지 않도록 유휴시간에 실행)
  var _loadDashCharts = function(){
    try{ loadRevenueChart(); }catch(e){}
    try{ loadStudentFlowChart(); }catch(e){}
    try{ loadKpiSparklines(); }catch(e){}     // 5개 KPI 카드의 미니 꺾은선 그래프
    try{ loadStudentRankings(); }catch(e){}    // 발화·시선·집중도 랭킹
  };
  if (window.requestIdleCallback) requestIdleCallback(_loadDashCharts, { timeout: 3000 });
  else setTimeout(_loadDashCharts, 200);
}

/* ════════════════════════════════════════════════════════════
   💵 Phase 15 — 매출·학생흐름 차트 + 기간 컨트롤
════════════════════════════════════════════════════════════ */
let chartRev = null, chartFlow = null;
const _sparkCharts = {};   // sparkline 인스턴스 보관 (5개)

function fmtKrwShort(n) {
  const v = Number(n) || 0;
  if (v >= 100000000) return (v/100000000).toFixed(1) + (adminLang==='en'?'억':'억');
  if (v >= 10000)     return (v/10000).toFixed(1) + (adminLang==='en'?'만':'만');
  return v.toLocaleString('ko-KR') + (adminLang==='en'?'₩':'원');
}

// 🥭 Phase 20 — 오늘의 KPI 4박스 (매출·학생수·결석률·신규등록)
//   - /api/admin/stats/today 한 번 호출로 4개 값 모두 갱신
//   - 실패해도 다른 위젯에 영향 없게 try/catch 안에 가둠
async function loadTodayKpi() {
  const $ = (id) => document.getElementById(id);
  try {
    const r = await fetch('/api/admin/stats/today' + (window.mangoiScopeQS?mangoiScopeQS('?'):''), { credentials:'include' });
    const j = await r.json();
    if (!j || !j.ok) {
      $('today-revenue').textContent  = '—';
      $('today-students').textContent = '—';
      $('today-absence').textContent  = '—';
      $('today-signups').textContent  = '—';
      return;
    }
    const L = adminLang === 'en';

    // 매출 — 천 단위 콤마 + ₩ 표시 (영문은 KRW)
    const rev = j.revenue?.amount_krw || 0;
    $('today-revenue').textContent = (L ? '₩' : '₩') + rev.toLocaleString('ko-KR');
    $('today-revenue-sub').textContent =
      (j.revenue?.pay_count || 0) + (L ? ' payments today (KST)' : '건 결제 (KST)');

    // 학생수 — 활성 학생 중 출석 / 활성
    const att = j.students?.attended || 0;
    const act = j.students?.active || 0;
    $('today-students').textContent = att + (L ? '' : '명');
    $('today-students-sub').textContent =
      (L ? 'Attended ' : '출석 ') + att + (L ? ' / Active ' : ' / 활성 ') + act + (L ? '' : '명');

    // 결석률 — 백분율 (소수 1자리)
    //   🪤 (2026-08-08) 예전엔 서버가 «전체 재원 − 오늘 출석» 을 결석으로 줘서
    //      매일 99.9% 가 빨갛게 떠 있었다(실측: 재원 8,052 · 오늘 출석 8).
    //      오늘 수업이 없는 학생까지 결석으로 센 것이다. 서버에서 분모를
    //      «오늘 예정된 학생» 으로 바로잡았고, 예정 정보를 모르면 null 을 준다.
    //      모를 때 0% 로 그리면 «결석 없음» 이라는 **틀린 사실**이 된다 → «–» 로 둔다.
    // 📅 오늘은 «진행상황», 판단용 비율은 «직전 영업일» 것을 쓴다.
    //   아침 9시에 오늘 미실시율을 내면 100% 다 — 아직 아무 수업도 안 끝났으니까.
    //   시간이 갈수록 저절로 내려가는 숫자는 판단에 못 쓴다. 그래서 둘을 나눠 보여준다.
    //   🪤🪤 (2026-08-09) «어제 값» 도 아직 확정이 아니다 — 카페24 야간 동기화가 최근 14일만
    //      다시 가져오므로 완료 처리가 15일에 걸쳐 들어온다. 굳은 날과 비교하면 일관되게
    //      +5~8%p 나쁘게 나온다. 보정하지 않고(없는 숫자를 지어내는 것) **잣대를 나란히 적는다** —
    //      서버가 주는 weekday_avg_pct = 같은 요일 «굳은 날» 평균.
    const _abs = j.absence || {};
    const _booked = _abs.booked_today || 0, _done = _abs.done_today || 0;
    const _prevRate = (typeof _abs.prev_rate_pct === 'number') ? _abs.prev_rate_pct : null;
    const _wdRate   = (typeof _abs.weekday_avg_pct === 'number') ? _abs.weekday_avg_pct : null;
    $('today-absence').textContent = _booked
      ? (_done + ' / ' + _booked)
      : (L ? 'No class' : '수업 없음');
    // 「8-07(금)」 — 연도는 빼고 요일을 붙인다(같은 요일끼리 비교하는 지표라 요일이 핵심).
    //   ⚠️ getDay() 는 브라우저 시간대를 타므로 getUTCDay() 를 쓴다('2026-08-07' 은 UTC 자정으로 파싱된다).
    function _dLabel(s) {
      if (!s) return '';
      var p = String(s).split('-'); if (p.length !== 3) return String(s);
      var d = new Date(s + 'T00:00:00Z');
      var w = isNaN(d) ? '' : (L ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                                 : ['일','월','화','수','목','금','토'])[d.getUTCDay()];
      return (+p[1]) + '-' + (+p[2]) + (w ? '(' + w + ')' : '');
    }
    var _sub;
    if (_prevRate === null) {
      _sub = L ? 'Done / booked today' : '오늘 완료 / 예약';
    } else if (_wdRate !== null) {
      _sub = _dLabel(_abs.prev_date) + ' ' + _prevRate.toFixed(1) + '%'
           + (L ? ' missed · avg ' : ' 미실시 · 확정평균 ') + _wdRate.toFixed(1) + '%';
    } else {
      _sub = _dLabel(_abs.prev_date) + (L ? ' missed ' : ' 미실시 ') + _prevRate.toFixed(1) + '%';
    }
    $('today-absence-sub').textContent = _sub;
    $('today-absence-sub').title = _wdRate !== null
      ? (L ? 'The previous day is not final yet — Cafe24 keeps posting completions for about 15 days, so it always looks worse. "avg" is the settled average for the same weekday (last 60 days).'
           : '직전 영업일 값은 아직 확정이 아닙니다 — 카페24 완료 처리가 약 15일에 걸쳐 들어와 항상 나쁘게 보입니다. «확정평균» 은 같은 요일의 굳은 날 평균(최근 60일)입니다.')
      : '';

    // 신규 등록 — 단순 카운트
    const sign = j.signups?.count || 0;
    $('today-signups').textContent = sign + (L ? '' : '명');
    $('today-signups-sub').textContent =
      L ? 'New enrollments today (KST)' : '오늘 신규 가입 (KST)';
  } catch (e) {
    $('today-revenue').textContent  = '—';
    $('today-students').textContent = '—';
    $('today-absence').textContent  = '—';
    $('today-signups').textContent  = '—';
    console.warn('[today-kpi] fetch failed:', e);
  }
}

async function loadRevenueChart() {
  const period = (document.getElementById('rev-period')||{}).value || 'month';
  const fromV  = (document.getElementById('rev-from')||{}).value || '';
  const toV    = (document.getElementById('rev-to')||{}).value || '';
  const params = new URLSearchParams({ period });
  if (fromV) params.set('from', fromV);
  if (toV)   params.set('to', toV);
  try {
    const r = await fetch('/api/admin/stats/revenue?' + params + (window.mangoiScopeQS?mangoiScopeQS('&'):''), { credentials:'include' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || r.status);

    // 5단계 KPI 갱신
    const s = j.summary || {};
    document.getElementById('rev-today').textContent   = fmtKrwShort(s.today_rev);
    document.getElementById('rev-month').textContent   = fmtKrwShort(s.month_rev);
    document.getElementById('rev-quarter').textContent = fmtKrwShort(s.quarter_rev);
    document.getElementById('rev-half').textContent    = fmtKrwShort(s.half_rev);
    document.getElementById('rev-year').textContent    = fmtKrwShort(s.year_rev);

    // 범위 합계
    document.getElementById('rev-total').textContent = fmtKrwShort(j.total);

    // 차트 그리기
    if (chartRev) chartRev.destroy();
    chartRev = new Chart(document.getElementById('chart-revenue'), {
      type: 'bar',
      data: {
        labels: j.items.map(it => it.label),
        datasets: [
          {
            label: (adminLang==='en'?'Revenue':'매출'),
            data: j.items.map(it => it.revenue),
            backgroundColor: 'rgba(245, 158, 11, 0.7)',
            borderColor: '#ea580c',
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            label: (adminLang==='en'?'Payment count':'결제 건수'),
            data: j.items.map(it => it.pay_count),
            type: 'line',
            borderColor: '#a855f7',
            backgroundColor: 'rgba(168, 85, 247, 0.15)',
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        maintainAspectRatio: false, responsive: true,
        scales: {
          y:  { position:'left',  beginAtZero:true, title:{display:true,text:(adminLang==='en'?'Revenue (KRW)':'매출(원)')},
                ticks:{ callback:(v)=>fmtKrwShort(v) }},
          y1: { position:'right', beginAtZero:true, grid:{drawOnChartArea:false}, title:{display:true,text:(adminLang==='en'?'Count':'건수')}}
        }
      }
    });
  } catch (e) {
    console.warn('[revenue] load failed:', e);
    if (chartRev) { chartRev.destroy(); chartRev = null; }
    const el = document.getElementById('chart-revenue');
    if (el && el.parentElement) el.parentElement.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af;font-size:13px">'+(adminLang==='en'?'No payment data yet':'결제 데이터 없음')+'</div>';
  }
}

async function loadStudentFlowChart() {
  const fromV = (document.getElementById('rev-from')||{}).value || '';
  const toV   = (document.getElementById('rev-to')||{}).value || '';
  const params = new URLSearchParams();
  if (fromV) params.set('from', fromV);
  if (toV)   params.set('to', toV);
  try {
    const r = await fetch('/api/admin/stats/student-flow?' + params, { credentials:'include' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || r.status);

    document.getElementById('sf-active').textContent  = j.active;
    document.getElementById('sf-new').textContent     = j.total_new;
    document.getElementById('sf-dropped').textContent = j.total_dropped;
    const net = j.net_growth;
    const netEl = document.getElementById('sf-net');
    netEl.textContent = (net > 0 ? '+' : '') + net;
    netEl.style.color = net >= 0 ? '#10b981' : '#ef4444';

    // 일자별 데이터 조립 — 두 시리즈를 같은 라벨 축에 매핑
    const allDates = Array.from(new Set([
      ...(j.new_by_date     || []).map(x => x.date),
      ...(j.dropped_by_date || []).map(x => x.date)
    ])).sort();
    const newMap = new Map((j.new_by_date     || []).map(x => [x.date, x.cnt]));
    const drpMap = new Map((j.dropped_by_date || []).map(x => [x.date, x.cnt]));

    if (chartFlow) chartFlow.destroy();
    chartFlow = new Chart(document.getElementById('chart-student-flow'), {
      type: 'bar',
      data: {
        labels: allDates,
        datasets: [
          { label: (adminLang==='en'?'New':'신규'),
            data: allDates.map(d => newMap.get(d) || 0),
            backgroundColor: 'rgba(59, 130, 246, 0.75)', borderColor:'#2563eb', borderWidth:1, borderRadius:5
          },
          { label: (adminLang==='en'?'Dropped':'탈락'),
            data: allDates.map(d => -(drpMap.get(d) || 0)),  // 음수로 표시 (아래쪽)
            backgroundColor: 'rgba(239, 68, 68, 0.7)', borderColor:'#dc2626', borderWidth:1, borderRadius:5
          }
        ]
      },
      options: {
        maintainAspectRatio:false, responsive:true,
        scales: { y: { beginAtZero:true, ticks:{ callback:(v)=>Math.abs(v) }, title:{display:true, text:(adminLang==='en'?'Students':'학생 수')} } }
      }
    });
  } catch (e) {
    console.warn('[student-flow] load failed:', e);
    if (chartFlow) { chartFlow.destroy(); chartFlow = null; }
    ['sf-active','sf-new','sf-dropped','sf-net'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
  }
}

// 📈 5개 KPI 카드별 미니 꺾은선 (sparkline) 로드
//   각 KPI 의 트렌드를 한 눈에 — 일/월/분기/반기/연 별 다른 윈도우
async function loadKpiSparklines() {
  const today = new Date();
  const fmt = d => d.toISOString().slice(0, 10);

  // (period, fromDate, toDate, canvasId, color) 5종
  const configs = [
    { period: 'day',     from: new Date(today.getTime() - 14*86400000), id: 'spark-today',   color: '#f59e0b' },
    { period: 'month',   from: new Date(today.getFullYear(), today.getMonth() - 5, 1), id: 'spark-month',   color: '#ea580c' },
    { period: 'quarter', from: new Date(today.getFullYear() - 1, today.getMonth() - 6, 1), id: 'spark-quarter', color: '#dc2626' },
    { period: 'half',    from: new Date(today.getFullYear() - 2, 0, 1), id: 'spark-half',    color: '#a855f7' },
    { period: 'year',    from: new Date(today.getFullYear() - 4, 0, 1), id: 'spark-year',    color: '#3b82f6' },
  ];
  const toStr = fmt(today);

  await Promise.allSettled(configs.map(async (c) => {
    try {
      const r = await fetch(`/api/admin/stats/revenue?period=${c.period}&from=${fmt(c.from)}&to=${toStr}` + (window.mangoiScopeQS?mangoiScopeQS('&'):''),
                            { credentials: 'include' });
      const j = await r.json();
      if (!j.ok) return;
      renderSparkline(c.id, j.items || [], c.color);
    } catch (e) { console.warn('[spark]', c.period, 'failed:', e); }
  }));
}

/**
 * 📈 KPI 카드 미니 꺾은선 — Chart.js 없이 인라인 SVG 로 그린다 (2026-08-08)
 *
 * 왜 바꿨나 —
 *   이 스파크라인 5개 때문에 부팅 때 Chart 인스턴스가 5개 더 생기고, 205KB 짜리 차트
 *   라이브러리가 «스파크라인 하나 때문에» 필요해졌다. 축도 범례도 없는 선 하나를 그리는 데
 *   차트 엔진을 통째로 켜고 있었던 셈이다.
 *   SVG polyline 은 브라우저가 그냥 그린다 — 라이브러리 0, 인스턴스 0, 리사이즈 관찰 0.
 *
 * 마크업 —
 *   원래 <canvas id="spark-*"> 였다. 처음 그릴 때 같은 id 의 <div> 로 한 번 바꿔치기하고,
 *   그 다음부터는 그 div 를 다시 쓴다. 바깥에서 부르는 방식(id 로 찾기)은 그대로다.
 *
 * 값 보기 —
 *   점마다 투명한 사각형 + <title> 을 얹어 마우스를 올리면 브라우저 기본 툴팁이 뜬다.
 *   (Chart.js 툴팁과 달리 JS 가 한 줄도 안 돈다)
 */
function renderSparkline(canvasId, items, color) {
  let el = document.getElementById(canvasId);
  if (!el) return;

  // <canvas> → <div> 로 한 번만 교체 (id 유지)
  if (el.tagName === 'CANVAS') {
    const box = document.createElement('div');
    box.id = canvasId;
    box.className = 'spark-svg';
    box.style.cssText = 'width:100%;height:100%;min-height:34px';
    if (el.parentNode) el.parentNode.replaceChild(box, el);
    el = box;
  }

  const data = (items || []).map(i => i.revenue || 0);
  const labels = (items || []).map(i => i.label || '');
  const hasData = data.some(v => v > 0);
  const stroke = hasData ? color : '#d1d5db';

  if (!data.length) {
    el.innerHTML = '<svg viewBox="0 0 100 34" preserveAspectRatio="none" style="width:100%;height:100%;display:block">'
      + '<line x1="0" y1="30" x2="100" y2="30" stroke="#e5e7eb" stroke-width="1.5"/></svg>';
    return;
  }

  const W = 100, H = 34, PAD = 3;
  const max = Math.max.apply(null, data) || 1;
  const n = data.length;
  const xAt = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const yAt = (v) => H - PAD - (v / max) * (H - PAD * 2);

  const pts = data.map((v, i) => xAt(i).toFixed(2) + ',' + yAt(v).toFixed(2)).join(' ');
  const area = '0,' + H + ' ' + (n === 1 ? (xAt(0).toFixed(2) + ',' + yAt(data[0]).toFixed(2) + ' ') : '') + pts + ' ' + W + ',' + H;

  const won = (v) => {
    if (v >= 100000000) return (v / 100000000).toFixed(1) + '억';
    if (v >= 10000)     return (v / 10000).toFixed(1) + '만원';
    return (v || 0).toLocaleString('ko-KR') + '원';
  };

  // 값 보기용 투명 히트 영역 (구간마다 하나)
  let hits = '';
  const bw = W / n;
  for (let i = 0; i < n; i++) {
    hits += '<rect x="' + (i * bw).toFixed(2) + '" y="0" width="' + bw.toFixed(2) + '" height="' + H + '" fill="transparent">'
          + '<title>' + String(labels[i]).replace(/[<&]/g, '') + ': ' + won(data[i]) + '</title></rect>';
  }

  el.innerHTML =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible">'
    + '<polygon points="' + area + '" fill="' + stroke + '" opacity="0.16"/>'
    + '<polyline points="' + pts + '" fill="none" stroke="' + stroke + '" stroke-width="1.6"'
    + ' stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
    + hits
    + '</svg>';
}

// 적용 버튼 + 기간 변경 핸들러
document.getElementById('rev-apply')?.addEventListener('click', () => {
  loadRevenueChart();
  loadStudentFlowChart();
  loadKpiSparklines();
});
document.getElementById('rev-period')?.addEventListener('change', loadRevenueChart);

/* ════════════════════════════════════════════════════════════
   🏆 Phase 15c — 학생 랭킹 (발화·시선·집중도)
════════════════════════════════════════════════════════════ */
async function loadStudentRankings() {
  const period = (document.getElementById('rk-period') || {}).value || 'week';
  const sortBy = (document.getElementById('rk-sort') || {}).value || 'focus';
  const fromV  = (document.getElementById('rk-from') || {}).value || '';
  const toV    = (document.getElementById('rk-to') || {}).value || '';
  const tb = document.getElementById('rk-tbody');
  const sumEl = document.getElementById('rk-summary');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="8" class="empty">' + (adminLang==='en'?'Loading…':'로딩 중…') + '</td></tr>';

  const params = new URLSearchParams({ period, sort_by: sortBy, limit: '20' });
  if (period === 'custom') {
    if (!fromV || !toV) {
      tb.innerHTML = '<tr><td colspan="8" class="empty">' + (adminLang==='en'?'Pick from/to dates':'시작·종료 날짜를 선택하세요') + '</td></tr>';
      return;
    }
    params.set('from', fromV);
    params.set('to', toV);
  }

  try {
    const r = await fetch('/api/admin/stats/student-rankings?' + params, { credentials:'include' });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || r.status);

    if (sumEl) {
      sumEl.textContent = (adminLang==='en'?'Period: ':'기간: ') + j.from + ' ~ ' + j.to + '  ·  ' +
                         (adminLang==='en'?'Total students: ':'전체 학생: ') + j.total;
    }

    if (j.items.length === 0) {
      tb.innerHTML = '<tr><td colspan="8" class="empty">' + (adminLang==='en'?'No data in this period':'기간 내 데이터 없음') + '</td></tr>';
      return;
    }

    const fmtMs2 = (ms) => {
      if (!ms) return '0';
      const s = Math.floor(ms/1000), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
      if (h) return h + (adminLang==='en'?'h ':'시간 ') + m + (adminLang==='en'?'m':'분');
      if (m) return m + (adminLang==='en'?'m ':'분 ') + sec + (adminLang==='en'?'s':'초');
      return sec + (adminLang==='en'?'s':'초');
    };
    const scoreBadge = (n, hi=70, mid=40) => {
      if (n == null || isNaN(n)) return '<span class="badge" style="background:#f3f4f6;color:#9ca3af">—</span>';
      const v = Math.round(Number(n)*10)/10;
      const cls = v >= hi ? 'ok' : v >= mid ? 'warn' : '';
      const bg = v >= hi ? '#d1fae5' : v >= mid ? '#fef3c7' : '#fee2e2';
      const fg = v >= hi ? '#065f46' : v >= mid ? '#92400e' : '#991b1b';
      return `<span class="badge" style="background:${bg};color:${fg};font-weight:700">${v}</span>`;
    };
    const escName = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    tb.innerHTML = j.items.map((it, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1);
      const uidEnc = encodeURIComponent(it.user_id);
      return `<tr>
        <td style="font-weight:700;text-align:center">${medal}</td>
        <td><a href="/admin/student?uid=${uidEnc}" target="_blank" style="color:#0984e3;text-decoration:none;border-bottom:1px dotted #0984e3">${escName(it.username)}</a></td>
        <td>${it.session_count}</td>
        <td>${fmtMs2(it.active_ms)}</td>
        <td>${fmtMs2(it.session_ms)}</td>
        <td>${scoreBadge(it.active_ratio, 30, 10)}<span style="color:#94a3b8;font-size:11px;margin-left:4px">%</span></td>
        <td>${scoreBadge(it.avg_gaze)}${it.gaze_count?'<span style="color:#94a3b8;font-size:11px;margin-left:4px">(' + it.gaze_count + ')</span>':''}</td>
        <td>${scoreBadge(it.focus_score)}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    console.warn('[rankings] load failed:', e);
    tb.innerHTML = '<tr><td colspan="8" class="empty">' + (adminLang==='en'?'Load failed':'로드 실패') + ': ' + (e.message||e) + '</td></tr>';
  }
}

// 컨트롤 바인딩
(function bindRankingsControls(){
  const periodEl = document.getElementById('rk-period');
  const fromEl   = document.getElementById('rk-from');
  const toEl     = document.getElementById('rk-to');
  const applyBtn = document.getElementById('rk-apply');
  const sortEl   = document.getElementById('rk-sort');
  if (!periodEl) return;

  periodEl.addEventListener('change', () => {
    const isCustom = periodEl.value === 'custom';
    fromEl.disabled = !isCustom;
    toEl.disabled = !isCustom;
    if (isCustom && !fromEl.value) {
      const today = new Date();
      const monthAgo = new Date(today.getTime() - 30 * 86400000);
      fromEl.value = monthAgo.toISOString().slice(0, 10);
      toEl.value = today.toISOString().slice(0, 10);
    }
  });
  applyBtn?.addEventListener('click', loadStudentRankings);
  sortEl?.addEventListener('change', loadStudentRankings);
})();

// 기본 날짜 채우기 (최근 6개월)
(function setDefaultDates(){
  const today = new Date();
  const sixMoAgo = new Date(today.getTime() - 180 * 86400000);
  const f = document.getElementById('rev-from');
  const t = document.getElementById('rev-to');
  if (f && !f.value) f.value = sixMoAgo.toISOString().slice(0, 10);
  if (t && !t.value) t.value = today.toISOString().slice(0, 10);
})();

// 통합 녹화 목록 상태 (필터링을 위해 전역 보관)
var _unifiedRecRows = [];
var _currentRecFilter = 'all';

// 🔎 녹화 검색·페이지네이션 상태 (Phase 3)
var _recQuery  = { q: '', date_from: '', date_to: '', status: 'all' };
var _recOffset = 0;
var _recLimit  = 50;
var _recTotal  = 0;
var _recBlobTruncated = false;   // R2 목록이 상한에 걸려 «잘렸는가» — 잘렸으면 「영상 없음」이 거짓일 수 있다

/* 🔢 표 안 필터·머리글 정렬 (2026-09-01)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 이 표에는 서버 검색(방·교사·날짜·상태)만 있었고, 정작 화면에 있는 시간·크기·
        참가자·시선/말하기/총 참여도 칸으로는 좁힐 수도 정렬할 수도 없었다.
        「참여도 낮은 수업만 보자」·「길게 찍힌 것부터 보자」를 눈으로 훑어야 했다.
   [범위] 여기서 거르고 정렬하는 것은 «지금 불러온 쪽»(기본 50건)뿐이다. 서버가
        페이지로 잘라 주기 때문이다. ⛔ 그래서 화면이 «N건 중 M건» 을 반드시 말한다 —
        감추면 「전체를 걸렀다」로 읽혀 없는 결론을 내리게 된다.
   ⚠️ 점수 계산(총 참여도)은 여기 _recPartScore 하나뿐이다. 그리는 쪽도 이것을 쓴다 —
      같은 판정을 두 곳에 복사하면 한쪽만 고쳐진다(CLAUDE.md 2장). */
var _recColF = { text: '', part: 'all', dur: 'all', size: 'all', users: 'all', play: 'all' };
var _recSort = { key: '', dir: 0 };   // dir: 1=올림순 ▲ / -1=내림순 ▼ / 0=원래 순서(서버가 준 최신순)

/* 총 참여도 — 시선·말하기의 평균. 한쪽만 있으면 그쪽 값. 둘 다 없으면 null. */
function _recPartScore(r) {
  var g = (r.gaze_score     === null || r.gaze_score     === undefined || isNaN(Number(r.gaze_score)))     ? null : Number(r.gaze_score);
  var sp= (r.speaking_score === null || r.speaking_score === undefined || isNaN(Number(r.speaking_score))) ? null : Number(r.speaking_score);
  if (g === null && sp === null) return null;
  if (g === null) return sp;
  if (sp === null) return g;
  return (g + sp) / 2;
}
/* 참가자 수 — participant_names 는 JSON 문자열이고 고아 blob 은 아예 없다. */
function _recUserCount(r) {
  if (r.source === 'orphan') return null;
  try { var a = JSON.parse(r.participant_names || '[]'); return Array.isArray(a) ? a.length : 0; } catch (_) { return 0; }
}

/* 표 안 필터 한 줄 판정 — 참이면 남긴다. */
function _recPassColF(r) {
  var F = _recColF;
  if (F.text) {
    /* 🧑‍🏫 2026-09-04 — 화면에 «교사 이름·아이디·학생» 이 보이므로 그 말로도 걸러져야 한다.
       안 넓히면 보이는 이름을 쳤는데 0건이 나와 「검색이 고장났다」로 읽힌다.
       ⚠️ 이건 «이 쪽» 안에서만 도는 표 안 필터다 — 전체 검색은 서버(q)가 맡는다. */
    var hay = String(r.room_id || '') + ' ' + String(r.teacher || '') + ' '
            + String(r.teacher_uid || '') + ' ' + String(r.started_by || '') + ' '
            + (r.students || []).map(function (s) {
                return String((s && s.name) || '') + ' ' + String((s && s.uid) || '');
              }).join(' ');
    if (hay.toLowerCase().indexOf(F.text.toLowerCase()) < 0) return false;
  }
  if (F.part !== 'all') {
    var p = _recPartScore(r);
    if (F.part === 'na')   { if (p !== null) return false; }
    else if (p === null)   { return false; }
    else if (F.part === 'high') { if (p < 80) return false; }
    else if (F.part === 'mid')  { if (p < 50 || p >= 80) return false; }
    else if (F.part === 'low')  { if (p >= 50) return false; }
  }
  if (F.dur !== 'all') {
    var m = (Number(r.duration_ms) || 0) / 60000;
    if (F.dur === 'lt1'   && !(m <  1))            return false;
    if (F.dur === '1-10'  && !(m >= 1  && m < 10)) return false;
    if (F.dur === '10-30' && !(m >= 10 && m < 30)) return false;
    if (F.dur === 'gte30' && !(m >= 30))           return false;
  }
  if (F.size !== 'all') {
    var mb = (Number(r.size_bytes) || 0) / (1024 * 1024);
    if (F.size === 'zero'   && !(mb === 0))              return false;
    if (F.size === 'lt10'   && !(mb >  0  && mb < 10))   return false;
    if (F.size === '10-100' && !(mb >= 10 && mb < 100))  return false;
    if (F.size === 'gte100' && !(mb >= 100))             return false;
  }
  if (F.users !== 'all') {
    var n = _recUserCount(r);
    if (n === null) return false;               // 고아 blob 은 참가자를 «모른다» — 숫자 조건에서 뺀다
    if (F.users === '0'     && n !== 0) return false;
    if (F.users === '1'     && n !== 1) return false;
    if (F.users === '2plus' && n <   2) return false;
  }
  if (F.play === 'yes' && !r.blobKey) return false;
  if (F.play === 'no'  &&  r.blobKey) return false;
  return true;
}

/* 정렬 값 — 숫자면 숫자로, 아니면 문자열로. 값이 없으면 null(항상 뒤로 보낸다). */
function _recSortVal(r, key) {
  if (key === 'room')    return String(r.room_id || '');
  /* 🧑‍🏫 교사 이름·아이디 — 못 찾은 행은 null 이라 «모름» 이 맨 위를 덮지 않는다
     (아래 «값 없음은 항상 뒤로» 규칙. 학생 칸과 같은 방식). */
  if (key === 'teacher')   return String(r.teacher     || '') || null;
  if (key === 'teacherid') return String(r.teacher_uid || '') || null;
  /* 🎓 학생 — 맨 앞(예약의 학생) 이름으로 정렬한다. 아무도 못 찾았으면 null 이라 뒤로 간다
     («모른다» 가 맨 위를 덮지 않는다 — 아래 «값 없음은 항상 뒤로» 규칙). */
  if (key === 'student')   { var _s0 = (r.students || [])[0];
    /* 이름을 모르면(서버가 계정을 name 에 넣어 준 경우) «모름» 으로 둔다 — 화면이 «—» 를
       그리는데 정렬만 아이디로 하면 「왜 여기 있지」가 된다. 화면과 같은 판정을 쓴다. */
    if (!_s0) return null;
    var _n0 = String(_s0.name || '').trim(), _u0 = String(_s0.uid || '').trim();
    return (_n0 && _n0 !== _u0) ? _n0 : null; }
  if (key === 'studentid') { var _s1 = (r.students || [])[0]; return _s1 ? (String(_s1.uid || '') || null) : null; }
  if (key === 'status')  return String(r.status  || '');
  if (key === 'storage') return String(r.source  || '');
  if (key === 'start')   return Number(r.startedAt)   || 0;
  if (key === 'dur')     return Number(r.duration_ms) || 0;
  if (key === 'size')    return Number(r.size_bytes)  || 0;
  if (key === 'users')   return _recUserCount(r);
  if (key === 'gaze')    return (r.gaze_score     === null || r.gaze_score     === undefined || isNaN(Number(r.gaze_score)))     ? null : Number(r.gaze_score);
  if (key === 'speak')   return (r.speaking_score === null || r.speaking_score === undefined || isNaN(Number(r.speaking_score))) ? null : Number(r.speaking_score);
  if (key === 'part')    return _recPartScore(r);
  return null;
}

/* ⛔ 원본 배열을 제자리에서 뒤집지 말 것 — «원래 순서» 로 못 돌아온다. slice() 로 사본. */
function _recApplySort(rows) {
  if (!_recSort.key || !_recSort.dir) return rows;
  var key = _recSort.key, dir = _recSort.dir;
  return rows.slice().sort(function (a, b) {
    var va = _recSortVal(a, key), vb = _recSortVal(b, key);
    // 값 없음(—)은 방향과 무관하게 항상 뒤로 — 안 그러면 «점수 없음» 이 맨 위를 덮는다
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    if (typeof va === 'string' || typeof vb === 'string') {
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    }
    return (va - vb) * dir;
  });
}

/* 머리글 화살표 — 자식 요소가 아니라 data-ar 속성으로 그린다(CSS ::after).
   i18n 엔진이 [data-ko] 요소의 textContent 를 통째로 덮어써서 자식 span 은 사라진다. */
function _recSyncSortHead() {
  var ths = document.querySelectorAll('#card-recording-storage th.rec-sort-th');
  for (var i = 0; i < ths.length; i++) {
    var th = ths[i], on = (th.getAttribute('data-sk') === _recSort.key && _recSort.dir !== 0);
    th.setAttribute('data-ar', on ? (_recSort.dir > 0 ? '▲' : '▼') : '⇅');
    // ⚠️ classList 는 «바뀔 때만» 쓴다 — 이 저장소는 무의미한 class 쓰기로 홈이 두 번 멎었다
    if (on !== th.classList.contains('rec-sort-on')) th.classList.toggle('rec-sort-on', on);
  }
}

/* 머리글 누르기 — 올림순 ▲ → 내림순 ▼ → 원래 순서 로 돈다. */
window.recSortBy = function (key) {
  if (_recSort.key !== key) { _recSort.key = key; _recSort.dir = 1; }
  else if (_recSort.dir === 1)  { _recSort.dir = -1; }
  else if (_recSort.dir === -1) { _recSort.dir = 0; _recSort.key = ''; }
  else { _recSort.dir = 1; }
  _recSyncSortHead();
  renderRecordingsTable();
};

function _buildRecordingsURL() {
  const p = new URLSearchParams();
  if (_recQuery.q)         p.set('q',         _recQuery.q);
  if (_recQuery.date_from) p.set('date_from', _recQuery.date_from);
  if (_recQuery.date_to)   p.set('date_to',   _recQuery.date_to);
  if (_recQuery.status && _recQuery.status !== 'all') p.set('status', _recQuery.status);
  p.set('limit',  String(_recLimit));
  p.set('offset', String(_recOffset));
  return '/api/recordings?' + p.toString();
}

async function loadRecordings() {
  // DB 녹화 목록(검색·페이징 적용) + R2 blob 목록(전체)
  let recResp = null, recList = [], blobRes = { items: [] };
  try {
    const [rResp, bData] = await Promise.all([
      fetch(_buildRecordingsURL(), { cache: 'no-store' }).catch(() => null),
      fetch('/api/recordings/blob/list').then(r => r.json()).catch(() => ({ items: [] }))
    ]);
    recResp = rResp;
    blobRes = bData;
    _recBlobTruncated = !!(bData && bData.truncated);
    if (recResp && recResp.ok) {
      recList = await recResp.json().catch(() => []);
      // 서버가 보낸 페이지네이션 메타 헤더 갱신
      const t = parseInt(recResp.headers.get('X-Total-Count') || '', 10);
      if (!isNaN(t)) _recTotal = t;
      const o = parseInt(recResp.headers.get('X-Offset')      || '', 10);
      if (!isNaN(o)) _recOffset = o;
      const l = parseInt(recResp.headers.get('X-Limit')       || '', 10);
      if (!isNaN(l)) _recLimit  = l;
    }
  } catch (e) {
    console.warn('[admin] recordings API 에러:', e);
    return;
  }
  const list = recList || [];
  const blobs = (blobRes.items || []).sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

  // R2 blob을 key로 빠르게 조회할 수 있는 Map 구성
  const blobByKey = new Map();
  for (const b of blobs) blobByKey.set(b.key, b);

  // 시간 기반 매칭 (file_url이 비어 있는 D1 레코드를 위해)
  function findBlobForRecording(rec) {
    if (rec.file_url && blobByKey.has(rec.file_url)) return rec.file_url;
    for (const b of blobs) {
      const keyParts = b.key.split('/');
      if (keyParts[0] === rec.room_id) {
        const blobTime = new Date(b.uploaded).getTime();
        const recEnd = rec.ended_at || (rec.started_at + (rec.duration_ms || 0));
        if (Math.abs(blobTime - recEnd) < 120000) return b.key;
      }
    }
    return null;
  }

  // 통합 행 생성: D1 레코드를 먼저 걸고, 매칭된 R2 blob은 "사용됨" 표시
  const usedBlobKeys = new Set();
  const rows = [];

  for (const r of list) {
    const matchedKey = findBlobForRecording(r);
    if (matchedKey) usedBlobKeys.add(matchedKey);
    const hasD1 = true;
    const hasR2 = !!matchedKey;
    const source = hasD1 && hasR2 ? 'both' : 'd1only';
    const matchedBlob = matchedKey ? blobByKey.get(matchedKey) : null;

    rows.push({
      id: r.id,         // D1 recordings.id — Phase 4 삭제/복원 PATCH 에 필요
      source,           // 'both' | 'd1only' | 'orphan'
      startedAt: r.started_at || 0,
      room_id: r.room_id,
      /* 🧑‍🏫 교사 (2026-09-04) — 서버(/api/recordings)가 예약→원부→계정을 타고 풀어 준다.
         ⛔ `r.teacher_name || r.teacher_id` 로 되돌리지 말 것 — 앞의 것은 «방을 먼저 켠 사람»
            이라 학생 계정이 그대로 올라오고(실측 2,122행 중 670행), 뒤의 것은 **DO 임시번호**
            (`u_iyeuu18a2v`, 실측 99.2%)다. 그게 「교사 이름에 아이디가 나온다」의 원인이었다.
         판정 정본·근거는 src/recording-teacher.ts. 못 찾으면 빈 값이고 화면이 «—» 로 말한다. */
      teacher:    (r.teacher && r.teacher.name) || '',
      teacher_uid:(r.teacher && r.teacher.uid)  || '',
      teacher_src:(r.teacher && r.teacher.source) || 'none',
      /* 원본 표시이름 — 「그럼 이 녹화는 누가 켰나」를 툴팁으로만 말한다(칸으로 그리지 않는다). */
      started_by: r.teacher_name || '',
      /* 🎓 학생 칸 (2026-09-01) — 서버(/api/recordings)가 예약·학생명부에서 «계정 완전일치» 로
         풀어 준다. ⛔ 화면이 participant_names 로 대신 만들지 말 것 — 그 배열에는 교사
         표시이름과 임시 접속번호가 섞여 있다(정본·근거: src/recording-students.ts). */
      students: Array.isArray(r.students) ? r.students : [],
      duration_ms: r.duration_ms || 0,
      size_bytes: r.size_bytes || (matchedBlob ? matchedBlob.size : 0),
      participant_names: r.participant_names,
      consented_user_ids: r.consented_user_ids,
      status: r.status,
      blobKey: matchedKey,
      blobUrl: matchedBlob ? matchedBlob.url : null,
      originalName: matchedBlob ? matchedBlob.originalName : null,
      /* 📼 2026-09-01 — 서버(/api/recordings)가 «저장 전용» 통로와 공유 링크를 만들어 준다.
         화면이 조립하지 않는 이유는 그쪽 주석 참고(파일이 정말 있는지를 화면은 모른다).
         ⛔ 없을 때 화면이 대신 만들어 넣지 말 것 — 404 나는 버튼이 생긴다. */
      dl_url: r.dl_url || null,
      share_url: r.share_url || null,
      share_expires_at: r.share_expires_at || 0,
      // 학생별 참여도 점수 — API(/api/recordings) 가 D1 attendance 집계 결과로 채워줌.
      // gaze_score 는 시선 추적 데이터가 아직 없어 NULL 로 옴 → UI 에서 "—" 로 표시.
      gaze_score: r.gaze_score,         // 0~100 또는 null
      speaking_score: r.speaking_score, // 0~100 또는 null (방의 평균 발화비율)
      // 진단 정보 — "—" 가 왜 비어있는지 툴팁으로 보여주기 위함
      attendance_count:    r.attendance_count    || 0,
      gaze_missing_count:  r.gaze_missing_count  || 0,
      speaking_zero_count: r.speaking_zero_count || 0
    });
  }

  // D1에 없고 R2에만 존재하는 "고아" blob
  for (const b of blobs) {
    if (usedBlobKeys.has(b.key)) continue;
    const keyParts = b.key.split('/');
    const roomId = keyParts[0] || '-';
    rows.push({
      source: 'orphan',
      startedAt: b.uploaded ? new Date(b.uploaded).getTime() : 0,
      room_id: roomId,
      // 고아 blob 은 D1 메타가 없어 교사·학생을 알 길이 없다 — 빈 값으로 두고 화면이 이유를 말한다.
      teacher: '', teacher_uid: '', teacher_src: 'none', started_by: '',
      students: [],
      duration_ms: 0,
      size_bytes: b.size || 0,
      participant_names: '[]',
      consented_user_ids: '[]',
      status: 'orphan',
      blobKey: b.key,
      blobUrl: b.url,
      originalName: b.originalName || (keyParts[keyParts.length-1] || b.key),
      // 고아 blob (R2 만 있음) 은 D1 메타가 없으므로 점수도 없음
      gaze_score: null,
      speaking_score: null
    });
  }

  // 최신순 정렬
  rows.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  // 🔐 RBAC 스코프 필터 — 본사 외 사용자에겐 자기 학생/대리점 녹화만
  let _scopedRows = rows;
  try { if (typeof window.refreshStorageStats === 'function') window.refreshStorageStats(); } catch (_) {}
  if (typeof window.adminScopeFilter === 'function') _scopedRows = window.adminScopeFilter(rows, 'recordings');
  _unifiedRecRows = _scopedRows;
  renderRecordingsTable();
  renderRecordingsPagination();
  // 🔓 검색/로드 완료 시 안내 박스 숨기고 검색바·필터·테이블 모두 표시
  try {
    var promptEl = document.getElementById('rec-prompt-empty');
    var bar = document.getElementById('rec-search-bar');
    var filters = document.getElementById('rec-filters');
    var colf = document.getElementById('rec-colfilter');
    var tableWrap = document.getElementById('rec-table-wrap');
    if (promptEl) promptEl.style.display = 'none';
    if (bar) bar.style.display = 'flex';
    if (filters) filters.style.display = 'flex';
    if (colf) colf.style.display = 'flex';
    if (tableWrap) tableWrap.style.display = '';
  } catch(e){}
}

// 🔍 검색 도구 열기 — 안내 숨기고 검색바·필터·테이블 영역 모두 표시 (데이터 로드는 사용자 검색 후)
window.vcRecordingsToolsOpen = function() {
  var promptEl = document.getElementById('rec-prompt-empty');
  var bar = document.getElementById('rec-search-bar');
  var filters = document.getElementById('rec-filters');
  var colf = document.getElementById('rec-colfilter');
  var tableWrap = document.getElementById('rec-table-wrap');
  if (promptEl) promptEl.style.display = 'none';
  if (bar) bar.style.display = 'flex';
  if (filters) filters.style.display = 'flex';
  if (colf) colf.style.display = 'flex';
  if (tableWrap) tableWrap.style.display = '';
  // 검색 도구만 열고 데이터는 비워둠 — 사용자가 검색 클릭하면 로드
};

// 🔓 "전체 목록 보기" 버튼용 — 모든 영역 표시 + 즉시 loadRecordings 호출
window.vcRecordingsShow = function() {
  var promptEl = document.getElementById('rec-prompt-empty');
  var bar = document.getElementById('rec-search-bar');
  var filters = document.getElementById('rec-filters');
  var colf = document.getElementById('rec-colfilter');
  var tableWrap = document.getElementById('rec-table-wrap');
  if (promptEl) promptEl.style.display = 'none';
  if (bar) bar.style.display = 'flex';
  if (filters) filters.style.display = 'flex';
  if (colf) colf.style.display = 'flex';
  if (tableWrap) tableWrap.style.display = '';
  if (typeof loadRecordings === 'function') loadRecordings();
};

// 페이지네이션 UI 갱신 (페이지 정보·prev/next 활성화)
function renderRecordingsPagination() {
  const info = document.getElementById('rec-page-info');
  const prev = document.getElementById('rec-prev');
  const next = document.getElementById('rec-next');
  if (!info || !prev || !next) return;

  const start = _recTotal === 0 ? 0 : _recOffset + 1;
  const end   = Math.min(_recOffset + _recLimit, _recTotal);
  info.textContent = `${start}-${end} / 총 ${_recTotal}건`;
  prev.disabled = _recOffset <= 0;
  next.disabled = _recOffset + _recLimit >= _recTotal;
}

function renderRecordingsTable() {
  const tb = document.getElementById('recordings-table');
  const rows = _unifiedRecRows || [];
  const filter = _currentRecFilter || 'all';
  const filtered = filter === 'all' ? rows : rows.filter(r => r.source === filter);

  /* 🔢 표 안 필터 + 머리글 정렬 — «지금 불러온 쪽» 안에서만 좁힌다(위 정본 주석 참고).
     ⛔ 아래 카운트 배지(rec-counts)는 «거르기 전» rows 를 세는 그대로 둔다 —
        그 줄은 «이 쪽에 무엇이 있나» 를 말하는 자리라 필터로 흔들리면 안 된다. */
  const viewRows = _recApplySort(filtered.filter(_recPassColF));

  // 카운트 배지 업데이트
  const cBoth = rows.filter(r => r.source === 'both').length;
  /* 🔴 2026-08-28 — 「영상 없음」에 «보관기간이 끝나 규정대로 지운» 행까지 섞여 있었다.
     그래서 사장님 화면에 「영상 없음 1,862」처럼 뜨고, 정작 손봐야 할 「저장 실패 76」이
     그 안에 파묻혀 보이지 않았다. 이제 세 갈래로 나눠 «무엇이 사고인지» 를 드러낸다.
     ⛔ 다시 한 숫자로 합치지 말 것. 감시: recording_status_label_harness */
  const cExpired = rows.filter(r => r.source === 'd1only' && r.status === 'deleted').length;
  const cFailed  = rows.filter(r => r.source === 'd1only' && r.status === 'upload_failed').length;
  const cD1      = rows.filter(r => r.source === 'd1only' && r.status !== 'deleted' && r.status !== 'upload_failed').length;
  const cOrphan = rows.filter(r => r.source === 'orphan').length;
  const cEl = document.getElementById('rec-counts');
  if (cEl) {
    cEl.textContent = adminLang === 'en'
      ? ('Total ' + rows.length + '  ·  ✅ Healthy ' + cBoth + '  ·  🔴 Save failed ' + cFailed + '  ·  ⚠️ Video missing ' + cD1 + '  ·  ⚠️ Record missing ' + cOrphan + (cExpired ? '  ·  Retention expired ' + cExpired : ''))
      : ('총 ' + rows.length + '건  ·  ✅ 정상(영상+기록) ' + cBoth + '  ·  🔴 저장 실패 ' + cFailed + '  ·  ⚠️ 영상 없음 ' + cD1 + '  ·  ⚠️ 기록 없음 ' + cOrphan + (cExpired ? '  ·  보관 만료 ' + cExpired : ''));
    // ⚠️ R2 목록이 잘렸으면 「영상 없음」은 «파일이 없다» 가 아니라 «못 찾았다» 일 수 있다.
    //   조용히 놔두면 멀쩡한 녹화를 없어진 것으로 읽게 된다(2026-08-25 이 화면이 실제로 그랬다).
    if (_recBlobTruncated) {
      cEl.textContent += adminLang === 'en'
        ? '  ·  ⚠️ R2 listing truncated — “Video missing” may be inaccurate'
        : '  ·  ⚠️ R2 목록이 잘렸습니다 — 「영상 없음」이 사실이 아닐 수 있습니다';
      cEl.style.color = '#b45309';
    } else {
      cEl.style.color = '';
    }
  }

  /* 「N건 중 M건」 — 표 안 필터가 «이 쪽» 안에서만 도는 것을 화면이 직접 말한다.
     ⛔ 감추지 말 것: 감추면 「전체에서 걸렀다」로 읽혀 없는 결론을 내리게 된다. */
  const cntEl = document.getElementById('recf-count');
  if (cntEl) {
    const narrowed = viewRows.length !== filtered.length;
    cntEl.textContent = adminLang === 'en'
      ? ('This page: ' + viewRows.length + ' of ' + filtered.length + (narrowed ? ' (filtered)' : ''))
      : ('이 쪽 ' + filtered.length + '건 중 ' + viewRows.length + '건' + (narrowed ? ' (걸러짐)' : ''));
    cntEl.style.color = narrowed ? '#b45309' : '';
  }

  if (!viewRows.length) {
    /* colspan 은 thead 의 컬럼 수와 같아야 함
       (방/교사 이름/교사 아이디/학생 이름/학생 아이디/시작/시간/크기/참가자/상태/시선/말하기/총참여도/스토리지/재생 = 15)
       ⚠️ 칸을 늘리면 여기 숫자도 함께 — 안 고치면 「녹화 기록 없음」 줄만 폭이 어긋난다. */
    /* «없다» 와 «걸러서 안 보인다» 는 다른 사실이다 — 한 문장으로 뭉치면
       필터를 켜 둔 것을 잊고 「녹화가 없다」로 읽는다. */
    const msg = filtered.length
      ? (adminLang === 'en' ? 'No rows match the in-table filter (' + filtered.length + ' on this page)'
                            : '표 안 필터에 맞는 녹화가 없습니다 (이 쪽에 ' + filtered.length + '건 있음)')
      : (adminLang === 'en' ? 'No recordings' : '녹화 기록 없음');
    tb.innerHTML = '<tr><td colspan="15" class="empty">' + msg + '</td></tr>';
    return;
  }

  tb.innerHTML = viewRows.map(r => {
    const d = r.startedAt ? new Date(r.startedAt) : null;
    const dur = r.duration_ms ? Math.round(r.duration_ms / 1000) : 0;
    const dm = dur ? (String(Math.floor(dur/60)).padStart(2,'0') + ':' + String(dur%60).padStart(2,'0')) : '-';
    const sz = r.size_bytes ? (r.size_bytes/(1024*1024)).toFixed(1) + 'MB' : '-';

    let names = [];
    try { names = JSON.parse(r.participant_names || '[]'); } catch(_){}
    let consent = [];
    try { consent = JSON.parse(r.consented_user_ids || '[]'); } catch(_){}

    // 상태 배지 — 파스텔 대신 진한 단색 필 + 흰 글씨로 한눈에 보이게
    const badgeBase = 'display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;line-height:1.4;white-space:nowrap;';
    let statusBadge;
    if (r.status === 'completed')      statusBadge = '<span style="'+badgeBase+'background:#16a34a;color:#fff;">'+(adminLang==='en'?'Done':'완료')+'</span>';
    else if (r.status === 'recording') statusBadge = '<span style="'+badgeBase+'background:#f59e0b;color:#fff;">'+(adminLang==='en'?'● Recording':'● 녹화중')+'</span>';
    /* 2026-08-28 — 같은 줄의 저장소 배지·재생 칸은 회색(사고 아님)인데 여기만 빨강이라
       한 줄이 서로 다른 말을 했다. 색과 말을 맞춘다. */
    else if (r.status === 'deleted')   statusBadge = '<span style="'+badgeBase+'background:#98a2b3;color:#fff;" title="보관기간이 지났거나 관리자가 목록에서 내린 녹화입니다.">'+(adminLang==='en'?'Off the list':'목록에서 내림')+'</span>';
    else if (r.status === 'orphan')    statusBadge = '<span style="'+badgeBase+'background:#ea580c;color:#fff;">'+(adminLang==='en'?'Orphan':'고아')+'</span>';
    /* 🔴 2026-08-28 — 'upload_failed'·'aborted' 는 여기 없어서 배지 자리에 **영문 코드가
       날것으로** 떴다(사장님 화면의 «upload_failed»). 상태 이름은 사람 말로 적는다. */
    else if (r.status === 'upload_failed') statusBadge = '<span style="'+badgeBase+'background:#b42318;color:#fff;" title="업로드가 실패해 클라우드에 영상이 없습니다.">'+(adminLang==='en'?'Save failed':'저장 실패')+'</span>';
    else if (r.status === 'aborted')   statusBadge = '<span style="'+badgeBase+'background:#98a2b3;color:#fff;" title="찍힌 것이 없습니다(들어왔다 바로 나감).">'+(adminLang==='en'?'Nothing recorded':'녹화 없음')+'</span>';
    else                                statusBadge = r.status || '-';

    // 스토리지 배지 (D1=메타데이터 DB, R2=파일 저장소) — 진한 단색 필로 판독성 확보
    let storageBadge;
    if (r.source === 'both')         storageBadge = '<span style="'+badgeBase+'background:#16a34a;color:#fff;" title="영상 파일과 기록 모두 정상">'+(adminLang==='en'?'✔ Healthy':'✔ 정상')+'</span>';
    else if (r.source === 'd1only') {
      /* 🔴 2026-08-28 — 「⚠ 영상 없음」도 위 재생 칸과 같은 병을 앓고 있었다. 파일이 없는
         이유가 «사고» 인지 «규정대로 지운 것» 인지 가리지 않아, 보관만료분까지 경고색으로
         떴다(실측 1,236건). 상태로 갈라 준다 — ⛔ 다시 하나로 합치지 말 것. */
      if (r.status === 'deleted')
        storageBadge = '<span style="'+badgeBase+'background:#98a2b3;color:#fff;" title="보관기간이 지나 목록에서 내린 녹화입니다. 고장이 아닙니다. 2026-09-02부터 만료분은 영상 파일도 함께 파기됩니다 — 다만 그 전에 내려간 녹화는 파일이 남아 있을 수 있습니다.">'+(adminLang==='en'?'Retention expired':'보관 만료')+'</span>';
      else if (r.status === 'upload_failed')
        storageBadge = '<span style="'+badgeBase+'background:#b42318;color:#fff;" title="업로드가 실패해 클라우드에 영상이 없습니다. 다시 올라오지 않습니다.">'+(adminLang==='en'?'⚠ Save failed':'⚠ 저장 실패')+'</span>';
      else if (r.status === 'recording')
        storageBadge = '<span style="'+badgeBase+'background:#b45309;color:#fff;" title="아직 녹화 중이라 파일이 없는 것이 정상입니다. 수업이 끝나면 올라갑니다.">'+(adminLang==='en'?'Uploading later':'수업 중')+'</span>';
      else if (r.status === 'aborted')
        storageBadge = '<span style="'+badgeBase+'background:#98a2b3;color:#fff;" title="찍힌 것이 없어 올릴 파일도 없습니다(들어왔다 바로 나감). 사고가 아닙니다.">'+(adminLang==='en'?'Nothing to store':'저장할 것 없음')+'</span>';
      else
        storageBadge = '<span style="'+badgeBase+'background:#f59e0b;color:#fff;" title="기록은 있는데 영상 파일이 없습니다 (업로드 실패 또는 진행 중)">'+(adminLang==='en'?'⚠ Video missing':'⚠ 영상 없음')+'</span>';
    }
    else                              storageBadge = '<span style="'+badgeBase+'background:#dc2626;color:#fff;" title="영상은 있는데 어떤 수업인지 기록이 없습니다 (정리 필요)">'+(adminLang==='en'?'⚠ Record missing':'⚠ 기록 없음')+'</span>';

    // 재생/액션 버튼
    let playBtn;
    if (r.blobKey) {
      const playUrl = '/api/recordings/blob/' + encodeURIComponent(r.blobKey);
      /* 재생창 제목 — 교사를 못 찾았으면 «녹화를 켠 사람» 이라도 적는다(빈 제목보다 낫다).
         ⚠️ 화면의 「교사」 칸과 달리 여기 폴백은 «교사» 라고 주장하지 않는다(방·사람 표시일 뿐). */
      const titleText = '방 ' + (r.room_id || '-') + ' - '
        + String(r.teacher || r.started_by || '').replace(/'/g,"");
      playBtn = '<button onclick="playRecording(\''+playUrl+'\', \''+titleText.replace(/'/g,"\\'")+'\')" style="background:#2563eb;color:#fff;padding:5px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;border:none;box-shadow:0 2px 5px rgba(37,99,235,0.40);">▶ '+(adminLang==='en'?'Play':'재생')+'</button>';
      // ⬇ 저장 (2026-08-27 사장님) — 재생 모달의 우클릭 «다른 이름으로 저장»·플레이어 ⋮ 가
      //   비활성이라 관리자에게는 녹화를 받을 길이 아예 없었다. 같은 오리진 URL 은
      //   <a download="파일명"> 만으로 브라우저가 강제 다운로드하므로 서버 수정이 필요 없다.
      //   파일명은 방번호+시작시각(웹M) — blob 키 그대로 받으면 'rec%2F…' 처럼 읽기 어렵다.
      const dlName = (String(r.room_id || 'recording')
        + (d ? '_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
             + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') : ''))
        .replace(/[\\/:*?"<>|\s]/g, '-') + '.webm';
      /* 🔴 2026-09-01 수리 (사장님 «카카오에 저장도 안돼») — 여기가 옛 blob 통로를 쓰고 있었다.
         그 통로는 Range 를 그대로 존중해 206 을 돌려주는데, 갤럭시가 저장 요청에
         `Range: bytes=0-` 를 끼워 넣으면 안드로이드 DownloadManager 가 사유 없이
         «다운로드에 실패했습니다» 만 반복한다. 서버에는 그것을 위해 만든 «저장 전용» 통로가
         2026-08-15 부터 있었고(Range 무시·200 전체 본문 + Content-Disposition + 쿠키 없는
         다운로드 관리자용 &sig=), 강사 화면(flow.js)은 그것을 쓰는데 이 관리자 목록만
         빠져 있었다. ⛔ 다시 blob 통로로 되돌리지 말 것.
         ℹ️ dl_url 이 없으면(=서버가 «재생 가능» 으로 못 푼 행) 옛 통로로 폴백한다 — 지금
            받아지던 것을 잃지 않기 위해서다. 감시: recording_download_link_harness */
      var saveUrl = r.dl_url || playUrl;
      playBtn += '<a href="' + saveUrl + '" download="' + dlName + '" title="'
        + (adminLang === 'en' ? 'Save this recording to my device' : '이 녹화 영상을 내 PC·휴대폰에 저장합니다')
        + '" style="display:inline-block;background:#fff;color:#2563eb;padding:5px 11px;border-radius:7px;font-size:12px;font-weight:600;border:1px solid #93c5fd;margin-left:6px;text-decoration:none;vertical-align:middle;">⬇ '
        + (adminLang === 'en' ? 'Save' : '저장') + '</a>';
      /* 🔗 링크 (2026-09-01 사장님) — 카톡으로 «파일» 을 옮기는 대신 «링크» 를 보낸다.
         [왜] 녹화는 webm 이고 한 건이 수백 MB 다. 카카오톡·아이폰은 webm 을 다루지 못하고
           용량도 걸린다 → 파일을 옮기는 길은 계속 막힌다. 링크는 그 둘을 통째로 비켜 간다.
         [안전] 주소에 실린 서명은 «이 녹화 id 하나» 전용이고 6시간 뒤 만료된다(auth-token.ts).
           그래서 버튼이 만료 시각을 사람에게 **말해 준다** — 조용히 죽는 링크를 보내면
           「보냈는데 안 열린대요」가 된다. ⛔ 유효기간을 화면에서 감추지 말 것. */
      if (r.share_url) {
        playBtn += '<button onclick="shareRecordingLink(' + r.id + ')" title="'
          + (adminLang === 'en' ? 'Send a link instead of the file (KakaoTalk, SMS...)' : '파일 대신 링크로 보냅니다 (카카오톡·문자 등)')
          + '" style="background:#fff;color:#7c3aed;padding:5px 11px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #c4b5fd;margin-left:6px;vertical-align:middle;">🔗 '
          + (adminLang === 'en' ? 'Link' : '링크') + '</button>';
      }
    } else {
      /* 🔴 2026-08-28 수리 — 여기는 오래도록 «재생할 파일이 없다 + 녹화중이 아니다» 단 하나로
         판정해, 성격이 전혀 다른 것들에 전부 「업로드 대기」를 붙였다. 그런데 그중 어느 것도
         «기다리면 올라오는» 것이 아니다 — 실패분을 다시 올리는 코드가 저장소에 0곳이고,
         보관만료분은 올라올 파일 자체가 없다. ⇒ 화면이 «곧 될 것처럼» 말해서 아무도 손을
         쓰지 않았다(2026-08-28 실측 1,312건 = 저장실패 76 + 보관만료 1,236).
         ✅ 상태마다 «사실» 을 말한다. ⛔ 다시 한 줄로 합치지 말 것
            (CLAUDE.md 2장 «화면이 모르면 모른다고 말하게 하라»).
         감시: test-harness/recording_status_label_harness.mjs */
      var _pL = (adminLang === 'en');
      var pend;
      if (r.status === 'recording')
        pend = { t: _pL ? 'Recording' : '녹화중', c: '#b45309',
                 h: _pL ? 'Still recording. It is uploaded when the class ends.' : '아직 녹화 중입니다. 수업이 끝나면 올라갑니다.' };
      else if (r.status === 'upload_failed')
        pend = { t: _pL ? 'Save failed' : '저장 실패', c: '#b42318',
                 h: _pL ? 'Upload failed - the video is not in the cloud and will NOT arrive later. There is nothing to wait for.' : '업로드가 실패해 클라우드에 영상이 없습니다. 나중에도 올라오지 않습니다 — 기다릴 것이 없습니다.' };
      else if (r.status === 'deleted')
        pend = { t: _pL ? 'Retention expired' : '보관기간 만료', c: '#667085',
                 h: _pL ? 'Past its retention window, so it was taken off the list. No video file was found for it here. Since 2026-09-02 expired recordings are purged from storage as well - but files taken off the list before that date may still exist.' : '보관기간이 지나 목록에서 내린 녹화입니다. 이 목록에서는 영상 파일을 찾지 못했습니다. 2026-09-02부터 만료분은 영상 파일도 함께 파기됩니다 — 그 전에 내려간 녹화는 파일이 남아 있을 수 있습니다.' };
      else if (r.status === 'aborted')
        pend = { t: _pL ? 'Nothing recorded' : '녹화 없음', c: '#98a2b3',
                 h: _pL ? 'Joined and left before anything was recorded. No video was lost.' : '찍힌 것이 없습니다(들어왔다 바로 나감). 잃은 영상은 없습니다.' };
      else if (r.status === 'completed')
        /* 🔴 «완료» 라는데 파일이 없다 = 2026-08-26 에 고친 바로 그 사고의 잔여분이다.
           「처리 중」이라 말하면 그 거짓말을 되살린다 — 모르면 모른다고 말한다. */
        pend = { t: _pL ? 'Marked done, no file' : '완료 표시인데 영상 없음', c: '#b42318',
                 h: _pL ? 'The record says completed but no file was found in the recording storage listing. Press 진단 to re-check.' : '기록은 「완료」인데 녹화 저장소 목록에서 파일을 찾지 못했습니다. 위 「진단」으로 다시 확인해 보세요.' };
      else
        pend = { t: _pL ? 'Processing' : '처리 중', c: '#667085',
                 h: _pL ? 'The server is still finishing this recording.' : '서버가 마무리하고 있습니다.' };
      playBtn = '<span title="' + pend.h + '" style="color:' + pend.c + ';font-size:11px;font-weight:700;">' + pend.t + '</span>';
    }

    // 🗑️ Phase 4: 삭제/복원 버튼 (D1 id 가 있는 row 에만 — orphan 은 제외)
    let actionBtn = '';
    if (r.id) {
      if (r.status === 'deleted') {
        actionBtn = '<button onclick="setRecordingStatus(' + r.id + ', \'completed\')" title="' + (adminLang==='en'?'Restore this recording':'삭제된 녹화를 복원합니다') + '" style="background:#10b981;color:#fff;padding:5px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:none;margin-left:6px;">↩ ' + (adminLang==='en'?'Restore':'복원') + '</button>';
      } else if (r.status !== 'recording') {
        actionBtn = '<button onclick="setRecordingStatus(' + r.id + ', \'deleted\')" title="' + (adminLang==='en'?'Soft-delete this recording (reversible)':'녹화를 삭제 처리합니다 (복원 가능)') + '" style="background:#fff;color:#dc2626;padding:5px 11px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #f5a3a3;margin-left:6px;">🗑 ' + (adminLang==='en'?'Delete':'삭제') + '</button>';
      }
    }
    playBtn = playBtn + actionBtn;

    const roomCell   = r.room_id || '-';
    /* 🧑‍🏫 교사 이름·아이디 두 칸 (2026-09-04 사장님 «교사 이름에 아이디가 나와»)
       [무엇이 문제였나] 한 칸에 `teacher_name || teacher_id` 를 그렸는데 앞의 것은
         «방을 먼저 켠 사람» 이라 학생 계정이 그대로 올라오고(`jye46712`·`jeong`),
         뒤의 것은 DO 임시번호(`u_…`)다 — 「교사」 칸이 교사도 아이디도 아니었다.
       [지금] 서버가 예약(class_schedules)→원부(teachers)→계정(teacher_account_links)을
         타고 풀어 준다. ⚠️ **못 찾으면 «—» 로 두고 «왜 비었는지» 를 말한다** —
         학생 계정을 교사 칸에 옮겨 적는 것이 바로 고친 사고다(빈칸은 고장으로 읽히므로 이유를 단다). */
    const _tSrcTip = {
      schedule: adminLang === 'en' ? 'Assigned teacher on this class schedule.' : '이 수업 예약에 배정된 강사입니다.',
      account:  adminLang === 'en' ? 'Matched by the staff account that started this recording.' : '이 녹화를 켠 사람의 강사 계정과 일치합니다.',
      roster:   adminLang === 'en' ? 'Matched by an exact, unique teacher-roster name.' : '강사 원부의 이름과 정확히 일치합니다(후보 1명).',
      display:  adminLang === 'en' ? 'Display name only — no staff account could be matched.' : '표시이름만 있습니다 — 강사 계정을 잇지 못했습니다.',
      none:     ''
    };
    const _tNoneTip = (r.source === 'orphan')
      ? (adminLang === 'en' ? 'No record for this file, so the teacher is unknown.' : '이 파일에 대한 기록이 없어 교사를 알 수 없습니다.')
      : (adminLang === 'en'
          ? ('No teacher is recorded for this recording (open room, or a student started it)'
             + (r.started_by ? '. Started by: ' + r.started_by : '.'))
          : ('이 녹화에 강사가 적혀 있지 않습니다 (예약이 아닌 공용방이거나, 학생이 켠 녹화)'
             + (r.started_by ? '. 녹화를 켠 사람: ' + r.started_by : '.')));
    const teacherCell = r.teacher
      ? '<span title="' + _esc(_tSrcTip[r.teacher_src] || '') + '">' + _esc(r.teacher) + '</span>'
      : '<span class="score-na" title="' + _esc(_tNoneTip) + '">—</span>';
    /* 아이디 칸 — 이름은 찾았는데 계정 연결이 없는 강사가 실재한다(원부에만 있는 경우).
       그때 이름을 아이디 자리에 옮겨 적지 않는다. «—» 와 이유를 적는다. */
    /* ⛔ 여기에 `font-family` 를 적지 말 것 — 한자 글꼴 통일 가드(hanzi_font_harness)가
       「맨 앞이 MangoiHanSC 가 아니다」로 FAIL 낸다. 아이디는 ASCII 라 글꼴이 필요 없다. */
    const teacherIdCell = r.teacher_uid
      ? '<span style="letter-spacing:.2px" title="'
        + _esc(adminLang === 'en' ? 'Login account of this teacher.' : '이 강사의 로그인 아이디입니다.')
        + '">' + _esc(r.teacher_uid) + '</span>'
      : '<span class="score-na" title="' + _esc(r.teacher
          ? (adminLang === 'en' ? 'This teacher has no linked login account.' : '이 강사에 연결된 로그인 계정이 없습니다.')
          : _tNoneTip) + '">—</span>';
    /* 🎓 학생 이름·아이디 두 칸 (2026-09-04 사장님 «학생도 학생아이디 목록을 만들어줘»)
       바로 위 교사 칸과 같은 이유·같은 규칙이다. 한 칸에 「이름 아니면 계정」을 그리면
       이름을 모르는 학생 줄에서 **아이디가 이름 자리에** 앉는다.
       ⚠️ 서버(src/recording-students.ts)는 이름을 못 찾으면 **계정을 그대로 `name` 에**
          넣는다(그 칸이 하나였을 때는 「계정이라도 보여 준다」가 맞았다). 칸이 갈린 지금
          그대로 그리면 고치려던 사고가 학생 쪽에 그대로 남는다 — `name === uid` 면
          «이름 모름» 으로 보고 «—» 와 이유를 적는다. 아이디는 옆 칸에 그대로 남는다.
       ⚠️ 두 칸은 **같은 사람을 같은 차례로** 그린다(3명까지 + «외 N명»). 한쪽만 자르면
          이름과 아이디가 어긋나 남의 계정처럼 읽힌다. */
    const _stCells = (function () {
      var L = (adminLang === 'en');
      var na = function (tip) { return '<span class="score-na" title="' + _esc(tip) + '">—</span>'; };
      if (r.source === 'orphan') {
        var t0 = L ? 'No record for this file, so the student is unknown.'
                   : '이 파일에 대한 기록이 없어 학생을 알 수 없습니다.';
        return { name: na(t0), uid: na(t0) };
      }
      var studs = Array.isArray(r.students) ? r.students : [];
      if (!studs.length) {
        var t1 = L ? 'No student account is recorded for this recording (open room, or the student joined without logging in).'
                   : '이 녹화에 학생 계정이 적혀 있지 않습니다 (공용방이거나, 학생이 로그인하지 않고 들어온 경우).';
        return { name: na(t1), uid: na(t1) };
      }
      var shown = studs.slice(0, 3);
      /* «외 N명» 은 두 칸에 똑같이 붙인다 — 한쪽에만 붙으면 줄이 어긋나 보인다. */
      var more = '';
      if (studs.length > shown.length) {
        var restN = studs.length - shown.length;
        var restTip = studs.slice(shown.length).map(function (st) {
          return String(st && (st.name || st.uid) || '');
        }).join(', ');
        more = ' <span style="color:#667085" title="' + _esc(restTip) + '">'
             + (L ? '+' + restN : '외 ' + restN + '명') + '</span>';
      }
      var sched = function (st) { return !!(st && st.scheduled); };
      var schedTip = function (st) {
        return sched(st) ? (L ? ' (student on this class schedule)' : ' (이 수업 예약의 학생)') : '';
      };
      var nameHtml = shown.map(function (st) {
        var uid = String(st && st.uid || '').trim();
        var nm  = String(st && st.name || '').trim();
        if (nm && nm === uid) nm = '';          // 서버 폴백(계정을 이름 자리에) 되돌리기
        if (!nm) {
          return na((L ? 'Not in the student roster — only the account is known: ' : '학생 명부에 이름이 없습니다 — 계정만 압니다: ')
            + (uid || '-') + schedTip(st));
        }
        var tip = (L ? 'Account: ' : '계정: ') + (uid || '-') + schedTip(st);
        return '<span title="' + _esc(tip) + '"'
          + (sched(st) ? ' style="font-weight:700"' : '') + '>' + _esc(nm) + '</span>';
      }).join(', ') + more;
      /* ⛔ 아이디 칸에 `font-family` 를 적지 말 것 — 한자 글꼴 통일 가드가 FAIL 낸다. */
      var uidHtml = shown.map(function (st) {
        var uid = String(st && st.uid || '').trim();
        if (!uid) return na(L ? 'This student has no account recorded.' : '이 학생은 계정이 적혀 있지 않습니다.');
        var tip = (L ? 'Student login account.' : '학생 로그인 아이디입니다.') + schedTip(st);
        return '<span style="letter-spacing:.2px' + (sched(st) ? ';font-weight:700' : '') + '" title="'
          + _esc(tip) + '">' + _esc(uid) + '</span>';
      }).join(', ') + more;
      return { name: nameHtml, uid: uidHtml };
    })();
    const studentCell   = _stCells.name;
    const studentIdCell = _stCells.uid;
    const startCell  = d ? d.toLocaleString(adminLang==='en'?'en-US':'ko-KR') : '-';
    const usersCell  = (r.source === 'orphan')
      ? '-'
      : (names.length + (adminLang==='en'?' (consent '+consent.length+')':'명 (동의 '+consent.length+')'));

    // === 학생별 참여도 점수 셀 3개 ===
    // 점수 표시 규칙:
    //   - 숫자형이면 1자리 소수점 + "점" 단위 표시 (en 일 때는 단위 없음)
    //   - null/undefined 면 "—" 로 표시 (.score-na 클래스)
    // 총 참여도(participation) 는 두 점수의 평균. 한쪽만 있으면 그쪽 값 사용.
    function fmtScore(v, tooltip) {
      const t = tooltip ? ' title="' + String(tooltip).replace(/"/g, '&quot;') + '"' : '';
      if (v === null || v === undefined || isNaN(Number(v))) {
        return '<span class="score-na"' + t + '>—</span>';
      }
      return '<span' + t + '>' + Number(v).toFixed(1) + '</span>';
    }
    // 점수가 NULL 일 때 왜 비어있는지 한국어로 짧게 안내
    function gazeNullReason(r) {
      if (r.attendance_count === 0) return '이 녹화 시간대의 출석 데이터가 없어 집계 불가 (녹화 이전 세션이거나 학생이 아직 새 코드를 받지 못함)';
      if (r.gaze_missing_count > 0) return '참여자 ' + r.gaze_missing_count + '명이 카메라 OFF 또는 얼굴 미인식 상태';
      return '집계 대기 중';
    }
    function speakingNullReason(r) {
      if (r.attendance_count === 0) return '이 녹화 시간대의 출석 데이터가 없어 집계 불가';
      if (r.speaking_zero_count > 0) return '참여자 ' + r.speaking_zero_count + '명이 마이크 OFF 또는 무발화 (임계값 미만)';
      return '집계 대기 중';
    }
    /* 총 참여도 계산 정본은 _recPartScore 하나뿐이다 — 정렬·필터와 같은 값을 써야
       「정렬해 보니 순서가 화면 숫자와 다르다」가 안 생긴다. ⛔ 여기에 다시 만들지 말 것. */
    function partCell(p) {
      if (p === null) return '<td class="score-cell score-na">—</td>';
      // 80 이상=녹색, 50~79=노랑, 그 미만=빨강
      const cls = p >= 80 ? 'score-high' : (p >= 50 ? 'score-mid' : 'score-low');
      return '<td class="score-cell ' + cls + '">' + p.toFixed(1) + '%</td>';
    }
    const gazeTooltip  = (r.gaze_score === null || r.gaze_score === undefined)     ? gazeNullReason(r)     : null;
    const speakTooltip = (r.speaking_score === null || r.speaking_score === undefined) ? speakingNullReason(r) : null;
    const gazeCell    = '<td class="score-cell">' + fmtScore(r.gaze_score, gazeTooltip) + '</td>';
    const speakCell   = '<td class="score-cell">' + fmtScore(r.speaking_score, speakTooltip) + '</td>';
    const partValue   = _recPartScore(r);
    const partCellHtml = partCell(partValue);

    return '<tr>'
      + '<td>' + roomCell + '</td>'
      + '<td>' + teacherCell + '</td>'
      + '<td>' + teacherIdCell + '</td>'
      + '<td>' + studentCell + '</td>'
      + '<td>' + studentIdCell + '</td>'
      + '<td>' + startCell + '</td>'
      + '<td>' + dm + '</td>'
      + '<td>' + sz + '</td>'
      + '<td>' + usersCell + '</td>'
      + '<td>' + statusBadge + '</td>'   // 상태 (먼저 표시 — 오른쪽에 점수 3열이 붙음)
      + gazeCell      // 시선 점수
      + speakCell     // 말하기 점수
      + partCellHtml  // 총 참여도(%)  ← 색상 배지로 시각화
      + '<td>' + storageBadge + '</td>'
      + '<td>' + playBtn + '</td>'
      + '</tr>';
  }).join('');
}

// 필터 버튼 바인딩 (+ "전체" 버튼은 토글 — 열림/닫힘)
document.addEventListener('click', function(ev) {
  const btn = ev.target.closest('.rec-filter');
  if (!btn) return;
  const filter = btn.getAttribute('data-filter') || 'all';

  // 🔓 "전체" 버튼 — 토글 동작 (열림/닫힘)
  if (filter === 'all') {
    const promptEl = document.getElementById('rec-prompt-empty');
    const tableWrap = document.getElementById('rec-table-wrap');
    const isOpen = tableWrap && tableWrap.style.display !== 'none';
    if (isOpen) {
      // 현재 열림 → 닫기
      if (tableWrap) tableWrap.style.display = 'none';
      if (promptEl) promptEl.style.display = '';
      btn.classList.remove('active');
      btn.style.background = '#fff';
      btn.style.color = '#111827';
      return;
    }
    // 닫힘 → 열기 + 전체 데이터 로드
    if (tableWrap) tableWrap.style.display = '';
    if (promptEl) promptEl.style.display = 'none';
  }

  _currentRecFilter = filter;
  document.querySelectorAll('.rec-filter').forEach(b => {
    b.classList.remove('active');
    b.style.background = '#fff';
    b.style.color = '#111827';
  });
  btn.classList.add('active');
  btn.style.background = '#111827';
  btn.style.color = '#fff';

  // 필터 (정상 / 영상 없음 / 기록 없음) 클릭 시 — 자동 열고 데이터 로드
  const tableWrap2 = document.getElementById('rec-table-wrap');
  if (tableWrap2 && tableWrap2.style.display === 'none') {
    tableWrap2.style.display = '';
    const promptEl2 = document.getElementById('rec-prompt-empty');
    if (promptEl2) promptEl2.style.display = 'none';
    if (typeof loadRecordings === 'function') { loadRecordings(); return; }
  }

  // 데이터가 비어있으면 한 번 로드, 아니면 즉시 다시 렌더
  if (!_unifiedRecRows || _unifiedRecRows.length === 0) {
    if (typeof loadRecordings === 'function') loadRecordings();
  } else {
    renderRecordingsTable();
  }
});

// 🔎 Phase 3: 녹화 검색·페이지네이션 바인딩
(function bindRecSearch() {
  const qEl        = document.getElementById('rec-q');
  const dfEl       = document.getElementById('rec-date-from');
  const dtEl       = document.getElementById('rec-date-to');
  const statusEl   = document.getElementById('rec-status-2');   // 녹화 상태 필터(전체/종료/녹화중/중단/삭제) — #rec-status 는 영업본부 폼이라 오작동했음
  const pageSizeEl = document.getElementById('rec-pagesize');
  const applyBtn   = document.getElementById('rec-apply');
  const resetBtn   = document.getElementById('rec-reset');
  const prevBtn    = document.getElementById('rec-prev');
  const nextBtn    = document.getElementById('rec-next');

  function applyCurrent() {
    _recQuery.q         = (qEl && qEl.value || '').trim();
    _recQuery.date_from = (dfEl && dfEl.value || '');
    _recQuery.date_to   = (dtEl && dtEl.value || '');
    _recQuery.status    = (statusEl && statusEl.value || 'all');
    _recLimit  = parseInt((pageSizeEl && pageSizeEl.value) || '50', 10) || 50;
    _recOffset = 0; // 검색 변경 시 첫 페이지로
    loadRecordings();
  }

  if (applyBtn) applyBtn.addEventListener('click', applyCurrent);
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (qEl)        qEl.value = '';
    if (dfEl)       dfEl.value = '';
    if (dtEl)       dtEl.value = '';
    if (statusEl)   statusEl.value = 'all';
    if (pageSizeEl) pageSizeEl.value = '50';
    applyCurrent();
  });
  // 엔터키로 검색
  if (qEl) qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyCurrent(); });

  if (prevBtn) prevBtn.addEventListener('click', () => {
    _recOffset = Math.max(0, _recOffset - _recLimit);
    loadRecordings();
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    if (_recOffset + _recLimit < _recTotal) {
      _recOffset += _recLimit;
      loadRecordings();
    }
  });
})();

/* 🔢 표 안 필터 바인딩 (2026-09-01)
   ⚠️ 서버를 다시 부르지 않는다 — 이미 받아 온 «이 쪽» 을 다시 그릴 뿐이라 즉시 반응한다.
   ⚠️ 초기화는 정렬(_recSort)까지 함께 지운다. 필터만 지우면 «왜 순서가 이상하지» 가 남는다. */
(function bindRecColFilter() {
  const ids = { text: 'recf-text', part: 'recf-part', dur: 'recf-dur',
                size: 'recf-size', users: 'recf-users', play: 'recf-play' };
  function pull() {
    Object.keys(ids).forEach(function (k) {
      const el = document.getElementById(ids[k]);
      if (!el) return;
      _recColF[k] = (k === 'text') ? String(el.value || '').trim() : (el.value || 'all');
    });
    renderRecordingsTable();
  }
  Object.keys(ids).forEach(function (k) {
    const el = document.getElementById(ids[k]);
    if (!el) return;
    el.addEventListener(k === 'text' ? 'input' : 'change', pull);
  });

  const resetBtn = document.getElementById('recf-reset');
  if (resetBtn) resetBtn.addEventListener('click', function () {
    Object.keys(ids).forEach(function (k) {
      const el = document.getElementById(ids[k]);
      if (el) el.value = (k === 'text') ? '' : 'all';
      _recColF[k] = (k === 'text') ? '' : 'all';
    });
    _recSort.key = ''; _recSort.dir = 0;
    _recSyncSortHead();
    renderRecordingsTable();
  });

  /* 🌐 언어 토글 — 「이 쪽 N건 중 M건」과 빈 표 안내는 JS 가 그린 글자라
     data-ko/data-en 루프가 못 고친다. 다시 그려서 따라오게 한다.
     ⚠️ 관리자 화면의 그 이벤트는 window 가 아니라 document 에서 발행된다(CLAUDE.md 2장).
        발행처가 화면마다 달라서 둘 다 듣는다 — 중복 호출은 다시 그리기뿐이라 무해하다. */
  function onLang() {
    if (!_unifiedRecRows || !_unifiedRecRows.length) return;
    const wrap = document.getElementById('rec-table-wrap');
    if (!wrap || wrap.style.display === 'none') return;
    _recSyncSortHead();
    renderRecordingsTable();
  }
  document.addEventListener('mangoi:lang-changed', onLang);
  window.addEventListener('mangoi:lang-changed', onLang);
})();

async function loadRetention() {
  try {
    const r = await fetch('/api/retention/status');
    const txt = await r.text();
    const el = document.getElementById('retention-status');
    if (!txt || txt === 'null') { el.textContent = adminLang==='en' ? 'No runs yet (auto-runs daily at KST 03:00)' : '아직 실행 기록 없음 (매일 KST 03:00 자동 실행)'; return; }
    const d = JSON.parse(txt);
    const when = new Date(d.executed_at).toLocaleString(adminLang==='en'?'en-US':'ko-KR');
    if (adminLang==='en') {
      el.innerHTML = `<div>Last run: <b>${when}</b></div>
        <div style="margin-top:6px;">Recordings ${d.recordings} / Attendance ${d.attendance} / Rewards ${d.rewards} / KakaoID ${d.kakao_ids} / Emergency ${d.emergency_events} / Consent-masked ${d.consents_masked}</div>
        ${d.errors && d.errors.length ? '<div style="color:#dc2626;margin-top:6px;">⚠️ ' + d.errors.join(', ') + '</div>' : ''}`;
    } else {
      el.innerHTML = `<div>마지막 실행: <b>${when}</b></div>
        <div style="margin-top:6px;">녹화 ${d.recordings}건 / 출결 ${d.attendance}건 / 보상 ${d.rewards}건 / 카카오ID ${d.kakao_ids}건 / 비상 ${d.emergency_events}건 / 동의마스킹 ${d.consents_masked}건</div>
        ${d.errors && d.errors.length ? '<div style="color:#dc2626;margin-top:6px;">⚠️ ' + d.errors.join(', ') + '</div>' : ''}`;
    }
  } catch(e) { document.getElementById('retention-status').textContent = (adminLang==='en'?'Query failed: ':'조회 실패: ') + e.message; }
}
document.getElementById('retention-run').onclick = async () => {
  if (!confirm(adminLang==='en'
    ? 'Purge expired data now?\n\nExpired recordings are deleted from storage as well. This cannot be undone.'
    : '지금 보관기간 만료 데이터를 파기하시겠습니까?\n\n만료된 녹화는 영상 파일까지 지워집니다. 되돌릴 수 없습니다.')) return;
  const btn = document.getElementById('retention-run');
  btn.disabled = true; btn.textContent = adminLang==='en'?'Running...':'실행 중...';
  try {
    const r = await fetch('/api/retention/run', { method: 'POST' });
    await r.json();
    await loadRetention();
  } finally { btn.disabled = false; btn.textContent = adminLang==='en'?'Run Now':'지금 실행'; }
};

// ── 활성 방 목록 로딩 ──
function _ensureRoomEnhCss(){
  if(document.getElementById('rooms-enh-css'))return;
  const st=document.createElement('style');st.id='rooms-enh-css';
  st.textContent='@keyframes roomAlertPulse{0%{box-shadow:inset 3px 0 0 #ef4444,0 0 0 0 rgba(239,68,68,.45)}70%{box-shadow:inset 3px 0 0 #ef4444,0 0 0 6px rgba(239,68,68,0)}100%{box-shadow:inset 3px 0 0 #ef4444,0 0 0 0 rgba(239,68,68,0)}} tr.room-alert>td{background:rgba(239,68,68,.08)!important} tr.room-alert>td:first-child{animation:roomAlertPulse 1.3s ease-in-out infinite} @media (prefers-reduced-motion:reduce){tr.room-alert>td:first-child{animation:none}} .room-alert-badge{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:9999px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;vertical-align:middle}';
  document.head.appendChild(st);
}
/* 📅 «예약 기준 지금 수업» 요약 줄  (2026-08-20 사장님 「지금 수업이 없어?」)
   ═══════════════════════════════════════════════════════════════════════════
   [왜 만들었나] 이 표는 «망고아이 화상방에 붙어 있는 사람» 만 센다. 그런데 카페24
      예약 수업은 그 방을 거치지 않아서(실측: `c24-*` 방 실접속 전 기간 0건),
      수업 4건이 진행 중이던 시각에도 화면은 «지금 진행 중인 수업이 없습니다» 라고
      말했다. 같은 사실인데 «오늘 한가하다» 로 읽힌다.
   [무엇을 그리나] 「지금 수업 4건 · 화상방 접속 0건」 — 둘을 **나란히** 놓는다.
      숫자가 갈리는 것 자체가 정보다(수업은 도는데 우리 방을 안 쓰고 있다).
   ⚠️ 색은 `background-color:` 로만 준다 — `background:linear-gradient(…)` 이나
      `background:#…` 은 admin-inline-c.css 의 옛 다크 규칙이 `!important` 로 덮는다
      (CLAUDE.md 2장 「관리자 카드 안 박스 색이 안 먹음」). */
function _renderRoomsSummary(counts, liveRooms, _L) {
  /* 📣 (2026-09-01 A안) 「오늘 수업」 탭 줄의 «화상방 접속» 숫자 — 세는 곳은 여기 하나뿐이고
     탭은 받아 적기만 한다. ⚠️ 통째로 try/catch — 이 함수는 카드를 그리는 길목이라 던지면 안 된다. */
  try {
    document.dispatchEvent(new CustomEvent('mangoi:rooms-counts', {
      detail: { rooms: Number(liveRooms) || 0, now: (counts && counts.now) || 0 }
    }));
  } catch (e) { /* 무시 */ }
  const box = document.getElementById('rooms-now-summary');
  if (!box) return;
  if (!counts) { box.style.display = 'none'; box.innerHTML = ''; return; }
  const now = counts.now || 0, soon = counts.soon || 0, conn = counts.connected || 0;
  box.style.display = '';
  const chip = (label, val, color) =>
    '<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;'
    /* ⚠️ 색에 `!important` 를 붙인다 — admin-inline-c.css 가 카드 안 글자를
       `#101828 !important` 로 통째로 덮어서, 그냥 쓰면 색이 조용히 죽는다.
       (인라인 !important 는 작성자 !important 를 이긴다. CLAUDE.md 2장) */
    + 'background-color:#ffffff;border:1px solid #e5e7eb;font-size:12px;font-weight:700;color:#374151 !important">'
    + label + '<b style="font-size:14px;color:' + color + ' !important">' + val + '</b></span>';
  box.innerHTML =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    + chip((_L ? 'Scheduled now' : '지금 수업'), now, now ? '#dc2626' : '#6b7280')
    + chip((_L ? 'In a Mango-i room' : '화상방 접속'), liveRooms, liveRooms ? '#16a34a' : '#6b7280')
    + (soon ? chip((_L ? 'Starting soon' : '곧 시작'), soon, '#2563eb') : '')
    + '</div>'
    + '<div style="font-size:12px;color:#6b7280;margin-top:6px;line-height:1.6">'
    + (_L
        ? 'Left = classes booked in cafe24 for this moment. Right = people actually connected to a Mango-i room. They are different numbers on purpose — a booked class does not open a Mango-i room by itself.'
        : '왼쪽은 <b>카페24에 예약된 수업</b>, 오른쪽은 <b>망고아이 화상방에 실제로 붙어 있는 사람</b>입니다. 예약 수업이 화상방을 자동으로 열지는 않기 때문에 두 숫자는 원래 다를 수 있습니다.')
    + (conn ? '' : '')
    + '</div>';
}

/* 📅 예약 수업 행 — 방 목록 아래에 함께 그린다.
   ⛔ «접속 기록 없음» 을 «미접속» 이라고 쓰지 않는다. 서버는 학생 계정·이름이
      완전일치하는 실접속 행이 있을 때만 «접속 확인» 으로 답한다(추측하지 않는다).
      즉 우리가 아는 것은 «기록이 없다» 까지다. */
function _schedRowsHtml(list, _L, roomsEmpty) {
  if (!list || !list.length) return '';
  const head = '<tr><td colspan="6" style="background-color:#f8fafc;padding:8px 12px;line-height:1.6">'
    + '<b style="color:#334155">' + (_L ? '📅 Booked classes for this moment' : '📅 예약 기준 지금 수업') + '</b>'
    + (roomsEmpty
        ? '<div style="font-size:12px;color:#6b7280">'
          /* 📌 (2026-08-21) «참관» 을 함께 적는다 — 필리핀 매니저가 참관 버튼을 찾다가 이 표를 보고
             «버튼이 없어졌다» 로 읽었다. 종료·연장만 적혀 있으면 참관을 찾는 사람에게는 답이 안 된다.
             📌 (2026-09-01) 그때는 이 표가 카페24 수업만 받아서 「참관 버튼이 생기지 않습니다」가
                사실이었다. 지금은 수강신청 수업(망고아이 방이 있는 수업)도 함께 오므로 그쪽에는
                참관 버튼이 «있다» — 옛 문장을 그대로 두면 화면과 안내가 어긋난다. */
          + (_L ? 'Nobody is connected to a Mango-i room right now, so there is nothing to end or extend in this table. «enrolment» classes below can still be observed (their room exists before anyone joins); «cafe24» classes have no Mango-i room, so "No connection record" is normal and they have no observe button.'
                : '지금 망고아이 화상방에 붙어 있는 사람이 없어, 이 표에서 종료·연장할 대상은 없습니다. 다만 아래 «수강신청» 수업은 아무도 안 들어와도 참관할 수 있습니다. «카페24» 수업은 망고아이 방이 없어 «접속 기록 없음» 이 정상이고 참관 버튼도 생기지 않습니다.')
          + '</div>'
        : '')
    + '</td></tr>';
  return head + list.map(function (c) {
    const ph = c.phase === 'soon' ? { t: (_L ? 'Starts soon' : '곧 시작'), c: '#2563eb' }
             : c.phase === 'ended' ? { t: (_L ? 'Just ended' : '방금 끝남'), c: '#6b7280' }
             : { t: (_L ? 'In progress' : '진행 중'), c: '#dc2626' };
    const conn = c.connected
      ? '<span class="badge ok">✅ ' + (_L ? 'Connected' : '접속 확인') + '</span>'
      : '<span style="color:#b45309 !important;font-weight:700;font-size:12px">' + (_L ? 'No connection record' : '접속 기록 없음') + '</span>';
    /* 👁 참관할 «방» 이 있는가 — 수강신청 수업은 방 번호가 결정론적이라 아무도 안 붙어도 있다.
       ⛔ 카페24 줄에는 절대 달지 않는다: `c24-…` 는 망고아이 방 번호 체계가 아니라
          눌러도 못 들어간다(그래서 판정은 live_room 이 아니라 observable 이다).
       ⛔ live_room 으로 가르지 말 것 — 시작 직전 «아무도 안 붙은» 그 순간에 버튼이 사라진다.
          정작 그때가 「왜 아직 아무도 안 들어왔지」 하고 봐야 할 시각이다. */
    const obsRoom = c.observable ? (c.room_id || '') : '';
    const srcTag = c.observable
      ? '<span style="color:#6d28d9 !important;font-weight:700;font-size:11px">' + (_L ? 'enrolment' : '수강신청') + '</span>'
      : '<span style="color:#9ca3af;font-size:11px">' + (_L ? 'cafe24' : '카페24') + '</span>';
    /* 🔘 버튼은 위 «화상방» 줄과 **같은 방식**으로 만든다 — class 는 rm-act(색 규칙이 이미 있다),
       동작은 표 전체 위임(`#active-rooms-table [data-act]` → tr 의 data-room).
       ⛔ 인라인 onclick + 새 class 로 만들지 말 것: `details.menu-card button` 전역 규칙이
          !important 로 파란 알약(padding 9px 18px)을 씌워 좁은 칸을 밀어낸다(CLAUDE.md 2장). */
    return '<tr data-sched="1"' + (obsRoom ? ' data-room="' + _esc(obsRoom) + '"' : '') + '>'
      + '<td><b>' + _esc(c.start_kst || '') + '~' + _esc(c.end_kst || '') + '</b>'
      +   '<div style="font-size:11px;color:#9ca3af">' + _esc(c.room_id || '') + '</div></td>'
      + '<td><span style="color:' + ph.c + ' !important;font-weight:800">' + ph.t + '</span>'
      +   '<div>' + srcTag + '</div></td>'
      + '<td>' + _esc(c.student_name || (_L ? '(unknown)' : '(학생 미상)'))
      +   ' <span style="color:#9ca3af">·</span> ' + _esc(c.teacher_name || (_L ? '(teacher unknown)' : '(강사 미상)')) + '</td>'
      + '<td>-</td><td>-</td>'
      + '<td>' + conn
      +   (c.live_room ? '<div style="font-size:11px;color:#6b7280">' + _esc(c.live_room) + '</div>' : '')
      +   (obsRoom ? '<div style="margin-top:4px"><button type="button" data-act="observe"'
                   + ' class="rm-act rm-act-observe">' + (_L ? '👁 Ghost' : '👁 GHOST 참관') + '</button></div>' : '')
      +   '</td>'
      + '</tr>';
  }).join('');
}

async function loadActiveRooms() {
  _ensureRoomEnhCss();
  const _L = adminLang==='en';
  // 🖱 (2026-08-12 수정요청 #01) 15초 자동 갱신이 마우스 아래에서 행을 갈아치워
  //    조준한 행과 다른 방을 누르게 되던 것 — 표에 마우스가 올라가 있는 동안은 다시 안 그린다.
  {
    const tb0 = document.getElementById('active-rooms-table');
    if (window.__roomsHover && tb0 && tb0.querySelector('tr[data-room]')) return;
  }
  try {
    const [rr, ar, cr] = await Promise.all([
      fetch('/api/active-rooms'),
      fetch('/api/admin/alerts').catch(()=>null),
      // 📅 (2026-08-20) 예약 기준 «지금 수업». 실패해도 방 목록은 종전대로 그린다.
      fetch('/api/admin/classes-now', { credentials: 'include', cache: 'no-store' }).catch(()=>null)
    ]);
    const rooms = await rr.json();
    const tb = document.getElementById('active-rooms-table');
    // 미확인(unack) 알림을 room_id 별로 매핑 → 이상감지 표시·정렬용
    const alertMap = {};
    try {
      if (ar) { const ad = await ar.json(); if (ad && ad.ok !== false) (ad.items||[]).forEach(it => { if (!it.acknowledged_at) alertMap[String(it.room_id)] = it; }); }
    } catch(_) {}
    /* 📅 예약 기준 «지금 수업» — 강사 계정(403)·구버전 서버에서는 조용히 없는 것으로 둔다.
       ⛔ 여기서 실패한다고 방 목록까지 못 그리게 하면 안 된다(원래 기능이 우선). */
    let sched = [], scounts = null;
    try {
      if (cr) { const cj = await cr.json(); if (cj && cj.ok) { sched = cj.classes || []; scounts = cj.counts || null; } }
    } catch(_) {}
    _renderRoomsSummary(scounts, (rooms || []).length, _L);
    const schedRows = _schedRowsHtml(sched, _L, !rooms || rooms.length === 0);

    if (!rooms || rooms.length === 0) {
      if (schedRows) { tb.innerHTML = schedRows; return; }
      /* 🔴 (2026-08-08) 「⚡ 자주 쓰는 기능 → 수업 종료 / 연장」이 이 카드로 온다.
         그런데 진행 중인 수업이 없으면 «현재 진행 중인 수업 없음» 한 줄만 떠서,
         종료·연장을 하러 온 사람 눈에는 «눌렀는데 아무 일도 안 일어났다» 로 보였다.
         → 여기가 무엇을 하는 곳이고 왜 비어 있는지를 한 줄로 알려 준다. 15초마다 자동 갱신된다. */
      tb.innerHTML = '<tr><td colspan="6" class="empty" style="padding:18px 12px;line-height:1.7">'
        + '<div style="font-weight:800;color:#374151">'
        + (_L ? 'No class is running right now' : '지금 진행 중인 수업이 없습니다')
        + '</div>'
        + '<div style="font-size:12px;color:#6b7280;margin-top:4px">'
        + (_L ? 'Classes appear here the moment they start — you can end or extend them from this table. Refreshes every 15s.'
              : '수업이 시작되면 여기에 바로 나타나고, 이 표에서 종료·연장할 수 있습니다. 15초마다 자동으로 새로고침됩니다.')
        + '</div></td></tr>';
      return;
    }
    const TYPE_KO = { silence_20s:'침묵 20초', forbidden_word:'금지어 감지', low_engagement:'참여 저하', network_poor:'네트워크 저하' };
    // 🚨 이상감지 방을 최상단으로 정렬
    const sorted = rooms.slice().sort((a,b)=> (alertMap[String(b.roomId)]?1:0) - (alertMap[String(a.roomId)]?1:0));
    /* 🛠 (2026-08-12 수정요청 #01) 액션 버튼이 «엉뚱한 화면» 을 열던 근본 원인:
       onclick="forceEndRoom(${JSON.stringify(roomId)})" — stringify 가 만든 큰따옴표가
       큰따옴표 HTML 속성을 중간에서 끊어, 핸들러가 아예 안 달리거나 깨진 채 달렸다.
       → 방·학생 정보를 <tr> 의 data-속성(_esc 이스케이프)에 싣고, 클릭은 위임 리스너가
         «실제로 클릭된 행» 에서 읽는다. 이제 행과 다른 학생이 매핑될 수 없다. */
    tb.innerHTML = sorted.map(room => {
      const users = room.users || [];
      const userNames = users.map(u => u.username).join(', ') || '-';
      // 연장 버튼용 학생 목록 — 강사·관리자·참관자는 제외
      const studentNames = users
        .filter(u => !/^(teacher|admin|observer|ghost|manager)$/i.test(String(u.role || '')))
        .map(u => String(u.username || '').trim()).filter(Boolean);
      const roomAttr = _esc(String(room.roomId == null ? '' : room.roomId));
      const al = alertMap[String(room.roomId)];
      const badge = al ? ' <span class="room-alert-badge">🚨 '+(TYPE_KO[al.alert_type]||al.alert_type)+'</span>' : '';
      /* 👁 (2026-08-21) 버튼 색 규칙 — 보라 = 참관(학생에게 안 보임) · 주황 = 직접 입장(학생에게 보임).
         [왜] 이 GHOST 버튼만 주황이었다. 그런데 다른 두 목록(adm-s1 «직접 입장(보임)» ·
         adm-today-classes «입장(보임)»)에서 주황은 정반대 뜻인 «학생에게 보인다» 다.
         같은 색이 화면마다 다른 뜻이면 색은 안 보는 편이 나은 표시가 되고, 급할 때
         손이 먼저 나가는 버튼에서 그 혼동은 «참관인 줄 알고 수업에 등장» 으로 끝난다.
         ⛔ 이 값을 주황으로 되돌리지 말 것 — observer_camera_guard_harness 가 FAIL 낸다.
         🔴 그리고 색만 고쳐서는 «화면에 안 나옵니다». admin-inline-c.css 9072행의
            html[data-admin-theme="ivory"][data-admin-tone="slate"] [id^="card-"] button:not([class])
            이 카드 안 «클래스 없는» 버튼을 background:#ffffff !important 로 칠합니다.
            인라인 style 은 작성자 !important 에 집니다(2026-08-21 실측: 네 버튼 전부 흰색이었고,
            그래서 «즉시 개입»·«강제 종료» 의 빨강도 안 나오고 있었습니다).
            ✅ 그 규칙의 논리가 «클래스가 없다 = 의도한 색이 없다» 이므로, 의도한 색이 있는
               버튼에는 클래스를 답니다(rm-act…). ⛔ 클래스 이름을 «-btn» 으로 끝내지 마세요 —
               [class$="-btn"] 규칙(같은 파일 3894·9012행)에 다시 걸립니다. */
      return `<tr class="${al?'room-alert':''}" data-room="${roomAttr}" data-students="${_esc(JSON.stringify(studentNames))}">
        <td>${_esc(room.roomId)}${badge}</td>
        <td>${room.userCount}${_L?'':' 명'}${room.observerCount > 0 ? ' <span style="color:#a78bfa;font-size:11px;">('+ (_L?'obs ':'관찰 ') + room.observerCount+')</span>' : ''}</td>
        <td>${_esc(userNames)}</td>
        <td>${room.hasPdf ? '<span class="badge ok">'+(_L?'Sharing':'공유중')+'</span>' : '-'}</td>
        <td>${room.hasVideo ? '<span class="badge ok">'+(_L?'Sharing':'공유중')+'</span>' : '-'}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap;">
          ${al?`<button data-act="intervene" class="rm-act rm-act-intervene">🚨 ${_L?'Intervene':'즉시 개입'}</button>`:''}
          <button data-act="observe" class="rm-act rm-act-observe">👁 ${_L?'Ghost':'GHOST 참관'}</button>
          <button data-act="extend" class="rm-act rm-act-extend" title="${_L?'Open this student’s enrollment-extension page':'이 수업 학생의 «수강 연장» 화면을 엽니다'}">⏳ ${_L?'Extend':'연장'}</button>
          <button data-act="end" class="rm-act rm-act-end" title="${_L?'Force end this class (disconnects all participants)':'이 수업을 강제 종료합니다 (모든 참가자 연결 해제)'}">🛑 ${_L?'Force End':'강제 종료'}</button>
        </td>
      </tr>`;
    }).join('') + schedRows;
    _wireRoomsActions();
  } catch(e) {
    document.getElementById('active-rooms-table').innerHTML = '<tr><td colspan="6" class="empty">'+(_L?'Load failed: ':'로딩 실패: ') + e.message + '</td></tr>';
  }
}
/* 🖱 실시간 수업 현황 액션 위임 (2026-08-12 수정요청 #01) — 한 번만 단다.
   클릭된 <tr> 의 data-room/data-students 를 그 자리에서 읽으므로,
   자동 갱신·재정렬이 끼어들어도 «클릭한 행» 과 다른 방·학생이 매핑될 수 없다. */
function _wireRoomsActions(){
  if (window.__roomsActWired) return;
  window.__roomsActWired = true;
  const tb = document.getElementById('active-rooms-table');
  if (tb) {
    tb.addEventListener('pointerenter', function(){ window.__roomsHover = true; });
    tb.addEventListener('pointerleave', function(){ window.__roomsHover = false; });
  }
  document.addEventListener('click', function(e){
    const btn = e.target && e.target.closest ? e.target.closest('#active-rooms-table [data-act]') : null;
    if (!btn) return;
    e.preventDefault(); e.stopPropagation();
    const tr = btn.closest('tr'); if (!tr) return;
    const roomId = tr.getAttribute('data-room') || '';
    let students = [];
    try { students = JSON.parse(tr.getAttribute('data-students') || '[]'); } catch(_) {}
    const act = btn.getAttribute('data-act');
    if (act === 'intervene') interveneRoom(roomId);
    else if (act === 'observe') observeRoom(roomId);
    else if (act === 'extend') extendRoomStudent(roomId, students);
    else if (act === 'end') forceEndRoom(roomId, students);
  }, true);
}

/* ⏳ 연장 (2026-08-12 수정요청 #01) — 그 방의 «그 학생» 수강 연장 화면으로.
   방 참가자에는 계정 uid 가 없고 표시 이름뿐이라, 이름으로 명부를 조회해
   정확히 1명으로 특정되면 학생 상세의 «수강 연장» 탭을, 아니면(동명이인 등)
   그 이름으로 걸러진 학생 목록을 연다 — 엉뚱한 학생이 뜨는 일은 없다. */
async function extendRoomStudent(roomId, students){
  const _L = (typeof adminLang !== 'undefined' && adminLang === 'en');
  students = (students || []).filter(Boolean);
  if (!students.length) { alert(_L ? 'No student participant in this room.' : '이 방에 학생 참가자가 없습니다.'); return; }
  let name = students[0];
  if (students.length > 1) {
    const pick = prompt((_L ? 'Which student to extend?\n' : '어느 학생을 연장할까요?\n')
      + students.map((s, i) => (i + 1) + ') ' + s).join('\n'), '1');
    if (pick == null) return;
    const idx = parseInt(pick, 10) - 1;
    name = students[idx >= 0 && idx < students.length ? idx : 0];
  }
  try {
    const r = await fetch('/api/admin/students/unified?q=' + encodeURIComponent(name), { credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    const list = (j && j.students) || [];
    const key = name.trim().toLowerCase();
    const exact = list.filter(s => [s.name, s.english_name].some(x => String(x || '').trim().toLowerCase() === key));
    const hit = exact.length === 1 ? exact[0] : (list.length === 1 ? list[0] : null);
    if (hit && hit.user_id) {
      mangoiOpenTab('/admin/student?uid=' + encodeURIComponent(hit.user_id) + '&tab=extension', _L ? 'Extend enrollment' : '수강 연장');
      return;
    }
  } catch (_) {}
  // 1명으로 특정 못하면(동명이인·명부 불일치) 그 이름으로 검색된 학생 목록을 연다
  mangoiOpenTab('/admin.html?smq=' + encodeURIComponent(name) + '#card-students-mgmt', _L ? 'Student list' : '학생 목록');
}
window.extendRoomStudent = extendRoomStudent;

// 🚨 즉시 개입 — 강사 귓속말(Whisper) 카드로 이동해 즉시 대처
function interveneRoom(roomId){
  try{
    const c=document.getElementById('card-admin-whisper');
    if(c){ if(c.tagName==='DETAILS') c.open=true; c.scrollIntoView({behavior:'smooth',block:'start'}); const o=c.style.boxShadow; c.style.boxShadow='0 0 0 3px rgba(239,68,68,0.6)'; setTimeout(function(){c.style.boxShadow=o;},1800); }
    else { alert('강사 귓속말 기능으로 이동: '+roomId); }
  }catch(_){ }
}

/* 🪟 (2026-07-23) 새 창 열기 공통 — 팝업 차단을 감지해 사용자에게 알린다.
   예전엔 window.open(url,'_blank','width=1200,height=800') 처럼 '크기'를 지정했는데,
   크기를 주면 크롬이 이걸 팝업으로 분류해 조용히 막아버린다. 차단돼도 아무 표시가 없어
   매니저 쪽에서는 "눌러도 아무 일도 안 일어난다"로 보였다(실제 제보).
   → 크기 지정을 빼서 '일반 새 탭'으로 열고, 그래도 막히면 눌러서 들어갈 링크를 띄운다. */
function mangoiOpenTab(url, title) {
  /* 🔴 (2026-09-02) 'noopener' 를 «기능 문자열» 로 주면 표준상 **탭은 열리는데 반환값이 null** 이다.
     그래서 반환값으로 «막혔나» 를 판정하면 **언제나 «막혔다»** 가 된다 — 실측(크로미움):
       window.open(u,'_blank','noopener') → null · 탭 1→2 (열림)
       window.open(u,'_blank')            → object · 탭 2→3 (열림)
     → 반환값이 필요하면 기능 문자열에서 빼고 **w.opener = null** 로 같은 보호를 건다.
     ⚠️ 반환값을 안 쓰는 자리는 'noopener' 를 그대로 둬도 무해하다. */
  let w = null;
  try { w = window.open(url, '_blank'); } catch (e) { w = null; }
  if (w) { try { w.opener = null; } catch (e) {} return true; }

  // 차단됨 → 조용히 실패하지 말고 클릭 가능한 링크를 보여준다
  const _L = (typeof adminLang !== 'undefined' && adminLang === 'en');
  try {
    const old = document.getElementById('mangoi-popup-blocked');
    if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'mangoi-popup-blocked';
    box.style.cssText = 'position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:2147483000;'
      + 'max-width:min(560px,92vw);padding:14px 18px;border-radius:12px;background:#fff7ed;'
      + 'border:1px solid #fdba74;box-shadow:0 12px 32px -8px rgba(0,0,0,.35);color:#7c2d12;'
      + 'font-size:13.5px;line-height:1.6';
    box.innerHTML =
      '<div style="font-weight:900;margin-bottom:6px">⚠ '
      + (_L ? 'Your browser blocked the new window' : '브라우저가 새 창을 막았습니다') + '</div>'
      + '<div style="margin-bottom:10px">'
      + (_L ? 'Click the link below to open it, or allow pop-ups for this site.'
            : '아래 링크를 누르면 열립니다. (또는 이 사이트의 팝업 허용을 켜주세요.)')
      + '</div>'
      + '<a href="' + url + '" target="_blank" rel="noopener" '
      + 'style="display:inline-block;padding:9px 16px;border-radius:8px;background:#ea580c;color:#fff;'
      + 'text-decoration:none;font-weight:800">' + (title || (_L ? 'Open' : '열기')) + ' →</a>'
      + '<button onclick="this.parentElement.remove()" '
      + 'style="margin-left:8px;padding:9px 14px;border-radius:8px;border:1px solid #fdba74;'
      + 'background:#fff;color:#7c2d12;font-weight:700;cursor:pointer">'
      + (_L ? 'Close' : '닫기') + '</button>';
    document.body.appendChild(box);
    setTimeout(function () { const b = document.getElementById('mangoi-popup-blocked'); if (b) b.remove(); }, 20000);
  } catch (e) {
    alert(_L ? ('Pop-up blocked. Open this address:\n' + url) : ('팝업이 차단되었습니다. 이 주소를 열어주세요:\n' + url));
  }
  return false;
}
window.mangoiOpenTab = mangoiOpenTab;

function observeRoom(roomId) {
  const _L = (typeof adminLang !== 'undefined' && adminLang === 'en');
  const url = window.location.origin + '/?observe=' + encodeURIComponent(roomId);

  /* 📜 참관 기록 — '수업 관찰' 카드는 사유를 받아 감사 로그에 남기는데, 실시간 수업 현황의
     GHOST 버튼은 기록 없이 바로 들어가고 있었다. 학생 사생활 보호 정책상 참관은 모두 남아야 하므로
     여기서도 자동으로 기록한다. 급한 상황용 버튼이라 사유는 묻지 않고 자동 문구를 넣는다.
     기록이 실패해도 참관 자체는 막지 않는다(수업 대응이 우선). */
  try {
    const s = JSON.parse(localStorage.getItem('mangoi_admin_session') || '{}') || {};
    const uid = String(s.uid || '').trim();
    if (uid) {
      fetch('/api/admin/ghost/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          admin_uid: uid,
          room_id: roomId,
          reason: '실시간 수업 현황에서 즉시 참관 (Live Classes → Ghost)'
        })
      }).catch(function () {});
    }
  } catch (e) {}

  mangoiOpenTab(url, _L ? 'Observe class' : '수업 관찰 열기');
}
window.observeRoom = observeRoom;

// 🛑 관리자 강제 종료 (Phase 4)
//   - 2단계 확인: confirm → 사유 입력(선택) → API 호출
//   - API: POST /api/admin/room/:roomId/force-end  body: { reason? }
async function forceEndRoom(roomId, students) {
  const _L = adminLang==='en';
  // (2026-08-12 수정요청 #01) 방 이름만으로는 어느 수업인지 가늠이 어렵다 — 학생 이름을 함께 보여 준다
  const _who = (students && students.length) ? students.join(', ') : '';
  const confirmMsg = _L
    ? `Force-end room "${roomId}"${_who ? ` (students: ${_who})` : ''}? All participants will be disconnected immediately.`
    : `방 "${roomId}"${_who ? ` — 학생: ${_who}` : ''} 을 강제 종료하시겠습니까?\n모든 참가자 연결이 즉시 해제됩니다.`;
  if (!confirm(confirmMsg)) return;
  const reason = (prompt(_L ? 'Reason (optional, shown to participants):' : '종료 사유 (선택 — 참가자에게 표시됨):', '') || '').trim();
  try {
    const r = await fetch('/api/admin/room/' + encodeURIComponent(roomId) + '/force-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(reason ? { reason } : {})
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.ok === false) {
      alert((_L ? 'Failed: ' : '실패: ') + (body.error || ('HTTP ' + r.status)));
      return;
    }
    alert((_L ? `Ended. Notified ${body.notified || 0} participants.` : `강제 종료 완료. ${body.notified || 0}명에게 알림 전송.`));
    loadActiveRooms();
  } catch (e) {
    alert((_L ? 'Network error: ' : '네트워크 에러: ') + e.message);
  }
}

// 💰 Phase 7: 저장소·비용 통계 로딩
function _fmtBytes(b) {
  if (!b || b < 0) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1024*1024) return (b/1024).toFixed(1) + ' KB';
  if (b < 1024*1024*1024) return (b/1024/1024).toFixed(1) + ' MB';
  return (b/1024/1024/1024).toFixed(2) + ' GB';
}
function _fmtNum(n) { return (n || 0).toLocaleString(adminLang==='en'?'en-US':'ko-KR'); }

async function loadStorageStats() {
  const grid = document.getElementById('storage-grid');
  if (!grid) return;
  try {
    const r = await fetch('/api/admin/stats/storage', { cache: 'no-store', credentials: 'include' });
    const d = await r.json();
    if (!d.ok) {
      grid.innerHTML = '<div style="padding:14px;color:#dc2626;">로딩 실패: ' + (d.error || ('HTTP ' + r.status)) + '</div>';
      return;
    }
    const cells = [];
    function tile(label, value, sub, color) {
      cells.push('<div style="padding:14px 16px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;">'
        + '<div style="font-size:11px;color:#6b7280;letter-spacing:0.6px;text-transform:uppercase;">' + label + '</div>'
        + '<div style="font-size:22px;font-weight:700;color:' + (color || '#111827') + ';margin-top:4px;">' + value + '</div>'
        + (sub ? '<div style="font-size:11px;color:#9ca3af;margin-top:2px;">' + sub + '</div>' : '')
        + '</div>');
    }
    const r1 = d.d1.recordings;
    const a1 = d.d1.attendance;
    tile('🎥 녹화 메타 (D1)',     _fmtNum(r1.count) + ' 건',  _fmtBytes(r1.total_size_bytes), '#3b82f6');
    tile('📦 R2 객체 수',         _fmtNum(d.r2.object_count), d.r2.truncated ? '5,000+ truncated' : '실측', '#8b5cf6');
    tile('📦 R2 총 용량',         _fmtBytes(d.r2.total_size_bytes), d.r2.configured ? '실측' : '바인딩 없음', '#8b5cf6');
    tile('🧑‍🎓 출석 row',           _fmtNum(a1.count) + ' 건',  '활성 ' + Math.round((a1.total_active_ms||0)/60000) + '분 / 총 ' + Math.round((a1.total_session_ms||0)/60000) + '분', '#10b981');
    tile('🚨 비상 이벤트',        _fmtNum(d.d1.emergency_events) + ' 건', '', '#ef4444');
    tile('🎁 보상 발급',          _fmtNum(d.d1.rewards) + ' 건', '', '#f59e0b');
    // 알림 큐 상태별 합계
    const nq = d.d1.notification_queue_by_status || [];
    const nqMap = {}; for (const row of nq) nqMap[row.status] = row.c;
    tile('📣 알림 큐', _fmtNum((nqMap.pending||0) + (nqMap.sent||0) + (nqMap.failed||0) + (nqMap.discarded||0)) + ' 건',
                       '대기 ' + (nqMap.pending||0) + ' / 발송 ' + (nqMap.sent||0) + ' / 실패 ' + (nqMap.failed||0), '#0ea5e9');
    // 녹화 status 별
    const rs = r1.by_status || [];
    if (rs.length > 0) {
      const txt = rs.map(x => x.status + ' ' + x.c).join(' · ');
      tile('🎥 녹화 status 분포', _fmtNum(rs.reduce((s, x) => s + (x.c||0), 0)) + ' 건', txt, '#3b82f6');
    }
    grid.innerHTML = cells.join('');
  } catch (e) {
    grid.innerHTML = '<div style="padding:14px;color:#dc2626;">네트워크 에러: ' + e.message + '</div>';
  }
}

// 저장소 통계 컨트롤
(function bindStorageStats() {
  const btn = document.getElementById('storage-refresh');
  if (btn) btn.addEventListener('click', loadStorageStats);
})();

// 💼 Phase 8 v2: Mangoi 강사 급여·평가 (10분단가 + 5카테고리 평가)
const EVAL_WEIGHTS_FRONT = { instruction: 0.25, retention: 0.30, punctuality: 0.20, admin: 0.15, contribution: 0.10 };
let _payrollSettings = { php_to_krw: 24.34 };
let _lastPayrollRows = [];

// 🔐 교사 본인 급여 보기 모드 — 전체 급여/관리 기능은 숨기고 본인 명세서만 노출
function _payrollTeacherView() {
  var s = window._adminSession;
  return !!(s && s.role === 'hq_teacher');
}
// 카드가 보일 때 교사용으로 관리 컨트롤 숨김 + 안내 배너 + 본인 데이터 자동 로드
function _applyPayrollTeacherUI() {
  if (!_payrollTeacherView()) return;
  try {
    // 관리 전용 버튼 숨김 (CSV·마감·그래프·시드)
    ['payroll-csv-btn','payroll-finalize-btn','payroll-charts-btn','payroll-seed-btn'].forEach(function(id){
      var el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    // 신규 강사 등록 폼 숨김
    var tnew = document.getElementById('t-new-btn');
    // 🔐 (2026-08-18) details 는 인라인 display:none 이 안 먹는다(#legacy-cards 복구 규칙).
    //   버튼 4개는 <button> 이라 위에서 정상적으로 감춰지는데 이 폼만 남아, 강사 화면이
    //   «버튼은 없고 등록 폼만 있는» 어중간한 모양이 됐었다. 그래서 클래스로 감춘다.
    if (tnew) { var d = tnew.closest('details'); if (d) d.classList.add('rbac-hide'); }
    // 안내 배너 1회 삽입
    var card = document.getElementById('card-payroll');
    if (card && !document.getElementById('payroll-teacher-note')) {
      var note = document.createElement('div');
      note.id = 'payroll-teacher-note';
      note.style.cssText = 'background:#eef6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12.5px;line-height:1.6;font-weight:600';
      note.textContent = (typeof adminLang!=='undefined' && adminLang==='en')
        ? '👤 Teacher view — you can only see your own payslip.'
        : '👤 교사 보기 — 본인 급여명세서만 확인할 수 있어요.';
      var body = card.querySelector('.menu-body') || card;
      body.insertBefore(note, body.firstChild);
    }
  } catch(e){}
}

async function loadPayrollRates() {
  try {
    const r = await fetch('/api/admin/payroll/rates', { cache: 'no-store', credentials: 'include' });
    const d = await r.json();
    if (d.ok) _payrollSettings = d;
  } catch (e) { /* silent */ }
}

function frontClassifyGrade(w) {
  if (w == null || isNaN(w)) return '미평가';
  if (w >= 4.75) return '최우수';
  if (w >= 4.50) return '매우 우수';
  if (w >= 3.50) return '우수';
  return '개선 요망';
}

function gradeClass(g) {
  return 'grade-badge grade-' + (g || '미평가').replace(/\s+/g, '');
}

function heatCell(score) {
  if (score == null || isNaN(score)) return '<span class="heat-cell" data-score="-">—</span>';
  const rounded = Math.round(score);
  const display = (Math.round(score * 10) / 10).toFixed(1);
  return `<span class="heat-cell" data-score="${rounded}">${display}</span>`;
}

function fmtNum(n) { return (n || 0).toLocaleString(adminLang==='en'?'en-US':'ko-KR'); }

// 정렬 상태: 다중 키 지원. 배열 순서대로 1차, 2차, 3차... 적용
//   각 항목 = { key: 'monthly_salary_php', dir: 'desc' }
let _payrollSort = [];
let _lastPayrollContext = { year: null, month: null };

// 등급 정렬 우선순위 (높을수록 위)
const _GRADE_RANK = { '최우수': 4, '매우 우수': 3, '우수': 2, '개선 요망': 1, '미평가': 0 };

// 헤더 라벨 (정렬 상태 칩에 표시 — 한/영)
const _SORT_LABELS_KO = {
  teacher_name: '교사', status: '근무', years: '연차',
  score_instruction: '수업', score_retention: '유지', score_punctuality: '근태',
  score_admin: '행정', score_contribution: '조직',
  weighted_total: '가중점수', grade: '등급',
  class_count: '수업수', total_minutes: '총 수업시간', rate_per_10min_php: '10분단가',
  monthly_salary_php: '월급(PHP)', monthly_salary_krw: 'KRW',
};
const _SORT_LABELS_EN = {
  teacher_name: 'Teacher', status: 'Status', years: 'Years',
  score_instruction: 'Inst', score_retention: 'Ret', score_punctuality: 'Punct',
  score_admin: 'Admin', score_contribution: 'Contrib',
  weighted_total: 'Weighted', grade: 'Grade',
  class_count: 'Classes', total_minutes: 'Total min', rate_per_10min_php: 'Rate/10m',
  monthly_salary_php: 'Salary(PHP)', monthly_salary_krw: 'KRW',
};

// 등급 한↔영
const _GRADE_EN = { '최우수': 'Outstanding', '매우 우수': 'V.Satisfactory', '우수': 'Satisfactory', '개선 요망': 'Needs Improvement', '미평가': 'Unrated' };
function _gradeText(g) { return adminLang === 'en' ? (_GRADE_EN[g] || g || 'Unrated') : (g || '미평가'); }

/* 🕐 (2026-08-17) 총 수업시간 칸.
   서버의 length_recorded 가 false 면 그 달은 «길이가 입력된 적이 없어 전부 20분으로 계산» 한 것이다.
   그냥 숫자만 찍으면 30분 수업을 20분 값으로 지급하고 있어도 표에서 알 길이 없으므로,
   추정치는 «~» 를 붙이고 흐리게 찍어 실제 입력값과 눈으로 구분되게 한다. */
/* 🕐 총 수업시간 칸. «어디서 온 숫자인가» 를 색으로 구분한다 (length_source).
     manual  — 사람이 넣은 값        → 검은 글씨 그대로
     ingest  — 카페24가 보낸 분      → 검은 글씨 + 「자동」 표시
     assumed — 전부 20분으로 가정    → 회색 «~»  … 인데, 그 강사에게 «긴 수업» 이 있으면
               그건 가정이 틀렸다는 뜻이므로 **붉은 경고**로 바꾼다(사장님 요청 C안).
               빠뜨리면 강사가 30분을 가르치고 20분 값을 받는다. */
function _payrollMinutesCell(p) {
  const mins = (p.total_minutes != null)
    ? p.total_minutes
    : Math.round((p.total_10min_units || 0) * 10);
  if (!mins) return '—';
  const _L = adminLang === 'en';
  if (p.length_recorded) {
    if (p.length_source === 'ingest') {
      const t = _L ? 'From the Cafe24 monthly sync' : '카페24가 보낸 값 (자동)';
      return `${fmtNum(mins)} <span style="font-size:11px;color:#0f766e;" title="${t}">${_L ? 'auto' : '자동'}</span>`;
    }
    return fmtNum(mins);
  }
  if (p.has_long_class) {
    const t = _L
      ? 'This teacher has classes longer than 20 min — enter the real total or they get underpaid'
      : '이 강사에게 20분 초과 수업이 있습니다 — 실제 합계를 넣지 않으면 적게 지급됩니다';
    return `<span style="color:#b91c1c;font-weight:700;" title="${t}">⚠️ 입력 필요</span>`;
  }
  const tip = _L ? 'No length recorded — counted as 20 min each' : '길이 미입력 — 전부 20분으로 계산';
  return `<span style="color:#9ca3af;" title="${tip}">~${fmtNum(mins)}</span>`;
}

function _payrollFieldValue(row, key) {
  if (!row) return null;
  if (['score_instruction','score_retention','score_punctuality','score_admin','score_contribution'].includes(key)) {
    return row.evaluation ? row.evaluation[key] : null;
  }
  if (key === 'grade') return _GRADE_RANK[row.grade] != null ? _GRADE_RANK[row.grade] : -1;
  if (key === 'total_minutes') {
    return (row.total_minutes != null) ? row.total_minutes
         : (row.total_10min_units != null ? Math.round(row.total_10min_units * 10) : null);
  }
  return row[key];
}

function _comparePayrollSingle(a, b, key, dir) {
  const va = _payrollFieldValue(a, key);
  const vb = _payrollFieldValue(b, key);
  const aNull = va == null || va === '' || (typeof va === 'number' && isNaN(va));
  const bNull = vb == null || vb === '' || (typeof vb === 'number' && isNaN(vb));
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  let cmp;
  if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
  else cmp = String(va).localeCompare(String(vb), 'ko');
  return dir === 'asc' ? cmp : -cmp;
}

// 다중 키 비교 — 1차 비교에서 동률이면 2차, 그 다음 3차...
function _comparePayrollMulti(a, b) {
  for (const { key, dir } of _payrollSort) {
    const cmp = _comparePayrollSingle(a, b, key, dir);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function clearPayrollSort() {
  _payrollSort = [];
  renderPayrollTable();
}

function _updateSortArrows() {
  document.querySelectorAll('#payroll-thead .pr-th').forEach(th => {
    const arrow = th.querySelector('.pr-arrow');
    th.classList.remove('pr-active');
    if (arrow) arrow.textContent = '↕';
    const key = th.getAttribute('data-sort-key');
    const idx = _payrollSort.findIndex(s => s.key === key);
    if (idx !== -1) {
      th.classList.add('pr-active');
      const sym = _payrollSort[idx].dir === 'asc' ? '▲' : '▼';
      // 정렬 키가 둘 이상일 때만 우선순위 번호 표시
      const priority = _payrollSort.length > 1 ? String(idx + 1) : '';
      if (arrow) arrow.textContent = sym + priority;
    }
  });
  // 정렬 상태 칩 + 모두 해제 버튼
  const statusEl = document.getElementById('payroll-sort-status');
  if (statusEl) {
    if (_payrollSort.length === 0) {
      statusEl.innerHTML = '';
    } else {
      const labels = adminLang === 'en' ? _SORT_LABELS_EN : _SORT_LABELS_KO;
      const chips = _payrollSort.map((s, i) => {
        const label = labels[s.key] || s.key;
        const arrow = s.dir === 'asc' ? '▲' : '▼';
        return `<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-weight:600;">${i + 1}. ${label} ${arrow}</span>`;
      }).join('');
      const sortLabel  = adminLang === 'en' ? 'Sort:' : '정렬:';
      const clearLabel = adminLang === 'en' ? '✕ Clear all' : '✕ 모두 해제';
      statusEl.innerHTML = '<span style="color:#6b7280;">' + sortLabel + '</span>' + chips
        + '<button onclick="clearPayrollSort()" style="background:#fff;border:1px solid #d1d5db;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;color:#6b7280;margin-left:4px;">' + clearLabel + '</button>';
    }
  }
}

function renderPayrollTable() {
  const tb = document.getElementById('payroll-table');
  if (!tb) return;
  let rows = _lastPayrollRows ? _lastPayrollRows.slice() : [];
  const _L = adminLang === 'en';
  // 🔐 유효 역할(실제 로그인 또는 미리보기) 기준으로 강제. 미리보기(관리자가 강사 모드)도 정직하게 반영.
  const _effRole = (typeof window._effectiveRole === 'function') ? window._effectiveRole() : (window._adminSession && window._adminSession.role);
  const _preview = (typeof window._isRolePreview === 'function') && window._isRolePreview();
  // 지사·대리점·학부모·학생 = 급여 열람 불가 → 표를 비우고 안내(미리보기에서도 동일)
  if (_effRole === 'branch' || _effRole === 'agency' || _effRole === 'parent' || _effRole === 'student') {
    tb.innerHTML = '<tr><td colspan="15" class="empty">' + (_L ? 'Payroll is visible only to HQ managers/executives and each teacher (own payslip).' : '급여는 본사 관리자·경영진(전체)과 교사 본인(본인 급여)만 볼 수 있습니다.') + '</td></tr>';
    _updateSortArrows();
    return;
  }
  const _teacherView = _effRole === 'hq_teacher';
  if (_teacherView && typeof window._payrollIsOwnRow === 'function') {
    // 미리보기면 퍼소나 이름, 실제 로그인이면 세션 이름으로 본인 행 매칭
    const _ownName = (typeof window._effectiveOwnName === 'function') ? window._effectiveOwnName() : (window._adminSession && window._adminSession.name);
    const _ownSess = { name: _ownName, uid: (window._adminSession && window._adminSession.uid) };
    rows = rows.filter(r => window._payrollIsOwnRow(r, _ownSess));
    _applyPayrollTeacherUI();
  }
  if (_payrollSort.length > 0) {
    rows.sort(_comparePayrollMulti);
  }
  if (rows.length === 0) {
    if (_teacherView) {
      const note = _preview
        ? (_L ? 'Teacher Mode preview: a teacher only sees their OWN payslip — other teachers\' salaries are hidden. (This demo persona has no payroll data.)'
              : '👨‍🏫 강사 모드 미리보기: 강사는 <b>본인 급여만</b> 보이고 다른 강사 급여는 가려집니다. (이 데모 계정은 급여 데이터가 없어 비어 있어요. 실제 확인은 강사 계정으로 로그인.)')
        : (_L ? 'No payslip found for your account this month.' : '이번 달 본인 급여명세서를 찾을 수 없습니다.');
      tb.innerHTML = '<tr><td colspan="15" class="empty" style="line-height:1.7">' + note + '</td></tr>';
      _updateSortArrows();
      return;
    }
    const empty = _L ? 'No active teachers. Add one above or click 🌱 Seed.' : '활성 강사가 없습니다. 위에서 강사를 먼저 등록하거나 🌱 시드 버튼을 사용하세요.';
    tb.innerHTML = '<tr><td colspan="15" class="empty">' + empty + '</td></tr>';
    _updateSortArrows();
    return;
  }
  const year  = _lastPayrollContext.year;
  const month = _lastPayrollContext.month;
  const yearsSuffix = _L ? 'y' : '년';
  tb.innerHTML = rows.map(p => {
    const e = p.evaluation || {};
    const gClass = gradeClass(p.grade);
    const krw = p.monthly_salary_krw || 0;
    const safeName = String(p.teacher_name || '').replace(/'/g, '&#39;');
    const _rowClick = _teacherView ? '' : ` style="cursor:pointer;" onclick="openEvalModal(${p.teacher_id}, '${safeName}', ${year}, ${month})"`;
    return `<tr${_rowClick}>
      <td style="font-weight:700;">${safeName}</td>
      <td><span style="font-size:11px;color:#6b7280;">${p.status === 'office' ? 'OFFICE' : (p.status === 'home' ? 'HOME' : '—')}</span></td>
      <td>${p.years != null ? (p.years + yearsSuffix) : '—'}</td>
      <td>${heatCell(e.score_instruction)}</td>
      <td>${heatCell(e.score_retention)}</td>
      <td>${heatCell(e.score_punctuality)}</td>
      <td>${heatCell(e.score_admin)}</td>
      <td>${heatCell(e.score_contribution)}</td>
      <td style="text-align:right;font-weight:700;">${p.weighted_total != null ? p.weighted_total.toFixed(2) : '—'}</td>
      <td><span class="${gClass}">${_gradeText(p.grade)}</span></td>
      <td style="text-align:right;">${fmtNum(p.class_count)}</td>
      <td style="text-align:right;">${_payrollMinutesCell(p)}</td>
      <td style="text-align:right;">${(p.rate_per_10min_php || 0).toFixed(2)}</td>
      <td style="text-align:right;font-weight:700;color:#10b981;">${fmtNum(Math.round(p.monthly_salary_php))}</td>
      <td style="text-align:right;color:#6b7280;">₩${fmtNum(krw)}</td>
    </tr>`;
  }).join('');
  _updateSortArrows();
}

// 상단 카운터 (월·인원·합계·등급분포) 라벨도 한/영 — 마지막 d 데이터를 보관해 재사용
let _lastPayrollSummary = null;
function refreshPayrollSummary() {
  const el = document.getElementById('payroll-counts');
  if (!el) return;
  // 🔐 교사 본인 보기 — 전체 합계/인원 노출 금지, 본인 급여만 요약
  if (_payrollTeacherView()) {
    const own = (_lastPayrollRows || []).filter(r => window._payrollIsOwnRow(r, window._adminSession));
    if (own.length) {
      const r0 = own[0];
      const ym = _lastPayrollContext.year ? `${_lastPayrollContext.year}-${String(_lastPayrollContext.month).padStart(2,'0')} · ` : '';
      el.textContent = (adminLang==='en')
        ? `${ym}My salary: PHP ${fmtNum(Math.round(r0.monthly_salary_php||0))} ≈ ₩${fmtNum(r0.monthly_salary_krw||0)}`
        : `${ym}내 급여: PHP ${fmtNum(Math.round(r0.monthly_salary_php||0))} ≈ ₩${fmtNum(r0.monthly_salary_krw||0)}`;
    } else { el.textContent = '—'; }
    return;
  }
  const d = _lastPayrollSummary;
  if (!d) return;
  const _L = adminLang === 'en';
  const gc = d.grade_counts || {};
  const ym = `${d.year}-${String(d.month).padStart(2,'0')}`;
  const peopleLabel = _L ? `${d.count} teachers` : `${d.count}명`;
  const totalLabel  = _L ? `Total PHP ${fmtNum(d.total_salary_php)} ≈ ₩${fmtNum(d.total_salary_krw)}` : `합계 PHP ${fmtNum(d.total_salary_php)} ≈ ₩${fmtNum(d.total_salary_krw)}`;
  const gradeLabel  = _L
    ? `Outstanding ${gc['최우수']||0} · V.Satisf ${gc['매우 우수']||0} · Satisf ${gc['우수']||0} · Needs Imp ${gc['개선 요망']||0}`
    : `최우수 ${gc['최우수']||0} · 매우우수 ${gc['매우 우수']||0} · 우수 ${gc['우수']||0} · 개선 ${gc['개선 요망']||0}`;
  el.textContent = `${ym} · ${peopleLabel} · ${totalLabel} · ${gradeLabel}`;
}

// 헤더 클릭 → 정렬 토글
//   일반 클릭     : 해당 키만 1차 정렬 (다른 키 모두 제거). 같은 키면 desc → asc → 해제 순환
//   Shift + 클릭  : 보조 정렬 키 추가/토글. 같은 키 누르면 desc → asc → 그 키만 제거
function onPayrollHeaderClick(key, shiftKey) {
  const idx = _payrollSort.findIndex(s => s.key === key);
  if (shiftKey) {
    // 다중 정렬 — 기존 키 유지하면서 추가/토글
    if (idx === -1) {
      _payrollSort.push({ key, dir: 'desc' });
    } else if (_payrollSort[idx].dir === 'desc') {
      _payrollSort[idx].dir = 'asc';
    } else {
      _payrollSort.splice(idx, 1); // 그 키만 제거
    }
  } else {
    // 단일 정렬 — 다른 키는 모두 정리
    if (_payrollSort.length === 1 && _payrollSort[0].key === key) {
      // 이미 단일 정렬 상태 → 토글 사이클
      if (_payrollSort[0].dir === 'desc') {
        _payrollSort[0].dir = 'asc';
      } else {
        _payrollSort = [];
      }
    } else {
      _payrollSort = [{ key, dir: 'desc' }];
    }
  }
  renderPayrollTable();
}

async function calcPayrollAll() {
  const _L = adminLang === 'en';
  const year  = parseInt(document.getElementById('payroll-year').value, 10);
  const month = parseInt(document.getElementById('payroll-month').value, 10);
  if (!year || !month) { alert(_L ? 'Enter year/month' : '연도/월을 입력하세요'); return; }
  const tb = document.getElementById('payroll-table');
  tb.innerHTML = '<tr><td colspan="15" class="empty">' + (_L ? 'Loading...' : '불러오는 중...') + '</td></tr>';
  try {
    const r = await fetch(`/api/admin/payroll/all?year=${year}&month=${month}`, { cache: 'no-store', credentials: 'include' });
    const d = await r.json();
    if (!d.ok) {
      tb.innerHTML = '<tr><td colspan="15" class="empty">' + (_L ? 'Failed: ' : '실패: ') + (d.error || ('HTTP ' + r.status)) + '</td></tr>';
      return;
    }
    _lastPayrollRows = d.items || [];
    _lastPayrollContext = { year: d.year, month: d.month };
    _lastPayrollSummary = d;
    refreshPayrollSummary();
    renderPayrollTable();
    // 그래프 영역이 펼쳐진 상태면 자동 갱신
    const cw = document.getElementById('payroll-charts-wrap');
    if (cw && cw.style.display === 'block') renderPayrollCharts();
  } catch (e) {
    tb.innerHTML = '<tr><td colspan="15" class="empty">' + (_L ? 'Error: ' : '에러: ') + e.message + '</td></tr>';
  }
}

// ── 평가 모달 ──
function openEvalModal(teacherId, teacherName, year, month) {
  if (_payrollTeacherView()) { try{ window._payrollGuardToast(adminLang==='en'?'Read-only. Evaluation is HQ-only.':'본인 급여는 열람 전용입니다. 평가 수정은 본사 관리자·경영진만 가능합니다.'); }catch(e){} return; } // 🔐
  // 기존 데이터 채우기
  const row = (_lastPayrollRows || []).find(r => r.teacher_id === teacherId) || {};
  const e = row.evaluation || {};
  const _L = adminLang === 'en';
  document.getElementById('eval-modal-title').textContent = _L
    ? `📋 ${teacherName} — ${year}-${String(month).padStart(2,'0')} Evaluation`
    : `📋 ${teacherName} — ${year}-${String(month).padStart(2,'0')} 평가`;
  document.getElementById('ev-instruction').value  = e.score_instruction  ?? '';
  document.getElementById('ev-retention').value    = e.score_retention    ?? '';
  document.getElementById('ev-punctuality').value  = e.score_punctuality  ?? '';
  document.getElementById('ev-admin').value        = e.score_admin        ?? '';
  document.getElementById('ev-contribution').value = e.score_contribution ?? '';
  document.getElementById('ev-tch-strengths').value    = e.strengths    ?? '';
  document.getElementById('ev-tch-improvements').value = e.improvements ?? '';
  document.getElementById('ev-class-count').value  = row.class_count ?? 0;
  // 🕐 (2026-08-17) 총 수업시간(분) — 서버는 10분 토막(total_10min_units)으로 갖고 있다.
  //   비어 있으면 «길이 정보 없음(=전부 20분)» 이라는 뜻이라 칸도 비워 둔다.
  const _tmEl = document.getElementById('ev-total-minutes');
  if (_tmEl) _tmEl.value = (row.total_10min_units > 0) ? Math.round(row.total_10min_units * 10) : '';
  updateMinutesHint();
  // 모달에 컨텍스트 보관
  const bg = document.getElementById('eval-modal-bg');
  bg.dataset.teacherId = teacherId;
  bg.dataset.year      = year;
  bg.dataset.month     = month;
  bg.classList.add('show');
  updateEvalPreview();
}
function closeEvalModal() {
  document.getElementById('eval-modal-bg').classList.remove('show');
}
/* 🕐 (2026-08-17) 급여 근거 안내 — 입력한 «회수/분» 이 급여에 어떻게 들어가는지 그 자리에서 보여 준다.
   총 수업시간을 비워 두면 서버가 «전부 20분» 으로 계산한다. 30분 수업이 섞인 달에 이걸 모르고
   비워 두면 강사가 30분을 가르치고 20분 값을 받는다 — 그래서 화면에 반드시 적어 둔다. */
function updateMinutesHint() {
  const box = document.getElementById('ev-minutes-hint');
  if (!box) return;
  const L = (typeof adminLang !== 'undefined' && adminLang === 'en');
  const cnt = parseInt((document.getElementById('ev-class-count') || {}).value, 10);
  const min = parseInt((document.getElementById('ev-total-minutes') || {}).value, 10);
  if (min > 0) {
    const units = min / 10;
    const avg = (cnt > 0) ? (min / cnt) : null;
    box.textContent = L
      ? `Payroll basis: ${min} min = ${units} ten-minute units × rate`
        + (avg ? ` (avg ${avg.toFixed(1)} min/class)` : '')
      : `급여 기준: ${min}분 = 10분 토막 ${units}개 × 단가`
        + (avg ? ` (수업당 평균 ${avg.toFixed(1)}분)` : '');
    box.style.backgroundColor = '#f0fdf4';
  } else if (cnt > 0) {
    box.textContent = L
      ? `Total minutes empty → counted as 20 min each: ${cnt} × 20 = ${cnt * 20} min. Enter it if 30-min classes are included.`
      : `총 수업시간을 비우면 전부 20분으로 계산합니다: ${cnt}회 × 20분 = ${cnt * 20}분. 30분 수업이 섞인 달이면 반드시 입력하세요.`;
    box.style.backgroundColor = '#fffbeb';
  } else {
    box.textContent = '—';
    box.style.backgroundColor = '#f8fafc';
  }
}
function updateEvalPreview() {
  const v = id => parseFloat(document.getElementById(id).value);
  const i = v('ev-instruction'), r = v('ev-retention'), p = v('ev-punctuality'),
        a = v('ev-admin'), c = v('ev-contribution');
  if ([i, r, p, a, c].some(x => isNaN(x))) {
    document.getElementById('ev-weighted-preview').textContent = '—';
    document.getElementById('ev-grade-preview').textContent = '—';
    return;
  }
  const w = i*EVAL_WEIGHTS_FRONT.instruction + r*EVAL_WEIGHTS_FRONT.retention
          + p*EVAL_WEIGHTS_FRONT.punctuality + a*EVAL_WEIGHTS_FRONT.admin
          + c*EVAL_WEIGHTS_FRONT.contribution;
  document.getElementById('ev-weighted-preview').textContent = w.toFixed(2);
  document.getElementById('ev-grade-preview').textContent = frontClassifyGrade(w);
}
/* 🤖 LMS 기록으로 평가 5항목 «채워 주기» — 2026-08-30
   [무엇] GET /api/admin/payroll/auto-evaluate 가 계산한 «제안» 을 모달 입력칸에 넣는다.
   ⛔ 저장하지 않는다 — 사람이 확인하고 [저장] 을 눌러야 반영된다(이 점수는 급여로 이어진다).
   ⛔ 잴 수 없는 항목을 0 이나 3 으로 채우지 않는다 — 빈칸으로 두고 **왜 비었는지** 를 적는다.
      (CLAUDE.md 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」) */
async function autoFillEvalFromLms() {
  const _L = adminLang === 'en';
  const bg = document.getElementById('eval-modal-bg');
  const box = document.getElementById('ev-auto-basis');
  const btn = document.getElementById('ev-auto-btn');
  if (!bg || !box) return;
  const teacherId = parseInt(bg.dataset.teacherId, 10);
  const year  = parseInt(bg.dataset.year, 10);
  const month = parseInt(bg.dataset.month, 10);
  if (!teacherId || !year || !month) return;
  const was = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = _L ? '⏳ Reading…' : '⏳ 기록을 읽는 중…'; }
  try {
    const r = await fetch(`/api/admin/payroll/auto-evaluate?year=${year}&month=${month}`,
                          { credentials: 'include', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    /* 판정은 «실패라고 말했는가» 가 아니라 «성공이라고 말했는가» 로 한다 —
       404 본문에는 ok 칸이 아예 없어 `d.ok === false` 는 그냥 통과한다(CLAUDE.md 2장). */
    if (!(r.ok && d && d.ok === true && Array.isArray(d.teachers))) {
      throw new Error((d && (d.message || d.error)) || ('HTTP ' + r.status));
    }
    const row = d.teachers.filter(function (t) { return Number(t.teacher_id) === teacherId; })[0];
    if (!row) throw new Error(_L ? 'This teacher is not in the active roster.' : '재직 강사 명부에서 이 강사를 찾지 못했습니다.');

    let filled = 0;
    const put = function (id, v) {
      const el = document.getElementById(id);
      if (!el || v == null) return;
      el.value = v; filled++;
    };
    put('ev-instruction', row.suggested.score_instruction);
    put('ev-admin',       row.suggested.score_admin);
    if (typeof updateEvalPreview === 'function') { try { updateEvalPreview(); } catch (e) {} }

    const b = row.basis || {};
    let h = '<b>' + (_L ? 'Filled from LMS records' : 'LMS 기록으로 채운 항목') + ': ' + filled + '</b><br>';
    h += (_L ? 'Student ratings: ' : '학생 별점: ')
       + (b.rating_n ? (b.rating_avg + ' (' + b.rating_n + (_L ? ' ratings)' : '건)')) : (_L ? 'none' : '없음'))
       + ' · ' + (_L ? 'Lesson logs: ' : '수업일지: ')
       + b.lesson_log_n + '/' + b.lesson_count
       + (b.lesson_log_rate == null ? '' : ' (' + b.lesson_log_rate + '%)') + '<br>';
    const un = (row.unmeasured || []);
    if (un.length) {
      h += '<span style="color:#b45309">' + (_L ? 'Left blank on purpose:' : '일부러 비워 둔 항목:') + '</span><ul style="margin:4px 0 0 16px;padding:0">';
      un.forEach(function (u) {
        h += '<li>' + String(_L ? u.reason_en : u.reason).replace(/[<>&]/g, '') + '</li>';
      });
      h += '</ul>';
    }
    box.innerHTML = h;
    box.style.display = 'block';
  } catch (e) {
    box.innerHTML = '<span style="color:#b91c1c">'
      + (_L ? 'Could not read LMS records: ' : 'LMS 기록을 읽지 못했습니다: ')
      + String(e && e.message ? e.message : e).replace(/[<>&]/g, '') + '</span>';
    box.style.display = 'block';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = was; }
  }
}

async function saveEvalAndClasses() {
  const _L = adminLang === 'en';
  const bg = document.getElementById('eval-modal-bg');
  const teacherId = parseInt(bg.dataset.teacherId, 10);
  const year      = parseInt(bg.dataset.year, 10);
  const month     = parseInt(bg.dataset.month, 10);
  const v = id => {
    const x = document.getElementById(id).value;
    return x === '' ? null : parseFloat(x);
  };
  const evalBody = {
    teacher_id: teacherId, year, month,
    score_instruction:  v('ev-instruction'),
    score_retention:    v('ev-retention'),
    score_punctuality:  v('ev-punctuality'),
    score_admin:        v('ev-admin'),
    score_contribution: v('ev-contribution'),
    strengths:          document.getElementById('ev-tch-strengths').value || null,
    improvements:       document.getElementById('ev-tch-improvements').value || null,
    evaluator:          'admin',
  };
  const classCount = parseInt(document.getElementById('ev-class-count').value, 10);
  // 🕐 (2026-08-17) 총 수업시간(분). 비우면 안 보내고, 서버는 예전대로 «전부 20분» 으로 본다.
  const _tmRaw = (document.getElementById('ev-total-minutes') || {}).value;
  const totalMinutes = (_tmRaw === '' || _tmRaw == null) ? null : parseInt(_tmRaw, 10);
  try {
    const r1 = await fetch('/api/admin/teacher-evaluation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(evalBody)
    });
    const d1 = await r1.json().catch(() => ({}));
    if (!r1.ok || d1.ok === false) { alert((_L ? 'Eval save failed: ' : '평가 저장 실패: ') + (d1.error || ('HTTP ' + r1.status))); return; }
    if (!isNaN(classCount) && classCount >= 0) {
      const r2 = await fetch('/api/admin/teacher-classes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(Object.assign(
          { teacher_id: teacherId, year, month, class_count: classCount },
          (totalMinutes != null && !isNaN(totalMinutes) && totalMinutes > 0) ? { total_minutes: totalMinutes } : {}
        ))
      });
      const d2 = await r2.json().catch(() => ({}));
      if (!r2.ok || d2.ok === false) { alert((_L ? 'Class count save failed: ' : '수업수 저장 실패: ') + (d2.error || ('HTTP ' + r2.status))); return; }
    }
    closeEvalModal();
    calcPayrollAll();
  } catch (e) { alert((adminLang === 'en' ? 'Network error: ' : '네트워크 에러: ') + e.message); }
}

/* 📥 (2026-08-30 v4 제안서 08) 급여·평가 CSV — «백화(빈 흰 화면)» 수리.
   [무엇이 문제였나] 예전에는 `window.open(...csv...)` 한 줄이었다. 그 새 탭은
     ① 서버가 활성 강사 전원을 한 명씩 계산하는 동안 **몇 초~수십 초 흰 화면**으로 떠 있고,
     ② 실패하면(세션 만료 302, 500) 다운로드 대신 **빈 페이지나 JSON 원문**이 남는다 —
        쓰는 사람에게는 «눌렀더니 하얘졌다» 로 보인다. 어디가 잘못됐는지 알 길이 없다.
     ③ 카톡·문자 인앱 브라우저는 새 창을 못 여는데 **예외도 안 던지고 null 만** 돌려준다
        (CLAUDE.md 2장) → 아무 일도 안 일어난다.
   [고침] 지금 창에서 비동기로 받아 blob 으로 저장한다. 받는 동안 버튼이 «내려받는 중…» 이 되고,
     실패하면 사유를 그 자리에서 말한다. 새 탭을 아예 열지 않으므로 ①②③ 이 함께 사라진다. */
async function downloadPayrollCSV() {
  const _L = adminLang === 'en';
  if (_payrollTeacherView()) { try{ window._payrollGuardToast(_L?'Only HQ managers/executives can export payroll.':'전체 급여 내보내기는 본사 관리자·경영진만 가능합니다.'); }catch(e){} return; } // 🔐
  const year  = parseInt(document.getElementById('payroll-year').value, 10);
  const month = parseInt(document.getElementById('payroll-month').value, 10);
  if (!year || !month) { alert(_L ? 'Enter year/month' : '연도/월을 입력하세요'); return; }

  const btn = document.getElementById('payroll-csv-btn');
  const label0 = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = _L ? 'Downloading…' : '내려받는 중…'; }
  let url = '';
  try {
    const r = await fetch(`/api/admin/export/payroll.csv?year=${year}&month=${month}`,
                          { credentials: 'include', cache: 'no-store' });
    if (!r.ok) {
      /* 세션이 끊기면 서버가 로그인으로 보내거나 401 을 준다 — «흰 화면» 대신 사실을 말한다 */
      alert(_L ? ('Export failed (HTTP ' + r.status + '). Please sign in again and retry.')
               : ('내보내기 실패 (HTTP ' + r.status + '). 다시 로그인한 뒤 시도해 주세요.'));
      return;
    }
    const blob = await r.blob();
    if (!blob || blob.size === 0) {
      alert(_L ? 'The server returned an empty file.' : '서버가 빈 파일을 돌려주었습니다.');
      return;
    }
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mangoi_payroll_${year}-${String(month).padStart(2, '0')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    alert((_L ? 'Network error: ' : '네트워크 에러: ') + (e && e.message ? e.message : e));
  } finally {
    // ⚠️ revoke 를 즉시 하면 브라우저가 저장을 시작하기 전에 주소가 죽는 기기가 있다
    if (url) setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 60000);
    if (btn) { btn.disabled = false; btn.textContent = label0; }
  }
}

async function finalizePayroll() {
  const _L = adminLang === 'en';
  if (_payrollTeacherView()) { try{ window._payrollGuardToast(_L?'Only HQ managers/executives can close payroll.':'급여 마감은 본사 관리자·경영진만 가능합니다.'); }catch(e){} return; } // 🔐
  const year  = parseInt(document.getElementById('payroll-year').value, 10);
  const month = parseInt(document.getElementById('payroll-month').value, 10);
  if (!year || !month) return;
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  const msg = _L
    ? `Close payroll for ${ym}?\nPermanently saved to payslips. Re-closing the same month is blocked.`
    : `${ym} 급여를 마감하시겠습니까?\npayslips 테이블에 영구 저장되며 동일 월 재마감은 차단됩니다.`;
  if (!confirm(msg)) return;
  try {
    const r = await fetch('/api/admin/payroll/finalize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ year, month, finalized_by: 'admin' })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) { alert((_L ? 'Close failed: ' : '마감 실패: ') + (d.error || ('HTTP ' + r.status))); return; }
    alert(_L
      ? `Closed. Saved ${d.saved} · Skipped ${d.skipped} (already closed)\nTotal PHP ${(d.total_php||0).toLocaleString()}`
      : `마감 완료. ${d.saved}명 저장 · ${d.skipped}명 스킵(이미 마감)\n합계 PHP ${(d.total_php||0).toLocaleString()}`);
    if (typeof loadNotifications === 'function') loadNotifications();
  } catch (e) { alert((_L ? 'Network error: ' : '네트워크 에러: ') + e.message); }
}

async function registerTeacher() {
  const _L = adminLang === 'en';
  if (_payrollTeacherView()) { try{ window._payrollGuardToast(_L?'Not allowed.':'권한이 없습니다.'); }catch(e){} return; } // 🔐
  const name   = (document.getElementById('t-new-name').value || '').trim();
  const status = document.getElementById('t-new-status').value;
  const years  = parseInt(document.getElementById('t-new-years').value, 10);
  const rate   = parseFloat(document.getElementById('t-new-rate').value);
  if (!name) { alert(_L ? 'Name is required' : '이름은 필수입니다'); return; }
  if (isNaN(rate) || rate < 0) { alert(_L ? 'Rate per 10 min (PHP) must be ≥ 0' : '10분당 단가(PHP)는 0 이상이어야 합니다'); return; }
  try {
    const r = await fetch('/api/admin/teachers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ name, status, years: isNaN(years) ? null : years, rate_per_10min_php: rate })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) { alert((_L ? 'Register failed: ' : '등록 실패: ') + (d.error || ('HTTP ' + r.status))); return; }
    ['t-new-name', 't-new-years', 't-new-rate'].forEach(id => document.getElementById(id).value = '');
    calcPayrollAll();
  } catch (e) { alert((_L ? 'Network error: ' : '네트워크 에러: ') + e.message); }
}

// 📊 차트 인스턴스 (이전 차트 destroy 후 새로 그리려고 보관)
let _prCharts = { salary: null, weighted: null, grade: null, radar: null };

// 등급별 색상 — 막대/도넛 모두 동일하게
function _gradeColor(g) {
  return g === '최우수'    ? '#10b981'
       : g === '매우 우수' ? '#3b82f6'
       : g === '우수'      ? '#f59e0b'
       : g === '개선 요망' ? '#ef4444'
       : '#9ca3af';  // 미평가
}

function renderPayrollCharts() {
  if (_payrollTeacherView()) return; // 🔐 교사는 전체 비교 차트 불가
  if (!_lastPayrollRows || _lastPayrollRows.length === 0) return;
  if (typeof Chart === 'undefined') return;
  const _L = adminLang === 'en';

  // 정렬된 순서 (월급 내림차순) 로 차트 표시
  const rows = _lastPayrollRows.slice().sort((a, b) => (b.monthly_salary_php || 0) - (a.monthly_salary_php || 0));
  const labels = rows.map(r => r.teacher_name || `#${r.teacher_id}`);
  const salaries = rows.map(r => Math.round(r.monthly_salary_php || 0));
  const colors = rows.map(r => _gradeColor(r.grade));

  // ── 1) 강사별 월급(PHP) 가로 막대 ──
  if (_prCharts.salary) _prCharts.salary.destroy();
  _prCharts.salary = new Chart(document.getElementById('chart-pr-salary'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: _L ? 'Salary (PHP)' : '월급 (PHP)', data: salaries,
        backgroundColor: colors, borderColor: colors, borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const r = rows[ctx.dataIndex];
              return _L ? [
                `Salary: ${(r.monthly_salary_php||0).toLocaleString()} PHP`,
                `≈ ₩${(r.monthly_salary_krw||0).toLocaleString()}`,
                `Grade: ${_gradeText(r.grade)}`,
                `Classes: ${r.class_count || 0} × Rate ${(r.rate_per_10min_php||0).toFixed(2)}`
              ] : [
                `월급: ${(r.monthly_salary_php||0).toLocaleString()} PHP`,
                `≈ ₩${(r.monthly_salary_krw||0).toLocaleString()}`,
                `등급: ${_gradeText(r.grade)}`,
                `수업수: ${r.class_count || 0} × 단가 ${(r.rate_per_10min_php||0).toFixed(2)}`
              ];
            }
          }
        }
      },
      scales: { x: { ticks: { callback: v => v.toLocaleString() } } }
    }
  });

  // ── 2) 강사별 가중 점수 가로 막대 ──
  const wRows = _lastPayrollRows.slice()
    .filter(r => r.weighted_total != null)
    .sort((a, b) => (b.weighted_total || 0) - (a.weighted_total || 0));
  const wLabels = wRows.map(r => r.teacher_name || `#${r.teacher_id}`);
  const wData   = wRows.map(r => r.weighted_total);
  const wColors = wRows.map(r => _gradeColor(r.grade));
  if (_prCharts.weighted) _prCharts.weighted.destroy();
  _prCharts.weighted = new Chart(document.getElementById('chart-pr-weighted'), {
    type: 'bar',
    data: {
      labels: wLabels,
      datasets: [{
        label: _L ? 'Weighted Score' : '가중 점수', data: wData,
        backgroundColor: wColors, borderColor: wColors, borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { min: 0, max: 5 } }
    }
  });

  // ── 3) 등급 분포 도넛 ──
  const gradeOrder = ['최우수', '매우 우수', '우수', '개선 요망', '미평가'];
  const gradeLabels = gradeOrder.map(g => _gradeText(g));
  const counts = gradeOrder.map(g => _lastPayrollRows.filter(r => (r.grade || '미평가') === g).length);
  if (_prCharts.grade) _prCharts.grade.destroy();
  _prCharts.grade = new Chart(document.getElementById('chart-pr-grade'), {
    type: 'doughnut',
    data: {
      labels: gradeLabels,
      datasets: [{
        data: counts,
        backgroundColor: gradeOrder.map(g => _gradeColor(g)),
        borderWidth: 2, borderColor: '#fff'
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${ctx.parsed}` + (_L ? '' : '명')
          }
        }
      }
    }
  });

  // ── 4) 5개 카테고리 평균 레이더 ──
  const cats = _L ? ['Inst', 'Ret', 'Punct', 'Admin', 'Contrib'] : ['수업', '유지', '근태', '행정', '조직'];
  const evalRows = _lastPayrollRows.filter(r => r.evaluation && r.weighted_total != null);
  const avg = (key) => {
    const vs = evalRows.map(r => r.evaluation[key]).filter(v => v != null && !isNaN(v));
    return vs.length ? (vs.reduce((s, v) => s + v, 0) / vs.length) : 0;
  };
  const avgScores = [
    avg('score_instruction'),
    avg('score_retention'),
    avg('score_punctuality'),
    avg('score_admin'),
    avg('score_contribution'),
  ].map(v => Math.round(v * 100) / 100);
  if (_prCharts.radar) _prCharts.radar.destroy();
  _prCharts.radar = new Chart(document.getElementById('chart-pr-radar'), {
    type: 'radar',
    data: {
      labels: cats.map((c, i) => {
        const w = [25, 30, 20, 15, 10][i];
        return `${c} (${w}%)`;
      }),
      datasets: [{
        label: _L ? 'Teacher Avg' : '강사 평균',
        data: avgScores,
        backgroundColor: 'rgba(14,165,233,0.20)',
        borderColor: '#0ea5e9',
        borderWidth: 2,
        pointBackgroundColor: '#0ea5e9',
        pointRadius: 4
      }]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        r: { min: 0, max: 5, ticks: { stepSize: 1, font: { size: 10 } } }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function togglePayrollCharts() {
  const el = document.getElementById('payroll-charts-wrap');
  if (!el) return;
  if (el.style.display === 'none' || !el.style.display) {
    el.style.display = 'block';
    // 데이터 있으면 즉시 그리고, 없으면 안내
    if (_lastPayrollRows && _lastPayrollRows.length > 0) {
      renderPayrollCharts();
    } else {
      // 그래도 표시는 하되 안내 문구
      // (실제 렌더는 calcPayrollAll 호출 후)
    }
  } else {
    el.style.display = 'none';
  }
}

// ============================================================================
// 🏢 Phase 9 — 6개 추가 메뉴 (가맹점·센터·레벨테스트·수강신청·커뮤니티·교재)
// ============================================================================
function _esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function _fmtDate(ts){if(!ts)return '—';const d=new Date(Number(ts));return d.toLocaleDateString(adminLang==='en'?'en-US':'ko-KR');}
function _fmtDateTime(ts){if(!ts)return '—';const d=new Date(Number(ts));return d.toLocaleString(adminLang==='en'?'en-US':'ko-KR');}
async function _menuPost(url, body) {
  const r = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(body)});
  const d = await r.json().catch(()=>({}));
  if (!r.ok || d.ok === false) {
    // 서버가 사람이 읽을 message 를 주면 그걸 우선한다 — d.error 는 'bad_username' 같은 코드뿐이라 뜻이 안 통한다.
    alert((adminLang==='en'?'Failed: ':'실패: ') + (d.message || d.error || ('HTTP '+r.status)));
    return null;
  }
  return d;
}

// 🥭 Phase 34/40 — 강사 정보 CRUD (영문 번역 추가) ───────────────────
function _tpStatusBadge(status) {
  const L = (typeof adminLang !== 'undefined' && adminLang === 'en');
  const map = {
    '활동중': { bg:'#dcfce7', color:'#166534', emoji:'🟢', ko:'활동중', en:'Active' },
    '비활동': { bg:'#fef3c7', color:'#854d0e', emoji:'⏸️', ko:'비활동', en:'Inactive' },
    '퇴사':   { bg:'#fee2e2', color:'#991b1b', emoji:'🚪', ko:'퇴사',   en:'Resigned' }
  };
  const s = map[status]; if (!s) return _aiEsc(status||'');
  /* JS 로 그린 글자는 🌐 를 눌러도 안 따라온다 — 그릴 때 data-ko/data-en 을 함께 박는다.
     ⚠️ 이 span 은 «라벨만» 담으므로 textContent 를 갈아끼워도 안전하다
        (아이콘이 함께 든 상자에는 절대 달지 말 것 — CLAUDE.md 2장). */
  /* ⚠️ white-space:nowrap 이 없으면 좁은 상태 칸에서 「🚪 퇴사」가 «🚪 / 퇴 / 사» 로 쪼개진다
     (실측 2026-09-01 PC 1440: 배지 높이 48px → nowrap 뒤 24px).
     class 는 밝기 페인터 SKIP_SEL 과 짝 — 초록/노랑/빨강이 «구분 정보» 라 눌리면 안 된다. */
  return '<span class="tp-st-badge" data-ko="' + s.emoji + ' ' + s.ko + '" data-en="' + s.emoji + ' ' + s.en + '" ' +
    /* ⚠️ background-color 로 쓴다 — `background:#f…` 로 쓰면 admin-inline-c.css 의 옛 다크 규칙
       (`details.menu-card [style*="background:#f"]` 류)이 !important 로 덮어 **배경이 투명**해진다.
       실측(2026-09-01): background: 로 두었더니 computed backgroundColor 가 rgba(0,0,0,0) 이 되고
       세 상태가 화면에서 구분되지 않았다(CLAUDE.md 2장 「관리자 카드 안 박스 색이 안 먹음」). */
    'style="background-color:' + s.bg + ';color:' + s.color + ';padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap">' +
    s.emoji + ' ' + (L ? s.en : s.ko) + '</span>';
}
function _tpGroupBadge(group) {
  var g = (group == null ? '' : String(group)).trim();
  if (!g) return '—';
  var gl = g.toLowerCase();
  if (gl.indexOf('home') >= 0) return '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:999px;font-size:11px">🏠 ' + _aiEsc(g) + '</span>';
  if (gl.indexOf('office') >= 0) return '<span style="background:#f3e8ff;color:#6b21a8;padding:2px 8px;border-radius:999px;font-size:11px">🏢 ' + _aiEsc(g) + '</span>';
  if (gl.indexOf('head') >= 0) return '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:11px">👑 ' + _aiEsc(g) + '</span>';
  return '<span style="background:#e5e7eb;color:#374151;padding:2px 8px;border-radius:999px;font-size:11px">' + _aiEsc(g) + '</span>';
}
// 🏠/🏢 근무지(재택/오피스) 배지 — group_name 으로 판별
function _tpWorkplaceBadge(group) {
  var gl = (group == null ? '' : String(group)).toLowerCase();
  if (gl.indexOf('home') >= 0) return '<span style="background:#cffafe;color:#0e7490;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">🏠 재택(Home)</span>';
  if (gl.indexOf('office') >= 0 || gl.indexOf('head') >= 0) return '<span style="background:#ffedd5;color:#9a3412;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700">🏢 오피스(Office)</span>';
  return '<span style="color:#9ca3af;font-size:11px">—</span>';
}
// HR 인사평가 헬퍼 (5 카테고리 가중평균)
//   ⚠ 점수 계산은 서버(/api/admin/teacher-hr-analysis)가 **실제 수업기록**으로만 한다.
//     여기 남은 것은 표시용 등급·메달 헬퍼뿐. 점수를 프런트에서 만들어내지 말 것.
//     (2026-07-22 이전에는 강사 id 해시로 만든 가짜 점수를 표시했다 — 되살리지 말 것)
function _hrGrade(score) {
  if (score >= 90) return { label:'A+', color:'#15803d', bg:'#dcfce7' };
  if (score >= 85) return { label:'A',  color:'#16a34a', bg:'#dcfce7' };
  if (score >= 80) return { label:'B+', color:'#1d4ed8', bg:'#dbeafe' };
  if (score >= 75) return { label:'B',  color:'#3b82f6', bg:'#dbeafe' };
  if (score >= 70) return { label:'C+', color:'#d97706', bg:'#fef3c7' };
  if (score >= 65) return { label:'C',  color:'#f59e0b', bg:'#fef3c7' };
  return { label:'D', color:'#dc2626', bg:'#fee2e2' };
}
function _hrRankBadge(rank) {
  const G = String.fromCodePoint(0x1F947); // gold
  const S = String.fromCodePoint(0x1F948); // silver
  const B = String.fromCodePoint(0x1F949); // bronze
  if (rank === 1) return '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:linear-gradient(135deg,#fde047,#ca8a04);border-radius:50%;font-size:13px;box-shadow:0 2px 4px rgba(202,138,4,0.4)">' + G + '</span>';
  if (rank === 2) return '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:linear-gradient(135deg,#e2e8f0,#94a3b8);border-radius:50%;font-size:13px;box-shadow:0 2px 4px rgba(148,163,184,0.4)">' + S + '</span>';
  if (rank === 3) return '<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:linear-gradient(135deg,#fdba74,#c2410c);border-radius:50%;font-size:13px;box-shadow:0 2px 4px rgba(194,65,12,0.4)">' + B + '</span>';
  return '<span style="display:inline-block;color:#6b7280;font-weight:700;font-size:13px">' + rank + '</span>';
}
// 인사평가 분석 모달(adm-hr-analysis.js)이 셀을 채울 때 같은 배지를 쓰도록 노출
window._hrGrade = _hrGrade;
window._hrRankBadge = _hrRankBadge;

// 🏆 강사 인사평가·순위 컬럼 토글 (사용자가 버튼 클릭으로 보기/숨김)
window.toggleHrEval = function() {
  const table = document.getElementById('tp-list-table');
  const btn = document.getElementById('tp-hr-toggle');
  if (!table || !btn) return;
  const hidden = table.classList.toggle('hr-hidden');
  // 버튼 라벨 토글 (한·영 모두 동기화)
  const en = (typeof adminLang !== 'undefined' && adminLang === 'en');
  if (hidden) {
    btn.textContent = en ? (btn.dataset.enShow || '🏆 Show HR Score · Rank') : (btn.dataset.koShow || '🏆 인사평가·순위 표시');
    btn.style.background = 'linear-gradient(135deg,#94a3b8,#64748b)';
  } else {
    btn.textContent = en ? (btn.dataset.enHide || '🙈 Hide HR Score · Rank') : (btn.dataset.koHide || '🙈 인사평가·순위 숨김');
    btn.style.background = 'linear-gradient(135deg,#a855f7,#7c3aed)';
  }
};

// 🎨 강사 목록 액션 버튼 — Win10 이모지 깨짐 방지용 인라인 SVG 아이콘 (어디서나 선명하게 렌더)
//   흰색 stroke, 색상 배경 버튼에 중앙 정렬. window.* 로 노출해 다른 스크립트(adm-q6 📅)도 재사용.
const _TP_ACT_BTN = 'display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;'
  + 'padding:0;margin:0 2px;border:0;border-radius:6px;cursor:pointer;color:#fff;vertical-align:middle;'
  + 'box-shadow:0 1px 2px rgba(0,0,0,.18);transition:filter .12s;';
const _TP_IC = {
  // 수업 입장 (비디오 카메라)
  video: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
  // 상세 보기 (돋보기)
  view: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
  // 수정 (연필)
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  // 제거 (휴지통)
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  // 💬 카카오·문자 전달 (말풍선) — 버튼 바탕이 카카오 노랑(#fee500)이라 선 색만 검정.
  //    다른 아이콘은 stroke="#fff" 인데 이것만 다르다. 노랑 위 흰 선은 안 보인다.
  chat: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#191919" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  // 스케줄 (달력)
  calendar: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  // 삭제 무장(2차 확인 대기) — 경고 삼각형
  confirmDel: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  // 비밀번호 재설정 — 열쇠
  key: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2"/><path d="M17 6l3 3"/></svg>'
};
window._TP_ACT_BTN = _TP_ACT_BTN;
window._TP_IC = _TP_IC;

// 🧠 MBTI 배지 — 강사 목록/상세 공용. 유효한 4글자만 렌더, 없으면 빈 문자열. (E=웜톤/I=쿨톤)
function _tpMbtiBadge(mbti){
  var m = String(mbti||'').toUpperCase().trim();
  if(!/^[IE][NS][TF][JP]$/.test(m)) return '';
  var warm = m.charAt(0)==='E';
  var bg = warm ? 'rgba(192,57,43,.13)' : 'rgba(31,111,178,.13)';
  var fg = warm ? '#c0392b' : '#1f6fb2';
  return '<span title="MBTI ' + m + '" style="display:inline-block;margin-left:5px;padding:1px 6px;border-radius:8px;'
    + 'font-size:10px;font-weight:800;letter-spacing:.5px;background:' + bg + ';color:' + fg + ';vertical-align:middle">' + m + '</span>';
}
window._tpMbtiBadge = _tpMbtiBadge;

// 📥 로스터 대량 임포트 — 붙여넣기 파싱 → dry-run 미리보기 → 적용 (이름 매칭 업서트)
(function(){
  var _lastRows = null;
  function parseRoster(text){
    var lines = String(text||'').replace(/\r/g,'').split('\n').filter(function(l){ return l.trim() !== ''; });
    if (lines.length < 2) return { error: '헤더 줄 + 최소 1개 데이터 줄이 필요합니다.' };
    var delim = lines[0].indexOf('\t') >= 0 ? '\t' : ',';
    var alias = { 'teacher_name':'name','display_name':'name','name':'name','이름':'name',
      'mobile':'phone','mobile_no.':'phone','mobile_no':'phone','휴대폰':'phone','전화':'phone','phone':'phone',
      'email':'email','이메일':'email','kakaotalk':'kakao_id','kakaotalk_id':'kakao_id','kakao':'kakao_id','kakao_id':'kakao_id','카카오톡':'kakao_id','카카오톡_id':'kakao_id',
      'available_days':'available_days','가능_요일':'available_days','요일':'available_days',
      'available_hours':'available_hours','가능_시간':'available_hours','시간':'available_hours',
      'mbti':'mbti','group_name':'group_name','group':'group_name','status':'status','상태':'status',
      'fee_per_10min':'fee_per_10min','active_region':'active_region','level':'notes','notes':'notes','비고':'notes' };
    var header = lines[0].split(delim).map(function(h){ return h.trim().toLowerCase().replace(/\s+/g,'_'); });
    var cols = header.map(function(h){ return alias[h] || h; });
    var rows = [];
    for (var i=1;i<lines.length;i++){
      var parts = lines[i].split(delim), o = {};
      for (var j=0;j<cols.length;j++){ o[cols[j]] = (parts[j]||'').trim(); }
      if ((o.name||o.english_name||o.korean_name||'').trim()) rows.push(o);
    }
    return { rows: rows };
  }
  window.tpImportPreview = async function(){
    var st = document.getElementById('tp-import-status'), res = document.getElementById('tp-import-result');
    var applyBtn = document.getElementById('tp-import-apply');
    var p = parseRoster((document.getElementById('tp-import-text')||{}).value || '');
    if (p.error){ st.textContent = '⚠ ' + p.error; return; }
    if (!p.rows.length){ st.textContent = '⚠ 인식된 행이 없습니다. (헤더에 name 컬럼이 있는지 확인)'; return; }
    st.textContent = '미리보기 요청 중…';
    try{
      var r = await fetch('/api/admin/teacher-profiles/import', { method:'POST', credentials:'include', cache:'no-store', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rows: p.rows, dry_run: true }) });
      var d = await r.json();
      if (!d.ok){ st.textContent = '⚠ ' + (d.message||d.error||'실패'); return; }
      _lastRows = p.rows;
      var s = d.summary;
      st.innerHTML = '미리보기 — 신규 <b style="color:#059669">'+s.created+'</b> · 갱신 <b style="color:#2563eb">'+s.updated+'</b> · 건너뜀 <b style="color:#9ca3af">'+s.skipped+'</b>';
      res.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px">' + d.results.map(function(x){
        var color = x.action==='create'?'#059669':(x.action==='update'?'#2563eb':'#9ca3af');
        var badge = x.action==='create'?'신규':(x.action==='update'?'갱신':(x.action==='skip'?'건너뜀':x.action));
        var detail = (x.fields && x.fields.length) ? x.fields.join(', ') : (x.mbti ? ('MBTI '+x.mbti) : '');
        /* ⚠️ (2026-09-01) 서버가 모르는 상태값을 «그 칸만» 빼고 넣었다면 반드시 화면에 말한다 —
           조용히 버리면 「상태를 적었는데 안 바뀐다」가 되고 아무도 이유를 모른다. */
        var warn = x.status_ignored
          ? '<div style="color:#b45309;font-weight:600">⚠ 상태값 «'+_aiEsc(x.status_ignored)+'» 은(는) 모르는 값이라 반영하지 않았습니다 (활동중 · 비활동 · 퇴사)</div>'
          : '';
        return '<tr><td style="padding:2px 6px;border-bottom:1px solid #f0f0f0"><b>'+_aiEsc(x.name||'—')+'</b></td>'+
               '<td style="padding:2px 6px;border-bottom:1px solid #f0f0f0;color:'+color+';font-weight:700;white-space:nowrap">'+badge+'</td>'+
               '<td style="padding:2px 6px;border-bottom:1px solid #f0f0f0;color:#6b7280">'+_aiEsc(detail)+warn+'</td></tr>';
      }).join('') + '</table>';
      applyBtn.disabled = false;
      applyBtn.style.cssText = 'padding:6px 16px;font-size:12px;background:#059669;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:800';
    }catch(e){ st.textContent = '⚠ ' + e; }
  };
  window.tpImportApply = async function(){
    if (!_lastRows){ return; }
    var st = document.getElementById('tp-import-status'), applyBtn = document.getElementById('tp-import-apply');
    if (!confirm('강사 정보 '+_lastRows.length+'행을 반영할까요?\n(기존 강사는 빈칸이 아닌 값만 갱신됩니다)')) return;
    applyBtn.disabled = true; st.textContent = '반영 중…';
    try{
      var r = await fetch('/api/admin/teacher-profiles/import', { method:'POST', credentials:'include', cache:'no-store', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ rows: _lastRows, dry_run: false }) });
      var d = await r.json();
      if (!d.ok){ st.textContent = '⚠ ' + (d.message||d.error||'실패'); applyBtn.disabled = false; return; }
      var s = d.summary;
      /* ⚠️ 「모르는 상태값이라 반영하지 않았다」는 미리보기에만 있으면 «반영했다» 화면에서 사라진다.
         조용히 버리지 않기로 한 것이니 이쪽에도 남긴다. */
      var ign = (d.results || []).filter(function(x){ return x && x.status_ignored; }).length;
      st.innerHTML = '✅ 완료 — 신규 '+s.created+' · 갱신 '+s.updated+' · 건너뜀 '+s.skipped
        + (ign ? ' <span style="color:#b45309;font-weight:700">· ⚠ 상태값 무시 '+ign+'건 (활동중 · 비활동 · 퇴사 만 저장됩니다)</span>' : '');
      _lastRows = null;
      if (typeof loadTeacherProfiles === 'function') loadTeacherProfiles();
    }catch(e){ st.textContent = '⚠ ' + e; applyBtn.disabled = false; }
  };
})();

/* 🔗 (2026-07-30) 제보 #2-1 — 급여용 teachers 목록을 "강사 계정 연결" 드롭다운에 채운다.
   한 번 불러오면 캐시(같은 관리자 세션 내 재요청 안 함). 이름을 함께 보여줘서
   비슷한 이름끼리 헷갈려 잘못 연결하는 사고를 줄인다. */
var _tpTeacherOptionsLoaded = false;
async function _tpLoadTeacherOptions() {
  if (_tpTeacherOptionsLoaded) return;
  const sel = document.getElementById('tp-linked-teacher');
  if (!sel) return;
  try {
    const r = await fetch('/api/admin/teachers', { credentials: 'include', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    const list = (d && d.ok && d.teachers) ? d.teachers : [];
    sel.innerHTML = '<option value="">— 연결 안 함 —</option>' +
      list.map(function(t){ return '<option value="' + t.id + '">' + _aiEsc(t.name || ('#' + t.id)) + ' (id:' + t.id + ')</option>'; }).join('');
    _tpTeacherOptionsLoaded = true;
  } catch (e) { sel.innerHTML = '<option value="">불러오기 실패</option>'; }
}

/* 🔗 (2026-07-31) 제보 #2-1 후속 — "자동으로 매칭한 뒤 틀린 것만 확인" 요청 반영.
   정확히 일치하는 이름만 서버가 자동 연결하고, 애매한 것만 알려준다. */
window.runTeacherAutoMatch = async function () {
  const btn = document.getElementById('tp-auto-match-btn');
  if (btn) { btn.disabled = true; btn.textContent = '매칭 중…'; }
  try {
    const r = await fetch('/api/admin/teacher-profiles/auto-match', { method: 'POST', credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (!d || !d.ok) { alert('자동 매칭 실패: ' + (d && d.error || r.status)); return; }
    let msg = '✅ 자동 매칭 완료: ' + d.matched_count + '명\n';
    if (d.matched.length) msg += d.matched.map(m => '  · ' + m.profile_name + ' → ' + m.teacher_name).join('\n') + '\n\n';
    if (d.unmatched_count) {
      msg += '⚠️ 확인 필요: ' + d.unmatched_count + '명\n';
      msg += d.unmatched.map(u => '  · ' + u.profile_name + ' (' + u.reason + (u.suggested_teacher ? ', 추천: ' + u.suggested_teacher.name : '') + ')').join('\n');
      msg += '\n\n위 목록은 강사 프로필 편집 화면의 "강사 계정 연결" 드롭다운에서 직접 확인해 주세요.';
    } else {
      msg += '⚠️ 확인 필요한 건 없습니다.';
    }
    alert(msg);
    _tpTeacherOptionsLoaded = false; // 연결 상태가 바뀌었으니 다음 편집 시 드롭다운 재로드
    if (typeof loadTeacherProfiles === 'function') loadTeacherProfiles();
  } catch (e) {
    alert('자동 매칭 중 오류: ' + e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔗 강사 계정 자동 매칭'; }
  }
};

async function loadTeacherProfiles() {
  _tpLoadTeacherOptions();
  const status = document.getElementById('tp-filter-status')?.value || '';
  const group  = document.getElementById('tp-filter-group')?.value || '';
  /* 🌏 (2026-09-01) 구분(필리핀·북미·중국) — 판정이 국적 코드 + 지역 «글자» 를 함께 보므로
     서버가 거른다(SQL 로 옮겨 적으면 정본이 두 벌이 된다). 화면은 고른 값을 그대로 보낸다. */
  const region = document.getElementById('tp-filter-region')?.value || '';
  const params = new URLSearchParams();
  if (region) params.set('region', region);
  /* 🙈 (2026-09-01) 「안보임」은 status 값이 아니라 «다른 축» 이라 다른 파라미터로 보낸다.
     ⛔ 이 값을 status 로 보내면 서버가 모르는 상태값이라 400 을 준다(그게 맞다). */
  if (status === TP_STATUS_HIDDEN_FILTER) params.set('hidden', '1');
  else if (status) params.set('status', status);
  // ⚠️ group(home/office) 필터는 서버가 'home'/'office' 정확매칭이라 'Home-based'/'Office Teacher' 를 못 거름 → 클라이언트에서 부분일치 처리(아래)
  let res;
  try {
    const r = await fetch('/api/admin/teacher-profiles?' + params, { credentials:'include', cache:'no-store' });
    res = await r.json();
  } catch (e) { res = { ok:false, error:String(e) }; }
  const tbody = document.getElementById('tp-list-body');
  const cnt   = document.getElementById('tp-count');
  if (!tbody) return;
  let items = (res && res.ok && res.items) ? res.items : [];
  // 🎭🔐 유효 역할(미리보기 포함) 반영 — 강사=본인 프로필만(계좌·연락처 등 타인 정보 차단), 지사/대리점/학부모/학생=차단.
  const _tpEff = (typeof window._effectiveRole === 'function') ? window._effectiveRole() : null;
  if (_tpEff === 'branch' || _tpEff === 'agency' || _tpEff === 'parent' || _tpEff === 'student') {
    if (cnt) cnt.textContent = '0명';
    tbody.innerHTML = '<tr><td colspan="16" class="empty">열람 권한이 없습니다. (본사 관리자·경영진 전용)</td></tr>';
    return;
  }
  if (_tpEff === 'hq_teacher') {
    const _tpOwn = (typeof window._effectiveOwnName === 'function') ? window._effectiveOwnName() : '';
    items = items.filter(t => window._payrollIsOwnRow(t, { name: _tpOwn }));
  }
  if (group) {
    items = items.filter(function(t){
      var g = ((t.group_name || '') + '').toLowerCase();
      if (group === 'home')   return g.indexOf('home') >= 0;
      if (group === 'office') return g.indexOf('office') >= 0 || g.indexOf('head') >= 0;
      return true;
    });
  }
  // 🔍 강사 찾기 — 이름/전화/이메일/카톡ID 부분일치(대소문자 무시)
  var searchQ = (document.getElementById('tp-search')?.value || '').trim().toLowerCase();
  if (searchQ) {
    items = items.filter(function(t){
      return [t.korean_name, t.english_name, t.phone, t.email, t.kakao_id]
        .some(function(v){ return v && String(v).toLowerCase().indexOf(searchQ) >= 0; });
    });
  }
  if (cnt) cnt.textContent = items.length + '명';
  /* 🔴 (2026-09-01) 명부와 원부가 어긋나면 화면이 말한다.
       발단: 사장님 「Mariane 은 퇴사했는데 왜 아직 명부에 있나」. 재직 여부가 두 곳에 있다 —
         · teacher_profiles.status … 이 명부
         · teachers.active        … 스케줄·배정·카페24 미러
       같은 날 양쪽 방향으로 다 어긋났다(원부만 내린 것 2명 · 명부만 내린 것 2명).
       이제 저장할 때 서버가 함께 맞추지만, 그건 «앞으로» 만 막는다 — 이미 어긋나 있는 것과
       다른 경로(야간 동기화 등)로 또 생기는 것은 이 줄이 잡는다.
     ⛔ 화면이 자동으로 고치지 않는다 — 어느 쪽이 맞는지는 사람이 안다. 말해 주기만 한다. */
  try { _tpRenderRosterMismatch(res); } catch (e) {}
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="16" class="empty">강사 데이터 없음 — 위에서 신규 등록</td></tr>';
    return;
  }
  // 🚀 행 데이터 캐시 — 목록이 SELECT * 라 모든 필드 보유. 상세/수정 버튼이 재요청 없이 즉시 열도록.
  window._tpRowById = {};
  items.forEach(t => { if (t && t.id != null) window._tpRowById[t.id] = t; });

  // 인사평가 점수·순위는 서버가 실제 수업기록으로 계산 → 표를 먼저 그리고 비동기로 채운다
  //   (셀 id: hrv-<강사id> = 점수, hrr-<강사id> = 순위 / 채우는 쪽은 adm-hr-analysis.js)

  tbody.innerHTML = items.map(t => {
    const imgInner = t.image_url
      ? '<img src="' + _aiEsc(t.image_url) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover;display:block" onerror="this.style.display=\'none\'" />'
      : '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold">' + (t.korean_name||'?').charAt(0) + '</div>';
    // 📷 사진 클릭 → 즉시 업로드 (호버 시 카메라 오버레이 표시)
    const img = '<span onclick="uploadTeacherPhotoInline(' + t.id + ',this)" title="클릭하여 사진 업로드/변경" ' +
      'style="position:relative;display:inline-block;cursor:pointer;border-radius:50%;overflow:hidden;line-height:0" ' +
      'onmouseover="var o=this.querySelector(\'.tp-photo-ov\');if(o)o.style.opacity=\'1\'" ' +
      'onmouseout="var o=this.querySelector(\'.tp-photo-ov\');if(o)o.style.opacity=\'0\'">' +
        imgInner +
        '<span class="tp-photo-ov" style="position:absolute;inset:0;background:rgba(0,0,0,.5);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;opacity:0;transition:opacity .12s;pointer-events:none">📷</span>' +
      '</span>';
    const fee = t.fee_per_10min ? Number(t.fee_per_10min).toLocaleString('ko-KR') : '—';
    const join = t.join_date || '—';
    // 💬 (2026-08-13) 연락처와 카카오ID 를 갈라 놓는다. 전엔 `t.phone || t.kakao_id` 라
    //    전화번호가 있는 강사는 카카오ID 가 화면 어디에도 안 나왔다(있는데 없는 것처럼 보임).
    const phone = t.phone || '—';
    const kakaoCell = t.kakao_id
      ? '<span style="font-family:MangoiHanSC,ui-monospace,monospace;font-size:11px">' + _aiEsc(t.kakao_id) + '</span>' +
        // 값을 onclick 문자열에 끼워 넣지 않는다 — 카카오ID 에 따옴표·역슬래시가 섞이면
        // 따옴표 이스케이프가 두 겹(HTML+JS)이라 조용히 깨진다. 옆 <span> 의 글자를 그대로 읽는다.
        '<button type="button" onclick="window.tkCopy && window.tkCopy(this.previousElementSibling.textContent,this)" ' +
        'title="카카오ID 복사" aria-label="카카오ID 복사" ' +
        'style="margin-left:5px;padding:0 5px;font-size:10px;line-height:17px;border:1px solid #e5e7eb;border-radius:4px;background:#fff;cursor:pointer">📋</button>'
      : '<span style="color:#9ca3af">—</span>';
    /* 🚪 퇴사·비활동이면 «수업입장·수업관찰» 을 흐리게 한다(2026-09-02 사장님 지시).
       판정은 서버 정본 isActiveTeacherStatus 와 같은 규칙인 _tpIsWorking 하나로 한다 —
       여기서 `t.status === '퇴사'` 처럼 다시 적으면 «비활동» 이 빠지거나 NULL 처리가 어긋난다. */
    const _tpWorking = _tpIsWorking(t.status);
    const _tpDimCls  = _tpWorking ? '' : ' tp-act--dim';
    const _tpDimWhy  = _tpWorking ? ''
      : (window.adminLang === 'en'
          ? '\n\n(This teacher is ' + (String(t.status || '').trim() === '퇴사' ? 'resigned' : 'inactive') + ' — no class to join or observe.)'
          : '\n\n(' + _aiEsc(String(t.status || '').trim()) + ' 강사입니다 — 들어갈 수업이 없습니다.)');
    return '<tr data-tid="' + t.id + '" data-hidden="' + (Number(t.list_hidden||0) === 1 ? '1' : '0') + '"'
      + ' data-working="' + (_tpWorking ? '1' : '0') + '">' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center">' + img + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb"><b>' + _aiEsc(t.korean_name||'') + '</b>' + _tpMbtiBadge(t.mbti) +
        (t.english_name ? '<br><span style="font-size:11px;color:#6b7280">' + _aiEsc(t.english_name) + '</span>' : '') +
        /* ⚠️ (2026-09-01) 계정 연결이 두 개 이상 — 전에는 조인이 행을 늘려 «같은 강사가 두 줄» 로
           보였다(사장님 「왜 Len 이 두 명이나 있지?」). 지금은 한 줄로 그리되, 그 사실을 감추지
           않는다 — 감추면 아무도 정리하지 않는다. 대개 대소문자만 다른 계정이 두 벌 생긴 것이다. */
        (Number(t.login_link_count || 0) > 1 ? _tpLinkDupChip(t) : '') + '</td>' +
      /* 🟢⏸️🚪 상태 — 누르면 그 자리에서 바꾼다(아래 «상태를 명부에서 그 자리에 바꾸기» 절) */
      '<td id="tpstc-' + t.id + '" style="padding:6px;border:1px solid #e5e7eb;text-align:center">' + _tpStatusCell(t) + '</td>' +
      /* 🟢 «지금» — 이 강사가 지금 수업 중인가. 표를 그린 뒤 tpLoadLiveNow() 가 비동기로 채운다
         (인사평가 점수와 같은 방식). 여기서 값을 그리지 않는 이유: 목록 API 에 그 정보가 없다. */
      '<td class="tp-now-col" id="tpnow-' + t.id + '" style="padding:6px;border:1px solid #e5e7eb;text-align:center;white-space:nowrap"><span style="color:#d1d5db">…</span></td>' +
      /* 🌏 구분 — 값은 서버가 판정해 t.region 으로 내려준다(여기서 다시 판정하지 않는다) */
      '<td id="tprgc-' + t.id + '" style="padding:6px;border:1px solid #e5e7eb;text-align:center">' + _tpRegionCell(t) + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center">' + (_tpGroupBadge(t.group_name)) + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center">' + (_tpWorkplaceBadge(t.group_name)) + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb">' + _aiEsc(t.active_region||'—') + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:right">' + fee + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb">' + _aiEsc(phone) + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;white-space:nowrap">' + kakaoCell + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb">' + join + '</td>' +
      // 📊 인사평가 — 클릭하면 "왜 이 점수인가" 분석 모달 (점수는 서버가 채움)
      '<td class="hr-eval-col" id="hrv-' + t.id + '" style="padding:6px;border:1px solid #e5e7eb;text-align:center;cursor:pointer" ' +
        'onclick="window.openHrAnalysis && window.openHrAnalysis(' + t.id + ')" ' +
        'title="클릭 — 이 점수가 나온 근거 보기">' +
        '<span style="color:#9ca3af;font-size:12px">…</span>' +
      '</td>' +
      '<td class="hr-eval-col" id="hrr-' + t.id + '" style="padding:6px;border:1px solid #e5e7eb;text-align:center"><span style="color:#d1d5db">·</span></td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center;white-space:nowrap">' +
        (t.intro_video_url
          ? '<button onclick="viewTeacherVideo(\'' + encodeURIComponent(t.intro_video_url) + '\',\'' + _aiEsc(t.korean_name||'') + '\')" title="소개 영상 보기" style="padding:3px 11px;font-size:11px;background:#7c3aed;color:#fff;border:0;border-radius:5px;cursor:pointer;font-weight:700">▶ 영상</button>'
          : '<span style="color:#9ca3af;font-size:11px">—</span>') +
      '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center;white-space:nowrap">' +
        /* 🚪 (2026-09-02 사장님 지시) 퇴사·비활동 강사에게는 «수업입장»·«수업관찰» 이 할 일이 없다.
           사장님 「퇴사시켰는데 왜 파란 불이 그대로 켜져 있나」 — 실측상 세 상태 행의 버튼이 전부 같은 색이라
           퇴사 처리를 해도 그 줄에서 달라지는 것이 하나도 없었다.
           ⛔ 버튼을 «없애지» 않는다 — 지난 수업 확인이 걸려 있고, 이 저장소는 「감추면 아무도 정리하지 않는다」를
              반복해서 밟았다. 흐리게 하고 «왜» 를 툴팁에 적는다.
           ⛔ disabled 로 만들지도 않는다 — 「보이는데 안 눌린다」가 되면 그것대로 고장으로 읽힌다.
              눌리면 기존 안내(「지금 진행 중인 수업이 없습니다」)가 사실대로 답한다. */
        '<button class="tp-act-btn tp-act--video' + _tpDimCls + '" onclick="window.open(\'/?room=mangoi-class\',\'_blank\')" title="수업 입장 — 학생들과 같은 공용 수업방으로 들어갑니다 (이 링크를 강사에게 주세요)' + _tpDimWhy + '" style="' + _TP_ACT_BTN + '" aria-label="수업 입장">' + _TP_IC.video + '</button>' +
        // 💬 (2026-08-13) 이 강사에게 바로 메시지 — 카카오톡(원클릭 붙여넣기) + 문자(자동발송)
        '<button class="tp-act-btn tp-act--kakao" onclick="window.tkOpenSend && window.tkOpenSend(' + t.id + ')" title="카카오·문자로 메시지 보내기" data-en-title="Message by KakaoTalk / SMS" style="' + _TP_ACT_BTN + 'background:#fee500;color:#191919" aria-label="카카오·문자 전달">' + _TP_IC.chat + '</button>' +
        /* 👁 (2026-08-30 v4 제안서 09) 수업관찰 «즉시 입장» — 이 강사의 지금 수업으로 바로 들어간다.
           ⚠️ 학생·강사에게 보이지 않는 «참관» 이다. 실제 참가자로 들어가는 🎥 버튼과 색을 갈라 둔다. */
        '<button class="tp-act-btn tp-act--ghost' + _tpDimCls + '" id="tpobs-' + t.id + '" onclick="window.tpGhostObserve && window.tpGhostObserve(' + t.id + ')" title="수업관찰 — 이 강사의 진행 중인 수업을 몰래 봅니다 (참여자 목록에 안 뜹니다)' + _tpDimWhy + '" data-en-title="Observe this teacher\'s live class (hidden from the participant list)" style="' + _TP_ACT_BTN + '" aria-label="수업관찰">👁</button>' +
        '<button class="tp-act-btn tp-act--view" onclick="viewTeacherProfile(' + t.id + ')" title="상세 보기" style="' + _TP_ACT_BTN + '" aria-label="상세 보기">' + _TP_IC.view + '</button>' +
        '<button class="tp-act-btn tp-act--edit" onclick="editTeacherProfile(' + t.id + ')" title="수정" style="' + _TP_ACT_BTN + '" aria-label="수정">' + _TP_IC.edit + '</button>' +
        // 🔑 비밀번호 재설정 — 강사가 비번을 잊으면 아무도 풀어줄 수 없던 문제(2026-07-23).
        //   경영진·본사 관리자에게만 보인다. 서버(staff-password-reset)에서 한 번 더 막는다.
        (_tpCanResetPw()
          ? '<button class="tp-act-btn tp-act--pw" onclick="openTeacherPwReset(\'' + _aiEsc(t.korean_name || t.english_name || '') + '\',\'' + _aiEsc(t.login_username || '') + '\')" title="비밀번호 재설정" data-en-title="Reset password" style="' + _TP_ACT_BTN + '" aria-label="비밀번호 재설정">' + _TP_IC.key + '</button>'
          : '') +
        '<button class="tp-act-btn tp-act--del" onclick="removeTeacherProfile(' + t.id + ',\'' + _aiEsc(t.korean_name||'') + '\', this)" title="제거" style="' + _TP_ACT_BTN + '" aria-label="제거">' + _TP_IC.trash + '</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  // 📊 인사평가 점수·순위 채우기 — 실제 수업기록 기반. 표 렌더를 막지 않도록 비동기.
  if (typeof window.hrFillTeacherScores === 'function') window.hrFillTeacherScores();
  // 🟢 «지금 수업 중» 신호등 채우기 — 아래 _TP_LIVE 절. 마찬가지로 표 렌더를 막지 않는다.
  if (typeof window.tpLoadLiveNow === 'function') window.tpLoadLiveNow();
}


/* 🟢 «지금 수업 중» 신호등 — 강사 명부 (2026-08-31, 사장님 「하나하나 눌러볼 수 없고 바로 전체에서」)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 아래 tpGhostObserve(👁)는 «누른 뒤에야» 그 강사의 수업을 찾는다. 그래서 수업 중인
      강사를 고르려면 「눌러본다 → 없다 → 확인 → 다음 강사」를 강사 수만큼 반복해야 했다.
      표에 미리 그려 두면 클릭이 0번이 된다. 전체 현황을 한 표로 보는 화면은 따로 있다
      (🗼 /admin/monitor-wall.html) — 이건 «명부에서 고르는 사람» 을 위한 것이다.
   [무엇을 근거로] 두 가지를 겹쳐 본다. 둘은 서로 다른 사실이라 갈라서 표시한다.
      · /api/admin/classes/today  → 예약. `join_open` = «지금 들어갈 수 있는 시간대»
        (시작 10분 전 ~ 종료 15분 후). ⚠️ 이것은 «실제로 접속해 있다» 가 아니다.
      · /api/active-rooms         → 망고아이 화상방에 «실제로» 붙어 있는 방 목록.
      🟢 수업 중   = 예약 + 그 방이 실제로 열려 있음  → 참관하면 사람이 있다
      🟡 수업 시간 = 예약은 지금인데 방에 아직 아무도 없음 → 참관은 되지만 빈 방일 수 있다
      ⚪ 카페24    = 카페24에서 도는 수업(`c24-*`). 망고아이 방이 없어 **참관 불가**가 정상.
                     ⛔ 이걸 안 갈라 놓으면 「배지는 있는데 눌러도 안 되는 버튼」이 다시 생긴다.
   ⚠️ 강사↔수업 잇기는 **이름 완전일치** 뿐이다. 강사 번호는 세 벌(카페24 9~196 · 원부 1~29 ·
      프로필 4~37)이고 겹치는 자리에서 서로 다른 사람이라, 번호로 이으면 조용히 남의 수업이
      «수업 중» 으로 뜬다(CLAUDE.md 2장). 못 찾으면 «—» 로 둔다 — 추측하지 않는다.
   ⚠️ 색은 인라인 `!important` 로 준다 — admin-inline-c.css 가 카드 안 글자를
      `#101828 !important` 로 통째로 덮어서, 그냥 쓰면 초록·주황이 조용히 죽는다.
   ⛔ 👁 버튼에 data-ko/data-en 을 달지 말 것 — i18n 엔진이 textContent 를 통째로 갈아끼워
      34px 짜리 아이콘 버튼에 문장이 들어앉는다. 설명은 data-ko-title/data-en-title 로만. */
var _TP_LIVE = { byName: {}, ts: 0, off: false, loaded: false };
var _TP_LIVE_RANK = { c24: 1, open: 2, live: 3 };

/* 이름 정규화 — 소문자 + 앞의 「teacher 」 떼기. classes/today 의 teacher_name 과
   teacher_profiles 의 korean_name/english_name 을 같은 자로 재려는 것뿐이다. */
function _tpNormName(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/^teacher\s+/, '');
}

window.tpLiveOnly = false;

/* 지금 수업 현황을 한 번에 읽어 온다. 강사 수만큼 부르지 않는다(표당 1회). */
/* 🔎 명부 ↔ 원부 어긋남 알림 — 목록 조회가 함께 준 숫자를 한 줄로 그린다.
   ⚠️ 최상위 선언이다. 다른 함수 «안» 에 넣으면 그 밖의 호출부가 전부 ReferenceError 인데
      문자열 검사는 「선언도 있고 호출도 있다」로 통과한다(CLAUDE.md 2장). */
function _tpRenderRosterMismatch(res) {
  var host = document.getElementById('tp-list-body');
  if (!host || !host.parentNode) return;
  var box = document.getElementById('tp-roster-mismatch');
  var bad = (res && Array.isArray(res.roster_mismatch)) ? res.roster_mismatch : [];
  var broken = (res && Array.isArray(res.roster_broken_link)) ? res.roster_broken_link : [];
  var en = (typeof window.adminLang !== 'undefined' && window.adminLang === 'en');
  if (!bad.length && !broken.length) { if (box) box.remove(); return; }
  if (!box) {
    box = document.createElement('div');
    box.id = 'tp-roster-mismatch';
    box.style.cssText = 'margin:8px 0;padding:10px 12px;border:1px solid #fca5a5;'
      + 'background-color:#fef2f2;border-radius:8px;font-size:12px;line-height:1.6;color:#7f1d1d';
    var tbl = host.closest ? host.closest('table') : null;
    var anchor = tbl && tbl.parentNode ? tbl : host.parentNode;
    anchor.parentNode.insertBefore(box, anchor);
  }
  var lines = [];
  if (bad.length) {
    lines.push('<b>' + (en ? '⚠️ Roster mismatch: ' : '⚠️ 명부와 원부가 다릅니다: ')
      + bad.length + (en ? '' : '명') + '</b>');
    lines.push(bad.map(function (x) {
      var side = (String(x.status || '') === '활동중')
        ? (en ? 'listed active, roster resigned' : '명부 활동중 · 원부 퇴사')
        : (en ? 'listed ' + (x.status || '-') + ', roster active' : '명부 ' + (x.status || '-') + ' · 원부 재직');
      return '· ' + (x.name || ('#' + x.id)) + ' (' + side + ')';
    }).join('<br>'));
    lines.push(en
      ? 'Open the profile and save the status again — the roster is updated together.'
      : '해당 강사를 열어 상태를 다시 저장하면 원부까지 함께 맞춰집니다.');
  }
  if (broken.length) {
    lines.push('<b>' + (en ? '⚠️ Broken roster link: ' : '⚠️ 원부 연결이 끊어졌습니다: ')
      + broken.length + (en ? '' : '건') + '</b> '
      + broken.map(function (x) { return (x.name || ('#' + x.id)); }).join(', '));
  }
  box.innerHTML = lines.join('<br>');
}

window.tpLoadLiveNow = async function () {
  if (_TP_LIVE.off) { _tpPaintLive(); return; }
  var cr = null, ar = null;
  try {
    var rs = await Promise.all([
      fetch('/api/admin/classes/today', { credentials: 'include', cache: 'no-store' }).catch(function () { return null; }),
      fetch('/api/active-rooms', { credentials: 'include', cache: 'no-store' }).catch(function () { return null; })
    ]);
    cr = rs[0]; ar = rs[1];
  } catch (e) { return; }

  /* 강사·지사 계정은 이 API 를 못 본다(403). 그때는 «모른다» 고 말하고 다시 묻지 않는다 —
     조용히 «수업 없음» 으로 그리면 그것이 거짓말이 된다. */
  if (cr && cr.status === 403) { _TP_LIVE.off = true; _TP_LIVE.loaded = true; _tpPaintLive(); return; }

  var cd = null;
  try { cd = cr ? await cr.json() : null; } catch (e) { cd = null; }
  /* ✅ «성공이라고 말했는가» 로 판정한다 — 종단 404 본문에는 ok 칸이 아예 없어서
     `cd.ok === false` 로만 거르면 그냥 통과하고 «오늘은 수업이 없나 보다» 로 읽힌다
     (CLAUDE.md 2장). 실패하면 **직전 값을 그대로 둔다** — 지우면 멀쩡한 수업이 사라진다. */
  if (!cr || !cr.ok || !cd || cd.ok !== true || !Array.isArray(cd.sessions)) { _tpPaintLive(); return; }

  var liveRooms = {};
  try {
    var ad = ar ? await ar.json() : null;
    (Array.isArray(ad) ? ad : []).forEach(function (r) {
      if (r && r.roomId != null) liveRooms[String(r.roomId)] = true;
    });
  } catch (e) { /* 방 목록만 실패하면 🟡 로 떨어진다 — 예약 정보는 살아 있다 */ }

  var byName = {};
  cd.sessions.forEach(function (s) {
    if (!s || !s.room_id || !s.join_open) return;         // 지금 들어갈 수 있는 수업만
    var nm = _tpNormName(s.teacher_name);
    if (!nm) return;                                       // 이름을 모르면 아무에게도 안 붙인다
    var st = /^c24-/.test(String(s.room_id)) ? 'c24'
           : (liveRooms[String(s.room_id)] ? 'live' : 'open');
    var cur = byName[nm];
    if (!cur) cur = byName[nm] = { state: st, room_id: s.room_id, start: s.start_time || '', student: s.student_name || '', n: 0 };
    cur.n++;
    if (_TP_LIVE_RANK[st] > _TP_LIVE_RANK[cur.state]) {    // 여러 건이면 «더 확실한 쪽» 을 보여준다
      cur.state = st; cur.room_id = s.room_id; cur.start = s.start_time || ''; cur.student = s.student_name || '';
    }
  });

  _TP_LIVE.byName = byName; _TP_LIVE.ts = Date.now(); _TP_LIVE.loaded = true;
  _tpPaintLive();
};

/* 표를 «다시 그리지 않고» 칸만 칠한다 — 45초마다 행을 갈아치우면 조준한 버튼이 움직인다. */
function _tpPaintLive() {
  var _L = (typeof adminLang !== 'undefined' && adminLang === 'en');
  var T = function (ko, en) { return _L ? en : ko; };
  var rows = document.querySelectorAll('#tp-list-body tr[data-tid]');
  var n = { live: 0, open: 0, c24: 0 };

  for (var i = 0; i < rows.length; i++) {
    var tr = rows[i];
    var tid = tr.getAttribute('data-tid');
    var t = (window._tpRowById || {})[tid] || {};
    var hit = null;
    if (!_TP_LIVE.off) {
      var names = [t.korean_name, t.english_name].map(_tpNormName).filter(Boolean);
      for (var j = 0; j < names.length && !hit; j++) hit = _TP_LIVE.byName[names[j]] || null;
    }
    if (hit) n[hit.state]++;

    var cell = document.getElementById('tpnow-' + tid);
    if (cell) {
      if (_TP_LIVE.off) {
        cell.innerHTML = '<span style="color:#9ca3af">—</span>';
      } else if (!_TP_LIVE.loaded) {
        cell.innerHTML = '<span style="color:#d1d5db">…</span>';
      } else if (!hit) {
        cell.innerHTML = '<span style="color:#9ca3af">—</span>';
      } else {
        var look = hit.state === 'live' ? { ko: '🟢 수업 중', en: '🟢 In class', c: '#16a34a' }
                 : hit.state === 'open' ? { ko: '🟡 수업 시간', en: '🟡 Class window', c: '#b45309' }
                 : { ko: '⚪ 카페24', en: '⚪ cafe24', c: '#6b7280' };
        var sub = [hit.start, hit.student].filter(Boolean).join(' · ')
                + (hit.n > 1 ? ' ' + T('외 ' + (hit.n - 1) + '건', '+' + (hit.n - 1)) : '');
        cell.innerHTML =
          '<span data-ko="' + look.ko + '" data-en="' + look.en + '" '
          + 'style="font-size:11.5px;font-weight:800;color:' + look.c + ' !important">'
          + (_L ? look.en : look.ko) + '</span>'
          + (sub ? '<div style="font-size:10.5px;color:#9ca3af !important">' + _aiEsc(sub) + '</div>' : '');
      }
    }

    /* 👁 버튼 — 참관할 «방» 이 있을 때만 진하게. 카페24 수업은 방이 없어 눌러도 못 들어간다. */
    var btn = document.getElementById('tpobs-' + tid);
    if (btn) {
      var can = !!hit && (hit.state === 'live' || hit.state === 'open');
      var dim = _TP_LIVE.loaded && !_TP_LIVE.off && !can;
      btn.disabled = dim;
      btn.style.opacity = dim ? '0.32' : '1';
      btn.style.cursor = dim ? 'not-allowed' : 'pointer';
      /* 🚪 (2026-09-02) 퇴사·비활동 강사는 «오늘 수업이 없다» 가 아니라 «앞으로도 없다» 이다.
         두 가지를 같은 문구로 말하면 사장님이 「오늘만 없는 건가?」로 읽는다.
         ⚠️ 이 함수는 행을 다시 그린 «뒤» 에 돌아 title 을 덮어쓴다 — 그래서 여기서도
            같은 사유를 다시 적어야 한다(안 그러면 그리는 쪽에서 붙인 설명이 조용히 사라진다). */
      var _notWorking = tr && tr.dataset && tr.dataset.working === '0';
      var tipKo = _notWorking ? '퇴사·비활동 강사입니다 — 들어갈 수업이 없습니다'
                : !_TP_LIVE.loaded || _TP_LIVE.off ? '수업관찰 — 이 강사의 진행 중인 수업을 몰래 봅니다 (참여자 목록에 안 뜹니다)'
                : can ? '수업관찰 — 지금 하고 있는 수업으로 바로 들어갑니다 (참여자 목록에 안 뜹니다)'
                : hit ? '카페24에서 도는 수업이라 참관할 망고아이 화상방이 없습니다'
                      : '지금 진행 중인 수업이 없습니다';
      var tipEn = _notWorking ? 'This teacher has resigned or is inactive — no class to observe'
                : !_TP_LIVE.loaded || _TP_LIVE.off ? 'Observe this teacher’s live class (hidden from the participant list)'
                : can ? 'Observe the class this teacher is running right now (hidden from the participant list)'
                : hit ? 'This class runs on cafe24, so there is no Mango-i room to observe'
                      : 'No class is in progress right now';
      btn.setAttribute('data-ko-title', tipKo);
      btn.setAttribute('data-en-title', tipEn);
      btn.title = _L ? tipEn : tipKo;
    }

    /* 🔎 «수업 중만 보기» — 참관 불가한 카페24 수업도 남긴다(빼면 «한가하다» 로 읽힌다). */
    tr.style.display = (window.tpLiveOnly && !hit) ? 'none' : '';
  }

  _tpPaintLiveSummary(n, _L);
  _tpPaintLiveToggle(n, _L);
}

function _tpPaintLiveSummary(n, _L) {
  var box = document.getElementById('tp-live-summary');
  if (!box) return;
  var T = function (ko, en) { return _L ? en : ko; };
  if (_TP_LIVE.off) {
    var offKo = 'ℹ️ 이 계정에서는 수업 현황을 볼 수 없습니다';
    var offEn = 'ℹ️ Live class status is not available for this account';
    box.setAttribute('data-ko', offKo); box.setAttribute('data-en', offEn);
    box.textContent = _L ? offEn : offKo;
    return;
  }
  if (!_TP_LIVE.loaded) { box.textContent = T('수업 현황 확인 중…', 'Checking live classes…'); return; }
  var ko = '🟢 수업 중 ' + n.live + ' · 🟡 수업 시간 ' + n.open + (n.c24 ? ' · ⚪ 카페24 ' + n.c24 + ' (참관 불가)' : '');
  var en = '🟢 In class ' + n.live + ' · 🟡 Class window ' + n.open + (n.c24 ? ' · ⚪ cafe24 ' + n.c24 + ' (not observable)' : '');
  /* JS 로 그린 글자는 🌐 를 눌러도 안 따라온다 — 그릴 때 data-ko/data-en 을 함께 박는다 */
  box.setAttribute('data-ko', ko); box.setAttribute('data-en', en);
  box.textContent = _L ? en : ko;
}

function _tpPaintLiveToggle(n, _L) {
  var btn = document.getElementById('tp-live-only');
  if (!btn) return;
  var cnt = n.live + n.open + n.c24;
  var ko = window.tpLiveOnly ? '↩︎ 전체 강사 보기' : '🟢 수업 중만 보기' + (_TP_LIVE.loaded && !_TP_LIVE.off ? ' (' + cnt + ')' : '');
  var en = window.tpLiveOnly ? '↩︎ Show all teachers' : '🟢 In-class only' + (_TP_LIVE.loaded && !_TP_LIVE.off ? ' (' + cnt + ')' : '');
  btn.setAttribute('data-ko', ko); btn.setAttribute('data-en', en);
  btn.textContent = _L ? en : ko;
  btn.disabled = _TP_LIVE.off;
  btn.style.opacity = _TP_LIVE.off ? '0.4' : '1';
  btn.style.backgroundColor = window.tpLiveOnly ? '#dcfce7' : '#ffffff';
}

window.tpToggleLiveOnly = function () {
  if (_TP_LIVE.off) return;
  window.tpLiveOnly = !window.tpLiveOnly;
  _tpPaintLive();
};

/* ⏱ 45초마다 다시 읽는다. 카드가 닫혀 있거나 탭이 뒤에 있으면 부르지 않는다.
   ⛔ MutationObserver 로 표를 지켜보지 말 것 — 홈 전체를 멎게 한 전력이 있다(CLAUDE.md 2장). */
function _tpLiveTick() {
  if (_TP_LIVE.off || document.hidden) return;
  var card = document.getElementById('card-teacher-mgmt');
  if (!card || !card.open) return;
  if (window.__tpNowHover) return;                       // 마우스가 표 위면 건드리지 않는다
  if (!document.querySelector('#tp-list-body tr[data-tid]')) return;
  window.tpLoadLiveNow();
}
if (!window.__tpLiveTimer) window.__tpLiveTimer = setInterval(_tpLiveTick, 45000);

/* 🌐 언어 전환 — 관리자 화면의 이 이벤트는 «document» 에서 발행되고 bubbles:false 라
   window 로 올라가지 않는다. 화면마다 발행처가 달라 둘 다 듣는다(CLAUDE.md 2장). */
if (!window.__tpLiveLangBound) {
  window.__tpLiveLangBound = 1;
  document.addEventListener('mangoi:lang-changed', function () { _tpPaintLive(); });
  window.addEventListener('mangoi:lang-changed', function () { _tpPaintLive(); });
  document.addEventListener('DOMContentLoaded', function () {
    var tbl = document.getElementById('tp-list-table');
    if (!tbl || tbl.__tpNowHoverBound) return;
    tbl.__tpNowHoverBound = 1;
    tbl.addEventListener('pointerenter', function () { window.__tpNowHover = true; });
    tbl.addEventListener('pointerleave', function () { window.__tpNowHover = false; });
  });
}

/* 👁 수업관찰 (Ghost Mode) — 강사 목록 액션 열 (2026-08-30, v4 제안서 09)
   ═══════════════════════════════════════════════════════════════════════════
   [무엇] 이 강사가 «지금» 하고 있는 수업을 찾아 참관으로 바로 연다.
     참관은 `/?observe=<방번호>` 뿐이다 — 서버(video-call-room.ts handleJoinObserve)가
     참여자 목록·인원수·입퇴장 어디에도 넣지 않는 «투명» 접속이고, 화면 쪽은
     js/vc-observe-guard.js 가 마이크·카메라·화면공유를 함수째 잠근다.
   ⛔ `/?vc_autojoin=1` 로 열지 말 것 — 그건 «실제 참가자» 라 학생에게 보인다
      (adm-today-classes.js 의 🚪 입장 버튼이 그쪽이다. 둘을 섞으면 몰래 보려던 것이 드러난다).
   ⛔ `/admin/ghost-view.html` 로 보내지 않는다 — 그 화면에는 «영상이 오지 않는다»
      (CLAUDE.md 2장). 「수업 관찰을 눌렀는데 아무것도 안 뜬다」의 정체가 그것이다.
   ⚠️ 강사↔수업 매칭은 **이름 완전일치** 로만 한다. 강사 번호는 세 벌(카페24·원부·프로필)이고
      겹치는 자리에서 서로 다른 사람이라 번호로 이으면 조용히 남의 수업을 연다(CLAUDE.md 2장).
      후보가 둘 이상이면 고르게 하고, 못 찾으면 «없다» 고 말한다 — 아무 방이나 열지 않는다.
   ⚠️ 동시 참관은 서버가 4명까지만 받는다(정본 video-call-room.ts 의 OBSERVER_MAX). 자리가 없으면 그쪽에서 거절한다. */
window.tpGhostObserve = async function (teacherId) {
  const _L = (typeof adminLang !== 'undefined' && adminLang === 'en');
  const T = (ko, en) => (_L ? en : ko);
  const t = (window._tpRowById || {})[teacherId] || {};
  const names = [t.korean_name, t.english_name].filter(Boolean).map(function (n) {
    return String(n).trim().toLowerCase().replace(/^teacher\s+/, '');
  });
  if (!names.length) { alert(T('이 강사의 이름을 알 수 없어 수업을 찾을 수 없습니다.', 'This teacher has no name on file, so the class cannot be found.')); return; }

  let rows = [];
  try {
    const r = await fetch('/api/admin/classes/today', { credentials: 'include', cache: 'no-store' });
    const d = await r.json().catch(() => null);
    /* ✅ «성공이라고 말했는가» 로 판정한다 — 종단 404 본문에는 ok 칸이 아예 없어서
       `d.ok === false` 로만 거르면 그냥 통과하고 «오늘은 수업이 없나 보다» 로 읽힌다
       (CLAUDE.md 2장 「404 는 「Not Found」로 안 보일 수 있습니다」). */
    if (!r.ok || !d || d.ok !== true || !Array.isArray(d.sessions)) {
      alert(T('수업 목록을 불러오지 못했습니다. 다시 로그인한 뒤 시도해 주세요.',
              'Could not load today\'s classes. Please sign in again and retry.'));
      return;
    }
    rows = d.sessions;
  } catch (e) {
    alert(T('네트워크 오류입니다.', 'Network error.'));
    return;
  }

  const mine = rows.filter(function (s) {
    if (!s || !s.room_id || !s.join_open) return false;      // 지금 들어갈 수 있는 수업만
    if (/^c24-/.test(String(s.room_id))) return false;        // 카페24 수업엔 망고아이 방이 없다
    const tn = String(s.teacher_name || '').trim().toLowerCase().replace(/^teacher\s+/, '');
    return !!tn && names.indexOf(tn) >= 0;                    // ⛔ 부분일치 금지
  });

  if (!mine.length) {
    alert(T('지금 진행 중인 수업이 없습니다.\n(수업이 시작되면 이 버튼으로 바로 관찰할 수 있습니다.)',
            'No class is in progress right now.\n(Once a class starts, this button takes you straight in.)'));
    return;
  }
  let room = mine[0].room_id;
  if (mine.length > 1) {
    const list = mine.map(function (s, i) { return (i + 1) + ') ' + (s.start_time || '') + ' ' + (s.student_name || ''); }).join('\n');
    const pick = prompt(T('수업이 여러 건입니다. 번호를 고르세요:\n', 'Several classes. Pick a number:\n') + list, '1');
    const idx = parseInt(pick, 10);
    if (!idx || idx < 1 || idx > mine.length) return;
    room = mine[idx - 1].room_id;
  }

  const url = location.origin + '/?observe=' + encodeURIComponent(room);
  /* 팝업이 막히면 조용히 실패한다(window.open 은 예외 없이 null 만 준다 — CLAUDE.md 2장) */
  if (window.mangoiOpenTab) window.mangoiOpenTab(url, T('수업관찰', 'Observe'));
  else { let _w = null; try { _w = window.open(url, '_blank'); } catch (e) {} 
         if (_w) { try { _w.opener = null; } catch (e) {} } else location.href = url; }
};

// ═══ 🔑 강사 비밀번호 재설정 (2026-07-23) ═══════════════════════════════
//   왜: 강사가 비번을 잊으면 풀어줄 방법이 없었다. `change-password` 는 본인이 현재
//       비번을 알아야만 쓸 수 있어서, 잊은 순간 아무도 못 도와준다(hq_t_001 사례).
//   ⚠️ 계정 아이디를 사람이 직접 입력하게 둔 이유: teacher_profiles(강사 인사정보)와
//      admin_account(로그인 계정)를 잇는 컬럼이 아직 없다. 이름으로 자동 추측하면
//      **엉뚱한 사람 비번을 바꿀 수 있어서**, 위험한 작업일수록 사람이 명시하게 한다.
//      (연결 컬럼이 생기면 이 입력칸을 자동완성으로 바꿀 것)
function _tpCanResetPw() {
  try {
    var s = JSON.parse(localStorage.getItem('mangoi_admin_session') || '{}') || {};
    var r = String(s.role || '');
    // 강사·지사·대리점은 제외. 본사 경영진/관리자만. (서버가 최종 게이트)
    if (/teacher|branch|agency|franchise|parent|student/i.test(r)) return false;
    return /exec|hq|mgr|staff|admin/i.test(r);
  } catch (e) { return false; }
}

window.openTeacherPwReset = function (teacherName, presetUsername) {
  var EN = (window.adminLang === 'en');
  var T = function (ko, en) { return EN ? en : ko; };
  var old = document.getElementById('tp-pw-modal'); if (old) old.remove();
  var wrap = document.createElement('div');
  wrap.id = 'tp-pw-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,14,25,.66)';
  wrap.innerHTML =
    '<div style="width:100%;max-width:420px;background:#fff;color:#0f172a;border-radius:16px;padding:22px 24px;box-shadow:0 24px 60px -12px rgba(0,0,0,.5)">' +
      '<div style="font-size:17px;font-weight:900;margin-bottom:4px">🔑 ' + T('비밀번호 재설정', 'Reset password') + '</div>' +
      '<div style="font-size:12.5px;color:#64748b;line-height:1.6;margin-bottom:14px">' +
        (teacherName ? '<b>' + _aiEsc(teacherName) + '</b> — ' : '') +
        T('이 강사의 <b>로그인 계정 아이디</b>를 정확히 입력해 주세요. 재설정하면 그 계정의 기존 로그인은 모두 해제됩니다.',
          'Enter this teacher\'s <b>login ID</b> exactly. Resetting will sign them out of every device.') +
      '</div>' +
      '<label style="font-size:11.5px;font-weight:700;color:#374151">' + T('계정 아이디', 'Login ID') + '</label>' +
      '<input id="tp-pw-user" type="text" autocomplete="off" value="' + _aiEsc(presetUsername || '') + '" placeholder="mangoi_018" style="width:100%;padding:9px 11px;margin:4px 0 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px">' +
      '<label style="font-size:11.5px;font-weight:700;color:#374151">' + T('새 비밀번호 (6자 이상)', 'New password (6+ characters)') + '</label>' +
      '<input id="tp-pw-new" type="text" autocomplete="off" style="width:100%;padding:9px 11px;margin:4px 0 6px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px">' +
      '<div style="font-size:11.5px;color:#94a3b8;margin-bottom:14px">' +
        T('강사에게 알려줘야 하므로 가려두지 않습니다. 알려준 뒤에는 본인이 바꾸게 하세요.',
          'Shown in plain text because you must pass it on. Ask them to change it afterwards.') + '</div>' +
      '<div id="tp-pw-msg" style="font-size:12.5px;font-weight:700;min-height:18px;margin-bottom:10px"></div>' +
      '<div style="display:flex;gap:8px">' +
        '<button id="tp-pw-cancel" style="flex:1;padding:10px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:9px;font-weight:800;cursor:pointer">' + T('취소', 'Cancel') + '</button>' +
        '<button id="tp-pw-go" style="flex:1;padding:10px;border:0;background:#2563eb;color:#fff;border-radius:9px;font-weight:800;cursor:pointer">' + T('재설정', 'Reset') + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap);
  var msg = wrap.querySelector('#tp-pw-msg');
  var close = function () { wrap.remove(); };
  wrap.querySelector('#tp-pw-cancel').onclick = close;
  wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
  wrap.querySelector('#tp-pw-go').onclick = async function () {
    var u = (wrap.querySelector('#tp-pw-user').value || '').trim();
    var p = (wrap.querySelector('#tp-pw-new').value || '');
    if (!u || !p) { msg.style.color = '#dc2626'; msg.textContent = T('두 칸 모두 채워 주세요.', 'Please fill in both fields.'); return; }
    if (p.length < 6) { msg.style.color = '#dc2626'; msg.textContent = T('비밀번호는 6자 이상이어야 합니다.', 'Password must be at least 6 characters.'); return; }
    this.disabled = true;
    msg.style.color = '#64748b'; msg.textContent = T('처리 중…', 'Working…');
    try {
      var r = await fetch('/api/admin/staff-password-reset', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, new_password: p })
      });
      var j = await r.json();
      if (j && j.ok) {
        msg.style.color = '#16a34a';
        msg.textContent = '✅ ' + (EN ? (j.message_en || 'Done.') : (j.message || '완료.'));
        setTimeout(close, 2200);
      } else {
        msg.style.color = '#dc2626';
        msg.textContent = '❌ ' + (EN ? (j && (j.message_en || j.error)) : (j && (j.message || j.error))) || 'failed';
        this.disabled = false;
      }
    } catch (e) {
      msg.style.color = '#dc2626';
      msg.textContent = T('네트워크 오류', 'Network error');
      this.disabled = false;
    }
  };
};

/* 📇 복구 연락처 일괄 채우기 (2026-08-17) — 「비밀번호 찾기」가 실제로 돌게 만드는 짝.
     왜 필요한가: 셀프 비번찾기는 **등록된 연락처가 있는 계정만** 쓸 수 있다. 그런데 2026-08-17
     기준 관리자 계정 47개 중 45개에 쓸 수 있는 연락처가 없었다(email 칸에 아이디가 그대로 든
     행 포함). 기능만 만들고 끝내면 「화면은 있는데 아무도 못 쓰는」 것이 하나 더 생긴다.
     ⚠️ 전체권한 계정(admin·cfo·ops_lead)은 여기서 못 고친다 — 남의 복구 연락처를 내 것으로
        바꾸는 것은 곧 그 계정을 가져가는 길이라, 서버가 403 으로 막고 목록에도 «본인만» 으로 뜬다. */
window.openContactFill = async function () {
  var EN = (window.adminLang === 'en');
  var T = function (ko, en) { return EN ? en : ko; };
  var old = document.getElementById('cf-modal'); if (old) old.remove();
  var wrap = document.createElement('div');
  wrap.id = 'cf-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,14,25,.66)';
  wrap.innerHTML =
    '<div style="width:100%;max-width:680px;max-height:86vh;overflow:auto;background:#fff;color:#0f172a;border-radius:16px;padding:22px 24px;box-shadow:0 24px 60px -12px rgba(0,0,0,.5)">' +
      '<div style="font-size:17px;font-weight:900;margin-bottom:4px">📇 ' + T('복구 연락처 채우기', 'Fill recovery contacts') + '</div>' +
      '<div style="font-size:12.5px;color:#64748b;line-height:1.6;margin-bottom:14px">' +
        T('연락처가 있어야 그 사람이 «비밀번호 찾기» 로 스스로 풀 수 있습니다. 휴대폰이나 이메일 중 <b>하나만</b> 있어도 됩니다.',
          'A contact is what lets someone recover their own password. <b>Either</b> a mobile number or an email is enough.') +
      '</div>' +
      '<div id="cf-sum" style="font-size:12.5px;font-weight:800;margin-bottom:10px;color:#334155"></div>' +
      '<div id="cf-list" style="font-size:13px">' + T('불러오는 중…', 'Loading…') + '</div>' +
      '<button id="cf-close" style="width:100%;margin-top:14px;padding:10px;border:1px solid #cbd5e1;background:#f8fafc;border-radius:9px;font-weight:800;cursor:pointer">' +
        T('닫기', 'Close') + '</button>' +
    '</div>';
  document.body.appendChild(wrap);
  var close = function () { wrap.remove(); };
  wrap.querySelector('#cf-close').onclick = close;
  wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });

  var listEl = wrap.querySelector('#cf-list');
  var sumEl  = wrap.querySelector('#cf-sum');
  var INP = 'padding:7px 9px;border:1px solid #cbd5e1;border-radius:7px;font-size:12.5px;width:100%;box-sizing:border-box';

  function row(a) {
    var id = _aiEsc(a.username);
    var badge = a.recoverable
      ? '<span style="color:#16a34a;font-weight:800">✅ ' + T('가능', 'ready') + '</span>'
      : '<span style="color:#dc2626;font-weight:800">⚠️ ' + T('불가', 'no contact') + '</span>';
    if (a.self_only) {
      return '<tr><td style="padding:7px 6px;border-bottom:1px solid #eef2f7"><b>' + id + '</b>' +
        '<div style="color:#94a3b8;font-size:11.5px">' + _aiEsc(a.name || '') + '</div></td>' +
        '<td colspan="3" style="padding:7px 6px;border-bottom:1px solid #eef2f7;color:#94a3b8;font-size:12px">' +
        badge + ' · ' + T('전체권한 계정 — 본인이 마이페이지에서 직접 등록', 'Full-access account — must be set by its owner in My Page') +
        '</td></tr>';
    }
    return '<tr data-u="' + id + '">' +
      '<td style="padding:7px 6px;border-bottom:1px solid #eef2f7;white-space:nowrap"><b>' + id + '</b>' +
        '<div style="color:#94a3b8;font-size:11.5px">' + _aiEsc(a.name || '') + '</div>' +
        '<div class="cf-state" style="font-size:11.5px;margin-top:2px">' + badge + '</div></td>' +
      '<td style="padding:7px 6px;border-bottom:1px solid #eef2f7"><input class="cf-phone" type="tel" value="' +
        _aiEsc(a.phone || '') + '" placeholder="09xx…" style="' + INP + '"></td>' +
      '<td style="padding:7px 6px;border-bottom:1px solid #eef2f7"><input class="cf-email" type="email" value="' +
        _aiEsc(a.email || '') + '" placeholder="name@example.com" style="' + INP + '"></td>' +
      '<td style="padding:7px 6px;border-bottom:1px solid #eef2f7;white-space:nowrap">' +
        '<button class="cf-save" style="padding:7px 11px;border:0;background:#2563eb;color:#fff;border-radius:8px;font-weight:800;cursor:pointer;font-size:12px">' +
        T('저장', 'Save') + '</button></td></tr>';
  }

  try {
    var r = await fetch('/api/admin/contacts-missing', { credentials: 'include' });
    var j = await r.json();
    if (!j || !j.ok) {
      listEl.innerHTML = '<div style="color:#dc2626;font-weight:700">❌ ' +
        _aiEsc((EN ? (j && (j.message_en || j.error)) : (j && (j.message || j.error))) || 'failed') + '</div>';
      return;
    }
    // 연락처 없는 계정을 위로 — 채워야 할 것이 먼저 보여야 한다.
    var accts = (j.accounts || []).slice().sort(function (a, b) {
      return (a.recoverable ? 1 : 0) - (b.recoverable ? 1 : 0);
    });
    sumEl.textContent = T('전체 ' + j.total + '개 계정 중 ' + j.missing + '개가 연락처 없음 — 비밀번호 찾기를 못 씁니다.',
                          j.missing + ' of ' + j.total + ' accounts have no contact — they cannot use password recovery.');
    listEl.innerHTML =
      '<table style="width:100%;border-collapse:collapse">' +
        '<tr style="font-size:11.5px;color:#64748b;text-align:left">' +
          '<th style="padding:4px 6px">' + T('계정', 'Account') + '</th>' +
          '<th style="padding:4px 6px">' + T('휴대폰', 'Mobile') + '</th>' +
          '<th style="padding:4px 6px">' + T('이메일', 'Email') + '</th>' +
          '<th></th></tr>' +
        accts.map(row).join('') +
      '</table>';

    listEl.addEventListener('click', async function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.cf-save') : null;
      if (!btn) return;
      var tr = btn.closest('tr');
      var u = tr.getAttribute('data-u');
      var phone = (tr.querySelector('.cf-phone').value || '').trim();
      var email = (tr.querySelector('.cf-email').value || '').trim();
      var state = tr.querySelector('.cf-state');
      btn.disabled = true; state.textContent = T('저장 중…', 'Saving…');
      try {
        var rr = await fetch('/api/admin/staff-contact', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: u, phone: phone, email: email })
        });
        var jj = await rr.json();
        if (jj && jj.ok) {
          state.innerHTML = jj.recoverable
            ? '<span style="color:#16a34a;font-weight:800">✅ ' + T('가능', 'ready') + '</span>'
            : '<span style="color:#dc2626;font-weight:800">⚠️ ' + T('불가', 'no contact') + '</span>';
        } else {
          state.innerHTML = '<span style="color:#dc2626;font-weight:800">❌ ' +
            _aiEsc((EN ? (jj && (jj.message_en || jj.error)) : (jj && (jj.message || jj.error))) || 'failed') + '</span>';
        }
      } catch (err) {
        state.innerHTML = '<span style="color:#dc2626;font-weight:800">' + T('네트워크 오류', 'Network error') + '</span>';
      }
      btn.disabled = false;
    });
  } catch (e) {
    listEl.innerHTML = '<div style="color:#dc2626;font-weight:700">' + T('네트워크 오류', 'Network error') + '</div>';
  }
};

// 🎬 강사 소개 영상 — 목록 ▶ 버튼 클릭 시 모달로 바로 재생 (YouTube 임베드 / mp4)
window.viewTeacherVideo = function(encUrl, name){
  var url = decodeURIComponent(encUrl || '');
  if (!url) return;
  var m = url.match(/[?&]v=([\w-]{11})/) || url.match(/youtu\.be\/([\w-]{11})/) || url.match(/embed\/([\w-]{11})/);
  var inner = m
    ? '<iframe src="https://www.youtube.com/embed/' + m[1] + '?autoplay=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;border-radius:10px;background:#000"></iframe>'
    : '<video src="' + _aiEsc(url) + '" controls autoplay playsinline style="width:100%;max-height:70vh;border-radius:10px;background:#000"></video>';
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:20px';
  ov.innerHTML = '<div style="background:#0f172a;border:1px solid #334155;border-radius:14px;padding:16px;max-width:760px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.6)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;color:#e2e8f0;font-weight:800;font-size:15px">🎬 ' + _aiEsc(name||'') + ' 소개 영상' +
        '<button data-close="1" style="background:none;border:0;color:#94a3b8;font-size:22px;cursor:pointer;line-height:1">✕</button></div>' +
      inner + '</div>';
  ov.addEventListener('click', function(e){ if (e.target === ov || e.target.getAttribute('data-close')) document.body.removeChild(ov); });
  document.body.appendChild(ov);
};

// 📷 강사 목록에서 사진 클릭 → 즉시 업로드/변경 (R2 업로드 후 프로필 image_url PATCH)
window.uploadTeacherPhotoInline = function(id, anchorEl) {
  if (!id) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async function() {
    const file = input.files && input.files[0];
    if (!file) { document.body.removeChild(input); return; }
    const sizeMB = file.size / 1024 / 1024;
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPEG/PNG/WebP/GIF)만 업로드 가능합니다.');
      document.body.removeChild(input); return;
    }
    if (sizeMB > 10) {
      alert('파일이 너무 큽니다 (' + sizeMB.toFixed(2) + 'MB). 10MB 이하로 업로드해주세요.');
      document.body.removeChild(input); return;
    }
    // 업로드 중 오버레이 표시
    const ov = anchorEl && anchorEl.querySelector ? anchorEl.querySelector('.tp-photo-ov') : null;
    if (ov) { ov.style.opacity = '1'; ov.textContent = '⏳'; }
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch('/api/admin/popups/upload-media', { method:'POST', credentials:'include', body: form });
      const d = await r.json().catch(() => ({}));
      if (!d.ok || !d.url) throw new Error(d.error || 'R2 업로드 실패');
      // 프로필에 image_url 저장
      const pr = await fetch('/api/admin/teacher-profiles/' + id, {
        method:'PATCH', credentials:'include',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ image_url: d.url })
      });
      const pd = await pr.json().catch(() => ({}));
      if (!pr.ok || pd.ok === false) throw new Error(pd.error || ('HTTP ' + pr.status));
      // 목록 새로고침 — 새 사진 즉시 반영
      if (typeof loadTeacherProfiles === 'function') { loadTeacherProfiles(); }
      else if (typeof window.loadTeacherProfiles === 'function') { window.loadTeacherProfiles(); }
      else {
        const im = anchorEl && anchorEl.querySelector ? anchorEl.querySelector('img') : null;
        if (im) { im.src = d.url; im.style.display = 'block'; }
      }
    } catch (e) {
      alert('사진 업로드 실패: ' + (e && e.message ? e.message : e));
      if (ov) { ov.style.opacity = '0'; ov.textContent = '📷'; }
    } finally {
      document.body.removeChild(input);
    }
  });
  input.click();
};

// 프로필 이미지 파일 업로드 — R2 우선, 실패시 base64 fallback
window.handleProfileImageUpload = async function(input) {
  const file = input.files && input.files[0];
  const hidden = document.getElementById('tp-image-url');
  const preview = document.getElementById('tp-image-preview');
  const info = document.getElementById('tp-image-info');
  if (!file) return;
  const sizeMB = file.size / 1024 / 1024;
  const isImage = file.type.startsWith('image/');
  const isPDF = file.type === 'application/pdf';
  if (!isImage && !isPDF) {
    alert('지원하지 않는 파일 형식입니다.\n이미지(JPEG/PNG/WebP/GIF) 또는 PDF만 업로드 가능합니다.');
    input.value = '';
    return;
  }
  if (sizeMB > 10) {
    alert('파일이 너무 큽니다 (' + sizeMB.toFixed(2) + 'MB).\n10MB 이하 파일을 업로드해주세요.');
    input.value = '';
    return;
  }
  // R2 업로드 우선 시도
  if (info) info.textContent = '☁️ R2 업로드 중… (' + sizeMB.toFixed(2) + 'MB)';
  try {
    const form = new FormData();
    form.append('file', file);
    const r = await fetch('/api/admin/popups/upload-media', { method:'POST', body: form });
    const d = await r.json();
    if (d.ok && d.url) {
      if (hidden) hidden.value = d.url;
      if (isImage && preview) { preview.src = d.url; preview.style.display = 'block'; }
      if (info) info.textContent = '✅ R2 업로드 완료: ' + file.name + ' (' + sizeMB.toFixed(2) + 'MB) — 학생 페이지에 즉시 반영됩니다';
      const urlText = document.getElementById('tp-image-url-text');
      if (urlText) urlText.value = '';
      return;
    }
    // R2 실패 시 base64 fallback (작은 파일만)
    throw new Error(d.error || 'R2 업로드 실패');
  } catch (e) {
    console.warn('[tp] R2 업로드 실패 → base64 fallback:', e);
    if (sizeMB > 3) {
      alert('R2 업로드 실패: ' + e.message + '\n3MB 이하 파일로 다시 시도하거나 URL 직접 입력을 사용하세요.');
      input.value = '';
      if (info) info.textContent = '';
      return;
    }
    // base64 fallback
    const reader = new FileReader();
    reader.onload = function() {
      const dataUrl = reader.result;
      if (hidden) hidden.value = dataUrl;
      if (isImage && preview) { preview.src = dataUrl; preview.style.display = 'block'; }
      if (info) info.textContent = '📷 ' + file.name + ' (' + sizeMB.toFixed(2) + 'MB) — base64 저장 (DB 부담 큼, R2 권장)';
      const urlText = document.getElementById('tp-image-url-text');
      if (urlText) urlText.value = '';
    };
    reader.onerror = function() {
      alert('파일을 읽을 수 없습니다.');
      input.value = '';
    };
    reader.readAsDataURL(file);
  }
};

// 🎬 강사 소개 비디오 R2 업로드 + 미리보기
window.handleTeacherVideoUpload = async function(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const sizeMB = file.size / 1024 / 1024;
  if (sizeMB > 30) {
    alert('비디오 파일은 30MB 이하여야 합니다. (현재 ' + sizeMB.toFixed(2) + 'MB)\nYouTube 업로드 후 URL 입력을 권장합니다.');
    input.value = '';
    return;
  }
  if (!file.type.startsWith('video/')) {
    alert('비디오 파일(mp4/webm/mov)만 업로드 가능합니다.');
    input.value = '';
    return;
  }
  const urlInput = document.getElementById('tp-video-url');
  const info = document.getElementById('tp-video-info');
  if (info) info.textContent = '☁️ R2 업로드 중… (' + sizeMB.toFixed(2) + 'MB, 시간이 좀 걸립니다)';
  try {
    const form = new FormData();
    form.append('file', file);
    const r = await fetch('/api/admin/popups/upload-media', { method:'POST', body: form });
    const d = await r.json();
    if (!d.ok || !d.url) throw new Error(d.error || 'R2 업로드 실패');
    if (urlInput) urlInput.value = d.url;
    if (info) info.textContent = '✅ R2 업로드 완료: ' + file.name + ' (' + sizeMB.toFixed(2) + 'MB) — 학생 페이지에 즉시 반영됩니다';
    if (typeof refreshTeacherVideoPreview === 'function') refreshTeacherVideoPreview();
  } catch (e) {
    if (info) info.textContent = '❌ 업로드 실패: ' + e.message;
    alert('비디오 업로드 실패: ' + e.message);
  } finally {
    input.value = '';
  }
};

// 비디오 URL → 즉시 미리보기 (YouTube 자동 임베드 또는 video 태그)
window.refreshTeacherVideoPreview = function() {
  const url = (document.getElementById('tp-video-url')?.value || '').trim();
  const box = document.getElementById('tp-video-preview');
  if (!box) return;
  if (!url) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = 'block';
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) {
    box.innerHTML = '<iframe src="https://www.youtube.com/embed/' + yt[1] + '" style="width:100%;aspect-ratio:16/9;border:0;border-radius:8px" allowfullscreen></iframe>';
  } else if (/\.(mp4|webm|mov)(\?|$)/i.test(url) || url.startsWith('/api/popups/media/')) {
    box.innerHTML = '<video src="' + url + '" controls preload="metadata" style="width:100%;max-width:320px;border-radius:8px;display:block"></video>';
  } else {
    box.innerHTML = '<div style="font-size:11px;color:#9ca3af;padding:8px;background:#f9fafb;border-radius:6px">미리보기 불가 URL — 학생 페이지에서 새 창으로 열림</div>';
  }
};

async function addTeacherProfile() {
  const e = id => document.getElementById(id);
  const body = {
    korean_name: e('tp-name')?.value.trim(),
    english_name: e('tp-en-name')?.value.trim() || null,
    email: e('tp-email')?.value.trim() || null,
    phone: e('tp-phone')?.value.trim() || null,
    kakao_id: e('tp-kakao')?.value.trim() || null,
    dob: e('tp-dob')?.value || null,
    gender: e('tp-gender')?.value || null,
    mbti: e('tp-mbti')?.value || null,
    // 🌏 국적 — 이 값이 그 사람의 로그인 화면 언어를 정한다('KR' 만 한국어, 나머지는 영어)
    nationality: e('tp-nationality')?.value || null,
    active_region: e('tp-active-region')?.value.trim() || null,
    origin_region: e('tp-origin-region')?.value.trim() || null,
    fee_per_10min: e('tp-fee-10min')?.value ? parseInt(e('tp-fee-10min').value, 10) : null,
    // 🔗 (2026-07-30) 제보 #2-1 — 급여용 강사 계정 연결(enroll.html 강사선택에 사진·MBTI 노출용)
    linked_teacher_id: e('tp-linked-teacher')?.value ? parseInt(e('tp-linked-teacher').value, 10) : null,
    group_name: e('tp-group')?.value || null,
    status: e('tp-status')?.value || '활동중',
    join_date: e('tp-join-date')?.value || null,
    leave_date: e('tp-leave-date')?.value || null,
    image_url: e('tp-image-url')?.value.trim() || null,
    intro_video_url: e('tp-video-url')?.value.trim() || null,
    education: e('tp-education')?.value.trim() || null,
    career: e('tp-career')?.value.trim() || null,
    certifications: e('tp-cert')?.value.trim() || null,
    available_days: e('tp-avail-days')?.value.trim() || null,
    available_hours: e('tp-avail-hours')?.value.trim() || null,
    bank_name: e('tp-bank-name')?.value.trim() || null,
    bank_account: e('tp-bank-acct')?.value.trim() || null,
    notes: e('tp-notes')?.value.trim() || null
  };
  if (!body.korean_name) { alert('한글 이름은 필수입니다.'); return; }
  // 수정 모드 감지 — 버튼 data-edit-id 가 있으면 PATCH
  const btn = document.getElementById('tp-add-btn');
  const editId = btn?.dataset?.editId;
  let r, d, action;
  if (editId) {
    r = await fetch('/api/admin/teacher-profiles/' + editId, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    action = '수정';
  } else {
    r = await fetch('/api/admin/teacher-profiles', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    action = '등록';
  }
  d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) { alert(action + ' 실패: ' + (d.error || ('HTTP ' + r.status))); return; }

  // 🧠 MBTI / 매칭 프로필도 동시에 저장 — 학생-강사 자동 매칭에 사용
  try {
    const mbtiType  = e('tp-mbti-type')?.value.trim().toUpperCase() || '';
    const mbtiHobby = e('tp-mbti-hobby')?.value.trim() || '';
    const mbtiStyle = e('tp-mbti-style')?.value.trim() || '';
    const mbtiIntro = e('tp-mbti-intro')?.value.trim() || '';
    // 하나라도 입력됐으면 MBTI API 동시 호출
    if (mbtiType || mbtiHobby || mbtiStyle || mbtiIntro) {
      // teacher_uid 는 신규등록 시 응답에서 받고, 없으면 영문 이름/한글 이름에서 슬러그 생성
      const tUid = (d.item && (d.item.uid || d.item.teacher_uid))
                   || (body.english_name || body.korean_name || '').toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')
                   || ('t_' + Date.now().toString(36));
      const mr = await fetch('/api/admin/teacher/mbti', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          teacher_uid: tUid,
          teacher_name: body.english_name || body.korean_name,
          mbti: mbtiType || null,
          hobby: mbtiHobby || null,
          teaching_style: mbtiStyle || null,
          intro: mbtiIntro || null
        })
      });
      const md = await mr.json().catch(()=>({}));
      if (md.ok) console.log('[teacher-mbti] saved:', tUid);
      else console.warn('[teacher-mbti] save failed:', md.error);
    }
  } catch(mbtiErr) {
    console.warn('[teacher-mbti] non-fatal error:', mbtiErr);
  }

  alert('✅ 강사 ' + action + ' 완료: ' + body.korean_name +
        (e('tp-mbti-type')?.value ? '\n🧠 MBTI 매칭 프로필도 저장됨 — 학생 매칭에 즉시 반영됩니다.' : ''));
  // 수정 모드 해제
  if (btn) {
    btn.textContent = '+ 강사 등록';
    delete btn.dataset.editId;
  }
  clearTeacherForm();
  loadTeacherProfiles();
}
function clearTeacherForm() {
  ['tp-name','tp-en-name','tp-email','tp-phone','tp-kakao','tp-dob','tp-gender','tp-active-region','tp-origin-region',
   'tp-fee-10min','tp-group','tp-join-date','tp-leave-date','tp-image-url','tp-video-url',
   'tp-education','tp-career','tp-cert','tp-avail-days','tp-avail-hours','tp-bank-name','tp-bank-acct','tp-notes',
   'tp-mbti-type','tp-mbti-hobby','tp-mbti-style','tp-mbti-intro','tp-linked-teacher','tp-login-username']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const st = document.getElementById('tp-status'); if (st) st.value = '활동중';
  // 🔑 신규 등록 중엔 연결된 로그인 계정이 있을 수 없으므로 다시 숨긴다(수정 열 때만 보임).
  const loginBlock = document.getElementById('tp-login-block');
  if (loginBlock) loginBlock.style.display = 'none';
}

// 🧪 4문항 빠른 MBTI 테스트 — 결과를 tp-mbti-type select 에 자동 입력
window.openQuickMbtiTest = function() {
  const L = (window.adminLang === 'en');
  const QS = L ? [
    { q: 'When you meet new people, you feel…', a: ['Energized — let\'s talk to everyone!', 'Drained — I prefer quiet 1-on-1 time'] },
    { q: 'When teaching, you focus more on…', a: ['Concrete examples, facts, and step-by-step practice', 'Big ideas, patterns, and what\'s possible'] },
    { q: 'When a student is struggling, you primarily…', a: ['Analyze the problem and give logical feedback', 'Empathize first and encourage them gently'] },
    { q: 'You prefer your class to be…', a: ['Well-planned with a clear lesson outline', 'Flexible and responsive to the student\'s mood'] }
  ] : [
    { q: '새로운 사람을 만나면 어떤 느낌인가요?', a: ['에너지가 생긴다 — 모두와 대화하고 싶다', '에너지가 빠진다 — 조용한 1:1 이 좋다'] },
    { q: '수업할 때 어떤 면에 더 집중하나요?', a: ['구체적인 예시, 사실, 단계별 연습', '큰 그림, 패턴, 가능성'] },
    { q: '학생이 어려워할 때 먼저 어떻게 하나요?', a: ['문제를 분석하고 논리적인 피드백을 준다', '먼저 공감하고 부드럽게 격려한다'] },
    { q: '본인 수업은 어떤 스타일을 선호하나요?', a: ['미리 짜인 명확한 수업 계획대로 진행', '학생 컨디션에 따라 유연하게 진행'] }
  ];
  const ax = ['E','I','S','N','T','F','J','P'];
  let answers = [null, null, null, null];
  function render() {
    const total = QS.length;
    const done = answers.filter(a => a !== null).length;
    const items = QS.map((it, i) => `
      <div style="margin-bottom:18px;padding:14px;background:#1e293b;border-radius:10px;border:1px solid #334155">
        <div style="font-size:13px;font-weight:800;color:#fbbf24;margin-bottom:10px">${i+1}. ${it.q}</div>
        ${it.a.map((opt, j) => `
          <button onclick="window._mbtiAns(${i},${j})"
                  style="display:block;width:100%;padding:10px 12px;margin-bottom:6px;text-align:left;background:${answers[i]===j?'rgba(99,102,241,0.4)':'#0f172a'};color:#e2e8f0;border:1px solid ${answers[i]===j?'#6366f1':'#475569'};border-radius:8px;cursor:pointer;font-size:12.5px;line-height:1.45">
            ${String.fromCharCode(65+j)}. ${opt}
          </button>`).join('')}
      </div>`).join('');
    const ready = done === total;
    let result = '';
    if (ready) {
      const t = (answers[0]===0?'E':'I') + (answers[1]===0?'S':'N') + (answers[2]===0?'T':'F') + (answers[3]===0?'J':'P');
      result = `<div style="margin-top:14px;padding:18px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;text-align:center;color:#fff">
        <div style="font-size:14px;margin-bottom:6px">${L?'Your MBTI':'당신의 MBTI'}</div>
        <div style="font-size:42px;font-weight:900;letter-spacing:2px">${t}</div>
        <button onclick="window._mbtiUse('${t}')"
                style="margin-top:14px;padding:10px 28px;background:#fbbf24;color:#1a1a1a;border:0;border-radius:8px;font-weight:800;cursor:pointer">
          ${L?'✅ Use this result':'✅ 이 결과 사용하기'}
        </button>
      </div>`;
    }
    const m = document.getElementById('quick-mbti-modal-body');
    if (m) m.innerHTML = items + result;
  }
  window._mbtiAns = (i, j) => { answers[i] = j; render(); };
  window._mbtiUse = (t) => {
    const sel = document.getElementById('tp-mbti-type');
    if (sel) {
      sel.value = t;
      sel.dispatchEvent(new Event('change'));
    }
    closeQuickMbtiTest();
    alert(L ? '✅ MBTI saved: ' + t : '✅ MBTI 저장됨: ' + t);
  };
  // 모달 생성
  let mod = document.getElementById('quick-mbti-modal');
  if (!mod) {
    mod = document.createElement('div');
    mod.id = 'quick-mbti-modal';
    mod.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)';
    mod.innerHTML = `
      <div style="background:#0f172a;border:1px solid #334155;border-radius:16px;padding:24px;max-width:560px;width:100%;max-height:88vh;overflow-y:auto;color:#e2e8f0">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <h2 style="margin:0;font-size:18px;color:#fbbf24">🧪 ${L?'Quick MBTI Test':'빠른 MBTI 테스트'}</h2>
          <button onclick="closeQuickMbtiTest()" style="width:32px;height:32px;background:rgba(239,68,68,0.2);color:#fca5a5;border:0;border-radius:50%;cursor:pointer;font-size:16px;font-weight:800">✕</button>
        </div>
        <div style="font-size:12px;color:#94a3b8;margin-bottom:16px;line-height:1.55">
          ${L
            ? '4 quick questions — about 30 seconds. The result is auto-filled into the MBTI field. For an accurate test, see <a href="https://www.16personalities.com/" target="_blank" style="color:#fbbf24">16personalities.com</a>.'
            : '4문항 · 약 30초. 결과가 MBTI 필드에 자동 입력됩니다. 정확한 진단은 <a href="https://www.16personalities.com/ko" target="_blank" style="color:#fbbf24">16personalities.com</a> 참고.'}
        </div>
        <div id="quick-mbti-modal-body"></div>
      </div>`;
    document.body.appendChild(mod);
    mod.addEventListener('click', e => { if (e.target === mod) closeQuickMbtiTest(); });
  } else {
    mod.style.display = 'flex';
  }
  render();
};
window.closeQuickMbtiTest = function() {
  const m = document.getElementById('quick-mbti-modal');
  if (m) m.remove();
};
async function viewTeacherProfile(id) {
  // 🚀 목록에서 이미 받은 행이 있으면 재요청 없이 즉시 표시(체감속도), 없을 때만 fetch
  let t = (window._tpRowById && window._tpRowById[id]) || null;
  if (!t) {
    const r = await fetch('/api/admin/teacher-profiles/' + id, { credentials:'include' });
    const d = await r.json().catch(()=>({}));
    if (!r.ok || !d.ok) { alert('조회 실패'); return; }
    t = d.item;
  }
  // 🌐 한/영 병기 (adminLang) — 영어 모드(필리핀 강사·직원)에서도 정상 표시
  var _en = (window.adminLang && window.adminLang !== 'ko');
  var T = function(ko, en){ return _en ? en : ko; };
  // 프로필 탭 내용(기존 필드) + 수정 버튼
  const profilePane =
      _tpField(T('이메일','Email'), t.email) + _tpField(T('휴대폰','Mobile'), t.phone) + _tpField(T('카톡 ID','KakaoTalk ID'), t.kakao_id) +
      _tpField('MBTI', t.mbti) +
      _tpField(T('생년월일','Date of Birth'), t.dob) + _tpField(T('활동 지역','Active Region'), t.active_region) + _tpField(T('출신 지역','Origin Region'), t.origin_region) +
      _tpField(T('10분당 수수료','Fee / 10 min'), t.fee_per_10min ? Number(t.fee_per_10min).toLocaleString('ko-KR') + ' KRW' : null) +
      _tpField(T('입사일','Join Date'), t.join_date) + _tpField(T('퇴사일','Leave Date'), t.leave_date) +
      _tpField(T('학력','Education'), t.education) + _tpField(T('경력','Career'), t.career) + _tpField(T('자격증','Certifications'), t.certifications) +
      _tpField(T('가능 요일','Available Days'), t.available_days) + _tpField(T('가능 시간','Available Hours'), t.available_hours) +
      _tpField(T('은행','Bank'), t.bank_name) + _tpField(T('계좌','Account'), t.bank_account) +
      (t.intro_video_url ? '<div style="margin-top:10px"><b>' + T('소개 비디오','Intro Video') + ':</b> <a href="' + _aiEsc(t.intro_video_url) + '" target="_blank" style="color:#3b82f6">' + _aiEsc(t.intro_video_url) + '</a></div>' : '') +
      (t.notes ? '<div style="margin-top:10px;padding:10px;background:#f9fafb;border-radius:6px;font-size:13px"><b>' + T('메모','Notes') + ':</b><br>' + _aiEsc(t.notes).replace(/\n/g,'<br>') + '</div>' : '') +
      '<div style="margin-top:16px"><button type="button" onclick="var m=this.closest(\'.tp-detail-modal\');editTeacherProfile(' + t.id + ');if(m)m.remove();" style="padding:8px 16px;background:#10b981;color:#fff;border:0;border-radius:7px;font-weight:700;cursor:pointer">✎ ' + T('프로필 수정','Edit Profile') + '</button></div>';
  // 탭 정의 — 한/영 병기
  const tabs = [['prof',T('프로필','Profile')],['classes',T('수업 배정','Schedule')],['pay',T('급여','Pay')],['eval',T('평가·평점','Rating')],['memo',T('메모·MBTI','Notes·MBTI')]];
  // 각 탭 = 캐시(_tpRowById) 데이터 요약 + 전체 도구(기존 카드) 바로가기. 새 API 없이 안전.
  const _jump = function(card, label){ return '<div style="margin-top:16px"><button type="button" onclick="var m=this.closest(\'.tp-detail-modal\');if(m)m.remove();if(typeof jumpToMenu===\'function\')jumpToMenu(\'' + card + '\');" style="padding:9px 16px;background:#6366f1;color:#fff;border:0;border-radius:8px;font-weight:700;cursor:pointer">' + label + '</button></div>'; };
  const _note = function(txt){ return '<div style="color:#9ca3af;font-size:12px;padding:4px 0 2px">' + txt + '</div>'; };
  /* 📚 (2026-08-30 v4 제안서 15) 「수업 데이터가 없다」의 정체는 «번호가 세 벌» 이다.
     원부(teachers.id)로만 조인하면 카페24에서 돌아간 수업이 통째로 안 보인다 — Janice 실측:
     teachers 28 / 카페24 37, 실제 수업 64건은 카페24 번호에만 달려 있었다.
     여기서는 서버(/api/admin/reports/teacher-classes)가 «두 갈래를 다 세어» 준다.
     ⚠️ 못 이었으면 «못 이었다» 고 그대로 적는다 — 숫자를 0으로 채우지 않는다. */
  const classesPane = _tpField(T('가능 요일','Available Days'), t.available_days) + _tpField(T('가능 시간','Available Hours'), t.available_hours) + _tpField(T('활동 지역','Active Region'), t.active_region) +
      '<div data-sum="classes" style="margin-top:10px;font-size:12.5px;color:#475467">' + T('수업 기록 확인 중…','Checking class records…') + '</div>' +
      _note(T('이 강사의 주간 수업 배정·시간표는 아래에서 관리합니다.','Manage weekly schedule and timetable below.')) + _jump('card-timetable', T('🗓 시간표 · 수업 배정 열기','🗓 Open Timetable · Schedule'));
  const payPane = '<div data-sum="pay"></div>' + _tpField(T('10분당 수수료','Fee / 10 min'), t.fee_per_10min ? Number(t.fee_per_10min).toLocaleString('ko-KR') + ' KRW' : null) +
      _tpField(T('구분/그룹','Group'), t.group_name) + _tpField(T('은행','Bank'), t.bank_name) + _tpField(T('계좌','Account'), t.bank_account) +
      _note(T('월별 급여 계산·정산은 아래 급여 관리에서.','Monthly payroll and settlement below.')) + _jump('card-payroll', T('💰 급여 · 정산 열기','💰 Open Payroll · Settlement'));
  const evalPane = '<div data-sum="eval"></div>' + _note(T('이 강사가 받은 학생 수업 평가·평점은 아래에서 확인합니다.','View student ratings below.')) + _jump('card-class-ratings', T('⭐ 학생 수업 평가 열기','⭐ Open Student Ratings'));
  const memoPane = _tpField('MBTI', t.mbti) +
      (t.notes ? '<div style="margin-top:8px;padding:10px;background:#f9fafb;border-radius:6px;font-size:13px"><b>' + T('내부 메모','Internal Notes') + '</b><br>' + _aiEsc(t.notes).replace(/\n/g,'<br>') + '</div>' : _note(T('등록된 내부 메모 없음 — 프로필 수정에서 추가','No internal notes yet — add via Edit Profile'))) +
      _jump('card-praise-stats', T('😊 칭찬 통계 열기','😊 Open Praise Stats'));
  const paneBody = { prof: profilePane, classes: classesPane, pay: payPane, eval: evalPane, memo: memoPane };
  const tabBar = '<div style="display:flex;gap:2px;border-bottom:1px solid #e5e7eb;margin-bottom:14px;flex-wrap:wrap">' +
    tabs.map(function(tb,i){ var on=i===0; return '<button type="button" class="tp-dtab" data-tab="' + tb[0] + '" onclick="_tpDetailTab(this,\'' + tb[0] + '\')" style="padding:8px 13px;border:0;background:none;cursor:pointer;font-weight:700;font-size:13px;color:' + (on?'#1f2937':'#9ca3af') + ';border-bottom:2.5px solid ' + (on?'#f59e0b':'transparent') + '">' + tb[1] + '</button>'; }).join('') +
    '</div>';
  const panes = tabs.map(function(tb,i){ return '<div class="tp-dpane" data-pane="' + tb[0] + '" style="display:' + (i===0?'block':'none') + '">' + paneBody[tb[0]] + '</div>'; }).join('');
  const html = '<div class="tp-detail-modal" data-tid="' + t.id + '" data-tname="' + _aiEsc(t.korean_name||'') + '" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)this.remove()">' +
    '<div style="background:#fff;border-radius:14px;padding:24px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px -10px rgba(0,0,0,0.3)">' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;border-bottom:2px solid #f3f4f6;padding-bottom:14px">' +
        (t.image_url ? '<img src="' + _aiEsc(t.image_url) + '" style="width:72px;height:72px;border-radius:50%;object-fit:cover">' : '<div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:bold">'+(t.korean_name||'?').charAt(0)+'</div>') +
        '<div><div style="font-size:20px;font-weight:bold;color:#1f2937">' + _aiEsc(t.korean_name||'') + '</div>' +
        (t.english_name ? '<div style="color:#6b7280">' + _aiEsc(t.english_name) + '</div>' : '') +
        '<div style="margin-top:4px">' + _tpStatusBadge(t.status) + ' ' + _tpGroupBadge(t.group_name) + '</div></div>' +
        '<button type="button" onclick="var m=this.closest(\'.tp-detail-modal\');if(m)m.remove()" style="margin-left:auto;background:transparent;border:0;font-size:20px;cursor:pointer">✕</button>' +
      '</div>' +
      tabBar + panes +
    '</div></div>';
  const div = document.createElement('div');
  div.innerHTML = html;
  const modalEl = div.firstChild;
  document.body.appendChild(modalEl);

  // 📚 «수업 배정» 탭 요약 — 망고아이 예약 + 카페24 실제 수업을 함께 (v4 제안서 15)
  (async function () {
    const box = modalEl.querySelector('[data-sum="classes"]');
    if (!box) return;
    try {
      const r = await fetch('/api/admin/reports/teacher-classes?teacher_id=' + encodeURIComponent(t.id) + '&days=90',
                            { credentials: 'include', cache: 'no-store' });
      const d = await r.json().catch(function () { return null; });
      if (!r.ok || !d || d.ok !== true) {
        box.textContent = T('수업 기록을 불러오지 못했습니다.', 'Could not load class records.');
        return;
      }
      const c = d.cafe24 || {};
      let html2 = '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:9px 11px">'
        + '<div><b>' + T('망고아이 예약', 'Mangoi schedules') + '</b>: ' + d.mangoi_schedules + T('건', '')
        + (d.placeholder_or_cancelled ? ('<span style="color:#9ca3af"> · ' + T('자리표시·취소 ', 'placeholder/cancelled ') + d.placeholder_or_cancelled + '</span>') : '')
        + '</div>';
      if (c.teacher_id) {
        html2 += '<div style="margin-top:3px"><b>' + T('카페24 수업(90일)', 'cafe24 classes (90d)') + '</b>: '
          + c.class_count + T('건', '') + (c.last_date ? (' · ' + T('최근 ', 'last ') + c.last_date) : '')
          + ' <span style="color:#9ca3af">(' + T('강사번호 ', 'teacher #') + c.teacher_id + ')</span></div>';
      } else {
        /* ⚠️ 못 이었으면 «0건» 이라고 하지 않는다 — 표본이 없는 것과 0은 다른 사실이다 */
        html2 += '<div style="margin-top:3px;color:#b45309">' + T('카페24 수업', 'cafe24 classes') + ': '
          + T('강사번호를 잇지 못했습니다', 'teacher number could not be matched') + '</div>';
      }
      html2 += '<div style="margin-top:4px;color:#6b7280;font-size:11.5px">' + _aiEsc(d.note_ko || '') + '</div></div>';
      box.innerHTML = html2;
    } catch (e) {
      box.textContent = T('수업 기록을 불러오지 못했습니다.', 'Could not load class records.');
    }
  })();
}
// 강사 상세 모달 탭 전환 (A2-2)
window._tpDetailTab = function(btn, key){
  var modal = btn.closest('.tp-detail-modal');
  if (!modal) return;
  modal.querySelectorAll('.tp-dtab').forEach(function(b){
    var on = b.getAttribute('data-tab') === key;
    b.style.color = on ? '#1f2937' : '#9ca3af';
    b.style.borderBottomColor = on ? '#f59e0b' : 'transparent';
  });
  modal.querySelectorAll('.tp-dpane').forEach(function(p){
    p.style.display = (p.getAttribute('data-pane') === key) ? 'block' : 'none';
  });
  if (key === 'pay' || key === 'eval') { try { _tpLoadTabData(modal, key); } catch(e){} }
};
// A2-2 요약 통계 타일
function _tpSumStat(value, label){
  return '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;min-width:120px"><div style="font-size:20px;font-weight:800;color:#f59e0b">' + value + '</div><div style="font-size:11px;color:#6b7280;margin-top:1px">' + label + '</div></div>';
}
// A2-2 급여·평가 탭 요약 지연로드 — 기존 API(payroll/lessons·ratings/analytics) 재사용, 실패시 조용히 무시(바로가기만 남음)
window._tpLoadTabData = function(modal, key){
  try {
    if (!modal) return;
    var box = modal.querySelector('[data-sum="' + key + '"]');
    if (!box || box.getAttribute('data-loaded')) return;
    box.setAttribute('data-loaded', '1');
    var en = (window.adminLang && window.adminLang !== 'ko');
    var wrap = function(inner){ return '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">' + inner + '</div>'; };
    box.innerHTML = '<div style="color:#9ca3af;font-size:12px;padding:2px 0 8px">' + (en ? 'Loading…' : '불러오는 중…') + '</div>';
    if (key === 'eval') {
      var tname = modal.getAttribute('data-tname') || '';
      fetch('/api/admin/ratings/analytics?days=90&teacher_name=' + encodeURIComponent(tname), { credentials: 'include' })
        .then(function(r){ return r.json(); }).then(function(a){
          if (!a || !a.ok || !a.count) { box.innerHTML = ''; return; }
          var avg = (a.trimmed_avg != null) ? Number(a.trimmed_avg).toFixed(1) : '—';
          box.innerHTML = wrap(
            _tpSumStat(avg + '<span style="font-size:12px;color:#9ca3af;font-weight:600">/7</span>', en ? 'Avg rating · 90d' : '평점 · 최근 90일') +
            _tpSumStat(a.count, en ? 'Ratings' : '평가 건수')
          );
        }).catch(function(){ box.innerHTML = ''; });
    } else if (key === 'pay') {
      var tid = modal.getAttribute('data-tid');
      var now = new Date(); var y = now.getFullYear(); var mo = now.getMonth() + 1;
      fetch('/api/admin/payroll/lessons?year=' + y + '&month=' + mo + '&teacher_id=' + encodeURIComponent(tid), { credentials: 'include' })
        .then(function(r){ return r.json(); }).then(function(d){
          if (!d || !d.ok) { box.innerHTML = ''; return; }
          var done = (d.lessons || []).filter(function(l){ return l && l.status !== 'upcoming'; }).length;
          box.innerHTML = wrap(
            _tpSumStat(done + (en ? '' : '회'), en ? ('Lessons done · ' + y + '.' + mo) : '이달 완료 수업')
          );
        }).catch(function(){ box.innerHTML = ''; });
    }
  } catch(e){ /* graceful */ }
};
function _tpField(label, val) {
  if (!val) return '';
  return '<div style="display:flex;font-size:13px;padding:4px 0"><div style="min-width:90px;color:#6b7280;font-weight:600">' + label + '</div><div>' + _aiEsc(String(val)) + '</div></div>';
}
async function editTeacherProfile(id) {
  // 🚀 목록 캐시 우선(즉시 열림), 없을 때만 fetch
  let t = (window._tpRowById && window._tpRowById[id]) || null;
  if (!t) {
    const r = await fetch('/api/admin/teacher-profiles/' + id, { credentials:'include' });
    const d = await r.json().catch(()=>({}));
    if (!r.ok || !d.ok) { alert('조회 실패'); return; }
    t = d.item;
  }
  // 폼에 값 채우고 펼침
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('tp-name', t.korean_name); set('tp-en-name', t.english_name); set('tp-email', t.email);
  set('tp-phone', t.phone); set('tp-kakao', t.kakao_id); set('tp-dob', t.dob); set('tp-gender', t.gender);
  set('tp-mbti', t.mbti);
  await _tpLoadTeacherOptions();   // 🔗 드롭다운이 채워진 뒤에 값을 지정해야 선택이 반영된다
  set('tp-linked-teacher', t.linked_teacher_id);
  set('tp-active-region', t.active_region); set('tp-origin-region', t.origin_region);
  set('tp-fee-10min', t.fee_per_10min); set('tp-group', t.group_name); set('tp-status', t.status||'활동중');
  set('tp-join-date', t.join_date); set('tp-leave-date', t.leave_date);
  set('tp-image-url', t.image_url); set('tp-image-url-text', t.image_url); set('tp-video-url', t.intro_video_url);
  // 프로필 이미지 미리보기 복원
  (function(){
    const url = t.image_url || '';
    const pv = document.getElementById('tp-image-preview');
    const info = document.getElementById('tp-image-info');
    const fileInput = document.getElementById('tp-image-file');
    if (fileInput) fileInput.value = '';
    if (pv && info) {
      if (url && /^(data:image\/|https?:\/\/.*\.(png|jpe?g|gif|webp|svg))/i.test(url)) {
        pv.src = url;
        pv.style.display = 'block';
        info.textContent = url.startsWith('data:') ? '📷 저장된 이미지 (새 파일 선택 시 교체됨)' : '📷 ' + url;
      } else if (url && /^data:application\/pdf/i.test(url)) {
        pv.style.display = 'none';
        info.textContent = '📄 저장된 PDF 파일 (새 파일 선택 시 교체됨)';
      } else if (url) {
        pv.style.display = 'none';
        info.textContent = '🔗 ' + url;
      } else {
        pv.style.display = 'none';
        info.textContent = '';
      }
    }
  })();
  set('tp-education', t.education); set('tp-career', t.career); set('tp-cert', t.certifications);
  set('tp-avail-days', t.available_days); set('tp-avail-hours', t.available_hours);
  set('tp-bank-name', t.bank_name); set('tp-bank-acct', t.bank_account); set('tp-notes', t.notes);
  // 🔑 (2026-08-24) 로그인 계정 — teacher_account_links 로 이미 연결돼 있으면 아이디를 보여주고,
  //   없으면 이유를 알려준다(추측하지 않음). 비밀번호 변경 버튼은 경영진·본사 관리자만.
  (function () {
    const block = document.getElementById('tp-login-block');
    const hint = document.getElementById('tp-login-hint');
    const btn = document.getElementById('tp-login-pwreset-btn');
    if (!block) return;
    block.style.display = (typeof _tpCanResetPw === 'function' && _tpCanResetPw()) ? 'block' : 'none';
    set('tp-login-username', t.login_username || '');
    if (btn) btn.disabled = !t.login_username;
    if (hint) {
      var _en = (window.adminLang === 'en');
      hint.textContent = t.login_username
        ? (_en ? 'Logs in with this ID. If forgotten, reset the password here.'
                : '이 아이디로 로그인합니다. 잊었을 때 여기서 새 비밀번호로 재설정할 수 있습니다.')
        : (_en ? 'Link a login account first via the 🔗 Link Teacher Accounts card to see the ID and change the password.'
                : '🔗 강사 계정 연결 카드에서 로그인 계정을 먼저 연결해야 아이디가 보이고 비밀번호를 바꿀 수 있습니다.');
    }
  })();
  // Add 버튼을 임시로 "수정 저장" 으로 변경
  const btn = document.getElementById('tp-add-btn');
  if (btn) {
    btn.textContent = '💾 수정 저장 (#' + id + ')';
    btn.dataset.editId = id;
  }
  // 폼 펼침
  const formDetails = document.querySelector('#card-teacher-mgmt details details');
  if (formDetails) formDetails.open = true;
  document.getElementById('tp-name')?.focus();
}
// 강사 제거 — 이중 확인(더블 체크): 1차 클릭=버튼 무장(경고 표시), 2차 클릭=확인창→삭제
function _tpDisarmDel(btn) {
  if (!btn || !btn.dataset) return;
  clearTimeout(btn._tpDisarmT);
  btn.dataset.armed = '';
  if (typeof btn._tpPrevHtml === 'string') btn.innerHTML = btn._tpPrevHtml;
  btn.classList.remove('tp-act--del-armed');
  btn.title = '제거';
}
/* 🟢⏸️🚪 강사 «상태» 를 명부에서 그 자리에 바꾸기 — 샘플 A안 (2026-09-01 사장님 지시)
   ═══════════════════════════════════════════════════════════════════════════
   [왜] 「퇴사한 강사를 비활동으로 바꾸고 싶다 — 안보임이 아니라 비활동으로.
       즉 활동, 비활동, 그리고 안보임.」

       상태 세 값은 원래도 있었다(수정 모달·필터·배지·PATCH 까지). 그런데
       2026-09-01 운영 D1 실측으로 33행 중 «비활동 0건» 이었다. 바꾸는 길이
       멀었기 때문이다 — ✏️ 수정 → 모달 → 스크롤 → 드롭다운 → 저장.
       그래서 명부에서 사람을 빼는 실제 수단이 🗑 «영구 삭제» 뿐이었다.
       이 절이 하는 일은 그 길을 «배지 클릭 두 번» 으로 줄이는 것이다.

   [두 축] status(활동중·비활동·퇴사) 와 list_hidden(명부 노출)은 **다른 축**이다.
       판정 정본은 서버 src/teacher-status.ts. ⛔ 「안보임」을 status 값으로
       만들지 말 것 — 그러면 «퇴사했지만 정산이 남아 명부에 남길 사람» 과
       «활동중인데 감추고 싶은 행»(실측: 테스트강사·파라테스트)을 함께 못 적는다.

   [함정 세 개를 피해 만들었다]
     ① 전역 룰 `details.menu-card button{background:인디고!important; padding:9px 18px!important}`
        이 카드 «안» 의 모든 버튼을 뭉갠다. 그래서 ⓐ 트리거 버튼은
        `#tp-list-table td button.tp-st-btn` (ID 접두)로 되살리고
        ⓑ 메뉴 자체는 `document.body` 에 띄워 그 선택자에 아예 안 걸리게 했다.
     ② 표가 `overflow-x:auto` 상자 안이라(admin.html 3984행) 셀 안에 절대배치하면
        세로로 잘린다. 그래서 body + position:fixed 다.
     ③ ⚠️ PC 관리자 화면은 `body{zoom:1.3}`(+JS 미세조정)이다. getBoundingClientRect()
        는 zoom 이 «곱해진» 화면 좌표인데, body 안의 fixed 요소는 zoom «안쪽»
        좌표계를 쓴다. 그래서 좌표를 배율로 나눈다(_tpStZoom). 나누지 않으면
        배율이 커질수록 메뉴가 오른쪽 아래로 밀려난다.
   ⛔ 상주 MutationObserver·setInterval 로 위치를 지키지 말 것(홈을 통째로 멎게 한 전력).
      스크롤·리사이즈에서는 그냥 닫는다.
   감시: test-harness/teacher_status_inline_harness.mjs */

/** 서버 src/teacher-status.ts 의 TEACHER_STATUSES 와 «같은 목록» 이어야 한다(하니스가 대조). */
var TP_STATUS_LIST = ['활동중', '비활동', '퇴사'];
/** 필터 드롭다운에서 「🙈 안보임」이 쓰는 값. 이 값은 서버로 status 로 가지 않는다. */
var TP_STATUS_HIDDEN_FILTER = '__hidden__';

/** 「지금 수업을 맡을 수 있는 강사인가」 — 서버 정본 `isActiveTeacherStatus`(src/teacher-status.ts)와
 *  **같은 규칙**이어야 한다(하니스가 두 함수를 나란히 돌려 대조한다).
 *  ⚠️ NULL·빈 값은 «활동중» 이다 — 옛 행에는 상태 칸이 아예 없어서, 모르면 «막지 않는» 쪽으로 실패한다.
 *     여기서 false 로 떨어뜨리면 상태를 한 번도 안 만진 강사 전원의 버튼이 흐려진다. */
function _tpIsWorking(status) {
  if (status === null || status === undefined) return true;
  var s = String(status).trim();
  if (!s) return true;
  /* ⚠️ 옛 별칭을 빠뜨리면 «재직» 으로 저장된 강사가 통째로 흐려진다 —
     정본 TEACHER_STATUS_ALIAS 와 같은 표다(하니스가 두 함수를 돌려 대조한다). */
  var alias = { '재직': '활동중', 'active': '활동중', 'inactive': '비활동', 'resigned': '퇴사' };
  var canon = (s === '활동중' || s === '비활동' || s === '퇴사') ? s
            : (alias[s] || alias[s.toLowerCase()] || '');
  return canon === '활동중';
}
window._tpIsWorking = _tpIsWorking;

var _tpStMenu = null;      // 열려 있는 메뉴 element
var _tpStUndoT = null;     // 되돌리기 토스트 타이머

/** body{zoom:1.3} 보정 — 위 함정 ③. 모바일(zoom 없음)에서는 1 이라 무해하다. */
function _tpStZoom() {
  try {
    var inline = document.body && document.body.style && document.body.style.zoom;
    var z = parseFloat(inline || (window.getComputedStyle(document.body).zoom || '1'));
    return (z && isFinite(z) && z > 0) ? z : 1;
  } catch (e) { return 1; }
}

function _tpStIsEn() { return (typeof adminLang !== 'undefined' && adminLang === 'en'); }

/** ⚠️ 계정 연결이 두 개 이상인 강사에 붙는 표시. 이름 아래 한 줄.
 *  ⚠️ 배경은 background-color 로 준다 — `background:#f…` 는 admin-inline-c.css 의 옛 규칙에
 *     !important 로 먹혀 투명해진다(같은 파일 상태 배지에서 실측). */
function _tpLinkDupChip(t) {
  var L = _tpStIsEn();
  var n = Number(t.login_link_count || 0);
  var ko = '⚠ 계정 연결 ' + n + '개';
  var en = '⚠ ' + n + ' linked accounts';
  var tipKo = '이 강사에게 로그인 계정이 ' + n + '개 연결돼 있습니다(대개 대소문자만 다른 계정). '
            + '지금 보이는 아이디는 «가장 최근에 연결한» 것입니다. 정리는 강사 계정 연결 카드에서 하세요.';
  var tipEn = n + ' login accounts are linked to this teacher (usually the same id in different letter case). '
            + 'The id shown is the most recently linked one.';
  return '<br><span class="tp-link-dup" data-ko="' + ko + '" data-en="' + en + '" ' +
    'title="' + (L ? tipEn : tipKo) + '" data-ko-title="' + tipKo + '" data-en-title="' + tipEn + '" ' +
    'style="display:inline-block;margin-top:3px;background-color:#fef3c7;color:#854d0e;' +
    'padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;white-space:nowrap">' +
    (L ? en : ko) + '</span>';
}

/** 명부 상태 칸 — 배지를 «누를 수 있는» 버튼으로 감싼다.
 *  ⛔ 이 버튼에 data-ko/data-en 을 달지 말 것 — i18n 엔진이 textContent 를 통째로
 *     갈아끼워 배지가 사라지고 문장이 들어앉는다(CLAUDE.md 2장 「아이콘 버튼에…」).
 *     설명은 data-ko-title/data-en-title 로만 단다. */
function _tpStatusCell(t) {
  var L = _tpStIsEn();
  var hidden = Number((t && t.list_hidden) || 0) === 1;
  var tipKo = '눌러서 상태를 바꿉니다 — 활동중 · 비활동 · 퇴사 (5초 안에 되돌리기 가능)';
  var tipEn = 'Click to change status — Active · Inactive · Resigned (undo within 5s)';
  return '<button type="button" class="tp-st-btn" id="tpstb-' + t.id + '" aria-haspopup="menu" ' +
    'onclick="window.tpOpenStatusMenu && window.tpOpenStatusMenu(' + t.id + ',this)" ' +
    'title="' + (L ? tipEn : tipKo) + '" data-ko-title="' + tipKo + '" data-en-title="' + tipEn + '">' +
      _tpStatusBadge(t.status) +
      (hidden ? '<span class="tp-st-hidden" data-ko="🙈 안보임" data-en="🙈 Hidden">' +
                (L ? '🙈 Hidden' : '🙈 안보임') + '</span>' : '') +
      '<span class="tp-st-caret" aria-hidden="true">▾</span>' +
    '</button>';
}

/** 상태 칸 하나만 다시 그린다. ⛔ 표 전체를 다시 그리지 않는다 —
 *  행을 갈아치우면 조준하고 있던 버튼이 마우스 아래에서 움직인다(2026-08-12 방 목록 사고). */
function _tpStRepaint(id) {
  var t = (window._tpRowById || {})[id];
  var td = document.getElementById('tpstc-' + id);
  if (!t || !td) return;
  td.innerHTML = _tpStatusCell(t);
  var tr = td.closest ? td.closest('tr') : null;
  if (tr) tr.setAttribute('data-hidden', Number(t.list_hidden || 0) === 1 ? '1' : '0');
}

function _tpStCloseMenu() {
  if (_tpStMenu && _tpStMenu.parentNode) _tpStMenu.parentNode.removeChild(_tpStMenu);
  _tpStMenu = null;
  document.removeEventListener('keydown', _tpStOnKey, true);
  window.removeEventListener('scroll', _tpStFollow, true);
  window.removeEventListener('resize', _tpStFollow);
}

/** 메뉴를 버튼 아래에 놓는다. 화면 좌표(rect)를 배율로 나눠 zoom «안쪽» 좌표계로 옮긴다. */
function _tpStPlace(m, btn) {
  var z = _tpStZoom();
  var r = btn.getBoundingClientRect();
  var vw = window.innerWidth / z, vh = window.innerHeight / z;
  var mw = m.offsetWidth, mh = m.offsetHeight;
  var left = r.left / z;
  var top  = r.bottom / z + 4;
  if (left + mw > vw - 8) left = Math.max(8, vw - mw - 8);         // 오른쪽으로 넘치면 당긴다
  if (top + mh > vh - 8) top = Math.max(8, r.top / z - mh - 4);    // 아래가 좁으면 위로 편다
  m.style.left = left + 'px';
  m.style.top  = top + 'px';
}

/* 🪤 스크롤에 «닫으면» 안 된다 — 버튼을 누르면 포커스가 가면서 브라우저가 스스로 스크롤하고,
     그 scroll 이 여는 클릭 직후에 도착해 **열리자마자 닫힌다**(2026-09-01 브라우저 실측으로 잡음).
     그래서 닫지 말고 «따라가게» 한다. 버튼이 화면 밖으로 나가면 그때만 닫는다.
   ⛔ 상주 리스너가 아니다 — 메뉴가 열려 있는 동안만 살고 _tpStCloseMenu 가 뗀다. */
function _tpStFollow() {
  if (!_tpStMenu) return;
  /* 🔴 (2026-09-01) 버튼을 «id 를 조립해» 찾지 말 것 — 이 상자는 상태 메뉴와 구분 메뉴가
     함께 쓰는데 열쇠 모양이 다르다(101 대 rg:101). 조립하면 구분 메뉴에서 tpstb-rg:101 = null 이
     되어 **스크롤 한 번에 무조건 닫혔다**(trap-check 가 잡음: 열린 뒤 20px 만 굴려도 사라짐).
     열 때 붙여 둔 «그 버튼» 을 그대로 쓰고, 조립은 옛 메뉴를 위한 폴백으로만 남긴다. */
  var btn = _tpStMenu.__btn ||
            document.getElementById('tpstb-' + _tpStMenu.getAttribute('data-tid'));
  if (!btn || !document.body.contains(btn)) { _tpStCloseMenu(); return; }
  var r = btn.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) { _tpStCloseMenu(); return; }
  _tpStPlace(_tpStMenu, btn);
}
function _tpStOnKey(e) { if (e && e.key === 'Escape') { _tpStCloseMenu(); } }

window.tpOpenStatusMenu = function (id, btn) {
  var already = _tpStMenu && _tpStMenu.getAttribute('data-tid') === String(id);
  _tpStCloseMenu();
  if (already) return;                       // 같은 버튼을 다시 누르면 닫기
  var t = (window._tpRowById || {})[id] || {};
  var L = _tpStIsEn();
  var cur = (t.status || '활동중');
  var hidden = Number(t.list_hidden || 0) === 1;

  var m = document.createElement('div');
  m.id = 'tp-st-menu'; m.setAttribute('role', 'menu'); m.setAttribute('data-tid', String(id));
  var html = '';
  TP_STATUS_LIST.forEach(function (s) {
    html += '<div class="tp-st-item' + (s === cur ? ' on' : '') + '" role="menuitem" tabindex="0" ' +
            'data-act="status" data-val="' + s + '">' + _tpStatusBadge(s) +
            (s === cur ? '<span class="tp-st-chk" aria-hidden="true">✓</span>' : '') + '</div>';
  });
  html += '<div class="tp-st-sep"></div>';
  var hideTipKo = '명부와 관리자 화면의 강사 후보 목록에서 빠집니다. 지워지지 않고 「🙈 안보임」 필터에서 볼 수 있습니다';
  var hideTipEn = 'Removed from the roster and admin teacher pickers. Not deleted — find it under the “Hidden” filter';
  html += '<div class="tp-st-item" role="menuitem" tabindex="0" data-act="hidden" data-val="' +
          (hidden ? '0' : '1') + '" title="' + (L ? hideTipEn : hideTipKo) + '">' +
          (hidden ? (L ? '👁 Show in roster' : '👁 명부에 다시 보이기')
                  : (L ? '🙈 Hide from roster' : '🙈 명부에서 숨기기')) + '</div>';
  m.innerHTML = html;
  document.body.appendChild(m);

  var pick = function (el) {
    if (!el) return;
    var act = el.getAttribute('data-act'), val = el.getAttribute('data-val');
    _tpStCloseMenu();
    if (act === 'status') window.tpSetTeacherStatus(id, val);
    else if (act === 'hidden') window.tpSetTeacherHidden(id, val === '1');
  };
  m.addEventListener('click', function (e) {
    var it = e.target && e.target.closest ? e.target.closest('.tp-st-item') : null;
    if (it) { e.stopPropagation(); pick(it); }
  });
  m.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var it = e.target && e.target.closest ? e.target.closest('.tp-st-item') : null;
      if (it) { e.preventDefault(); pick(it); }
    }
  });

  _tpStPlace(m, btn);          // 자리 잡기(함정 ③ — zoom 보정은 그 함수 안에)
  m.__btn = btn;               // 스크롤 때 «따라갈» 버튼 (id 조립 금지 — _tpStFollow 주석)
  _tpStMenu = m;

  setTimeout(function () {
    document.addEventListener('click', function once(ev) {
      if (_tpStMenu && _tpStMenu.contains(ev.target)) return;
      document.removeEventListener('click', once, true);
      _tpStCloseMenu();
    }, true);
  }, 0);
  document.addEventListener('keydown', _tpStOnKey, true);
  window.addEventListener('scroll', _tpStFollow, true);
  window.addEventListener('resize', _tpStFollow);
};

/** 한 칸만 저장한다. 실패하면 «고치기 전» 으로 되돌려 놓고 사실대로 알린다. */
async function _tpStPatch(id, patch) {
  try {
    var r = await fetch('/api/admin/teacher-profiles/' + id, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    var d = await r.json().catch(function () { return {}; });
    /* ✅ «실패라고 말했는가» 가 아니라 «성공이라고 말했는가» 로 판정한다 —
       종단 404 본문에는 ok 칸이 아예 없어 `d.ok === false` 는 그냥 통과한다
       (CLAUDE.md 2장 「404 는 Not Found 로 안 보일 수 있다」). */
    if (!r.ok || d.ok !== true) {
      return { ok: false, msg: d.message || d.error || ('HTTP ' + r.status) };
    }
    return { ok: true, data: d };
  } catch (e) {
    return { ok: false, msg: String(e) };
  }
}

/** 되돌리기 토스트. 5초 뒤 사라진다. */
function _tpStToast(ko, en, undoFn) {
  var L = _tpStIsEn();
  var olds = document.querySelectorAll('#tp-st-toast');
  for (var i = 0; i < olds.length; i++) olds[i].parentNode.removeChild(olds[i]);   // 겹쳐 쌓이지 않게 전부
  clearTimeout(_tpStUndoT);

  var box = document.createElement('div');
  box.id = 'tp-st-toast'; box.setAttribute('role', 'status');
  var msg = document.createElement('span');
  msg.className = 'tp-st-toast-msg';
  msg.setAttribute('data-ko', ko); msg.setAttribute('data-en', en);
  msg.textContent = L ? en : ko;
  box.appendChild(msg);
  if (undoFn) {
    var u = document.createElement('button');
    u.type = 'button'; u.className = 'tp-st-undo';
    u.setAttribute('data-ko', '되돌리기'); u.setAttribute('data-en', 'Undo');
    u.textContent = L ? 'Undo' : '되돌리기';
    u.addEventListener('click', function () {
      box.parentNode && box.parentNode.removeChild(box);
      clearTimeout(_tpStUndoT);
      undoFn();
    });
    box.appendChild(u);
  }
  document.body.appendChild(box);
  _tpStUndoT = setTimeout(function () {
    if (box.parentNode) box.parentNode.removeChild(box);
  }, 5000);
}

/** 🟢⏸️🚪 상태 바꾸기 — 화면을 먼저 바꾸고 저장한다(실패하면 되돌린다). */
window.tpSetTeacherStatus = async function (id, next, _isUndo) {
  var t = (window._tpRowById || {})[id];
  if (!t) return;
  var prev = t.status || null;
  if (String(prev || '') === String(next)) return;               // 같은 값이면 아무것도 안 한다
  t.status = next; _tpStRepaint(id);

  var res = await _tpStPatch(id, { status: next });
  if (!res.ok) {
    t.status = prev; _tpStRepaint(id);
    alert((_tpStIsEn() ? 'Could not change status: ' : '상태를 바꾸지 못했습니다: ') + res.msg);
    return;
  }
  if (_isUndo) return;                                            // 되돌리기까지 되돌리지는 않는다
  var who = t.korean_name || t.english_name || ('#' + id);
  _tpStToast(who + ' — ' + next + ' 으로 바꿨습니다',
             who + ' — changed to ' + next,
             function () { window.tpSetTeacherStatus(id, prev, true); });
};

/** 🙈 명부에서 숨기기 / 👁 다시 보이기 — status 와 «다른 축» 이다. 지우는 것이 아니다. */
/* 🙈 명부에서 숨기기 / 👁 다시 보이기 — status 와 «다른 축» 이다. 지우는 것이 아니다.
   🔴 «되돌리기» 는 행 캐시(window._tpRowById)에 기대면 안 된다 —
      이 함수는 끝에서 loadTeacherProfiles() 를 부르고, 그 함수가 캐시를 통째로 비운 뒤
      **응답에 온 행만** 다시 채운다. 방금 숨긴 행은 기본 조회에서 빠지므로
      5초 뒤 사람이 「되돌리기」를 눌러도 `if (!t) return` 에서 **조용히 사라졌다**
      (2026-09-01 trap-check 가 잡음. 에러도 안 나서 「눌러도 아무 일 없음」으로만 보인다).
      「🙈 안보임」 필터에서 되살릴 때도 대칭으로 같다(그 조회는 숨긴 행«만» 준다).
   ✅ 그래서 되돌리기에 필요한 것(이름·되돌릴 값)을 **닫힘(closure)으로 넘긴다.**
      캐시는 «있으면 쓰고 없으면 없는 대로» 간다. */
window.tpSetTeacherHidden = async function (id, hide, _isUndo, _name) {
  var t = (window._tpRowById || {})[id];
  var who = _name || (t && (t.korean_name || t.english_name)) || ('#' + id);
  if (t) {
    if ((Number(t.list_hidden || 0) === 1) === !!hide) return;   // 이미 그 값이면 아무것도 안 한다
    t.list_hidden = hide ? 1 : 0; _tpStRepaint(id);              // 화면 먼저(캐시가 있을 때만)
  }

  var res = await _tpStPatch(id, { list_hidden: hide ? 1 : 0 });
  if (!res.ok) {
    if (t) { t.list_hidden = hide ? 0 : 1; _tpStRepaint(id); }   // 실패하면 «고치기 전» 으로
    alert((_tpStIsEn() ? 'Could not change visibility: ' : '명부 노출을 바꾸지 못했습니다: ') + res.msg);
    return;
  }
  if (!_isUndo) {
    /* ⚠️ 「명부에서」라고만 적으면 사실보다 좁다 — 같은 목록 API 를 쓰는 관리자 화면
       (레벨테스트 강사 배정 후보 등)에서도 함께 빠진다. 화면이 그걸 말하게 한다. */
    _tpStToast(who + (hide ? ' — 명부와 강사 후보 목록에서 숨겼습니다 (지워진 것이 아닙니다)'
                           : ' — 명부에 다시 보입니다'),
               who + (hide ? ' — hidden from the roster and teacher pickers (not deleted)'
                           : ' — visible in the roster again'),
               function () { window.tpSetTeacherHidden(id, !hide, true, who); });
  }
  /* 숨김은 «지금 보고 있는 목록에 그 행이 속하는가» 를 바꾼다 → 목록을 다시 읽는다.
     (상태 변경과 달리 칸만 칠해서는 건수(N명)가 거짓말을 한다) */
  if (typeof loadTeacherProfiles === 'function') loadTeacherProfiles();
};

/* ══════════════════════════════════════════════════════════════════════════════
   🌏 구분(국가권) — 필리핀 · 북미 · 중국          (2026-09-01 사장님 지시)
   ──────────────────────────────────────────────────────────────────────────────
   「국가 추가해서 필리핀, 북미, 중국, 이렇게도 나눠줘 / 구분칸 추가해줘」

   ⛔ 여기서 «무슨 구분인지» 를 판정하지 않는다. 판정 정본은 서버 src/teacher-region.ts
      하나뿐이고, 목록 API 가 행마다 t.region 을 실어 준다. 저장한 뒤의 값도 서버가
      다시 판정해 PATCH 응답의 region 으로 돌려준다.
      ⚠️ 판정을 화면에도 한 벌 두면 반드시 어긋난다(이 저장소의 반복 사고).

   ⚠️ 바꾸는 것은 «국적(nationality)» 이고 보이는 것은 «구분» 이다 — 북미는 미국·캐나다를
      묶은 칸이라 «북미» 라는 코드를 저장하지 않는다(어느 나라인지 모르면서 아는 척하게 된다).
      그래서 메뉴에는 나라를 늘어놓고, 표에는 묶음을 그린다.

   ⚠️ 실측(2026-09-01 운영 D1 33행): nationality 가 채워진 행은 1개뿐이고 나머지는
      출신·활동 지역 글자로 읽힌다. 그래서 「지금은 지역 글자로 읽고 있습니다」를 메뉴가 말한다.
   감시: test-harness/teacher_region_harness.mjs */

/** 서버 src/teacher-region.ts 의 목록과 «같아야» 한다(하니스가 대조). */
var TP_REGION_LABEL = {
  PH:  { ko: '필리핀',    en: 'Philippines',    bg: '#e0f2fe', color: '#075985' },
  NA:  { ko: '북미',      en: 'North America',  bg: '#ede9fe', color: '#5b21b6' },
  CN:  { ko: '중국',      en: 'China',          bg: '#ffe4e6', color: '#9f1239' },
  ETC: { ko: '기타 국가', en: 'Other',          bg: '#f1f5f9', color: '#334155' }
};
/** 메뉴에 늘어놓는 나라. value 는 admin.html #tp-nationality 와 같은 ISO 2글자다. */
var TP_REGION_PICK = [
  { code: 'PH', ko: '필리핀',        en: 'Philippines' },
  { code: 'US', ko: '미국 (북미)',   en: 'United States (N. America)' },
  { code: 'CA', ko: '캐나다 (북미)', en: 'Canada (N. America)' },
  { code: 'CN', ko: '중국',          en: 'China' },
  { code: 'ZZ', ko: '기타 국가',     en: 'Other country' },
  { code: '',   ko: '— 미지정으로 비우기', en: '— Clear (unset)' }
];

/** 구분 배지. ⚠️ class 에 tp-st-badge 를 함께 단다 — 글자색을 인라인 !important 로 덮는
 *  페인터 셋(adm-s12·adm-s13·adm-light-surfaces)이 그 선택자만 비켜 가기 때문이다.
 *  ⚠️ 배경은 background-color 로 준다(`background:#f…` 는 옛 다크 규칙에 먹혀 투명해진다). */
function _tpRegionBadge(region) {
  var L = _tpStIsEn();
  var r = TP_REGION_LABEL[region];
  if (!r) {
    return '<span class="tp-st-badge tp-rg-badge" data-ko="— 미지정" data-en="— Unset" ' +
      /* ⚠️ #6b7280 은 이 배경에서 대비 4.39 로 AA(4.5) 아래였다(trap-check 실측).
         이 배지는 글자색 페인터 예외라 «자동 구제» 도 안 받는다 — 색을 직접 어둡게 둔다. */
      'style="background-color:#f3f4f6;color:#4b5563;padding:2px 8px;border-radius:999px;' +
      'font-size:11px;font-weight:600;white-space:nowrap">' + (L ? '— Unset' : '— 미지정') + '</span>';
  }
  return '<span class="tp-st-badge tp-rg-badge" data-ko="' + r.ko + '" data-en="' + r.en + '" ' +
    'style="background-color:' + r.bg + ';color:' + r.color + ';padding:2px 8px;border-radius:999px;' +
    'font-size:11px;font-weight:600;white-space:nowrap">' + (L ? r.en : r.ko) + '</span>';
}

/** 구분 칸 — 상태 칸과 같은 방식으로 «누를 수 있는» 버튼이다.
 *  ⛔ 이 버튼에 data-ko/data-en 을 달지 말 것(i18n 이 textContent 를 통째로 갈아끼운다). */
function _tpRegionCell(t) {
  var L = _tpStIsEn();
  var tipKo = '눌러서 국가를 바꿉니다 — 필리핀 · 미국 · 캐나다 · 중국 (5초 안에 되돌리기 가능)';
  var tipEn = 'Click to change country — PH · US · CA · CN (undo within 5s)';
  return '<button type="button" class="tp-st-btn" id="tprgb-' + t.id + '" aria-haspopup="menu" ' +
    'onclick="window.tpOpenRegionMenu && window.tpOpenRegionMenu(' + t.id + ',this)" ' +
    'title="' + (L ? tipEn : tipKo) + '" data-ko-title="' + tipKo + '" data-en-title="' + tipEn + '">' +
      _tpRegionBadge(t.region) +
      '<span class="tp-st-caret" aria-hidden="true">▾</span>' +
    '</button>';
}

/** 구분 칸 하나만 다시 그린다(표 전체를 다시 그리지 않는다 — 상태 칸과 같은 이유). */
function _tpRgRepaint(id) {
  var t = (window._tpRowById || {})[id];
  var td = document.getElementById('tprgc-' + id);
  if (!t || !td) return;
  td.innerHTML = _tpRegionCell(t);
}

window.tpOpenRegionMenu = function (id, btn) {
  /* ⚠️ data-tid 앞에 'rg:' 를 붙인다 — 상태 메뉴와 같은 상자(#tp-st-menu)를 쓰므로,
     접두사가 없으면 같은 행에서 상태→구분으로 옮겨 누를 때 «같은 메뉴» 로 보고 닫기만 한다. */
  var key = 'rg:' + id;
  var already = _tpStMenu && _tpStMenu.getAttribute('data-tid') === key;
  _tpStCloseMenu();
  if (already) return;
  var t = (window._tpRowById || {})[id] || {};
  var L = _tpStIsEn();
  var cur = String(t.nationality || '').toUpperCase();

  var m = document.createElement('div');
  m.id = 'tp-st-menu'; m.setAttribute('role', 'menu'); m.setAttribute('data-tid', key);
  var html = '';
  /* ⚠️ 국적이 비어 있는데 구분이 잡혀 있으면 «어디서 읽었는지» 를 말해 준다.
     안 말하면 「분명 안 골랐는데 필리핀이라고 나온다」가 된다(실측: 32명이 이 상태). */
  if (!cur && t.region) {
    html += '<div class="tp-st-note">' +
      (L ? 'Now read from the region text — pick a country to fix it'
         : '지금은 출신·활동 지역 «글자» 로 읽고 있습니다 — 나라를 고르면 그 값이 정본이 됩니다') +
      '</div><div class="tp-st-sep"></div>';
  }
  /* ⚠️ 목록에 없는 나라(GB·AU·VN·KR…)를 이미 갖고 있을 수 있다. 그대로 두면 ✓ 가 아무 데도
     안 붙고, 사람이 「기타 국가」를 누르는 순간 **영국이 ZZ 로 덮인다**(정보 소실 — trap-check 지적).
     그래서 «지금 값» 을 항목으로 함께 놓아, 무엇인지 보이고 되돌아올 수 있게 한다. */
  var known = TP_REGION_PICK.map(function (o) { return o.code; });
  var picks = TP_REGION_PICK.slice();
  if (cur && known.indexOf(cur) < 0) {
    picks.unshift({ code: cur, ko: cur + ' (지금 값)', en: cur + ' (current)' });
  }
  picks.forEach(function (o, i) {
    if (o.code === '' && i > 0) html += '<div class="tp-st-sep"></div>';
    var on = (o.code === cur);
    html += '<div class="tp-st-item' + (on ? ' on' : '') + '" role="menuitem" tabindex="0" ' +
            'data-act="region" data-val="' + o.code + '">' + (L ? o.en : o.ko) +
            (on ? '<span class="tp-st-chk" aria-hidden="true">✓</span>' : '') + '</div>';
  });
  m.innerHTML = html;
  document.body.appendChild(m);

  var pick = function (el) {
    if (!el) return;
    var val = el.getAttribute('data-val');
    _tpStCloseMenu();
    window.tpSetTeacherRegion(id, val);
  };
  m.addEventListener('click', function (e) {
    var it = e.target && e.target.closest ? e.target.closest('.tp-st-item') : null;
    if (it) { e.stopPropagation(); pick(it); }
  });
  m.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var it = e.target && e.target.closest ? e.target.closest('.tp-st-item') : null;
      if (it) { e.preventDefault(); pick(it); }
    }
  });

  _tpStPlace(m, btn);
  m.__btn = btn;               // 스크롤 때 «따라갈» 버튼 (id 조립 금지 — _tpStFollow 주석)
  _tpStMenu = m;
  setTimeout(function () {
    document.addEventListener('click', function once(ev) {
      if (_tpStMenu && _tpStMenu.contains(ev.target)) return;
      document.removeEventListener('click', once, true);
      _tpStCloseMenu();
    }, true);
  }, 0);
  document.addEventListener('keydown', _tpStOnKey, true);
  window.addEventListener('scroll', _tpStFollow, true);
  window.addEventListener('resize', _tpStFollow);
};

/** 🌏 국적 바꾸기. 저장한 «뒤» 에 그린다 — 보이는 값(구분)은 서버가 판정하기 때문이다.
 *  🔴 되돌리기에 필요한 것(이름·되돌릴 코드)은 «닫힘» 으로 넘긴다 — 구분 필터가 걸려 있으면
 *     저장 뒤 그 행이 목록에서 빠지고, 행 캐시(window._tpRowById)에서도 사라져
 *     「되돌리기」가 조용히 아무 일도 안 하게 된다(2026-09-01 숨기기에서 실제로 밟은 함정). */
window.tpSetTeacherRegion = async function (id, code, _isUndo, _name, _prev) {
  var t = (window._tpRowById || {})[id];
  var who = _name || (t && (t.korean_name || t.english_name)) || ('#' + id);
  var prev = (_prev !== undefined) ? _prev : ((t && t.nationality) || '');
  var next = String(code || '').toUpperCase();
  if (String(prev || '').toUpperCase() === next) return;      // 같은 값이면 아무것도 안 한다

  var res = await _tpStPatch(id, { nationality: next || null });
  if (!res.ok) {
    alert((_tpStIsEn() ? 'Could not change country: ' : '국가를 바꾸지 못했습니다: ') + res.msg);
    return;
  }
  if (t) {
    t.nationality = next || null;
    /* 구분은 서버가 판정한 값만 쓴다. 안 왔으면 화면이 지어내지 않고 목록을 다시 읽는다. */
    if (res.data && typeof res.data.region === 'string') { t.region = res.data.region; _tpRgRepaint(id); }
    else if (typeof loadTeacherProfiles === 'function') { loadTeacherProfiles(); }
  } else if (typeof loadTeacherProfiles === 'function') { loadTeacherProfiles(); }

  /* 구분 필터가 걸려 있으면 «이 행이 지금 목록에 속하는가» 가 바뀐다 → 건수가 거짓말하지 않게 다시 읽는다.
     ⚠️ 되돌리기에서도 «똑같이» 해야 한다 — 전에는 `if (_isUndo) return` 뒤에 있어서, 캐시가 남아
        있는 경로에서는 되돌린 뒤 건수가 옛 숫자로 남았을 것이다(trap-check 지적: 지금 맞는 것은
        캐시가 마침 비어 있어 위쪽 else 가지가 다시 읽어 준 «우연» 이었다). */
  var rf = document.getElementById('tp-filter-region');
  if (rf && rf.value && typeof loadTeacherProfiles === 'function') loadTeacherProfiles();

  if (_isUndo) return;
  /* ⚠️ 라벨을 «부를 때의 언어» 하나로 계산해 두 문장에 똑같이 박으면, 토스트가 떠 있는 동안
     🌐 를 눌렀을 때 「changed to 필리핀」이 된다. 한국어·영어를 따로 만든다. */
  var rg = (res.data && typeof res.data.region === 'string') ? res.data.region : '';
  var labKo = (rg && TP_REGION_LABEL[rg]) ? TP_REGION_LABEL[rg].ko : '미지정';
  var labEn = (rg && TP_REGION_LABEL[rg]) ? TP_REGION_LABEL[rg].en : 'Unset';
  _tpStToast(who + ' — ' + labKo + _tpEuroRo(labKo) + ' 바꿨습니다',
             who + ' — changed to ' + labEn,
             function () { window.tpSetTeacherRegion(id, prev, true, who, next); });
};

/** 「…으로 / …로」 — 받침을 보고 고른다. 「북미 으로」처럼 적히면 사람이 읽다 걸린다. */
function _tpEuroRo(word) {
  var w = String(word || '');
  var c = w.charCodeAt(w.length - 1);
  if (!(c >= 0xac00 && c <= 0xd7a3)) return '(으)로';   // 한글이 아니면 단정하지 않는다
  var jong = (c - 0xac00) % 28;
  return (jong === 0 || jong === 8) ? '로' : '으로';     // 받침 없음·ㄹ 받침 → 「로」
}

async function removeTeacherProfile(id, name, btn) {
  // ── 1차 클릭: 무장 (실수 삭제 방지 — 한 번 더 눌러야 확인창) ──
  if (btn && btn.dataset && btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn._tpPrevHtml = btn.innerHTML;
    btn.innerHTML = (window._TP_IC && window._TP_IC.confirmDel) || '?';
    btn.classList.add('tp-act--del-armed');
    btn.title = '한 번 더 누르면 삭제 확인창이 열립니다';
    clearTimeout(btn._tpDisarmT);
    btn._tpDisarmT = setTimeout(function(){ _tpDisarmDel(btn); }, 4000);   // 4초 후 자동 해제
    return;
  }
  // ── 2차 클릭: 최종 확인창 ──
  if (btn) clearTimeout(btn._tpDisarmT);
  const ok = confirm('정말 "' + name + '" 강사를 제거하시겠습니까?\n\n⚠️ 데이터가 영구 삭제되며 되돌릴 수 없습니다.');
  if (!ok) { _tpDisarmDel(btn); return; }
  const r = await fetch('/api/admin/teacher-profiles/' + id, { method:'DELETE', credentials:'include' });
  const d = await r.json().catch(()=>({}));
  if (!r.ok || d.ok === false) { alert('제거 실패: ' + (d.error || ('HTTP ' + r.status))); _tpDisarmDel(btn); return; }
  alert('✅ 제거 완료: ' + name);
  loadTeacherProfiles();
}

// ── 가맹점 ──────────────────────────────────────────────────────────
// 카페24 레거시가 AES 암호문(32자리+ HEX)으로 저장한 전화번호는 복호화 전까지 빈값 취급
function _frnPhone(v) {
  v = (v == null ? '' : String(v)).trim();
  return /^[0-9A-F]{32,}$/i.test(v) ? '' : v;
}
/* 🏛️ 대표지사 목록 캐시 — 지사 표의 «대표지사» 칸 드롭다운을 그리는 데 쓴다.
   지사가 241행이라 행마다 fetch 하면 안 된다. 한 번 받아 두고 같은 목록을 재사용한다. */
let _masterBranches = [];
async function _ensureMasterBranches(force) {
  if (_masterBranches.length && !force) return _masterBranches;
  try {
    const r = await fetch('/api/admin/franchises?view=master',{cache:'no-store',credentials:'include'});
    const d = await r.json().catch(()=>({}));
    if (d && d.ok && Array.isArray(d.items)) _masterBranches = d.items;
  } catch (e) { /* 대표지사를 못 받아도 지사 목록은 보여야 한다 */ }
  return _masterBranches;
}
function _masterOptions(cur) {
  const none = adminLang==='en' ? '— none —' : '— 미지정 —';
  return `<option value="">${none}</option>` + _masterBranches
    .filter(m => m.active !== 0 || Number(m.id) === Number(cur))
    .map(m => `<option value="${m.id}"${Number(m.id)===Number(cur)?' selected':''}>${_esc(m.name)}</option>`).join('');
}
async function loadFranchises() {
  const tb = document.getElementById('franchises-table');
  await _ensureMasterBranches();
  const r = await fetch('/api/admin/franchises',{cache:'no-store',credentials:'include'});
  const d = await r.json().catch(()=>({}));
  if (!d.ok || !d.items || d.items.length === 0) { if (tb) tb.innerHTML='<tr><td colspan="7" class="empty">—</td></tr>'; _populateFranchiseSelect([]); return; }
  if (tb) tb.innerHTML = d.items.map(f =>
    `<tr><td>${f.id}</td><td><b>${_esc(f.name)}</b></td>`
    + `<td><select onchange="assignMasterBranch(${f.id}, this.value, this)" style="padding:2px 6px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;max-width:150px">${_masterOptions(f.master_branch_id)}</select></td>`
    + `<td>${_esc(f.owner_name)||'—'}</td><td>${_esc(_frnPhone(f.phone))||'—'}</td><td>${_esc(f.address)||'—'}</td><td>${_esc(f.opened_at)||'—'}</td></tr>`
  ).join('');
  _populateFranchiseSelect(d.items);
}

/* 🏛️ 대표지사 (2026-08-18 사장님 수정요청 #03)
   서버는 /api/admin/franchises 한 경로에 kind/view 로 붙어 있다 — 새 경로를 내면
   src/index.ts(공동 금지구역)의 라우팅·인증 게이트 두 곳을 고쳐야 하기 때문이다. */
async function loadMasterBranches() {
  const tb = document.getElementById('mbranches-table');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="8" class="empty">불러오는 중…</td></tr>';
  await _ensureMasterBranches(true);
  if (!_masterBranches.length) {
    tb.innerHTML = '<tr><td colspan="8" class="empty">'
      + (adminLang==='en' ? 'No master branches yet. Add one above.' : '등록된 대표지사가 없습니다. 위에서 등록하세요.')
      + '</td></tr>';
    return;
  }
  tb.innerHTML = _masterBranches.map(m => {
    const on = m.active !== 0;
    return `<tr${on?'':' style="opacity:.55"'}><td>${m.id}</td><td><b>${_esc(m.name)}</b></td><td>${_esc(m.region)||'—'}</td>`
      + `<td>${_esc(m.tier)||'—'}</td><td>${_esc(m.owner_name)||'—'}</td><td>${_esc(_frnPhone(m.phone))||'—'}</td>`
      + `<td>${Number(m.branch_count)||0}</td>`
      + `<td><button onclick="setMasterBranchActive(${m.id}, ${on?0:1})" style="padding:2px 9px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">`
      + (on ? (adminLang==='en'?'🟢 active':'🟢 사용중') : (adminLang==='en'?'⏸ paused':'⏸ 중지')) + '</button></td></tr>';
  }).join('');
}
async function addMasterBranch() {
  const e = id => document.getElementById(id);
  const name = ((e('mbr-name')||{}).value||'').trim();
  if (!name) { alert(adminLang==='en'?'Name required':'대표지사 이름은 필수입니다'); return; }
  const d = await _menuPost('/api/admin/franchises', {
    kind: 'master', name,
    region: (e('mbr-region')||{}).value || null,
    tier: (e('mbr-tier')||{}).value || null,
    owner_name: (e('mbr-manager')||{}).value || null,
    phone: (e('mbr-phone')||{}).value || null
  });
  if (d) {
    ['mbr-name','mbr-region','mbr-tier','mbr-manager','mbr-phone'].forEach(id=>{ if(e(id)) e(id).value=''; });
    await loadMasterBranches();
    if (document.getElementById('franchises-table')) loadFranchises();
  }
}
async function setMasterBranchActive(id, active) {
  const d = await _menuPost('/api/admin/franchises', { kind:'master_active', id, active });
  if (d) loadMasterBranches();
}
/* 지사 ↔ 대표지사 배정. 매핑은 franchise_master_map 별도 표라 카페24 야간 동기화가 안 덮는다. */
async function assignMasterBranch(franchiseId, masterId, sel) {
  if (sel) sel.disabled = true;
  // _menuPost 가 실패하면 자기가 alert 를 띄우고 null 을 준다 — 여기서 또 띄우지 않는다.
  const d = await _menuPost('/api/admin/franchises', { kind:'master_assign', franchise_id: franchiseId, master_id: masterId || 0 });
  if (sel) sel.disabled = false;
  if (!d) return;
  await _ensureMasterBranches(true);
  if (document.getElementById('mbranches-table')) loadMasterBranches();
}
window.loadMasterBranches = loadMasterBranches;
window.addMasterBranch = addMasterBranch;
window.setMasterBranchActive = setMasterBranchActive;
window.assignMasterBranch = assignMasterBranch;

/* 🔎 지사 소속 대리점 찾기 (2026-08-18 사장님 수정요청 #05)
   지사 id 로 거른다. 이름으로 거르면 같은 이름의 지사가 둘 이상이라 섞인다
   (CLAUDE.md 「centers.name 이 유일하지 않습니다」). */
let _fbaTimer = null;
function fbaSearch() {
  clearTimeout(_fbaTimer);
  _fbaTimer = setTimeout(_fbaRun, 220);
}
async function _fbaRun() {
  const tb = document.getElementById('fba-table');
  const cnt = document.getElementById('fba-count');
  if (!tb) return;
  const fid = (document.getElementById('fba-branch')||{}).value || '';
  const q   = (((document.getElementById('fba-q')||{}).value)||'').trim();
  if (!fid && !q) {
    tb.innerHTML = '<tr><td colspan="5" class="empty">'
      + (adminLang==='en' ? 'Pick a branch or type an agency name.' : '지사를 고르거나 대리점명을 입력하세요.') + '</td></tr>';
    if (cnt) cnt.textContent = '';
    return;
  }
  tb.innerHTML = '<tr><td colspan="5" class="empty">불러오는 중…</td></tr>';
  try {
    const qs = new URLSearchParams({ limit: '100' });
    if (fid) qs.set('franchise_id', fid);
    if (q) qs.set('q', q);
    const r = await fetch('/api/admin/centers?' + qs.toString(), {cache:'no-store',credentials:'include'});
    const d = await r.json().catch(()=>({}));
    if (!d.ok) throw new Error(d.error || 'API error');
    const items = d.items || [];
    if (cnt) cnt.textContent = (adminLang==='en' ? `${d.total||items.length} found` : `${d.total||items.length}곳`)
      + (items.length < (d.total||0) ? (adminLang==='en' ? ' (first 100)' : ' 중 100곳 표시') : '');
    if (!items.length) {
      tb.innerHTML = '<tr><td colspan="5" class="empty">'
        + (adminLang==='en' ? 'No agency matched.' : '해당하는 대리점이 없습니다.') + '</td></tr>';
      return;
    }
    tb.innerHTML = items.map(c =>
      `<tr><td>${c.id}</td><td><b>${_esc(c.name)}</b></td><td>${_esc(c.franchise_name)||'—'}</td><td>${_esc(c.manager)||'—'}</td><td>${_esc(c.address)||'—'}</td></tr>`
    ).join('');
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="5" class="empty" style="color:#ef4444">에러: ${_esc(e.message||e)}</td></tr>`;
  }
}
window.fbaSearch = fbaSearch;
function _populateFranchiseSelect(items) {
  const placeholder = adminLang==='en' ? 'Select branch…' : '지사 선택…';
  const opts = '<option value="">' + placeholder + '</option>'
    + items.map(f => `<option value="${f.id}">${_esc(f.name)}</option>`).join('');
  const sel = document.getElementById('ct-franchise');
  if (sel) sel.innerHTML = opts;
  // 🔎 «지사 소속 대리점 찾기» 의 지사 드롭다운도 같은 목록을 쓴다(고른 값은 지킨다)
  const fba = document.getElementById('fba-branch');
  if (fba) { const keep = fba.value; fba.innerHTML = opts; if (keep) fba.value = keep; }
}
// 🏢 지사 드롭다운만 필요할 때 (대리점·학원 카드를 먼저 연 경우) — {id,name} 만 받는다.
//    이게 없으면 «조직 관리» 카드를 안 열고 대리점을 등록하려 할 때 지사 목록이 빈칸이었다.
async function _ensureFranchiseSelect() {
  const sel = document.getElementById('ct-franchise');
  if (!sel || sel.options.length > 1) return;
  try {
    const r = await fetch('/api/admin/franchises?fields=min',{cache:'no-store',credentials:'include'});
    const d = await r.json().catch(()=>({}));
    if (d && d.ok && Array.isArray(d.items)) _populateFranchiseSelect(d.items);
  } catch (e) { /* 목록 없이도 등록은 가능(지사 미지정) */ }
}
async function addFranchise() {
  const e = id => document.getElementById(id);
  const name = (e('fr-name').value||'').trim();
  if (!name) { alert(adminLang==='en'?'Name required':'이름은 필수'); return; }
  const d = await _menuPost('/api/admin/franchises', {
    name, owner_name: e('fr-owner').value||null, phone: e('fr-phone').value||null,
    address: e('fr-address').value||null, opened_at: e('fr-opened').value||null
  });
  if (d) { ['fr-name','fr-owner','fr-phone','fr-address','fr-opened'].forEach(id=>e(id).value=''); loadFranchises(); }
}

// ── 🏯 본사 관리 (hq_orgs) ────────────────────────────────────────────
/* (2026-08-18 수정요청 #13) 「시스템 › 조직 관리 › 본사 관리」에 본사 정보가 없다.
   원인은 «못 넣은» 것이 아니라 **표를 채우는 코드가 처음부터 없었던 것**이다 —
   화면(#hq-table)은 2026-08-08 부터 있었지만 그리는 JS 가 저장소에 0곳이라
   열 때마다 "데이터 없음" 만 나왔다. 여기서 목록·검색·등록·수정·삭제를 붙인다.
   서버(/api/admin/org/hq)는 표가 비어 있으면 운영 사이트 «🏢 회사 정보» 푸터의
   법인정보를 한 번만 심는다. 그래서 처음 열면 이미 (주)에듀비전이 들어와 있다. */
let _hqEditId = 0;         // 0 = 등록 모드, >0 = 그 id 를 수정 중
let _hqSearchT = null;
let _hqRows = [];

function _hqSetBtnLabel(btn, ko, en) {
  // 🪤 textContent 로만 쓰면 🌐 를 눌러도 안 따라온다(data-ko/en 루프가 못 본다).
  //    상태에 따라 글자가 바뀌는 버튼은 «그릴 때 사전도 같이» 갱신해야 한다.
  if (!btn) return;
  btn.setAttribute('data-ko', ko);
  btn.setAttribute('data-en', en);
  btn.textContent = (typeof adminLang !== 'undefined' && adminLang === 'en') ? en : ko;
}

async function loadHqOrgs(q) {
  const tb = document.getElementById('hq-table');
  if (!tb) return;
  const term = q == null ? ((document.getElementById('hq-q') || {}).value || '') : q;
  const url = '/api/admin/org/hq' + (term.trim() ? ('?q=' + encodeURIComponent(term.trim())) : '');
  let d = {};
  try {
    const r = await fetch(url, { cache: 'no-store', credentials: 'include' });
    d = await r.json().catch(() => ({}));
  } catch (e) { d = {}; }
  const cnt = document.getElementById('hq-count');
  const EN = (typeof adminLang !== 'undefined' && adminLang === 'en');
  if (!d.ok) {
    tb.innerHTML = '<tr><td colspan="7" class="empty">' + (EN ? 'Failed to load' : '불러오지 못했습니다') + '</td></tr>';
    if (cnt) cnt.textContent = '';
    return;
  }
  _hqRows = d.items || [];
  if (cnt) {
    cnt.textContent = term.trim()
      ? (EN ? (_hqRows.length + ' of ' + (d.total || 0)) : (d.total || 0) + '건 중 ' + _hqRows.length + '건')
      : (EN ? ((d.total || 0) + ' record(s)') : (d.total || 0) + '건');
  }
  if (!_hqRows.length) {
    tb.innerHTML = '<tr><td colspan="7" class="empty">' +
      (term.trim() ? (EN ? 'No match' : '검색 결과 없음') : (EN ? 'No data' : '데이터 없음')) + '</td></tr>';
    return;
  }
  tb.innerHTML = _hqRows.map(h => {
    const v = k => _esc(h[k] || '') || '—';
    return '<tr data-hq="' + h.id + '">' +
      '<td>' + h.id + '</td>' +
      '<td><b>' + _esc(h.name || '') + '</b> ' +
        '<button type="button" title="상세" onclick="hqToggleDetail(' + h.id + ',this)" ' +
        'style="margin-left:4px;padding:0 5px;font-size:11px;border:1px solid #d1d5db;border-radius:5px;background:#fff;cursor:pointer">ⓘ</button></td>' +
      '<td>' + v('ceo_name') + '</td>' +
      '<td>' + v('business_no') + '</td>' +
      '<td>' + v('address') + '</td>' +
      '<td>' + v('phone') + '</td>' +
      '<td style="white-space:nowrap">' +
        '<button type="button" onclick="hqEdit(' + h.id + ')" data-ko="✏️ 수정" data-en="✏️ Edit" ' +
        'style="padding:2px 8px;font-size:11px;border:1px solid #d1d5db;border-radius:5px;background:#fff;cursor:pointer">' +
        (EN ? '✏️ Edit' : '✏️ 수정') + '</button> ' +
        '<button type="button" onclick="hqDelete(' + h.id + ',this)" data-ko="🗑 삭제" data-en="🗑 Delete" ' +
        'style="padding:2px 8px;font-size:11px;border:1px solid #fecaca;color:#b91c1c;border-radius:5px;background:#fff;cursor:pointer">' +
        (EN ? '🗑 Delete' : '🗑 삭제') + '</button>' +
      '</td></tr>';
  }).join('');
}
window.loadHqOrgs = loadHqOrgs;

/* ⓘ 상세 — 사이트 푸터에는 나가지만 표의 7칸에는 자리가 없는 항목들.
   「데이터 누락 없이 이관」이 요구사항이라 저장은 다 하고, 보기는 여기서 편다. */
function hqToggleDetail(id, btn) {
  const tr = document.querySelector('#hq-table tr[data-hq="' + id + '"]');
  if (!tr) return;
  const open = tr.nextElementSibling && tr.nextElementSibling.classList.contains('hq-detail');
  if (open) { tr.nextElementSibling.remove(); if (btn) btn.textContent = 'ⓘ'; return; }
  const h = _hqRows.filter(x => String(x.id) === String(id))[0];
  if (!h) return;
  const EN = (typeof adminLang !== 'undefined' && adminLang === 'en');
  const row = (k, val) => '<div><span style="color:#64748b">' + k + '</span> · ' + (_esc(val || '') || '—') + '</div>';
  const el = document.createElement('tr');
  el.className = 'hq-detail';
  el.innerHTML = '<td colspan="7" style="background-color:#f8fafc;font-size:12px;line-height:1.9">' +
    row(EN ? 'E-commerce Reg. No.' : '통신판매업신고', h.ecommerce_no) +
    row(EN ? 'Privacy Officer' : '개인정보 보호 책임자', h.privacy_officer) +
    row(EN ? 'Email' : '이메일', h.email) +
    row(EN ? 'Memo' : '메모', h.memo) +
    row(EN ? 'Registered' : '등록', _fmtDateTime(h.created_at)) +
    row(EN ? 'Updated' : '수정', _fmtDateTime(h.updated_at)) +
    '</td>';
  tr.insertAdjacentElement('afterend', el);
  if (btn) btn.textContent = '×';
}
window.hqToggleDetail = hqToggleDetail;

function hqSearch(v) {
  clearTimeout(_hqSearchT);
  _hqSearchT = setTimeout(function () { loadHqOrgs(v); }, 250);
}
window.hqSearch = hqSearch;

const _HQ_INPUTS = { name:'hq-name', ceo_name:'hq-ceo', business_no:'hq-business-no', address:'hq-address',
                     phone:'hq-phone', ecommerce_no:'hq-ecommerce', privacy_officer:'hq-privacy',
                     email:'hq-email', memo:'hq-memo' };

function _hqReadForm() {
  const b = {};
  Object.keys(_HQ_INPUTS).forEach(function (k) {
    const el = document.getElementById(_HQ_INPUTS[k]);
    b[k] = el ? (el.value || '').trim() : '';
  });
  return b;
}
function hqResetForm() {
  _hqEditId = 0;
  Object.keys(_HQ_INPUTS).forEach(function (k) {
    const el = document.getElementById(_HQ_INPUTS[k]); if (el) el.value = '';
  });
  _hqSetBtnLabel(document.getElementById('hq-add-btn'), '+ 등록', '+ Add');
  const c = document.getElementById('hq-cancel-btn'); if (c) c.style.display = 'none';
}
window.hqResetForm = hqResetForm;

function hqEdit(id) {
  const h = _hqRows.filter(x => String(x.id) === String(id))[0];
  if (!h) return;
  _hqEditId = h.id;
  Object.keys(_HQ_INPUTS).forEach(function (k) {
    const el = document.getElementById(_HQ_INPUTS[k]); if (el) el.value = h[k] == null ? '' : h[k];
  });
  const wrap = document.getElementById('hq-form-wrap'); if (wrap) wrap.open = true;
  _hqSetBtnLabel(document.getElementById('hq-add-btn'), '💾 수정 저장', '💾 Save');
  const c = document.getElementById('hq-cancel-btn'); if (c) c.style.display = '';
  const n = document.getElementById('hq-name'); if (n) { n.focus(); }
}
window.hqEdit = hqEdit;

async function saveHqOrg() {
  const b = _hqReadForm();
  if (!b.name) { alert(adminLang === 'en' ? 'HQ name required' : '본사명은 필수입니다'); return; }
  if (_hqEditId) {
    b.id = _hqEditId;
    const r = await fetch('/api/admin/org/hq', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', body: JSON.stringify(b)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) { alert((adminLang === 'en' ? 'Failed: ' : '실패: ') + (d.error || ('HTTP ' + r.status))); return; }
  } else {
    const d = await _menuPost('/api/admin/org/hq', b);
    if (!d) return;
  }
  hqResetForm();
  loadHqOrgs();
}
window.saveHqOrg = saveHqOrg;

/* 🗑 삭제 — 한 번 누르면 «무장», 4초 안에 한 번 더 눌러야 확인창.
   강사 프로필 제거(removeTeacherProfile)와 같은 방식이다. 실수 한 번에 법인정보가 사라지면 안 된다. */
async function hqDelete(id, btn) {
  const h = _hqRows.filter(x => String(x.id) === String(id))[0];
  const name = h ? (h.name || ('#' + id)) : ('#' + id);
  if (btn && btn.dataset && btn.dataset.armed !== '1') {
    btn.dataset.armed = '1';
    btn._prevHtml = btn.innerHTML;
    _hqSetBtnLabel(btn, '한 번 더', 'Again?');
    clearTimeout(btn._disarmT);
    btn._disarmT = setTimeout(function () {
      btn.dataset.armed = '';
      _hqSetBtnLabel(btn, '🗑 삭제', '🗑 Delete');
    }, 4000);
    return;
  }
  if (btn) clearTimeout(btn._disarmT);
  const ok = confirm((adminLang === 'en' ? 'Delete HQ record "' : '본사 정보 "') + name +
    (adminLang === 'en' ? '"? This cannot be undone.' : '" 을(를) 삭제할까요?\n\n⚠️ 되돌릴 수 없습니다.'));
  if (!ok) {
    if (btn) { btn.dataset.armed = ''; _hqSetBtnLabel(btn, '🗑 삭제', '🗑 Delete'); }
    return;
  }
  const r = await fetch('/api/admin/org/hq?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) { alert((adminLang === 'en' ? 'Failed: ' : '실패: ') + (d.error || ('HTTP ' + r.status))); return; }
  if (_hqEditId === id) hqResetForm();
  loadHqOrgs();
}
window.hqDelete = hqDelete;

// ── 대리점·학원 (테이블명 centers) ────────────────────────────────────
//   ⚠️ «교육센터»가 아니다. 실데이터 921건이 "○○ 학원 / ○○ 대리점" 이고
//      921건 중 744건이 학생 명부의 shop_name(대리점명)과 글자 그대로 일치한다.
//      «교육센터»는 홈페이지에서 «필리핀 직영 센터»를 가리키는 다른 말이라 라벨을 바꿨다.
//   🐢 예전엔 921행을 한 번에 받아(약 130KB) 카드가 닫혀 있어도 DOM 에 다 그렸다.
//      → 서버 페이징 50건 + 서버 검색. 검색은 '이 페이지 50행'이 아니라 921건 전체 대상.
//   💳 pt = 결제유형 필터('' | 'B2B' | 'B2C' | 'NONE'). counts 는 서버가 준 유형별 건수.
var _ctState = { q: '', offset: 0, limit: 50, total: 0, pt: '', counts: null };
async function loadCenters(opts) {
  opts = opts || {};
  if (opts.q !== undefined) { _ctState.q = String(opts.q || '').trim(); _ctState.offset = 0; }
  if (opts.pt !== undefined) { _ctState.pt = String(opts.pt || ''); _ctState.offset = 0; }
  if (opts.offset !== undefined) _ctState.offset = Math.max(0, opts.offset);
  const tb = document.getElementById('centers-table');
  if (!tb) return;
  _ensureFranchiseSelect();
  const qs = '?limit=' + _ctState.limit + '&offset=' + _ctState.offset
           + (_ctState.q ? '&q=' + encodeURIComponent(_ctState.q) : '')
           + (_ctState.pt ? '&payment_type=' + encodeURIComponent(_ctState.pt) : '');
  let d = {};
  try {
    const r = await fetch('/api/admin/centers' + qs, { cache:'no-store', credentials:'include' });
    d = await r.json().catch(()=>({}));
  } catch (e) { d = {}; }
  _ctState.total = Number(d.total || 0);
  if (d && d.counts) _ctState.counts = d.counts;
  _ctRenderPtFilter();
  // 유형을 바꿔 목록이 줄면 지금 페이지가 범위를 벗어날 수 있다 → 마지막 페이지로 당긴다.
  // (total 0 이면 offset 0 이 되고, 그때는 이 조건이 거짓이라 무한 반복이 없다)
  if (_ctState.offset > 0 && _ctState.offset >= _ctState.total) {
    return loadCenters({ offset: Math.max(0, _ctState.total - _ctState.limit) });
  }
  if (!d.ok || !Array.isArray(d.items) || d.items.length === 0) {
    tb.innerHTML = '<tr><td colspan="8" class="empty">'
      + ((_ctState.q || _ctState.pt) ? (adminLang==='en' ? 'No match' : '검색 결과 없음') : '—') + '</td></tr>';
    _ctRenderPager();
    return;
  }
  // 💳 (2026-08-12 수정요청 #05) 결제유형 컬럼 — 행에서 바로 바꿀 수 있는 드롭다운.
  //    centers 엔 수정 API 가 없었어서, 기존 921건에 유형을 지정할 방법이 이것뿐이다.
  const _ptCell = c => {
    const cur = String(c.payment_type || '');
    const opt = (v, ko, en) => `<option value="${v}"${cur === v ? ' selected' : ''}>${adminLang==='en'?en:ko}</option>`;
    return `<select onchange="ctSetPayType(${Number(c.id)},this)" data-prev="${cur}" title="${adminLang==='en'?'Payment type of this agency':'이 대리점의 결제 방식'}"
      style="padding:2px 6px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:${cur?'#eff6ff':'#fff'};color:${cur?'#1d4ed8':'#6b7280'};font-weight:${cur?'700':'400'}">`
      + opt('', '미지정', 'None') + opt('B2B', 'B2B', 'B2B') + opt('B2C', 'B2C', 'B2C') + '</select>';
  };
  /* 💰 (2026-08-22) 주 1회 수강료 — 사장님 확인 단가.
       표준 30,000원 = 본사 18,000(60%) + 대리점 12,000(40%). 주 2·3·5회는 배수라 비율 동일.
       더 받는 곳(예: 40,000원)은 **추가분을 대리점이 다 가짐** → 본사는 18,000원 고정.
       그래서 요율은 손으로 적지 않고 «18,000 ÷ 수강료» 로 서버가 낸다(40,000 → 45%).
     ⚠️ 안 정한 곳은 값이 비어서 온다. 그때 30,000 을 «저장된 값처럼» 보여 주면
        사람이 정한 것과 기본값을 구분할 수 없다 → 회색 placeholder 로만 보여 준다. */
  const _CT_STD_TUITION = 30000, _CT_HQ_UNIT = 18000;
  const _tuCell = c => {
    const v = (c.tuition_krw == null || c.tuition_krw === '') ? '' : Number(c.tuition_krw);
    const eff = Math.round((_CT_HQ_UNIT / (v || _CT_STD_TUITION)) * 1000) / 10;   // 본사 요율 %
    const tip = (adminLang==='en' ? 'Weekly-1 tuition. Empty = standard 30,000. HQ margin = 18,000 / tuition'
                                  : '주 1회 수강료. 비우면 표준 30,000원. 본사 마진 = 18,000 ÷ 수강료 (지금 ' + eff.toFixed(1) + '%)');
    return `<input type="number" min="${_CT_HQ_UNIT}" step="1000" value="${v}" placeholder="${_CT_STD_TUITION}"
      onchange="ctSetTuition(${Number(c.id)},this)" data-prev="${v}" data-name="${_esc(c.name)}" title="${tip}"
      style="width:96px;padding:2px 6px;font-size:12px;text-align:right;border:1px solid ${v?'#7c3aed':'#d1d5db'};border-radius:6px;background:${v?'#f5f3ff':'#fff'};color:${v?'#5b21b6':'#6b7280'};font-weight:${v?'700':'400'}">
      <span style="font-size:10px;color:#9ca3af"> ${eff.toFixed(0)}%</span>`;
  };
  tb.innerHTML = d.items.map(c =>
    `<tr><td>${c.id}</td><td>${_esc(c.franchise_name)||'—'}</td><td><b>${_esc(c.name)}</b></td><td>${_ptCell(c)}</td><td style="white-space:nowrap">${_tuCell(c)}</td><td>${_esc(c.country)||'—'}</td><td>${_esc(c.manager)||'—'}</td><td>${_esc(c.address)||'—'}</td></tr>`
  ).join('');
  _ctRenderPager();
}
// 💳 결제유형 저장 — 실패하면 화면 값을 되돌리고 알린다 (조용한 반쪽 성공 금지)
async function ctSetPayType(id, sel) {
  const want = sel.value || null;
  const prev = sel.getAttribute('data-prev') || '';
  try {
    const r = await fetch('/api/admin/centers', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, payment_type: want })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || ('HTTP ' + r.status));
    sel.setAttribute('data-prev', want || '');
    sel.style.background = want ? '#eff6ff' : '#fff';
    sel.style.color = want ? '#1d4ed8' : '#6b7280';
    sel.style.fontWeight = want ? '700' : '400';
  } catch (e) {
    sel.value = prev;
    alert((adminLang==='en' ? 'Failed to save payment type: ' : '결제유형 저장 실패: ') + e.message);
    return;
  }
  // 저장됐으면 건수 요약이 이미 틀렸다. 유형으로 거르는 중이면 그 행은 목록에서 빠져야 하고,
  // 아니면 숫자만 갱신하면 된다 → 어느 쪽이든 다시 불러오는 게 맞다(50행 한 번).
  loadCenters();
}
window.ctSetPayType = ctSetPayType;

/* 💰 수강료 저장 — 서버가 이 값으로 «본사 요율» 을 계산해 정산에 바로 반영한다.
   비우고 저장하면 설정을 지워 표준 30,000원(=60%)으로 돌아간다.
   ⚠️ 실패하면 화면 값을 되돌리고 알린다 — 조용한 반쪽 성공 금지(결제유형 저장과 같은 규칙). */
async function ctSetTuition(id, inp) {
  const prev = inp.getAttribute('data-prev') || '';
  const name = inp.getAttribute('data-name') || '';
  const raw = String(inp.value || '').trim();
  const en = (adminLang === 'en');
  if (!name) { alert(en ? 'Agency name missing' : '대리점 이름을 알 수 없습니다'); inp.value = prev; return; }
  const body = raw === ''
    ? { scope_type: 'agency', scope_key: name, reset: true }              // 비우면 표준값으로
    : { scope_type: 'agency', scope_key: name, tuition_krw: Number(raw) };
  try {
    const r = await fetch('/api/admin/settlement/rate-config', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) throw new Error(d.error || ('HTTP ' + r.status));
  } catch (e) {
    inp.value = prev;
    alert((en ? 'Failed to save tuition: ' : '수강료 저장 실패: ') + e.message);
    return;
  }
  // 저장되면 옆의 «요율 %» 표시가 이미 틀렸다 → 그 행만 다시 그리려 하지 말고 목록을 새로 받는다
  loadCenters();
}
window.ctSetTuition = ctSetTuition;

// 💳 (2026-08-14) 결제유형 필터 버튼 + 유형별 건수.
//    ⚠️ hover 강조는 «색만» — 크기·위치를 움직이면 안 된다(CLAUDE.md 1-3 «정신없다»고 제거된 것).
//    ⚠️ 라벨은 <span data-ko/data-en> 안에 두고 건수는 바깥 <b> 로 뺀다.
//       i18n 사전이 «전체 문자열 일치»라, 숫자가 섞인 문자열은 번역이 안 걸린다.
function _ctRenderPtFilter() {
  const el = document.getElementById('ct-ptfilter');
  if (!el) return;
  const c = _ctState.counts || { all: 0, B2B: 0, B2C: 0, NONE: 0 };
  const defs = [
    ['',     '전체',   'All',   c.all],
    ['B2B',  'B2B',    'B2B',   c.B2B],
    ['B2C',  'B2C',    'B2C',   c.B2C],
    ['NONE', '미지정', 'Unset', c.NONE],
  ];
  el.innerHTML = defs.map(function (d) {
    const on = _ctState.pt === d[0];
    return '<button type="button" onclick="ctFilterPayType(\'' + d[0] + '\')"'
      + ' style="padding:4px 10px;font-size:12px;border-radius:8px;cursor:pointer;'
      +   'border:1px solid ' + (on ? '#1d4ed8' : '#d1d5db') + ';'
      +   'background:' + (on ? '#1d4ed8' : '#fff') + ';'
      +   'color:' + (on ? '#fff' : '#374151') + ';'
      +   'font-weight:' + (on ? '700' : '400') + '">'
      + '<span data-ko="' + d[1] + '" data-en="' + d[2] + '">'
      + (adminLang === 'en' ? d[2] : d[1]) + '</span> <b>' + Number(d[3] || 0) + '</b></button>';
  }).join('');
}
function ctFilterPayType(v) { loadCenters({ pt: v }); }
window.ctFilterPayType = ctFilterPayType;
function _ctRenderPager() {
  const el = document.getElementById('ct-pager');
  if (!el) return;
  const en = adminLang === 'en';
  const t = _ctState.total;
  const from = t ? _ctState.offset + 1 : 0;
  const to = Math.min(_ctState.offset + _ctState.limit, t);
  const hasPrev = _ctState.offset > 0;
  const hasNext = to < t;
  const btn = (on, label, fn) =>
    `<button onclick="${fn}" ${on?'':'disabled'} style="padding:4px 10px;font-size:12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:${on?'pointer':'default'};opacity:${on?1:0.4}">${label}</button>`;
  el.innerHTML =
    `<span style="font-size:12px;color:#64748b">${en?'Showing':'표시'} <b>${from}–${to}</b> / ${t}${_ctState.q?(en?' (search)':' (검색)'):''}</span>`
    + btn(hasPrev, en?'‹ Prev':'‹ 이전', 'ctPrevPage()')
    + btn(hasNext, en?'Next ›':'다음 ›', 'ctNextPage()');
}
function ctPrevPage() { loadCenters({ offset: Math.max(0, _ctState.offset - _ctState.limit) }); }
function ctNextPage() { loadCenters({ offset: _ctState.offset + _ctState.limit }); }
var _ctSearchTimer = null;
function ctSearch(v) {
  clearTimeout(_ctSearchTimer);
  _ctSearchTimer = setTimeout(() => loadCenters({ q: v }), 250);
}
async function addCenter() {
  const e = id => document.getElementById(id);
  const name = (e('ct-name').value||'').trim();
  if (!name) { alert(adminLang==='en'?'Name required':'이름은 필수'); return; }
  // 🔑 (2026-08-19) 로그인 아이디·비밀번호 — 둘 다 채워야 계정을 만든다. 하나만 채우면
  //    서버 왕복 없이 여기서 먼저 막는다(centers 는 만들어지지 않았는데 계정만 실패하는 걸 방지).
  const loginId = (e('ct-login-id') && e('ct-login-id').value || '').trim();
  const loginPw = (e('ct-login-pw') && e('ct-login-pw').value || '');
  if ((loginId && !loginPw) || (!loginId && loginPw)) {
    alert(adminLang==='en' ? 'Fill in both login ID and password, or leave both blank.'
                            : '로그인 아이디와 비밀번호를 둘 다 입력하거나, 둘 다 비워 두세요.');
    return;
  }
  const d = await _menuPost('/api/admin/centers', {
    franchise_id: e('ct-franchise').value || null, name,
    country: e('ct-country').value||null, manager: e('ct-manager').value||null,
    address: e('ct-address').value||null,
    payment_type: (e('ct-paytype') && e('ct-paytype').value) || null,   // 💳 (2026-08-12 수정요청 #05)
    login_username: loginId || null, login_password: loginPw || null
  });
  if (d) {
    ['ct-name','ct-country','ct-manager','ct-address','ct-paytype','ct-login-id','ct-login-pw'].forEach(id=>{ if(e(id)) e(id).value=''; });
    if (d.login_created) {
      alert(adminLang==='en' ? ('Agency login account created: ' + loginId)
                              : ('대리점 로그인 계정을 만들었습니다: ' + loginId));
    }
    loadCenters();
  }
}

// ── 레벨테스트 ───────────────────────────────────────────────────────
async function loadLevelTests() {
  let items = [];
  try {
    const r = await fetch('/api/admin/level-tests?limit=100',{cache:'no-store',credentials:'include'});
    const d = await r.json().catch(()=>({}));
    if (d && d.ok && Array.isArray(d.items)) items = d.items;
  } catch (e) { /* fallthrough — 학생 홈피 시드만 사용 */ }
  // 🔗 학생 홈페이지에서 작성된 결과 머지 (mangoi_level_test_results)
  try {
    const seed = JSON.parse(localStorage.getItem('mangoi_level_test_results') || '[]');
    if (Array.isArray(seed) && seed.length) {
      // 같은 user_id+date 중복 제거
      const seen = new Set(items.map(x => (x.student_user_id || '') + '|' + (x.tested_at || '')));
      seed.forEach(s => {
        const key = (s.student_user_id || '') + '|' + (s.tested_at || '');
        if (!seen.has(key)) {
          items.unshift({
            student_name: s.student_name,
            student_user_id: s.student_user_id,
            level: s.level,
            score: s.score,
            tested_at: s.tested_at || Date.now(),
            _source: 'student_homepage'
          });
          seen.add(key);
        }
      });
    }
  } catch (e) { /* ignore */ }
  const tb = document.getElementById('level-tests-table');
  if (!tb) return;
  if (items.length === 0) { tb.innerHTML='<tr><td colspan="5" class="empty">—</td></tr>'; return; }
  // 응시일 내림차순
  items.sort((a,b) => (b.tested_at||0) - (a.tested_at||0));
  tb.innerHTML = items.map(t => {
    const fromHome = t._source === 'student_homepage';
    const badge = fromHome ? ' <span style="font-size:9.5px;background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:99px;margin-left:4px;font-weight:700" title="학생 홈피에서 자동 연동">🌐 홈피</span>' : '';
    return `<tr><td>${_fmtDate(t.tested_at)}</td><td><b>${_esc(t.student_name)}</b>${badge}</td><td><code style="font-size:11px;">${_esc(t.student_user_id)||'—'}</code></td><td>${_esc(t.level)||'—'}</td><td style="text-align:right;">${t.score!=null?Number(t.score).toFixed(1):'—'}</td></tr>`;
  }).join('');
}
async function addLevelTest() {
  const e = id => document.getElementById(id);
  const name = (e('lt-name').value||'').trim();
  if (!name) { alert(adminLang==='en'?'Name required':'이름은 필수'); return; }
  const dateStr = e('lt-date').value;
  const tested_at = dateStr ? new Date(dateStr).getTime() : Date.now();
  const d = await _menuPost('/api/admin/level-tests', {
    student_name: name, student_user_id: e('lt-uid').value||null,
    level: e('lt-level').value||null, score: e('lt-score').value ? parseFloat(e('lt-score').value) : null,
    tested_at
  });
  if (d) { ['lt-name','lt-uid','lt-score','lt-date'].forEach(id=>e(id).value=''); e('lt-level').value=''; loadLevelTests(); }
}

// ── 🆕 레벨테스트 신청 현황 (학생 접수 실데이터) ──────────────────────────────
/* ── 🧑‍🏫 레벨테스트 «담당 강사» 배정 (2026-08-05) ─────────────────────────
   신청이 들어오면 서버가 그 요일·시간 가능한 강사 중 평가 최고를 자동배정한다(status='proposed').
   하지만 관리자 화면엔 그 결과를 보여주는 칸조차 없어서, 누가 맡았는지도 모르고 바꿀 수도 없었다.
   ⚠️ 강사 목록은 teacher_profiles 를 쓴다 — 서버 자동배정이 보는 것과 «같은 표» 여야
      화면에서 고른 이름이 배정 로직·마이페이지 조회와 어긋나지 않는다.
   ⚠️ 목록은 한 번만 받아 캐시한다. 표를 그릴 때마다 부르면 신청 100건에 100번 나간다. */
let __ltTeachers = null, __ltTeachersLoading = false;
async function _ltLoadTeachers() {
  if (__ltTeachers || __ltTeachersLoading) return __ltTeachers;
  __ltTeachersLoading = true;
  try {
    const r = await fetch('/api/admin/teacher-profiles?status=' + encodeURIComponent('활동중'), { cache:'no-store', credentials:'include' });
    const d = await r.json().catch(()=>({}));
    if (d && d.ok) {
      __ltTeachers = (d.items || [])
        .map(t => (t.english_name || t.korean_name || '').trim())
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .sort();
      _ltFillTeacherSelects();
    }
  } catch (e) { /* 목록을 못 받아도 표는 그대로 보여야 한다 */ }
  __ltTeachersLoading = false;
  return __ltTeachers;
}
/* 현재 배정된 이름은 «항상» 보이게 한다 — 목록 로딩 실패·명단에서 빠진 강사여도 마찬가지.
   (목록에 없다고 화면에서 이름이 사라지면 관리자가 «미배정» 으로 오인한다) */
function _ltTeacherCell(a) {
  const cur = (a.assigned_teacher || '').trim();
  const curLabel = cur ? _esc(cur) : (adminLang==='en' ? '— unassigned —' : '— 미배정 —');
  return '<select class="lt-tsel" data-id="' + a.id + '" data-cur="' + _esc(cur) + '"' +
         ' onchange="leveltestAssign(' + a.id + ', this.value, this)"' +
         ' style="max-width:150px;font-size:12px;padding:3px 6px;border:1px solid #d1d5db;border-radius:6px;background:#fff">' +
         '<option value="' + _esc(cur) + '" selected>' + curLabel + '</option></select>';
}
function _ltFillTeacherSelects() {
  if (!__ltTeachers) return;
  document.querySelectorAll('select.lt-tsel').forEach(sel => {
    const cur = sel.getAttribute('data-cur') || '';
    const opts = [ '<option value="">' + (adminLang==='en' ? '— unassigned —' : '— 미배정 —') + '</option>' ]
      .concat(__ltTeachers.map(n => '<option value="' + _esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + _esc(n) + '</option>'));
    // 명단에 없는 이름이 배정돼 있으면 그 이름도 항목으로 남긴다(선택이 풀려 지워지지 않게)
    if (cur && __ltTeachers.indexOf(cur) === -1) {
      opts.push('<option value="' + _esc(cur) + '" selected>' + _esc(cur) + ' *</option>');
    }
    sel.innerHTML = opts.join('');
  });
}
async function leveltestAssign(id, teacher, sel) {
  const prev = sel ? (sel.getAttribute('data-cur') || '') : '';
  const d = await _menuPost('/api/admin/leveltest/applications', { id, assigned_teacher: teacher });
  if (d) { if (sel) sel.setAttribute('data-cur', teacher); loadLeveltestApps(); }
  else if (sel) { sel.value = prev; }   // 실패하면 화면을 되돌린다 — 바뀐 것처럼 남겨두지 않는다
}

/* ── 📅 (2026-08-05) 신청 → «실제 수업» 만들기 ────────────────────────────────
   지금까지 «완료» 를 눌러도 수업은 한 건도 생기지 않았다. 사장님 테스트 건은
   사람이 DB 에 직접 넣어야 했다. 이 버튼 하나가 그걸 대신한다.
   ⚠️ _menuPost 를 쓰지 않는다 — 그건 실패하면 alert 만 띄우고 null 을 돌려줘서
      «시간이 겹칩니다(그래도 만들까요?)» 같은 되물음을 만들 수 없다. 응답 본문이 필요하다. */
async function leveltestMakeClass(id, opts) {
  opts = opts || {};
  const en = (typeof adminLang !== 'undefined' && adminLang === 'en');
  let d = {};
  try {
    const r = await fetch('/api/admin/leveltest/applications', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, action: 'create_schedule', force: !!opts.force, user_id: opts.user_id, scheduled_date: opts.scheduled_date })
    });
    d = await r.json().catch(() => ({}));
  } catch (e) {
    alert(en ? 'Network error while creating the class.' : '수업 생성 중 통신 오류가 났습니다.');
    return;
  }
  const msg = (en ? d.message_en : d.message) || d.message || d.error || (en ? 'Failed' : '실패');
  if (d.ok) { alert('✅ ' + msg); loadLeveltestApps(); return; }

  // 시간이 겹침 → 사람이 판단한다. 합반·연강일 수 있으므로 시스템이 막기만 하지 않는다.
  if (d.error === 'conflict') {
    if (confirm('⚠ ' + msg)) leveltestMakeClass(id, { force: true, user_id: opts.user_id });
    return;
  }
  // 학생 계정을 못 찾음 → 계정 없는 예약은 학생 화면에 영영 안 뜬다. 그래서 되묻는다.
  if (d.error === 'student_not_found') {
    const uid = prompt(msg + '\n\n' + (en ? 'Student account id:' : '학생 계정 아이디:'), d.candidate || '');
    if (uid && uid.trim()) leveltestMakeClass(id, { force: opts.force, user_id: uid.trim() });
    return;
  }
  /* 희망 날짜가 이미 지남 → 과거에 만들면 «어느 화면에도 안 뜨는 수업»이 된다.
     막기만 하면 담당자는 여기서 갇힌다(신청서 날짜를 고칠 화면이 따로 없다). 여기서 바로 받는다. */
  if (d.error === 'past_date') {
    const nd = prompt(msg + '\n\n' + (en ? 'New date (YYYY-MM-DD):' : '새 날짜 (YYYY-MM-DD):'), d.today || '');
    if (nd && /^\d{4}-\d{2}-\d{2}$/.test(nd.trim())) {
      leveltestMakeClass(id, { force: opts.force, user_id: opts.user_id, scheduled_date: nd.trim() });
    }
    return;
  }
  alert('⚠ ' + msg);
}

/* 🗑️ (2026-08-21 사장님 지시) 레벨테스트 신청 삭제 — 데모/테스트 항목 정리용.
   ⛔ 되돌릴 수 없다. 서버가 본사(경영진·관리자)만 허용하고(403), 연결된 수업이 있으면
      삭제 전에 먼저 cancelled 로 정리해 강사·학생 달력에 유령 수업이 남지 않게 한다. */
async function leveltestDeleteApp(id, name) {
  const en = (adminLang === 'en');
  /* 이름은 목록(__ltShown)에서 찾는다 — onclick 속성에 학생 입력값(student_name)을
     문자열로 심으면 " 한 글자로 속성이 닫혀 마크업이 깨지고(공개 신청 폼 값이라
     저장형 XSS 벡터), 따옴표 제거만으로는 못 막는다. name 인자는 옛 호출 호환용. */
  const row = (__ltShown || []).find(a => a && String(a.id) === String(id));
  const nm = (row && row.student_name) || name || '';
  const label = nm ? (' — ' + nm) : '';
  if (!confirm((en ? 'Delete this application' : '이 신청을 삭제할까요') + label + '?\n' +
    (en ? 'This cannot be undone. A linked class (if any) will be cancelled.' : '되돌릴 수 없습니다. 연결된 수업이 있으면 함께 취소 처리됩니다.'))) return;
  let d = {};
  try {
    const r = await fetch('/api/admin/leveltest/applications', {
      method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    d = await r.json().catch(() => ({}));
  } catch (e) {
    alert(en ? 'Network error while deleting.' : '삭제 중 통신 오류가 났습니다.');
    return;
  }
  if (d && d.ok) { loadLeveltestApps(); return; }
  alert('⚠ ' + ((en ? d.message_en : d.message) || d.message || d.error || (en ? 'Failed' : '삭제에 실패했습니다')));
}

/* 🗑️ (2026-08-21) 화면에 지금 «보이는» 레벨테스트 신청 전체 삭제 — 수강신청 enDeleteAllVisible() 과 같은 꼴.
   ⚠️ 최대 90건까지 한 번에 보낸다(D1 바인드 한도, 서버도 같은 값으로 막는다) — 넘으면 다시 누르게 안내한다.
   ⛔ 되돌릴 수 없다. 연결된 수업은 서버가 삭제 전에 cancelled 로 정리한다. */
async function ltDeleteAllVisible() {
  const en = (adminLang === 'en');
  const rows = (__ltShown || []).filter(a => a && a.id != null);
  if (!rows.length) { alert(en ? 'Nothing to delete.' : '지울 항목이 없습니다.'); return; }
  const ids = rows.slice(0, 90).map(a => a.id);
  if (!confirm((en
    ? ('Delete ' + ids.length + ' level-test application(s)? This cannot be undone. Linked classes will be cancelled.')
    : (ids.length + '건의 레벨테스트 신청을 삭제할까요?\n되돌릴 수 없습니다. 연결된 수업은 함께 취소 처리됩니다.')))) return;
  let d = {};
  try {
    const r = await fetch('/api/admin/leveltest/applications', {
      method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    d = await r.json().catch(() => ({}));
  } catch (e) {
    alert(en ? 'Network error while deleting.' : '삭제 중 통신 오류가 났습니다.');
    return;
  }
  // 성공은 «ok:true 라고 말했는가» 로 판정 — 관문 404 본문({error:'Not Found'})은 ok 칸이
  // 없어 === false 를 그냥 통과해 「0건 삭제」 정상 문구로 위장한다(CLAUDE.md 2장).
  if (!d || d.ok !== true) { alert('⚠ ' + ((en ? d.message_en : d.message) || d.message || d.error || (en ? 'Failed' : '삭제에 실패했습니다'))); return; }
  const n = (d.deleted || []).length;
  loadLeveltestApps();
  if (rows.length > 90) {
    alert(en ? (n + ' deleted. More than 90 matched — press the button again for the rest.')
             : (n + '건 삭제했습니다. 90건이 넘게 걸려서 나머지는 다시 눌러 주세요.'));
  }
}

async function loadLeveltestApps() {
  let items = [], pending = 0;
  try {
    const r = await fetch('/api/admin/leveltest/applications?limit=100', {cache:'no-store', credentials:'include'});
    const d = await r.json().catch(()=>({}));
    if (d && d.ok) { items = d.items || []; pending = d.pending || 0; }
  } catch (e) { /* 무시 */ }
  const badge = document.getElementById('lt-apps-badge');
  if (badge) {
    if (pending > 0) { badge.textContent = (adminLang==='en' ? (pending+' new') : ('대기 '+pending+'건')); badge.style.display='inline-block'; }
    else badge.style.display='none';
  }
  __ltApps = items;
  _ltRenderApps();
}

/* ── 🔎 검색 · 필터 · 정렬 (2026-08-05 사장님 지시) ────────────────────────
   [정렬] 서버는 `ORDER BY (status='pending') DESC, created_at DESC` — 처리할 것을 위로
     올리는 «업무 순서» 다. 그래서 8월 5일 신청이 7월 11일 대기건들 밑, 6번째에 있었다.
     화면은 «최신순» 을 기본으로 한다. 서버 정렬은 그대로 둔다 — 강사 마이페이지
     (admin/mypage.html)가 같은 API 를 쓰고 있어 서버를 바꾸면 그쪽까지 흔들린다.
   [필터] 전부 화면에서만 거른다. 서버 왕복 없음 = 타이핑마다 즉시 반응.
   ⚠️ 원본 배열(__ltApps)은 절대 건드리지 않는다. sort() 는 제자리 정렬이라
      원본에 하면 «오래된순» 을 한 번 누른 뒤 필터를 바꾸면 순서가 뒤엉킨다. */
let __ltApps = [];
let __ltShown = [];   // 🗑️ _ltRenderApps() 가 방금 그린 목록(검색·필터 반영) — 일괄 삭제가 이것만 지운다
function _ltRenderApps() {
  const tb = document.getElementById('leveltest-apps-table');
  if (!tb) return;
  const q  = (document.getElementById('lt-apps-q')?.value || '').trim().toLowerCase();
  const fs = document.getElementById('lt-apps-status')?.value || '';
  const so = document.getElementById('lt-apps-sort')?.value || 'new';

  let items = __ltApps.slice();                       // 사본에 정렬 — 원본 보존
  if (fs) items = items.filter(a => String(a.status || '') === fs);
  if (q) {
    items = items.filter(a => [a.student_name, a.student_uid, a.assigned_teacher, a.final_level, a.note, a.desired_date, a.phone]
      .map(v => String(v == null ? '' : v).toLowerCase()).join(' ').includes(q));
  }
  items.sort((a, b) => so === 'old' ? (a.created_at - b.created_at) : (b.created_at - a.created_at));

  /* 🗑️ (2026-08-21) "보이는 항목 전체 삭제" — 지금 화면에 그린 목록을 그대로 기억해 둔다.
     ⛔ 삭제 쪽에서 검색·필터를 다시 계산하지 않는다. 두 벌이 되면 언젠가 어긋나고,
        그때 «화면에 안 보이는 건»이 지워진다(되돌릴 수 없다). 그리는 쪽 하나만 정본이다. */
  __ltShown = items;
  const delAllBtn = document.getElementById('lt-delete-all-btn');
  //   본사(경영진·관리자)만 — 서버가 같은 조건으로 403 을 던지니 여기서는 «눌러도 안 되는 버튼»을 감출 뿐이다.
  if (delAllBtn) delAllBtn.style.display = ((typeof window !== 'undefined' && window._isHqMgrOrUp) && items.length) ? '' : 'none';

  const cnt = document.getElementById('lt-apps-count');
  if (cnt) {
    cnt.textContent = (q || fs)
      ? (adminLang==='en' ? (items.length + ' / ' + __ltApps.length) : (items.length + '건 / 전체 ' + __ltApps.length + '건'))
      : (adminLang==='en' ? (__ltApps.length + ' total') : ('전체 ' + __ltApps.length + '건'));
  }
  if (!items.length) {
    // 🔴 «검색 결과 없음» 과 «신청 자체가 없음» 을 구분한다. 안 그러면 필터를 켜 둔 걸 잊고
    //    "신청이 하나도 안 들어왔네" 로 오인한다.
    const msg = __ltApps.length
      ? (adminLang==='en' ? 'No match — clear the search/filter' : '검색·필터에 걸리는 것이 없습니다 (조건을 지워 보세요)')
      : (adminLang==='en' ? 'No applications yet' : '아직 신청이 없습니다');
    tb.innerHTML = '<tr><td colspan="11" class="empty">' + msg + '</td></tr>';
    return;
  }
  _ltPaint(tb, items);
}
/* 📅 (2026-08-05) 레벨테스트 카드 → 통합 캘린더로. 달력을 카드마다 새로 만들지 않고
   «한 곳» 으로 보낸다. 달력이 여럿이면 어느 것이 진짜인지 아무도 모르게 된다. */
function ltGotoCalendar() {
  const cal = document.getElementById('card-calendar');
  if (!cal) { alert(adminLang==='en' ? 'Calendar card not found.' : '캘린더 카드를 찾지 못했습니다.'); return; }
  if (cal.tagName === 'DETAILS') cal.open = true;
  const lt = document.getElementById('cal-layer-lt');   // 레벨테스트 레이어를 확실히 켜 준다
  if (lt && !lt.checked) lt.checked = true;
  if (typeof window.calLoad === 'function') window.calLoad();
  cal.scrollIntoView({ behavior: 'auto', block: 'start' });
  const o = cal.style.boxShadow;
  cal.style.boxShadow = '0 0 0 3px rgba(139,92,246,0.55)';
  setTimeout(function(){ cal.style.boxShadow = o; }, 1600);
}

/* 📅 (2026-08-06) «📅 #852 ✓» 배지 → 그 수업이 잡힌 «날짜» 로 달력을 데려간다.
   🔴 지금까지 이 배지는 클릭 핸들러가 하나도 없는 <span> 이었다. 파란 배경에 굵은 글씨라
      누구나 버튼으로 읽는데 눌러도 아무 일이 없어서 «캘린더가 안 뜬다» 는 신고가 됐다.
   ⚠️ 달력 본체(calCur·calLoad)는 admin.html 안 IIFE 라 window 로만 닿는다.
      그 함수가 없는 옛 화면에서는 달 이동 없이 캘린더 카드만 열어 준다(무동작 금지). */
function ltOpenClass(iso, name) {
  const d = String(iso || '').replace(/[^0-9-]/g, '');
  if (d && typeof window.calGotoDate === 'function') { window.calGotoDate(d, { classes: true, name: name || '' }); return; }
  ltGotoCalendar();
}

function _ltResetAppFilters() {
  const q = document.getElementById('lt-apps-q');       if (q) q.value = '';
  const s = document.getElementById('lt-apps-status');  if (s) s.value = '';
  const o = document.getElementById('lt-apps-sort');    if (o) o.value = 'new';
  _ltRenderApps();
}
function _ltPaint(tb, items) {
  /* 🧑‍🏫 (2026-08-05) «담당 강사» 칸 신설 — 서버는 처음부터 assigned_teacher 변경을 받아주는데
     (POST /api/admin/leveltest/applications {id, assigned_teacher}) 화면에 칸이 없어서
     관리자가 자동배정된 강사를 «볼 수도, 바꿀 수도» 없었다. 실제로 사장님이 테스트 신청을
     넣고 특정 매니저에게 맡기려다 막혔다. */
  _ltLoadTeachers();
  const STMAP = {
    pending:['대기','Pending','#f59e0b'], done:['완료','Done','#10b981'], cancelled:['취소','Cancelled','#94a3b8'],
    /* 🔴 'proposed'(자동배정 제안됨)가 이 표에 없어서 회색 raw 문자열로 떴다. 서버가 실제로 쓰는 값이다. */
    proposed:['배정 제안','Proposed','#6366f1'], confirmed:['확정','Confirmed','#0ea5e9']
  };
  tb.innerHTML = items.map(a => {
    const st = STMAP[a.status] || [a.status||'—', a.status||'—', '#94a3b8'];
    const stLabel = adminLang==='en' ? st[1] : st[0];
    const when = ((a.desired_date? _esc(a.desired_date) : '') + (a.desired_time? (' '+_esc(a.desired_time)) : '')) || '—';
    const ai = a.ai_score!=null ? Number(a.ai_score).toFixed(0) : '—';
    const pron = a.pron_score!=null ? Number(a.pron_score).toFixed(0) : '—';
    const lvl = a.final_level ? ('<b style="color:#059669">'+_esc(a.final_level)+'</b>') : '—';
    /* 🔗 (2026-08-07) 계정 연결 상태 — «누구의 신청인지» 가 안 정해져 있으면 학생은
       자기 예약을 어디에서도 못 본다(마이페이지·홈 카드·오늘 수업 전부 uid 로 찾는다).
       화면에는 아무 표시가 없어서 관리자도 그 사실을 몰랐다 → 여기서 말한다.
       ⚠️ 이 블록을 clsCell~actions 사이로 옮기지 말 것 — leveltest_calendar_jump_harness 가
          그 구간을 2500자로 잘라 「📅 #N ✓」 배지를 검사한다(넣었다가 실제로 깨졌다). */
    /* 🆔 (2026-08-15) 이름과 아이디를 «다른 칸» 으로 나눴다. 예전엔 한 칸에 이름+아이디를
       나란히 붙여 그렸는데, 신청자가 이름 칸에 아이디처럼 생긴 값을 적으면(실제 예: 이름
       "paul7038" · 아이디 "jeong") 둘 중 어느 쪽이 이름인지 화면만 봐서는 구분이 안 됐다.
       동명이인도 이름만으로는 못 가른다 → 두 값을 항상 각자의 칸에 둔다. */
    const uidTrial = _ltIsTrialUid(a.student_uid);
    const nameCell = a.student_name ? `<b>${_esc(a.student_name)}</b>` : '<span style="color:#9ca3af">—</span>';
    const uidCell = a.student_uid
      ? `<code style="font-size:10px;color:${uidTrial ? '#b45309' : '#64748b'}">${_esc(a.student_uid)}</code>`
      : `<span title="${adminLang==='en'?'Not linked to any account':'어느 계정에도 안 붙어 있습니다'}" style="font-size:10.5px;color:#b91c1c;font-weight:700">${adminLang==='en'?'— none —':'— 미연결 —'}</span>`;
    const linkBtn = (!a.student_uid || uidTrial)
      ? `<button onclick="ltLinkStudent(${a.id})" title="${!a.student_uid
          ? (adminLang==='en'?'Not linked to any account — the student cannot see this anywhere':'어느 계정에도 안 붙어 있습니다 — 학생이 아무 데서도 못 봅니다')
          : (adminLang==='en'?'Auto-made trial account — nobody logs in with it':'자동 생성된 체험 계정입니다 — 아무도 이 아이디로 로그인하지 않습니다')}" style="margin-left:6px;padding:2px 7px;font-size:10.5px;font-weight:800;border:1px solid #fdba74;border-radius:6px;background:#fff7ed;color:#9a3412;cursor:pointer;white-space:nowrap">🔗 ${adminLang==='en'?'Link account':'계정 연결'}</button>`
      : '';
    /* 📅 수업 연결 상태 — 이어져 있으면 «수업 #852 ✓», 아니면 만들기 버튼.
       희망일이 비어 있으면 만들 수 없으므로 버튼 대신 이유를 보여준다(눌러도 안 되는 버튼 금지). */
    const canMake = !!(a.desired_date && a.desired_time);
    const clsCell = a.schedule_id
      ? `<button onclick="ltOpenClass('${String(a.desired_date||'').replace(/[^0-9-]/g,'')}','${String(a.student_name||'').replace(/['\\]/g,'')}')" title="${adminLang==='en'?'Open this class on the calendar':'달력에서 이 수업 보기'}" style="font-size:11px;font-weight:800;color:#0369a1;background:#e0f2fe;border:1px solid #7dd3fc;border-radius:6px;padding:3px 8px;white-space:nowrap;cursor:pointer">📅 #${a.schedule_id} ✓</button>`
      : (canMake
        ? `<button onclick="leveltestMakeClass(${a.id})" style="padding:3px 8px;font-size:11px;border:0;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;margin-right:4px;white-space:nowrap">${adminLang==='en'?'📅 Create class':'📅 수업 만들기'}</button>`
        : `<span title="${adminLang==='en'?'Needs a preferred date and time':'희망 날짜·시간이 있어야 합니다'}" style="font-size:11px;color:#94a3b8;white-space:nowrap">${adminLang==='en'?'no date':'희망일 없음'}</span>`);
    /* 🎟️ (2026-08-07) 접수 확인·입장 링크 — 운영자가 «다시 건네줄» 수 있어야 한다.
       [왜] 링크는 신청 직후 문자·확정 문자·10분 전 리마인더에만 실려 나갔다. 신청자가
            문자를 못 찾으면 상담직원도 꺼내 줄 데가 없었다(실제 사고: 신청 #15).
       ⚠️ 눌러도 안 되는 버튼은 만들지 않는다 — 서버가 링크를 못 준 행은 이유를 적는다. */
    const tk = a.ticket_url || '';
    const ticketCell = tk
      ? `<button onclick="ltCopyTicket(this,'${String(tk).replace(/['\\]/g,'')}')" title="${adminLang==='en'?'Copy the confirm/join link for this applicant':'신청자에게 줄 확인·입장 링크를 복사합니다'}" style="padding:3px 8px;font-size:11px;border:1px solid #c4b5fd;border-radius:6px;background:#f5f3ff;color:#5b21b6;font-weight:700;cursor:pointer;margin-right:4px;white-space:nowrap">🎟️ ${adminLang==='en'?'Copy link':'링크 복사'}</button><a href="${_esc(tk)}" target="_blank" rel="noopener" title="${adminLang==='en'?'Open the applicant view':'신청자가 보는 화면 열기'}" style="font-size:11px;color:#7c3aed;text-decoration:none;margin-right:6px">↗</a>`
      : `<span title="${adminLang==='en'?'Link unavailable — reload the page':'링크를 받지 못했습니다 — 새로고침해 보세요'}" style="font-size:11px;color:#94a3b8;margin-right:6px">🎟️ —</span>`;
    const actions = a.status==='pending'
      ? `<button onclick="leveltestAppStatus(${a.id},'done')" style="padding:3px 8px;font-size:11px;border:0;border-radius:6px;background:#10b981;color:#fff;cursor:pointer;margin-right:4px">${adminLang==='en'?'✅ Done':'✅ 완료'}</button><button onclick="leveltestAppStatus(${a.id},'cancelled')" style="padding:3px 8px;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer">${adminLang==='en'?'✖':'✖ 취소'}</button>`
      : `<button onclick="leveltestAppStatus(${a.id},'pending')" style="padding:3px 8px;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer">${adminLang==='en'?'↩ Reopen':'↩ 되돌리기'}</button>`;
    /* 🗑️ (2026-08-21) 삭제 — 본사(경영진·관리자)만. 서버가 같은 조건으로 403 을 던지니
       여기서는 "눌러도 안 되는 버튼"을 만들지 않기 위해 화면에서도 감춘다. */
    const deleteBtn = (typeof window !== 'undefined' && window._isHqMgrOrUp)
      ? `<button onclick="leveltestDeleteApp(${Number(a.id)||0})" title="${adminLang==='en'?'Delete this application (cannot be undone)':'이 신청을 삭제합니다 (되돌릴 수 없음)'}" style="padding:3px 7px;font-size:11px;border:1px solid #fecaca;border-radius:6px;background:#fff5f5;color:#b91c1c;cursor:pointer;margin-left:4px">🗑️</button>`
      : '';
    return `<tr><td>${_fmtDate(a.created_at)}</td><td>${nameCell}</td><td style="white-space:nowrap">${uidCell}${linkBtn}</td><td>${when}</td><td>${_ltTeacherCell(a)}</td><td style="text-align:center">${ai}</td><td style="text-align:center">${pron}</td><td style="text-align:center">${lvl}</td><td><span style="font-size:11px;font-weight:700;color:${st[2]}">${stLabel}</span></td><td style="text-align:center">${clsCell}</td><td style="text-align:right;white-space:nowrap">${ticketCell}${actions}${deleteBtn}</td></tr>`;
  }).join('');
  _ltFillTeacherSelects();   // 표를 새로 그렸으니 방금 생긴 select 들을 다시 채운다
}
/* 🔗 신청 ↔ «진짜 학생 계정» 연결 (2026-08-07)
   [왜] 비로그인 신청은 서버가 만든 체험 계정 `lt{번호}` 에 붙는다. 그 계정으로 로그인하는
        사람은 없으므로 학생은 마이페이지·홈·오늘수업 어디에서도 자기 예약을 못 본다.
        전부 «에러 없이» 안 보여서 신고도 안 들어온다(실제 사고: #15 paul710619).
   ⚠️ 아이디를 손으로 치게 하면 오타 한 번에 남의 학생 기록이 오염된다 →
      전화번호·이름으로 찾은 후보를 «보여 주고 고르게» 한다. */
function _ltIsTrialUid(u) { return /^lt\d+(_\d+)?$/i.test(String(u || '')); }

function _ltLinkClose() {
  const m = document.getElementById('lt-link-modal');
  if (m) m.remove();
  document.removeEventListener('keydown', _ltLinkEsc);
}
function _ltLinkEsc(e) { if (e.key === 'Escape') _ltLinkClose(); }

async function ltLinkStudent(id) {
  const en = (adminLang === 'en');
  _ltLinkClose();
  const wrap = document.createElement('div');
  wrap.id = 'lt-link-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:99999999;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px';
  wrap.onclick = e => { if (e.target === wrap) _ltLinkClose(); };
  wrap.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:86vh;overflow:auto;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.35)">'
    + '<div style="font-size:16px;font-weight:800;margin-bottom:4px">🔗 ' + (en ? 'Link this application to a real account' : '이 신청을 진짜 학생 계정에 연결') + '</div>'
    + '<div id="lt-link-body" style="font-size:12.5px;color:#475569">' + (en ? 'Loading…' : '불러오는 중…') + '</div></div>';
  document.body.appendChild(wrap);
  document.addEventListener('keydown', _ltLinkEsc);
  await _ltLinkFetch(id, '');
}

async function _ltLinkFetch(id, q) {
  const en = (adminLang === 'en');
  const body = document.getElementById('lt-link-body');
  if (!body) return;
  let d = null;
  try {
    const r = await fetch('/api/admin/leveltest/applications', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'link_candidates', q: q || '' })
    });
    d = await r.json();
  } catch (e) { /* 아래에서 처리 */ }
  if (!d || !d.ok) {
    body.innerHTML = '<div style="color:#b91c1c">' + (en ? 'Failed to load candidates.' : '후보를 불러오지 못했습니다.') + '</div>';
    return;
  }
  const a = d.application || {};
  const cur = a.student_uid
    ? ('<code>' + _esc(a.student_uid) + '</code>' + (a.is_trial ? (' <span style="color:#b45309;font-weight:700">' + (en ? '(auto-made trial account — nobody logs in with it)' : '(자동 생성된 체험 계정 — 아무도 이 아이디로 로그인하지 않습니다)') + '</span>') : ''))
    : ('<span style="color:#b91c1c;font-weight:700">' + (en ? 'not linked to any account' : '어느 계정에도 안 붙어 있음') + '</span>');
  let h = '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin:10px 0 12px">'
    + '<div><b>' + _esc(a.student_name || '') + '</b>' + (a.phone ? (' · ' + _esc(a.phone)) : '') + '</div>'
    + '<div style="margin-top:4px">' + (en ? 'Now: ' : '지금: ') + cur + '</div>'
    + (a.schedule_id ? ('<div style="margin-top:4px;color:#0369a1">' + (en ? 'The class #' : '수업 #') + a.schedule_id + (en ? ' will move to the new account too.' : ' 의 주인도 함께 옮깁니다.') + '</div>') : '')
    + '</div>';
  const list = d.candidates || [];
  if (list.length) {
    const WHY = { phone: [ '전화번호가 같음', 'same phone' ], name: [ '이름·아이디가 같음', 'same name/ID' ], typed: [ '직접 입력', 'typed' ] };
    h += '<div style="font-weight:800;font-size:12.5px;margin-bottom:6px">' + (en ? 'Pick the right account' : '맞는 계정을 고르세요') + '</div>';
    h += list.map(c => {
      const w = WHY[c.why] || ['', ''];
      return '<button onclick="_ltLinkDo(' + id + ',\'' + String(c.user_id).replace(/['\\]/g, '') + '\')" style="display:block;width:100%;text-align:left;margin-bottom:6px;padding:9px 11px;border:1px solid ' + (c.is_trial ? '#fed7aa' : '#c7d2fe') + ';border-radius:9px;background:' + (c.is_trial ? '#fffbeb' : '#eef2ff') + ';cursor:pointer">'
        + '<b>' + _esc(c.name) + '</b> <code style="font-size:11px;color:#475569">' + _esc(c.user_id) + '</code>'
        + (c.phone ? (' <span style="font-size:11px;color:#64748b">' + _esc(c.phone) + '</span>') : '')
        + '<div style="font-size:11px;color:#6366f1;margin-top:2px">' + (en ? w[1] : w[0])
        + (c.is_trial ? (' · <span style="color:#b45309">' + (en ? 'trial account' : '체험 계정') + '</span>') : '') + '</div></button>';
    }).join('');
  } else {
    h += '<div style="color:#b45309;font-size:12.5px;margin-bottom:8px">'
      + (en ? 'No account matched this phone number or name. Type the student ID below.'
            : '이 전화번호·이름과 맞는 계정을 못 찾았습니다. 아래에 학생 아이디를 직접 넣어 주세요.') + '</div>';
  }
  h += '<div style="display:flex;gap:6px;margin-top:12px;border-top:1px solid #e5e7eb;padding-top:12px">'
    + '<input id="lt-link-q" value="' + _esc(q || '') + '" placeholder="' + (en ? 'student ID' : '학생 아이디') + '" style="flex:1;padding:7px 10px;font-size:13px;border:1px solid #d1d5db;border-radius:8px">'
    + '<button onclick="_ltLinkFetch(' + id + ',document.getElementById(\'lt-link-q\').value.trim())" style="padding:7px 13px;font-size:12.5px;font-weight:700;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer">' + (en ? 'Find' : '찾기') + '</button>'
    + '<button onclick="_ltLinkClose()" style="padding:7px 13px;font-size:12.5px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer">' + (en ? 'Close' : '닫기') + '</button></div>';
  if (q && d.typed_found === null) {
    h += '<div style="color:#b91c1c;font-size:12px;margin-top:7px">' + (en ? 'No account with that ID.' : '그런 아이디의 계정이 없습니다.') + '</div>';
  }
  body.innerHTML = h;
}

async function _ltLinkDo(id, uid) {
  const en = (adminLang === 'en');
  if (!confirm(en ? ('Link this application to "' + uid + '"?\nThe class owner moves too, so the student will see it on their home and My Page.')
                  : ('이 신청을 «' + uid + '» 계정에 연결할까요?\n수업 주인도 함께 옮겨져 그 학생 홈·마이페이지에 보이게 됩니다.'))) return;
  try {
    const r = await fetch('/api/admin/leveltest/applications', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'link_student', student_uid: uid })
    });
    const d = await r.json();
    if (d && d.ok) {
      _ltLinkClose();
      const moved = d.schedule && d.schedule.user_id;
      alert(en ? ('Linked to ' + d.to + '.' + (moved ? ('\nClass #' + d.schedule.schedule_id + ' moved as well.') : ''))
               : ('«' + d.to + '» 로 연결했습니다.' + (moved ? ('\n수업 #' + d.schedule.schedule_id + ' 의 주인도 함께 옮겼습니다.') : '')));
      loadLeveltestApps();
    } else {
      alert((en ? 'Failed: ' : '실패: ') + ((d && (d.message || d.error)) || 'unknown'));
    }
  } catch (e) { alert((en ? 'Error: ' : '오류: ') + e.message); }
}
window.ltLinkStudent = ltLinkStudent;
window._ltLinkFetch = _ltLinkFetch;
window._ltLinkDo = _ltLinkDo;
window._ltLinkClose = _ltLinkClose;

/* 🎟️ 링크 복사. 「복사됨 ✓」을 버튼 위에서 잠깐 보여준다 —
   alert 를 띄우면 한 건 보낼 때마다 확인을 눌러야 해서 여러 건 처리할 때 손이 묶인다.
   ⚠️ navigator.clipboard 는 보안 컨텍스트(https)에서만 산다. 사내망·구형 브라우저에서
      조용히 실패하면 «눌렀는데 아무 일도 없다» 가 되므로 execCommand 폴백을 둔다. */
function ltCopyTicket(btn, url) {
  const en = (adminLang === 'en');
  const done = () => {
    if (!btn) return;
    const old = btn.innerHTML, ob = btn.style.background, oc = btn.style.color;
    btn.innerHTML = en ? '✓ Copied' : '✓ 복사됨';
    btn.style.background = '#dcfce7'; btn.style.color = '#166534';
    setTimeout(() => { btn.innerHTML = old; btn.style.background = ob; btn.style.color = oc; }, 1400);
  };
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = url; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-999px;left:-999px';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) done(); else prompt(en ? 'Copy this link:' : '이 링크를 복사하세요:', url);
    } catch (e) { prompt(en ? 'Copy this link:' : '이 링크를 복사하세요:', url); }
  };
  try {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done).catch(fallback);
    else fallback();
  } catch (e) { fallback(); }
}
window.ltCopyTicket = ltCopyTicket;

async function leveltestAppStatus(id, status) {
  const d = await _menuPost('/api/admin/leveltest/applications', { id, status });
  if (d) loadLeveltestApps();
}

// ── 🎥 수업 리포트(AI) ────────────────────────────────────────────────
//   수업이 끝나면 cron(*/15분)이 집중도(시선)·발화량·끊김 + 그날 학생이 쓴 영어를 모아 자동 생성.
//   근거가 얇으면 AI를 부르지 않고 지표만 남긴다(status='signals_only') → 화면에서도 그대로 구분해 보여준다.
let __liItems = [];
async function loadLessonInsights() {
  let items = [];
  try {
    const r = await fetch('/api/admin/lesson-insights?limit=60', {cache:'no-store', credentials:'include'});
    const d = await r.json().catch(()=>({}));
    if (d && d.ok) items = d.items || [];
  } catch (e) { /* 무시 */ }
  __liItems = items;
  const en = (adminLang === 'en');
  const badge = document.getElementById('li-count-badge');
  if (badge) {
    if (items.length) { badge.textContent = en ? (items.length + ' reports') : ('최근 ' + items.length + '건'); badge.style.display = 'inline-block'; }
    else badge.style.display = 'none';
  }
  const tb = document.getElementById('lesson-insight-table');
  if (!tb) return;
  if (!items.length) {
    tb.innerHTML = '<tr><td colspan="8" class="empty">' +
      (en ? 'No reports yet — created automatically after a class ends (within ~15 min).'
          : '아직 리포트가 없어요 — 수업이 끝나면 15분 안에 자동으로 만들어집니다.') + '</td></tr>';
    return;
  }
  const pct = v => (v == null ? '—' : Number(v).toFixed(0) + '%');
  const bar = (v, color) => {
    if (v == null) return '<span style="color:#94a3b8">—</span>';
    const w = Math.max(0, Math.min(100, Number(v)));
    return '<div style="display:flex;align-items:center;gap:5px"><div style="flex:1;min-width:38px;height:6px;background:#e5e7eb;border-radius:99px;overflow:hidden"><div style="width:' + w + '%;height:100%;background:' + color + '"></div></div><span style="font-size:11px;color:#475569">' + w.toFixed(0) + '</span></div>';
  };
  tb.innerHTML = items.map((a, i) => {
    const thin = a.status === 'signals_only';
    const summary = thin
      ? '<span style="font-size:11px;color:#b45309">' + (en ? 'Signals only — not enough English to analyze' : '지표만 — 분석할 영어 발화가 부족') + '</span>'
      : '<span style="font-size:11.5px;color:#334155">' + _esc(String((en ? (a.summary_en || a.summary_ko) : (a.summary_ko || a.summary_en)) || '').slice(0, 70)) + '…</span>';
    return '<tr>' +
      '<td style="white-space:nowrap">' + _esc(a.lesson_date || '—') + '</td>' +
      '<td><b>' + _esc(a.student_name || a.student_uid || '—') + '</b></td>' +
      '<td>' + _esc(a.teacher_name || '—') + '</td>' +
      '<td style="min-width:90px">' + bar(a.participation_score, '#8b5cf6') + '</td>' +
      '<td style="min-width:80px">' + (a.gaze_score == null ? '<span style="font-size:11px;color:#94a3b8">' + (en ? 'cam off' : '카메라 꺼짐') + '</span>' : bar(a.gaze_score, '#0ea5e9')) + '</td>' +
      '<td style="text-align:center;font-size:11.5px;color:#475569">' + pct(a.talk_ratio) + '</td>' +
      '<td>' + summary + '</td>' +
      '<td style="text-align:right;white-space:nowrap"><button onclick="openLessonInsight(' + i + ')" style="padding:3px 9px;font-size:11px;border:1px solid #8b5cf6;border-radius:6px;background:#fff;color:#6d28d9;cursor:pointer">' + (en ? 'Detail' : '자세히') + '</button></td>' +
      '</tr>';
  }).join('');
}
function openLessonInsight(idx) {
  const a = __liItems[idx];
  const box = document.getElementById('li-detail');
  if (!a || !box) return;
  const en = (adminLang === 'en');
  const list = (arr, color) => {
    const v = Array.isArray(arr) ? arr : [];
    if (!v.length) return '<div style="font-size:11.5px;color:#94a3b8">—</div>';
    return v.map(x => '<div style="font-size:12px;color:#334155;padding-left:12px;position:relative"><span style="position:absolute;left:0;color:' + color + '">•</span>' + _esc(String(x)) + '</div>').join('');
  };
  const pick = (ko, enArr) => (en ? (enArr && enArr.length ? enArr : ko) : (ko && ko.length ? ko : enArr));
  const corr = Array.isArray(a.corrections) ? a.corrections : [];
  const ev = Array.isArray(a.evidence) ? a.evidence : [];
  // 근거 출처 라벨 — 한/영 두 벌. 영어 모드에서 한국어가 남으면 필리핀 강사가 못 읽는다.
  const SRC = { chat:['수업 중 채팅','In-class chat'], chat_thin:['수업 중 채팅(부족)','In-class chat (too little)'],
                stt:['음성 받아쓰기','Speech transcript'], stt_thin:['음성 받아쓰기(부족)','Speech transcript (too little)'],
                none:['근거 없음','No material'] };
  const srcPair = SRC[a.material_source];
  const srcLabel = srcPair ? (en ? srcPair[1] : srcPair[0]) : (a.material_source || '—');
  box.style.display = 'block';
  box.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
      '<b style="font-size:15px;color:#6d28d9">' + _esc(a.student_name || '—') + '</b>' +
      '<span style="font-size:12px;color:#64748b">' + _esc(a.lesson_date || '') + ' · ' + _esc(a.teacher_name || '—') + '</span>' +
      '<span style="flex:1"></span>' +
      '<span style="font-size:11px;color:#64748b">' + (en ? 'Evidence: ' : '근거: ') + _esc(srcLabel) + '</span>' +
      '<button onclick="document.getElementById(\'li-detail\').style.display=\'none\'" style="padding:3px 9px;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer">✕</button>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:12px">' +
      '<div style="background:#f5f3ff;border-radius:8px;padding:8px 10px"><div style="font-size:10.5px;color:#6d28d9">' + (en ? 'Participation' : '참여도') + '</div><b style="font-size:17px;color:#5b21b6">' + (a.participation_score != null ? Number(a.participation_score).toFixed(0) : '—') + '</b></div>' +
      '<div style="background:#f0f9ff;border-radius:8px;padding:8px 10px"><div style="font-size:10.5px;color:#0369a1">' + (en ? 'Focus (looking at screen)' : '집중 (화면 응시)') + '</div><b style="font-size:17px;color:#075985">' + (a.gaze_score != null ? Number(a.gaze_score).toFixed(0) : (en ? 'cam off' : '카메라 꺼짐')) + '</b></div>' +
      '<div style="background:#ecfdf5;border-radius:8px;padding:8px 10px"><div style="font-size:10.5px;color:#047857">' + (en ? 'Talk ratio' : '발화 비율') + '</div><b style="font-size:17px;color:#065f46">' + (a.talk_ratio != null ? Number(a.talk_ratio).toFixed(0) + '%' : '—') + '</b></div>' +
      '<div style="background:#fff7ed;border-radius:8px;padding:8px 10px"><div style="font-size:10.5px;color:#b45309">' + (en ? 'Disconnects' : '끊김') + '</div><b style="font-size:17px;color:#92400e">' + (a.disconnect_count != null ? a.disconnect_count : '—') + '</b></div>' +
    '</div>' +
    (a.status === 'signals_only'
      ? '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;font-size:12px;color:#92400e">' +
          (en ? 'The student produced too little English this lesson, so AI analysis was intentionally skipped. Numbers above are still real.'
              : '이번 수업에서 학생이 남긴 영어가 너무 적어 AI 분석은 일부러 건너뛰었습니다. 위 숫자는 실제 기록입니다.') + '</div>'
      : '<div style="font-size:12.5px;color:#334155;line-height:1.6;margin-bottom:10px">' + _esc(String(pick(a.summary_ko, a.summary_en && [a.summary_en]) || a.summary_ko || a.summary_en || '')) + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">' +
          '<div><div style="font-size:11.5px;font-weight:800;color:#047857;margin-bottom:4px">' + (en ? 'Strengths' : '잘한 점') + '</div>' + list(pick(a.strengths_ko, a.strengths_en), '#10b981') + '</div>' +
          '<div><div style="font-size:11.5px;font-weight:800;color:#b45309;margin-bottom:4px">' + (en ? 'To improve' : '아쉬운 점') + '</div>' + list(pick(a.weaknesses_ko, a.weaknesses_en), '#f59e0b') + '</div>' +
          '<div><div style="font-size:11.5px;font-weight:800;color:#1d4ed8;margin-bottom:4px">' + (en ? 'Next goals' : '다음 목표') + '</div>' + list(pick(a.next_goals_ko, a.next_goals_en), '#3b82f6') + '</div>' +
        '</div>' +
        (corr.length ? '<div style="margin-top:12px"><div style="font-size:11.5px;font-weight:800;color:#6d28d9;margin-bottom:4px">' + (en ? 'Corrections' : '고칠 문장') + '</div>' +
          corr.map(c => '<div style="font-size:12px;margin-bottom:5px;padding:7px 9px;background:#faf5ff;border-radius:7px"><span style="color:#b91c1c;text-decoration:line-through">' + _esc(c.original || '') + '</span> → <b style="color:#065f46">' + _esc(c.corrected || '') + '</b><div style="font-size:11px;color:#64748b;margin-top:2px">' + _esc((en ? (c.why_en || c.why_ko) : (c.why_ko || c.why_en)) || '') + '</div></div>').join('') + '</div>' : '') +
        (ev.length ? '<div style="margin-top:10px"><div style="font-size:11.5px;font-weight:800;color:#475569;margin-bottom:4px">' + (en ? 'Evidence (what the student actually said)' : '판단 근거 (학생이 실제로 쓴 말)') + '</div>' +
          ev.map(e => '<div style="font-size:11.5px;color:#475569;padding-left:12px;position:relative"><span style="position:absolute;left:0">·</span>' + _esc((en ? (e.fact_en || e.fact_ko) : (e.fact_ko || e.fact_en)) || '') + '</div>').join('') + '</div>' : '')
    );
  box.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
async function lessonInsightSweep() {
  const en = (adminLang === 'en');
  const d = await _menuPost('/api/admin/lesson-insights/sweep', { limit: 12 });
  if (d) {
    alert(en ? ('Done. candidates=' + (d.candidates ?? 0) + ', created=' + (d.processed ?? 0) + ', AI used=' + (d.ai_used ?? 0))
             : ('생성 완료 — 대상 ' + (d.candidates ?? 0) + '건, 만든 리포트 ' + (d.processed ?? 0) + '건, AI 분석 ' + (d.ai_used ?? 0) + '건'));
    loadLessonInsights();
  }
}

/* ── 수강신청 ─────────────────────────────────────────────────────────
   🥭 2026-08-08 — 액션 열 재설계
   원래는 «✓ ▶ ✕» 아이콘 3개뿐이었다. 이름표도 툴팁도 없어서 무엇을 하는 버튼인지
   알 수 없었고, 이미 그 상태인 행에서도 버튼이 다 눌렸다. 서버는 status 한 칸만
   UPDATE 하므로(그것 말고는 아무 일도 안 한다) 눌러도 «아무 일도 안 일어난» 것처럼
   보였다 — 실제로 값이 이미 같아서 정말 아무 일도 안 일어난 경우가 많았다.
     · 버튼에 이름표를 붙이고, 갈 수 없는 전이는 비활성으로 잠근다
     · 취소는 확인 한 번 (오탭하면 바로 취소되던 것)
     · 성공하면 토스트로 «무엇이 바뀌었는지» 말해 준다
     · 취소·종료 건을 되살리는 «대기로» 경로를 눈에 보이게 꺼냈다
     · DB 에 있는데 표에서 버려지던 요일·시간·인원방식·강사를 두 번째 줄에 보여준다
     · 같은 학생·같은 패키지가 살아 있는 채로 2건 이상이면 «중복 의심» 경고
   ──────────────────────────────────────────────────────────────────── */
const EN_STATUS_META = {
  pending:   { ko:'대기',   en:'Pending',   bg:'#fef3c7', fg:'#92400e' },
  confirmed: { ko:'확정',   en:'Confirmed', bg:'#dbeafe', fg:'#1e40af' },
  active:    { ko:'수강중', en:'Active',    bg:'#d1fae5', fg:'#065f46' },
  cancelled: { ko:'취소',   en:'Cancelled', bg:'#fee2e2', fg:'#991b1b' },
  expired:   { ko:'종료',   en:'Expired',   bg:'#f3f4f6', fg:'#4b5563' }
};
const EN_LIVE = ['pending', 'confirmed', 'active'];   // 아직 «살아 있는» 신청
let _enItems = [];        // 마지막으로 받아온 원본 — 검색·중복필터는 재요청 없이 다시 그린다
let _enDupOnly = false;
let __enShown = [];       // 🗑️ _renderEnrollments() 가 방금 그린 목록(검색·상태·중복필터 반영)
                          //    — 일괄 삭제는 «반드시» 이것만 지운다. 삭제 쪽에서 조건을 다시
                          //    계산하면 필터 하나(중복만 보기)가 빠지는 날 안 보이는 행까지
                          //    지워진다(레벨테스트 __ltShown 과 같은 규칙, 2026-08-27 실제 발견).
let _enQuery = '';
let _enToastT = null;

function _enStatusMeta(s) {
  return EN_STATUS_META[String(s || '')] || { ko: String(s || '—'), en: String(s || '—'), bg:'#f3f4f6', fg:'#4b5563' };
}
// 중복 판정 키 — UID 가 있으면 UID, 없으면 이름. 패키지까지 같아야 중복으로 본다
function _enDupKey(it) {
  const who = String(it.student_user_id || it.student_name || '').trim().toLowerCase();
  return who + '|' + String(it.package || '').trim().toLowerCase();
}
// 백그라운드 탭에서 CSS transition 이 멈춰도 확실히 보이도록 display 로만 토글한다
function _enToast(msg) {
  let el = document.getElementById('en-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'en-toast';
    el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;' +
      'padding:11px 20px;border-radius:999px;background:#111827;color:#fff;font-size:13px;font-weight:700;' +
      'box-shadow:0 10px 30px rgba(0,0,0,.28);pointer-events:none;display:none;max-width:80vw;text-align:center';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(_enToastT);
  _enToastT = setTimeout(() => { el.style.display = 'none'; }, 2600);
}

async function loadEnrollments() {
  const status = document.getElementById('en-status-filter').value;
  const url = '/api/admin/enrollments' + (status ? `?status=${status}` : '');
  const r = await fetch(url,{cache:'no-store',credentials:'include'});
  const d = await r.json().catch(()=>({}));
  let items = (d && d.ok && Array.isArray(d.items)) ? d.items : [];
  // 🔐 RBAC 스코프 필터
  if (items.length && typeof window.adminScopeFilter === 'function') items = window.adminScopeFilter(items, 'enrollments');
  _enItems = items;
  _renderEnrollments();
}

/* 📞 (2026-09-10 사장님 지시) 수업 30분 전 안내문자가 «갈 번호» 를 목록에서 바로 보고 고친다.
   [왜 목록에도 필요한가] 등록 화면의 연락처 칸은 «앞으로 등록되는» 학생용이다. 이미 등록을
     마친 학생(테스트 명단 9명이 그렇다)에게 번호를 넣을 자리가 없으면, 그 아이들에게는
     안내문자를 영영 못 보낸다.
   ⚠️ 여기 그리는 값은 `notify_phone` — «지금 발송이 실제로 읽는» 번호다(student_erp_override).
      신청서에 적힌 `parent_phone` 을 그리면 두 값이 갈렸을 때 화면이 옛 값을 말하게 된다.
   ⚠️ 번호가 없으면 «—» 가 아니라 «문자 안 감» 이라고 적는다. 빈칸은 «고장» 이나 «모름» 으로
      읽히는데, 이 자리에서 빈칸의 뜻은 «이 학생에게는 안내가 안 나간다» 로 분명하다. */
function _enPhoneCell(it) {
  var en = (adminLang === 'en');
  var p = String(it.notify_phone || '');
  var label = p
    ? '📞 ' + _esc(p.replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, '$1-$2-$3'))
    : (en ? '📵 no SMS — add number' : '📵 문자 안 감 · 번호 넣기');
  return '<br><a href="#" onclick="enEditPhone(event,' + it.id + ')" ' +
    'style="font-size:11px;color:' + (p ? '#0f6b4a' : '#b45309') + ';text-decoration:none;border-bottom:1px dashed currentColor" ' +
    'title="' + (en ? 'Where the 30-minutes-before class reminder is sent' : '수업 30분 전 안내문자가 갈 번호') + '">' +
    label + '</a>';
}

/* 번호를 고친다. 서버가 신청서와 «발송이 읽는 자리» 둘 다에 적고 결과를 돌려준다.
   ⛔ 성공을 지어내지 않는다 — `phone_saved.ok` 가 false 면 그대로 사람에게 말한다.
      (조용히 넘기면 「넣었으니 가겠지」로 믿게 되는데 안 가고, 아무도 이유를 모른다.) */
async function enEditPhone(ev, id) {
  if (ev && ev.preventDefault) ev.preventDefault();
  var en = (adminLang === 'en');
  var cur = (_enItems.find(function (x) { return x.id === id; }) || {}).notify_phone || '';
  var v = prompt(en
    ? 'Guardian phone for class reminders (empty = remove):'
    : '수업 전 안내문자를 받을 학부모 번호 (비우면 삭제):', cur);
  if (v === null) return;                       // 취소 — 아무것도 안 한다
  var digits = String(v).replace(/[^0-9]/g, '');
  if (digits && digits.length < 9) {
    alert(en ? 'That number looks too short.' : '번호가 너무 짧습니다.');
    return;
  }
  try {
    var r = await fetch('/api/admin/enrollments/' + id, {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_phone: digits })
    });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok || d.ok === false) throw new Error((d && d.error) || ('HTTP ' + r.status));
    if (d.phone_saved && d.phone_saved.ok === false) {
      alert((en ? 'Not saved: ' : '저장되지 않았습니다: ') + (d.phone_saved.reason || (en ? 'unknown' : '사유 불명')) +
            (en ? '\nReminders will not be sent to this student.' : '\n이 학생에게는 안내문자가 안 나갑니다.'));
    }
    await loadEnrollments();
  } catch (e) {
    alert((en ? 'Failed: ' : '실패: ') + (e.message || e));
  }
}

function _renderEnrollments() {
  const en = (adminLang === 'en');
  const tb = document.getElementById('enrollments-table');
  if (!tb) return;

  // 🗑️ (2026-08-21) "보이는 항목 전체 삭제" — 본사(경영진·관리자)만. 서버가 같은 조건으로
  //   403 을 던지므로 여기서는 "눌러도 안 되는 버튼"을 안 보이게 하는 것뿐이다.
  const delAllBtn = document.getElementById('en-delete-all-btn');
  if (delAllBtn) delAllBtn.style.display = (typeof window !== 'undefined' && window._isHqMgrOrUp) ? '' : 'none';

  // ── 중복 의심 — 살아 있는 건(대기·확정·수강중)끼리만 본다.
  //    취소된 옛 신청과 지금 수업 중인 신청이 나란히 있는 건 정상이므로 세지 않는다.
  const cnt = {};
  _enItems.forEach(it => {
    if (EN_LIVE.indexOf(String(it.status || '')) < 0) return;
    const k = _enDupKey(it); cnt[k] = (cnt[k] || 0) + 1;
  });
  const isDup = it => EN_LIVE.indexOf(String(it.status || '')) >= 0 && cnt[_enDupKey(it)] > 1;
  const dupTotal = _enItems.filter(isDup).length;

  // ── 상태별 건수 칩 (누르면 그 상태만 보기)
  const box = document.getElementById('en-summary');
  if (box) {
    const by = {};
    _enItems.forEach(it => { const s = String(it.status || ''); by[s] = (by[s] || 0) + 1; });
    const chips = Object.keys(EN_STATUS_META).filter(s => by[s]).map(s => {
      const m = EN_STATUS_META[s];
      return '<button type="button" onclick="enFilterStatus(\'' + s + '\')" ' +
        'style="padding:4px 12px;border:0;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;' +
        'background:' + m.bg + ';color:' + m.fg + '">' + (en ? m.en : m.ko) + ' ' + by[s] + '</button>';
    });
    if (dupTotal) {
      chips.push('<button type="button" onclick="enToggleDupOnly()" ' +
        'style="padding:4px 12px;border:' + (_enDupOnly ? '2px solid #991b1b' : '0') + ';border-radius:999px;' +
        'font-size:12px;font-weight:700;cursor:pointer;background:#fee2e2;color:#991b1b">⚠ ' +
        (en ? 'Possible duplicates ' : '중복 의심 ') + dupTotal + '</button>');
    }
    box.innerHTML = chips.join(' ') || '<span style="font-size:12px;color:#9ca3af">' + (en ? 'No enrollments' : '수강신청 없음') + '</span>';
  }

  // ── 검색 + 중복만 보기
  const q = String(_enQuery || '').trim().toLowerCase();
  let rows = _enItems;
  if (q) rows = rows.filter(it => (
    String(it.student_name || '').toLowerCase().includes(q) ||
    String(it.student_user_id || '').toLowerCase().includes(q) ||
    String(it.package || '').toLowerCase().includes(q) ||
    String(it.teacher_name || '').toLowerCase().includes(q)
  ));
  if (_enDupOnly) rows = rows.filter(isDup);
  __enShown = rows;   // 일괄 삭제(enDeleteAllVisible)가 보는 «화면에 실제로 그린» 목록

  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">' +
      (_enItems.length
        ? (en ? 'Nothing matches this filter' : '이 조건에 맞는 신청이 없습니다')
        : (en ? 'No enrollments visible to your role' : '권한 범위에 표시할 수강신청이 없습니다')) +
      '</td></tr>';
    return;
  }

  tb.innerHTML = rows.map(it => {
    const m = _enStatusMeta(it.status);
    const cur = String(it.status || '');
    const fee = it.monthly_fee_krw ? '₩' + Number(it.monthly_fee_krw).toLocaleString() : '—';

    // 두 번째 줄 — DB 에 있는데 지금까지 표에서 버려지던 것들
    const sched = [it.days_of_week, it.time, it.class_size].filter(Boolean).map(v => _esc(String(v))).join(' · ');
    const who = it.student_user_id ? '<span style="font-size:11px;color:#9ca3af">' + _esc(it.student_user_id) + '</span>' : '';
    const teacher = it.teacher_name
      ? '<span style="font-size:11px;color:#6b7280">👤 ' + _esc(it.teacher_name) + '</span>'
      : (cur === 'confirmed' || cur === 'active'
          ? '<span style="font-size:11px;color:#b45309;font-weight:700">' + (en ? 'no teacher yet' : '강사 미배정') + '</span>' : '');
    // 🧭 (2026-08-12) ③ 배정 우선순위 — 등록 때 무엇을 먼저 맞춰 달라고 했는지
    const prio = it.assign_priority === 'teacher'
      ? '<span style="font-size:11px;color:#6d28d9">' + (en ? '👨‍🏫 teacher first' : '👨‍🏫 강사 우선') + '</span>'
      : (it.assign_priority === 'schedule'
          ? '<span style="font-size:11px;color:#0369a1">' + (en ? '⏰ day·time first' : '⏰ 요일·시간 우선') + '</span>' : '');
    // 🗓️ (2026-08-14) ⑥ 수업 기간 — 등록 때 고른 회차(개월). 끝나는 날이 있으면 같이 보여 준다.
    const durTxt = _enDurLabel(it.duration_months, en);
    const durChip = durTxt
      ? '<span style="font-size:11px;color:#065f46">🗓️ ' + durTxt +
        (it.duration_months !== 'unlimited' && it.end_date ? ' (~' + _esc(String(it.end_date)) + ')' : '') + '</span>'
      : '';
    const sub = [sched, prio, teacher, durChip].filter(Boolean).join(' · ');

    const dupBadge = isDup(it)
      ? ' <span title="' + (en ? 'Same student, same package, more than one live enrollment' : '같은 학생·같은 패키지가 살아 있는 채로 2건 이상입니다')
        + '" style="font-size:10px;font-weight:800;padding:1px 7px;border-radius:999px;background:#fee2e2;color:#991b1b">'
        + (en ? 'DUP?' : '중복?') + '</span>' : '';

    return '<tr>' +
      '<td style="white-space:nowrap">' + _fmtDate(it.created_at) + '</td>' +
      '<td><b>' + _esc(it.student_name) + '</b>' + dupBadge + (who ? '<br>' + who : '') + _enPhoneCell(it) + '</td>' +
      '<td>' + _esc(it.package || '—') + (sub ? '<br><span style="font-size:11px;color:#6b7280">' + sub + '</span>' : '') + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' + fee + '</td>' +
      '<td><span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:800;background:' + m.bg + ';color:' + m.fg + '">' + (en ? m.en : m.ko) + '</span></td>' +
      '<td style="white-space:nowrap">' +
        /* ✅ (2026-08-12) 등록 = 확정. 「✓ 확정」 버튼을 없앴다 — 등록하는 순간 파이프라인이
           같이 돈다(_enAutoConfirm). 그래도 막히는 건은 pending 으로 남으므로, **그때만**
           이유를 열어 보는 버튼을 둔다. 정상 등록건에는 아무 «다음 단계»도 안 보인다.
           확정된 건은 학부모 문자·결제 예약을 나중에 켜야 할 수 있어 «⚙ 후속» 으로 들어간다. */
        (cur === 'pending'
          ? '<button type="button" onclick="enOpenPanel(' + it.id + ')" ' +
            'style="padding:3px 10px;font-size:11px;font-weight:800;border:0;border-radius:5px;margin-right:6px;' +
            'background:#b45309;color:#fff;cursor:pointer" title="' +
            (en ? 'Registration saved but confirmation is on hold — see why' : '등록은 됐지만 확정이 보류된 건입니다 — 이유 보기') + '">' +
            (en ? '▸ Not confirmed' : '▸ 확정 안 됨') + '</button>'
          : (cur === 'confirmed'
            ? '<button type="button" onclick="enOpenPanel(' + it.id + ')" ' +
              'style="padding:3px 10px;font-size:11px;font-weight:700;border:1px solid #7c3aed;border-radius:5px;margin-right:6px;' +
              'background:#fff;color:#6d28d9;cursor:pointer" title="' +
              (en ? 'Parent text / billing schedule — opt in here' : '학부모 문자·결제 예약은 여기서 켭니다') + '">' +
              (en ? '⚙ Follow-up' : '⚙ 후속') + '</button>' : '')) +
        /* 🥭 (2026-08-20) 「▶ 수강시작」 버튼 제거 — enroll-activate.ts 의 확정 파이프라인이
           class_schedules 를 이미 status='active' 로 만든다. 그 버튼은 enrollments.status 만
           confirmed → active 로 바꿀 뿐 시간표는 새로 안 만들어 실제로는 아무 일도 안 났다. */
        _enBtn(it.id, 'cancelled', en ? '✕ Cancel'   : '✕ 취소',    '#ef4444', cur) +
        ((cur === 'cancelled' || cur === 'expired')
          ? _enBtn(it.id, 'pending', en ? '↩ Reopen' : '↩ 되살리기', '#6b7280', cur) : '') +
        /* 🗑️ (2026-08-21) 삭제 — 본사(경영진·관리자)만. 서버가 같은 조건으로 403을 던지니
           여기서는 "눌러도 안 되는 버튼"을 만들지 않기 위해 화면에서도 감춘다. */
        ((typeof window !== 'undefined' && window._isHqMgrOrUp)
          ? '<button type="button" onclick="enDeleteOne(' + it.id + ')" title="' +
            (en ? 'Delete this enrollment (cannot be undone)' : '이 수강신청을 삭제합니다 (되돌릴 수 없음)') + '" ' +
            'style="padding:3px 7px;font-size:11px;border:1px solid #fecaca;border-radius:5px;background:#fff5f5;color:#b91c1c;cursor:pointer;margin-left:2px">🗑️</button>'
          : '') +
      '</td></tr>' +
      '<tr id="en-panel-' + it.id + '" style="display:none"><td colspan="6" style="padding:0;background:#faf5ff"></td></tr>';
  }).join('');
}

/* 🗓️ (2026-08-14) 수업 기간 값 → 사람이 읽는 라벨. 목록·CSV·카톡 요약이 같은 표기를 쓰도록 한곳에 둔다.
   옛 등록건은 이 값이 비어 있다 — 그때는 빈 문자열을 돌려 «아무것도 안 그리게» 한다(«—» 도 안 찍는다). */
function _enDurLabel(v, en) {
  const s = String(v == null ? '' : v);
  if (!s) return '';
  if (s === 'unlimited') return en ? 'Unlimited' : '무기한';
  const n = parseInt(s, 10);
  if (!n || isNaN(n)) return '';
  return en ? (n + (n === 1 ? ' month' : ' months')) : (n + '개월');
}

/* ── 「처리」 패널 — 확정 파이프라인 ──────────────────────────────────────
   상태만 뒤집던 자리에 «무슨 일이 일어날지 먼저 보여주고, 켠 것만 실행» 을 넣었다.
   서버 GET .../plan 은 아무것도 바꾸지 않는다. 며칟날 몇 회가 잡히는지, 그 시간에
   비어 있는 강사가 누구인지, 무엇이 막고 있는지를 먼저 계산해 준다.
   ⚠️ 학부모 문자와 결제 예약은 **기본 꺼짐** — 바깥으로 나가는 일과 돈은 매번 사람이 켠다.
   ──────────────────────────────────────────────────────────────────── */
async function enOpenPanel(id, teacherId) {
  const en = (adminLang === 'en');
  const row = document.getElementById('en-panel-' + id);
  if (!row) return;
  const cell = row.querySelector('td');
  if (row.style.display !== 'none' && teacherId === undefined) { row.style.display = 'none'; return; }
  row.style.display = '';
  cell.innerHTML = '<div style="padding:14px;font-size:12.5px;color:#6b21a8">' + (en ? 'Checking…' : '확인 중…') + '</div>';

  const qs = teacherId ? ('?teacher_id=' + encodeURIComponent(teacherId)) : '';
  let p = null;
  try {
    const r = await fetch('/api/admin/enrollments/' + id + '/plan' + qs, { cache:'no-store', credentials:'include' });
    p = await r.json();
    if (!r.ok || !p.ok) throw new Error(p && p.error ? p.error : ('HTTP ' + r.status));
  } catch (e) {
    cell.innerHTML = '<div style="padding:14px;font-size:12.5px;color:#b91c1c">' +
      (en ? 'Could not build a plan: ' : '계획을 세우지 못했습니다: ') + _esc(String(e.message || e)) + '</div>';
    return;
  }
  cell.innerHTML = _enPanelHtml(p, en);
}

function _enPanelHtml(p, en) {
  const L = (ko, eng) => (en ? eng : ko);
  const line = (label, value, tone) =>
    '<div style="display:flex;gap:10px;padding:3px 0;font-size:12.5px">' +
    '<span style="min-width:92px;color:#6b7280">' + label + '</span>' +
    '<span style="color:' + (tone || '#111827') + '">' + value + '</span></div>';

  // 🧑‍🏫 (2026-08-12) 강사는 등록 화면에서 «이름으로» 지정하지 않는다. 등록 때 고른
  //   ③ 배정 우선순위로 서버가 정해 오고, 여기서는 «누가 왜 붙었는지» 를 보여 준다.
  //   드롭다운은 남겨 두되 «자동 배정 결과를 고치는 자리» 로 이름을 바꿨다 — 자동이 틀렸을 때
  //   운영자가 손 쓸 곳이 아예 없어지면 그건 그것대로 사고다.
  const free = (p.teacher && p.teacher.free) || [];
  const prio = (p.assign_priority === 'teacher') ? 'teacher' : 'schedule';
  const prioChip = '<span style="display:inline-block;padding:1px 8px;border-radius:999px;font-size:10.5px;font-weight:800;' +
    (prio === 'teacher' ? 'background:#ede9fe;color:#5b21b6' : 'background:#e0f2fe;color:#075985') + '">' +
    (prio === 'teacher' ? L('👨‍🏫 강사 우선', '👨‍🏫 teacher first') : L('⏰ 요일·시간 우선', '⏰ day·time first')) + '</span>';
  const autoWhy = !p.teacher.auto ? ''
    : p.teacher.auto === 'continuity'
      ? '<span style="font-size:11px;color:#059669">' + L('· 자동 — 이 학생을 가르치던 강사', '· auto — current teacher') + '</span>'
      : '<span style="font-size:11px;color:#0369a1">' + L('· 자동 — 그 시간 가능한 강사', '· auto — free at that time') + '</span>';
  const teacherPick =
    '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px">' +
      '<b style="color:#111827">' + _esc(p.teacher.name || L('미정', 'none')) + '</b>' + prioChip + autoWhy +
    '</div>' +
    '<div style="margin-top:4px">' +
      '<select id="en-teacher-' + p.id + '" onchange="enOpenPanel(' + p.id + ', this.value)" ' +
        'style="padding:4px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px">' +
        '<option value="">' + L('자동 배정 그대로', 'keep auto-assigned') + '</option>' +
        free.map(t => '<option value="' + _esc(t.id) + '"' + (String(p.teacher.id) === String(t.id) ? ' selected' : '') + '>' +
          _esc(t.name) + '</option>').join('') +
        (p.teacher && p.teacher.id && !free.some(t => String(t.id) === String(p.teacher.id))
          ? '<option value="' + _esc(p.teacher.id) + '" selected>' + _esc(p.teacher.name || p.teacher.id) + ' ' + L('(그 시간 다른 수업 있음)', '(busy then)') + '</option>' : '') +
      '</select> ' +
      '<span style="font-size:11px;color:#6b7280">' +
        L('필요하면 바꿉니다 · 그 시간 가능 ' + free.length + '명 / 전체 ' + (p.teacher.total_active || 0) + '명',
          'override if needed · ' + free.length + ' free of ' + (p.teacher.total_active || 0)) + '</span>' +
    '</div>';

  const dates = p.dates || [];
  const datePreview = dates.length
    ? dates.slice(0, 6).map(_esc).join(', ') + (dates.length > 6 ? ' … ' + L('외 ' + (dates.length - 6) + '회', '+' + (dates.length - 6)) : '')
    : '<span style="color:#b45309">' + L('아직 잡을 수 없습니다', 'nothing schedulable yet') + '</span>';

  const blockers = (p.blockers || []).map(b =>
    '<div style="font-size:12px;color:#991b1b;padding:2px 0">⛔ ' + _esc(b) + '</div>').join('');
  const warnings = (p.warnings || []).map(w =>
    '<div style="font-size:12px;color:#92400e;padding:2px 0">⚠ ' + _esc(w) + '</div>').join('');

  const canRun = (p.blockers || []).length === 0;
  const chk = (key, label, on, note) =>
    '<label style="display:flex;align-items:flex-start;gap:7px;font-size:12.5px;padding:3px 0;cursor:pointer">' +
    '<input type="checkbox" class="en-step" data-step="' + key + '"' + (on ? ' checked' : '') + ' style="margin-top:2px">' +
    '<span>' + label + (note ? '<span style="color:#9ca3af;font-size:11px"> — ' + note + '</span>' : '') + '</span></label>';

  return '<div style="padding:14px 16px;border-left:3px solid #7c3aed">' +
    '<div style="font-weight:800;font-size:13px;color:#5b21b6;margin-bottom:8px">' +
      L('확정하면 이렇게 됩니다', 'What confirming will do') + '</div>' +

    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">' +
      '<div>' +
        line(L('학생', 'Student'),
          _esc(p.student_name || '') + (p.student.linked
            ? ' <span style="color:#059669">✓ ' + _esc(p.student.user_id) + '</span>'
            : (p.student.candidates && p.student.candidates.length
                ? ' <span style="color:#b45309">' + L('명부 후보 ' + p.student.candidates.length + '명', p.student.candidates.length + ' candidates') + '</span>'
                : ' <span style="color:#b91c1c">' + L('명부에 없음', 'not in roster') + '</span>'))) +
        line(L('수업', 'Class'), _esc(p.days_label || '—') + ' ' +
          _esc(Object.values(p.times || {})[0] || '') + ' · ' + p.minutes + L('분', 'min')) +
        line(L('회차', 'Sessions'), p.sessions + L('회', '') + ' · ' + L('시작 ', 'from ') + _esc(p.start_date)) +
        line(L('강사', 'Teacher'), teacherPick) +
      '</div>' +
      '<div>' +
        line(L('잡히는 날', 'Dates'), datePreview,
          dates.length && dates.length < p.sessions ? '#b45309' : '#111827') +
        line(L('건너뜀', 'Skipped'), (p.skipped || []).length
          ? _esc((p.skipped || []).slice(0, 5).join(', ')) + L(' (공휴일·충돌)', ' (holiday/conflict)')
          : L('없음', 'none')) +
        line(L('학부모', 'Parent'), p.student.parent_phone_masked
          ? _esc(p.student.parent_phone_masked)
          : '<span style="color:#b45309">' + L('연락처 없음', 'no phone') + '</span>') +
        line(L('다음 청구', 'Next billing'), _esc(p.next_billing || '—') + ' · ' +
          (p.monthly_fee_krw ? '₩' + Number(p.monthly_fee_krw).toLocaleString() : L('금액 없음', 'no amount'))) +
        /* 💰 (2026-08-26 사장님 지시) 「이 금액이 왜 이 금액인가」 — 수업 시간 배수가 실제로 먹혔는지
           사람이 확정 «전에» 눈으로 확인하는 자리다. 금액은 정기결제가 실제로 청구하므로
           숫자만 보여 주고 근거를 안 보여 주면 틀려도 아무도 모른다.
           ⛔ 여기서 다시 곱하지 않는다 — p.monthly_fee_krw 는 이미 곱해진 최종값이다
              (곱하는 곳은 서버 INSERT 한 자리뿐. src/enroll-fee.ts 머리말). */
        (p.base_fee_krw
          ? line(L('요금 근거', 'How'),
              '<span style="color:' + (p.fee_source === 'agency_price' ? '#b45309' : '#5b21b6') + '">' +
              (p.fee_source === 'agency_price'
                ? L('\u26A0 자동 — 대리점 단가 ', '\u26A0 auto — agency rate \u20A9')
                : L('입력값 ', 'entered \u20A9')) +
              Number(p.base_fee_krw).toLocaleString() +
              L('원(20분 기준) × ' + p.minutes + '분 ' + p.length_multiplier + '배',
                ' (20min base) × ' + p.minutes + 'min (' + p.length_multiplier + '\u00D7)') +
              '</span>')
          : '') +
      '</div>' +
    '</div>' +

    (blockers || warnings ? '<div style="margin:10px 0;padding:8px 10px;background:#fff;border-radius:8px">' + blockers + warnings + '</div>' : '') +

    '<div style="margin-top:10px;padding:10px 12px;background:#fff;border-radius:8px">' +
      '<div style="font-size:11.5px;font-weight:800;color:#6b7280;margin-bottom:4px">' +
        L('실행할 것 (켠 것만 합니다)', 'Steps to run (only what is checked)') + '</div>' +
      chk('link_student', L('학생 계정 연결', 'Link student account'), true, L('없는 계정을 새로 만들지는 않습니다', 'never creates a new account')) +
      chk('assign_teacher', L('강사 배정', 'Assign teacher'), true) +
      chk('create_schedules', L('시간표 생성', 'Create class schedule'), true, L('두 번 눌러도 두 벌 생기지 않습니다', 'idempotent')) +
      chk('create_subscription', L('결제 예약 등록', 'Register billing schedule'), false, L('청구하지 않습니다 — 다음 청구 예정일만 적습니다', 'records the due date only, never charges')) +
      chk('notify_parent', L('학부모 안내 문자', 'Text the parent'), false, L('실제로 발송됩니다', 'actually sends')) +
    '</div>' +

    '<div style="display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap">' +
      '<button type="button" onclick="enRunPanel(' + p.id + ',true)" ' +
        'style="padding:6px 14px;font-size:12px;font-weight:700;border:1px solid #7c3aed;background:#fff;color:#6d28d9;border-radius:6px;cursor:pointer">' +
        L('미리보기', 'Dry run') + '</button>' +
      '<button type="button" ' + (canRun ? '' : 'disabled ') + 'onclick="enRunPanel(' + p.id + ',false)" ' +
        'style="padding:6px 16px;font-size:12.5px;font-weight:800;border:0;border-radius:6px;' +
        (canRun ? 'background:#7c3aed;color:#fff;cursor:pointer' : 'background:#e5e7eb;color:#9ca3af;cursor:default') + '">' +
        L('확정하고 실행', 'Confirm and run') + '</button>' +
      '<button type="button" onclick="enOpenPanel(' + p.id + ')" ' +
        'style="padding:6px 12px;font-size:12px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer">' +
        L('닫기', 'Close') + '</button>' +
      (p.already_created ? '<span style="font-size:11.5px;color:#6b7280">' +
        L('이미 수업 ' + p.already_created + '회 생성됨', p.already_created + ' classes already created') + '</span>' : '') +
    '</div>' +
    '<div id="en-run-' + p.id + '" style="margin-top:10px"></div>' +
  '</div>';
}

async function enRunPanel(id, dry) {
  const en = (adminLang === 'en');
  const row = document.getElementById('en-panel-' + id);
  if (!row) return;
  const out = document.getElementById('en-run-' + id);
  const steps = {};
  row.querySelectorAll('.en-step').forEach(c => { steps[c.getAttribute('data-step')] = c.checked; });
  const sel = document.getElementById('en-teacher-' + id);
  const teacher_id = sel && sel.value ? sel.value : null;

  // 실제 발송·저장 전에는 무엇이 나가는지 한 번 더 말해 준다
  if (!dry) {
    const outward = [];
    if (steps.notify_parent) outward.push(en ? 'a text to the parent' : '학부모에게 문자 발송');
    if (steps.create_subscription) outward.push(en ? 'a billing schedule' : '결제 예약 등록');
    const msg = (en ? 'Run now?' : '지금 실행할까요?') +
      (outward.length ? '\n\n' + (en ? 'This includes: ' : '여기에는 다음이 포함됩니다: ') + outward.join(', ') : '');
    if (!confirm(msg)) return;
  }

  if (out) out.innerHTML = '<div style="font-size:12.5px;color:#6b21a8">' + (en ? 'Running…' : '실행 중…') + '</div>';
  let d = null;
  try {
    const r = await fetch('/api/admin/enrollments/' + id + '/activate', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed', dry: !!dry, teacher_id, steps })
    });
    d = await r.json();
    if (!r.ok || !d.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
  } catch (e) {
    if (out) out.innerHTML = '<div style="font-size:12.5px;color:#b91c1c">' +
      (en ? 'Failed: ' : '실패: ') + _esc(String(e.message || e)) + '</div>';
    return;
  }

  const LBL = {
    link_student: en ? 'Link student' : '학생 계정 연결',
    assign_teacher: en ? 'Assign teacher' : '강사 배정',
    create_schedules: en ? 'Create schedule' : '시간표 생성',
    create_subscription: en ? 'Billing schedule' : '결제 예약',
    notify_parent: en ? 'Parent text' : '학부모 문자',
    set_status: en ? 'Status' : '상태'
  };
  if (out) {
    out.innerHTML = '<div style="padding:10px 12px;background:#fff;border-radius:8px">' +
      '<div style="font-size:11.5px;font-weight:800;color:#6b7280;margin-bottom:5px">' +
        (dry ? (en ? 'Dry run — nothing was saved' : '미리보기 — 아무것도 저장하지 않았습니다')
             : (en ? 'Done' : '실행 결과')) + '</div>' +
      (d.steps || []).map(s =>
        '<div style="font-size:12.5px;padding:2px 0;color:' + (s.ok ? (s.skipped ? '#6b7280' : '#065f46') : '#b91c1c') + '">' +
        (s.ok ? (s.skipped ? '⏭' : '✅') : '❌') + ' <b>' + (LBL[s.step] || _esc(s.step)) + '</b> — ' +
        _esc(s.detail).replace(/\n/g, '<br>') + '</div>').join('') +
    '</div>';
  }
  if (!dry) {
    _enToast(d.all_ok
      ? (en ? 'Enrollment processed' : '수강신청 처리 완료')
      : (en ? 'Processed with some failures — see the panel' : '일부 단계가 실패했습니다 — 패널을 확인하세요'));
    // 표만 새로 그린다. 패널은 결과를 읽을 수 있게 열어 둔다.
    const keep = row.querySelector('td').innerHTML;
    await loadEnrollments();
    const again = document.getElementById('en-panel-' + id);
    if (again) { again.style.display = ''; again.querySelector('td').innerHTML = keep; }
  }
}

// 갈 수 없는 전이(이미 그 상태)는 눌리지 않게 잠근다 — 눌러도 아무 일 없던 것의 정체
function _enBtn(id, target, label, bg, cur) {
  const off = (cur === target);
  return '<button type="button" ' + (off ? 'disabled ' : '') +
    'onclick="setEnrollmentStatus(' + id + ',\'' + target + '\')" ' +
    'style="padding:3px 9px;font-size:11px;font-weight:700;border:0;border-radius:5px;margin-right:4px;' +
      (off ? 'background:#e5e7eb;color:#9ca3af;cursor:default' : 'background:' + bg + ';color:#fff;cursor:pointer') +
    '">' + label + '</button>';
}

function enFilterStatus(s) {
  const sel = document.getElementById('en-status-filter');
  if (!sel) return;
  sel.value = (sel.value === s) ? '' : s;   // 같은 칩을 다시 누르면 전체로
  _enDupOnly = false;
  loadEnrollments();
}
function enToggleDupOnly() { _enDupOnly = !_enDupOnly; _renderEnrollments(); }
function enSearch(v) { _enQuery = v; _renderEnrollments(); }
// 🥭 Phase 25 — 빈 수강신청 양식 다운로드 (배포·인쇄·공유용)
//   3종: Excel(.csv), Word(.doc), 카톡 텍스트(클립보드)
//   양식에 적힌 그대로 채워서 Phase 23 import 영역에 다시 업로드하면 자동 등록
function downloadEmptyEnrollmentTemplateExcel() {
  // 🥭 Phase 29 — Excel 호환 HTML+XML 양식 (.xls)
  // 평문 CSV 가 아닌 Excel 이 직접 렌더링하는 SpreadsheetML/HTML 결합 양식
  // 망고아이 브랜드 톤: 헤더 앰버, 예시 크림, 빈 칸 점선
  const today = new Date().toISOString().slice(0,10);
  // 🥭 Phase 33 — 주간 스케줄 그리드: 7개 요일 컬럼
  const headers = [
    {label:'학생 이름',     hint:'(필수)',           width:90,  group:'info'},
    {label:'UID',          hint:'(선택)',           width:80,  group:'info'},
    {label:'수업 유형',     hint:'체크박스 ☑',       width:170, group:'info'},
    {label:'패키지',        hint:'예: 1년 정규반',    width:130, group:'info'},
    {label:'월 수강료',     hint:'KRW',              width:90,  group:'info'},
    // 📅 주간 스케줄 — 7개 요일 컬럼 (시간을 직접 셀에 입력)
    {label:'월',           hint:'HH:MM',            width:55,  group:'sched'},
    {label:'화',           hint:'HH:MM',            width:55,  group:'sched'},
    {label:'수',           hint:'HH:MM',            width:55,  group:'sched'},
    {label:'목',           hint:'HH:MM',            width:55,  group:'sched'},
    {label:'금',           hint:'HH:MM',            width:55,  group:'sched'},
    {label:'토',           hint:'HH:MM',            width:55,  group:'sched'},
    {label:'일',           hint:'HH:MM',            width:55,  group:'sched'},
    {label:'인원 방식',     hint:'1:1, 1:2, 1:3, 1:N', width:80, group:'info'},
    {label:'시작일',        hint:'YYYY-MM-DD',        width:90, group:'info'}
  ];
  // 체크박스 헬퍼
  const typeChk = (lvl, tri, reg) =>
    (lvl ? '☑' : '☐') + '레벨  ' + (tri ? '☑' : '☐') + '체험  ' + (reg ? '☑' : '☐') + '정규';
  // 시간 그리드 헬퍼 — { mon: '07:00', wed: '08:30', fri: '06:00' } → ['07:00','','08:30','','06:00','','']
  const tg = (sched) => ['mon','tue','wed','thu','fri','sat','sun'].map(d => sched[d] || '');
  const examples = [
    // 홍길동: 풀패키지, 월 7:00 / 수 8:30 / 금 6:00 (요일별 다른 시간 시연)
    ['홍길동', 'user001', typeChk(true, true, true),   '1년 정규반', 350000,
     ...tg({mon:'07:00', wed:'08:30', fri:'06:00'}), '1:1', '2026-05-01'],
    // 김민수: 레벨만, 화 16:20
    ['김민수', 'user002', typeChk(true, false, false), '무료 레벨테스트', 0,
     ...tg({tue:'16:20'}), '1:1', '2026-05-03'],
    // 박지영: 체험+정규, 화·목 17:30 (요일별 같은 시간)
    ['박지영', 'user003', typeChk(false, true, true),  '6개월 그룹반', 220000,
     ...tg({tue:'17:30', thu:'17:30'}), '1:3', '2026-05-04']
  ];
  const emptyTypeChk = typeChk(false, false, false);

  const colCount = headers.length;
  const colWidthsXml = headers.map(h => '<x:Column x:Width="' + h.width + '"/>').join('');

  let html =
'<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
      'xmlns="http://www.w3.org/TR/REC-html40">' +
'<head>' +
  '<meta charset="UTF-8">' +
  '<meta http-equiv="Content-Type" content="application/vnd.ms-excel; charset=UTF-8">' +
  '<title>망고아이 수강신청서</title>' +
  '<!--[if gte mso 9]>' +
  '<xml>' +
    '<x:ExcelWorkbook>' +
      '<x:ExcelWorksheets>' +
        '<x:ExcelWorksheet>' +
          '<x:Name>수강신청서</x:Name>' +
          '<x:WorksheetOptions>' +
            '<x:DefaultRowHeight>360</x:DefaultRowHeight>' +
            '<x:DisplayGridlines/>' +
            '<x:FreezePanes/>' +
            '<x:FrozenNoSplit/>' +
            '<x:SplitHorizontal>5</x:SplitHorizontal>' +
            '<x:TopRowBottomPane>5</x:TopRowBottomPane>' +
            '<x:ActivePane>2</x:ActivePane>' +
          '</x:WorksheetOptions>' +
          colWidthsXml +
        '</x:ExcelWorksheet>' +
      '</x:ExcelWorksheets>' +
    '</x:ExcelWorkbook>' +
  '</xml>' +
  '<![endif]-->' +
  '<style>' +
    'body { font-family: MangoiHanSC,"맑은 고딕", "Malgun Gothic", sans-serif; }' +
    'table { border-collapse: collapse; mso-table-overlap: never; mso-table-lspace: 0; mso-table-rspace: 0; }' +
    'td { font-family: MangoiHanSC,"맑은 고딕", sans-serif; mso-number-format: "\\@"; vertical-align: middle; }' +
    /* 제목 */
    '.title-cell { ' +
      'font-size: 22pt; font-weight: bold; color: #9a3412; ' +
      'text-align: center; padding: 18pt; height: 50pt; ' +
      'background: #fed7aa; ' +
      'border-bottom: 3pt solid #f59e0b; ' +
    '}' +
    '.subtitle-cell { ' +
      'font-size: 10pt; color: #78350f; ' +
      'text-align: center; padding: 8pt; ' +
      'background: #fef3c7; ' +
      'border-bottom: 1pt solid #fde68a; ' +
    '}' +
    /* 헤더 — 정보 컬럼 (앰버) */
    '.header-cell { ' +
      'background: #f59e0b; color: #ffffff; ' +
      'font-weight: bold; font-size: 11pt; ' +
      'text-align: center; padding: 10pt 8pt; ' +
      'border: 1pt solid #b45309; ' +
      'mso-pattern: solid #f59e0b; ' +
    '}' +
    /* 헤더 — 주간 스케줄 7개 요일 (파랑) */
    '.header-sched { ' +
      'background: #3b82f6; color: #ffffff; ' +
      'font-weight: bold; font-size: 12pt; ' +
      'text-align: center; padding: 10pt 4pt; ' +
      'border: 1pt solid #1e40af; ' +
      'mso-pattern: solid #3b82f6; ' +
    '}' +
    '.header-sched-weekend { ' +
      'background: #ef4444; color: #ffffff; ' +
      'mso-pattern: solid #ef4444; ' +
      'border: 1pt solid #991b1b; ' +
    '}' +
    '.header-hint { ' +
      'font-size: 8pt; font-weight: normal; color: rgba(255,255,255,0.85); ' +
      'display: block; margin-top: 2pt; ' +
    '}' +
    /* 스케줄 셀 — 시간 입력 (예시·빈 행 모두) */
    '.sched-cell { ' +
      'background: #eff6ff; color: #1e40af; ' +
      'text-align: center; font-weight: bold; ' +
      'font-size: 10pt; padding: 8pt 4pt; ' +
      'border: 1pt solid #bfdbfe; ' +
      'mso-pattern: solid #eff6ff; ' +
    '}' +
    '.sched-empty { ' +
      'background: #f9fafb; ' +
      'border: 1pt solid #e5e7eb; ' +
      'mso-pattern: solid #f9fafb; ' +
      'text-align: center; padding: 8pt 4pt; ' +
    '}' +
    '.sched-empty-alt { ' +
      'background: #ffffff; ' +
      'border: 1pt solid #e5e7eb; ' +
      'mso-pattern: solid #ffffff; ' +
      'text-align: center; padding: 8pt 4pt; ' +
    '}' +
    /* 예시 행 (행 5~7) */
    '.example-cell { ' +
      'background: #fffbeb; color: #78350f; ' +
      'font-size: 10pt; padding: 10pt 8pt; ' +
      'text-align: center; ' +
      'border: 1pt solid #fde68a; ' +
      'mso-pattern: solid #fffbeb; ' +
    '}' +
    '.example-name { font-weight: bold; color: #9a3412; }' +
    /* 빈 행 (입력 영역) */
    '.empty-cell { ' +
      'background: #ffffff; ' +
      'height: 26pt; padding: 8pt; ' +
      'border: 1pt solid #e5e7eb; ' +
      'mso-pattern: solid #ffffff; ' +
    '}' +
    '.empty-cell-alt { ' +
      'background: #fafafa; ' +
      'height: 26pt; padding: 8pt; ' +
      'border: 1pt solid #e5e7eb; ' +
      'mso-pattern: solid #fafafa; ' +
    '}' +
    /* 안내 박스 */
    '.note-cell { ' +
      'background: #f0fdf4; color: #14532d; ' +
      'font-size: 9pt; padding: 10pt 14pt; ' +
      'border: 1pt solid #bbf7d0; ' +
      'border-left: 4pt solid #10b981; ' +
      'mso-pattern: solid #f0fdf4; ' +
      'text-align: left; ' +
    '}' +
    /* 라벨 (예시) */
    '.label-example { ' +
      'background: #fde68a; color: #92400e; ' +
      'font-size: 9pt; font-weight: bold; ' +
      'text-align: center; padding: 4pt; ' +
      'mso-pattern: solid #fde68a; ' +
    '}' +
    '.label-empty { ' +
      'background: #e0f2fe; color: #075985; ' +
      'font-size: 9pt; font-weight: bold; ' +
      'text-align: center; padding: 4pt; ' +
      'mso-pattern: solid #e0f2fe; ' +
    '}' +
    /* 푸터 */
    '.footer-cell { ' +
      'background: #f9fafb; color: #6b7280; ' +
      'font-size: 8pt; text-align: center; padding: 8pt; ' +
      'border-top: 1pt solid #e5e7eb; ' +
      'mso-pattern: solid #f9fafb; ' +
    '}' +
  '</style>' +
'</head>' +
'<body>' +
'<table border="0" cellspacing="0" cellpadding="0">';

  // 1. 제목
  html += '<tr><td class="title-cell" colspan="' + colCount + '">망고아이 수강신청서</td></tr>';
  // 2. 부제
  html += '<tr><td class="subtitle-cell" colspan="' + colCount + '">발급일: ' + today +
          ' · 학원·학부모 작성용 · 작성 후 학원에 다시 제출해 주세요</td></tr>';
  // 3. 안내 박스
  html += '<tr><td class="note-cell" colspan="' + colCount + '">' +
          '💡 <b>작성 안내</b><br>' +
          '• 굵게 표시된 노란 행은 <b>예시</b>입니다 (참고만, 그대로 두셔도 무방). ' +
          '아래 흰색 빈 행에 학생 정보를 채워주세요.<br>' +
          '• <b>수업 유형</b>: 해당 항목의 ☐ 를 ☑ 로 바꿔주세요. (예: ☑레벨 ☐체험 ☑정규 = 레벨+정규)<br>' +
          '• <b>📅 주간 스케줄 (파란 영역)</b>: 수업 있는 요일 칸에 시간을 직접 입력 (HH:MM 24시간제)<br>' +
          '• 같은 학생도 요일마다 시간이 달라도 됩니다 (예: 홍길동 → 월 07:00, 수 08:30, 금 06:00)<br>' +
          '• 빈 칸 = 그 요일에 수업 없음 · 인원은 1:1 ~ 1:N<br>' +
          '• 작성 완료 후 이 파일을 그대로 학원의 [📥 양식 등록] 영역에 업로드하면 자동 등록됩니다.' +
          '</td></tr>';

  // 4. 헤더 라벨 (예시 라벨)
  html += '<tr><td class="label-example" colspan="' + colCount + '">▼ 예시 (참고용 — 실제 학생 데이터는 아래 빈 행에 입력)</td></tr>';

  // 5. 컬럼 헤더 — 정보 컬럼은 앰버, 주간 스케줄 컬럼은 파랑(주말은 빨강)
  // 🥭 Phase 33 — 시각적으로 그룹 구분 (위쪽에 그룹 라벨)
  html += '<tr>';
  let infoCount = 0, schedCount = 0;
  headers.forEach(h => { if (h.group === 'info') infoCount++; else schedCount++; });
  // 그룹 라벨 행 (정보 / 주간 스케줄 / 정보 — 시작일·인원은 마지막 정보 그룹)
  // 더 단순하게: 학생정보(5) | 주간 스케줄(7) | 등록정보(2)
  html += '<td colspan="5" style="background:#fef3c7;color:#92400e;font-weight:bold;text-align:center;padding:6pt;border:1pt solid #fde68a">👤 학생 정보</td>';
  html += '<td colspan="7" style="background:#dbeafe;color:#1e40af;font-weight:bold;text-align:center;padding:6pt;border:1pt solid #93c5fd">📅 주간 스케줄 (요일별 시간 입력)</td>';
  html += '<td colspan="2" style="background:#fce7f3;color:#9f1239;font-weight:bold;text-align:center;padding:6pt;border:1pt solid #fbcfe8">📋 등록 정보</td>';
  html += '</tr>';
  // 실제 컬럼 헤더
  html += '<tr>';
  headers.forEach((h, i) => {
    let cls = 'header-cell';
    if (h.group === 'sched') {
      cls = 'header-sched';
      if (h.label === '토' || h.label === '일') cls += ' header-sched-weekend';
    }
    html += '<td class="' + cls + '" style="width:' + h.width + 'pt">' +
            h.label + '<span class="header-hint">' + h.hint + '</span></td>';
  });
  html += '</tr>';

  // 6. 예시 행
  examples.forEach(row => {
    html += '<tr>';
    row.forEach((cell, i) => {
      const h = headers[i];
      let cls = '';
      if (h.group === 'sched') cls = 'sched-cell';
      else if (i === 0) cls = 'example-cell example-name';
      else cls = 'example-cell';
      const val = (i === 4 && cell) ? Number(cell).toLocaleString('ko-KR') : (cell || '　');
      html += '<td class="' + cls + '">' + val + '</td>';
    });
    html += '</tr>';
  });

  // 7. 빈 행 라벨
  html += '<tr><td class="label-empty" colspan="' + colCount + '">▼ 학생 정보 입력 (빈 행에 채워 주세요)</td></tr>';

  // 8. 컬럼 헤더 (한 번 더 — 입력 영역 위, 그룹 라벨 포함)
  html += '<tr>';
  html += '<td colspan="5" style="background:#fef3c7;color:#92400e;font-weight:bold;text-align:center;padding:6pt;border:1pt solid #fde68a">👤 학생 정보</td>';
  html += '<td colspan="7" style="background:#dbeafe;color:#1e40af;font-weight:bold;text-align:center;padding:6pt;border:1pt solid #93c5fd">📅 주간 스케줄</td>';
  html += '<td colspan="2" style="background:#fce7f3;color:#9f1239;font-weight:bold;text-align:center;padding:6pt;border:1pt solid #fbcfe8">📋 등록 정보</td>';
  html += '</tr>';
  html += '<tr>';
  headers.forEach((h, i) => {
    let cls = 'header-cell';
    if (h.group === 'sched') {
      cls = 'header-sched';
      if (h.label === '토' || h.label === '일') cls += ' header-sched-weekend';
    }
    html += '<td class="' + cls + '">' + h.label + '</td>';
  });
  html += '</tr>';

  // 9. 빈 입력 행 12개 (alt 컬러로 가독성)
  // 수업 유형(2) 셀에 체크박스 힌트, 스케줄 셀(5~11)은 옅은 파랑/흰
  for (let r = 0; r < 12; r++) {
    html += '<tr>';
    for (let c = 0; c < colCount; c++) {
      const h = headers[c];
      let cls;
      if (h.group === 'sched') {
        cls = (r % 2 === 0) ? 'sched-empty' : 'sched-empty-alt';
      } else {
        cls = (r % 2 === 0) ? 'empty-cell' : 'empty-cell-alt';
      }
      let content = '　';
      if (c === 2) {
        content = '<span style="color:#cbd5e1;font-size:9pt">' + emptyTypeChk + '</span>';
      }
      html += '<td class="' + cls + '">' + content + '</td>';
    }
    html += '</tr>';
  }

  // 10. 푸터
  html += '<tr><td class="footer-cell" colspan="' + colCount + '">© Mangoi · 망고아이 영어 화상수업 · 양식 자동 발급 ' + today + '</td></tr>';

  html += '</table></body></html>';

  _downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }),
    '수강신청_빈양식_' + today + '.xls');
}

function downloadEmptyEnrollmentTemplateWord() {
  // 🥭 Phase 30 — 다중 학생 동시 작성 가능한 표 형식 (Excel 양식과 동일 구조)
  // A4 가로 방향, 한 양식에 최대 15명까지 입력 가능
  const today = new Date().toISOString().slice(0,10);
  // 🥭 Phase 31 — 체크박스 헬퍼
  const typeChk = (lvl, tri, reg) =>
    (lvl ? '☑' : '☐') + '레벨  ' + (tri ? '☑' : '☐') + '체험  ' + (reg ? '☑' : '☐') + '정규';
  const emptyTypeChk = typeChk(false, false, false);
  // 🥭 Phase 33 — 주간 스케줄 그리드: 7개 요일 컬럼 (월~일)
  // 시간 그리드 헬퍼 — 객체 → ['07:00','','08:30','','06:00','','']
  const tg = (sched) => ['mon','tue','wed','thu','fri','sat','sun'].map(d => sched[d] || '');
  const examples = [
    // 홍길동: 풀패키지, 월 7:00 / 수 8:30 / 금 6:00 (요일별 다른 시간 시연 — 사용자 예시)
    ['1', '홍길동', 'user001', typeChk(true, true, true),   '1년 정규반', '350,000',
     ...tg({mon:'07:00', wed:'08:30', fri:'06:00'}), '1:1', '2026-05-01'],
    // 김민수: 레벨만, 화 16:20
    ['2', '김민수', 'user002', typeChk(true, false, false), '무료 레벨테스트', '0',
     ...tg({tue:'16:20'}), '1:1', '2026-05-03'],
    // 박지영: 체험+정규, 화·목 17:30 (같은 시간)
    ['3', '박지영', 'user003', typeChk(false, true, true),  '6개월 그룹반', '220,000',
     ...tg({tue:'17:30', thu:'17:30'}), '1:3', '2026-05-04']
  ];
  // 컬럼: # 학생 UID 유형 패키지 수강료 [월화수목금토일] 인원 시작일 = 15개
  const headers = ['#', '학생 이름*', 'UID', '수업 유형* (☑)', '패키지', '월 수강료', '월','화','수','목','금','토','일', '인원', '시작일'];
  const widths  = [3,    9,           7,     14,              11,        9,           5,   5,   5,   5,   5,   5,   5,    6,      11];
  const groups  = ['info','info','info','info','info','info', 'sched','sched','sched','sched','sched','sched','sched', 'info','info'];

  // 빈 입력 행 생성 — 유형 컬럼(인덱스 3)은 체크박스 힌트, 스케줄 컬럼(6~12)은 옅은 파랑
  let emptyRows = '';
  for (let i = 1; i <= 15; i++) {
    const altClass = (i % 2 === 0) ? 'data-row-alt' : 'data-row';
    emptyRows += '<tr class="' + altClass + '">' +
      '<td class="data-num">' + i + '</td>';
    for (let c = 1; c < headers.length; c++) {
      if (c === 3) {
        emptyRows += '<td><span style="color:#cbd5e1;font-size:9pt">' + emptyTypeChk + '</span></td>';
      } else if (groups[c] === 'sched') {
        // 스케줄 셀 — 옅은 파랑 배경
        emptyRows += '<td class="sched-empty">　</td>';
      } else {
        emptyRows += '<td>　</td>';
      }
    }
    emptyRows += '</tr>';
  }

  // 헤더 셀 HTML — 그룹별 색상 (정보 앰버, 스케줄 파랑, 주말 빨강)
  const headerCells = headers.map((h, i) => {
    let cls = '';
    if (groups[i] === 'sched') {
      cls = 'sched-header';
      if (h === '토' || h === '일') cls = 'sched-header-weekend';
    }
    return '<th' + (cls ? ' class="' + cls + '"' : '') + ' style="width:' + widths[i] + '%">' + h + '</th>';
  }).join('');

  // 그룹 라벨 행 (헤더 위)
  const groupHeaderRow =
    '<tr class="group-row">' +
      '<th colspan="6" class="group-info">👤 학생 정보</th>' +
      '<th colspan="7" class="group-sched">📅 주간 스케줄 (요일별 시간)</th>' +
      '<th colspan="2" class="group-extra">📋 등록 정보</th>' +
    '</tr>';

  // 예시 행 HTML
  const exampleRows = examples.map(row =>
    '<tr class="example-row">' +
      row.map((cell, i) => {
        let cls = '';
        if (i === 1) cls = 'example-name';
        if (groups[i] === 'sched' && cell) cls += ' sched-cell-filled';
        else if (groups[i] === 'sched') cls += ' sched-cell-empty-row';
        return '<td' + (cls ? ' class="' + cls.trim() + '"' : '') + '>' + (cell || '　') + '</td>';
      }).join('') +
    '</tr>'
  ).join('');

  const docHtml =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
          'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
          'xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="UTF-8"><title>망고아이 수강신청서</title>' +
    '<!--[if gte mso 9]><xml>' +
    '<w:WordDocument>' +
      '<w:View>Print</w:View>' +
      '<w:Zoom>100</w:Zoom>' +
      '<w:DoNotOptimizeForBrowser/>' +
    '</w:WordDocument></xml><![endif]-->' +
    '<style>' +
      // A4 가로 방향
      '@page { size: A4 landscape; margin: 1.4cm; mso-page-orientation: landscape; }' +
      'body { font-family: MangoiHanSC,"맑은 고딕", "Malgun Gothic", sans-serif; font-size: 10pt; color: #1f2937; line-height: 1.5; }' +
      // 제목
      '.doc-title { font-size: 22pt; font-weight: bold; color: #9a3412; text-align: center; padding: 8pt 0; margin: 0; ' +
        'border-bottom: 3pt solid #f59e0b; }' +
      '.doc-subtitle { font-size: 10pt; color: #78350f; text-align: center; padding: 4pt 0; margin: 0 0 14pt 0; ' +
        'background: #fef3c7; }' +
      // 안내 박스
      '.guide { background: #f0fdf4; border-left: 4pt solid #10b981; padding: 10pt 14pt; ' +
        'font-size: 9pt; color: #14532d; margin-bottom: 14pt; }' +
      '.guide b { color: #065f46; }' +
      // 섹션 라벨
      '.section-label { background: #fef3c7; color: #92400e; font-size: 11pt; font-weight: bold; ' +
        'padding: 6pt 10pt; margin: 14pt 0 6pt 0; border-left: 4pt solid #f59e0b; }' +
      '.section-label-blue { background: #e0f2fe; color: #075985; border-left-color: #0284c7; }' +
      // 표 공통
      'table { border-collapse: collapse; width: 100%; }' +
      'th { background: #f59e0b; color: #ffffff; font-size: 10pt; font-weight: bold; ' +
        'text-align: center; padding: 8pt 4pt; border: 0.75pt solid #b45309; }' +
      'td { padding: 8pt 6pt; border: 0.75pt solid #d6d3d1; vertical-align: middle; font-size: 9pt; }' +
      // 🥭 Phase 33 — 그룹 헤더 (학생 정보 / 주간 스케줄 / 등록 정보)
      '.group-row th { padding: 5pt; font-size: 10pt; }' +
      '.group-info { background: #fef3c7; color: #92400e; border-color: #fde68a; }' +
      '.group-sched { background: #dbeafe; color: #1e40af; border-color: #93c5fd; }' +
      '.group-extra { background: #fce7f3; color: #9f1239; border-color: #fbcfe8; }' +
      // 주간 스케줄 헤더 (요일)
      '.sched-header { background: #3b82f6; color: #ffffff; border-color: #1e40af; }' +
      '.sched-header-weekend { background: #ef4444; color: #ffffff; border-color: #991b1b; }' +
      // 예시 행
      '.example-row td { background: #fffbeb; color: #78350f; font-style: italic; text-align: center; }' +
      '.example-name { font-weight: bold; color: #9a3412 !important; font-style: normal !important; }' +
      '.sched-cell-filled { background: #eff6ff !important; color: #1e40af !important; ' +
        'font-weight: bold !important; font-style: normal !important; font-size: 10pt !important; }' +
      '.sched-cell-empty-row { background: #fafafa !important; }' +
      // 빈 입력 행 (alt 컬러)
      '.data-row td { background: #ffffff; height: 22pt; text-align: center; }' +
      '.data-row-alt td { background: #f9fafb; height: 22pt; text-align: center; }' +
      '.data-num { color: #9ca3af; font-weight: bold; font-size: 9pt; }' +
      '.sched-empty { background: #f0f9ff !important; border-color: #bfdbfe !important; }' +
      // 푸터
      '.footer { margin-top: 18pt; font-size: 8pt; color: #9ca3af; text-align: center; ' +
        'padding-top: 10pt; border-top: 0.5pt solid #e5e7eb; }' +
    '</style></head>' +
    '<body>' +

    // 제목
    '<div class="doc-title">망고아이 수강신청서</div>' +
    '<div class="doc-subtitle">발급일: ' + today + ' · 학원·학부모 작성용 · 한 양식에 최대 15명까지 작성 가능</div>' +

    // 작성 가이드
    '<div class="guide">' +
      '💡 <b>작성 안내</b><br>' +
      '• 한 학생당 한 행씩 채워주세요. <b>학생 이름</b>과 <b>수업 유형</b>은 필수.<br>' +
      '• <b>수업 유형</b>: 해당 항목의 ☐ 를 ☑ 로 변경 (예: <code>☑레벨 ☐체험 ☑정규</code> = 레벨+정규)<br>' +
      '• <b>📅 주간 스케줄 (파란 영역)</b>: 수업 있는 요일 칸에 시간 직접 입력 (HH:MM 24시간)<br>' +
      '• 같은 학생도 요일마다 시간이 달라도 됩니다 (예: 홍길동 → 월 07:00, 수 08:30, 금 06:00)<br>' +
      '• 빈 칸 = 그 요일에 수업 없음　·　<b>인원 방식</b>: 1:1 ~ 1:N 중 선택<br>' +
      '• 작성 후 이 파일을 그대로 학원의 [📥 양식 등록] 영역에 업로드하면 자동 등록됩니다.' +
    '</div>' +

    // 예시 섹션
    '<div class="section-label">▼ 예시 (참고용 — 실제 학생 데이터는 아래 입력 영역에)</div>' +
    '<table><thead>' + groupHeaderRow + '<tr>' + headerCells + '</tr></thead><tbody>' + exampleRows + '</tbody></table>' +

    // 입력 섹션
    '<div class="section-label section-label-blue">▼ 학생 정보 입력 (한 학생당 한 행, 최대 15명)</div>' +
    '<table><thead>' + groupHeaderRow + '<tr>' + headerCells + '</tr></thead><tbody>' + emptyRows + '</tbody></table>' +

    // 푸터
    '<div class="footer">© Mangoi · 망고아이 영어 화상수업 · 양식 자동 발급 ' + today + '</div>' +

    '</body></html>';

  _downloadBlob(new Blob([docHtml], { type: 'application/msword;charset=utf-8' }),
    '수강신청_빈양식_' + today + '.doc');
}

function copyEmptyEnrollmentTemplateKakao() {
  const tmpl =
'📚 [망고아이] 수강신청\n' +
'━━━━━━━━━━━━━━━\n' +
'학생: \n' +
'UID: \n' +
'수업 유형: (해당 항목 ☐ → ☑ 로 변경)\n' +
'   ☐ 레벨   ☐ 체험   ☐ 정규\n' +
'패키지: \n' +
'월 수강료: \n' +
'요일: (월/화/수/목/금/토/일)\n' +
'시간: (단일: 10:30 / 요일별: 월 7:30, 수 8:00)\n' +
'인원 방식: (1:1, 1:2, 1:3, 1:N 중 선택)\n' +
'시작일: (YYYY-MM-DD)\n' +
'━━━━━━━━━━━━━━━';
  // 클립보드에 복사
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tmpl).then(() => {
      alert('✅ 카톡 양식을 클립보드에 복사했습니다.\n\n카톡 채팅창에 Ctrl+V 로 붙여넣고 학생/학부모에게 보내세요.');
    }).catch(err => {
      // 클립보드 실패시 다이얼로그로 보여줌
      prompt('아래 양식을 복사해서 카톡으로 보내주세요:', tmpl);
    });
  } else {
    prompt('아래 양식을 복사해서 카톡으로 보내주세요:', tmpl);
  }
}

// 🥭 Phase 24/25 — 다중 학생 동시 등록 (표 형식)
//   Phase 25 추가 필드: 수업 유형(레벨/체험/정규 다중), 요일(월~일 다중), 시간(10분 단위)
const _EN_TIME_OPTIONS = (() => {
  const arr = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 10) {
      arr.push(String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0'));
    }
  }
  return arr;
})();

function _addEnrollmentRow(prefill) {
  const tbody = document.getElementById('en-multi-rows');
  if (!tbody) return;
  const idx = tbody.children.length + 1;
  const tr = document.createElement('tr');
  const v = prefill || {};
  const types = v.types || [];
  const days = v.days || [];
  // 🥭 Phase 26 — 수업 인원 방식 select
  //   🧑‍🏫 (2026-08-12) 요구사항 ④ 「그룹수업 여부 (1:1, 그룹 중 선택)」 — 1:2~1:6 을 낱개로
  //   고르게 두면 «인원 수»를 묻는 칸이 되어 버린다. 저장값은 예전 그대로 1:1 / 1:N 을 쓴다
  //   (서버 parseClassSize 가 '1:N' 을 0=그룹으로 읽고, 기존 데이터도 이 표기다).
  const _enrIsEn = (document.documentElement.lang === 'en' || window.adminLang === 'en');
  // ⏱ (2026-08-26 사장님 지시) 수업 시간(분) — 안 고르면 기본 20분(class-policy.ts DEFAULT_CLASS_MINUTES).
  //   20/30/40 만 있는 이유는 class-policy.ts 의 «10분 격자» 설명과 같다(25분은 꺼둔 스위치라 안 넣는다).
  //   ⚠️ ⑥ 수업 기간과 다르게 «필수» 로 만들지 않는다 — 안 고른 채로도 20분이라는 유효한 값이 있어서다.
  const classMinOptionsList = [20, 30, 40];
  const _classMinCur = [20, 30, 40].includes(Number(v.duration_min)) ? Number(v.duration_min) : 20;
  const classMinOpts = classMinOptionsList.map(m =>
    '<option value="' + m + '"' + (_classMinCur === m ? ' selected' : '') + '>' + m + (_enrIsEn ? 'min' : '분') + '</option>').join('');
  const sizeOptionsList = [
    { v: '1:1', ko: '1:1 개인',      en: '1:1' },
    { v: '1:N', ko: '그룹 (1:N)',   en: 'Group (1:N)' }
  ];
  // 예전 데이터·가져오기 값(1:2~1:6)은 그룹으로 접어서 보여 준다
  const _sizeCur = (v.class_size === '1:1' || !v.class_size) ? (v.class_size || '') : '1:N';
  const sizeOpts = '<option value="">—</option>' +
    sizeOptionsList.map(s => '<option value="' + s.v + '"' + (_sizeCur === s.v ? ' selected' : '') + '>' + (_enrIsEn ? s.en : s.ko) + '</option>').join('');
  // 🧭 (2026-08-12) 요구사항 ③ 배정 우선순위 — 강사를 이름으로 지정하는 대신 «무엇을 먼저 맞출지»만 고른다
  const prioOptionsList = [
    { v: 'schedule', ko: '⏰ 요일·시간 우선', en: '⏰ Day·time first' },
    { v: 'teacher',  ko: '👨‍🏫 강사 우선',     en: '👨‍🏫 Teacher first' }
  ];
  const _prioCur = (v.assign_priority === 'teacher') ? 'teacher' : 'schedule';
  const prioOpts = prioOptionsList.map(p =>
    '<option value="' + p.v + '"' + (_prioCur === p.v ? ' selected' : '') + '>' + (_enrIsEn ? p.en : p.ko) + '</option>').join('');
  // 🧑‍🏫 (2026-08-14 피드백 ③) «강사 우선» 을 골라도 강사 목록이 나오지 않았다.
  //   고를 수는 있는데 «누구를» 바라는지 적을 곳이 없어서, 운영자 눈에는 눌러도 아무 일도
  //   일어나지 않는 칸으로 보였다. 그래서 고른 순간 목록이 펼쳐지도록 칸을 하나 더 둔다.
  //   ⚠️ 이건 «지명» 이 아니라 «희망» 이다 — 실제로 그 시간에 비는지는 「▸ 처리」 가 보고 정한다.
  //      (admin.html ③ 설명의 «이름으로 고르는 칸은 두지 않는다» 는 지명 금지의 뜻이고,
  //       희망 강사는 서버가 이미 teacher_name 으로 받고 있어 새 컬럼도 필요 없다.)
  //   ⚠️ 목록은 teacher_profiles 를 쓴다 — 서버 자동배정이 보는 것과 «같은 표» 여야
  //      화면에서 고른 이름이 배정 로직과 어긋나지 않는다(_ltLoadTeachers 와 같은 출처).
  const teacherSel =
    '<select class="en-row-teacher" title="' +
      (_enrIsEn ? 'Preferred teacher — the actual match is decided at the ▸ Process step'
                : '희망 강사 — 실제 배정은 「▸ 처리」 단계에서 확정됩니다') + '" ' +
      'style="width:100%;margin-top:4px;padding:4px 6px;border:1px solid #ddd6fe;border-radius:4px;' +
      'font-size:12px;background:#faf5ff' + (_prioCur === 'teacher' ? '' : ';display:none') + '">' +
      '<option value="">' + (_enrIsEn ? '⏳ loading teachers…' : '⏳ 강사 목록 불러오는 중…') + '</option></select>';
  // 🗓️ (2026-08-14 피드백 ④) ⑥ 수업 기간 — 몇 개월 할지 고르는 칸이 아예 없었다.
  //   기본값을 미리 박아 두지 않는다. 실제 학생 등록이라 «안 고른 채로 지나가는» 것보다
  //   «고르라고 막는» 쪽이 안전하다(아래 addEnrollment 가 빈 값이면 등록을 멈춘다).
  //   🗓️ (2026-08-20 사장님 지시) 1·3·6·12 만 있던 것을 **1~12 전부** 로 넓혔다.
  //     그 네 개는 «수강권 패키지» 감각으로 고른 값이라 2·4·5개월짜리를 넣을 방법이 없었다.
  //     종료일 계산(`_enAddMonths`)과 표시(`_enDurLabel`)는 원래 아무 숫자나 받으므로 여기만 넓히면 된다.
  //   ⚠️ 서버 `api-admin.ts` 의 duration_months 허용 목록과 **짝**이다 — 한쪽만 넓히면
  //     서버가 모르는 값이라며 **에러 없이 null** 로 지운다(「골랐는데 기간이 비어 있다」).
  const durOptionsList = [];
  for (let _dm = 1; _dm <= 12; _dm++) {
    durOptionsList.push({ v: String(_dm), ko: _dm + '개월', en: _dm + (_dm === 1 ? ' month' : ' months') });
  }
  durOptionsList.push({ v: 'unlimited', ko: '♾️ 무기한', en: '♾️ Unlimited' });
  const _durCur = String(v.duration_months || '');
  const durOpts = '<option value="">' + (_enrIsEn ? '— select —' : '— 선택 —') + '</option>' +
    durOptionsList.map(d => '<option value="' + d.v + '"' + (_durCur === d.v ? ' selected' : '') + '>' +
      (_enrIsEn ? d.en : d.ko) + '</option>').join('');
  // 수업 유형 — 3 체크박스 (레벨/체험/정규)
  const _typeLbl = _enrIsEn ? { level:'Level', trial:'Trial', regular:'Regular' } : { level:'레벨', trial:'체험', regular:'정규' };
  const typeChecks =
    '<label style="font-size:11px;margin-right:6px;cursor:pointer"><input type="checkbox" class="en-row-type" value="level"' + (types.includes('level')?' checked':'') + ' style="margin-right:2px;vertical-align:middle"/>'+_typeLbl.level+'</label>' +
    '<label style="font-size:11px;margin-right:6px;cursor:pointer"><input type="checkbox" class="en-row-type" value="trial"' + (types.includes('trial')?' checked':'') + ' style="margin-right:2px;vertical-align:middle"/>'+_typeLbl.trial+'</label>' +
    '<label style="font-size:11px;cursor:pointer"><input type="checkbox" class="en-row-type" value="regular"' + (types.includes('regular')?' checked':'') + ' style="margin-right:2px;vertical-align:middle"/>'+_typeLbl.regular+'</label>';
  // 요일 — 7 체크박스 (월화수목금토일)
  //   🧑‍🏫 (2026-08-20) 체크박스가 요일 글자 «옆» 이 아니라 «위» 에 오도록 — 칸마다 세로로 쌓는다
  const dayCodes = ['mon','tue','wed','thu','fri','sat','sun'];
  const dayLabels = _enrIsEn ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['월','화','수','목','금','토','일'];
  const dayChecks = '<div style="display:flex;gap:5px">' + dayCodes.map((c, i) =>
    '<label style="display:inline-flex;flex-direction:column;align-items:center;font-size:11px;cursor:pointer"><input type="checkbox" class="en-row-day" value="' + c + '"' + (days.includes(c)?' checked':'') + ' style="margin:0 0 1px"/>' + dayLabels[i] + '</label>'
  ).join('') + '</div>';

  // ⛔ 이름·패키지·수강료는 «사람이 치는 칸»을 없앴다(요구사항). 값 자체는 hidden 으로 남는다 —
  //    · 이름: 아래 _enLookupStudent 가 학생 아이디로 명부에서 찾아 넣는다
  //    · 패키지: 비면 _readEnrollmentRows 가 레벨 구분(정규/체험/레벨)으로 채운다
  //    둘 다 서버 POST /api/admin/enrollments 의 «필수값» 이고, 등록 후 자동으로 나가는
  //    카톡·CSV·워드 요약이 이 값을 그대로 읽는다. 칸만 없앤 것이지 값을 없앤 게 아니다.
  const hiddenCarry =
    '<input type="hidden" class="en-row-name" value="' + _esc(v.name) + '" />' +
    '<input type="hidden" class="en-row-package" value="' + _esc(v.package) + '" />' +
    '<input type="hidden" class="en-row-fee" value="' + _esc(v.fee) + '" />';

  tr.innerHTML =
    '<td class="en-c en-c-num" style="padding:4px 6px;border:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:11px">' + idx + '</td>' +
    '<td class="en-c en-c-uid" data-label="' + (_enrIsEn ? 'Student ID' : '학생 아이디') + '" style="padding:4px 6px;border:1px solid #e5e7eb">' + hiddenCarry +
      '<input class="en-row-uid" placeholder="user001" value="' + _esc(v.uid) + '" ' +
        'title="' + (_enrIsEn ? 'Student login ID — the name is looked up from the roster' : '학생 로그인 아이디 — 이름은 학생 명부에서 자동으로 찾습니다') + '" ' +
        'style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px" />' +
      '<div class="en-row-who" style="font-size:10.5px;color:#9ca3af;margin-top:2px;min-height:13px">' +
        (v.name ? '👤 ' + _esc(v.name) : '') + '</div></td>' +
    '<td class="en-c en-c-type" data-label="' + (_enrIsEn ? 'Type' : '레벨 구분') + '" style="padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap">' + typeChecks + '</td>' +
    /* 👨‍🏫 (2026-08-13 수정요청 #03) 「강사 우선」을 고르면 «누구인지» 를 여기서 바로 고른다.
       ⚠️ 표에 열을 새로 만들지 않는다 — ③ 배정 우선순위 칸 «안» 에 딸린 칸으로 둔다.
          열을 늘리면 2026-08-12 에 정리한 «등록 때 사람이 고르는 것은 5가지» 가 다시 무너진다.
       ⚠️ 얼굴 사진은 넣지 않는다(요구사항 2). datalist 라 타이핑하면 좁혀지고(요구사항 3),
          목록은 강사 명부(GET /api/admin/teachers, active=1)를 그대로 쓴다.
       ⚠️ 「시간 우선」이면 감추고 **값도 비운다**(요구사항 4) — 안 비우면 숨은 값이 저장된다. */
    '<td class="en-c en-c-prio" data-label="' + (_enrIsEn ? 'Matching priority' : '배정 우선순위') + '" style="padding:4px 6px;border:1px solid #e5e7eb">' +
      '<select class="en-row-priority" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px">' + prioOpts + '</select>' +
      teacherSel +
      '<div class="en-row-prio-note" style="font-size:10.5px;color:#9ca3af;margin-top:2px"></div></td>' +
    '<td class="en-c en-c-day" data-label="' + (_enrIsEn ? 'Days' : '요일') + '" style="padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap">' + dayChecks + '</td>' +
    '<td class="en-c en-c-time" data-label="' + (_enrIsEn ? 'Time' : '시간') + '" style="padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap">' +
      /* 🕐 (2026-08-21 사장님 지시) ⏰ 를 «입력칸 안쪽 오른쪽 끝» 에 넣는다.
         밖에 나란히 두면 칸 가운데에 툭 튀어나와 보인다 — 자리는 padding-right 로 비우고
         버튼은 CSS 로 그 자리에 얹는다(`.en-time-wrap`). 값·동작은 그대로다. */
      '<div class="en-time-wrap">' +
      '<input class="en-row-time" type="text" placeholder="'+(_enrIsEn?'10:30 or Mon 7:30, Wed 8:00':'10:30 또는 월7:30,수8:00')+'" value="' + _esc(v.time) + '" ' +
        'title="'+(_enrIsEn?'Single time (e.g. 10:30) or per-day time (e.g. Mon 7:30, Wed 8:00)':'단일 시간(예: 10:30) 또는 요일별 시간(예: 월 7:30, 수 8:00)')+'" ' +
        'style="width:100%;padding:4px 32px 4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px" />' +
      '<button type="button" class="en-row-time-builder" title="요일별 시간 다르게 설정" ' +
        'style="width:24px;height:24px;padding:0;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;cursor:pointer;font-size:12px">⏰</button>' +
      '</div>' +
    '</td>' +
    '<td class="en-c en-c-classmin" data-label="' + (_enrIsEn ? 'Class length' : '수업 시간') + '" style="padding:4px 6px;border:1px solid #e5e7eb">' +
      '<select class="en-row-classmin" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px">' + classMinOpts + '</select></td>' +
    '<td class="en-c en-c-size" data-label="' + (_enrIsEn ? '1:1 or group' : '수업 형태') + '" style="padding:4px 6px;border:1px solid #e5e7eb"><select class="en-row-size" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px">' + sizeOpts + '</select></td>' +
    /* 🗓️ (2026-08-20 사장님 지시) 시작일을 «굴려서» 고른다 — 년·월·일 드럼(`_enOpenDateWheel`).
       ⚠️ 날짜칸(`.en-row-start`) 자체는 그대로 둔다. 값을 읽는 곳이 `.value`(YYYY-MM-DD)를 기대하고,
          이미 날짜를 아는 사람은 타이핑이 훨씬 빠르다. 휠은 그 칸에 값을 «써 넣는» 보조 도구다. */
    '<td class="en-c en-c-start" data-label="' + (_enrIsEn ? 'Start date' : '시작일') + '" style="padding:4px 6px;border:1px solid #e5e7eb">' +
      '<div class="en-start-wrap">' +
        '<input class="en-row-start" type="date" value="' + (v.start||'') + '" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px" />' +
        '<div class="en-start-drum" aria-label="' + (_enrIsEn ? 'Scroll to pick the date' : '굴려서 날짜 고르기') + '"></div>' +
        '<div class="en-start-quick">' +
          '<button type="button" class="en-q" data-q="today">'  + (_enrIsEn ? 'Today'      : '오늘')      + '</button>' +
          '<button type="button" class="en-q" data-q="tomo">'   + (_enrIsEn ? 'Tomorrow'   : '내일')      + '</button>' +
          '<button type="button" class="en-q" data-q="nextmon">'+ (_enrIsEn ? 'Next Mon'   : '다음주 월') + '</button>' +
          '<button type="button" class="en-q" data-q="next1">'  + (_enrIsEn ? 'Next 1st'   : '다음달 1일')+ '</button>' +
        '</div>' +
      '</div></td>' +
    '<td class="en-c en-c-dur" data-label="' + (_enrIsEn ? 'Class period' : '수업 기간') + '" style="padding:4px 6px;border:1px solid #e5e7eb">' +
      '<select class="en-row-duration" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px">' + durOpts + '</select>' +
      '<div class="en-row-dur-note" style="font-size:10.5px;color:#9ca3af;margin-top:2px"></div></td>' +
    /* 📞 (2026-09-10 사장님 지시) 학부모 연락처 — «수업 30분 전 안내문자» 가 갈 번호.
       [왜 칸이 생겼나] 리마인더는 살아 있는데(최근 7일 671건 감지) 문자가 0건이었다.
         학생 명부의 번호 칸이 29,485행 전부 비어 있고, 카페24 원본에 번호가 없기 때문이다.
       ⚠️ 필수가 아니다 — 비워도 등록은 그대로 된다(모르는 번호를 지어내는 것이 더 나쁘다).
       ⚠️ 서버는 이 값을 `student_erp_override` 에 적는다. 학생 명부에 적으면 카페24 동기화가
          매일 밤 덮어써서 하룻밤이면 사라진다(체험계정 3개가 실제로 그렇게 잃었다). */
    '<td class="en-c en-c-phone" data-label="' + (_enrIsEn ? 'Guardian phone' : '학부모 연락처') + '" style="padding:4px 6px;border:1px solid #e5e7eb">' +
      '<input class="en-row-phone" type="tel" inputmode="numeric" autocomplete="off" ' +
        'placeholder="' + (_enrIsEn ? '010-0000-0000 (optional)' : '010-0000-0000 (선택)') + '" value="' + _esc(v.parent_phone || v.phone || '') + '" ' +
        'title="' + (_enrIsEn ? 'Where the 30-minutes-before class reminder is sent. Optional.' : '수업 30분 전 안내문자가 갈 번호입니다. 비워 두어도 등록됩니다.') + '" ' +
        'style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px" />' +
      '<div class="en-row-phone-note" style="font-size:10.5px;color:#9ca3af;margin-top:2px;min-height:13px"></div></td>' +
    '<td class="en-c en-c-del" style="padding:4px 6px;border:1px solid #e5e7eb;text-align:center"><button type="button" class="en-row-del" title="이 행 삭제" style="background:transparent;border:0;color:#ef4444;font-size:14px;cursor:pointer;padding:0 6px">✕</button></td>';
  tbody.appendChild(tr);
  // 행 삭제 — 마지막 1행은 항상 유지
  tr.querySelector('.en-row-del').addEventListener('click', () => {
    if (tbody.children.length <= 1) {
      // ⚠️ 선택자를 type 으로 잡으면 안 된다 — 학생 아이디 칸은 `type` 속성이 아예 없어서
      //    옛 `input[type="text"]` 규칙에 걸리지 않았고, ✕ 를 눌러도 값이 남아 있었다.
      //    hidden(이름·패키지·수강료)까지 비워야 «지웠는데 옛 학생으로 등록되는» 사고가 없다.
      tr.querySelectorAll('input').forEach(inp => {
        if (inp.type === 'checkbox') inp.checked = false; else inp.value = '';
      });
      const who = tr.querySelector('.en-row-who'); if (who) who.textContent = '';
      tr.dataset.enUidDone = '';
      const size = tr.querySelector('.en-row-size'); if (size) size.value = '';
      const classMin = tr.querySelector('.en-row-classmin'); if (classMin) classMin.value = '20';
      const prio = tr.querySelector('.en-row-priority'); if (prio) prio.value = 'schedule';
      const dur = tr.querySelector('.en-row-duration'); if (dur) dur.value = '';
      const tsel = tr.querySelector('.en-row-teacher'); if (tsel) tsel.value = '';
      _enPrioNote(tr);
      _enDurNote(tr);
    } else {
      tr.remove();
      _renumberEnrollmentRows();
    }
  });
  // 🥭 Phase 32 — ⏰ 버튼 클릭 시 요일별 시간 빌더 모달 오픈
  //   (2026-08-25) 강사 우선 배정일 때는 그 강사의 예약된 시간을 서버에 물어보고 나서 여는데,
  //   그 잠깐 사이 버튼이 «눌러도 반응 없음» 으로 보이지 않게 짧게 로딩 표시를 한다.
  tr.querySelector('.en-row-time-builder').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = '…';
    try { await _openTimeBuilder(tr); } finally { btn.disabled = false; btn.textContent = orig; }
  });
  // 🧭 (2026-08-12) ③ 우선순위 — 고른 값이 «다음 단계에서 무슨 뜻인지» 한 줄로 알려 준다
  tr.querySelector('.en-row-priority').addEventListener('change', () => _enPrioNote(tr));
  _enPrioNote(tr);
  // 🗓️ (2026-08-14) ⑥ 기간 — 고른 기간이 언제 끝나는지 시작일과 묶어 한 줄로 보여 준다
  tr.querySelector('.en-row-duration').addEventListener('change', () => _enDurNote(tr));
  tr.querySelector('.en-row-start').addEventListener('change', () => _enDurNote(tr));
  /* 🗓️ (2026-08-21) 시작일 — 「누르면 달력」 + 자주 쓰는 날짜 버튼.
     ⚠️ 직접 만든 년·월·일 드럼을 뺐다. 팝오버가 표(`overflow:hidden`) 밖으로 못 나가
        «눌리는데 안 보이는» 상태였고(2026-08-21 실측: 팝오버 bottom 16945 > 표 bottom 16783),
        무엇보다 브라우저 기본 달력이 이미 «미래 날짜를 눌러서 고르는» 일을 한다.
     ⚠️ showPicker() 는 Chrome/Edge 만 있고 «사용자 조작 없이» 부르면 예외를 던진다 → 클릭 안에서, try 로 감싼다. */
  const _startInp = tr.querySelector('.en-row-start');
  if (_startInp) {
    /* PC 에서만 «칸을 누르면 달력» — 휴대폰은 아래 드럼이 주인공이라 OS 창까지 겹쳐 뜨면 방해가 된다 */
    _startInp.addEventListener('click', () => {
      if (!_enIsWideScreen()) return;
      try { if (typeof _startInp.showPicker === 'function') _startInp.showPicker(); } catch (e) { /* 기본 동작에 맡긴다 */ }
    });
  }
  /* 📱 휴대폰 — 년·월·일 드럼을 «칸 안에 그대로» 편다(사장님 지시 2026-08-21).
     ⚠️ 팝오버로 띄우면 안 된다: 표가 overflow:hidden 이라 밖으로 나간 부분이 통째로 잘린다
        (실측 2026-08-21 — 팝오버 bottom 16945 > 표 bottom 16783 이라 «눌리는데 안 보이는» 상태였다).
        칸 안에 있으면 칸이 늘어나므로 잘릴 일이 없다.
     ⚠️ 폭에 상관없이 만들어 두고 «보이기» 만 CSS 로 가른다 — 화면을 돌리거나 창을 줄여도 그대로 산다. */
  const _drumHost = tr.querySelector('.en-start-drum');
  if (_drumHost && _startInp) _enBuildDateWheel(_drumHost, _startInp);
  tr.querySelectorAll('.en-q').forEach((qb) => {
    qb.addEventListener('click', () => {
      const iso = _enQuickDate(qb.dataset.q);
      if (!iso || !_startInp) return;
      _startInp.value = iso;
      _startInp.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  _enDurNote(tr);
  // 🧑‍🏫 (2026-08-14) ③ 이 «강사 우선» 일 때만 강사 목록을 편다. 목록은 한 번만 받아 캐시한다.
  _enLoadTeachers();
  // 👤 학생 아이디 → 이름 자동 조회. 이름 칸을 없앤 대신, 아이디가 «누구»인지 눈으로 확인시킨다.
  //    조회 결과는 hidden .en-row-name 에 넣는다(서버 student_name 필수값 + CSV 내보내기용).
  tr.querySelector('.en-row-uid').addEventListener('change', () => _enLookupStudent(tr));
  tr.querySelector('.en-row-uid').addEventListener('blur',   () => _enLookupStudent(tr));
  if (prefill === undefined) {
    setTimeout(() => { const inp = tr.querySelector('.en-row-uid'); if (inp) inp.focus(); }, 0);
  }
}

/* ③ 우선순위 안내문 — 「강사 우선」이 곧 «이름 지정» 이 아니라는 것을 여기서 못박아 둔다.
   (2026-08-14) 「강사 우선」을 고르면 그 자리에서 강사 목록도 함께 펼친다. */
function _enPrioNote(tr) {
  const box = tr.querySelector('.en-row-prio-note');
  if (!box) return;
  const en = (document.documentElement.lang === 'en' || window.adminLang === 'en');
  const val = (tr.querySelector('.en-row-priority')?.value || 'schedule');
  const tsel = tr.querySelector('.en-row-teacher');
  if (tsel) {
    tsel.style.display = (val === 'teacher') ? '' : 'none';
    // 「요일·시간 우선」으로 되돌리면 희망 강사도 같이 비운다 —
    // 안 보이는 칸에 남은 값이 조용히 등록되는 사고를 막는다.
    if (val !== 'teacher') tsel.value = '';
    else _enLoadTeachers();
  }
  box.textContent = val === 'teacher'
    ? (en ? 'Teacher first — pick a name, or leave blank to auto-assign' : '강사 먼저 · 이름을 고르거나, 비우면 자동 배정')
    : (en ? 'This day·time first' : '적어 준 요일·시간 먼저');
}

/* ⑥ 수업 기간 안내문 — 고른 기간이 시작일 기준으로 «언제 끝나는지» 를 그 자리에서 보여 준다.
   (2026-08-14 피드백 ④) 몇 개월인지만 고르고 끝나는 날을 모르면 결제·연장 안내가 어긋난다. */
function _enDurNote(tr) {
  const box = tr.querySelector('.en-row-dur-note');
  if (!box) return;
  const en = (document.documentElement.lang === 'en' || window.adminLang === 'en');
  const dur = (tr.querySelector('.en-row-duration')?.value || '');
  const start = (tr.querySelector('.en-row-start')?.value || '');
  if (!dur) { box.textContent = en ? 'Required' : '필수 선택'; box.style.color = '#b45309'; return; }
  box.style.color = '#9ca3af';
  if (dur === 'unlimited') { box.textContent = en ? 'No end date' : '종료일 없음'; return; }
  if (!start) { box.textContent = en ? 'Pick a start date to see the end' : '시작일을 넣으면 종료일이 보입니다'; return; }
  const end = _enAddMonths(start, parseInt(dur, 10));
  box.textContent = end ? ('~ ' + end) : '';
}

/* 시작일 + N개월 = 종료일(YYYY-MM-DD).
   ⚠️ Date 에 setMonth 만 쓰면 1/31 + 1개월이 3/2·3/3 으로 «넘어간다». 말일은 그 달 말일로 눌러 준다. */
function _enAddMonths(startISO, months) {
  if (!startISO || !months || isNaN(months)) return '';
  const p = String(startISO).split('-');
  if (p.length !== 3) return '';
  const y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
  if (!y || !m || !d) return '';
  const total = (m - 1) + months;
  const ny = y + Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return ny + '-' + String(nm).padStart(2, '0') + '-' + String(nd).padStart(2, '0');
}

/* 📱 (2026-08-21 사장님 지시) 시작일 드럼 — 년·월·일을 굴려서 고른다. 휴대폰에서만 보인다.
   ⚠️ 스크롤은 브라우저 것(scroll-snap)을 그대로 쓴다. 직접 만든 드래그 계산을 두면 휠·터치·키보드를
      각각 처리해야 하고, 셋이 어긋나는 순간 «안 멈추는 드럼» 이 된다.
   ⚠️ 칸 높이(EN_WHEEL_ITEM)는 CSS `.en-start-drum .enw-col li` 와 반드시 같아야 한다 —
      어긋나면 스크롤 위치로 값을 되읽을 때 한 칸씩 밀린다.
   ⛔ 여는 순간에 값을 쓰지 않는다 — 「기본값을 몰래 넣지 않는다」. 굴렸을 때만 날짜칸에 들어간다. */
const EN_WHEEL_ITEM = 28;

function _enIsWideScreen() {
  try { return window.matchMedia('(min-width: 1024px)').matches; } catch (e) { return true; }
}

/* ⚠️ 숨어 있는 동안에는 만들지 않는다. 행은 «카드가 닫힌 채로» 만들어지는데(페이지 로드 시 1행 자동 추가),
      숨은 요소는 스크롤이 안 먹어서 세 칸이 전부 맨 위에 머문다 → 열어 보면 2025-01-01 을 가리키고,
      그 상태에서 한 칸만 굴려도 엉뚱한 해가 들어간다(2026-08-21 실측으로 확인).
   ✅ 그래서 «화면에 들어올 때» 만든다. ResizeObserver 로 뒤늦게 자리를 맞추는 방법도 해 봤지만
      제때 맞지 않았다 — 아예 보일 때 만드는 쪽이 어긋날 여지가 없다. */
function _enBuildDateWheel(host, input) {
  if (!host || !input || host.dataset.enDrumReady) return;
  const build = () => _enBuildDateWheelNow(host, input);
  if (typeof IntersectionObserver !== 'function') { build(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); build(); }
  });
  io.observe(host);
  /* 관찰이 안 먹는 경우(스크롤 없이 바로 만지는 등)를 위한 안전망 */
  ['pointerdown', 'focusin'].forEach((ev) => {
    host.addEventListener(ev, () => { io.disconnect(); build(); }, { once: true });
  });
}

function _enBuildDateWheelNow(host, input) {
  if (!host || !input || host.dataset.enDrumReady === '1') return;
  host.dataset.enDrumReady = '1';
  const en = (document.documentElement.lang === 'en' || window.adminLang === 'en');
  const now = new Date();
  const state = { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  const seed = _enParseISO(input.value);
  if (seed) { state.y = seed.y; state.m = seed.m; state.d = seed.d; }

  host.innerHTML =
    '<div class="enw-heads"><span>' + (en ? 'Year' : '년') + '</span><span>' + (en ? 'Mon' : '월') +
      '</span><span>' + (en ? 'Day' : '일') + '</span></div>' +
    '<div class="enw-drum">' +
      '<div class="enw-band" aria-hidden="true"></div>' +
      '<div class="enw-col enw-y" tabindex="0" role="listbox" aria-label="' + (en ? 'Year' : '연도') + '"><ul></ul></div>' +
      '<div class="enw-col enw-m" tabindex="0" role="listbox" aria-label="' + (en ? 'Month' : '월') + '"><ul></ul></div>' +
      '<div class="enw-col enw-d" tabindex="0" role="listbox" aria-label="' + (en ? 'Day' : '일') + '"><ul></ul></div>' +
    '</div>';

  const colY = host.querySelector('.enw-y'), colM = host.querySelector('.enw-m'), colD = host.querySelector('.enw-d');
  const years = []; for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 3; y++) years.push(y);
  const months = []; for (let m = 1; m <= 12; m++) months.push(m);

  function fill(col, values, pad2) {
    const ul = col.querySelector('ul');
    ul.textContent = '';
    values.forEach((v) => {
      const li = document.createElement('li');
      li.textContent = pad2 ? String(v).padStart(2, '0') : String(v);
      ul.appendChild(li);
    });
    col._values = values;
  }
  function idxOf(col) {
    return Math.max(0, Math.min(col._values.length - 1, Math.round(col.scrollTop / EN_WHEEL_ITEM)));
  }
  function paint(col) {
    const i = idxOf(col);
    const lis = col.querySelectorAll('li');
    for (let k = 0; k < lis.length; k++) lis[k].classList.toggle('on', k === i);
  }
  function go(col, i, smooth) {
    col.scrollTo({ top: Math.max(0, i) * EN_WHEEL_ITEM, behavior: smooth ? 'smooth' : 'auto' });
    paint(col);
  }
  function rebuildDays() {
    const max = new Date(state.y, state.m, 0).getDate();
    if (!colD._values || colD._values.length !== max) {
      const vals = []; for (let i = 1; i <= max; i++) vals.push(i);
      fill(colD, vals, true);
    }
    state.d = Math.min(state.d, max);
    go(colD, state.d - 1, false);
  }
  function commit() {
    input.value = state.y + '-' + String(state.m).padStart(2, '0') + '-' + String(state.d).padStart(2, '0');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  /* ⛔ «사람이 굴렸을 때만» 값을 쓴다. 자리를 맞추려고 코드가 굴리는 스크롤도 같은 이벤트를 내므로,
        이 표시가 없으면 카드를 열기만 해도 날짜가 저절로 들어간다(「기본값을 몰래 넣지 않는다」). */
  let userTouched = false;
  function wire(col, kind) {
    let t = null;
    ['wheel', 'pointerdown', 'touchstart', 'keydown'].forEach((ev) => {
      col.addEventListener(ev, () => { userTouched = true; }, { passive: true });
    });
    col.addEventListener('scroll', () => {
      paint(col);
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const v = col._values[idxOf(col)];
        if (kind === 'y') { state.y = v; rebuildDays(); }
        else if (kind === 'm') { state.m = v; rebuildDays(); }
        else state.d = v;
        if (userTouched) commit();
      }, 90);
    });
    col.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (li) go(col, Array.prototype.indexOf.call(li.parentNode.children, li), true);
    });
    col.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      go(col, idxOf(col) + (e.key === 'ArrowDown' ? 1 : -1), true);
    });
  }

  fill(colY, years, false);
  fill(colM, months, true);
  rebuildDays();
  go(colY, Math.max(0, years.indexOf(state.y)), false);
  go(colM, state.m - 1, false);
  wire(colY, 'y'); wire(colM, 'm'); wire(colD, 'd');

  /* 날짜칸을 직접 고치거나 «자주 쓰는 날짜» 를 누르면 드럼도 따라간다 */
  input.addEventListener('change', () => {
    const p = _enParseISO(input.value);
    if (!p) return;
    if (p.y === state.y && p.m === state.m && p.d === state.d) return;
    state.y = p.y; state.m = p.m; state.d = p.d;
    go(colY, Math.max(0, years.indexOf(p.y)), false);
    go(colM, p.m - 1, false);
    rebuildDays();
  });
}

function _enParseISO(v) {
  const p = String(v || '').split('-');
  if (p.length !== 3) return null;
  const y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

/* 🗓️ (2026-08-21) 자주 쓰는 시작일 — 「오늘·내일·다음주 월·다음달 1일」.
   실제로 수업이 시작되는 날은 거의 이 넷 중 하나다. 달력을 열지 않고 한 번에 넣는다.
   ⚠️ 로컬 시각 기준이다 — new Date() 를 그대로 쓰면 UTC 로 밀려 «어제» 가 들어간다. */
function _enQuickDate(kind) {
  const d = new Date();
  d.setHours(12, 0, 0, 0); /* 자정 근처 시차 밀림 방지 */
  if (kind === 'tomo') d.setDate(d.getDate() + 1);
  else if (kind === 'nextmon') {
    /* 다음 «월요일». 오늘이 월요일이면 다음 주 월요일(7일 뒤)로 간다 — 「다음주 월」이라고 적어 뒀으므로. */
    const gap = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + gap);
  } else if (kind === 'next1') {
    d.setMonth(d.getMonth() + 1, 1);
  }
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* 🧑‍🏫 (2026-08-14) ③ 「강사 우선」용 강사 목록.
   ⚠️ 출처는 «teachers» 표(/api/admin/teachers, active=1)다. teacher_profiles 가 아니다 —
      확정 파이프라인(enroll-activate.ts)이 enrollments.teacher_name 을
      `SELECT id FROM teachers WHERE name = ? AND active = 1` 로 되찾는다. 다른 표에서 고르면
      이름이 안 맞아 «명부에서 못 찾았습니다» 경고만 남고 배정이 자동으로 되돌아간다.
   ⚠️ 한 번만 받아 캐시한다. 행을 추가할 때마다 부르면 10행에 10번 나간다.
   ⚠️ 비어 있거나 못 받은 경우를 «로딩 중» 인 채로 두지 않는다 — 왜 목록이 없는지 칸에 적는다. */
let __enTeachers = null, __enTeachersLoading = false, __enTeachersErr = '';
async function _enLoadTeachers() {
  if (__enTeachers || __enTeachersLoading) { _enFillTeacherSelects(); return __enTeachers; }
  __enTeachersLoading = true;
  try {
    const r = await fetch('/api/admin/teachers', { cache: 'no-store', credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    if (d && d.ok) {
      // 🕐 (2026-08-25) id 도 함께 남긴다 — ⏰ 시간 빌더가 「이 강사의 이미 예약된 시간」을
      //   걸러 보여주려면 숫자 id 가 필요하다(_enTeacherIdByName 참고). 화면·서버가 주고받는
      //   값은 여전히 이름 그대로(위 주석의 이유) — id 는 이 화면 안에서만 쓰는 보조값이다.
      const seen = Object.create(null);
      __enTeachers = (d.items || d.teachers || [])
        .map(t => ({ id: String((t && t.id) || '').trim(), name: String((t && t.name) || '').trim() }))
        .filter(t => t.name && !seen[t.name] && (seen[t.name] = true))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    } else {
      __enTeachersErr = (d && d.error) || ('HTTP ' + r.status);
    }
  } catch (e) {
    __enTeachersErr = String(e.message || e);
  }
  __enTeachersLoading = false;
  _enFillTeacherSelects();
  return __enTeachers;
}
function _enTeacherIdByName(name) {
  if (!__enTeachers || !name) return '';
  const hit = __enTeachers.find(t => t.name === name);
  return hit ? hit.id : '';
}
function _enFillTeacherSelects() {
  const en = (document.documentElement.lang === 'en' || window.adminLang === 'en');
  document.querySelectorAll('select.en-row-teacher').forEach(sel => {
    const cur = sel.value || '';
    if (__enTeachersLoading) return;                       // 아직 오는 중 — 「불러오는 중」 그대로 둔다
    if (!__enTeachers) {                                   // 못 받았다 — 조용히 빈 목록으로 두지 않는다
      sel.innerHTML = '<option value="">' +
        (en ? '⚠️ Could not load teachers' : '⚠️ 강사 목록을 불러오지 못했습니다') + '</option>';
      sel.title = __enTeachersErr || '';
      return;
    }
    if (!__enTeachers.length) {                            // 활동중 강사가 한 명도 없다
      sel.innerHTML = '<option value="">' +
        (en ? 'No teachers registered' : '등록된 강사가 없습니다') + '</option>';
      return;
    }
    sel.innerHTML = '<option value="">' +
        (en ? '— any teacher —' : '— 강사 무관 (자동 배정) —') + '</option>' +
      __enTeachers.map(t => '<option value="' + _esc(t.name) + '"' + (t.name === cur ? ' selected' : '') + '>' +
        _esc(t.name) + '</option>').join('');
    sel.value = (__enTeachers.some(t => t.name === cur)) ? cur : '';
  });
}
/* 🕐 (2026-08-25) 「강사 우선」에서 특정 강사를 고르면, ⏰ 시간 빌더가 그 강사의 이미 예약된
   시간을 걸러 보여준다 — «다른 학생 화·목 21:10 에 이미 배정돼 있는데도 새 학생을 같은
   시간에 등록할 수 있는 것처럼 진행된다»(2026-08-25 사장님 지적)의 근본 대응.
   ⚠️ 새 API 를 만들지 않는다 — 이 판정을 하는 엔진(busyTimesForTeacher, 겹침 판정 기준까지)은
      이미 학생 셀프결제 화면(enroll-ops.ts 「제보 #1」)에 있고, 공개 API(POST
      /api/pay/enroll/busy-times, /api/pay/* 는 index.ts 에 이미 통째로 위임돼 있어 라우팅
      등록도 필요 없다)로도 이미 나가 있다. 판정을 새로 베끼면 두 화면이 기준을 잊고
      어긋난다(CLAUDE.md 2절 "판정을 세 곳에 복제하지 말 것"과 같은 이유) — 그대로 재사용한다.
   ⚠️ 수업 길이(분)를 이 표는 안 받는다. 서버 기본값과 같은 20분(class-policy.ts
      DEFAULT_CLASS_MINUTES)으로 고정 — 다르면 여기서 "비었다"고 보여준 시간이 실제 배정
      (▸ 처리) 때 다시 막힐 수 있다. */
/* ⚠️ (2026-08-25 trap-check 지적) 캐시를 새로고침 전까지 무기한 두면, 같은 관리자 세션에서
   ① Hannah 화/목 21:10 으로 학생A 를 방금 등록 → ② 바로 이어서 학생B 도 같은 표에서 Hannah
   시간 빌더를 열 때 ②가 ①이전(=아직 안 막힌) 캐시를 보여줄 수 있다. 실제 이중배정으로
   이어지진 않는다 — 「▸ 처리」(enroll-activate.ts)가 확정 시점에 class_schedules 를 다시 조회해
   겹치면 건너뛰고 경고한다. 그래도 "방금 고친 바로 그 안내가 다시 틀리게 보인다"는 신뢰도
   문제라 30초로 짧게 만료시킨다 — 같은 강사를 여러 행에서 연달아 열 때 매번 왕복하는 것도
   막고, 등록 흐름(보통 수십 초 이상 걸림) 안에서는 충분히 새로 물어본다. */
const _enBusyCache = Object.create(null);
const _EN_BUSY_TTL_MS = 30000;
async function _enFetchBusyTimes(teacherId) {
  if (!teacherId) return {};
  const hit = _enBusyCache[teacherId];
  if (hit && (Date.now() - hit.ts) < _EN_BUSY_TTL_MS) return hit.data;
  try {
    const r = await fetch('/api/pay/enroll/busy-times', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacher_id: teacherId, days: [0, 1, 2, 3, 4, 5, 6], minutes: 20 }),
    });
    const d = await r.json().catch(() => ({}));
    const busy = (d && d.ok && d.busy) ? d.busy : {};
    _enBusyCache[teacherId] = { data: busy, ts: Date.now() };
    return busy;
  } catch (e) { return {}; }
}

/* 👤 학생 아이디 → 학생 명부(students_erp)에서 이름 찾기.
   ⚠️ 전용 API 를 새로 만들지 않았다 — 새 경로는 src/index.ts 라우팅+인증게이트에 등록해야 하고
      («새 API 추가» 함정) 이 조회 하나 때문에 금지구역을 건드릴 이유가 없다.
      이미 게이트를 통과하는 /api/admin/students/unified 를 아이디로 좁혀서 쓴다. */
const _enUidCache = Object.create(null);
async function _enLookupStudent(tr) {
  const inp = tr.querySelector('.en-row-uid');
  const who = tr.querySelector('.en-row-who');
  const nameHidden = tr.querySelector('.en-row-name');
  if (!inp || !who) return;
  const uid = (inp.value || '').trim();
  const en = (document.documentElement.lang === 'en' || window.adminLang === 'en');
  // 비우면 «다시 같은 아이디를 쳤을 때 조회가 안 되는» 일이 없도록 기억도 함께 지운다
  if (!uid) { who.textContent = ''; tr.dataset.enUidDone = ''; if (nameHidden) nameHidden.value = ''; return; }
  if (tr.dataset.enUidDone === uid) return;      // 같은 값으로 blur/change 가 두 번 와도 한 번만
  tr.dataset.enUidDone = uid;

  const hit = (name) => {
    if (name) {
      who.style.color = '#059669';
      who.textContent = '👤 ' + name;
      if (nameHidden) nameHidden.value = name;
    } else {
      who.style.color = '#b45309';
      who.textContent = en ? '⚠ not in the student roster' : '⚠ 학생 명부에 없는 아이디';
      // 명부에 없어도 등록 자체는 막지 않는다 — 서버 필수값만 아이디로 채워 둔다
      if (nameHidden) nameHidden.value = uid;
    }
  };
  if (Object.prototype.hasOwnProperty.call(_enUidCache, uid)) { hit(_enUidCache[uid]); return; }

  who.style.color = '#9ca3af';
  who.textContent = en ? 'looking up…' : '조회 중…';
  try {
    const r = await fetch('/api/admin/students/unified?q=' + encodeURIComponent(uid),
                          { credentials: 'include', cache: 'no-store' });
    const d = await r.json();
    const list = (d && d.ok && Array.isArray(d.students)) ? d.students : [];
    const exact = list.find(s => String(s.user_id || '').toLowerCase() === uid.toLowerCase());
    const name = exact ? String(exact.name || exact.user_id || '') : '';
    _enUidCache[uid] = name;
    hit(name);
  } catch (e) {
    who.style.color = '#9ca3af';
    who.textContent = en ? '(lookup failed — will register anyway)' : '(조회 실패 — 등록은 그대로 됩니다)';
    if (nameHidden && !nameHidden.value) nameHidden.value = uid;
  }
}

// "HH:MM" → [hh, mm] 2자리 문자열. 분은 10분 단위로 반올림(00/10/20/30/40/50). 빈 값이면 ['','']
function _tbTimeToParts(t) {
  const m = (t || '').match(/^(\d{1,2})\s*:\s*(\d{1,2})$/);
  if (!m) return ['', ''];
  const hh = String(Math.min(23, parseInt(m[1], 10) || 0)).padStart(2, '0');
  let mm = Math.round((parseInt(m[2], 10) || 0) / 10) * 10;
  if (mm >= 60) mm = 50;
  return [hh, String(mm).padStart(2, '0')];
}
// 🕐 (2026-08-25) busyList — 그 요일에 이미 막힌 'HH:MM' 문자열 배열(예: ['21:10','21:20']).
//   미지정(undefined/빈 배열)이면 예전처럼 아무 것도 막지 않는다(「강사 우선」이 아닐 때).
function _tbHourOptions(selected, busyList) {
  let opts = '<option value="">--</option>';
  const busy = Array.isArray(busyList) ? busyList : [];
  for (let h = 0; h < 24; h++) {
    const v = String(h).padStart(2, '0');
    // 그 시(hour)의 10분 슬롯 6개가 전부 막혀 있으면 시 자체를 고를 이유가 없다
    const allBusy = busy.length > 0 &&
      [0, 10, 20, 30, 40, 50].every(m => busy.indexOf(v + ':' + String(m).padStart(2, '0')) !== -1);
    opts += '<option value="' + v + '"' + (v === selected ? ' selected' : '') + (allBusy ? ' disabled' : '') + '>' +
      v + (allBusy ? ' 🚫' : '') + '</option>';
  }
  return opts;
}
function _tbMinOptions(selected, hour, busyList) {
  let opts = '<option value="">--</option>';
  const busy = Array.isArray(busyList) ? busyList : [];
  [0, 10, 20, 30, 40, 50].forEach(m => {
    const v = String(m).padStart(2, '0');
    const isBusy = !!hour && busy.indexOf(hour + ':' + v) !== -1;
    opts += '<option value="' + v + '"' + (v === selected ? ' selected' : '') + (isBusy ? ' disabled' : '') + '>' +
      v + (isBusy ? ' 🚫' : '') + '</option>';
  });
  return opts;
}
// 🥭 Phase 32 — 요일별 시간 빌더 모달
async function _openTimeBuilder(tr) {
  const dayCodes = ['mon','tue','wed','thu','fri','sat','sun'];
  const dayLabels = ['월','화','수','목','금','토','일'];
  // 현재 행의 요일 체크 상태
  const checkedDays = Array.from(tr.querySelectorAll('.en-row-day:checked')).map(c => c.value);
  // 현재 시간 입력값 파싱
  const currentTime = (tr.querySelector('.en-row-time')?.value || '').trim();
  const parsed = _parseScheduleText(currentTime);
  // 🕐 (2026-08-25) 「강사 우선」 + 특정 강사를 골랐을 때만 그 강사의 예약된 시간을 걸러 보여준다.
  //   「요일·시간 우선」이거나 강사가 「자동 배정」(빈값)이면 예전처럼 전부 선택 가능하다 —
  //   아직 누구에게 배정될지 모르는데 특정 강사 기준으로 막으면 안 된다.
  const prio = tr.querySelector('.en-row-priority')?.value || 'schedule';
  const teacherName = (tr.querySelector('.en-row-teacher')?.value || '').trim();
  const teacherId = (prio === 'teacher' && teacherName) ? _enTeacherIdByName(teacherName) : '';
  const busyByDow = teacherId ? await _enFetchBusyTimes(teacherId) : {};
  const DOW_NUM = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const busyByCode = {};
  dayCodes.forEach((code) => { busyByCode[code] = busyByDow[String(DOW_NUM[code])] || busyByDow[DOW_NUM[code]] || []; });
  // 모달 생성
  const overlay = document.createElement('div');
  overlay.id = 'time-builder-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)';
  let html =
    '<div style="background:#fff;border-radius:14px;padding:22px 26px;width:380px;max-width:90vw;box-shadow:0 24px 60px -10px rgba(0,0,0,0.3)">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">' +
        '<span style="font-size:24px">⏰</span>' +
        '<div>' +
          '<div style="font-weight:700;font-size:15px;color:#1f2937">요일별 시간 설정</div>' +
          '<div style="font-size:11px;color:#6b7280">각 요일에 다른 시간 적용</div>' +
        '</div>' +
      '</div>' +
      '<div style="background:#fef3c7;padding:8px 12px;border-radius:6px;font-size:11px;color:#78350f;margin-bottom:12px">' +
        '💡 시간 비워두면 그 요일은 제외됩니다' +
      '</div>' +
      (teacherId ? '<div style="background:#fee2e2;padding:8px 12px;border-radius:6px;font-size:11px;color:#991b1b;margin-bottom:12px">' +
        '🚫 = ' + _esc(teacherName) + ' 강사가 이미 다른 학생과 배정된 시간(선택 불가)' +
      '</div>' : '') +
      '<div style="display:grid;grid-template-columns:60px 1fr;gap:6px;align-items:center">';
  const selStyle = 'padding:6px 4px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;background:#fff';
  dayCodes.forEach((code, i) => {
    const isChecked = checkedDays.includes(code) || parsed[code];
    const t = parsed[code] || '';
    const [th, tm] = _tbTimeToParts(t);
    const busyList = busyByCode[code];
    html +=
      '<label style="font-weight:700;color:#1f2937;display:flex;align-items:center;gap:6px;cursor:pointer">' +
        '<input type="checkbox" class="tb-day" data-code="' + code + '" ' + (isChecked?'checked':'') + ' style="margin:0;cursor:pointer">' +
        dayLabels[i] +
      '</label>' +
      '<div style="display:flex;align-items:center;gap:4px">' +
        '<select class="tb-hour" data-code="' + code + '" style="' + selStyle + '">' + _tbHourOptions(th, busyList) + '</select>' +
        '<span style="color:#9ca3af">:</span>' +
        '<select class="tb-min" data-code="' + code + '" style="' + selStyle + '">' + _tbMinOptions(tm, th, busyList) + '</select>' +
      '</div>';
  });
  html += '</div>' +
      '<div style="display:flex;gap:8px;margin-top:18px">' +
        '<button id="tb-same-time" type="button" style="flex:1;padding:8px 14px;font-size:12px;background:#fff;border:1px dashed #3b82f6;color:#3b82f6;border-radius:8px;cursor:pointer">📋 모두 같은 시간</button>' +
        '<button id="tb-cancel" type="button" style="flex:1;padding:8px 14px;font-size:13px;background:#e5e7eb;color:#374151;border:0;border-radius:8px;cursor:pointer">취소</button>' +
        '<button id="tb-confirm" type="button" style="flex:1;padding:8px 14px;font-size:13px;background:#10b981;color:#fff;border:0;border-radius:8px;cursor:pointer;font-weight:700">적용</button>' +
      '</div>' +
    '</div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  // 🕐 (2026-08-25) 시(hour)를 바꾸면 그 시간대의 분(10분 단위) 중 막힌 것만 다시 걸러 그린다
  //   — 분 목록은 «어느 시를 골랐는지» 에 따라 달라지므로 처음 그릴 때 한 번만으로는 못 잡는다.
  if (teacherId) {
    dayCodes.forEach((code) => {
      const hSel = overlay.querySelector('.tb-hour[data-code="' + code + '"]');
      const mSel = overlay.querySelector('.tb-min[data-code="' + code + '"]');
      if (!hSel || !mSel) return;
      hSel.addEventListener('change', () => {
        const curMin = mSel.value;
        mSel.innerHTML = _tbMinOptions(curMin, hSel.value, busyByCode[code]);
      });
    });
  }
  const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
  // 모두 같은 시간 — prompt 로 시간 입력 받아 모든 체크된 요일에 적용 (분은 10분 단위로 반올림)
  overlay.querySelector('#tb-same-time').addEventListener('click', () => {
    const t = prompt('모든 체크된 요일에 적용할 시간 (HH:MM):', '10:30');
    if (!t) return;
    const [th, tm] = _tbTimeToParts(t);
    overlay.querySelectorAll('.tb-day:checked').forEach(chk => {
      const code = chk.dataset.code;
      const hSel = overlay.querySelector('.tb-hour[data-code="' + code + '"]');
      const mSel = overlay.querySelector('.tb-min[data-code="' + code + '"]');
      if (hSel) hSel.value = th;
      if (mSel) mSel.value = tm;
    });
  });
  overlay.querySelector('#tb-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  // 적용 — 결과를 행의 요일 체크박스 + 시간 텍스트에 반영
  overlay.querySelector('#tb-confirm').addEventListener('click', () => {
    const dayLabelMap = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금', sat:'토', sun:'일' };
    const result = []; // [{day:'mon', time:'07:30'}, ...]
    overlay.querySelectorAll('.tb-day').forEach(chk => {
      if (!chk.checked) return;
      const code = chk.dataset.code;
      const hSel = overlay.querySelector('.tb-hour[data-code="' + code + '"]');
      const mSel = overlay.querySelector('.tb-min[data-code="' + code + '"]');
      const h = hSel?.value || '';
      const m = mSel?.value || '';
      if (h !== '' && m !== '') result.push({ day: code, time: h + ':' + m });
    });
    // 행의 요일 체크박스 갱신
    tr.querySelectorAll('.en-row-day').forEach(chk => {
      chk.checked = result.some(r => r.day === chk.value);
    });
    // 시간 필드 갱신
    const timeInput = tr.querySelector('.en-row-time');
    if (timeInput) {
      if (result.length === 0) {
        timeInput.value = '';
      } else if (result.length === 1) {
        timeInput.value = result[0].time;
      } else {
        // 모든 시간이 같으면 단일, 다르면 요일별
        const sameTime = result.every(r => r.time === result[0].time);
        if (sameTime) {
          timeInput.value = result[0].time;
        } else {
          timeInput.value = result.map(r => dayLabelMap[r.day] + ' ' + r.time).join(', ');
        }
      }
    }
    close();
  });
}

// 시간 텍스트 파싱 — "10:30" 또는 "월 7:30, 수 8:00" 형식
// 반환: { mon:'07:30', wed:'08:00', _common:'10:30' } 형태
function _parseScheduleText(text) {
  const out = {};
  if (!text) return out;
  const dayMap = { '월':'mon','화':'tue','수':'wed','목':'thu','금':'fri','토':'sat','일':'sun' };
  // 요일별 패턴: "월 7:30" 또는 "월7:30"
  const perDayRe = /([월화수목금토일])\s*(\d{1,2}\s*:\s*\d{2})/g;
  let m, found = false;
  while ((m = perDayRe.exec(text)) !== null) {
    found = true;
    out[dayMap[m[1]]] = m[2].replace(/\s/g, '').padStart(5, '0');
  }
  if (!found) {
    // 단일 시간
    const single = text.match(/(\d{1,2}\s*:\s*\d{2})/);
    if (single) out._common = single[1].replace(/\s/g, '');
  }
  return out;
}

function _renumberEnrollmentRows() {
  const rows = document.querySelectorAll('#en-multi-rows tr');
  rows.forEach((tr, i) => {
    const numCell = tr.querySelector('td:first-child');
    if (numCell) numCell.textContent = (i + 1);
  });
}

function _readEnrollmentRows() {
  const rows = document.querySelectorAll('#en-multi-rows tr');
  const out = [];
  const TYPE_LABELS = { level:'레벨테스트', trial:'체험수업', regular:'정규수업' };
  const DAY_LABELS  = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금', sat:'토', sun:'일' };
  rows.forEach((tr) => {
    const uid = (tr.querySelector('.en-row-uid')?.value || '').trim();
    // 🧑‍🏫 (2026-08-12) 이름 칸은 없앴다 — 아이디로 찾은 이름(hidden)을 쓰고, 못 찾았으면 아이디 그대로.
    //   서버 POST /api/admin/enrollments 가 student_name 을 필수로 받으므로 빈 값이면 안 된다.
    const name = (tr.querySelector('.en-row-name')?.value || '').trim() || uid;
    const pkg = (tr.querySelector('.en-row-package')?.value || '').trim();
    const fee = tr.querySelector('.en-row-fee')?.value || '';
    const start = tr.querySelector('.en-row-start')?.value || '';
    const time = tr.querySelector('.en-row-time')?.value || '';
    const classSize = tr.querySelector('.en-row-size')?.value || '';
    // ⏱ (2026-08-26) 수업 시간(분) — 안 고르거나 이상한 값이면 20분(class-policy.ts DEFAULT_CLASS_MINUTES).
    //   select 옵션이 20/30/40 뿐이라 정상 사용에서는 항상 그중 하나지만, 값 자체를 방어적으로 다시 검사한다.
    const classMinRaw = Number(tr.querySelector('.en-row-classmin')?.value);
    const classMin = [20, 30, 40].includes(classMinRaw) ? classMinRaw : 20;
    const priority = (tr.querySelector('.en-row-priority')?.value || 'schedule');
    // 🧑‍🏫 (2026-08-14) ③ 이 「강사 우선」일 때만 희망 강사를 읽는다 — 그 외에는 값이 있어도 버린다
    const wantTeacher = (priority === 'teacher')
      ? (tr.querySelector('.en-row-teacher')?.value || '').trim() : '';
    const duration = (tr.querySelector('.en-row-duration')?.value || '');
    const types = Array.from(tr.querySelectorAll('.en-row-type:checked')).map(c => c.value);
    const days  = Array.from(tr.querySelectorAll('.en-row-day:checked')).map(c => c.value);
    // 빈 행 건너뜀 (아이디·유형·패키지 모두 비어있으면)
    if (!uid && types.length === 0 && !pkg) return;
    // 사람이 읽을 수 있는 한글 레이블
    const typesKo = types.map(t => TYPE_LABELS[t] || t);
    const daysKo  = days.map(d => DAY_LABELS[d] || d);
    // 분류 — 레벨테스트 만 vs 모두 vs 부분
    let category = '';
    if (types.length === 1 && types[0] === 'level') category = 'test_only';
    else if (types.length === 3) category = 'full';
    else if (types.length > 0) category = types.join('+');
    /* 📞 (2026-09-10) 학부모 연락처 — 숫자만 남기고 9자리 미만은 «없는 것» 으로 본다.
       서버·notify-contacts·student-override 가 전부 같은 규칙이다(한 곳이라도 다르면
       「화면엔 넣었는데 저장이 안 된」 것처럼 보인다). 빈 값이면 안 보낸다 = 예전 그대로. */
    const phoneRaw = (tr.querySelector('.en-row-phone')?.value || '').replace(/[^0-9]/g, '');
    const parentPhone = phoneRaw.length >= 9 ? phoneRaw : '';
    out.push({
      student_name: name,
      student_user_id: uid || null,
      parent_phone: parentPhone || null,
      package: pkg || (typesKo.join('+') || '미정'), // 패키지 비어있으면 유형으로 자동 채움
      monthly_fee_krw: fee ? parseInt(fee, 10) : null,
      started_at: start ? new Date(start).getTime() : null,
      // 🥭 2026-08-08 — DB 컬럼 이름 그대로. 아래 `_` 붙은 것들은 export 용 메타라
      //   서버가 무시했고, 그래서 요일·시간이 한 번도 저장되지 않았다.
      days_of_week: daysKo.join('') || null,
      time: time || null,
      class_size: classSize || null,
      // ⏱ (2026-08-26) 수업 시간(분) — 서버 POST /api/admin/enrollments 가 저장하고,
      //   확정(activate) 단계에서 class_schedules.duration_min 으로 그대로 들어간다.
      duration_min: classMin,
      type: typesKo.join('+') || null,
      // 🧭 (2026-08-12) ③ 배정 우선순위
      assign_priority: priority,
      // 🧑‍🏫 (2026-08-14) ③ 「강사 우선」에서 고른 «희망» 강사. 서버가 이미 받던 컬럼이라 새 칸이 아니다.
      teacher_name: wantTeacher || null,
      // 🗓️ (2026-08-14) ⑥ 수업 기간. 'unlimited' 면 종료일 없음, 숫자면 시작일 + N개월을 끝으로 잡는다.
      duration_months: duration || null,
      end_date: (duration && duration !== 'unlimited' && start)
        ? _enAddMonths(start, parseInt(duration, 10)) : null,
      ended_at: (duration && duration !== 'unlimited' && start)
        ? (new Date(_enAddMonths(start, parseInt(duration, 10))).getTime() || null) : null,
      // 추가 메타 (자동 export·import 시 사용)
      _types: types,
      _types_ko: typesKo,
      _days: days,
      _days_ko: daysKo,
      _time: time,
      _class_size: classSize,
      _started_at_str: start,
      _fee_raw: fee,
      _category: category,
      _duration: duration,
      _want_teacher: wantTeacher
    });
  });
  return out;
}

/* ✅ (2026-08-12) 등록 = 확정. 「등록」 다음에 「확정」을 또 눌러야 하던 두 단계를 하나로 합쳤다.
   등록이 성공하면 그 자리에서 확정 파이프라인(계정 연결 · 강사 배정 · 시간표 생성)을 돌린다.
   ⛔ 바깥으로 나가는 두 가지는 **켜지 않는다** — 학부모 문자(실제 발송)와 결제 예약(돈).
      이건 사람이 매번 직접 켜야 하는 것이라 「▸ 처리」 패널에 그대로 남겨 뒀다.
   막는 조건(강사 없음·명부에 없음 등)이 있으면 확정은 안 되고 pending 으로 남는다 —
   그 경우에만 목록에 「▸ 확정 안 됨」 이 뜬다. 조용히 성공한 척하지 않는다. */
async function _enAutoConfirm(id) {
  try {
    const r = await fetch('/api/admin/enrollments/' + id + '/activate', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'confirmed', dry: false, teacher_id: null,
        steps: { link_student: true, assign_teacher: true, create_schedules: true,
                 create_subscription: false, notify_parent: false }
      })
    });
    const d = await r.json();
    if (!r.ok || !d.ok) return { ok: false, error: (d && d.error) || ('HTTP ' + r.status) };
    // 판정은 서버의 all_ok 를 따른다 — 한 단계라도 실패하면 서버가 상태를 안 올린다
    const failed = (d.steps || []).filter(s => !s.ok);
    return { ok: d.all_ok !== false && failed.length === 0, steps: d.steps || [], failed: failed };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function addEnrollment() {
  const records = _readEnrollmentRows();
  const status = document.getElementById('en-multi-status');
  if (records.length === 0) {
    alert(adminLang==='en' ? 'Add at least one student row' : '최소 1명 이상의 학생 정보를 입력해 주세요.');
    return;
  }
  // 검증 — ① 학생 아이디 + ② 레벨 구분 최소 1개 필수 (2026-08-12: 이름 → 아이디로 바뀜)
  const invalid = records.filter(r => !r.student_user_id || !r._types || r._types.length === 0);
  if (invalid.length > 0) {
    alert((adminLang==='en'
      ? 'Missing required (student ID + at least 1 level type): '
      : '필수 항목 누락 (학생 아이디 + 레벨 구분 최소 1개): ') + invalid.length + '건');
    return;
  }
  // 🗓️ (2026-08-14) ⑥ 수업 기간 미선택 — 기본값을 몰래 넣지 않고 사람에게 돌려준다.
  //   실제 학생 등록이고, 기간은 결제 회차·종료일·연장 안내가 모두 읽는 값이다.
  const noDur = records.filter(r => !r._duration);
  if (noDur.length > 0) {
    alert(adminLang==='en'
      ? 'Please pick ⑥ Class period (1/3/6/12 months or unlimited) — ' + noDur.length + ' row(s) missing.'
      : '⑥ 수업 기간을 선택해 주세요 (1·3·6·12개월 또는 무기한) — ' + noDur.length + '건 미선택');
    const firstEmpty = Array.from(document.querySelectorAll('.en-row-duration')).find(s => !s.value);
    if (firstEmpty) { firstEmpty.focus(); firstEmpty.style.borderColor = '#ef4444'; }
    return;
  }
  // N=1 이면 단일 등록 + Phase 22 자동 export, N>1 이면 일괄 등록
  if (records.length === 1) {
    const r = records[0];
    if (status) status.textContent = '⏳ 등록 중…';
    const d = await _menuPost('/api/admin/enrollments', {
      student_name: r.student_name,
      student_user_id: r.student_user_id,
      // 📞 (2026-09-10) 수업 전 안내문자가 갈 번호. 서버가 student_erp_override 에 적는다.
      parent_phone: r.parent_phone,
      package: r.package,
      monthly_fee_krw: r.monthly_fee_krw,
      started_at: r.started_at,
      days_of_week: r.days_of_week, time: r.time,
      class_size: r.class_size, type: r.type,
      duration_min: r.duration_min,
      assign_priority: r.assign_priority,
      teacher_name: r.teacher_name,
      duration_months: r.duration_months, end_date: r.end_date, ended_at: r.ended_at
    });
    if (d) {
      const enrollmentData = {
        id: d.id || d.enrollment_id || ('enroll_' + Date.now()),
        student_name: r.student_name,
        student_user_id: r.student_user_id || '—',
        package: r.package,
        /* 💰 (2026-08-26) 서버가 «수업 시간 배수를 곱해 저장한» 최종 금액을 쓴다.
           ⛔ 폼에서 읽은 r.monthly_fee_krw 는 곱하기 «전» 기준가(대개 빈 값)라, 그걸 쓰면
              40분 수강신청이 DB·구독에는 20만원인데 카톡·CSV·워드에는 10만원으로 나간다.
              화면이 곱해서 맞추면 안 된다(두 번 곱하기) — 서버가 준 값을 그대로 받아 적는다. */
        monthly_fee_krw: (d.fee && d.fee.monthlyFeeKrw != null) ? d.fee.monthlyFeeKrw : (r.monthly_fee_krw || 0),
        started_at: r._started_at_str || new Date().toISOString().slice(0,10),
        types_ko: (r._types_ko || []).join(', ') || '—',
        days_ko: (r._days_ko || []).join('') || '—',
        time: r._time || '—',
        class_size: r._class_size || '—',
        category: r._category || '',
        // 🗓️ (2026-08-14) ⑥ 기간 — 등록 직후 자동으로 나가는 카톡·CSV·워드 요약도 같이 읽는다
        duration: _enDurLabel(r._duration, adminLang === 'en') || '—',
        end_date: r.end_date || '—',
        created_at: new Date().toISOString().slice(0,19).replace('T', ' ')
      };
      autoExportEnrollment(enrollmentData);
      // ✅ 등록 = 확정. 별도 「확정」 클릭 없이 여기서 바로 이어 돌린다.
      if (status) status.textContent = '⏳ 확정 처리 중…';
      const cf = await _enAutoConfirm(d.id || d.enrollment_id);
      // 행 초기화
      document.getElementById('en-multi-rows').innerHTML = '';
      _addEnrollmentRow();
      if (status) {
        status.textContent = cf.ok
          ? (adminLang==='en' ? '✅ Registered and confirmed' : '✅ 등록·확정 완료 (강사 배정·시간표 생성됨)')
          : (adminLang==='en' ? '⚠️ Registered, but not confirmed — open ▸ why' : '⚠️ 등록은 됐지만 확정이 안 됐습니다 — 목록의 「▸ 확정 안 됨」 을 눌러 이유를 보세요');
        status.style.color = cf.ok ? '#059669' : '#b45309';
        /* 📞 (2026-09-10) 번호 저장이 실패하면 **그 자리에서 말한다.**
           조용히 넘기면 「번호를 넣었으니 수업 전 문자가 가겠지」로 믿게 되는데 실제로는
           안 간다 — 그리고 아무 데도 표시가 없어 영영 모른다(규칙서 2장 그 항목). */
        if (d.phone_saved && d.phone_saved.ok === false) {
          status.textContent += (adminLang==='en'
            ? ' · ⚠️ Phone not saved (' + (d.phone_saved.reason || 'unknown') + ') — reminders will not be sent'
            : ' · ⚠️ 연락처가 저장되지 않았습니다 (' + (d.phone_saved.reason || '사유 불명') + ') — 수업 전 안내문자는 안 나갑니다');
          status.style.color = '#b45309';
        }
      }
      if (!cf.ok && cf.failed && cf.failed.length) {
        console.warn('[enroll] 확정 실패 단계:', cf.failed.map(s => s.step + ': ' + s.detail).join(' / '));
      }
      loadEnrollments();
    } else {
      if (status) { status.textContent = '❌ 등록 실패'; status.style.color = '#b91c1c'; }
    }
    return;
  }

  // N>1 — 일괄 등록 (Phase 23 의 _bulkRegisterEnrollments 와 동일 패턴)
  if (!confirm((adminLang==='en' ? 'Register ' : '') + records.length + (adminLang==='en' ? ' students at once?' : '명 학생을 동시에 등록하시겠습니까?'))) return;
  if (status) status.textContent = '⏳ 일괄 등록 중… (0 / ' + records.length + ')';
  let ok = 0, fail = 0, confirmed = 0; const errs = [], notConfirmed = [], phoneFail = [];
  const successList = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    try {
      const res = await fetch('/api/admin/enrollments', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_name: r.student_name,
          student_user_id: r.student_user_id,
          parent_phone: r.parent_phone,   // 📞 (2026-09-10) 단건 경로와 같은 값 — 한쪽만 보내면 일괄 등록만 번호를 잃는다
          package: r.package,
          monthly_fee_krw: r.monthly_fee_krw,
          started_at: r.started_at,
          days_of_week: r.days_of_week, time: r.time,
          class_size: r.class_size, type: r.type,
          duration_min: r.duration_min,
          assign_priority: r.assign_priority,
          teacher_name: r.teacher_name,
          duration_months: r.duration_months, end_date: r.end_date, ended_at: r.ended_at
        })
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok !== false) {
        ok++;
        /* 📞 (2026-09-10) 번호 저장 실패는 «등록 실패» 가 아니라 조용히 지나간다 —
           그래서 여기서 따로 세어 아래 요약이 말하게 한다(안 세면 아무도 모른다). */
        if (j.phone_saved && j.phone_saved.ok === false) phoneFail.push(r.student_user_id + ': ' + (j.phone_saved.reason || '사유 불명'));
        /* 💰 (2026-08-26) 일괄 등록의 내보내기도 «서버가 저장한 최종 금액» 을 쓴다
           (위 단건 경로와 같은 이유 — 폼 값은 곱하기 «전» 기준가라 문서만 절반이 된다). */
        successList.push((j.fee && j.fee.monthlyFeeKrw != null)
          ? Object.assign({}, r, { monthly_fee_krw: j.fee.monthlyFeeKrw }) : r);
        // ✅ 등록 = 확정. 한 건씩 바로 이어 돌린다(별도 확정 클릭 없음).
        const cf = await _enAutoConfirm(j.id || j.enrollment_id);
        if (cf.ok) confirmed++;
        else notConfirmed.push(r.student_user_id + ': ' +
          (cf.error || (cf.failed || []).map(s => s.detail).join(' / ') || '확정 보류'));
      } else {
        fail++;
        errs.push(r.student_name + ': ' + (j.error || ('HTTP ' + res.status)));
      }
    } catch (e) {
      fail++; errs.push(r.student_name + ': ' + (e.message || e));
    }
    if (status) status.textContent = '⏳ 등록·확정 중… (' + (i+1) + ' / ' + records.length + ')';
  }
  if (status) {
    status.textContent = '✅ 등록 ' + ok + '명 · 확정 ' + confirmed + '명' +
      (notConfirmed.length ? ' · ⚠️ 확정 보류 ' + notConfirmed.length + '명' : '') +
      (phoneFail.length ? ' · ⚠️ 연락처 저장 실패 ' + phoneFail.length + '명' : '') +
      (fail ? ' · ❌ 실패 ' + fail + '명' : '');
    status.style.color = (fail || notConfirmed.length || phoneFail.length) ? '#b45309' : '#059669';
  }
  if (phoneFail.length) {
    alert('⚠️ 연락처가 저장되지 않은 건 (수업 전 안내문자가 안 나갑니다):\n\n' + phoneFail.join('\n'));
  }
  if (notConfirmed.length) {
    alert('⚠️ 등록은 됐지만 확정이 보류된 건:\n\n' + notConfirmed.join('\n') +
          '\n\n목록에서 「▸ 확정 안 됨」 을 눌러 이유를 보고 고쳐 주세요.');
  }
  // N>1 자동화 — 통합 알림 + 통합 CSV/Word
  if (ok > 0) {
    autoExportBulkEnrollment(successList);
  }
  if (errs.length > 0) {
    alert('⚠️ 실패 상세:\n\n' + errs.join('\n'));
  }
  // 행 초기화
  document.getElementById('en-multi-rows').innerHTML = '';
  _addEnrollmentRow();
  loadEnrollments();
}

// 다중 등록 자동 export — 통합 카톡 + 통합 CSV + 통합 Word
function autoExportBulkEnrollment(records) {
  const dateStr = new Date().toISOString().slice(0,10);
  const N = records.length;

  // 통합 카톡 메시지 — 구분(테스트만/풀)별 분류 통계 포함
  const testOnly = records.filter(r => r._category === 'test_only').length;
  const fullPkg  = records.filter(r => r._category === 'full').length;
  const partial  = N - testOnly - fullPkg;
  let kakaoText = '📚 [망고아이] 수강신청 일괄 등록 — ' + N + '명\n' +
    '🔍 레벨테스트만 ' + testOnly + '명 · 🌟 풀패키지 ' + fullPkg + '명' +
    (partial > 0 ? ' · 📌 부분 ' + partial + '명' : '') + '\n' +
    '━━━━━━━━━━━━━━━\n';
  records.forEach((r, i) => {
    const tag = r._category === 'test_only' ? '🔍' : r._category === 'full' ? '🌟' : '📌';
    kakaoText += (i+1) + '. ' + tag + ' ' + r.student_name +
      (r.student_user_id ? ' (' + r.student_user_id + ')' : '') + '\n' +
      '   유형: ' + ((r._types_ko || []).join(', ') || '—') +
      ' / 요일: ' + ((r._days_ko || []).join('') || '—') +
      ' / 시간: ' + (r._time || '—') +
      ' / 인원: ' + (r._class_size || '—') + '\n' +
      '   ' + (r.package || '—') +
      (r.monthly_fee_krw ? ' / ' + r.monthly_fee_krw.toLocaleString('ko-KR') + '원' : '') + '\n';
  });
  kakaoText += '━━━━━━━━━━━━━━━\n등록일시: ' + new Date().toLocaleString('ko-KR');
  fetch('/api/admin/ai-action', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'send_kakao_self', args: { text: kakaoText } })
  }).catch(() => {});

  // 통합 CSV (다행)
  let csv = '﻿학생 이름,UID,수업 유형,구분,패키지,월 수강료(KRW),요일,시간,인원 방식,시작일\n';
  records.forEach(r => {
    const cat = r._category === 'test_only' ? '레벨테스트만' : r._category === 'full' ? '풀패키지' : (r._category || '');
    csv += '"' + (r.student_name||'').replace(/"/g, '""') + '",' +
           '"' + (r.student_user_id||'').replace(/"/g, '""') + '",' +
           '"' + ((r._types_ko||[]).join('+')) + '",' +
           '"' + cat + '",' +
           '"' + (r.package||'').replace(/"/g, '""') + '",' +
           (r.monthly_fee_krw || '') + ',' +
           '"' + ((r._days_ko||[]).join('')) + '",' +
           '"' + (r._time || '') + '",' +
           '"' + (r._class_size || '') + '",' +
           (r._started_at_str || '') + '\n';
  });
  _downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    '수강신청_일괄_' + N + '명_' + dateStr + '.csv');

  // 통합 Word (다행 표)
  let docHtml =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="UTF-8"><title>수강신청 일괄 등록 ' + N + '명</title>' +
    '<style>body{font-family:MangoiHanSC,"Malgun Gothic",sans-serif;font-size:11pt;padding:30px}' +
    'h1{color:#9a3412;border-bottom:3px solid #f59e0b;padding-bottom:8px}' +
    'table{border-collapse:collapse;width:100%;margin-top:20px}' +
    'th{background:#fef3c7;color:#78350f;text-align:left;padding:8px 12px;border:1px solid #d6d3d1;font-size:10pt}' +
    'td{padding:8px 12px;border:1px solid #d6d3d1;font-size:10pt}' +
    '.footer{margin-top:30px;font-size:10pt;color:#9ca3af;text-align:right}' +
    '</style></head><body>' +
    '<h1>📚 망고아이 수강신청 일괄 등록 — ' + N + '명</h1>' +
    '<p>아래 ' + N + '명의 학생 수강신청이 정상 등록되었습니다. ' +
    '🔍 레벨테스트만 ' + records.filter(r=>r._category==='test_only').length + '명 / ' +
    '🌟 풀패키지 ' + records.filter(r=>r._category==='full').length + '명</p>' +
    '<table><tr><th>#</th><th>학생</th><th>UID</th><th>유형</th><th>구분</th><th>패키지</th><th>수강료</th><th>요일</th><th>시간</th><th>인원</th><th>시작일</th></tr>';
  records.forEach((r, i) => {
    const tag = r._category === 'test_only' ? '🔍 레벨테스트만' : r._category === 'full' ? '🌟 풀패키지' : (r._category||'—');
    docHtml += '<tr>' +
      '<td>' + (i+1) + '</td>' +
      '<td><b>' + _aiEsc(r.student_name) + '</b></td>' +
      '<td>' + _aiEsc(r.student_user_id || '—') + '</td>' +
      '<td>' + _aiEsc((r._types_ko||[]).join(', ') || '—') + '</td>' +
      '<td>' + _aiEsc(tag) + '</td>' +
      '<td>' + _aiEsc(r.package) + '</td>' +
      '<td>' + (r.monthly_fee_krw ? r.monthly_fee_krw.toLocaleString('ko-KR') + '원' : '—') + '</td>' +
      '<td>' + _aiEsc((r._days_ko||[]).join('') || '—') + '</td>' +
      '<td>' + _aiEsc(r._time || '—') + '</td>' +
      '<td>' + _aiEsc(r._class_size || '—') + '</td>' +
      '<td>' + _aiEsc(r._started_at_str || '—') + '</td>' +
      '</tr>';
  });
  docHtml += '</table><div class="footer">© Mangoi · 자동 생성 · ' + new Date().toLocaleString('ko-KR') + '</div></body></html>';
  _downloadBlob(new Blob([docHtml], { type: 'application/msword;charset=utf-8' }),
    '수강신청_일괄_' + N + '명_' + dateStr + '.doc');
}

// 🥭 Phase 22 — 수강신청 자동화: 카톡 + Excel + Word
//   ① 백엔드에 카톡 큐 적재 요청
//   ② Excel CSV 자동 다운로드 (한글 BOM 포함, 엑셀에서 깨짐 없이 열림)
//   ③ Word HTML 자동 다운로드 (.doc — MS Word 에서 표 그대로 열림)
async function autoExportEnrollment(enr) {
  // ① 카톡 큐 — 백엔드 KV 큐에 메시지 적재
  const categoryBadge = enr.category === 'test_only' ? '🔍 레벨테스트만'
                      : enr.category === 'full' ? '🌟 풀패키지(레벨+체험+정규)'
                      : (enr.types_ko && enr.types_ko !== '—' ? '📌 ' + enr.types_ko : '');
  const kakaoText =
    '📚 [망고아이] 수강신청 등록\n' +
    '━━━━━━━━━━━━━━━\n' +
    '학생: ' + enr.student_name + '\n' +
    'UID:  ' + enr.student_user_id + '\n' +
    (categoryBadge ? '구분: ' + categoryBadge + '\n' : '') +
    '수업 유형: ' + (enr.types_ko || '—') + '\n' +
    '패키지: ' + enr.package + '\n' +
    '월 수강료: ' + (enr.monthly_fee_krw ? enr.monthly_fee_krw.toLocaleString('ko-KR') + ' 원' : '미정') + '\n' +
    '요일: ' + (enr.days_ko || '—') + '\n' +
    '시간: ' + (enr.time || '—') + '\n' +
    '인원 방식: ' + (enr.class_size || '—') + '\n' +
    '시작일: ' + enr.started_at + '\n' +
    '등록일시: ' + enr.created_at + '\n' +
    '━━━━━━━━━━━━━━━';
  fetch('/api/admin/ai-action', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'send_kakao_self', args: { text: kakaoText } })
  }).then(r => r.json()).then(j => {
    if (j.ok) console.info('[enroll-auto] kakao queued:', j.queued_id);
    else console.warn('[enroll-auto] kakao failed:', j);
  }).catch(err => console.warn('[enroll-auto] kakao error:', err));

  // ② Excel (CSV with BOM) 다운로드
  const safeName = enr.student_name.replace(/[\\/:*?"<>|]/g, '_');
  const dateStr = new Date().toISOString().slice(0,10);
  const csv =
    '﻿' + // UTF-8 BOM (한글 깨짐 방지)
    '항목,값\n' +
    '"수강신청 ID","' + enr.id + '"\n' +
    '"학생 이름","' + enr.student_name.replace(/"/g, '""') + '"\n' +
    '"학생 UID","' + (enr.student_user_id || '').replace(/"/g, '""') + '"\n' +
    '"수업 유형","' + (enr.types_ko || '').replace(/"/g, '""') + '"\n' +
    '"구분","' + (enr.category === 'test_only' ? '레벨테스트만' : enr.category === 'full' ? '풀패키지' : enr.category || '') + '"\n' +
    '"패키지","' + (enr.package || '').replace(/"/g, '""') + '"\n' +
    '"월 수강료(KRW)","' + (enr.monthly_fee_krw || '') + '"\n' +
    '"요일","' + (enr.days_ko || '') + '"\n' +
    '"시간","' + (enr.time || '') + '"\n' +
    '"인원 방식","' + (enr.class_size || '') + '"\n' +
    '"시작일","' + enr.started_at + '"\n' +
    '"등록일시","' + enr.created_at + '"\n';
  _downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    '수강신청_' + safeName + '_' + dateStr + '.csv');

  // ③ Word (.doc HTML) 다운로드 — MS Word 가 HTML 을 표로 렌더링
  const docHtml =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
          'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
          'xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="UTF-8"><title>수강신청서 — ' + _aiEsc(enr.student_name) + '</title>' +
    '<style>body{font-family:MangoiHanSC,"Malgun Gothic",sans-serif;font-size:11pt;padding:30px;}' +
    'h1{color:#9a3412;border-bottom:3px solid #f59e0b;padding-bottom:8px}' +
    'table{border-collapse:collapse;width:100%;margin-top:20px}' +
    'th{background:#fef3c7;color:#78350f;text-align:left;padding:10px 14px;border:1px solid #d6d3d1}' +
    'td{padding:10px 14px;border:1px solid #d6d3d1}' +
    '.footer{margin-top:30px;font-size:10pt;color:#9ca3af;text-align:right}' +
    '</style></head><body>' +
    '<h1>📚 망고아이 수강신청서</h1>' +
    '<p>아래 학생의 수강신청이 정상 등록되었습니다.</p>' +
    '<table>' +
      '<tr><th style="width:30%">수강신청 ID</th><td>' + _aiEsc(enr.id) + '</td></tr>' +
      '<tr><th>학생 이름</th><td><b>' + _aiEsc(enr.student_name) + '</b></td></tr>' +
      '<tr><th>학생 UID</th><td>' + _aiEsc(enr.student_user_id) + '</td></tr>' +
      '<tr><th>수업 유형</th><td>' + _aiEsc(enr.types_ko || '—') + '</td></tr>' +
      '<tr><th>구분</th><td>' + _aiEsc(enr.category === 'test_only' ? '🔍 레벨테스트만' : enr.category === 'full' ? '🌟 풀패키지(레벨+체험+정규)' : enr.category || '—') + '</td></tr>' +
      '<tr><th>패키지</th><td>' + _aiEsc(enr.package) + '</td></tr>' +
      '<tr><th>월 수강료</th><td>' + (enr.monthly_fee_krw ? enr.monthly_fee_krw.toLocaleString('ko-KR') + ' 원' : '미정') + '</td></tr>' +
      '<tr><th>요일</th><td>' + _aiEsc(enr.days_ko || '—') + '</td></tr>' +
      '<tr><th>시간</th><td>' + _aiEsc(enr.time || '—') + '</td></tr>' +
      '<tr><th>인원 방식</th><td>' + _aiEsc(enr.class_size || '—') + '</td></tr>' +
      '<tr><th>시작일</th><td>' + _aiEsc(enr.started_at) + '</td></tr>' +
      '<tr><th>등록일시</th><td>' + _aiEsc(enr.created_at) + '</td></tr>' +
    '</table>' +
    '<div class="footer">© Mangoi · 자동 생성 · ' + new Date().toLocaleString('ko-KR') + '</div>' +
    '</body></html>';
  _downloadBlob(new Blob([docHtml], { type: 'application/msword;charset=utf-8' }),
    '수강신청_' + safeName + '_' + dateStr + '.doc');

  // 사용자 안내 토스트 (간단한 alert)
  setTimeout(() => {
    alert('✅ 수강신청 자동화 완료\n\n' +
          '• 카톡 메모챗에 알림 큐 적재\n' +
          '• Excel(.csv) 다운로드\n' +
          '• Word(.doc) 다운로드');
  }, 300);
}

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
async function setEnrollmentStatus(id, status) {
  const en = (adminLang === 'en');
  const cur = _enItems.find(x => String(x.id) === String(id)) || {};
  const name = cur.student_name ? String(cur.student_name) : '';
  const m = _enStatusMeta(status);
  const label = en ? m.en : m.ko;
  // 되돌리기 어려운 쪽만 확인 — 취소는 오탭 한 번에 그대로 넘어가던 자리였다
  if (status === 'cancelled') {
    const msg = en
      ? ('Cancel this enrollment' + (name ? ' — ' + name : '') + '?\nThe student account stays; only this enrollment is marked cancelled.')
      : ('이 수강신청을 «취소» 처리할까요' + (name ? ' — ' + name : '') + '?\n학생 계정은 그대로 남고, 이 신청 건만 취소로 표시됩니다.');
    if (!confirm(msg)) return;
  }
  const r = await fetch('/api/admin/enrollments/'+id, {method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({status})});
  const d = await r.json().catch(()=>({}));
  if (!r.ok || d.ok === false) { alert((en?'Failed: ':'실패: ')+(d.error||('HTTP '+r.status))); return; }
  // 서버는 status 한 칸만 바꾼다. 무엇이 바뀌었는지 말해 주지 않으면 «아무 일도 안 난» 것으로 보인다
  _enToast(en
    ? ((name ? name + ' — ' : '') + 'status changed to ' + label)
    : ((name ? name + ' ' : '') + '상태를 «' + label + '» 으로 바꿨습니다'));
  loadEnrollments();
}

/* 🗑️ (2026-08-21 사장님 지시) 수강신청 삭제 — 데모/테스트 항목 정리용.
   ⛔ 되돌릴 수 없다. 서버가 본사(경영진·관리자)만 허용하고(403), 확정·활성화돼 실제
      수업(class_schedules.source='adm-enroll:<id>')이 생긴 건은 삭제 전에 그 수업을
      먼저 cancelled 로 정리한다(레벨테스트 삭제와 같은 이유). */
async function enDeleteOne(id) {
  const en = (adminLang === 'en');
  const cur = _enItems.find(x => String(x.id) === String(id)) || {};
  const name = cur.student_name ? String(cur.student_name) : '';
  const label = name ? (' — ' + name) : '';
  if (!confirm((en ? 'Delete this enrollment' : '이 수강신청을 삭제할까요') + label + '?\n' +
    (en ? 'This cannot be undone. A linked class (if any) will be cancelled.' : '되돌릴 수 없습니다. 연결된 수업이 있으면 함께 취소 처리됩니다.'))) return;
  let d = {};
  try {
    const r = await fetch('/api/admin/enrollments/' + id, { method: 'DELETE', credentials: 'include' });
    d = await r.json().catch(() => ({}));
  } catch (e) {
    alert(en ? 'Network error while deleting.' : '삭제 중 통신 오류가 났습니다.');
    return;
  }
  if (d && d.ok) { loadEnrollments(); return; }
  alert('⚠ ' + ((en ? d.message_en : d.message) || d.message || d.error || (en ? 'Failed' : '삭제에 실패했습니다')));
}

/* 🗑️ 화면에 지금 «보이는» 항목(검색·상태 필터가 걸려 있으면 그것만) 전체 삭제.
   ⚠️ 최대 90건까지 한 번에 보낸다(D1 IN 바인드 한도) — 그 이상이면 나눠서 다시 누르게 안내. */
async function enDeleteAllVisible() {
  const en = (adminLang === 'en');
  /* «보이는 것» 은 렌더러가 남긴 __enShown 이 정본이다. 여기서 필터를 다시 계산하면
     렌더러와 조건이 어긋나는 순간(실제로 중복만 보기 _enDupOnly 가 빠져 있었다)
     화면에 안 보이는 신청까지 지워진다 — 복구 불가 삭제라 특히 위험. */
  const rows = (__enShown || []).filter(it => it && it.id != null);
  if (!rows.length) { alert(en ? 'Nothing to delete.' : '지울 항목이 없습니다.'); return; }
  const ids = rows.slice(0, 90).map(it => it.id);
  if (!confirm((en
    ? ('Delete ' + ids.length + ' enrollment(s)? This cannot be undone. Linked classes will be cancelled.')
    : (ids.length + '건의 수강신청을 삭제할까요? 되돌릴 수 없습니다. 연결된 수업은 함께 취소 처리됩니다.')))) return;
  let d = {};
  try {
    const r = await fetch('/api/admin/enrollments', {
      method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    d = await r.json().catch(() => ({}));
  } catch (e) {
    alert(en ? 'Network error while deleting.' : '삭제 중 통신 오류가 났습니다.');
    return;
  }
  // 성공은 «ok:true 라고 말했는가» 로 판정 — 관문 404 본문({error:'Not Found'})은 ok 칸이
  // 없어 === false 를 그냥 통과해 「0건 삭제」 정상 문구로 위장한다(CLAUDE.md 2장).
  if (!d || d.ok !== true) { alert('⚠ ' + ((en ? d.message_en : d.message) || d.message || d.error || (en ? 'Failed' : '삭제에 실패했습니다'))); return; }
  const n = (d.deleted || []).length;
  _enToast(en ? (n + ' enrollment(s) deleted') : (n + '건 삭제했습니다'));
  loadEnrollments();
  if (rows.length > 90) {
    alert(en ? 'More than 90 matched — press the button again for the rest.' : '90건이 넘게 걸려서 나머지는 다시 눌러 주세요.');
  }
}

/* ════════════════════════════════════════════════════════════
   🥭 Phase 23 — 역방향 자동화: 파일/카톡 → 수강신청 일괄 등록
   - importFromFile(file)   : .csv / .doc / .docx / .html 파싱
   - importFromKakaoText(t) : 카톡 형식 텍스트 파싱 (다중 학생 지원)
   - 모든 파서는 표준화된 enrollment 객체 배열 반환
   - 미리보기 → 사용자 확인 → 일괄 POST
════════════════════════════════════════════════════════════ */

// CSV 한 줄 안전 파싱 (따옴표·콤마 처리)
function _parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// 텍스트(붙여넣기)에서 한국어 라벨 추출 (Phase 25: 유형·요일·시간 추가)
function _extractKoFields(text) {
  const get = (re) => { const m = text.match(re); return m ? m[1].trim() : ''; };
  return {
    student_name: get(/(?:학생\s*이름|학생|이름)\s*[:：]?\s*([^\n,;]+)/),
    student_user_id: get(/(?:학생\s*UID|UID|user[_\s]*id|아이디)\s*[:：]?\s*([^\n,;]+)/i),
    types_raw: get(/(?:수업\s*유형|유형|과목)\s*[:：]?\s*([^\n,;]+)/),
    package: get(/(?:패키지|상품|코스|과정)\s*[:：]?\s*([^\n,;]+)/),
    monthly_fee: get(/(?:월\s*수강료|수강료|학비|fee)\s*[:：]?\s*([0-9,]+)/i),
    days_raw: get(/(?:요일|days?)\s*[:：]?\s*([^\n,;]+)/i),
    // 🥭 Phase 32 — 시간 필드는 단일 "10:30" 또는 요일별 "월 7:30, 수 8:00" 모두 캡처
    time: get(/(?:시간|time)\s*[:：]?\s*([0-9:월화수목금토일,\s]+?)(?=\n|$|인원|시작일|class|started|개강)/i),
    class_size: get(/(?:인원\s*방식|인원|class\s*size|수업\s*인원)\s*[:：]?\s*(1\s*[:대]\s*[0-9N]+)/i),
    started_at: get(/(?:시작일|개강일|등록일|started?)\s*[:：]?\s*([0-9./-]+)/i)
  };
}

function _normalizeEnrollment(raw) {
  const name = (raw.student_name || '').trim();
  // 🥭 Phase 31 — 유형 추출: 체크박스 (☑/✓/✔) 우선 감지, 없으면 단어 매칭
  const typesRaw = String(raw.types_raw || raw.types || '');
  const types = [];
  // 체크된 표시(☑✓✔)가 어디든 있으면 체크박스 모드로 동작
  const hasCheckmark = /[☑✓✔]/.test(typesRaw);
  if (hasCheckmark) {
    // 체크된 항목만 추출 — ☑ 가 단어 앞 또는 뒤에 인접한 경우만
    if (/[☑✓✔][\s]*레벨|레벨[\s]*[☑✓✔]/i.test(typesRaw)) types.push('level');
    if (/[☑✓✔][\s]*체험|체험[\s]*[☑✓✔]/i.test(typesRaw)) types.push('trial');
    if (/[☑✓✔][\s]*정규|정규[\s]*[☑✓✔]/i.test(typesRaw)) types.push('regular');
  } else {
    // 체크박스 없음 — 단어 매칭 (텍스트 형식 호환)
    const lower = typesRaw.toLowerCase();
    if (/레벨|level/i.test(lower)) types.push('level');
    if (/체험|trial/i.test(lower)) types.push('trial');
    if (/정규|regular/i.test(lower)) types.push('regular');
  }
  // 요일 추출
  const daysRaw = String(raw.days_raw || raw.days || '').toLowerCase();
  const days = [];
  const dayMap = [['월','mon'],['화','tue'],['수','wed'],['목','thu'],['금','fri'],['토','sat'],['일','sun']];
  dayMap.forEach(([ko, en]) => {
    if (daysRaw.includes(ko) || daysRaw.includes(en)) days.push(en);
  });
  // 🥭 Phase 32 — 시간 필드에 요일별 시간 ("월 7:30, 수 8:00") 이 있으면 거기서 요일도 추출
  const timeRaw = String(raw.time || '').trim();
  if (timeRaw && /[월화수목금토일]\s*\d/.test(timeRaw)) {
    dayMap.forEach(([ko, en]) => {
      if (new RegExp(ko + '\\s*\\d').test(timeRaw) && !days.includes(en)) {
        days.push(en);
      }
    });
  }
  // 패키지 — 비어있으면 유형으로 자동 채움
  let pkg = (raw.package || '').trim();
  if (!pkg && types.length > 0) {
    const tlabel = { level:'레벨테스트', trial:'체험수업', regular:'정규수업' };
    pkg = types.map(t => tlabel[t]).join('+');
  }
  // 이름이 없거나 (패키지·유형 모두 없으면) 무효
  if (!name || (!pkg && types.length === 0)) return null;
  let feeNum = null;
  if (raw.monthly_fee_krw) feeNum = parseInt(String(raw.monthly_fee_krw).replace(/[^0-9]/g, ''), 10) || null;
  else if (raw.monthly_fee) feeNum = parseInt(String(raw.monthly_fee).replace(/[^0-9]/g, ''), 10) || null;
  let startMs = null;
  if (raw.started_at) {
    const s = String(raw.started_at).replace(/\./g, '-').replace(/\//g, '-').trim();
    const d = new Date(s);
    if (!isNaN(d.getTime())) startMs = d.getTime();
  }
  // 분류
  let category = '';
  if (types.length === 1 && types[0] === 'level') category = 'test_only';
  else if (types.length === 3) category = 'full';
  else if (types.length > 0) category = types.join('+');
  const daysKo = days.map(d => ({mon:'월',tue:'화',wed:'수',thu:'목',fri:'금',sat:'토',sun:'일'}[d]));
  const typesKo = types.map(t => ({level:'레벨테스트',trial:'체험수업',regular:'정규수업'}[t]));
  const sizeStd = String(raw.class_size || '').replace(/\s/g, '').replace('대', ':');
  return {
    student_name: name,
    student_user_id: (raw.student_user_id || '').trim() || null,
    package: pkg || '미정',
    monthly_fee_krw: feeNum,
    started_at: startMs,
    // 🥭 2026-08-08 — DB 컬럼 이름 그대로 (import 경로는 이 객체를 통째로 POST 한다)
    days_of_week: daysKo.join('') || null,
    time: timeRaw || null,
    class_size: sizeStd || null,
    type: typesKo.join('+') || null,
    _types: types,
    _types_ko: types.map(t => ({level:'레벨테스트',trial:'체험수업',regular:'정규수업'}[t])),
    _days: days,
    _days_ko: days.map(d => ({mon:'월',tue:'화',wed:'수',thu:'목',fri:'금',sat:'토',sun:'일'}[d])),
    _time: (raw.time || '').trim(),
    _class_size: String(raw.class_size || '').replace(/\s/g, '').replace('대', ':'),
    _category: category,
    _started_at_str: raw.started_at || ''
  };
}

// CSV 파서 — 단일/다행 모두 지원
function _parseCsvEnrollments(text) {
  text = text.replace(/^﻿/, ''); // BOM 제거
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];

  // 케이스 1: "항목,값" 단일 record (망고아이가 발급한 형식)
  if (/^"?항목"?\s*,\s*"?값"?/i.test(lines[0])) {
    const obj = {};
    for (let i = 1; i < lines.length; i++) {
      const f = _parseCsvLine(lines[i]);
      if (f.length >= 2) obj[f[0]] = f[1];
    }
    const enr = _normalizeEnrollment({
      student_name: obj['학생 이름'],
      student_user_id: obj['학생 UID'],
      types_raw: obj['수업 유형'] || obj['유형'],
      package: obj['패키지'],
      monthly_fee_krw: obj['월 수강료(KRW)'] || obj['월 수강료'],
      days_raw: obj['요일'],
      time: obj['시간'],
      class_size: obj['인원 방식'] || obj['인원'],
      started_at: obj['시작일'] || obj['개강일']
    });
    return enr ? [enr] : [];
  }

  // 케이스 2: 헤더 + 다행 record
  const headers = _parseCsvLine(lines[0]).map(h => h.trim());
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const f = _parseCsvLine(lines[i]);
    const rec = {};
    headers.forEach((h, idx) => { rec[h] = (f[idx] || '').trim(); });
    const enr = _normalizeEnrollment({
      student_name: rec['학생 이름'] || rec['학생'] || rec['이름'] || rec.student_name || rec.name,
      student_user_id: rec['학생 UID'] || rec['UID'] || rec.user_id || rec.uid,
      types_raw: rec['수업 유형'] || rec['수업 유형 (레벨+체험+정규 중 하나 이상)'] || rec['유형'] || rec['과목'],
      package: rec['패키지'] || rec['상품'] || rec.package,
      monthly_fee_krw: rec['월 수강료(KRW)'] || rec['월 수강료'] || rec['수강료'] || rec.fee,
      days_raw: rec['요일'] || rec['요일 (월화수목금토일 중 다수)'] || rec.days,
      time: rec['시간'] || rec['시간 (HH:MM 10분 단위)'] || rec.time,
      class_size: rec['인원 방식'] || rec['인원'] || rec['수업 인원'] || rec['인원 방식 (1대1, 1대N)'] || rec.class_size,
      started_at: rec['시작일'] || rec['시작일 (YYYY-MM-DD)'] || rec['개강일'] || rec.start || rec.started_at
    });
    if (enr) records.push(enr);
  }
  return records;
}

// Word(.doc HTML) 파서 — 망고아이가 발급한 표 형식
function _parseWordEnrollments(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const result = [];
  const trs = Array.from(doc.querySelectorAll('table tr'));

  // 헤더 행 후보: "학생 이름" 또는 "학생" 셀이 들어있는 행
  // (Phase 29 양식은 헤더가 두 번 등장 — 예시 위/빈 행 위)
  const isHeaderRow = (tr) => {
    const cellTexts = Array.from(tr.querySelectorAll('th,td')).map(c => c.textContent.trim());
    if (cellTexts.length < 3) return false;
    const joined = cellTexts.join('|');
    return /학생\s*이름|학생/.test(joined) && (/패키지|수업\s*유형|상품/.test(joined));
  };

  // 단일 record 표 (th/td 쌍) — 망고아이 발급 단일 형식
  const obj = {};
  let hasThTd = false;
  trs.forEach(tr => {
    const th = tr.querySelector('th');
    const td = tr.querySelector('td');
    if (th && td) { obj[th.textContent.trim()] = td.textContent.trim(); hasThTd = true; }
  });
  if (hasThTd) {
    const enr = _normalizeEnrollment({
      student_name: obj['학생 이름'] || obj['학생'] || obj['이름'],
      student_user_id: obj['학생 UID'] || obj['UID'],
      types_raw: obj['수업 유형'] || obj['유형'],
      package: obj['패키지'] || obj['상품'],
      monthly_fee_krw: obj['월 수강료'] || obj['수강료'],
      days_raw: obj['요일'],
      time: obj['시간'],
      class_size: obj['인원 방식'] || obj['인원'],
      started_at: obj['시작일'] || obj['개강일']
    });
    if (enr) result.push(enr);
  }

  // 헤더 + 다행 표 — 모든 헤더 행을 찾아 그 뒤 데이터 행을 파싱
  if (result.length === 0 && trs.length >= 2) {
    const headerIndices = trs.map((tr, i) => isHeaderRow(tr) ? i : -1).filter(i => i >= 0);
    if (headerIndices.length === 0) {
      // fallback: 첫 행을 헤더로 가정
      headerIndices.push(0);
    }
    const seenStart = new Set();
    headerIndices.forEach((startIdx) => {
      if (seenStart.has(startIdx)) return;
      seenStart.add(startIdx);
      const headerCells = trs[startIdx].querySelectorAll('th,td');
      const headers = Array.from(headerCells).map(c => c.textContent.replace(/\s+/g,' ').trim());
      for (let i = startIdx + 1; i < trs.length; i++) {
        // 다음 헤더 행을 만나면 중단
        if (isHeaderRow(trs[i])) break;
        // colspan 이 너비 이상인 행 (제목/안내/구분선) 은 데이터 아님 — 스킵
        const tds = Array.from(trs[i].querySelectorAll('td'));
        if (tds.length === 0) continue;
        if (tds.length === 1 && tds[0].getAttribute('colspan')) continue;
        const cells = tds.map(c => c.textContent.replace(/\s+/g,' ').trim());
        const rec = {};
        headers.forEach((h, idx) => { rec[h] = cells[idx] || ''; });
        // 헤더 키 변형도 함께 시도 (긴 라벨들)
        const findKey = (keys) => {
          for (const k of keys) {
            for (const h of Object.keys(rec)) {
              if (h.includes(k)) return rec[h];
            }
          }
          return '';
        };
        // 🥭 Phase 33 — 7개 요일 컬럼 (월/화/수/목/금/토/일) 감지
        // 각 요일 컬럼이 별도로 존재하면 시간을 거기서 읽어서 "월 7:00, 수 8:30" 형식으로 합성
        const dayColMap = [['월','mon'],['화','tue'],['수','wed'],['목','thu'],['금','fri'],['토','sat'],['일','sun']];
        const perDayParts = [];
        let perDayDays = '';
        dayColMap.forEach(([ko, en]) => {
          // 헤더가 정확히 "월" 같은 단일 글자면 매칭 (긴 라벨은 부분 매칭 안 함)
          for (const h of Object.keys(rec)) {
            if (h === ko && rec[h] && /\d/.test(rec[h])) {
              const t = rec[h].replace(/\s/g, '');
              perDayParts.push(ko + ' ' + t);
              perDayDays += ko;
              break;
            }
          }
        });
        const enr = _normalizeEnrollment({
          student_name: findKey(['학생 이름','학생','이름']),
          student_user_id: findKey(['UID','user']),
          types_raw: findKey(['수업 유형','유형','과목']),
          package: findKey(['패키지','상품','코스']),
          monthly_fee_krw: findKey(['월 수강료','수강료','학비']),
          // 7-컬럼 형식 발견 시 그쪽 우선, 없으면 기존 단일 컬럼 fallback
          days_raw: perDayDays || findKey(['요일']),
          time: perDayParts.length > 0 ? perDayParts.join(', ') : findKey(['시간']),
          class_size: findKey(['인원 방식','인원','class']),
          started_at: findKey(['시작일','개강일'])
        });
        if (enr) result.push(enr);
      }
    });
  }

  // 표가 없으면 본문 텍스트에서 라벨 추출
  if (result.length === 0) {
    const fields = _extractKoFields(doc.body.textContent || '');
    const enr = _normalizeEnrollment(fields);
    if (enr) result.push(enr);
  }
  return result;
}

// 카톡 텍스트 파서 — 빈 줄로 구분된 여러 명 지원
function _parseKakaoEnrollments(text) {
  // 빈 줄 (또는 ━ 같은 구분선) 으로 record 분리
  const blocks = text.split(/\n\s*\n|━{3,}/).map(b => b.trim()).filter(b => b);
  const result = [];
  for (const block of blocks) {
    const fields = _extractKoFields(block);
    const enr = _normalizeEnrollment(fields);
    if (enr) result.push(enr);
  }
  return result;
}

// 미리보기 렌더링
function _renderImportPreview(records, source) {
  const box = document.getElementById('en-import-preview');
  if (!box) return;
  if (!records || records.length === 0) {
    box.style.display = 'block';
    box.innerHTML = '<div style="color:#dc2626;font-size:13px">⚠️ ' +
      _aiEsc(source) + ' 에서 수강신청 정보를 찾을 수 없습니다. 파일·텍스트 형식을 확인해 주세요.</div>';
    return;
  }
  const testOnly = records.filter(r => r._category === 'test_only').length;
  const fullPkg  = records.filter(r => r._category === 'full').length;
  let html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">' +
    '<b style="color:#065f46">📋 미리보기 — ' + records.length + '건' +
      ' (🔍 ' + testOnly + ' / 🌟 ' + fullPkg + ')</b>' +
    '<button id="en-import-confirm-btn" style="padding:6px 14px;font-size:12px;background:#10b981;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:700">✅ ' + records.length + '건 일괄 등록</button>' +
    '</div>' +
    '<div style="overflow-x:auto"><table style="min-width:900px;font-size:11px;border-collapse:collapse">' +
    '<tr style="background:#fef3c7"><th style="padding:6px 8px;border:1px solid #e5e7eb">#</th>' +
    '<th style="padding:6px 8px;border:1px solid #e5e7eb">학생</th>' +
    '<th style="padding:6px 8px;border:1px solid #e5e7eb">UID</th>' +
    '<th style="padding:6px 8px;border:1px solid #e5e7eb">유형</th>' +
    '<th style="padding:6px 8px;border:1px solid #e5e7eb">구분</th>' +
    '<th style="padding:6px 8px;border:1px solid #e5e7eb">패키지</th>' +
    '<th style="padding:6px 8px;border:1px solid #e5e7eb">수강료</th>' +
    '<th style="padding:6px 8px;border:1px solid #e5e7eb">요일</th>' +
    '<th style="padding:6px 8px;border:1px solid #e5e7eb">시간</th>' +
    '<th style="padding:6px 8px;border:1px solid #e5e7eb">인원</th>' +
    '<th style="padding:6px 8px;border:1px solid #e5e7eb">시작일</th></tr>';
  records.forEach((r, i) => {
    const startStr = r.started_at ? new Date(r.started_at).toISOString().slice(0,10) : (r._started_at_str || '—');
    const feeStr = r.monthly_fee_krw ? r.monthly_fee_krw.toLocaleString('ko-KR') + '원' : '—';
    const tag = r._category === 'test_only' ? '🔍 레벨만' : r._category === 'full' ? '🌟 풀패키지' : (r._category||'—');
    html += '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center">' + (i+1) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb"><b>' + _aiEsc(r.student_name) + '</b></td>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb"><code>' + _aiEsc(r.student_user_id || '—') + '</code></td>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb">' + _aiEsc((r._types_ko||[]).join(',') || '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb">' + _aiEsc(tag) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb">' + _aiEsc(r.package) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right">' + feeStr + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb">' + _aiEsc((r._days_ko||[]).join('') || '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb">' + _aiEsc(r._time || '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb">' + _aiEsc(r._class_size || '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #e5e7eb">' + startStr + '</td>' +
      '</tr>';
  });
  html += '</table></div>';
  box.style.display = 'block';
  box.innerHTML = html;
  // 확인 버튼 → 일괄 등록 실행
  document.getElementById('en-import-confirm-btn').addEventListener('click', () => _bulkRegisterEnrollments(records));
}

/* ✅ (2026-08-20) 엑셀·워드·카톡으로 가져온 건도 다중등록표(addEnrollment/_enAutoConfirm)와
   같은 파이프라인을 태운다. 그 전에는 여기서 /api/admin/enrollments 로 «신청만» 저장하고
   끝나서, 화면에 «등록 완료» 로 떠도 실제로는 강사 배정·시간표 생성(배정)까지 가지 않았다 —
   목록에 전부 pending 으로 쌓이고 사람이 건마다 「▸ 확정 안 됨」을 눌러야 배정이 됐다.
   등록표 쪽만 (2026-08-12) 「등록 = 확정」으로 고쳐졌고 가져오기 경로는 빠져 있었다. */
async function _bulkRegisterEnrollments(records) {
  const box = document.getElementById('en-import-preview');
  if (box) box.innerHTML = '<div style="color:#9a3412">⏳ 등록·확정 중… (0 / ' + records.length + '건)</div>';
  let ok = 0, fail = 0, confirmed = 0; const errs = [], notConfirmed = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    try {
      const res = await fetch('/api/admin/enrollments', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r)
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok !== false) {
        ok++;
        // ✅ 등록 = 확정. 저장 직후 바로 이어 돌린다(별도 확정 클릭 없음) — addEnrollment 와 동일 패턴.
        const cf = await _enAutoConfirm(j.id || j.enrollment_id);
        if (cf.ok) confirmed++;
        else notConfirmed.push(r.student_name + ': ' +
          (cf.error || (cf.failed || []).map(s => s.detail).join(' / ') || '확정 보류'));
      } else {
        fail++; errs.push(r.student_name + ': ' + (j.error || ('HTTP ' + res.status)));
      }
    } catch (e) {
      fail++; errs.push(r.student_name + ': ' + (e.message || e));
    }
    if (box) box.innerHTML = '<div style="color:#9a3412">⏳ 등록·확정 중… (' + (i + 1) + ' / ' + records.length + '건)</div>';
  }
  if (box) {
    box.innerHTML = '<div style="font-size:13px"><b>✅ 등록 ' + ok + '건 · 확정(배정) ' + confirmed + '건' +
      (notConfirmed.length ? ' · ⚠️ 확정 보류 ' + notConfirmed.length + '건' : '') +
      (fail ? ' · ❌ 실패 ' + fail + '건' : '') + '</b>' +
      (errs.length ? '<div style="margin-top:6px;color:#dc2626;font-size:11px">실패 상세:<br>' + errs.map(_aiEsc).join('<br>') + '</div>' : '') +
      (notConfirmed.length ? '<div style="margin-top:6px;color:#b45309;font-size:11px">확정 보류 — 목록의 「▸ 확정 안 됨」을 눌러 이유를 보고 고쳐 주세요:<br>' + notConfirmed.map(_aiEsc).join('<br>') + '</div>' : '') +
      '</div>';
  }
  loadEnrollments();
}

async function importEnrollmentFromFile() {
  const fi = document.getElementById('en-import-file');
  if (!fi || !fi.files || fi.files.length === 0) {
    alert('파일을 먼저 선택해 주세요.');
    return;
  }
  const file = fi.files[0];
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  let text = '';
  try { text = await file.text(); }
  catch (e) { alert('파일 읽기 실패: ' + e.message); return; }
  let records = [];
  // 자동 감지 우선 — HTML 태그가 있으면 어떤 확장자든 표 파서로 처리
  // (망고아이가 발급한 .xls 는 HTML+XML 형식, .doc 도 HTML)
  if (text.includes('<table') || text.includes('<html') || text.includes('<TABLE')) {
    records = _parseWordEnrollments(text);
  } else if (ext === 'csv' || ext === 'txt') {
    records = _parseCsvEnrollments(text);
  } else if (ext === 'xls' || ext === 'xlsx' || ext === 'doc' || ext === 'docx' || ext === 'html') {
    records = _parseWordEnrollments(text);
  } else {
    records = _parseCsvEnrollments(text);
  }
  _renderImportPreview(records, file.name);
}

function importEnrollmentFromKakao() {
  const ta = document.getElementById('en-kakao-text');
  if (!ta || !ta.value.trim()) {
    alert('카톡 메시지를 붙여넣어 주세요.');
    return;
  }
  const records = _parseKakaoEnrollments(ta.value);
  _renderImportPreview(records, '카톡 메시지');
}

// ── 커뮤니티 ─────────────────────────────────────────────────────────
async function loadCommunity() {
  const r = await fetch('/api/admin/community-posts',{cache:'no-store',credentials:'include'});
  const d = await r.json().catch(()=>({}));
  const tb = document.getElementById('community-table');
  if (!d.ok || !d.items || d.items.length === 0) { tb.innerHTML='<tr><td colspan="5" class="empty">—</td></tr>'; return; }
  tb.innerHTML = d.items.map(p =>
    `<tr><td>${_fmtDateTime(p.created_at)}</td><td>${p.pinned?'📌 ':''}<b>${_esc(p.title)}</b></td><td>${_esc(p.author)||'—'}</td>
     <td><button onclick="togglePinPost(${p.id},${p.pinned?0:1})" style="padding:2px 8px;font-size:11px;background:${p.pinned?'#f59e0b':'#fff'};color:${p.pinned?'#fff':'#374151'};border:1px solid ${p.pinned?'#f59e0b':'#d1d5db'};border-radius:4px;cursor:pointer;">${p.pinned?'고정해제':'고정'}</button></td>
     <td>—</td></tr>`
  ).join('');
}
async function addCommunityPost() {
  const e = id => document.getElementById(id);
  const title = (e('cm-title').value||'').trim();
  if (!title) { alert(adminLang==='en'?'Title required':'제목은 필수'); return; }
  const d = await _menuPost('/api/admin/community-posts', {
    title, body: e('cm-body').value||null,
    author: e('cm-author').value||'admin',
    pinned: e('cm-pinned').checked ? 1 : 0
  });
  if (d) { ['cm-title','cm-body','cm-author'].forEach(id=>e(id).value=''); e('cm-pinned').checked=false; loadCommunity(); }
}
async function togglePinPost(id, pinned) {
  const r = await fetch('/api/admin/community-posts/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({pinned})});
  const d = await r.json().catch(()=>({}));
  if (!r.ok || d.ok === false) { alert((adminLang==='en'?'Failed: ':'실패: ')+(d.error||('HTTP '+r.status))); return; }
  loadCommunity();
}

// ── 교재 ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════
// ph240 — 컨텐츠 교재 관리 표 통합 로드
// 서버 D1 (/api/admin/textbooks) + IndexedDB v3 (textbook-uploader 저장소) 합쳐서 표시
// 화상수업 교재 라이브러리와 단일 진실로 통합
// ═══════════════════════════════════════════════════════════════
async function _adminLoadIdbTextbooks() {
  return new Promise(function(resolve){
    try {
      var req = indexedDB.open('mangoi-textbooks', 3);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('textbooks')) {
          var s = d.createObjectStore('textbooks', { keyPath: 'id' });
          try { s.createIndex('publisher', 'publisher'); } catch(_){}
          try { s.createIndex('createdAt', 'createdAt'); } catch(_){}
        }
        if (!d.objectStoreNames.contains('files')) {
          d.createObjectStore('files', { keyPath: 'id' });
        }
      };
      req.onsuccess = function() {
        var db = req.result;
        if (!db.objectStoreNames.contains('textbooks')) { db.close(); resolve([]); return; }
        var tx = db.transaction(['textbooks'], 'readonly');
        var tbReq = tx.objectStore('textbooks').getAll();
        tbReq.onsuccess = function() {
          db.close();
          var rows = (tbReq.result || []).map(function(t){
            return {
              _src: 'idb',
              id: t.id,
              title: t.textbook || t.title || '—',
              level: t.level || '',
              units: (t.lessons || []).length || (t.unit_count || 0),
              publisher: t.publisher || '',
              isbn: t.isbn || '',
              createdAt: t.createdAt
            };
          });
          console.log('[ph240 admin loadTextbooks] IndexedDB 교재 ' + rows.length + '개');
          resolve(rows);
        };
        tbReq.onerror = function() { db.close(); resolve([]); };
      };
      req.onerror = function() { resolve([]); };
      req.onblocked = function() { resolve([]); };
    } catch(e) { resolve([]); }
  });
}

async function loadTextbooks() {
  var tb = document.getElementById('textbooks-table');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="7" class="empty">📥 불러오는 중…</td></tr>';

  var items = [];
  var srvCount = 0, idbCount = 0;

  // 1) 서버 D1
  try {
    var r = await fetch('/api/admin/textbooks', { cache:'no-store', credentials:'include' });
    var d = await r.json().catch(function(){ return {}; });
    if (d.ok && d.items) {
      srvCount = d.items.length;
      items = items.concat(d.items.map(function(t){ return Object.assign({_src:'srv'}, t); }));
    }
  } catch(e) { console.warn('[ph240] 서버 API 실패', e); }

  // 2) IndexedDB v3 (textbook-uploader 저장소)
  try {
    var idbItems = await _adminLoadIdbTextbooks();
    idbCount = idbItems.length;
    items = items.concat(idbItems);
  } catch(e) { console.warn('[ph240] IDB 실패', e); }

  // 3) fix (2026-06-01) — 서버 textbook-files 를 교재별로 묶어서 합침.
  //   ★ 핵심: 휴대폰·다른 기기에서 실제로 보이는 건 '서버' 교재뿐. 이 표가 그걸 그대로 보여줘야
  //   "Phonics 업로드했는데 없다고 나옴" 같은 혼란이 사라짐. (이미 표에 있는 교재명은 중복 추가 안 함)
  var srvFileCount = 0;
  try {
    var haveTitles = {};
    items.forEach(function(t){ var k=(t.title||'').trim().toLowerCase(); if(k) haveTitles[k]=1; });
    // fix (2026-06-02) — 서버 그룹 집계(?group=1) 사용: 38,000+ 파일도 모든 교재가 빠짐없이 표에 보임.
    //   (예전 ?limit=1000 은 최근 1000개만 받아 대부분 교재가 '사라진 것처럼' 안 보였음)
    var fr = await fetch('/api/admin/textbook-files?group=1', { credentials:'include', cache:'no-store' });
    var fdj = await fr.json().catch(function(){ return {}; });
    if (fdj.ok && fdj.groups) {
      fdj.groups.forEach(function(g){
        var book = (g.book || '서버 교재').trim();
        srvFileCount += (g.files || 0);
        if (haveTitles[book.toLowerCase()]) return;  // IDB/D1 에 이미 있으면 중복 추가 안 함
        items.push({
          _src: 'srvfile',
          id: '☁',
          title: book,
          level: g.level || '',
          units: '',
          publisher: book,
          isbn: '',
          _fileCount: g.files || 0
        });
      });
    }
  } catch(e) { console.warn('[ph240] 서버 파일 그룹 실패', e); }

  // 4) 🙈 (2026-09-07) 표의 «숨김» 칸이 쓸 목록. 실패해도 표는 그대로 그린다(칸만 «—» 가 된다).
  await _tbLoadHideMap();

  console.log('[ph240] 교재 표 — D1 ' + srvCount + ' + IDB ' + idbCount + ' + 서버파일 ' + srvFileCount + '개 = 표시 ' + items.length + '그룹');

  if (items.length === 0) {
    var fb0 = document.getElementById('tb-filter-bar'); if (fb0) fb0.innerHTML = '';
    tb.innerHTML = '<tr><td colspan="7" class="empty">📭 교재 없음 — 위 [교재 폴더 업로더] 로 추가하거나 [+ 교재 등록] 으로 수동 등록</td></tr>';
    return;
  }

  // fix (2026-06-01) — 데이터 보관 + 필터칩 렌더 + (현재 선택 유지)
  window._tbItems = items;
  _tbRenderChips(items);
  _tbRenderRows(window._tbActiveFilter || '전체교재');
}
window.loadTextbooks = loadTextbooks;

// 교재명(그룹) 클릭 필터 ───────────────────────────────────────────
window._tbActiveFilter = '전체교재';
function _tbItemMatches(t, key) {
  if (!key || key === '전체교재') return true;
  var hay = ((t.title || '') + ' ' + (t.publisher || '')).toLowerCase();
  if (key === '중국어 마스터') return hay.indexOf('다락원') >= 0 || hay.indexOf('master') >= 0 || hay.indexOf('마스터') >= 0;
  return hay.indexOf(key.toLowerCase()) >= 0;
}
function _tbRenderChips(items) {
  var bar = document.getElementById('tb-filter-bar');
  if (!bar) return;
  // 교재명 입력칸 datalist 채우기 (클릭하면 기존 교재명 목록 표시)
  var dl = document.getElementById('tb-title-list');
  if (dl) {
    var seen = {}, opts = '';
    (items || []).forEach(function(t){
      var nm = (t.title || '').trim();
      if (nm && nm !== '—' && !seen[nm]) { seen[nm] = 1; opts += '<option value="' + _esc(nm) + '"></option>'; }
    });
    dl.innerHTML = opts;
  }
  // 고정 그룹 + 데이터에 있는 출판사 자동 추가
  /* 🙈 (2026-08-13) MES 를 «고정 칩» 에서 뺀다 — 이제 안 쓰는 교재를 항상 띄울 이유가 없다.
     ⚠️ 지우는 게 아니다. 아래 extra 가 «데이터에 있는 출판사» 를 자동으로 붙이므로,
        MES 교재가 명부에 남아 있는 한 칩은 그대로 나온다 — 옛 기록을 찾는 길은 막지 않는다. */
  var fixed = ['전체교재', 'Phonics', 'BTS', 'SIU', '중국어 마스터'];
  var extra = {};
  (items || []).forEach(function(t){
    var pub = (t.publisher || '').trim();
    if (pub && fixed.indexOf(pub) < 0) {
      // 고정 키워드에 포함되지 않는 출판사만 별도 칩으로
      var covered = fixed.some(function(k){ return k !== '전체교재' && _tbItemMatches(t, k); });
      if (!covered) extra[pub] = true;
    }
  });
  var keys = fixed.concat(Object.keys(extra));
  bar.innerHTML = keys.map(function(k){
    var active = (window._tbActiveFilter === k);
    var n = (k === '전체교재') ? (items || []).length : (items || []).filter(function(t){ return _tbItemMatches(t, k); }).length;
    return '<button type="button" class="tb-chip" data-key="' + _esc(k) + '" style="' +
      'padding:6px 12px;border-radius:99px;cursor:pointer;font-size:12.5px;font-weight:700;' +
      'border:1px solid ' + (active ? '#3b82f6' : 'rgba(148,163,184,0.4)') + ';' +
      'background:' + (active ? '#3b82f6' : 'rgba(148,163,184,0.12)') + ';' +
      'color:' + (active ? '#fff' : '#cbd5e1') + ';">' +
      _esc(k) + ' <span style="opacity:.7;font-weight:500">' + n + '</span></button>';
  }).join('');
  bar.querySelectorAll('.tb-chip').forEach(function(btn){
    btn.addEventListener('click', function(){
      var key = btn.getAttribute('data-key');
      // fix (2026-06-02) — '전체교재'는 토글: 펼쳐진 상태에서 다시 누르면 모두 닫힘, 다시 누르면 펼침
      if (key === '전체교재') {
        if (window._tbActiveFilter === '전체교재' && !window._tbCollapsed) {
          window._tbCollapsed = true;     // 펼쳐져 있으면 → 접기
        } else {
          window._tbActiveFilter = '전체교재';
          window._tbCollapsed = false;    // 접혀 있거나 다른 필터였으면 → 펼치기
        }
      } else {
        window._tbActiveFilter = key;
        window._tbCollapsed = false;       // 다른 칩은 항상 펼침
      }
      _tbRenderChips(window._tbItems || []);   // active 표시 갱신
      _tbRenderRows(window._tbActiveFilter);
    });
  });
}
function _tbRenderRows(key) {
  var tb = document.getElementById('textbooks-table');
  if (!tb) return;
  _tbHideNote();   // 🙈 개수 줄은 목록이 접혀 있어도 사실대로 — 행 렌더 결과와 무관하다
  // fix (2026-06-02) — '전체교재' 접힘 상태면 목록 숨김 (전체교재 다시 누르면 펼쳐짐)
  if (window._tbCollapsed) {
    tb.innerHTML = '<tr><td colspan="7" class="empty" style="cursor:pointer;color:#93c5fd" onclick="(function(){window._tbCollapsed=false;_tbRenderChips(window._tbItems||[]);_tbRenderRows(window._tbActiveFilter);})()">📁 목록이 접혀 있습니다 — \'전체교재\'를 다시 누르거나 여기를 클릭하면 펼쳐집니다</td></tr>';
    return;
  }
  var items = (window._tbItems || []).filter(function(t){ return _tbItemMatches(t, key); });
  function srcChip(src) {
    if (src === 'idb') return '<span style="display:inline-block;padding:2px 7px;background:rgba(16,185,129,0.22);color:#86efac;border-radius:99px;font-size:10.5px;font-weight:800;margin-left:6px" title="브라우저 IndexedDB — 폴더 업로더로 저장됨">💾 내 PC</span>';
    return '<span style="display:inline-block;padding:2px 7px;background:rgba(59,130,246,0.22);color:#93c5fd;border-radius:99px;font-size:10.5px;font-weight:800;margin-left:6px" title="서버 — 모든 기기에서 보임">☁ 서버</span>';
  }
  if (items.length === 0) {
    tb.innerHTML = '<tr><td colspan="7" class="empty">📭 "' + _esc(key) + '" 교재 없음</td></tr>';
    return;
  }
  tb.innerHTML = items.map(function(t, i) {
    var idCell = t._src === 'idb'
      ? '<span style="color:#86efac;font-size:14px">💾</span> <code style="font-size:10px;opacity:0.7">' + String(t.id || '').slice(0,8) + '</code>'
      : (t.id || (i+1));
    return '<tr>' +
      '<td style="white-space:nowrap">' + idCell + '</td>' +
      '<td><b>' + _esc(t.title || '—') + '</b>' + srcChip(t._src) + (t._fileCount ? ' <span style="display:inline-block;padding:2px 7px;background:rgba(251,191,36,0.18);color:#fcd34d;border-radius:99px;font-size:10.5px;font-weight:800;margin-left:4px" title="서버에 저장된 파일 수">📄 ' + t._fileCount + '</span>' : '') + '</td>' +
      '<td>' + (_esc(t.level) || '—') + '</td>' +
      '<td style="text-align:right">' + (t.units || '—') + '</td>' +
      '<td>' + (_esc(t.publisher) || '—') + '</td>' +
      '<td><code style="font-size:11px">' + (_esc(t.isbn) || '—') + '</code></td>' +
      _tbHideCell(t) +
    '</tr>';
  }).join('');
  /* 🙈 인라인 onclick 을 쓰지 않는다 — 교재명에 따옴표가 들어가면 그 자리에서 깨진다.
     ⚠️ 이 표는 필터를 누를 때마다 통째로 다시 그려지므로 리스너도 매번 새로 단다(쌓이지 않는다). */
  tb.querySelectorAll('button.tb-hide-toggle').forEach(function(btn){
    btn.addEventListener('click', function(){ _tbToggleHide(btn); });
  });
}
/* ════════════════════════════════════════════════════════════════════
   🙈 (2026-09-07 사장님 지시) 관리자 교재 표의 «숨김» 칸
   ──────────────────────────────────────────────────────────────────
   [왜] 숨김은 2026-08-13 부터 /textbook-uploader.html 아래쪽에만 있었다.
        그 페이지를 모르면 찾을 길이 없어 「숨김 버튼이 어디 있냐」가 올라왔다.
        API 는 그대로 쓰고(정본이 둘이 되면 안 된다) 화면만 한 곳 더 붙인다.
   [무엇을 숨기나] 숨김의 단위는 «교재 묶음 이름»(= textbook_files 의 파일명 앞 [대괄호])이다.
        그래서 이 표의 행 중 **그 묶음 이름과 맞는 행에만** 버튼이 붙는다.
        ⛔ 안 맞는 행에 버튼을 만들지 않는다 — 눌러도 라이브러리에서 사라지는 것이 없어
           「눌렀는데 아무 일도 안 일어난다」가 된다. 대신 «—» 와 이유를 툴팁으로 적는다.
   ⛔ 이름이 대소문자만 다를 때는 «유일할 때만» 잇는다(후보가 둘이면 «모름») — 엉뚱한
      묶음을 숨기면 강사가 쓰는 교재가 통째로 사라진다.
   ⛔ «지우기» 는 만들지 않는다. 숨김/되살림뿐이고 파일·기록은 그대로다.
   ⚠️ 이 API 는 본사·관리자 전용이다(강사가 체크하면 전 강사의 교재가 사라지므로
      src/index.ts 가 강사를 막는다). 403 이면 «모름» 으로 두고 칸을 «—» 로 그린다 —
      조용히 «보임» 이라고 말하면 그것이 거짓말이 된다.
   ════════════════════════════════════════════════════════════════════ */
window._tbHideMap = null;    // { '묶음이름': { files, hidden } } · null = «모름»(권한 없음·조회 실패)
window._tbHideLower = null;  // 소문자 → 정본 이름 (후보가 둘이면 null)
window._tbHideErr = '';

async function _tbLoadHideMap() {
  window._tbHideMap = null; window._tbHideLower = null; window._tbHideErr = '';
  /* ⏱ 이 조회는 교재 표를 그리기 «전» 에 기다린다 — 응답이 매달리면 표 전체가 안 그려진다.
     숨김 칸은 곁가지이므로 6초를 넘기면 포기하고 «모름» 으로 두고 표는 그대로 그린다.
     ⚠️ AbortSignal.timeout 은 옛 브라우저에 없다 — AbortController + setTimeout 으로. */
  var ac = null, tid = 0;
  try { ac = new AbortController(); tid = setTimeout(function(){ try { ac.abort(); } catch (e) {} }, 6000); } catch (e) { ac = null; }
  try {
    var opt = { cache: 'no-store', credentials: 'include' };
    if (ac) opt.signal = ac.signal;
    var r = await fetch('/api/admin/textbook-hidden-books', opt);
    var d = await r.json().catch(function(){ return {}; });
    /* «성공이라고 말했는가» 로 판정한다 — 종단 404 본문에는 ok 칸이 없어
       `d.ok === false` 로 보면 그냥 통과한다(CLAUDE.md 2장). */
    if (d.ok !== true || !Array.isArray(d.books)) {
      window._tbHideErr = (r.status === 401 || r.status === 403) ? 'forbidden' : 'failed';
      return;
    }
    var map = {}, lower = {};
    d.books.forEach(function(b){
      var name = String(b && b.book == null ? '' : b.book).trim();
      if (!name) return;
      map[name] = { files: (b && b.files) || 0, hidden: !!(b && b.hidden) };
      var k = name.toLowerCase();
      lower[k] = Object.prototype.hasOwnProperty.call(lower, k) ? null : name;
    });
    window._tbHideMap = map; window._tbHideLower = lower;
  } catch (e) {
    window._tbHideErr = 'failed';
    console.warn('[ph240 hide] 숨김 목록 실패', e);
  } finally {
    if (tid) clearTimeout(tid);
  }
}

/* 이 행의 교재명이 «어느 묶음» 인가 — ① 정확일치 먼저 ② 없으면 대소문자만 다른 후보(유일할 때만) */
function _tbHideBookOf(title) {
  var map = window._tbHideMap; if (!map) return null;
  var name = String(title == null ? '' : title).trim();
  if (!name) return null;
  if (Object.prototype.hasOwnProperty.call(map, name)) return name;
  var uniq = window._tbHideLower ? window._tbHideLower[name.toLowerCase()] : null;
  return uniq || null;
}

function _tbHideCell(t) {
  var en = (window.adminLang === 'en');
  if (!window._tbHideMap) {
    var why = (window._tbHideErr === 'forbidden')
      ? (en ? 'Hiding is available to HQ/admin accounts only' : '숨김 설정은 본사·관리자 계정만 가능합니다')
      : (en ? 'Could not load the hide list' : '숨김 목록을 불러오지 못했습니다');
    return '<td style="text-align:center;color:#94a3b8" title="' + _esc(why) + '">—</td>';
  }
  var book = _tbHideBookOf(t.title);
  if (!book) {
    var none = en ? 'No files uploaded to the server under this name — nothing to hide'
                  : '이 이름으로 서버에 올라온 파일이 없어 숨길 대상이 없습니다';
    return '<td style="text-align:center;color:#94a3b8" title="' + _esc(none) + '">—</td>';
  }
  var hidden = !!(window._tbHideMap[book] && window._tbHideMap[book].hidden);
  var label = hidden ? (en ? '🙈 Hidden' : '🙈 숨김') : (en ? '👁 Shown' : '👁 보임');
  var tip = hidden
    ? (en ? 'Hidden from the teacher/student library — click to show it again'
          : '강사·학생 라이브러리에서 안 보입니다 — 누르면 다시 보입니다')
    : (en ? 'Visible in the library — click to hide it (files are kept)'
          : '라이브러리에 보입니다 — 누르면 숨깁니다 (파일은 지워지지 않습니다)');
  return '<td style="text-align:center;white-space:nowrap">'
    + '<button type="button" class="tb-hide-toggle' + (hidden ? ' tb-hide-on' : '') + '"'
    + ' data-book="' + _esc(book) + '" data-next="' + (hidden ? '0' : '1') + '"'
    + ' title="' + _esc(tip) + '">' + label + '</button></td>';
}

function _tbHideNote() {
  var note = document.getElementById('tb-hide-note');
  var cnt = document.getElementById('tb-hide-count');
  var map = window._tbHideMap;
  /* 목록을 못 받았으면 안내 줄을 감춘다 — 「버튼을 누르세요」라고 말해 놓고
     칸이 전부 «—» 이면 그것이 고장으로 읽힌다. */
  if (note) note.style.display = map ? '' : 'none';
  if (!cnt) return;
  if (!map) { cnt.textContent = ''; return; }
  var names = Object.keys(map);
  var n = 0;
  names.forEach(function(k){ if (map[k].hidden) n++; });
  cnt.textContent = (window.adminLang === 'en')
    ? ('· ' + names.length + ' groups · ' + n + ' hidden')
    : ('· 묶음 ' + names.length + '개 · 숨김 ' + n + '개');
}

async function _tbToggleHide(btn) {
  var en = (window.adminLang === 'en');
  var book = btn.getAttribute('data-book');
  var next = (btn.getAttribute('data-next') === '1');
  if (!book || !window._tbHideMap) return;
  btn.disabled = true;
  try {
    var r = await fetch('/api/admin/textbook-hidden-books', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book: book, hidden: next })
    });
    var d = await r.json().catch(function(){ return {}; });
    if (d.ok !== true) throw new Error((d && d.error) || ('HTTP ' + r.status));
    if (window._tbHideMap[book]) window._tbHideMap[book].hidden = next;
    _tbRenderRows(window._tbActiveFilter || '전체교재');   // 버튼·개수 줄을 함께 다시 그린다
  } catch (e) {
    /* 저장이 안 됐는데 «된 것처럼» 보이면 안 된다 — 화면을 한 칸도 안 바꾸고 사유를 말한다. */
    btn.disabled = false;
    alert((en ? 'Could not save. Please try again.\n' : '저장하지 못했습니다. 다시 시도해 주세요.\n') + ((e && e.message) || ''));
  }
}

/* 🌐 JS 로 그린 라벨이라 data-ko/data-en 루프가 못 고친다 — 언어가 바뀌면 다시 그린다.
   ⚠️ 관리자 화면의 그 이벤트는 document 에서 발행되고(CustomEvent 는 bubbles:false 라
      window 로 안 올라간다) 다른 화면은 window 에서 쏜다 — 둘 다 듣는다. */
(function _tbBindLangRedraw(){
  function redraw(){ if (window._tbItems) _tbRenderRows(window._tbActiveFilter || '전체교재'); }
  document.addEventListener('mangoi:lang-changed', redraw);
  window.addEventListener('mangoi:lang-changed', redraw);
})();

// fix (2026-06-01) — 이 PC(IndexedDB)의 교재 파일을 서버로 업로드 → 모든 기기/휴대폰에서 보이게
async function syncLocalTextbooksToServer() {
  var btn = document.getElementById('tb-sync-server-btn');
  var status = document.getElementById('tb-sync-status');
  function setStatus(t){ if (status) status.textContent = t; }
  if (btn) btn.disabled = true;
  setStatus('📂 이 PC 교재 읽는 중…');
  try {
    // 1) IndexedDB 교재·파일 읽기
    var data = await new Promise(function(resolve){
      var req = indexedDB.open('mangoi-textbooks', 3);
      req.onsuccess = function(){
        var db = req.result;
        if (!db.objectStoreNames.contains('textbooks') || !db.objectStoreNames.contains('files')) { db.close(); resolve({textbooks:[], files:{}}); return; }
        var tx = db.transaction(['textbooks','files'],'readonly');
        var tbR = tx.objectStore('textbooks').getAll();
        var flR = tx.objectStore('files').getAll();
        var tbs=null, fls=null;
        function chk(){ if (tbs===null||fls===null) return; var fm={}; fls.forEach(function(f){ fm[f.id]=f; }); db.close(); resolve({textbooks:tbs, files:fm}); }
        tbR.onsuccess=function(){ tbs=tbR.result||[]; chk(); }; tbR.onerror=function(){ tbs=[]; chk(); };
        flR.onsuccess=function(){ fls=flR.result||[]; chk(); }; flR.onerror=function(){ fls=[]; chk(); };
      };
      req.onerror=function(){ resolve({textbooks:[], files:{}}); };
      setTimeout(function(){ resolve({textbooks:[], files:{}}); }, 8000);
    });
    // 2) 서버 기존 파일 이름 (중복 업로드 방지)
    var existing = {};
    try {
      var er = await fetch('/api/admin/textbook-files?limit=1000', { credentials:'include', cache:'no-store' });
      var ed = await er.json().catch(function(){ return {}; });
      (ed.items||[]).forEach(function(it){ if (it && it.name) existing[it.name] = 1; });
    } catch(_){}
    // 3) 업로드 대상 수집 (pdf/이미지만, 서버에 없는 것만)
    var jobs = [];
    (data.textbooks||[]).forEach(function(t){
      (t.lessons||[]).forEach(function(l){
        (l.fileIds||[]).forEach(function(fid){
          var f = data.files[fid];
          if (!f || !f.blob) return;
          if (f.kind !== 'pdf' && f.kind !== 'image') return;
          var name = '[' + (t.textbook || '교재') + '] ' + (l.name || '미분류') + ' / ' + (f.name || fid);
          if (existing[name]) return;
          jobs.push({ blob:f.blob, name:name, fname:(f.name || 'file'), level:(t.level || '') });
        });
      });
    });
    if (jobs.length === 0) { setStatus('✅ 새로 올릴 교재 없음 — 이미 서버에 있거나, 업로드 가능한(PDF·이미지) 파일이 없습니다.'); if (btn) btn.disabled=false; return; }
    // 4) 순차 업로드
    var ok=0, fail=0;
    for (var i=0;i<jobs.length;i++){
      var j = jobs[i];
      setStatus('☁ 서버 업로드 중… ' + (i+1) + ' / ' + jobs.length + ' (' + Math.round((i+1)/jobs.length*100) + '%)');
      try {
        var fd = new FormData();
        fd.append('file', j.blob, j.fname);
        fd.append('name', j.name);
        if (j.level) fd.append('level', j.level);
        var rr = await fetch('/api/admin/textbook-files', { method:'POST', body:fd, credentials:'include' });
        if (rr.ok) ok++; else { fail++; if (rr.status===401) { setStatus('❌ 관리자 로그인이 필요합니다. 로그인 후 다시 시도하세요.'); break; } }
      } catch(e){ fail++; }
    }
    setStatus('✅ 완료: ' + ok + '개 서버 업로드' + (fail ? (' · 실패 ' + fail + '개') : '') + ' — 이제 휴대폰·다른 기기 화상수업 교재에서 보입니다.');
    if (typeof loadTextbooks === 'function') loadTextbooks();
  } catch(e) {
    setStatus('❌ 오류: ' + (e && e.message || e));
  } finally {
    if (btn) btn.disabled = false;
  }
}
window.syncLocalTextbooksToServer = syncLocalTextbooksToServer;

// fix (2026-06-01) — 🎥 수업 입장 (화상수업 방을 관리자 안에 임베드, 교사로 자동 입장)
window.openLiveClass = async function(){
  var sec = document.getElementById('card-live-class');
  if (!sec) return;
  var frame = document.getElementById('live-class-frame');
  var nameEl = document.getElementById('live-class-teacher-name');
  var ph = document.getElementById('live-class-placeholder');
  var tname = '교사', tuid = '';
  try {
    var r = await fetch('/api/admin/me', { credentials:'include' });
    var j = await r.json().catch(function(){ return null; });
    if (j && j.ok && j.user) { tname = j.user.name || j.user.username || '교사'; tuid = j.user.username || ''; }
  } catch(_){}
  if (nameEl) nameEl.textContent = tname;
  var displayName = '교사 ' + tname;
  // 🔧 (2026-07-24 실사고) 항상 공용방(mangoi-class) 고정 → 오늘 실제 예약 방으로 우선 매칭, 없으면 폴백.
  var room = 'mangoi-class';
  try {
    var qs = 'role=teacher';
    if (tuid) qs += '&user_id=' + encodeURIComponent(tuid);
    if (tname) qs += '&student_name=' + encodeURIComponent(tname);
    var sr = await fetch('/api/class/sessions/today?' + qs, { credentials:'include' });
    var sd = await sr.json().catch(function(){ return null; });
    var cur = sd && (sd.current || ((sd.sessions || []).filter(function(s){ return s.join_open; })[0]));
    if (cur && cur.room_id) room = cur.room_id;
  } catch(_){}
  // 🌟 (2026-07-05) vc_role=teacher 명시 — 실시간 칭찬 포인트에서 강사로 확정 인식(별 버튼 노출).
  var src = '/?vc_autojoin=1&vc_role=teacher&vc_room=' + encodeURIComponent(room) + '&vc_name=' + encodeURIComponent(displayName);
  sec.style.display = 'block';
  if (ph) ph.style.display = 'flex';
  if (frame) {
    frame.onload = function(){ if (ph) ph.style.display = 'none'; };
    frame.src = src;
  }
  if (typeof lcInitMaterials === 'function') lcInitMaterials();
  if (typeof lcLoadMaterials === 'function') lcLoadMaterials();
  setTimeout(function(){ try { sec.scrollIntoView({ behavior:'smooth', block:'start' }); } catch(_){} }, 80);
};
(function _bindLiveClassBtns(){
  function bind(){
    var rl = document.getElementById('live-class-reload');
    var cl = document.getElementById('live-class-close');
    var frame = document.getElementById('live-class-frame');
    if (rl && !rl._b){ rl._b = 1; rl.addEventListener('click', function(){ if (frame && frame.src && frame.src !== 'about:blank') { var s = frame.src; frame.src = 'about:blank'; setTimeout(function(){ frame.src = s; }, 60); } }); }
    if (cl && !cl._b){ cl._b = 1; cl.addEventListener('click', function(){ var sec = document.getElementById('card-live-class'); if (frame) frame.src = 'about:blank'; if (sec) sec.style.display = 'none'; }); }
    if (typeof lcInitMaterials === 'function') lcInitMaterials();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

// fix (2026-06-01) — 🎥 수업 입장 화면 안의 교재 업로드/다운로드 (서버 textbook-files 재사용)
function lcInitMaterials(){
  var dz = document.getElementById('lc-mat-dropzone');
  var inp = document.getElementById('lc-mat-input');
  var pick = document.getElementById('lc-mat-pick');
  if (!dz || !inp) return;
  if (pick && !pick._b){ pick._b = 1; pick.addEventListener('click', function(){ inp.click(); }); }
  if (!dz._b){
    dz._b = 1;
    dz.addEventListener('click', function(){ inp.click(); });
    inp.addEventListener('change', function(){ lcUploadMaterials(inp.files); inp.value = ''; });
    ['dragenter','dragover'].forEach(function(ev){ dz.addEventListener(ev, function(e){ e.preventDefault(); dz.style.background = 'rgba(37,99,235,0.18)'; dz.style.borderColor = '#60a5fa'; }); });
    ['dragleave','drop'].forEach(function(ev){ dz.addEventListener(ev, function(e){ e.preventDefault(); dz.style.background = 'rgba(37,99,235,0.05)'; dz.style.borderColor = '#3b5680'; }); });
    dz.addEventListener('drop', function(e){ if (e.dataTransfer) lcUploadMaterials(e.dataTransfer.files); });
  }
}

async function lcUploadMaterials(files){
  if (!files || !files.length) return;
  var prog = document.getElementById('lc-mat-progress');
  var ok = 0, fail = 0;
  if (prog) prog.style.display = 'block';
  for (var i = 0; i < files.length; i++){
    var f = files[i];
    if (prog) prog.textContent = (adminLang==='en'?'Uploading ':'업로드 중 ') + (i+1) + '/' + files.length + ' — ' + f.name;
    var form = new FormData();
    form.append('file', f);
    form.append('name', f.name);
    form.append('uploaded_by', (document.getElementById('live-class-teacher-name')||{}).textContent || '교사');
    try {
      var r = await fetch('/api/admin/textbook-files', { method:'POST', credentials:'include', body: form });
      var j = await r.json().catch(function(){ return {}; });
      if (r.ok && j.ok) ok++; else { fail++; console.warn('lc upload fail', f.name, j); }
    } catch(e){ fail++; console.error(e); }
  }
  if (prog){
    prog.innerHTML = (adminLang==='en'?'Done — ':'완료 — ') + '<b style="color:#34d399">'+ok+' OK</b>' + (fail?' / <b style="color:#f87171">'+fail+' FAIL</b>':'');
    setTimeout(function(){ prog.style.display = 'none'; }, 4000);
  }
  lcLoadMaterials();
}

async function lcLoadMaterials(){
  var grid = document.getElementById('lc-mat-list');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:14px;color:#64748b;font-size:12px">'+(adminLang==='en'?'Loading…':'불러오는 중…')+'</div>';
  try {
    var r = await fetch('/api/admin/textbook-files', { credentials:'include', cache:'no-store' });
    var d = await r.json().catch(function(){ return {}; });
    if (!d.ok || !d.items || !d.items.length){
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:18px;color:#64748b;font-size:12px">'+(adminLang==='en'?'No materials yet. Upload one above.':'아직 교재가 없습니다. 위에서 업로드하세요.')+'</div>';
      return;
    }
    grid.innerHTML = d.items.map(function(f){
      var dlName = (f.name||'file').replace(/"/g,'');
      var thumb = f.kind === 'pdf'
        ? '<div style="height:96px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1e293b,#0f172a);font-size:34px">📕</div>'
        : '<img src="'+f.url+'" loading="lazy" style="height:96px;width:100%;object-fit:cover;background:#0f172a" />';
      return '<div style="background:#0f1830;border:1px solid #1e3a5f;border-radius:9px;overflow:hidden;display:flex;flex-direction:column">'
        + thumb
        + '<div style="padding:8px;flex:1;display:flex;flex-direction:column;gap:3px">'
        +   '<div style="font-size:11.5px;font-weight:700;color:#e6ecff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+_esc(f.name)+'">'+_esc(f.name)+'</div>'
        +   '<div style="font-size:10px;color:#7c8db5">'+(f.kind==='pdf'?'PDF':'IMG')+' · '+_humanSize(f.size_bytes)+'</div>'
        + '</div>'
        + '<div style="display:flex;border-top:1px solid #1e3a5f">'
        +   '<button type="button" class="lc-mat-view" data-url="'+f.url+'" data-kind="'+f.kind+'" data-name="'+_esc(dlName)+'" style="flex:1;padding:7px;border:0;background:#16223e;color:#cbd5e1;cursor:pointer;font-size:11px" title="미리보기">👁 '+(adminLang==='en'?'View':'보기')+'</button>'
        +   '<a class="lc-mat-dl" href="'+f.url+'" download="'+_esc(dlName)+'" style="flex:1;padding:7px;border-left:1px solid #1e3a5f;background:#16223e;color:#86efac;text-decoration:none;text-align:center;font-size:11px" title="다운로드">⬇ '+(adminLang==='en'?'Download':'다운로드')+'</a>'
        + '</div>'
        + '</div>';
    }).join('');
    grid.querySelectorAll('.lc-mat-view').forEach(function(b){
      b.addEventListener('click', function(){ lcPreviewMaterial(b.getAttribute('data-url'), b.getAttribute('data-kind'), b.getAttribute('data-name')); });
    });
  } catch(e){
    console.error('lcLoadMaterials', e);
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:14px;color:#f87171;font-size:12px">'+(adminLang==='en'?'Failed to load.':'불러오기 실패')+'</div>';
  }
}

function lcPreviewMaterial(url, kind, name){
  var win = window.open('', '_blank');
  if (!win){ alert(adminLang==='en'?'Allow popup to preview':'팝업 허용이 필요합니다'); return; }
  if (kind === 'pdf'){
    win.location.href = url;
  } else {
    win.document.write('<!doctype html><html><head><title>'+_esc(name)+'</title><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh}</style></head><body><img src="'+url+'" /></body></html>');
    win.document.close();
  }
}
window.lcInitMaterials = lcInitMaterials;
window.lcLoadMaterials = lcLoadMaterials;

async function addTextbook() {
  const e = id => document.getElementById(id);
  const title = (e('tb-title').value||'').trim();
  if (!title) { alert(adminLang==='en'?'Title required':'교재명은 필수'); return; }
  const d = await _menuPost('/api/admin/textbooks', {
    title, level: e('tb-level').value||null,
    units: e('tb-units').value ? parseInt(e('tb-units').value,10) : null,
    publisher: e('tb-publisher').value||null, isbn: e('tb-isbn').value||null
  });
  if (d) { ['tb-title','tb-units','tb-publisher','tb-isbn'].forEach(id=>e(id).value=''); e('tb-level').value=''; loadTextbooks(); if(typeof refreshTextbookSelectInTbf==='function')refreshTextbookSelectInTbf(); }
}

// ═══════════════════════════════════════════════════════════════════════
// 🥭 Phase 39 — 교재 파일 라이브러리 (PDF/JPG/PNG)
// ═══════════════════════════════════════════════════════════════════════
function _humanSize(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return n + 'B';
  if (n < 1024*1024) return (n/1024).toFixed(1) + 'KB';
  return (n/1024/1024).toFixed(1) + 'MB';
}

async function refreshTextbookSelectInTbf() {
  try {
    const r = await fetch('/api/admin/textbooks', { credentials:'include', cache:'no-store' });
    const d = await r.json().catch(()=>({}));
    const sel = document.getElementById('tbf-textbook');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="" data-ko="교재 미지정" data-en="No textbook">' + (adminLang==='en'?'No textbook':'교재 미지정') + '</option>' +
      (d.items||[]).map(t => '<option value="'+t.id+'">'+_esc(t.title)+(t.level?' ['+t.level+']':'')+'</option>').join('');
    if (cur) sel.value = cur;
  } catch (e) { console.warn('refreshTextbookSelectInTbf failed', e); }
}

async function loadTextbookFiles() {
  const grid = document.getElementById('tbf-grid');
  if (!grid) return;
  const lv = document.getElementById('tbf-filter-level').value;
  const kd = document.getElementById('tbf-filter-kind').value;
  const q  = (document.getElementById('tbf-filter-q').value||'').trim();
  const qs = new URLSearchParams();
  if (lv) qs.set('level', lv);
  if (kd) qs.set('kind', kd);
  if (q)  qs.set('q', q);
  try {
    const r = await fetch('/api/admin/textbook-files?' + qs.toString(), { credentials:'include', cache:'no-store' });
    const d = await r.json().catch(()=>({}));
    if (!d.ok || !d.items || d.items.length === 0) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1;text-align:center;padding:24px;color:#94a3b8;">' +
        (adminLang==='en'?'No files yet.':'아직 업로드된 파일이 없습니다.') + '</div>';
      return;
    }
    grid.innerHTML = d.items.map(f => {
      const thumb = f.kind === 'pdf'
        ? '<div style="height:120px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#fee2e2,#fef3c7);color:#b91c1c;font-size:40px;">📕</div>'
        : '<img src="'+f.url+'" loading="lazy" style="height:120px;width:100%;object-fit:cover;background:#f1f5f9;" />';
      const lvl = f.level ? '<span style="display:inline-block;padding:1px 6px;background:#dbeafe;color:#1e40af;border-radius:99px;font-size:10px;font-weight:700;">'+f.level+'</span>' : '';
      const unit = f.unit_no ? '<span style="font-size:10px;color:#64748b;">U' + f.unit_no + '</span>' : '';
      return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;display:flex;flex-direction:column;">'
        + thumb
        + '<div style="padding:8px;flex:1;display:flex;flex-direction:column;gap:4px;">'
        +   '<div style="font-size:12px;font-weight:700;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="'+_esc(f.name)+'">'+_esc(f.name)+'</div>'
        +   '<div style="display:flex;gap:4px;align-items:center;">'+lvl+unit+'</div>'
        +   '<div style="font-size:10px;color:#94a3b8;">'+(f.kind==='pdf'?'PDF':'IMG')+' · '+_humanSize(f.size_bytes)+'</div>'
        + '</div>'
        + '<div style="display:flex;border-top:1px solid #f1f5f9;">'
        +   '<button class="tbf-preview" data-id="'+f.id+'" data-url="'+f.url+'" data-kind="'+f.kind+'" data-name="'+_esc(f.name)+'" style="flex:1;padding:6px;border:none;background:#f8fafc;cursor:pointer;font-size:11px;" title="미리보기">👁</button>'
        +   '<button class="tbf-edit"    data-id="'+f.id+'" style="flex:1;padding:6px;border:none;border-left:1px solid #f1f5f9;background:#f8fafc;cursor:pointer;font-size:11px;" title="편집">✏️</button>'
        +   '<button class="tbf-delete"  data-id="'+f.id+'" data-name="'+_esc(f.name)+'" style="flex:1;padding:6px;border:none;border-left:1px solid #f1f5f9;background:#fef2f2;color:#dc2626;cursor:pointer;font-size:11px;" title="삭제">🗑</button>'
        + '</div>'
        + '</div>';
    }).join('');
    grid.querySelectorAll('.tbf-preview').forEach(b => b.addEventListener('click', () => {
      tbfOpenPreview(b.getAttribute('data-url'), b.getAttribute('data-kind'), b.getAttribute('data-name'));
    }));
    grid.querySelectorAll('.tbf-edit').forEach(b => b.addEventListener('click', () => tbfEditFile(parseInt(b.getAttribute('data-id'),10))));
    grid.querySelectorAll('.tbf-delete').forEach(b => b.addEventListener('click', () => tbfDeleteFile(parseInt(b.getAttribute('data-id'),10), b.getAttribute('data-name'))));
  } catch (e) {
    console.error('loadTextbookFiles', e);
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1;color:#dc2626;">' + (adminLang==='en'?'Failed to load.':'불러오기 실패') + '</div>';
  }
}

function tbfOpenPreview(url, kind, name) {
  const win = window.open('', '_blank');
  if (!win) { alert(adminLang==='en'?'Allow popup to preview':'팝업 허용 필요'); return; }
  if (kind === 'pdf') {
    win.location.href = url;
  } else {
    win.document.write('<!doctype html><html><head><title>'+_esc(name)+'</title><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:100vh;}</style></head><body><img src="'+url+'" /></body></html>');
    win.document.close();
  }
}

async function tbfEditFile(id) {
  const newName = prompt(adminLang==='en'?'New display name (blank = skip):':'새 이름 (빈칸이면 건너뜀):');
  const newLevel = prompt(adminLang==='en'?'Level (A1/A2/B1/B2/C1/C2/blank):':'레벨 (A1~C2 또는 빈칸):');
  const newUnit = prompt(adminLang==='en'?'Unit number (blank = skip):':'단원 번호 (빈칸이면 건너뜀):');
  const body = {};
  if (newName && newName.trim())  body.name = newName.trim();
  if (newLevel !== null && newLevel !== '') body.level = newLevel.trim();
  if (newUnit !== null && newUnit !== '')   body.unit_no = parseInt(newUnit,10) || null;
  if (Object.keys(body).length === 0) return;
  const r = await fetch('/api/admin/textbook-files/'+id, {
    method:'PATCH', credentials:'include',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if (r.ok) loadTextbookFiles();
  else alert(adminLang==='en'?'Update failed':'수정 실패');
}

async function tbfDeleteFile(id, name) {
  if (!confirm((adminLang==='en'?'Delete "':'삭제할까요? "')+name+'"?')) return;
  const r = await fetch('/api/admin/textbook-files/'+id, { method:'DELETE', credentials:'include' });
  if (r.ok) loadTextbookFiles();
  else alert(adminLang==='en'?'Delete failed':'삭제 실패');
}

async function tbfUploadFiles(files) {
  if (!files || files.length === 0) return;
  const prog = document.getElementById('tbf-progress');
  const lv  = document.getElementById('tbf-level').value || '';
  const un  = document.getElementById('tbf-unit').value || '';
  const tbid= document.getElementById('tbf-textbook').value || '';
  const desc= document.getElementById('tbf-desc').value || '';
  let ok = 0, fail = 0;
  prog.style.display = 'block';
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    prog.textContent = (adminLang==='en'?'Uploading ':'업로드 중 ') + (i+1) + '/' + files.length + ' — ' + f.name;
    const form = new FormData();
    form.append('file', f);
    form.append('name', f.name);
    if (lv)   form.append('level', lv);
    if (un)   form.append('unit_no', un);
    if (tbid) form.append('textbook_id', tbid);
    if (desc) form.append('description', desc);
    try {
      const r = await fetch('/api/admin/textbook-files', { method:'POST', credentials:'include', body: form });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j.ok) ok++; else { fail++; console.warn('upload fail', f.name, j); }
    } catch (e) { fail++; console.error(e); }
  }
  prog.innerHTML = (adminLang==='en'?'Done — ':'완료 — ') + '<b style="color:#059669">'+ok+' OK</b>' + (fail?' / <b style="color:#dc2626">'+fail+' FAIL</b>':'');
  setTimeout(()=>{ prog.style.display='none'; }, 4000);
  document.getElementById('tbf-desc').value = '';
  loadTextbookFiles();
}

function _initTbfDropzone() {
  const dz = document.getElementById('tbf-dropzone');
  const inp = document.getElementById('tbf-file-input');
  if (!dz || !inp || dz._inited) return;
  dz._inited = true;
  dz.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => { tbfUploadFiles(inp.files); inp.value = ''; });
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.style.background='linear-gradient(135deg,#dbeafe,#e0f2fe)'; }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.style.background='linear-gradient(135deg,#eff6ff,#f0f9ff)'; }));
  dz.addEventListener('drop', e => { tbfUploadFiles(e.dataTransfer.files); });
}

document.addEventListener('DOMContentLoaded', () => {
  const sub = document.getElementById('sub-textbook-files');
  if (sub) {
    sub.addEventListener('toggle', () => {
      if (sub.open) { _initTbfDropzone(); refreshTextbookSelectInTbf(); loadTextbookFiles(); }
    });
  }
  const sub2 = document.getElementById('sub-mango-videos');
  if (sub2) {
    sub2.addEventListener('toggle', () => {
      if (sub2.open) { loadMangoVideos(); _initMvHandlers(); }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// 🥭 Phase 39 — 망고아이 비디오 관리
// ═══════════════════════════════════════════════════════════════════════
function _extractYoutubeId(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'v')) {
        return parts[1];
      }
    }
  } catch (e) {}
  if (/^[a-zA-Z0-9_-]{11}$/.test((raw||'').trim())) return raw.trim();
  return null;
}

function _initMvHandlers() {
  const urlIn = document.getElementById('mv-url');
  const prev = document.getElementById('mv-preview');
  const btn  = document.getElementById('mv-add-btn');
  if (!urlIn || urlIn._inited) return;
  urlIn._inited = true;
  urlIn.addEventListener('input', () => {
    const yid = _extractYoutubeId(urlIn.value);
    if (yid) {
      prev.style.display = 'block';
      prev.innerHTML = '<div style="display:flex;gap:10px;align-items:center;"><img src="https://img.youtube.com/vi/'+yid+'/default.jpg" style="width:80px;height:60px;object-fit:cover;border-radius:4px;" /><div><div style="font-weight:700;color:#0f172a;">YouTube ID: <code>'+yid+'</code></div><div style="font-size:11px;color:#64748b;">' + (adminLang==='en'?'Thumbnail auto-extracted':'썸네일 자동 추출됨') + '</div></div></div>';
    } else {
      prev.style.display = 'none';
    }
  });
  btn.addEventListener('click', addMangoVideo);
}

async function addMangoVideo() {
  const e = id => document.getElementById(id);
  const title = (e('mv-title').value||'').trim();
  const url   = (e('mv-url').value||'').trim();
  if (!title) { alert(adminLang==='en'?'Title required':'제목 필수'); return; }
  if (!url)   { alert(adminLang==='en'?'YouTube URL required':'YouTube URL 필수'); return; }
  if (!_extractYoutubeId(url)) { alert(adminLang==='en'?'Invalid YouTube URL':'올바른 YouTube URL 아님'); return; }
  const body = {
    title,
    title_en: e('mv-title-en').value || null,
    youtube_url: url,
    level: e('mv-level').value || null,
    lesson_no: e('mv-lesson').value ? parseInt(e('mv-lesson').value,10) : null,
    category: e('mv-category').value || null,
    duration_sec: e('mv-duration').value ? parseInt(e('mv-duration').value,10) : null,
    sort_order: e('mv-sort').value ? parseInt(e('mv-sort').value,10) : 0,
    description: e('mv-desc').value || null,
  };
  const r = await fetch('/api/admin/mango-videos', {
    method:'POST', credentials:'include',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  const j = await r.json().catch(()=>({}));
  if (r.ok && j.ok) {
    ['mv-title','mv-title-en','mv-url','mv-lesson','mv-duration','mv-desc'].forEach(id => e(id).value='');
    e('mv-level').value=''; e('mv-category').value=''; e('mv-sort').value='0';
    document.getElementById('mv-preview').style.display='none';
    loadMangoVideos();
  } else {
    alert((adminLang==='en'?'Failed: ':'실패: ') + (j.error || ('HTTP '+r.status)));
  }
}

async function loadMangoVideos() {
  const grid = document.getElementById('mv-grid');
  if (!grid) return;
  const lv = document.getElementById('mv-filter-level').value;
  const qs = lv ? '?level='+encodeURIComponent(lv) : '';
  try {
    const r = await fetch('/api/admin/mango-videos' + qs, { credentials:'include', cache:'no-store' });
    const d = await r.json().catch(()=>({}));
    if (!d.ok || !d.items || d.items.length === 0) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1;text-align:center;padding:24px;color:#94a3b8;">' +
        (adminLang==='en'?'No videos yet.':'아직 등록된 비디오가 없습니다.') + '</div>';
      return;
    }
    grid.innerHTML = d.items.map(v => {
      const inactive = v.active ? '' : 'opacity:0.5;';
      const lvl = v.level ? '<span style="display:inline-block;padding:1px 7px;background:#dbeafe;color:#1e40af;border-radius:99px;font-size:10px;font-weight:700;">'+v.level+'</span>' : '';
      const cat = v.category ? '<span style="display:inline-block;padding:1px 7px;background:#fef3c7;color:#92400e;border-radius:99px;font-size:10px;">'+_esc(v.category)+'</span>' : '';
      const lesson = v.lesson_no ? '<span style="font-size:10px;color:#64748b;">L' + v.lesson_no + '</span>' : '';
      const dur = v.duration_sec ? '<span style="font-size:10px;color:#64748b;">' + Math.floor(v.duration_sec/60) + ':' + String(v.duration_sec%60).padStart(2,'0') + '</span>' : '';
      return '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;'+inactive+'">'
        + '<div style="position:relative;">'
        +   '<img src="'+_esc(v.thumbnail_url||('https://img.youtube.com/vi/'+v.youtube_id+'/hqdefault.jpg'))+'" loading="lazy" style="width:100%;height:130px;object-fit:cover;" />'
        +   '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.25);opacity:0;transition:opacity .2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0"><span style="font-size:40px;">▶️</span></div>'
        + '</div>'
        + '<div style="padding:8px;display:flex;flex-direction:column;gap:4px;">'
        +   '<div style="font-size:13px;font-weight:700;color:#0f172a;line-height:1.3;">'+_esc(v.title)+'</div>'
        +   (v.title_en ? '<div style="font-size:11px;color:#475569;">'+_esc(v.title_en)+'</div>' : '')
        +   '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">'+lvl+cat+lesson+dur+'</div>'
        + '</div>'
        + '<div style="display:flex;border-top:1px solid #f1f5f9;">'
        +   '<button class="mv-play"   data-id="'+v.id+'" data-yid="'+v.youtube_id+'" style="flex:1;padding:6px;border:none;background:#f8fafc;cursor:pointer;font-size:11px;">▶ '+(adminLang==='en'?'Play':'재생')+'</button>'
        +   '<button class="mv-toggle" data-id="'+v.id+'" data-active="'+v.active+'" style="flex:1;padding:6px;border:none;border-left:1px solid #f1f5f9;background:#f8fafc;cursor:pointer;font-size:11px;">'+(v.active?(adminLang==='en'?'Disable':'비활성'):(adminLang==='en'?'Enable':'활성'))+'</button>'
        +   '<button class="mv-delete" data-id="'+v.id+'" data-title="'+_esc(v.title)+'" style="flex:1;padding:6px;border:none;border-left:1px solid #f1f5f9;background:#fef2f2;color:#dc2626;cursor:pointer;font-size:11px;">🗑</button>'
        + '</div>'
        + '</div>';
    }).join('');
    grid.querySelectorAll('.mv-play').forEach(b => b.addEventListener('click', () => mvPreview(b.getAttribute('data-yid'))));
    grid.querySelectorAll('.mv-toggle').forEach(b => b.addEventListener('click', () => mvToggleActive(parseInt(b.getAttribute('data-id'),10), b.getAttribute('data-active')==='1')));
    grid.querySelectorAll('.mv-delete').forEach(b => b.addEventListener('click', () => mvDelete(parseInt(b.getAttribute('data-id'),10), b.getAttribute('data-title'))));
  } catch (e) {
    console.error('loadMangoVideos', e);
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1;color:#dc2626;">' + (adminLang==='en'?'Failed to load.':'불러오기 실패') + '</div>';
  }
}

function mvPreview(youtubeId) {
  const w = window.open('https://www.youtube.com/watch?v=' + encodeURIComponent(youtubeId), '_blank');
  if (!w) alert(adminLang==='en'?'Allow popup':'팝업 허용 필요');
}

async function mvToggleActive(id, currActive) {
  await fetch('/api/admin/mango-videos/' + id, {
    method:'PATCH', credentials:'include',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ active: !currActive })
  });
  loadMangoVideos();
}

async function mvDelete(id, title) {
  if (!confirm((adminLang==='en'?'Delete "':'삭제할까요? "')+title+'"?')) return;
  await fetch('/api/admin/mango-videos/' + id, { method:'DELETE', credentials:'include' });
  loadMangoVideos();
}

// 🎯 발음교정 iframe 미리보기 토글
function togglePronPreview() {
  const el = document.getElementById('pron-preview');
  if (!el) return;
  el.style.display = (el.style.display === 'none' || !el.style.display) ? 'block' : 'none';
}

// 메뉴 카드 전체 펼치기/접기 — 자동으로 legacy 영역도 보이게 처리
function toggleAllMenuCards(open) {
  // legacy 영역이 숨겨져 있으면 펼칠 때 자동으로 보이게
  if (open) {
    const lc = document.getElementById('legacy-cards');
    if (lc && !lc.classList.contains('legacy-show')) lc.classList.add('legacy-show');
    syncLegacyToggleLabel();
  }
  document.querySelectorAll('details.menu-card').forEach(d => { d.open = !!open; });
}

// 🥭 Phase 14 — legacy-cards 보이기/숨기기 토글 (히어로 랜딩 ↔ 모든 메뉴)
function toggleLegacyCards() {
  const lc = document.getElementById('legacy-cards');
  if (!lc) return;
  lc.classList.toggle('legacy-show');
  syncLegacyToggleLabel();
  if (lc.classList.contains('legacy-show')) {
    // 펼침 — 부드럽게 스크롤
    setTimeout(() => lc.scrollIntoView({ behavior:'smooth', block:'start' }), 30);
  }
}
function syncLegacyToggleLabel() {
  const btn = document.getElementById('legacy-toggle');
  if (!btn) return;
  const lc = document.getElementById('legacy-cards');
  const showing = lc && lc.classList.contains('legacy-show');
  if (adminLang === 'en') {
    btn.textContent = showing ? '🙈 Hide all menus' : '📋 Show all menus';
  } else {
    btn.textContent = showing ? '🙈 메뉴 숨기기' : '📋 모든 메뉴 보기';
  }
  btn.classList.toggle('primary', !showing);
}
document.getElementById('legacy-toggle')?.addEventListener('click', toggleLegacyCards);

/* ════════════════════════════════════════════════════════════
   🎤 Phase 14i — Web Speech API 음성 검색
   - 마이크 버튼 클릭 → 듣기 시작 → 사운드 웨이브 애니메이션 (.listening)
   - 음성 인식 결과를 검색창에 입력 + input 이벤트 dispatch (자동완성 트리거)
   - 멈추면 (자동/수동) 애니메이션 중지
   - Korean / English 언어는 현재 페이지 lang (adminLang) 따름
════════════════════════════════════════════════════════════ */
(function setupVoiceSearch(){
  // ★ 2026-05-04 — Web Speech API 'network' 에러 우회를 위해
  //   MediaRecorder + Cloudflare Workers AI Whisper로 교체.
  const micBtn = document.getElementById('menu-search-mic');
  const inputEl = document.getElementById('menu-search');
  const hintEl  = document.getElementById('voice-hint');
  if (!micBtn || !inputEl) return;

  if (!navigator.mediaDevices || !window.MediaRecorder) {
    micBtn.style.display = 'none';
    console.info('[voice] MediaRecorder unsupported');
    return;
  }

  let mediaRecorder = null;
  let mediaStream = null;
  let recordedChunks = [];
  let stopTimer = null;
  let isListening = false;
  const MAX_SEC = 8;

  function bufToWav16k(audioBuffer) {
    const targetRate = 16000;
    const srcRate = audioBuffer.sampleRate;
    const srcLen = audioBuffer.length;
    const destLen = Math.floor(srcLen * targetRate / srcRate);
    const src = audioBuffer.getChannelData(0);
    const dest = new Float32Array(destLen);
    for (let i = 0; i < destLen; i++) {
      const idx = i * srcRate / targetRate;
      const lo = Math.floor(idx);
      const hi = Math.min(lo + 1, srcLen - 1);
      dest[i] = src[lo] * (1 - (idx - lo)) + src[hi] * (idx - lo);
    }
    const pcm = new Int16Array(destLen);
    for (let i = 0; i < destLen; i++) {
      const s = Math.max(-1, Math.min(1, dest[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const dataSize = pcm.length * 2;
    const buf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true);
    ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, targetRate, true);
    v.setUint32(28, targetRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, dataSize, true);
    new Int16Array(buf, 44).set(pcm);
    return new Blob([buf], { type: 'audio/wav' });
  }

  async function startListening() {
    if (isListening) return;
    isListening = true;
    micBtn.classList.add('listening');
    if (hintEl) hintEl.style.display = 'inline-block';
    inputEl.placeholder = (typeof adminLang !== 'undefined' && adminLang === 'en')
      ? '🎙 Listening... speak now' : '🎙 듣고 있습니다... 말씀해주세요';

    try {
      // 사용 가능한 마이크 목록 콘솔에 출력 (디버그)
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        console.log('[voice] 사용 가능 마이크:', mics.map(m => ({ id: m.deviceId.slice(0,8), label: m.label || '(권한 필요)' })));
      } catch {}
      const audioConstraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
      if (window._nextMicDeviceId) {
        audioConstraints.deviceId = { exact: window._nextMicDeviceId };
        console.log('[voice] 지정 마이크 사용:', window._nextMicDeviceId.slice(0, 12));
        window._nextMicDeviceId = null;
      }
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (e) {
      cleanup();
      restorePlaceholder();
      const name = e?.name || '';
      const msg = name === 'NotAllowedError' || name === 'PermissionDeniedError'
        ? '마이크 권한이 거부됐습니다. 주소창 좌측 자물쇠 아이콘에서 마이크 허용으로 바꿔 주세요.'
        : name === 'NotFoundError' ? '마이크 장치를 찾을 수 없습니다.'
        : '마이크 접근 실패: ' + (e?.message || name);
      alert(msg);
      return;
    }

    // 어떤 마이크가 실제 선택됐는지 디버그 출력
    try {
      const tracks = mediaStream.getAudioTracks();
      tracks.forEach(t => {
        const settings = t.getSettings ? t.getSettings() : {};
        console.log('[voice] ★ 선택된 마이크:', t.label || '(label 없음)',
                    'settings:', settings);
      });
    } catch (e) { console.warn('[voice] track info err:', e); }
    recordedChunks = [];
    let mimeType = '';
    for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
    }
    try {
      mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
    } catch (e) {
      cleanup();
      restorePlaceholder();
      alert('녹음 시작 실패: ' + (e?.message || e));
      return;
    }

    mediaRecorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data); };
    mediaRecorder.onstop = async () => {
      micBtn.classList.remove('listening');
      if (hintEl) hintEl.style.display = 'none';
      const origBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      cleanup();
      console.log('[voice] recorded:', origBlob.size, 'bytes');
      if (origBlob.size < 1500) {
        restorePlaceholder();
        alert('녹음이 너무 짧아요. 1초 이상 또렷이 말씀해 주세요.');
        return;
      }
      let wavBlob, audioRMS = 0, audioPeak = 0;
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await ctx.decodeAudioData(await origBlob.arrayBuffer());
        const ch = audioBuffer.getChannelData(0);
        let sumSq = 0;
        for (let i = 0; i < ch.length; i++) {
          sumSq += ch[i] * ch[i];
          if (Math.abs(ch[i]) > audioPeak) audioPeak = Math.abs(ch[i]);
        }
        audioRMS = Math.sqrt(sumSq / ch.length);
        console.log('[voice] RMS:', audioRMS.toFixed(4), 'Peak:', audioPeak.toFixed(4));
        if (audioRMS < 0.005) {
          ctx.close();
          restorePlaceholder();
          // ★ 자동 마이크 순회: 다른 마이크 시도 (admin.html)
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter(d => d.kind === 'audioinput' && d.deviceId);
            const tried = window._micTried || [];
            const usedDeviceId = (mediaRecorder && mediaRecorder.stream && mediaRecorder.stream.getAudioTracks()[0] && mediaRecorder.stream.getAudioTracks()[0].getSettings) ? mediaRecorder.stream.getAudioTracks()[0].getSettings().deviceId : '';
            tried.push(usedDeviceId);
            window._micTried = tried;
            const next = mics.find(m => !tried.includes(m.deviceId));
            if (next) {
              window._nextMicDeviceId = next.deviceId;
              const usedLabel = (mics.find(m => m.deviceId === usedDeviceId) || {}).label || '(알 수 없음)';
              const ok = confirm(
                '🚨 현재 마이크가 무음 상태 (RMS: ' + audioRMS.toFixed(4) + ')\n\n' +
                '다른 마이크로 자동 시도할까요?\n\n' +
                '방금 시도: ' + usedLabel + '\n' +
                '다음 시도: ' + (next.label || '(이름 없음)') + '\n\n' +
                '[확인] 다음 마이크로 즉시 재시도\n[취소] 중단'
              );
              if (ok) { setTimeout(function(){ micBtn.click(); }, 300); return; }
            } else {
              window._micTried = [];
              const list = mics.map(function(m, i){ return (i+1) + '. ' + (m.label || '(이름 없음)'); }).join('\n');
              alert(
                '🚨 모든 마이크 시도 완료, 모두 무음 상태\n\n' +
                '시도한 마이크 (' + mics.length + '개):\n' + list + '\n\n' +
                '[해결]\n' +
                '1. Win+I → 시스템 → 소리 → 입력 → 마이크 테스트\n' +
                '2. 마이크 속성 → 수준 100% + 부스트 +30dB\n' +
                '3. 마이크 향상 → 잡음 억제 OFF\n' +
                '4. 새 USB 마이크 연결\n\n' +
                '또는 검색창에 키보드로 직접 입력 (즉시 작동)'
              );
            }
          } catch (e) { console.warn('[voice] mic enumerate err:', e); }
          return;
        }
        let gain = 1;
        if (audioPeak < 0.95 && audioPeak > 0.0001) gain = Math.min(100, 0.7 / audioPeak);
        const boosted = ctx.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate);
        const bch = boosted.getChannelData(0);
        for (let i = 0; i < ch.length; i++) {
          let s = ch[i] * gain;
          bch[i] = s > 1 ? 1 : (s < -1 ? -1 : s);
        }
        wavBlob = bufToWav16k(boosted);
        console.log('[voice] WAV size:', wavBlob.size, 'bytes (gain', gain.toFixed(2) + 'x)');
        ctx.close();
      } catch (e) {
        console.error('[voice] WAV 변환 실패:', e);
        restorePlaceholder();
        alert('음성 변환 실패: ' + (e.message || e));
        return;
      }
      try {
        const fd = new FormData();
        fd.append('audio', wavBlob, 'voice.wav');
        fd.append('original', origBlob, 'voice.webm');
        fd.append('rms', String(audioRMS));
        fd.append('peak', String(audioPeak));
        // 라우트 수정(2026-06-20): '/api/student/voice' 는 서버에 없어 빈 응답→'Unexpected end of JSON input'.
        //   실제 동작하는 Whisper 엔드포인트 '/api/voice/transcribe' 로 호출.
        const r = await fetch('/api/voice/transcribe', { method: 'POST', body: fd, credentials: 'include' });
        // 방어 파싱: 빈 본문/HTML 응답이어도 JSON 파싱 예외로 죽지 않도록 text 먼저 읽고 안전 처리.
        const raw = await r.text();
        let d;
        try { d = raw ? JSON.parse(raw) : {}; } catch (_) { d = {}; }
        if (typeof d !== 'object' || d === null) d = {};
        if (d.text && d.ok === undefined) d.ok = true;
        console.log('[voice] response:', d);
        restorePlaceholder();
        if (!d.ok) {
          alert('음성 인식 실패\n\n' + (d.error || (r.ok ? '서버가 빈 응답을 보냈어요' : '서버 오류 ' + r.status)));
          return;
        }
        inputEl.value = d.text;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof askAI === 'function') {
          setTimeout(() => {
            if (typeof _searchCurrentHits !== 'undefined' && _searchCurrentHits.length === 0) {
              const dd = document.getElementById('menu-search-dropdown');
              if (dd) dd.classList.remove('show');
              askAI(d.text);
            }
          }, 250);
        }
      } catch (e) {
        console.error('[voice] fetch failed:', e);
        restorePlaceholder();
        alert('음성 전송 실패: ' + (e.message || e));
      }
    };
    mediaRecorder.onerror = (ev) => { console.error('[voice] recorder error:', ev); cleanup(); alert('녹음 오류 발생'); restorePlaceholder(); };

    mediaRecorder.start();
    stopTimer = setTimeout(() => { stopListening(); }, MAX_SEC * 1000);
  }

  function stopListening() {
    if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try { mediaRecorder.stop(); } catch {}
    }
    isListening = false;
  }

  function cleanup() {
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    mediaRecorder = null;
    isListening = false;
  }

  function restorePlaceholder() {
    micBtn.classList.remove('listening');
    if (hintEl) hintEl.style.display = 'none';
    inputEl.placeholder = (typeof adminLang !== 'undefined' && adminLang === 'en')
      ? 'Search anything — students, teachers, franchises, menus'
      : '통합 검색 — 학생·교사·가맹점·메뉴 무엇이든';
  }

  micBtn.addEventListener('click', () => {
    if (isListening) stopListening();
    else startListening();
  });
  inputEl.addEventListener('focus', () => {
    if (isListening && document.activeElement === inputEl) stopListening();
  });
})();

// 👨‍🎓 학생 목록 (학생관리 → 학생 목록) — 멀티 정렬 (최대 3개)
//   기본 클릭: 단일 정렬 (다른 정렬 모두 제거)
//   Shift+클릭: 다중 정렬 추가 (이미 있으면 방향 토글, 없으면 끝에 추가, 최대 3개)
//   다시 같은 컬럼 Shift+클릭으로 desc → asc → 제거 cycle
const SM_SORT_MAX = 3;
let _smStudents = [];                                       // 원본 데이터 캐시
/* 🗓️ (2026-08-25 사장님 지적) 기본 정렬이 「최근 가입일」이 되어야 하는데, 여기 적힌
   기본값은 예전부터 `last_seen`(최근 출석)이었다 — 그런데 지금 화면에는 `last_seen` 을
   가진 열 자체가 없다(th.sort-indicator 매칭 대상이 없어 화면에 활성 표시도 안 뜬다).
   그래서 클릭 한 번 없이 새로 불러오면 이 배열의 `last_seen` 이 값이 전부 비어(null) 있어
   비교가 전부 0이 되고, 결과적으로 서버가 준 순서(사실상 created_at desc)를 그대로 보여줬다
   — 「이름순」으로 보였던 것은 화면을 보던 사람이 그 전에 「학생명」 헤더를 눌러 둔 상태가
   남아 있었을 뿐, 코드가 정한 기본값은 아니었다. 어느 쪽이든 원하는 기본값(최근 가입일)과는
   달랐으므로 실제 표에 있는 열(가입일 = created_at)로 명시한다. */
let _smSort = [{ key: 'created_at', dir: 'desc' }];          // 정렬 배열 (우선순위 순)
let _smSearch = '';                                         // 🔍 검색어 (학생명·아이디)
let _smAgency = '';                                         // 🏫 대리점·학원 필터 (빈값 = 전체)
let _smCountBase = '';                                      // 전체 인원수 라벨 (검색 시 "N명 / 전체" 표시용)
/* ⚡ (2026-08-05 사장님 지적: "버벅거리고 자꾸 왔다갔다 움직인다") 안정화용 상태 4개.
   원인이 네 겹이었다 —
   ① 검색 한 글자마다 tbody 를 «불러오는 중…» 한 줄로 비웠다가 다시 채워서 표 높이가 위아래로 튐
   ② 요청 순서 보장이 없어 «정»→«정우»→«정우영» 중 늦게 온 옛 응답이 최신 결과를 덮어씀
   ③ 1000행 × 19열(19,000셀)을 매 입력마다 통째로 다시 그림
   ④ Neo4j 가 죽어 있으면 검색마다 502 를 기다린 뒤에야 D1 로 폴백 (지연 2배)
   → seq/abort 로 ②, quiet 로 ①, _smShown 청크로 ③ 을 각각 막는다.
      (④ 그래프DB 왕복은 2026-08-13 에 이 화면에서 아예 뺐다 — 아래 loadStudentList 주석 참고) */
let _smReqSeq = 0;                                          // 요청 일련번호 — 늦게 온 옛 응답 폐기용
let _smAbort = null;                                        // 진행 중 요청 취소 핸들
let _smShown = 0;                                           // 지금 그려둔 행 수 (스크롤 시 증가)
let _smRows = [];                                           // 필터·정렬이 끝난 현재 목록 (이어붙이기용)
let _smRowHtml = null;                                      // 한 행 HTML 생성기 (renderStudentTable 이 채움)
const SM_CHUNK = 200;                                       // 한 번에 그리는 행 수

/* 🏫 대리점·학원 드롭다운 채우기 (2026-07-23) — 불러온 학생들의 대리점명(shop_name)에서 자동 생성.
   서버가 이미 권한 범위로 걸러 보낸 _smStudents 만 쓰므로, 지사 계정엔 자기 대리점만 나온다. */
function smFillAgencyFilter() {
  const sel = document.getElementById('sm-agency-filter');
  if (!sel) return;
  const names = Array.from(new Set(
    _smStudents.map(s => String(s.shop_name || '').trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'ko'));
  window._smAgencyNames = names;                // 🔍 검색이 다시 그릴 수 있게 전체 목록 보관
  const keep = sel.value;                       // 목록 새로고침해도 고른 값 유지
  const head = sel.options[0] ? sel.options[0].outerHTML : '<option value="">🏫</option>';
  sel.innerHTML = head + names.map(n =>
    '<option value="' + _esc(n) + '">🏫 ' + _esc(n) + '</option>'
  ).join('');
  if (keep && names.indexOf(keep) >= 0) sel.value = keep; else { sel.value = ''; _smAgency = ''; }
  const q = document.getElementById('sm-agency-search');
  if (q && q.value.trim()) window.smAgencySearch();   // 검색어가 있으면 다시 좁혀 둔다
}
/* 🔍 (2026-07-27 강사 피드백 3차 #3) "학원이 수백 개가 되면 드롭다운을 눈으로 훑어야 한다 — 검색칸이 없다"
   → 입력한 글자로 드롭다운 목록을 좁힌다(서버 변경 없음, 이미 받아온 목록만 사용).
   후보가 1개면 자동 선택해 바로 필터가 걸리게 한다. */
window.smAgencySearch = function(){
  const sel = document.getElementById('sm-agency-filter');
  const box = document.getElementById('sm-agency-search');
  if (!sel || !box) return;
  const en = (window.adminLang && window.adminLang !== 'ko');
  const all = window._smAgencyNames || [];
  const q = box.value.trim().toLowerCase();
  const hit = q ? all.filter(n => n.toLowerCase().indexOf(q) >= 0) : all;
  const keep = sel.value;
  const head = '<option value="">' + (en ? '🏫 All Agencies/Academies' : '🏫 전체 대리점·학원') + '</option>';
  sel.innerHTML = head + hit.map(n => '<option value="' + _esc(n) + '">🏫 ' + _esc(n) + '</option>').join('');
  if (keep && hit.indexOf(keep) >= 0) sel.value = keep;
  else if (q && hit.length === 1) { sel.value = hit[0]; if (typeof sel.onchange === 'function') sel.onchange(); else sel.dispatchEvent(new Event('change')); }
  const cnt = document.getElementById('sm-agency-count');
  if (cnt) cnt.textContent = q ? (hit.length + (en ? ' found' : '개')) : '';
};

// 🔒 역할별 데이터 범위 판별 — 지사/대리점/교사/학부모/학생은 자기 범위만
function mangoiGetDataScope(){
  try {
    var role;
    // 🔐 (2026-07-14 사장님 지시) 역할 시뮬레이션(mangoi_user_role) 완전 폐지.
    //   이전엔 이 값을 실제 세션보다 '우선' 읽어, 대리점→경영진 재로그인 후에도 대리점
    //   화면이 뜨는 역할 드리프트 버그의 원인이었음. 이제 항상 실제 로그인 세션만 사용하고,
    //   남아있는 시뮬레이션 값은 즉시 제거해 드리프트를 원천 차단한다.
    try { localStorage.removeItem('mangoi_user_role'); } catch(_){}
    {
      var u=null; try{ u=JSON.parse(localStorage.getItem('admin_session')||'null'); }catch(_){}
      var U={hq_t_001:'teacher',hq_teacher:'teacher',hq_exec:'exec',hq_mgr:'mgr',admin:'exec',cfo01:'mgr',ops_lead:'mgr',branch_busan:'branch',branch_daegu:'branch',agency_gn001:'agency',agency_sc002:'agency',parent_001:'parent',student_001:'student'};
      role = u ? (U[u.uid]||'exec') : 'exec';
    }
    var saved={}; try{ saved=JSON.parse(localStorage.getItem('mangoi_scope_value')||'{}'); }catch(_){}
    var DEMO={
      branch: {field:'branch1_name', value: saved.branch  || '서울 대표지사'},
      agency: {field:'shop_name',    value: saved.agency  || '망고아이 강남 대리점'},
      teacher:{field:'teacher_phone',value: saved.teacher || '010-3333-2001'},
      parent: {field:'parent_phone', value: saved.parent  || ''},
      student:{field:'user_id',      value: saved.student || ''}
    };
    if (DEMO[role] && DEMO[role].value) return { role: role, field: DEMO[role].field, value: DEMO[role].value };
    return null; // 경영자·관리자·본사 = 전체
  } catch(e){ return null; }
}
window.mangoiGetDataScope = mangoiGetDataScope;
window.mangoiScopeQS = function(sep){ try{ var sc=mangoiGetDataScope(); if(!sc) return ''; return (sep||'&')+'scope_field='+encodeURIComponent(sc.field)+'&scope_value='+encodeURIComponent(sc.value); }catch(e){ return ''; } };

async function loadStudentList(q, opts) {
  // 🔍 (2026-07-25 강사 피드백) 이름으로 검색해도 안 나오던 버그:
  //   예전엔 서버에서 limit=1000 만 받아와 '클라이언트에서만' 필터했다. 학생이 29,000명이라
  //   1000명 밖의 학생(예: 이시우·정우영·어재선)은 목록에 없어 검색해도 안 나왔다.
  //   → 검색어(q)가 있으면 서버로 넘겨 전체 학생에서 korean_name·english_name·user_id 로 찾는다.
  // 🔴 (2026-08-05) 「🧮 불러오기」 버튼이 addEventListener 로 직결돼 있어 **클릭 이벤트 객체가
  //   그대로 q 로 들어왔다** → String(PointerEvent) = "[object PointerEvent]" 를 검색어로 서버에
  //   보내 LIKE '%[object PointerEvent]%' → 0건 → "아직 학생 데이터 없음". 즉 자동 펼침 때는
  //   29,000명 중 1000명이 뜨는데 버튼을 누르면 목록이 사라졌다. 여기서 이벤트를 방어한다.
  if (q && typeof q === 'object') q = '';
  const _qSrv = String(q || '').trim();
  const _qs = _qSrv ? ('&q=' + encodeURIComponent(_qSrv)) : '';
  const _L = adminLang === 'en';
  const tb = document.getElementById('sm-students-tbody');
  const cnt = document.getElementById('sm-students-count');
  if (!tb) return;
  // ⚡ 요청 일련번호 + 이전 요청 취소 — 늦게 도착한 옛 응답이 최신 목록을 덮어쓰지 못하게
  const _mySeq = ++_smReqSeq;
  try { if (_smAbort) _smAbort.abort(); } catch (_) {}
  const _ac = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  _smAbort = _ac;
  const _stale = () => _mySeq !== _smReqSeq;
  // 🩹 quiet = 검색 중 백그라운드 갱신. 표를 비우지 않는다(비우면 높이가 튀어 "왔다갔다" 보임).
  //   대신 인원수 라벨 옆에만 조용히 표시한다.
  const _quiet = !!(opts && opts.quiet) && _smStudents.length > 0;
  if (_quiet) { if (cnt) cnt.textContent = (_L ? '🔄 Searching…' : '🔄 전체에서 찾는 중…'); }
  else tb.innerHTML = '<tr><td colspan="19" class="empty">' + (_L?'Loading...':'불러오는 중...') + '</td></tr>';
  let seedStudents = [];
  let apiItems = [];
  let d = null;
  /* 🕸️❌ (2026-08-13) 이 화면은 이제 그래프DB(/api/admin/students/graph-list)를 **안 부른다.**
     예전엔 그것을 1차로 부르고 실패하면 D1(unified)로 폴백했다. 왜 뺐는지 —

     ① 지금 아무것도 안 준다. 운영 화면 라벨이 «D1» 로 나오고 콘솔에는 아무 로그도 없다.
        로그가 없다는 것은 오류(502·503)가 아니라 **`ok:true` + `students:[]`** 였다는 뜻이다
        (오류면 dg.error 를 찍는 가지로 갔다). 즉 Neo4j 는 살아서 정상 응답하는데
        `MATCH (s:Student)` 가 0건이다.
        ⚠️ 예전엔 있었다 — cafe24-sync 의 importCafe24Students 가 **같은** `MATCH (s:Student)` 로
           29,386명을 students_erp 에 넣었다(실측: created_at=CAFE24_STUDENT_SENTINEL 29,386행).
           그 뒤 그래프가 비워졌거나 다른 인스턴스를 보고 있다.

     ② 살아나도 이 표에는 **D1 보다 나쁘다.** 그래프 응답에는 이 표가 그리는 열 중
        «가입일(created_at) · 수강신청(enroll_package) · 세션수(sessions) · 최근방문(last_seen)»
        4개가 아예 없다. 그래프가 이기면 그 4열이 조용히 빈칸·0 으로 나온다.
        반대로 그래프만 주는 것(family·parent_name)은 이 표가 하나도 안 그린다.
        → 즉 이 화면에서는 그래프가 «느린 D1» 이 아니라 «데이터가 모자란 D1» 이다.

     ③ D1 은 실측 74ms 다(2026-08-13 #01 에서 183만 행 → 12.6만 행으로 줄임).
        앞에 왕복을 하나 더 두는 것 자체가 손해다.

     되살리려면 — 엔드포인트·Cypher·KV 캐시는 **그대로 살아 있다**(진단·다른 화면용).
     다만 그때는 «그래프를 먼저» 가 아니라 «D1 을 기본으로 두고 그래프가 더 주는 것만 덧대기» 로
     할 것. 안 그러면 ②의 4열이 다시 빈다. */
  if (_stale()) return;
  try {
    if (!d) {
      const _scope = (typeof mangoiGetDataScope==='function') ? mangoiGetDataScope() : null;
      const _su = '/api/admin/students/unified' + (_scope ? ('?scope_field='+encodeURIComponent(_scope.field)+'&scope_value='+encodeURIComponent(_scope.value)+_qs) : (_qSrv ? ('?q='+encodeURIComponent(_qSrv)) : ''));
      const r = await fetch(_su, { cache: 'no-store', credentials: 'include', signal: _ac ? _ac.signal : undefined });
      d = await r.json();
    }
    if (_stale()) return;
    if (window.PIIMask && d && typeof d.can_view_pii !== 'undefined') PIIMask.setCanView(d.can_view_pii);  // 🔒 PII 권한 반영
    const rows = (d && d.ok && Array.isArray(d.students)) ? d.students : (Array.isArray(d && d.items) ? d.items : []);
    apiItems = rows.map(s => ({
      user_id: s.user_id,
      username: s.name || s.username || s.user_id,
      role: '',
      payment_type: s.payment_type || '',
      signup_date: s.signup_date || '',
      end_date: s.end_date || '',
      summary: [s.grade, s.level].filter(Boolean).join(' '),
      schedule: s.classes_per_week ? ('주 ' + s.classes_per_week + '회') : '',
      created_at: s.created_at || null,
      classes_per_week: s.classes_per_week || '',
      points: Number(s.points || 0),
      enroll_req: s.enroll_package || '',
      student_phone: s.student_phone || '',
      parent_phone: s.parent_phone || '',
      teacher_phone: s.teacher_phone || '',
      shop_name: s.shop_name || '',
      hq_name: s.hq_name || '',
      branch1_name: s.branch1_name || '',
      branch2_name: s.branch2_name || '',
      franchise: s.franchise || '',
      status: s.status || '',
      sessions: Number(s.sessions || 0),
      first_seen: s.signup_date || s.created_at || null,
      last_seen: s.last_seen || null,
    }));
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // 최신 요청에 밀림 — 화면 손대지 않고 종료
  }
  if (_stale()) return;
  let merged = apiItems;
  // 🔐 RBAC 스코프 — 학생 목록은 **서버가 세션 기준으로 이미 격리**해서 준다:
  //   · unified: studentScopeWhere(대리점=shop_name, 지사=franchise LIKE …)
  //   · graph-list: 본사 전용(비본사는 403 → unified 폴백)
  //   과거의 클라 adminScopeFilter(merged,'students')는 branch_id/agency_id(숫자ID)로 걸렀는데,
  //   unified/graph 데이터엔 그 ID가 없고 franchise/shop_name(문자열)만 있어서 지사·대리점이 전부
  //   탈락 → 0명으로 나오는 버그였다(2026-07-18, branch_daegu 643→0). 서버 격리가 권위 소스이므로
  //   여기서 다시 거르지 않는다. (merged 는 이미 스코프된 rows)
  if (!merged.length) {
    // 🩹 백그라운드 검색이 0건이어도 이미 떠 있는 목록을 지우지 않는다.
    //   (지우면 "결과 있음 → 없음 → 있음" 으로 표가 깜빡이며 왔다갔다 한다)
    if (_quiet) { renderStudentTable(); return; }
    tb.innerHTML = '<tr><td colspan="19" class="empty">' + (_L?'No students yet':'아직 학생 데이터 없음') + '</td></tr>';
    return;
  }
  _smStudents = merged.map(s => ({
    ...s,
    session_count: Number(s.sessions || 0),
    _username_lc: String(s.username || s.user_id || '').toLowerCase()
  }));
  _smCountBase = (_L ? _smStudents.length + ' students' : _smStudents.length + '명')
    + ' · D1';   // 🕸️❌ (2026-08-13) 이 화면은 D1 만 쓴다 — 출처가 하나뿐이라 분기도 없앴다
  if (cnt) cnt.textContent = _smCountBase;
  try { smFillAgencyFilter(); } catch (_) {}   // 🏫 대리점·학원 드롭다운 채우기 (2026-07-23)
  renderStudentTable();
}

function openScheduleCalendar(uidEnc){
  const uid = decodeURIComponent(uidEnc);
  const st = (typeof _smStudents!=='undefined' ? _smStudents : (window._smStudents||[])).find(x=>String(x.user_id)===uid) || {};
  const name = st.username || uid;
  const cpw = parseInt(st.classes_per_week,10) || 0;
  const dayMap = {1:[3],2:[2,4],3:[1,3,5],4:[1,2,4,5],5:[1,2,3,4,5],6:[1,2,3,4,5,6]};
  const classDays = dayMap[cpw] || (cpw>=5?[1,2,3,4,5]:(cpw>0?[1,3,5]:[]));
  const WD=['일','월','화','수','목','금','토'];
  let view = new Date(); view.setDate(1);
  let ov = document.getElementById('sched-cal-overlay'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id='sched-cal-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.6);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  const box=document.createElement('div');
  box.style.cssText='background:#fff;border-radius:16px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.35);overflow:hidden';
  ov.appendChild(box); document.body.appendChild(ov);
  function render(){
    const y=view.getFullYear(), m=view.getMonth();
    const first=new Date(y,m,1).getDay(), days=new Date(y,m+1,0).getDate();
    const t=new Date(); t.setHours(0,0,0,0);
    let cells='';
    for(let i=0;i<first;i++) cells+='<div></div>';
    for(let d=1;d<=days;d++){
      const wd=new Date(y,m,d).getDay();
      const isClass=classDays.includes(wd);
      const isToday=(y===t.getFullYear()&&m===t.getMonth()&&d===t.getDate());
      const bg=isClass?'background:linear-gradient(135deg,#60a5fa,#3b82f6);color:#fff;font-weight:700':'color:#334155';
      const ring=isToday?'box-shadow:0 0 0 2px #f59e0b inset':'';
      cells+='<div style="aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:13px;border-radius:8px;'+bg+';'+ring+'">'+d+'</div>';
    }
    box.innerHTML=''
      +'<div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;padding:16px 20px">'
      +  '<div style="font-size:15px;font-weight:800">📅 '+_esc(name)+' 님 수업 스케줄</div>'
      +  '<div style="font-size:12px;opacity:0.85;margin-top:3px">'+(cpw?('주 '+cpw+'회 · '+classDays.map(w=>WD[w]).join('·')+'요일'):'등록된 주간 수업 횟수 없음')+'</div>'
      +'</div>'
      +'<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px">'
      +  '<button id="cal-prev" style="border:0;background:#eff6ff;color:#2563eb;width:34px;height:34px;border-radius:9px;cursor:pointer;font-size:18px">‹</button>'
      +  '<b style="font-size:14px;color:#1e293b">'+y+'년 '+(m+1)+'월</b>'
      +  '<button id="cal-next" style="border:0;background:#eff6ff;color:#2563eb;width:34px;height:34px;border-radius:9px;cursor:pointer;font-size:18px">›</button>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:0 16px 6px">'
      +  WD.map((w,i)=>'<div style="text-align:center;font-size:11px;font-weight:700;color:'+(i===0?'#dc2626':i===6?'#2563eb':'#64748b')+'">'+w+'</div>').join('')
      +'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:0 16px 12px">'+cells+'</div>'
      +'<div style="display:flex;align-items:center;gap:6px;padding:0 20px 12px;font-size:11px;color:#64748b">'
      +  '<span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#3b82f6"></span> 수업일'
      +  '<span style="display:inline-block;width:12px;height:12px;border-radius:3px;box-shadow:0 0 0 2px #f59e0b inset;margin-left:10px"></span> 오늘'
      +'</div>'
      +'<div style="padding:0 16px 16px"><button id="cal-close" style="width:100%;padding:11px;border:0;background:#1e293b;color:#fff;border-radius:11px;cursor:pointer;font-weight:700">닫기</button></div>';
    box.querySelector('#cal-prev').onclick=()=>{view.setMonth(view.getMonth()-1);render();};
    box.querySelector('#cal-next').onclick=()=>{view.setMonth(view.getMonth()+1);render();};
    box.querySelector('#cal-close').onclick=()=>ov.remove();
  }
  render();
}
window.openScheduleCalendar = openScheduleCalendar;

async function aiOpenAnalysis(uid, name){
  uid = String(uid||''); name = String(name||uid);
  let ov = document.getElementById('ai-analysis-overlay'); if (ov) ov.remove();
  ov = document.createElement('div'); ov.id='ai-analysis-overlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,0.65);backdrop-filter:blur(3px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  const box=document.createElement('div');
  box.style.cssText='background:#0f172a;border:1px solid #6366f1;border-radius:16px;max-width:560px;width:100%;max-height:85vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.5);color:#e2e8f0';
  ov.appendChild(box); document.body.appendChild(ov);
  const esc = v => String(v==null?'':v).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
  box.innerHTML = '<div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:16px 20px;border-radius:16px 16px 0 0">'
    +'<div style="font-size:16px;font-weight:800;color:#fff">\U0001F916 AI 학습 분석 — '+esc(name)+'</div>'
    +'<div style="font-size:12px;color:#e0e7ff;margin-top:2px">Llama 3.3 70B · 최근 60일 데이터 기반</div></div>'
    +'<div id="ai-an-body" style="padding:20px"><div style="text-align:center;color:#a5b4fc;padding:30px">\U0001F916 AI가 분석 중입니다… (10~20초)</div></div>';
  let data;
  try {
    const r = await fetch('/api/admin/ai-analyze/student', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ student_uid: uid, student_name: name }) });
    data = await r.json();
  } catch(e) { data = { ok:false, error: String(e&&e.message||e) }; }
  const body = box.querySelector('#ai-an-body');
  if (!data || !data.ok) {
    const msg = (data && (data.message||data.error)) || '알 수 없는 오류';
    body.innerHTML = '<div style="color:#fca5a5;padding:14px;background:rgba(239,68,68,0.1);border:1px solid #ef4444;border-radius:10px">⚠️ AI 분석 실패: '+esc(msg)+'</div>'
      +'<div style="margin-top:12px;text-align:center"><button onclick="document.getElementById(\'ai-analysis-overlay\').remove()" style="padding:10px 20px;background:#334155;color:#fff;border:0;border-radius:8px;cursor:pointer">닫기</button></div>';
    return;
  }
  const a = data.analysis || {};
  const list = v => { const arr = Array.isArray(v)?v:String(v||'').split('|').map(x=>x.trim()).filter(Boolean); return arr.length? '<ul style="margin:6px 0 0;padding-left:18px;line-height:1.7">'+arr.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'<div style="color:#64748b">—</div>'; };
  const risk = (a.risk_level||'unknown');
  const riskColor = risk==='high'?'#ef4444':risk==='medium'?'#f59e0b':risk==='low'?'#10b981':'#64748b';
  const riskLabel = risk==='high'?'⚠️ 높음':risk==='medium'?'주의':risk==='low'?'✅ 양호':'—';
  const ds = a.data_sources||{};
  body.innerHTML = ''
    +'<div style="background:rgba(99,102,241,0.12);border:1px solid #6366f1;border-radius:10px;padding:14px;margin-bottom:14px"><div style="font-size:11px;color:#a5b4fc;font-weight:700;margin-bottom:4px">\U0001F4CB 요약</div><div style="font-size:13.5px;line-height:1.6">'+esc(a.summary)+'</div></div>'
    +'<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
    +'<div style="flex:1;min-width:120px;background:#1e293b;border-radius:8px;padding:10px"><div style="font-size:11px;color:#94a3b8">위험도</div><div style="font-weight:800;color:'+riskColor+';font-size:15px">'+riskLabel+'</div></div>'
    +'<div style="flex:2;min-width:160px;background:#1e293b;border-radius:8px;padding:10px"><div style="font-size:11px;color:#94a3b8">데이터</div><div style="font-size:12px;color:#cbd5e1">출석 '+(ds.attendance_count||0)+' · 평가 '+(ds.eval_count||0)+' · 채팅 '+(ds.chat_messages||0)+' · 적립 '+(ds.point_earned||0)+'P</div></div></div>'
    +'<div style="margin-bottom:12px"><div style="font-size:12px;color:#34d399;font-weight:700">\U0001F4AA 강점</div>'+list(a.strengths)+'</div>'
    +'<div style="margin-bottom:12px"><div style="font-size:12px;color:#fbbf24;font-weight:700">\U0001F4CC 보완점</div>'+list(a.weaknesses)+'</div>'
    +'<div style="margin-bottom:12px"><div style="font-size:12px;color:#60a5fa;font-weight:700">\U0001F3AF 추천 학습</div>'+list(a.recommendations)+'</div>'
    +(a.next_action?'<div style="background:rgba(16,185,129,0.1);border-left:3px solid #10b981;padding:10px 12px;border-radius:6px;margin-bottom:12px"><div style="font-size:11px;color:#6ee7b7;font-weight:700">다음 수업 우선순위</div><div style="font-size:13px">'+esc(a.next_action)+'</div></div>':'')
    +'<div style="text-align:center;margin-top:8px"><button onclick="document.getElementById(\'ai-analysis-overlay\').remove()" style="padding:10px 24px;background:#6366f1;color:#fff;border:0;border-radius:8px;cursor:pointer;font-weight:700">닫기</button></div>';
}
window.aiOpenAnalysis = aiOpenAnalysis;

function renderStudentTable() {
  const _L = adminLang === 'en';
  const tb = document.getElementById('sm-students-tbody');
  if (!tb || !_smStudents.length) return;

  // 🔍 검색 필터 — 학생명·아이디·학원명·지사명 부분일치 (대소문자 무시)
  //    (2026-08-12 수정요청 #02) 가맹점(학원)명으로도 걸리게 넓혔다 — 서버 unified 검색과 같은 폭.
  const _q = String(_smSearch || '').trim().toLowerCase();
  // 🏫 대리점·학원 필터 (2026-07-23) — 검색어와 함께 걸린다(AND)
  const _ag = String(_smAgency || '').trim();
  let _filtered = _smStudents;
  if (_q) _filtered = _filtered.filter(s => s._username_lc.indexOf(_q) >= 0 || String(s.user_id || '').toLowerCase().indexOf(_q) >= 0
    || String(s.shop_name || '').toLowerCase().indexOf(_q) >= 0 || String(s.franchise || '').toLowerCase().indexOf(_q) >= 0);
  if (_ag) _filtered = _filtered.filter(s => String(s.shop_name || '').trim() === _ag);

  // 인원수 라벨 — 검색·필터 중이면 "N명 / 전체" 로 표시
  const _cntEl = document.getElementById('sm-students-count');
  if (_cntEl && _smCountBase) {
    _cntEl.textContent = (_q || _ag)
      ? (_L ? ('🔍 ' + _filtered.length + ' found / ' + _smCountBase) : ('🔍 ' + _filtered.length + '명 / 전체 ' + _smCountBase))
      : _smCountBase;
  }

  if (!_filtered.length) {
    const _why = _ag && !_q ? (_L ? 'No students in “' + _esc(_ag) + '”' : '“' + _esc(_ag) + '” 소속 학생이 없습니다')
                            : (_L ? 'No matching students' : '검색 결과가 없습니다 — “' + _esc(_q) + '”');
    tb.innerHTML = '<tr><td colspan="19" class="empty">' + _why + '</td></tr>';
    return;
  }

  // 멀티 정렬 (최대 3개) — _smSort 배열 우선순위 순으로 cascade 비교
  const arr = _filtered.slice().sort((a, b) => {
    for (const s of _smSort) {
      const sortKey = s.key === 'username' ? '_username_lc' : s.key;
      const va = a[sortKey] != null ? a[sortKey] : '';
      const vb = b[sortKey] != null ? b[sortKey] : '';
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  });

  // 헤더 정렬 인디케이터 갱신 (우선순위 번호 + ▲▼)
  const tbl = document.getElementById('sm-students-table');
  if (tbl) {
    tbl.querySelectorAll('th.sortable').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      // sort-indicator span 보장 (없으면 추가)
      let ind = th.querySelector('.sort-indicator');
      if (!ind) { ind = document.createElement('span'); ind.className = 'sort-indicator'; th.appendChild(ind); }
      ind.innerHTML = '';
      const idx = _smSort.findIndex(s => s.key === th.dataset.sortKey);
      if (idx >= 0) {
        th.classList.add('sort-' + _smSort[idx].dir);
        // 멀티 정렬 시 우선순위 번호 (1·2·3) 표시
        if (_smSort.length > 1) {
          const rank = document.createElement('span');
          rank.className = 'sort-rank';
          rank.textContent = String(idx + 1);
          ind.appendChild(rank);
        }
      }
    });
  }

  // 날짜를 2줄 (날짜 + 시각) 로 분리하는 헬퍼
  const splitDt = (ts) => {
    if (!ts) return '<span class="date-line"><span class="date-d">—</span></span>';
    const d = new Date(ts);
    const pad = n => String(n).padStart(2,'0');
    const dPart = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
    const tPart = pad(d.getHours()) + ':' + pad(d.getMinutes());
    return `<span class="date-line"><span class="date-d">${dPart}</span><br><span class="date-t">${tPart}</span></span>`;
  };

  const _c = v => { const x = _esc(v == null ? '' : v); return x || '—'; };
  const _d = v => v ? _esc(String(v).slice(0,10)) : '—';
  // 🔤 열 너비를 고정(table-layout:fixed)했으므로 넘치는 값은 …으로 잘린다 → 원문을 title 로 붙여 둔다.
  const _ct = v => { const x = _esc(v == null ? '' : v); return x ? `<td title="${x}">${x}</td>` : '<td>—</td>'; };
  _smRowHtml = (s) => {
    const uid = String(s.user_id || '');
    const uidEnc = encodeURIComponent(uid);
    const safeUid  = _esc(uid);
    const safeName = _esc(s.username || uid);
    return `<tr>
      <td title="${safeUid}"><code>${safeUid}</code></td>
      <td title="${safeName}"><b>${safeName}</b></td>
      <td style="text-align:center"><a href="/admin/student?uid=${uidEnc}" target="_blank">🎓 ${_L?'Details':'상세'}</a></td>
      <td>${_c(s.payment_type)}</td>
      <td>${_d(s.signup_date)}</td>
      <td>${_d(s.end_date)}</td>
      ${_ct(s.summary)}
      <td>${splitDt(s.created_at)}</td>
      <td style="text-align:right">${_c(s.classes_per_week)}</td>
      <td style="text-align:right">${(Number(s.points)||0).toLocaleString()}</td>
      ${_ct(s.enroll_req)}
      <td>${_c(_piiPhone(s.student_phone))}</td>
      <td>${_c(_piiPhone(s.parent_phone))}</td>
      <td>${_c(_piiPhone(s.teacher_phone))}</td>
      ${_ct(s.shop_name)}
      ${_ct(s.hq_name)}
      ${_ct(s.branch2_name)}
      <td style="text-align:right"><span class="sess-count">${(s.session_count||0).toLocaleString()}</span></td>
      <td>${_c(s.status)}</td>
    </tr>`;
  };

  /* ⚡ (2026-08-05) 1000행 × 19열 = 19,000 셀을 매 입력마다 통째로 그려서 버벅였다.
     → 처음 200행만 그리고, 표를 아래로 굴리면 200행씩 이어 붙인다.
       정렬·검색·CSV 는 전체(arr)를 그대로 쓰므로 «보이는 것»과 «내려받는 것»은 종전과 동일. */
  _smRows = arr;
  _smShown = Math.min(SM_CHUNK, arr.length);
  // 가로/세로 스크롤 위치 보존 — 다시 그릴 때마다 맨 위·맨 왼쪽으로 튀지 않게
  const wrap = document.getElementById('sm-students-wrap');
  const keepTop = wrap ? wrap.scrollTop : 0, keepLeft = wrap ? wrap.scrollLeft : 0;
  tb.innerHTML = arr.slice(0, _smShown).map(_smRowHtml).join('') + _smMoreRow(_L);
  if (wrap) { wrap.scrollTop = keepTop; wrap.scrollLeft = keepLeft; }
}

/* 남은 행 안내 줄 — 스크롤로 자동 추가되지만, 안 굴려도 몇 명이 더 있는지 보이게 한다. */
function _smMoreRow(_L) {
  const left = _smRows.length - _smShown;
  if (left <= 0) return '';
  return '<tr id="sm-more-row"><td colspan="19" class="empty" style="cursor:pointer" onclick="smAppendRows()">'
       + (_L ? ('▾ ' + left.toLocaleString() + ' more — scroll or click') : ('▾ ' + left.toLocaleString() + '명 더 있습니다 — 아래로 굴리거나 눌러서 더 보기'))
       + '</td></tr>';
}
/* 다음 200행 이어 붙이기 — 이미 그려진 행은 손대지 않아 화면이 흔들리지 않는다. */
function smAppendRows() {
  const tb = document.getElementById('sm-students-tbody');
  if (!tb || _smShown >= _smRows.length) return;
  const _L = adminLang === 'en';
  const next = _smRows.slice(_smShown, _smShown + SM_CHUNK);
  _smShown += next.length;
  const more = document.getElementById('sm-more-row');
  if (more) more.remove();
  tb.insertAdjacentHTML('beforeend', next.map(_smRowHtml).join('') + _smMoreRow(_L));
}
window.smAppendRows = smAppendRows;

// 📥 (2026-07-18) 학생 목록 CSV 내보내기 — 화면에 보이는 것과 100% 동일(스코프+검색 필터+정렬 그대로).
//   ⚠️ PII 마스킹도 테이블과 똑같이 _piiPhone 을 거쳐, 마스킹된 전화번호가 CSV 로 새지 않게 한다.
//   서버가 이미 지사/대리점을 격리한 _smStudents 만 다루므로, 대리점이 눌러도 자기 학생만 내려받는다.
function smExportStudentsCsv() {
  const _L = adminLang === 'en';
  if (!_smStudents || !_smStudents.length) { alert(_L ? 'Load the student list first.' : '먼저 “불러오기”로 학생 목록을 불러오세요.'); return; }
  const _q = String(_smSearch || '').trim().toLowerCase();
  const _ag = String(_smAgency || '').trim();   // 🏫 화면과 같은 대리점 필터 적용 (2026-07-23)
  let _pre = _smStudents;
  if (_q) _pre = _pre.filter(s => s._username_lc.indexOf(_q) >= 0 || String(s.user_id || '').toLowerCase().indexOf(_q) >= 0);
  if (_ag) _pre = _pre.filter(s => String(s.shop_name || '').trim() === _ag);
  const rows = _pre.slice().sort((a, b) => {
      for (const so of _smSort) {
        const k = so.key === 'username' ? '_username_lc' : so.key;
        const va = a[k] != null ? a[k] : '', vb = b[k] != null ? b[k] : '';
        const cmp = (typeof va === 'number' && typeof vb === 'number') ? (va - vb) : String(va).localeCompare(String(vb));
        if (cmp !== 0) return so.dir === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  if (!rows.length) { alert(_L ? 'No students to export.' : '내보낼 학생이 없습니다.'); return; }
  const _date = v => v ? String(v).slice(0, 10) : '';
  const cols = [
    ['아이디',        s => s.user_id],
    ['학생명',        s => s.username || s.user_id],
    ['결제타입',      s => s.payment_type],
    ['수강시작일',    s => _date(s.signup_date)],
    ['수강종료일',    s => _date(s.end_date)],
    ['요약',          s => s.summary],
    ['가입일',        s => _date(s.created_at)],
    ['수업회수(주)',  s => s.classes_per_week],
    ['포인트',        s => Number(s.points) || 0],
    ['수강신청',      s => s.enroll_req],
    ['학생번호',      s => _piiPhone(s.student_phone)],
    ['부모님번호',    s => _piiPhone(s.parent_phone)],
    ['대리점연락처',  s => _piiPhone(s.teacher_phone)],
    ['대리점명',      s => s.shop_name],
    ['본사명',        s => s.hq_name],
    ['지사명',        s => s.branch2_name],
    ['세션수',        s => s.session_count || 0],
    ['상태',          s => s.status],
  ];
  const cell = v => { let x = (v == null ? '' : String(v)); return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
  const out = [cols.map(c => cell(c[0])).join(',')];
  for (const s of rows) out.push(cols.map(c => cell(c[1](s))).join(','));
  const csv = '﻿' + out.join('\r\n');   // UTF-8 BOM → Excel 에서 한글 안 깨짐
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const stamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes());
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'mangoi_students_' + stamp + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 150);
}
window.smExportStudentsCsv = smExportStudentsCsv;

// 헤더 클릭 → 정렬 토글 (위임). Shift+클릭으로 멀티 정렬 (최대 3개).
document.addEventListener('click', (ev) => {
  const th = ev.target.closest('#sm-students-table th.sortable');
  if (!th) return;
  const key = th.dataset.sortKey;
  if (!key) return;

  const defaultDir = th.dataset.sortDefaultDir || 'asc';
  const idx = _smSort.findIndex(s => s.key === key);

  if (ev.shiftKey) {
    // ─── 멀티 정렬 모드 (Shift+클릭) ───
    if (idx >= 0) {
      // 이미 있는 컬럼: asc → desc → 제거 cycle
      const cur = _smSort[idx];
      if (cur.dir === defaultDir) {
        cur.dir = (defaultDir === 'asc' ? 'desc' : 'asc');
      } else {
        _smSort.splice(idx, 1);   // 두 번째 토글 후 제거
        if (_smSort.length === 0) _smSort.push({ key, dir: defaultDir });   // 모두 비면 기본 복원
      }
    } else {
      // 새 컬럼 추가 (최대 3개)
      if (_smSort.length >= SM_SORT_MAX) {
        _smSort.shift();   // 가장 오래된 정렬 제거 (FIFO)
      }
      _smSort.push({ key, dir: defaultDir });
    }
  } else {
    // ─── 단일 정렬 모드 (일반 클릭) ───
    if (idx === 0 && _smSort.length === 1) {
      // 같은 컬럼 단일 정렬 중 → 방향 토글
      _smSort[0].dir = (_smSort[0].dir === 'asc' ? 'desc' : 'asc');
    } else {
      // 새 컬럼 → 단일 정렬로 리셋
      _smSort = [{ key, dir: defaultDir }];
    }
  }
  renderStudentTable();
});

// 학생 목록 로드 버튼 + 첫 펼침 시 자동 로드
(function bindStudentList(){
  const btn = document.getElementById('sm-load-students');
  // 🔴 (2026-08-05) 예전엔 loadStudentList 를 그대로 넘겨 **클릭 이벤트가 검색어로 들어갔다**
  //   → q="[object PointerEvent]" 로 서버 조회 → 0건 → 버튼을 누르면 목록이 사라지던 버그.
  if (btn) btn.addEventListener('click', () => loadStudentList(String(
    (document.getElementById('sm-student-search') || {}).value || '').trim()));
  // 📥 CSV 다운로드 — 화면에 보이는(스코프+검색+정렬) 학생만, PII 마스킹 유지
  const xb = document.getElementById('sm-export-csv');
  if (xb) xb.addEventListener('click', smExportStudentsCsv);
  // 🔍 학생명·아이디 검색 — 입력 즉시 필터링
  const sr = document.getElementById('sm-student-search');
  let _smSearchTimer = null;
  if (sr) sr.addEventListener('input', () => {
    _smSearch = sr.value;
    renderStudentTable();                       // 즉시: 이미 불러온 목록에서 필터(빠른 반응)
    // 🔍 2글자 이상이면 서버로도 질의 — 로드 안 된 학생(1000명 밖)까지 전체에서 찾는다.
    //   ⚡ quiet:true — 표를 비우지 않고 조용히 갱신한다(비우면 높이가 튀어 "왔다갔다" 보임).
    //   디바운스 350→500ms: 타자 중간에 나가는 요청 수를 줄여 결과가 여러 번 뒤바뀌지 않게.
    clearTimeout(_smSearchTimer);
    const q = String(sr.value || '').trim();
    _smSearchTimer = setTimeout(() => { loadStudentList(q.length >= 2 ? q : '', { quiet: true }); }, 500);
  });
  // ⬇️ 표를 아래로 굴리면 다음 200행 이어 붙이기 (첫 렌더는 200행만 — 1000행 통짜 렌더가 버벅임의 원인)
  const wrap = document.getElementById('sm-students-wrap');
  if (wrap) wrap.addEventListener('scroll', () => {
    if (wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 240) smAppendRows();
  }, { passive: true });
  // 🏫 대리점·학원 필터 — 선택 즉시 필터링 (2026-07-23)
  const af = document.getElementById('sm-agency-filter');
  if (af) af.addEventListener('change', () => { _smAgency = af.value; renderStudentTable(); });
  // 학생 목록 sub-item 이 펼쳐질 때 첫 1회 자동 로드 (lazy)
  let loaded = false;
  document.querySelectorAll('details.sub-item').forEach(d => {
    const sumSpan = d.querySelector('summary');
    if (sumSpan && (sumSpan.textContent.trim().startsWith('학생 목록') || sumSpan.textContent.trim().startsWith('Student List'))) {
      d.addEventListener('toggle', () => {
        if (d.open && !loaded) { loaded = true; loadStudentList(); }
      });
    }
  });
})();

/* ➕ 학생 등록 모달 — 서버에 «진짜로» 만든다 (POST /api/admin/students/create).
   CLAUDE.md 「직원을 등록했는데 로그인이 안 돼요」의 «시연 껍데기»(localStorage 에만 넣고
   알림만 띄우던 것)와 같은 사고를 피하려고, staff-create/registerHqEmployee 와 같은 패턴을 쓴다.
   비밀번호를 직접 입력할 수도 있고(2026-08-25 사장님 요청), 비워두면 예전처럼 서버가 임시
   비밀번호를 만들어 이 화면에서 한 번만 보여 준다 — 어디에도 저장하지 않는다. */
(function () {
  // 🏫 (2026-08-25) 소속 대리점·학원명 — 손으로 치던 칸을 실제 대리점 목록(GET /api/admin/centers)
  //   에서 검색해 고르는 <datalist> 로 바꿨다. 한 번만 받아 캐시(921건, 매번 받을 이유 없음).
  //   ⚠️ 이 화면을 보는 사람의 권한 범위 그대로 온다(scopeCenterCond) — 지사·대리점 계정이면
  //     자기 소속만 보이는데, 그건 그 계정이 그 학생을 어차피 자기 소속으로만 등록할 것이므로 맞다.
  let __smAgencyOpts = null, __smAgencyLoading = false;
  async function _smLoadAgencyOptions() {
    const dl = document.getElementById('sm-reg-shop-list');
    if (!dl || __smAgencyOpts || __smAgencyLoading) return;
    __smAgencyLoading = true;
    try {
      const r = await fetch('/api/admin/centers?fields=min&limit=0', { credentials: 'include', cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      const items = (d && d.ok && Array.isArray(d.items)) ? d.items : [];
      __smAgencyOpts = items.map(c => String((c && c.name) || '').trim()).filter(Boolean);
      dl.innerHTML = __smAgencyOpts.map(n => '<option value="' + _esc(n) + '"></option>').join('');
    } catch (e) { /* 못 받아도 칸은 여전히 손으로 칠 수 있다 — 조용히 포기 */ }
    __smAgencyLoading = false;
  }
  window.smOpenRegisterModal = function () {
    const modal = document.getElementById('sm-register-modal');
    if (!modal) return;
    ['sm-reg-uid', 'sm-reg-name', 'sm-reg-password', 'sm-reg-phone', 'sm-reg-parent-phone', 'sm-reg-shop', 'sm-reg-notes'].forEach(id => {
      const e = document.getElementById(id); if (e) e.value = '';
    });
    const msg = document.getElementById('sm-reg-msg');
    if (msg) { msg.style.display = 'none'; msg.innerHTML = ''; }
    modal.style.display = 'flex';
    _smLoadAgencyOptions();
    setTimeout(() => { const u = document.getElementById('sm-reg-uid'); if (u) u.focus(); }, 30);
  };
  window.smCloseRegisterModal = function () {
    const modal = document.getElementById('sm-register-modal');
    if (modal) modal.style.display = 'none';
  };
  // 배경 클릭으로도 닫히게 (다른 모달들과 같은 관례)
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('sm-register-modal');
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) window.smCloseRegisterModal(); });
  });

  window.smSubmitRegisterStudent = async function () {
    const $ = id => document.getElementById(id);
    const uid = ($('sm-reg-uid')?.value || '').trim();
    const name = ($('sm-reg-name')?.value || '').trim();
    const password = ($('sm-reg-password')?.value || '').trim();  // 비우면 서버가 임시 비밀번호를 만든다
    const phone = ($('sm-reg-phone')?.value || '').trim();
    const parentPhone = ($('sm-reg-parent-phone')?.value || '').trim();
    const shop = ($('sm-reg-shop')?.value || '').trim();
    const notes = ($('sm-reg-notes')?.value || '').trim();
    const msg = $('sm-reg-msg');
    const btn = $('sm-reg-submit');
    const _L = (typeof adminLang !== 'undefined' && adminLang === 'en');
    function show(t, ok) {
      if (!msg) { alert(t); return; }
      msg.style.display = 'block';
      msg.style.background = ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
      msg.style.border = '1px solid ' + (ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)');
      msg.style.color = ok ? '#065f46' : '#b91c1c';
      msg.innerHTML = t;
    }
    if (msg) msg.style.display = 'none';

    // 화면에서도 한 번 거른다(서버가 정본이지만, 왕복 전에 알려주는 편이 빠르다)
    if (!uid || uid.length < 4 || uid.length > 20) return show(_L ? '⚠️ User ID must be 4–20 characters.' : '⚠️ 아이디는 4~20자여야 합니다.');
    if (!/^[a-zA-Z0-9_]+$/.test(uid)) return show(_L ? '⚠️ User ID may only contain letters, numbers, and _.' : '⚠️ 아이디는 영문/숫자/밑줄(_)만 가능합니다.');
    if (!name) return show(_L ? '⚠️ Enter the student name.' : '⚠️ 이름을 입력하세요.');
    // 비밀번호는 «선택» — 비워두면 서버가 자동 생성한다. 적었으면 4자 이상이어야 한다
    // (/api/student/register·비밀번호 재설정과 같은 기준, api-students.ts 참고).
    if (password && password.length < 4) return show(_L ? '⚠️ Password must be at least 4 characters.' : '⚠️ 비밀번호는 4자 이상이어야 합니다.');

    if (btn) btn.disabled = true;
    try {
      const r = await fetch('/api/admin/students/create', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid, name: name, password: password || undefined, student_phone: phone, parent_phone: parentPhone, shop_name: shop, notes: notes })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        show('⚠️ ' + (j.message || j.error || (_L ? 'Could not register the student.' : '등록하지 못했습니다.')));
        return;
      }
      // 직접 입력한 비밀번호면 그 사실을 알려주는 라벨로, 비웠으면 예전처럼 「임시 비밀번호」로.
      const _pwLabelKo = password ? '입력한 비밀번호 — 이 화면에서만 다시 보입니다' : '임시 비밀번호 — 이 화면에서만 보입니다';
      const _pwLabelEn = password ? 'The password you entered — shown here once more' : 'Temporary password — shown only on this screen';
      show(
        '<b style="font-size:13.5px">✅ ' + name + '(' + uid + ') ' + (_L ? 'account created.' : '계정을 만들었습니다.') + '</b><br>' +
        '<div style="margin-top:8px;padding:10px 12px;background:#fff;border:2px solid #10b981;border-radius:8px">' +
          '<div style="font-size:11.5px;color:#6b7280;font-weight:700">' + (_L ? _pwLabelEn : _pwLabelKo) + '</div>' +
          '<div style="font-family:MangoiHanSC,Consolas,monospace;font-size:20px;font-weight:800;letter-spacing:1px;color:#065f46;margin-top:3px">' +
            (j.temp_password || '') + '</div>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:12px;line-height:1.7">' +
          (_L ? 'Pass it on to the student/parent and have them change the password after logging in.' : '학생·학부모에게 전달하고, 로그인 후 비밀번호를 바꾸라고 안내하세요.') +
        '</div>', true);
      // 목록을 새로 불러와 방금 등록한 학생이 바로 보이게 한다.
      if (typeof loadStudentList === 'function') loadStudentList();
    } catch (e) {
      show(_L ? '⚠️ Could not reach the server. Please try again.' : '⚠️ 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.');
    } finally {
      if (btn) btn.disabled = false;
    }
  };
})();

/* ════════════════════════════════════════════════════════════
   Phase 13 — 학생관리 집계 뷰 5종 (전체 학생 가로 보기)
   - 만료 임박 / 오늘 출결 / 연속 출석 랭킹 / 최근 상담 / 단체 톡짹톡
   - 모든 행에 🔍 자세히 버튼 → /admin/student?uid=X&tab=Y
════════════════════════════════════════════════════════════ */

// 공통: students_erp 캐시 (한 번 fetch 후 재사용 — 시드 갱신 시 무효화 가능)
let _erpCache = null;
let _erpInflight = null;   // 받는 중인 요청 — 동시 호출이 각자 또 받지 않게 (2026-08-13 #02)
async function getErpList() {
  // 외부에서 _erpCache가 null로 초기화되면 다시 fetch
  if (window._erpCache === null) _erpCache = null;
  // 빈 배열도 무효화 (시드 데이터가 새로 생겼을 수 있음)
  if (Array.isArray(_erpCache) && _erpCache.length === 0) {
    let hasSeed = false;
    try { hasSeed = (JSON.parse(localStorage.getItem('mangoi_test_students') || '[]')).length > 0; } catch{}
    if (hasSeed) _erpCache = null; // 강제 재 fetch
  }
  if (_erpCache && _erpCache.length > 0) return _erpCache;
  /* 🐢 (2026-08-13 수정요청 #02) 캐시가 «await 뒤에» 채워져서, 여럿이 동시에 부르면
     전부 캐시를 비어 있다고 보고 각자 학생 2000명을 받아 갔다(실측: 부팅에 같은 URL 3번).
     받는 중인 «약속» 을 하나 붙잡아 두고 나눠 쓴다 — 결과는 종전과 같고 요청만 1번이 된다. */
  if (_erpInflight) return _erpInflight;
  _erpInflight = (async () => {
    try {
      const r = await fetch('/api/admin/students/erp-list?limit=2000', { credentials:'include' });
      const j = await r.json();
      if (window.PIIMask && j && typeof j.can_view_pii !== 'undefined') PIIMask.setCanView(j.can_view_pii);  // 🔒 PII 권한 반영
      _erpCache = (j && j.ok && j.items) || [];
    } catch { _erpCache = []; }
    try { window._erpCache = _erpCache; } catch{}
    return _erpCache;
  })();
  // ⚠️ 실패해도 반드시 풀어 준다 — 안 풀면 «한 번 실패하면 영영 재시도 못 하는» 상태가 된다.
  try { _erpInflight.finally(() => { _erpInflight = null; }); } catch { _erpInflight = null; }
  return _erpInflight;
}

function escSm(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// 🔒 PII 표시 마스킹 헬퍼 — 권한(can_view_pii) 없으면 마스킹, 있으면 원본. (백엔드 1차 마스킹과 idempotent)
window._piiPhone = function(v){ try { return (window.PIIMask) ? PIIMask.maskByPermission(v,'phone') : (v==null?'':String(v)); } catch(e){ return v==null?'':String(v); } };
window._piiId = function(v){ try { return (window.PIIMask) ? PIIMask.maskByPermission(v,'id') : (v==null?'':String(v)); } catch(e){ return v==null?'':String(v); } };
function uidOfErp(s){ return s.student_id || s.login_id || s.username; }
function drillBtn(uid, tab) {
  return `<a href="/admin/student?uid=${encodeURIComponent(uid)}${tab?'&tab='+tab:''}" target="_blank"
            style="padding:4px 10px;font-size:11px;background:#f59e0b;color:#fff;border-radius:4px;text-decoration:none;font-weight:600;white-space:nowrap;">🔍 ${(currentLang==='en'?'Detail':'자세히')}</a>`;
}

// ────── ⏰ 만료 임박 학생 ──────
async function loadExpiring() {
  const tb = document.getElementById('sm-expiring-tbody');
  const cnt = document.getElementById('sm-expiring-count');
  const days = parseInt(document.getElementById('sm-expiring-window').value, 10);
  tb.innerHTML = '<tr><td colspan="5" class="empty">로딩…</td></tr>';
  const erp = await getErpList();
  const today = new Date(); today.setHours(0,0,0,0);
  const filtered = erp
    .map(s => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s.end_date || '')) return null;
      const end = new Date(s.end_date+'T23:59:59');
      const diff = Math.ceil((end - today) / 86400000);
      return { ...s, dDay: diff };
    })
    .filter(s => s && (days === 0 ? s.dDay < 0 : (s.dDay >= 0 && s.dDay <= days)))
    .sort((a, b) => a.dDay - b.dDay);

  cnt.textContent = filtered.length + (currentLang==='en'?' students':'명');
  if (filtered.length === 0) { tb.innerHTML = '<tr><td colspan="5" class="empty">'+(currentLang==='en'?'No students in this range.':'해당 범위 학생 없음')+'</td></tr>'; return; }
  tb.innerHTML = filtered.map(s => {
    const cls = s.dDay < 0 ? 'background:rgba(239,68,68,.15);color:#dc2626;font-weight:700'
              : s.dDay <= 7 ? 'background:rgba(245,158,11,.15);color:#d97706;font-weight:700'
              : 'color:#666';
    const dStr = s.dDay < 0 ? 'D+' + Math.abs(s.dDay) : (s.dDay === 0 ? 'D-DAY' : 'D-' + s.dDay);
    const uid = uidOfErp(s);
    return `<tr>
      <td>${escSm(s.username)}</td>
      <td>${escSm(s.end_date)}</td>
      <td><span style="${cls};padding:2px 8px;border-radius:10px;font-size:11px">${dStr}</span></td>
      <td>${escSm(s.franchise || s.shop_name)||'—'}</td>
      <td>${drillBtn(uid, 'extension')}</td>
    </tr>`;
  }).join('');
}

// ────── 📅 오늘 출결 한눈에 ──────
async function loadTodayAttend() {
  const body = document.getElementById('sm-today-body');
  const sum = document.getElementById('sm-today-summary');
  body.innerHTML = '<div class="empty">'+(currentLang==='en'?'Loading…':'로딩…')+'</div>';

  // /api/dashboard 가 attendance.by_day 를 줘서 오늘 데이터 추출 가능
  // 하지만 학생 단위 정보 없음 → erp + dashboard.attendance 조합
  const erp = await getErpList();
  const today = new Date().toISOString().slice(0,10);

  // 오늘 attendance 가져오기 위해 student/full 을 모든 학생에 대해 호출하는 건 비효율
  // 대신 /api/dashboard 의 by_day 로 출석한 user_id 들 받아옴 (개략)
  // 더 정확하려면 신규 엔드포인트 필요. 우선 erp 의 student_id 모두 표시 + 출석 여부 컬럼 비워둠.
  let attendedIds = new Set();
  let attendCount = 0;
  try {
    // /api/recordings 또는 더 가벼운 용도로 attendance 직접 fetch가 없으므로,
    // 대시보드 데이터만 활용 (정확한 today 출석 학생 리스트는 후속 endpoint 필요)
    const r = await fetch('/api/dashboard?days=1', { credentials:'include' });
    const j = await r.json();
    attendCount = (j && j.attendance && j.attendance.total) || 0;
  } catch {}

  sum.textContent = (currentLang==='en'?'Today total sessions: ':'오늘 총 세션: ') + attendCount + ' · ' +
                    (currentLang==='en'?'Total students: ':'전체 학생: ') + erp.length;

  // 학생 표 — 오늘 출석 여부는 신규 엔드포인트 필요. 일단 모든 학생에 "🔍 자세히" 제공.
  const studentRows = erp.slice(0, 50).map(s => {
    const uid = uidOfErp(s);
    return `<tr>
      <td>${escSm(s.username)}</td>
      <td>${escSm(s.franchise || s.shop_name)||'—'}</td>
      <td>${escSm(s.classes_per_week)||'—'}</td>
      <td>${drillBtn(uid, 'attend')}</td>
    </tr>`;
  }).join('');
  body.innerHTML = `
    <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#92400e">
      💡 ${currentLang==='en'?'Aggregate today-attendance endpoint is roadmapped. For now, click 🔍 on any student to see their attendance calendar.':'전체 학생의 오늘 출석 통합 엔드포인트는 다음 사이클 예정. 지금은 학생별 🔍 클릭으로 캘린더 확인.'}
    </div>
    <table>
      <thead><tr><th>${currentLang==='en'?'Name':'이름'}</th><th>${currentLang==='en'?'Franchise':'가맹점'}</th><th>${currentLang==='en'?'Cls/wk':'주당'}</th><th>${currentLang==='en'?'Action':'액션'}</th></tr></thead>
      <tbody>${studentRows}</tbody>
    </table>`;
}

// ────── 🏆 연속 출석 랭킹 ──────
// 출결(attendance) 기반 그래프 DFS(서버 재귀 CTE)를 단일 권위로 사용.
//   · 불러오기  → GET  /api/streak/leaderboard (서버가 이미 정합화한 student_streaks 읽기, 즉시)
//   · 일괄 재계산 → POST /api/admin/streak/reconcile (전 학생 출결 기준 재산출 후 갱신 리더보드 반환)
// 예전처럼 학생마다 /full?days=180 을 N번 호출해 클라에서 streak 를 계산하지 않는다(부하 제거).
async function _streakNameMap() {
  try {
    const erp = await getErpList();
    const m = {};
    (erp || []).forEach(s => { try { const u = uidOfErp(s); if (u) m[u] = s.username; } catch {} });
    return m;
  } catch { return {}; }
}
function _renderStreakRows(items, nameMap) {
  const tb = document.getElementById('sm-streak-tbody');
  if (!items || !items.length) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">'+(currentLang==='en'?'No data — run 🔁 Recompute all first':'데이터 없음 — 🔁 일괄 재계산을 먼저 실행하세요')+'</td></tr>';
    return;
  }
  tb.innerHTML = items.map((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1)+'.';
    const uid = r.student_uid || r.uid;
    // 이름과 아이디는 «따로» 보여준다 — 동명이인이 있어서 이름만으로는 식별이 안 된다.
    //   이름 출처 우선순위: 서버가 붙여 준 student_name → erp-list 대조표 → (둘 다 없으면 '—')
    //   예전엔 이름 칸에 아이디를 대신 넣어서, 이름 칸에 아이디만 줄줄이 찍혔다.
    const name = r.student_name || (nameMap && nameMap[uid]) || '';
    return `<tr>
      <td>${medal}</td>
      <td>${name ? escSm(name) : '<span style="color:#9ca3af">—</span>'}</td>
      <td><code style="font-size:11px;color:#6b7280">${escSm(uid)}</code></td>
      <td><strong style="color:#f59e0b">${r.current_streak||0}</strong>${currentLang==='en'?'d':'일'}</td>
      <td>${r.longest_streak||0}${currentLang==='en'?'d':'일'}</td>
      <td>${drillBtn(uid, 'streak')}</td>
    </tr>`;
  }).join('');
}
async function loadStreakRanking() {
  const tb = document.getElementById('sm-streak-tbody');
  const cnt = document.getElementById('sm-streak-count');
  tb.innerHTML = '<tr><td colspan="6" class="empty">'+(currentLang==='en'?'Loading…':'불러오는 중…')+'</td></tr>';
  try {
    const [lb, nameMap] = await Promise.all([
      fetch('/api/streak/leaderboard', { credentials:'include' }).then(x=>x.json()).catch(()=>({ ok:false })),
      _streakNameMap(),
    ]);
    const items = (lb && lb.items) || [];
    cnt.textContent = (currentLang==='en'?'Top ':'상위 ') + items.length + (currentLang==='en'?'':'명');
    _renderStreakRows(items, nameMap);
  } catch {
    tb.innerHTML = '<tr><td colspan="6" class="empty">'+(currentLang==='en'?'Load failed':'불러오기 실패')+'</td></tr>';
  }
}
async function reconcileStreaks() {
  const tb = document.getElementById('sm-streak-tbody');
  const cnt = document.getElementById('sm-streak-count');
  const btn = document.getElementById('sm-streak-reconcile');
  const label = currentLang==='en' ? '🔁 Recompute all' : '🔁 일괄 재계산';
  if (btn) { btn.disabled = true; btn.textContent = currentLang==='en'?'Recomputing…':'재계산 중…'; }
  tb.innerHTML = '<tr><td colspan="6" class="empty">'+(currentLang==='en'?'Recomputing all students…':'전 학생 재계산 중…')+'</td></tr>';
  try {
    const [rc, nameMap] = await Promise.all([
      fetch('/api/admin/streak/reconcile', { method:'POST', credentials:'include' }).then(x=>x.json()).catch(()=>({ ok:false })),
      _streakNameMap(),
    ]);
    if (!rc || !rc.ok) {
      tb.innerHTML = '<tr><td colspan="6" class="empty">'+(currentLang==='en'?'Reconcile failed (admin only)':'재계산 실패 (관리자 전용)')+'</td></tr>';
      return;
    }
    const items = rc.leaderboard || [];
    const n = rc.reconciled ? rc.reconciled.updated : items.length;
    cnt.textContent = (currentLang==='en'?'Reconciled ':'정합화 ') + n + (currentLang==='en'?' · Top ':'명 · 상위 ') + items.length;
    _renderStreakRows(items, nameMap);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

// ────── 📞 최근 상담 통합 ──────
async function loadRecentConsult() {
  const tb = document.getElementById('sm-consult-tbody');
  const cnt = document.getElementById('sm-consult-count');
  const days = parseInt(document.getElementById('sm-consult-window').value, 10);
  tb.innerHTML = '<tr><td colspan="6" class="empty">'+(currentLang==='en'?'Loading…':'로딩…')+'</td></tr>';

  const erp = await getErpList();
  const since = Date.now() - days * 86400000;
  const allConsults = [];
  // 처음 30명 학생만 sample (성능 고려)
  const sample = erp.slice(0, 30);
  for (const s of sample) {
    const uid = uidOfErp(s);
    try {
      const r = await fetch('/api/admin/student/'+encodeURIComponent(uid)+'/consultations', { credentials:'include' });
      const j = await r.json();
      if (j.ok && j.items) {
        j.items.forEach(c => {
          if (c.consult_at >= since) allConsults.push({ ...c, _uid: uid, _name: s.username });
        });
      }
    } catch {}
  }
  allConsults.sort((a,b) => b.consult_at - a.consult_at);
  cnt.textContent = allConsults.length + (currentLang==='en'?' records':'건');
  if (allConsults.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="empty">'+(currentLang==='en'?'No counseling records in period':'기간 내 상담 기록 없음')+'</td></tr>'; return; }
  tb.innerHTML = allConsults.slice(0, 50).map(c => {
    const d = new Date(c.consult_at);
    const dStr = d.toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
    const stCls = c.status === 'open' ? 'background:#fef3c7;color:#92400e' : c.status === 'resolved' ? 'background:#d1fae5;color:#065f46' : 'background:#fee2e2;color:#991b1b';
    return `<tr>
      <td>${dStr}</td>
      <td>${escSm(c._name)}</td>
      <td>${escSm(c.channel)||'—'}</td>
      <td>${escSm(c.topic)||'—'}</td>
      <td><span style="${stCls};padding:2px 8px;border-radius:10px;font-size:11px">${escSm(c.status)}</span></td>
      <td>${drillBtn(c._uid, 'consult')}</td>
    </tr>`;
  }).join('');
}

// ────── 💭 단체 톡짹톡 ──────
async function loadBulkList() {
  const tb = document.getElementById('sm-bulk-tbody');
  tb.innerHTML = '<tr><td colspan="6" class="empty">'+(currentLang==='en'?'Loading…':'로딩…')+'</td></tr>';
  const erp = await getErpList();
  if (erp.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="empty">No students</td></tr>'; return; }
  tb.innerHTML = erp.map(s => `<tr>
    <td><input type="checkbox" data-stuid="${escSm(uidOfErp(s))}" data-stukakao="${escSm(s.kakao_id)||''}" data-parkakao="${escSm(s.parent_kakao_id)||''}" data-stuphone="${escSm(s.student_phone)||''}" data-parphone="${escSm(s.parent_phone)||''}" data-name="${escSm(s.username)||''}" onchange="updateBulkCount()"></td>
    <td>${escSm(s.username)}</td>
    <td>${escSm(s.franchise || s.shop_name)||'—'}</td>
    <td>${escSm(_piiId(s.kakao_id))||'—'}</td>
    <td>${escSm(_piiId(s.parent_kakao_id))||'—'}</td>
    <td>${escSm(_piiPhone(s.parent_phone))||'—'}</td>
  </tr>`).join('');
  updateBulkCount();
}
window.updateBulkCount = function() {
  const n = document.querySelectorAll('#sm-bulk-tbody input[type=checkbox]:checked').length;
  const el = document.getElementById('sm-bulk-selected');
  if (el) el.textContent = n + (currentLang==='en'?' selected':' 명 선택');
};
window.bulkCopyContacts = function() {
  const target = document.getElementById('sm-bulk-target').value;
  const msg = document.getElementById('sm-bulk-msg').value || '';
  const cks = document.querySelectorAll('#sm-bulk-tbody input[type=checkbox]:checked');
  if (cks.length === 0) { alert(currentLang==='en'?'Select at least one student':'최소 1명 이상 선택하세요'); return; }
  const fieldMap = { parent_kakao:'parkakao', student_kakao:'stukakao', parent_phone:'parphone', student_phone:'stuphone' };
  const field = fieldMap[target];
  const contacts = Array.from(cks).map(c => c.dataset[field]).filter(Boolean);
  if (contacts.length === 0) { alert(currentLang==='en'?'No contacts found in selection':'선택 학생 중 해당 연락처 정보가 없음'); return; }
  const out = '【'+(currentLang==='en'?'Bulk Message':'단체 메시지')+'】\n' + msg + '\n\n【'+(currentLang==='en'?'Recipients':'수신자')+' '+contacts.length+'】\n' + contacts.join(', ');
  navigator.clipboard.writeText(out).then(
    () => alert((currentLang==='en'?'Copied! ':'복사됨! ') + contacts.length + (currentLang==='en'?' contacts.':'명 연락처. 카카오톡/메시지 앱 열어 붙여넣으세요.')),
    () => alert(currentLang==='en'?'Copy failed':'복사 실패')
  );
};

// 5개 집계 뷰 버튼 바인딩
(function bindPhase13Aggregates(){
  const e = id => document.getElementById(id);
  if (e('sm-expiring-load')) e('sm-expiring-load').addEventListener('click', loadExpiring);
  if (e('sm-expiring-window')) e('sm-expiring-window').addEventListener('change', loadExpiring);
  if (e('sm-today-load')) e('sm-today-load').addEventListener('click', loadTodayAttend);
  if (e('sm-streak-load')) e('sm-streak-load').addEventListener('click', loadStreakRanking);
  if (e('sm-streak-reconcile')) e('sm-streak-reconcile').addEventListener('click', reconcileStreaks);
  if (e('sm-consult-load')) e('sm-consult-load').addEventListener('click', loadRecentConsult);
  if (e('sm-consult-window')) e('sm-consult-window').addEventListener('change', loadRecentConsult);
  if (e('sm-bulk-load')) e('sm-bulk-load').addEventListener('click', loadBulkList);
})();

// 6개 메뉴 컨트롤 일괄 바인딩
(function bindPhase9Menus(){
  const e = id => document.getElementById(id);
  if (e('mbr-add-btn'))     e('mbr-add-btn').addEventListener('click', addMasterBranch);
  if (e('fr-add-btn'))      e('fr-add-btn').addEventListener('click', addFranchise);
  if (e('ct-add-btn'))      e('ct-add-btn').addEventListener('click', addCenter);
  // 🏯 본사 관리 (2026-08-18) — 등록/수정 저장은 한 버튼이 겸한다(_hqEditId 로 분기)
  if (e('hq-add-btn'))      e('hq-add-btn').addEventListener('click', saveHqOrg);
  if (e('hq-cancel-btn'))   e('hq-cancel-btn').addEventListener('click', hqResetForm);
  if (e('lt-add-btn'))      e('lt-add-btn').addEventListener('click', addLevelTest);
  // 🥭 Phase 34 — 강사 정보 CRUD 버튼
  if (e('tp-add-btn'))          e('tp-add-btn').addEventListener('click', addTeacherProfile);
  if (e('tp-clear-btn'))        e('tp-clear-btn').addEventListener('click', () => {
    clearTeacherForm();
    const btn = e('tp-add-btn');
    if (btn) { btn.textContent = '+ 강사 등록'; delete btn.dataset.editId; }
  });
  if (e('tp-refresh-btn'))      e('tp-refresh-btn').addEventListener('click', loadTeacherProfiles);
  if (e('tp-filter-status'))    e('tp-filter-status').addEventListener('change', loadTeacherProfiles);
  if (e('tp-filter-group'))     e('tp-filter-group').addEventListener('change', loadTeacherProfiles);
  /* 🌏 (2026-09-01) 구분 필터 — 이 한 줄을 빠뜨리면 «골라도 아무 일도 안 일어난다»
     (에러도 안 난다. 새 필터를 만들 때 제일 자주 빠지는 자리다). */
  if (e('tp-filter-region'))    e('tp-filter-region').addEventListener('change', loadTeacherProfiles);
  if (e('tp-search')) {
    var _tpSearchTimer = null;
    e('tp-search').addEventListener('input', function(){
      clearTimeout(_tpSearchTimer);
      _tpSearchTimer = setTimeout(loadTeacherProfiles, 250);
    });
  }
  // 페이지 로드시 강사 목록 자동 로드
  if (document.getElementById('tp-list-body')) {
    setTimeout(loadTeacherProfiles, 200);
  }
  if (e('en-add-btn'))         e('en-add-btn').addEventListener('click', addEnrollment);
  if (e('en-refresh-btn'))     e('en-refresh-btn').addEventListener('click', loadEnrollments);
  if (e('en-import-file-btn')) e('en-import-file-btn').addEventListener('click', importEnrollmentFromFile);
  if (e('en-import-kakao-btn'))e('en-import-kakao-btn').addEventListener('click', importEnrollmentFromKakao);
  // 🥭 Phase 24 — 다중 학생 행 초기화 + + 행 추가 버튼
  if (e('en-add-row-btn'))     e('en-add-row-btn').addEventListener('click', () => _addEnrollmentRow());
  if (e('en-multi-rows') && e('en-multi-rows').children.length === 0) {
    _addEnrollmentRow(); // 페이지 로드시 첫 행 자동 추가
  }
  // 🥭 Phase 25 — 빈 양식 다운로드 버튼 3종
  if (e('en-tmpl-excel-btn')) e('en-tmpl-excel-btn').addEventListener('click', downloadEmptyEnrollmentTemplateExcel);
  if (e('en-tmpl-word-btn'))  e('en-tmpl-word-btn').addEventListener('click', downloadEmptyEnrollmentTemplateWord);
  if (e('en-tmpl-kakao-btn')) e('en-tmpl-kakao-btn').addEventListener('click', copyEmptyEnrollmentTemplateKakao);
  if (e('en-status-filter')) e('en-status-filter').addEventListener('change', loadEnrollments);
  if (e('cm-add-btn'))      e('cm-add-btn').addEventListener('click', addCommunityPost);
  if (e('tb-add-btn'))      e('tb-add-btn').addEventListener('click', addTextbook);
  if (e('tb-sync-server-btn')) e('tb-sync-server-btn').addEventListener('click', syncLocalTextbooksToServer);
})();

async function seedDemoTeachers() {
  const _L = adminLang === 'en';
  const year  = parseInt(document.getElementById('payroll-year').value, 10);
  const month = parseInt(document.getElementById('payroll-month').value, 10);
  if (!year || !month) { alert(_L ? 'Enter year/month first' : '연도/월을 먼저 입력하세요'); return; }
  const ym = `${year}-${String(month).padStart(2,'0')}`;
  const confirmMsg = _L
    ? `Seed all 21 teachers from salary-heatmap.pages.dev for ${ym}?\n\n· Existing names will be updated (rate/years)\n· Evaluation 5 scores + class count also inserted`
    : `${ym} 기준으로\nsalary-heatmap.pages.dev 의 21명 강사를\n한 번에 등록(또는 업데이트)할까요?\n\n· 이름이 겹치면 단가·연차만 업데이트\n· 평가 5점수 + 수업수도 함께 입력됨`;
  if (!confirm(confirmMsg)) return;
  try {
    const r = await fetch('/api/admin/payroll/seed-demo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ year, month })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.ok === false) { alert((_L ? 'Seed failed: ' : '시드 실패: ') + (d.error || ('HTTP ' + r.status))); return; }
    alert(_L
      ? `Seed complete!\nNew ${d.created} · Updated ${d.updated} · Evals ${d.evaluations} · Class records ${d.class_records}`
      : `시드 완료!\n신규 ${d.created}명 · 업데이트 ${d.updated}명 · 평가 ${d.evaluations}건 · 수업수 ${d.class_records}건`);
    calcPayrollAll();
  } catch (e) { alert((_L ? 'Network error: ' : '네트워크 에러: ') + e.message); }
}

// 컨트롤 바인딩
(function bindPayrollV2() {
  const e = id => document.getElementById(id);
  if (e('payroll-calc-btn'))     e('payroll-calc-btn').addEventListener('click', calcPayrollAll);
  if (e('payroll-csv-btn'))      e('payroll-csv-btn').addEventListener('click', downloadPayrollCSV);
  if (e('ev-auto-btn'))          e('ev-auto-btn').addEventListener('click', autoFillEvalFromLms);   // 🤖 LMS 기록으로 평가 채우기
  if (e('payroll-finalize-btn')) e('payroll-finalize-btn').addEventListener('click', finalizePayroll);
  if (e('payroll-charts-btn'))   e('payroll-charts-btn').addEventListener('click', togglePayrollCharts);
  if (e('payroll-seed-btn'))     e('payroll-seed-btn').addEventListener('click', seedDemoTeachers);
  if (e('t-new-btn'))            e('t-new-btn').addEventListener('click', registerTeacher);
  if (e('ev-cancel-btn'))        e('ev-cancel-btn').addEventListener('click', closeEvalModal);
  if (e('ev-save-btn'))          e('ev-save-btn').addEventListener('click', saveEvalAndClasses);
  // 테이블 헤더 클릭 → 정렬 토글 (Shift+클릭 = 다중 정렬)
  if (e('payroll-thead')) {
    e('payroll-thead').addEventListener('click', (ev) => {
      const th = ev.target.closest('.pr-th');
      if (!th) return;
      const key = th.getAttribute('data-sort-key');
      if (key) onPayrollHeaderClick(key, ev.shiftKey);
    });
  }
  // 💳 법인카드 표도 같은 방식 (2026-08-16)
  if (e('acc-card-thead')) {
    e('acc-card-thead').addEventListener('click', (ev) => {
      const th = ev.target.closest('.pr-th');
      if (!th) return;
      const key = th.getAttribute('data-sort-key');
      if (key && typeof window.onCardHeaderClick === 'function') window.onCardHeaderClick(key, ev.shiftKey);
    });
  }
  // 모달 배경 클릭으로 닫기
  if (e('eval-modal-bg')) e('eval-modal-bg').addEventListener('click', (ev) => {
    if (ev.target.id === 'eval-modal-bg') closeEvalModal();
  });
  // 평가 점수 입력 시 미리보기 갱신
  ['ev-instruction', 'ev-retention', 'ev-punctuality', 'ev-admin', 'ev-contribution'].forEach(id => {
    if (e(id)) e(id).addEventListener('input', updateEvalPreview);
  });
  // 🕐 (2026-08-17) 수업수·총 수업시간 입력 시 급여 근거 안내 갱신
  ['ev-class-count', 'ev-total-minutes'].forEach(id => {
    if (e(id)) e(id).addEventListener('input', updateMinutesHint);
  });
  // 🔐 강사 급여·평가 카드가 열릴 때: 교사 보기면 관리 컨트롤 숨김 + 본인 급여 자동 로드
  const _pcard = e('card-payroll');
  if (_pcard && !_pcard.__teacherBound) {
    _pcard.__teacherBound = true;
    _pcard.addEventListener('toggle', () => {
      if (!_pcard.open || !_payrollTeacherView()) return;
      _applyPayrollTeacherUI();
      if (!_lastPayrollRows || _lastPayrollRows.length === 0) { try { calcPayrollAll(); } catch(e){} }
      else { renderPayrollTable(); refreshPayrollSummary(); }
    });
  }
})();

// 📥 Phase 6: CSV 다운로드 (window.location 으로 GET 다운로드 — Authorization 자동 첨부됨)
function exportRecordingsCSV() {
  const p = new URLSearchParams();
  if (_recQuery.q)         p.set('q',         _recQuery.q);
  if (_recQuery.date_from) p.set('date_from', _recQuery.date_from);
  if (_recQuery.date_to)   p.set('date_to',   _recQuery.date_to);
  if (_recQuery.status && _recQuery.status !== 'all') p.set('status', _recQuery.status);
  const url = '/api/admin/export/recordings.csv' + (p.toString() ? '?' + p.toString() : '');
  window.open(url, '_blank');
}

function exportAttendanceCSV() {
  const p = new URLSearchParams();
  const f = document.getElementById('export-att-from');
  const t = document.getElementById('export-att-to');
  const u = document.getElementById('export-att-user');
  const r = document.getElementById('export-att-room');
  if (f && f.value) p.set('date_from', f.value);
  if (t && t.value) p.set('date_to',   t.value);
  if (u && u.value.trim()) p.set('user_id', u.value.trim());
  if (r && r.value.trim()) p.set('room_id', r.value.trim());
  const url = '/api/admin/export/attendance.csv' + (p.toString() ? '?' + p.toString() : '');
  window.open(url, '_blank');
}

// CSV 버튼 바인딩
(function bindCsvExport() {
  const recBtn = document.getElementById('rec-export-csv');
  if (recBtn) recBtn.addEventListener('click', exportRecordingsCSV);
  const attBtn = document.getElementById('export-att-btn');
  if (attBtn) attBtn.addEventListener('click', exportAttendanceCSV);
})();

// 📣 Phase 5: 알림 큐 로딩 + 렌더 + 액션
async function loadNotifications() {
  const _L = adminLang === 'en';
  const filter = (document.getElementById('notif-status-filter') || { value: 'pending' }).value;
  try {
    const r = await fetch('/api/admin/notifications?status=' + encodeURIComponent(filter) + '&limit=50', { cache: 'no-store', credentials: 'include' });
    const data = await r.json();
    if (!data.ok) {
      document.getElementById('notif-table').innerHTML = '<tr><td colspan="7" class="empty">' + (_L?'Load failed: ':'로딩 실패: ') + (data.error || ('HTTP ' + r.status)) + '</td></tr>';
      return;
    }
    const items = data.items || [];
    const counts = data.counts || {};
    const totalAll = (counts.pending||0) + (counts.sent||0) + (counts.failed||0) + (counts.discarded||0);
    document.getElementById('notif-counts').textContent =
      '대기 ' + (counts.pending || 0) + ' · 발송 ' + (counts.sent || 0)
      + ' · 실패 ' + (counts.failed || 0) + ' · 폐기 ' + (counts.discarded || 0)
      + ' · 합계 ' + totalAll;
    const tb = document.getElementById('notif-table');
    if (items.length === 0) {
      tb.innerHTML = '<tr><td colspan="7" class="empty">' + (_L?'No items':'항목 없음') + '</td></tr>';
      return;
    }
    tb.innerHTML = items.map(it => {
      const t = it.created_at ? new Date(it.created_at).toLocaleString(_L?'en-US':'ko-KR') : '-';
      const sentT = it.sent_at ? new Date(it.sent_at).toLocaleString(_L?'en-US':'ko-KR') : '';
      const statusBadge = it.status === 'sent'      ? '<span class="badge ok">sent</span>'
                       : it.status === 'pending'   ? '<span class="badge warn">pending</span>'
                       : it.status === 'failed'    ? '<span class="badge" style="background:#fef2f2;color:#b91c1c;">failed</span>'
                       : '<span class="badge" style="background:#f3f4f6;color:#6b7280;">' + it.status + '</span>';
      const safeTitle = String(it.title || '').replace(/[<>]/g, '');
      const safeBody  = String(it.body  || '').replace(/[<>]/g, '');
      let actions = '';
      if (it.status === 'pending') {
        actions = '<button onclick="setNotifStatus(' + it.id + ', \'sent\')" title="발송 완료로 표시" style="background:#10b981;color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;border:none;margin-right:4px;">✓ ' + (_L?'sent':'발송') + '</button>'
                + '<button onclick="setNotifStatus(' + it.id + ', \'discarded\')" title="폐기 처리" style="background:#6b7280;color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;border:none;">🗑</button>';
      } else if (it.status === 'failed') {
        actions = '<button onclick="setNotifStatus(' + it.id + ', \'pending\')" title="다시 대기 상태로" style="background:#f59e0b;color:#fff;padding:3px 8px;border-radius:4px;font-size:11px;cursor:pointer;border:none;">↻ ' + (_L?'retry':'재시도') + '</button>';
      }
      return '<tr>'
        + '<td style="white-space:nowrap;">' + t + (sentT ? '<br><span style="color:#10b981;font-size:11px;">→ ' + sentT + '</span>' : '') + '</td>'
        + '<td><code style="font-size:11px;">' + (it.type || '-') + '</code></td>'
        + '<td>' + safeTitle + '</td>'
        + '<td style="color:#6b7280;font-size:12px;">' + safeBody + '</td>'
        + '<td><code style="font-size:11px;">' + (it.channel || '-') + '</code></td>'
        + '<td>' + statusBadge + '</td>'
        + '<td>' + actions + '</td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    document.getElementById('notif-table').innerHTML = '<tr><td colspan="7" class="empty">' + (_L?'Network error: ':'네트워크 에러: ') + e.message + '</td></tr>';
  }
}

async function setNotifStatus(id, status) {
  try {
    const r = await fetch('/api/admin/notifications/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      alert('실패: ' + (data.error || ('HTTP ' + r.status)));
      return;
    }
    loadNotifications();
  } catch (e) {
    alert('네트워크 에러: ' + e.message);
  }
}

async function sendTestNotification() {
  const title = prompt('테스트 알림 제목 (선택):', '🧪 테스트') || '🧪 테스트 알림';
  const body  = prompt('테스트 알림 내용 (선택):', '알림 큐 동작 검증') || '알림 큐 동작 검증';
  try {
    const r = await fetch('/api/admin/notifications/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title, body })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      alert('실패: ' + (data.error || ('HTTP ' + r.status)));
      return;
    }
    loadNotifications();
  } catch (e) {
    alert('네트워크 에러: ' + e.message);
  }
}

// 알림 큐 컨트롤 바인딩
(function bindNotif() {
  const refreshBtn = document.getElementById('notif-refresh');
  const testBtn    = document.getElementById('notif-test-btn');
  const filterEl   = document.getElementById('notif-status-filter');
  if (refreshBtn) refreshBtn.addEventListener('click', loadNotifications);
  if (testBtn)    testBtn.addEventListener('click', sendTestNotification);
  if (filterEl)   filterEl.addEventListener('change', loadNotifications);
})();

// 🗑️ 녹화 상태 변경 (Phase 4) — 삭제/복원 공용
async function setRecordingStatus(id, nextStatus) {
  const _L = adminLang==='en';
  // ⚠️ 'ended' 는 D1 에 없는 값이었다(2026-08-28 수리) — 복원은 'completed' 로 보낸다.
  const label = nextStatus === 'deleted'   ? (_L?'delete':'삭제')
              : nextStatus === 'completed' ? (_L?'restore':'복원')
              : nextStatus === 'ended'     ? (_L?'restore':'복원')
              : nextStatus;
  const confirmMsg = _L ? `Change recording #${id} status to "${nextStatus}"?`
                        : `녹화 #${id} 의 상태를 "${nextStatus}" (으)로 변경하시겠습니까?`;
  if (!confirm(confirmMsg)) return;
  try {
    const r = await fetch('/api/recordings/' + encodeURIComponent(id) + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: nextStatus })
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.ok === false) {
      /* 🔴 2026-08-28 — 서버가 «왜 안 되는지» 를 사람 말로 보내 주는데(file_gone 등)
         화면은 error 코드만 띄웠다. 사람 말이 있으면 그것을 먼저 보여 준다. */
      var msg = (_L ? (body.message_en || body.message) : body.message)
             || body.error || ('HTTP ' + r.status);
      alert((_L ? 'Failed: ' : '실패: ') + msg);
      return;
    }
    loadRecordings();
  } catch (e) {
    alert((_L ? 'Network error: ' : '네트워크 에러: ') + e.message);
  }
}

/* 🔗 녹화 «링크로 보내기» (2026-09-01 사장님 «카카오에 저장도 안돼»)
   ─────────────────────────────────────────────────────────────────────────
   [왜 파일이 아니라 링크인가] 녹화는 webm(vp8+opus)이고 21분짜리가 195MB 다. 카카오톡·
     아이폰·안드로이드 갤러리는 mp4 를 전제로 하므로 webm 파일은 첨부 목록에 아예 안 뜨거나
     «지원하지 않는 형식» 이 된다. 링크를 보내면 형식·용량 제약을 통째로 비켜 간다.
   [안전] 주소에 실린 서명(&sig=)은 «이 녹화 id 하나» 전용이고 6시간 뒤 만료된다
     (auth-token.ts signRecDlSig). 계정 토큰이 아니라 권한이 넓어지는 지점이 없다.
   ⛔ 유효기간을 화면에서 감추지 말 것 — 조용히 죽는 링크를 보내면 「보냈는데 안 열린대요」가
      된다. 그래서 공유 문구와 안내에 만료 시각을 함께 적는다.
   ⛔ window.open 을 쓰지 말 것 — 카톡·문자앱 인앱 브라우저는 새 창을 못 열고 **예외도 안 던진
      채 null 만** 돌려준다(CLAUDE.md 2장). 여기서는 공유 시트/클립보드만 쓴다.
   ⚠️ 미성년자 수업 영상이다. 받는 사람을 확인하고 보내라는 안내를 함께 띄운다. */
async function shareRecordingLink(id) {
  const _L = (typeof adminLang !== 'undefined' && adminLang === 'en');
  const row = (_unifiedRecRows || []).filter(function (x) { return String(x.id) === String(id); })[0];
  const url = row && row.share_url;
  if (!url) {
    alert(_L ? 'This recording has no shareable link (the video file was not found).'
             : '이 녹화는 공유 링크를 만들 수 없습니다 (영상 파일을 찾지 못했습니다).');
    return;
  }
  const until = row.share_expires_at ? new Date(row.share_expires_at) : null;
  const untilTxt = until ? until.toLocaleString(_L ? 'en-US' : 'ko-KR') : '';
  const label = (_L ? 'Mangoi class recording' : '망고아이 수업 녹화')
    + (row.room_id ? ' · ' + row.room_id : '');
  const body = label + (untilTxt ? (_L ? '\n(link expires ' + untilTxt + ')'
                                       : '\n(이 링크는 ' + untilTxt + ' 까지 열립니다)') : '');

  // 📱 휴대폰에서는 공유 시트 — 여기에 카카오톡이 뜬다. PC 는 윈도우 공유 시트에 카톡이
  //    없는 경우가 많아 «복사» 가 더 확실하므로 터치 기기에서만 시트를 쓴다.
  const isTouch = (navigator.maxTouchPoints || 0) > 0;
  if (isTouch && navigator.share) {
    try {
      await navigator.share({ title: label, text: body, url: url });
      return;
    } catch (e) {
      // 사용자가 시트를 닫은 것은 «실패» 가 아니다 — 조용히 끝낸다.
      if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return;
      // 그 밖의 오류는 아래 복사 경로로 떨어진다.
    }
  }

  const done = _L
    ? 'Link copied. Paste it into KakaoTalk or a text message.\n\n' + body
    : '링크를 복사했습니다. 카카오톡·문자에 붙여넣어 보내세요.\n\n' + body
      + '\n\n⚠️ 미성년자 수업 영상입니다. 받는 사람을 확인하고 보내 주세요.';
  try {
    await navigator.clipboard.writeText(url);
    alert(done);
  } catch (e) {
    // 클립보드가 막힌 환경(구형 WebView 등) — 사람이 직접 복사할 수 있게 보여 준다.
    prompt(_L ? 'Copy this link:' : '이 링크를 복사하세요:', url);
  }
}

// ── 녹화 재생 ──
function playRecording(url, title) {
  const modal = document.getElementById('playback-modal');
  const video = document.getElementById('playback-video');
  const titleEl = document.getElementById('playback-title');
  titleEl.textContent = title || '녹화 재생';
  video.src = url;
  modal.style.display = 'flex';
}
function closePlayback() {
  const modal = document.getElementById('playback-modal');
  const video = document.getElementById('playback-video');
  video.pause();
  video.src = '';
  modal.style.display = 'none';
}

// 📊 저장소 상태 KPI — «진짜» 숫자로 채운다 (2026-08-26 신설)
//   예전엔 이 함수가 아예 없어서 옆의 「🔄 새로고침」 버튼이 눌러도 아무 일이 없었고,
//   타일 네 칸은 HTML 에 박아 둔 예시 숫자(12.4GB·156파일·248MB·₩4,820)를 보여 주고 있었다.
//   ⚠️ 글자를 JS 로 쓰는 칸은 data-ko/data-en 도 «함께» 갱신한다 — 안 그러면 🌐 를 눌러도
//      안 따라온다(CLAUDE.md 2장 「JS 로 그린 라벨」).
function _rsPut(id, text, ko, en) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  if (ko != null) el.setAttribute('data-ko', ko);
  if (en != null) el.setAttribute('data-en', en);
}
function _rsBytes(n) {
  if (!n) return '0 MB';
  if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
  if (n >= 1048576)    return Math.round(n / 1048576) + ' MB';
  return Math.round(n / 1024) + ' KB';
}
window.refreshStorageStats = async function () {
  var ids = ['rs-r2-size','rs-r2-files','rs-d1-size','rs-d1-tables','rs-rec-failed','rs-rec-failed-u','rs-rec-expiring','rs-rec-expiring-u'];
  ids.forEach(function (i) { var e = document.getElementById(i); if (e) e.textContent = '…'; });
  try {
    const r = await fetch('/api/recordings/storage-stats', { cache: 'no-store' });
    const d = await r.json();
    // 판정은 «성공이라고 말했는가» 로 한다 — 404 본문에는 ok 칸이 아예 없다(CLAUDE.md 2장)
    if (!r.ok || d.ok !== true) throw new Error(d && d.error ? d.error : ('HTTP ' + r.status));
    const en = (adminLang === 'en');
    const n = function (v) { return (v == null ? 0 : v).toLocaleString(); };

    if (d.r2) {
      _rsPut('rs-r2-size', _rsBytes(d.r2.bytes));
      var fTxtKo = n(d.r2.files) + ' 파일' + (d.r2.truncated ? ' 이상' : '');
      var fTxtEn = n(d.r2.files) + ' files' + (d.r2.truncated ? '+' : '');
      _rsPut('rs-r2-files', en ? fTxtEn : fTxtKo, fTxtKo, fTxtEn);
    } else {
      _rsPut('rs-r2-size', '—');
      _rsPut('rs-r2-files', en ? 'not connected' : '연결 안 됨', '연결 안 됨', 'not connected');
    }

    if (d.d1 && d.d1.error == null) {
      _rsPut('rs-d1-size', n(d.d1.total));
      var cKo = '완료 ' + n(d.d1.completed) + '건', cEn = n(d.d1.completed) + ' completed';
      _rsPut('rs-d1-tables', en ? cEn : cKo, cKo, cEn);

      _rsPut('rs-rec-failed', n(d.d1.failed));
      var fKo = '건 · 영상이 없는 기록', fEn = 'rows with no video';
      _rsPut('rs-rec-failed-u', en ? fEn : fKo, fKo, fEn);
      var fv = document.getElementById('rs-rec-failed');
      if (fv) fv.style.color = (d.d1.failed > 0) ? '#b91c1c' : '';

      _rsPut('rs-rec-expiring', n(d.d1.expiring30d));
      /* ⚠️ 이 타일은 «아직 만료 안 됐고 30일 안에 만료될» 건수다(src/index.ts 의 expiring 집계).
   «이미 만료» 로 적으면 라벨(30일 내 만료)과 정반대를 말하게 된다.
   그리고 보관기간이 기존 3개월·신규 6개월로 섞여 있어 숫자를 적으면 어느 쪽이든 거짓이다. */
      var eKo = '건 · 곧 만료', eEn = 'rows · expiring soon';
      _rsPut('rs-rec-expiring-u', en ? eEn : eKo, eKo, eEn);
    } else {
      ['rs-d1-size','rs-rec-failed','rs-rec-expiring'].forEach(function (i) { _rsPut(i, '—'); });
      _rsPut('rs-d1-tables', en ? 'query failed' : '조회 실패', '조회 실패', 'query failed');
    }
  } catch (e) {
    console.warn('[admin] 저장소 상태 조회 실패:', e);
    var enq = (adminLang === 'en');
    ['rs-r2-size','rs-d1-size','rs-rec-failed','rs-rec-expiring'].forEach(function (i) { _rsPut(i, '—'); });
    ['rs-r2-files','rs-d1-tables','rs-rec-failed-u','rs-rec-expiring-u'].forEach(function (i) {
      _rsPut(i, enq ? 'load failed' : '불러오기 실패', '불러오기 실패', 'load failed');
    });
  }
};

async function testR2() {
  const el = document.getElementById('test-r2-result');
  el.textContent = adminLang==='en'?'Testing...':'테스트 중...';
  el.style.color = '#94a3b8';
  try {
    const r = await fetch('/api/recordings/test-r2');
    const d = await r.json();
    if (d.ok) {
      // 🔴 2026-08-26: 예전엔 서버가 'recordings/' 한 접두사만 세어 줬고 화면도 그 수만 보여
      //   줬다. 실제 자동녹화는 전부 'rec/' 에 쌓이므로 파일이 있어도 늘 「0개」였다.
      var recN    = (d.rec && d.rec.count    != null) ? d.rec.count    : null;
      var legacyN = (d.legacy && d.legacy.count != null) ? d.legacy.count : null;
      var totalN  = (recN == null && legacyN == null)
        ? (d.recordingFiles || []).length          // 옛 서버 응답 대비
        : (recN || 0) + (legacyN || 0);
      var cut = (d.rec && d.rec.truncated) || (d.legacy && d.legacy.truncated);
      el.style.color = '#22c55e';
      el.textContent = adminLang==='en'
        ? '✅ R2 OK — read/write OK. Files: ' + totalN + (recN == null ? '' : ' (rec/ ' + recN + ' · recordings/ ' + (legacyN == null ? 0 : legacyN) + ')')
        : '✅ R2 연결 성공 — 쓰기/읽기 OK. 녹화 파일 ' + totalN + '개' + (recN == null ? '' : ' (rec/ ' + recN + ' · recordings/ ' + (legacyN == null ? 0 : legacyN) + ')');
      if (cut) el.textContent += adminLang==='en' ? ' · list truncated at 1000' : ' · 목록이 1000개에서 잘림';
      var sample = d.recordingFiles || [];
      if (sample.length) {
        el.textContent += ' — ' + sample.map(f => f.key + ' (' + (f.size/1024).toFixed(0) + 'KB)').join(', ');
      }
    } else {
      el.style.color = '#dc2626';
      el.textContent = '❌ R2 ' + (adminLang==='en'?'Error: ':'에러: ') + (d.error || JSON.stringify(d));
    }
  } catch(e) {
    el.style.color = '#dc2626';
    el.textContent = '❌ ' + (adminLang==='en'?'Request failed: ':'요청 실패: ') + e.message;
  }
}

document.getElementById('rooms-refresh').onclick = loadActiveRooms;
// 데이터 새로고침 — 우하단 ↻ FAB 등에서 재사용 가능 (헤더 버튼은 제거됨)
window.adminRefreshData = async function() {
  try {
    await Promise.allSettled([
      load(),
      loadRecordings(),
      loadRetention(),
      loadActiveRooms(),
      loadNotifications(),
      loadStorageStats()
    ]);
  } catch(e) { console.warn('refresh error:', e); }
};
var _adminRefreshEl = document.getElementById('refresh');
if (_adminRefreshEl) _adminRefreshEl.onclick = async function() {
  const btn = this;
  btn.disabled = true;
  btn.textContent = adminLang==='en'?'⏳ Loading...':'⏳ 로딩...';
  await window.adminRefreshData();
  btn.disabled = false;
  btn.textContent = adminLang==='en'?'🔄 Refresh':'🔄 새로고침';
};
{ const _pe = document.getElementById('period'); if (_pe) _pe.onchange = load; }   // #period 제거됨 → null 가드
// 초기 로드 (각각 독립적으로)
// 🐢 (2026-08-08) loadFranchises·loadCenters 를 여기서 뺐다 — 카드가 닫혀 있는데도
//    지사 241행 + 대리점·학원 921행(약 155KB)을 부팅마다 받아서 DOM 에 그렸다.
//    이제 카드를 열 때 로드한다(admin.html 의 ontoggle → adminLazyLoadCard).
//    ⚠️ 되살리지 말 것. 두 표는 각자 카드 안에서만 쓰이므로 부팅 때 없어도 아무것도 안 깨진다.
/* 🐢 (2026-08-13 수정요청 #02) 「사이트 전체가 느리다」
   위 2026-08-08 조치와 **똑같은 문제가 11곳 더 남아 있었다.** 부팅 때 API 13개를 한꺼번에
   쐈는데, 그중 화면에 «항상 보이는» 것은 load()(상단 KPI 4박스) 하나뿐이다.
   나머지 12개는 전부 닫혀 있는 카드 안을 채우는 것이라, 직원이 그 카드를 열지 않으면
   받아 놓고 아무도 안 본다. 필리핀 저속 회선에서는 이 12개가 첫 화면을 그대로 밀어낸다.

   확인한 것 — 12개 로더가 손대는 DOM 을 admin.html 을 파싱해 «어느 카드 안인지» 전부 대조했고,
   전역·모듈 변수(_unifiedRecRows·_tbItems·_enItems·__liItems·__ltApps)도 소비처를 따라가
   **자기 카드 밖에서 쓰는 곳이 하나도 없다**는 것을 확인했다. 그래서 미뤄도 아무것도 안 깨진다.
   ⚠️ loadPayrollRates 만은 성격이 다르다 — 결과(_payrollSettings)를 **읽는 코드가 아예 없다**
      (adm-*.js·admin.html 전수 확인). 지우지는 않고 급여 카드에 매달아 두었다.

   ⚠️ 카드를 여는 경로가 여러 개다(사이드바·ia6·통합검색·허브·해시 딥링크·AI 명령).
      그래서 진입점마다 손대지 않고, 위 «조상 열기» 와 같은 자리에서 toggle 을 한 번만 듣는다.
      새 진입점이 생겨도 자동으로 따라온다. */
const CARD_LOADERS = {
  'card-active-rooms':      [loadActiveRooms],
  'card-retention':         [loadRetention],
  'card-recording-storage': [loadRecordings, loadStorageStats],
  'card-notifications':     [loadNotifications],
  'card-level-tests':       [loadLevelTests, loadLeveltestApps],
  'card-lesson-insight':    [loadLessonInsights],
  'card-enrollments':       [loadEnrollments],
  'card-community':         [loadCommunity],
  'card-textbooks':         [loadTextbooks],
  'card-payroll':           [loadPayrollRates],
  // 🏯 (2026-08-18) 본사 관리 — «조직 관리» 카드 안의 하위항목이라 카드가 아니라 이 id 로 잡는다.
  //    위 toggle 감시가 details 면 id 로 runCardLoaders 를 부르므로 하위항목도 그대로 걸린다.
  'card-hq-orgs':           [loadHqOrgs],
};
const _cardLoaded = Object.create(null);
function runCardLoaders(cardId) {
  if (!cardId || _cardLoaded[cardId]) return;
  const fns = CARD_LOADERS[cardId];
  if (!fns) return;
  _cardLoaded[cardId] = true;          // 실패해도 다시 안 쏜다 — 카드 안에 새로고침 버튼이 따로 있다
  fns.forEach(function (fn) {
    try { fn(); } catch (e) { console.warn('[카드 지연로드 실패]', cardId, e); }
  });
}
window.adminRunCardLoaders = runCardLoaders;   // 진단·수동 호출용

// 부팅에는 «항상 보이는» 것만 남긴다. 나머지는 카드를 열 때 (아래 toggle 감시).
Promise.allSettled([ load() ]);
// 혹시 처음부터 열려 있는 카드가 있으면(딥링크·복원) 그것만 지금 채운다.
//   ⚠️ 현재 admin.html 에 `<details open>` 인 카드는 없다. 나중에 생겨도 안 깨지게 두는 안전망이다.
Object.keys(CARD_LOADERS).forEach(function (id) {
  const el = document.getElementById(id);
  if (el && el.open) runCardLoaders(id);
});
// 🔗 (2026-08-09) 하위항목이 열리면 «조상 <details> 도» 함께 연다.
//    「🏪 대리점(학원)」을 「🏢 조직 관리」 카드 안으로 합치면서 필요해졌다 —
//    사이드바·허브·AI 명령·통합검색은 전부 `getElementById(id).open = true` 로 여는데,
//    부모 카드가 닫혀 있으면 열려도 화면에 안 보여서 «눌렀는데 아무 일도 안 난» 것처럼 보인다.
//    진입점마다 고치는 대신 여기 한 곳에서 처리한다(그래야 새 진입점이 생겨도 안 깨진다).
//    ⚠️ toggle 이벤트는 버블링하지 않는다 → document 에 «캡처»로 달아야 잡힌다.
document.addEventListener('toggle', function (e) {
  var d = e.target;
  if (!d || d.tagName !== 'DETAILS' || !d.open) return;
  runCardLoaders(d.id);            // 🐢 (2026-08-13 #02) 이 카드가 처음 열렸으면 그때 데이터를 받는다
  for (var p = d.parentElement; p; p = p.parentElement) {
    if (p.tagName === 'DETAILS' && !p.open) p.open = true;
  }
}, true);

// 🔁 카드 최초 열림 때 한 번만 로드 (admin.html 의 ontoggle 에서 호출)
window.adminLazyLoadCard = function(kind) {
  try {
    if (kind === 'franchises') {
      if (window.__lazyFranchises) return; window.__lazyFranchises = true;
      if (typeof loadFranchises === 'function') loadFranchises();
      // 🏛️ 대표지사 표 — 지사 표의 «대표지사» 드롭다운과 같은 목록을 쓴다. 함께 채운다.
      if (typeof loadMasterBranches === 'function') loadMasterBranches();
    } else if (kind === 'centers') {
      if (window.__lazyCenters) return; window.__lazyCenters = true;
      if (typeof loadCenters === 'function') loadCenters();
    }
  } catch (e) { console.warn('lazy load 실패:', kind, e); }
};
/* 🔄 활성 방 목록 15초마다 자동 갱신
   🐢 (2026-08-13 수정요청 #02) 예전엔 `setInterval(loadActiveRooms, 15000)` 한 줄이었다.
      이 함수는 매번 API 를 **2개**(/api/active-rooms · /api/admin/alerts) 부른다.
      그런데 조건이 하나도 없어서 —
        · 탭을 뒤로 넘겨 두어도 · 카드를 닫아 두어도 · ia6 가 그 카드를 감춰 놓아도
      계속 돌았다. 관리자가 정산 화면을 보고 있는 동안에도 **탭 하나당 시간당 480 요청**이다.
      (하루 종일 켜 두는 자리가 많다. 그게 워커·D1 부하로 그대로 돌아온다.)
      → «지금 화면에 보이는 동안만» 돈다. 안 보이면 그냥 건너뛴다.
   ⚠️ 끄는 게 아니라 «건너뛰는» 것이다. 다시 보이면 아래 visibilitychange 가 즉시 한 번 채운다.
      (카드를 다시 열 때는 toggle → runCardLoaders 가 이미 채워 준다)
   🪤 setInterval 자체를 clearInterval 하지 않는다 — 껐다 켜는 것을 관리하기 시작하면
      «다시 안 켜지는» 사고가 난다. 조건만 본다. */
function _activeRoomsVisible() {
  if (document.hidden) return false;                       // 백그라운드 탭
  const c = document.getElementById('card-active-rooms');
  if (!c || !c.open) return false;                         // 카드가 닫혀 있음
  if (c.classList.contains('ia6-hide')) return false;      // ia6 가 다른 항목을 보여 주는 중
  return true;
}
setInterval(function () { if (_activeRoomsVisible()) loadActiveRooms(); }, 15000);
// 탭으로 돌아왔을 때 15초를 기다리게 하지 않는다 — 보이는 순간 한 번 채운다.
document.addEventListener('visibilitychange', function () {
  if (!document.hidden && _activeRoomsVisible()) loadActiveRooms();
});

// ============================================================================
// 🔍 통합 검색 (메뉴 + 학생·교사·가맹점·센터·수강·교재 등 모든 데이터)
// ============================================================================
let _menuIndex = [];          // [{el, ko, en, idx}]
let _globalSearchIndex = [];  // [{ kind, kindLabel, label, sub, action }]

function buildMenuIndex() {
  _menuIndex = [];
  document.querySelectorAll('details.menu-card').forEach((d, idx) => {
    // 🔐 RBAC: 역할로 감춘 카드는 사이드바에 안 띄움
    //   (2026-08-18) 숨김 표시가 «인라인 display» → «.rbac-hide 클래스» 로 바뀌었다.
    //   인라인 검사도 남겨 둔다 — 옛 방식으로 감추는 코드가 남아 있어도 계속 걸러진다.
    if (window.mangoiCardHidden(d)) return;
    // 1) 카드 자체에 data-menu-label-ko/en 이 있으면 최우선 (배지 텍스트 빨림 방지)
    let ko = d.getAttribute('data-menu-label-ko') || '';
    let en = d.getAttribute('data-menu-label-en') || '';
    if (!ko || !en) {
      // 2) summary 안에 data-ko/data-en 가 있는 span 직접 검색 (중첩 레이아웃 안전)
      const labelSpan = d.querySelector('summary span[data-ko], summary span[data-en]');
      if (labelSpan) {
        ko = ko || labelSpan.getAttribute('data-ko') || labelSpan.textContent.trim();
        en = en || labelSpan.getAttribute('data-en') || ko;
      } else {
        // 3) 마지막 fallback — summary 의 첫 span (예전 동작)
        const span = d.querySelector('summary span');
        if (!span) return;
        ko = ko || span.getAttribute('data-ko') || span.textContent.trim();
        en = en || span.getAttribute('data-en') || ko;
      }
    }
    if (!d.id) d.id = 'menu-' + idx; // anchor 용 id 부여
    _menuIndex.push({ el: d, id: d.id, ko, en, idx });
  });
  renderSidebar();
  // 메뉴를 통합 색인의 1순위로 추가
  _globalSearchIndex = _menuIndex.map(m => ({
    kind: 'menu',
    kindLabelKo: '📋 메뉴',
    kindLabelEn: '📋 Menu',
    label: m.ko,
    labelEn: m.en,
    sub: '',
    action: () => jumpToMenu(m.id)
  }));

  // 🔎 검색 별칭(유사어) — 카드 라벨과 검색어가 달라도 바로 해당 페이지로 연결
  var MENU_ALIASES = [
    // (2026-08-04) '정산통계관리' 카드는 속이 빈 껍데기라 화면에서 뺐다. '정산' 검색은
    //   아래 재무·회계 관리로 보낸다 — 없는 카드로 점프시켜 아무 일도 안 일어나게 두지 않는다.
    { kw:'재무 회계 매출 지출 손익 정산 지사 대리점 accounting finance settlement', card:'card-accounting-mgmt', label:'재무·회계 관리' },
    { kw:'권한 권한설정 역할 접근 permission role', card:'card-permissions', label:'권한 설정' },
    { kw:'학생 학생관리 수강생 student', card:'card-students-mgmt', label:'학생 관리' },
    { kw:'교사 강사 강사관리 선생 선생님 teacher', card:'card-teacher-mgmt', label:'강사 관리' },
    { kw:'포인트 기프트 기프티콘 상점 리워드 적립 point', card:'card-points-mgmt', label:'포인트 관리' },
    { kw:'출석 출결 qr 체크 attendance', card:'card-auto-attendance', label:'출결 관리' },
    { kw:'공지 공지사항 게시판 알림글 notice', card:'card-notice-board', label:'공지사항' },
    { kw:'카카오 알림톡 카톡 kakao', card:'card-kakao-mgmt', label:'카카오 알림톡' },
    { kw:'푸시 웹푸시 알림 push notification', card:'card-webpush-mgmt', label:'웹푸시 알림' },
    { kw:'mbti 매칭 성향 mbti', card:'card-mbti-mgmt', label:'MBTI 매칭' },
    { kw:'토익 toeic 시험 미니토익', card:'card-mini-toeic', label:'Mini TOEIC' },
    { kw:'음성일기 일기 다이어리 voice diary', card:'card-voice-diary', label:'AI 음성 일기' },
    { kw:'평가 평가서 평가관리 성적 eval', card:'card-eval-mgmt', label:'평가 관리' },
    { kw:'상담 문의 컨설팅 inquiry', card:'card-inquiry-mgmt', label:'상담·문의 관리' },
    { kw:'리포트 월간리포트 보고서 report', card:'card-monthly-report', label:'월간 리포트' },
    { kw:'kpi 대시보드 핵심지표 통계 dashboard', card:'card-kpi-dashboard', label:'KPI 대시보드' },
    { kw:'랭킹 순위 ranking', card:'card-rankings', label:'랭킹' },
    { kw:'일별 일자별 차트 chart', card:'card-daily-charts', label:'일자별 차트' },
    { kw:'인사이트 ai인사이트 분석 insight', card:'card-ai-insights', label:'AI 인사이트' },
    { kw:'칭찬 스티커 칭찬스티커 praise', card:'card-praise-stats', label:'칭찬 스티커 통계' },
    { kw:'정기결제 구독 자동결제 recurring', card:'card-recurring-billing', label:'정기 결제' },
    { kw:'미납 독촉 미수금 dunning', card:'card-auto-dunning', label:'미납 추적' },
    /* 🎥 (2026-09-09) 「녹화」가 «실시간 수업(활성 룸)» 으로 가던 것을 바로잡는다.
       한 줄에 «녹화» 와 «활성방» 이 함께 묶여 있었고 라벨이 「녹화·활성 방」이라
       「녹화」로 시작해 정렬 1위가 됐다 → Enter·➡️ 가 card-active-rooms 로 갔다
       (실측: ➡️ 클릭 뒤 card-active-rooms 가 화면 맨 위, card-recording-storage 는 display:none).
       ⛔ 두 줄을 다시 합치지 말 것 — 서로 다른 화면이다.
       ⚠️ top:true 는 «이름이 그 말로 시작할 때만» 걸리므로 라벨에 이모지를 붙이지 말 것
          (「🎥 녹화 관리」로 적으면 indexOf('녹화')!==0 이라 조용히 안 걸린다). */
    { kw:'녹화 녹화본 녹화영상 수업영상 다시보기 보관 recording record', card:'card-recording-storage', label:'녹화 관리', en:'Recordings', top:true },
    { kw:'활성방 활성 룸 실시간 수업 지금 진행중 라이브 active rooms live', card:'card-active-rooms', label:'실시간 수업 (활성 룸)', en:'Live Classes (Active Rooms)' },
    { kw:'가족 가족계정 family', card:'card-family-mgmt', label:'가족 계정' },
    { kw:'동영상 비디오 영상 유튜브 youtube 비디오관리 video', card:'sub-mango-videos', label:'망고아이 비디오 관리 (YouTube)' },
    { kw:'콘텐츠 컨텐츠 교재 자료 content', card:'card-textbooks', label:'교재 콘텐츠 관리' },
    { kw:'갤러리 사진 영상갤러리 gallery', card:'card-gallery', label:'사진·영상 갤러리' },
    { kw:'수강신청 수강 등록 enrollment', card:'card-students-mgmt', label:'학생·수강 관리' },
    { kw:'결제 수납 입금 payment', card:'card-accounting-mgmt', label:'결제·회계' },
    /* 🎯 (2026-08-06) '레벨테스트' 검색이 엉뚱한 곳으로 가고 있었다.
       ① 이 별칭이 «학생 관리» 를 가리켜, 정작 신청·등록 결과 표가 있는 card-level-tests 로
          아무도 못 갔다.  ② 그 카드의 라벨은 「📝 레벨 **테스트**」(띄어쓰기) 라서
          붙여 쓴 검색어 「레벨테스트」 에는 글자 대조가 영영 안 걸렸고,
          띄어쓰기 없는 「🏅 레벨테스트 배치 현황」(카페24 집계) 만 떴다.
       → 찾는 것(학생이 접수한 신청·등록 결과)을 «맨 위» 에 올린다.
          집계 카드는 자기 라벨로 이미 걸리므로 별칭을 따로 두지 않는다. */
    { kw:'레벨테스트 레벨 테스트 신청 신청현황 등록 등록결과 접수 결과 배정 대기 level test application signup', card:'card-level-tests', label:'레벨테스트 신청·등록 결과', en:'Level Test Applications', top:true },
    { kw:'법인카드 법인 카드내역 카드사용 지출 지출내역 경비 corpcard', card:'acc-corpcard', label:'법인카드 사용내역 (지출)' },
    { kw:'신한은행 신한 계좌 통장 은행 출금 입출금 지출 계정과목 거래처 bankacct bank', card:'acc-bankacct', label:'신한 계좌 입출금 (지출 분석)' },
    { kw:'강의실 입장 테스트 장비점검 웹캠 마이크 점검 테스트하네스 진단 test', card:'card-classroom-test', label:'강의실 입장·장비 점검 테스트' }
  ];
  MENU_ALIASES.forEach(function(a){
    var el = document.getElementById(a.card);
    // RBAC 숨김 카드는 제외 — (2026-08-18) 숨김 표시가 .rbac-hide 클래스로 바뀌었다
    if (window.mangoiCardHidden(el)) return;
    _globalSearchIndex.push({
      kind:'menu', kindLabelKo:'📋 바로가기', kindLabelEn:'📋 Shortcut',
      label: a.label, labelEn: a.en || a.label,   // en 이 있으면 영문 라벨로 (강사 다수 필리핀)
      sub: a.kw,                       // 유사어 — 검색 매칭용
      top: !!a.top,                    // 같은 말로 여러 카드가 걸릴 때 «이게 찾던 것» 이라고 못박기
      action: function(){ jumpToMenu(a.card); }
    });
  });
}

// ── 모든 데이터 통합 색인 ──────────────────────────────────────────
async function buildGlobalIndex() {
  // 메뉴는 buildMenuIndex 가 이미 추가. 다른 카테고리만 fetch.
  const sources = [
    { url: '/api/admin/students/erp-list?limit=1000', kindKo: '👨‍🎓 학생',     kindEn: '👨‍🎓 Student',    items: 'items',
      label: s => s.korean_name || s.english_name || s.username || s.user_id,
      sub:   s => [s.english_name, s.user_id].filter(Boolean).join(' · '),
      action: s => { const uid = s.user_id || s.username; if (uid) window.open('/admin/student?uid=' + encodeURIComponent(uid), '_blank'); else jumpToMenuByLabelMatch('학생관리'); } },
    { url: '/api/admin/teachers',         kindKo: '🧑‍🏫 교사',     kindEn: '🧑‍🏫 Teacher',     items: 'items',
      label: t => t.name,
      sub:   t => `${t.status || '—'} · ${t.years != null ? t.years + 'y' : ''} · rate ${t.rate_per_10min_php || '—'}`,
      action: () => jumpToMenuByLabelMatch('강사') },
    // 🏢 조직 — 본사 › 지사 › 대리점(학원). fields=min 으로 {id,name} 만 받는다
    //    (예전엔 두 목록의 전체 컬럼을 받아 약 155KB. 이름만 받으니 약 35KB — 검색 범위는 그대로 전건)
    { url: '/api/admin/franchises?fields=min', kindKo: '🏢 지사',   kindEn: '🏢 Branch',      items: 'items',
      label: f => f.name,
      sub:   () => '',
      action: () => jumpToMenuByLabelMatch('조직 관리') },
    { url: '/api/admin/centers?fields=min&limit=0', kindKo: '🏪 대리점(학원)', kindEn: '🏪 Agency', items: 'items',
      label: c => c.name,
      sub:   () => '',
      // 🏪 목록은 «조직 관리» 카드 안의 하위항목이다. 하위항목을 직접 열면
      //    위의 «조상 details 자동 열기» 가 부모 카드까지 같이 펼쳐 준다.
      action: () => {
        const el = document.getElementById('card-centers');
        if (el) { el.open = true; el.scrollIntoView({ behavior: 'auto', block: 'start' }); }
        else jumpToMenuByLabelMatch('조직 관리');
      } },
    { url: '/api/admin/enrollments?limit=500', kindKo: '📚 수강신청', kindEn: '📚 Enrollment', items: 'items',
      label: e => e.student_name,
      sub:   e => `${e.package} · ${e.status}`,
      action: () => jumpToMenuByLabelMatch('수강신청') },
    { url: '/api/admin/level-tests?limit=500', kindKo: '📝 레벨테스트', kindEn: '📝 Level Test', items: 'items',
      label: l => l.student_name,
      sub:   l => `${l.level || '—'} · ${l.score != null ? l.score : '—'}`,
      action: () => jumpToMenuByLabelMatch('레벨') },
    { url: '/api/admin/community-posts',  kindKo: '📢 공지',       kindEn: '📢 Post',         items: 'items',
      label: p => p.title,
      sub:   p => p.author || '',
      action: () => jumpToMenuByLabelMatch('커뮤니티') },
    { url: '/api/admin/textbooks',        kindKo: '📖 교재',       kindEn: '📖 Textbook',     items: 'items',
      label: t => t.title,
      sub:   t => `${t.level || '—'} · ${t.publisher || ''}`,
      action: () => jumpToMenuByLabelMatch('교재') },
    { url: '/api/recordings?limit=200',   kindKo: '🎥 녹화',       kindEn: '🎥 Recording',    items: '__array__',
      label: r => `Room ${r.room_id} · ${r.teacher_name || r.teacher_id || ''}`,
      sub:   r => r.started_at ? new Date(r.started_at).toLocaleDateString(adminLang==='en'?'en-US':'ko-KR') : '',
      action: () => jumpToMenuByLabelMatch('녹화') }
  ];

  await Promise.allSettled(sources.map(async src => {
    try {
      const r = await fetch(src.url, { cache: 'no-store', credentials: 'include' });
      if (!r.ok) return;
      const data = await r.json();
      const list = src.items === '__array__' ? (Array.isArray(data) ? data : []) : (data[src.items] || []);
      list.forEach(item => {
        const lbl = src.label(item);
        if (!lbl) return;
        _globalSearchIndex.push({
          kind: src.kindKo,
          kindLabelKo: src.kindKo,
          kindLabelEn: src.kindEn,
          label: String(lbl),
          labelEn: String(lbl),  // 데이터 원본은 한 가지 (영문 별도 없음)
          sub: src.sub(item) || '',
          action: () => src.action(item)
        });
      });
    } catch {}
  }));
}

// 메뉴 라벨에 부분 일치하는 첫 카드로 점프
function jumpToMenuByLabelMatch(needle) {
  const m = _menuIndex.find(x => (x.ko || '').includes(needle) || (x.en || '').toLowerCase().includes(needle.toLowerCase()));
  if (m) jumpToMenu(m.id);
}

// 🥭 Phase 45/47b — 사이드바 정렬 헬퍼 (가나다 / A·B·C 순)
//   DOM 순서는 그대로, 사이드바 표시만 자모/알파벳순으로 정렬.
//   Phase 47b 핫픽스: 이모지·ZWJ·variation selector 등 모든 비-글자 leading 문자 제거
//   (이전 정규식이 U+200D ZWJ 와 일부 이모지를 놓쳐서 정렬이 어긋남)
function _menuSortKey(label) {
  let cleaned = String(label || '');
  // 모든 leading 비-글자 문자 제거 (이모지·ZWJ·VS·공백·기호 한 번에)
  // [^...] = 다음이 아닌 모든 문자: 영문대소·숫자·한글 음절(가–힣)·한글 자모(ㄱ–ㅎ)
  cleaned = cleaned.replace(/^[^a-zA-Z0-9가-힣ㄱ-ㅎ]+/u, '').trim();
  if (!cleaned) return 'z9';
  const first = cleaned.charCodeAt(0);
  // 한글 음절 (가–힣) → 가장 앞
  if (first >= 0xAC00 && first <= 0xD7A3) return '0' + cleaned;
  // 한글 자모 (ㄱ–ㅎ) → 그 다음
  if (first >= 0x3131 && first <= 0x314E) return '1' + cleaned;
  // 영문·숫자 — 한글 뒤로
  // 영문은 대소 구분 없이 정렬되도록 소문자화
  return 'z' + cleaned.toLowerCase();
}

// ═══ 7-카테고리 메뉴 분류 정의 (균등 분산 v2) ═══
//   각 메뉴가 한 카테고리에 1~5개씩 고르게 분포하도록 키워드 세분화
//   id 기반 명시 매핑(idMap)이 키워드 매칭보다 우선
const SB_CATEGORIES = [
  { id:'dash',     ico:'📊', ko:'대시보드/통계', en:'Dashboards',
    keywords:['kpi','대시보드','dashboard','일별','차트','chart','랭킹','ranking','리텐션','retention','실시간','active','live','통계','stats','리포트','report'] },
  { id:'student',  ico:'👥', ko:'학생/학부모', en:'Students',
    keywords:['학생','학부모','평가서','평가서 작성','신규상담','상담','수강','등록','게시판','커뮤니티','출결','출석','만료','student','parent','enrollment','inquiry','evaluation','board','community','attendance'] },
  { id:'teacher',  ico:'👨‍🏫', ko:'강사', en:'Teachers',
    keywords:['강사','교사','강사료','보험','강사 평가','강사 급여','teacher','payroll','salary'] },
  { id:'acc',      ico:'💰', ko:'회계', en:'Accounting',
    keywords:['회계','정산','세금','매출','비용','송금','환전','쿠폰','결제','거래','전표','수익','포인트','기프티콘','accounting','revenue','settlement','tax','payment','points','gift'] },
  { id:'notify',   ico:'📢', ko:'알림/소통', en:'Notifications',
    keywords:['카카오','알림톡','알림','공지','팝업','push','웹푸시','web push','이벤트','발송','메시지','채팅','kakao','alimtalk','notification','announcement','popup','push','chat','event'] },
  { id:'edu',      ico:'🎓', ko:'교육', en:'Education',
    keywords:['교재','자료','도서','학습자료','pdf','book','material','레벨','level test','발음','pronunciation','녹화','recording','video','컨텐츠','content','수업'] },
  { id:'system',   ico:'⚙', ko:'시스템', en:'System',
    keywords:['권한','권한 설정','permission','가맹점','franchise','지사','대리점','센터','center','branch','데이터','export','csv','내보내기','테스트','test data','시드','seed','보관','삭제','정리','임직원','캘린더','calendar','휴가','vacation','공휴일','holiday','달력'] }
];

// 명시적 ID → category 매핑 (키워드보다 우선)
const SB_ID_MAP = {
  'card-kpi-dashboard':    'dash',
  'card-daily-charts':     'dash',
  'card-rankings':         'dash',
  'card-retention':        'dash',
  'card-active-rooms':     'dash',
  'card-settlement-stats': 'dash',

  'card-students-mgmt':    'student',
  'card-eval-mgmt':        'student',
  'card-inquiry-mgmt':     'student',
  'card-enrollments':      'student',
  'card-community':        'student',

  'card-teacher-mgmt':     'teacher',
  'card-payroll':          'teacher',
  'card-payroll-auto':     'teacher',

  'card-accounting-mgmt':  'acc',
  'card-points-mgmt':      'acc',

  'card-kakao-mgmt':       'notify',
  'card-webpush-mgmt':     'notify',
  'card-popups-mgmt':      'notify',
  'card-poster-maker':     'notify',
  'card-notifications':    'notify',

  'card-textbooks':        'edu',
  'card-level-tests':      'edu',
  'card-pronunciation':    'edu',
  'card-recording-storage':'edu',

  'card-permissions':      'system',
  'card-franchises':       'system',
  'card-centers':          'system',
  'card-data-export':      'system',
  'card-test-seed':        'system',
  'card-calendar':         'system',   // 📅 캘린더 관리(휴가·공휴일) → 시스템

  // 🆕 신규 카드들 명시 매핑
  'card-badges-mgmt':      'student',   // 🎮 학생 배지 → 학생/학부모
  'card-voice-stats':      'edu',       // 🎙 음성 코칭 진도 → 교육
  'card-bulk-eval':        'student',   // 📚 일괄 평가서 → 학생/학부모
  'card-webpush-mgmt':     'notify',    // 🔔 Web Push → 알림/소통
  'card-ai-eval-draft':    'student',   // 🤖 AI 평가서 자동 작성 → 학생/학부모
  'card-retention-risk':   'dash',      // 🚨 이탈 위험 → 대시보드
  'card-daily-briefing':   'dash',      // 🌅 매일 아침 브리핑 → 대시보드
  'card-auto-dunning':     'dash',      // 💰 미납 자동 추적 → 대시보드
  'card-parent-faq-bot':   'notify',    // 🤖 학부모 FAQ 봇 → 알림/소통
  'card-auto-schedule':    'edu',       // 📅 AI 시간표 자동 → 교육
  'card-ai-forecast':      'dash',      // 📈 매출·이탈 예측 → 대시보드
  'card-monthly-report':   'student',   // 📄 월별 보고서 → 학생/학부모
  'card-mbti-mgmt':        'teacher',   // 🧠 강사 MBTI → 강사
  'card-praise-stats':     'teacher',   // 🌟 교사 칭찬 통계 → 강사
  'card-admin-ghost':      'student',   // 👁 라이브 참관 → 학생/평가
  'card-admin-whisper':    'teacher',   // 📢 강사 귓속말 → 강사
  'card-admin-alerts':     'dash',      // 🚨 실시간 알림 → 대시보드
  'card-room-invite':      'system',    // 🔐 강의실 초대 → 시스템
  'card-recurring-billing':'dash',      // 💳 정기결제 자동화 → 대시보드
  'card-referral':         'dash',      // 🎁 추천 친구 보상 → 대시보드
  'card-nps-monthly':      'notify',    // 🌟 월간 NPS → 알림/소통
  'card-counseling-booking':'edu',      // 📅 1:1 상담 예약 → 교육
  'card-comparison-report':'student',   // 📊 자녀 성장 비교 → 학생/학부모
  'card-auto-attendance':  'edu',       // 📷 QR 출결 → 교육
  'card-video-dict':       'edu',       // 📺 비디오 자막+사전 → 교육
  'card-family-mgmt':      'student',   // 👨‍👩‍👧 가족 통합 → 학생/학부모
  'card-mini-toeic':       'edu',       // 📝 Mini TOEIC → 교육
  'card-alumni':           'student',   // 🏆 졸업생 동문 커뮤니티 → 학생
  'card-voice-diary':      'edu',       // 📔 AI 음성 일기 → 교육
  'card-supervisor':       'teacher',   // 🎯 강사 슈퍼바이저 모드 → 강사
};

// 메뉴 하나를 카테고리에 매핑 — ID 우선, 키워드 점수, 마지막 fallback = system
function _classifyMenu(m) {
  // 1) ID 명시 매핑 (가장 신뢰)
  if (m.id && SB_ID_MAP[m.id]) {
    const found = SB_CATEGORIES.find(c => c.id === SB_ID_MAP[m.id]);
    if (found) return found;
  }
  // 2) 키워드 점수 매칭
  const text = ((m.ko || '') + ' ' + (m.en || '')).toLowerCase();
  let best = null, bestScore = 0;
  for (const cat of SB_CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      if (text.includes(kw.toLowerCase())) score += kw.length;
    }
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  // 3) fallback = 시스템 (본사 X — 본사가 fallback 이 되면 또 몰림)
  return best || SB_CATEGORIES[6];
}

function renderSidebar() {
  const list = document.getElementById('admin-sidebar-list');
  if (!list) return;
  const useEn = (typeof adminLang !== 'undefined' && adminLang === 'en');

  // 1) 메뉴들을 카테고리별로 그룹핑
  const groups = {};
  SB_CATEGORIES.forEach(c => groups[c.id] = []);
  _menuIndex.forEach(m => {
    const cat = _classifyMenu(m);
    groups[cat.id].push(m);
  });
  // 각 그룹 안 가나다순 정렬
  Object.keys(groups).forEach(k => {
    groups[k].sort((a, b) => {
      const ka = _menuSortKey(useEn ? a.en : a.ko);
      const kb = _menuSortKey(useEn ? b.en : b.ko);
      return ka.localeCompare(kb, useEn ? 'en' : 'ko-KR');
    });
  });

  // 2) HTML 렌더
  // (수업입장 카드는 #admin-sidebar-list 위에 고정 HTML 로 넣음 — 렌더와 무관하게 항상 표시)
  const html = '<div class="sb-cat-wrap">' + SB_CATEGORIES.map(c => {
    const items = groups[c.id];
    const label = useEn ? c.en : c.ko;
    let subHtml = '';
    if (items.length === 0) {
      subHtml = '<div style="padding:14px;color:#9ca3af;font-size:12px;text-align:center">' + (useEn?'No menus':'메뉴 없음') + '</div>';
    } else {
      // 하위가 25개 초과 + 평균 그룹 크기가 2 이상일 때만 sub-sub로 묶기
      // (각 글자가 1개씩만 들어가는 의미없는 그룹화 방지)
      let useSubSub = false;
      let sub = {};
      if (items.length > 25) {
        items.forEach(it => {
          const lbl = (useEn ? it.en : it.ko) || '';
          const cleaned = lbl.replace(/^[^a-zA-Z0-9가-힣ㄱ-ㅎ]+/u, '').trim();
          const k = cleaned.charAt(0).toUpperCase() || '#';
          if (!sub[k]) sub[k] = [];
          sub[k].push(it);
        });
        // 평균 그룹 크기 = items.length / 그룹 수. 2 이상이어야 그룹화가 의미 있음
        const groupCount = Object.keys(sub).length;
        const avgGroupSize = items.length / Math.max(groupCount, 1);
        useSubSub = avgGroupSize >= 2.0;
      }
      if (useSubSub) {
        const keys = Object.keys(sub).sort((a,b)=>a.localeCompare(b, useEn?'en':'ko-KR'));
        subHtml = keys.map(k => {
          const innerItems = sub[k].map(it => {
            const lbl = useEn ? it.en : it.ko;
            return '<a href="#' + it.id + '" class="sb-subsub-item" data-menu-id="' + it.id + '" onclick="jumpToMenu(\'' + it.id + '\')">' + _escSb(lbl) + '</a>';
          }).join('');
          return '<div class="sb-sub-item has-sub"><span class="sb-sub-ico">📂</span><span class="sb-sub-text">' + _escSb(k) + ' (' + sub[k].length + ')</span><span class="sb-sub-more">▶</span>'
            + '<div class="sb-subsub-panel">' + innerItems + '</div></div>';
        }).join('');
      } else {
        // 평면 리스트 (대부분의 경우)
        subHtml = items.map(it => {
          const lbl = useEn ? it.en : it.ko;
          return '<a href="#' + it.id + '" class="sb-sub-item" data-menu-id="' + it.id + '" onclick="jumpToMenu(\'' + it.id + '\')"><span class="sb-sub-ico">·</span><span class="sb-sub-text">' + _escSb(lbl) + '</span></a>';
        }).join('');
      }
    }
    return '<div class="sb-cat" data-cat="' + c.id + '">' +
      '<div class="sb-cat-head" onclick="this.parentElement.classList.toggle(\'expanded\')">' +
        '<span class="sb-cat-ico">' + c.ico + '</span>' +
        '<span class="sb-cat-label">' + _escSb(label) + '</span>' +
        '<span class="sb-cat-count">' + items.length + '</span>' +
        '<span class="sb-cat-arrow">▶</span>' +
      '</div>' +
      '<div class="sb-sub-panel">' + subHtml + '</div>' +
    '</div>';
  }).join('') + '</div>';

  list.innerHTML = html;
  const sv = document.getElementById('sidebar-search');
  if (sv && sv.value) window.filterSidebar && window.filterSidebar(sv.value);
}

// ━━━━━━━━━━ 사이드바 메뉴 검색 (실시간 필터) ━━━━━━━━━━
window.filterSidebar = function(q) {
  const query = (q || '').trim().toLowerCase();
  const items = document.querySelectorAll('#admin-sidebar-list .sidebar-item, #admin-sidebar-list .sb-sub-item, #admin-sidebar-list .sb-subsub-item');
  const empty = document.getElementById('sidebar-search-empty');
  let matchCount = 0;
  items.forEach(a => {
    const hay = a.dataset.search || a.textContent.toLowerCase();
    const label = a.textContent;
    if (!query) {
      a.classList.remove('search-hidden', 'search-match');
      a.innerHTML = _escSb(label);
      matchCount++;
    } else if (hay.includes(query)) {
      a.classList.remove('search-hidden');
      a.classList.add('search-match');
      // hightlight
      const lower = label.toLowerCase();
      const pos = lower.indexOf(query);
      if (pos >= 0) {
        a.innerHTML = _escSb(label.slice(0, pos)) + '<mark>' + _escSb(label.slice(pos, pos + query.length)) + '</mark>' + _escSb(label.slice(pos + query.length));
      } else {
        a.innerHTML = _escSb(label);
      }
      matchCount++;
    } else {
      a.classList.add('search-hidden');
      a.classList.remove('search-match');
    }
  });
  if (empty) empty.style.display = (query && matchCount === 0) ? 'block' : 'none';
};
function _escSb(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function jumpToMenu(id, opts) {
  // 🔐 강사 급여 카드 접근 제어 — 어떤 경로(사이드바·검색·AI)로 와도 차단
  if ((id === 'card-payroll' || id === 'card-payroll-auto') && typeof window.payrollAccess === 'function') {
    var _pa = window.payrollAccess(id);
    if (!_pa.ok) { try { window._payrollGuardToast(_pa.message); } catch(e){} return; }
    window._payrollOwnOnly = !!_pa.ownOnly;   // 교사=본인만 (renderPayrollTable 에서 필터)
  }
  const el = document.getElementById(id);
  if (!el) return;
  // Phase 14: 대상 카드가 .legacy-cards 안이면 먼저 영역 자동 표시
  const lc = document.getElementById('legacy-cards');
  if (lc && lc.contains(el) && !lc.classList.contains('legacy-show')) {
    lc.classList.add('legacy-show');
    if (typeof syncLegacyToggleLabel === 'function') syncLegacyToggleLabel();
  }
  // 🆕 중첩된 sub-item(예: 망고아이 비디오 관리)도 보이도록 부모 details 모두 펼침
  let _anc = el.parentElement;
  while (_anc) { if (_anc.tagName === 'DETAILS') _anc.open = true; _anc = _anc.parentElement; }
  el.open = true;
  // 📢 공지 스튜디오: 대상이 게시(팝업)/만들기 패널이면 해당 탭으로 전환 후 스크롤
  try{ if((id==='card-popups-mgmt'||id==='card-poster-maker') && typeof window.noticeStudioTab==='function') window.noticeStudioTab(id==='card-popups-mgmt'?'publish':'make'); }catch(e){}
  // (2026-07-22, 강사 피드백 #3 "옵션을 고를 때 화면 효과가 어지럽다. 왼쪽 효과는 괜찮다")
  //   예전엔 smooth 스크롤을 시작해 놓고 rAF 2번(≈32ms) 뒤에 auto 로 한 번 더 불러서,
  //   부드럽게 흐르던 화면을 도중에 툭 끊어 버렸다 — 이 '흐르다 끊김'이 멀미의 주범이었다.
  //   카드가 열리며 높이가 변하므로 위치 재보정 자체는 남기되, 둘 다 즉시 이동으로 통일한다.
  el.scrollIntoView({ behavior: 'auto', block: 'start' });
  // 시각적 강조 — 렌더 안정 후(rAF x2) 어느 카드로 왔는지만 짧게 표시 (2026-06-12 / 07-22 완화)
  requestAnimationFrame(() => { requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: 'auto', block: 'start' }); /* 렌더 후 위치 재보정 */
    el.classList.remove('ph96-highlight');
    void el.offsetWidth; /* 애니메이션 재시작 */
    el.classList.add('ph96-highlight');
    setTimeout(() => { el.classList.remove('ph96-highlight'); }, 1400);
  }); });
  // 사이드바 active 표시
  document.querySelectorAll('#admin-sidebar-list a').forEach(a => {
    a.classList.toggle('active', a.dataset.menuId === id);
  });
}

// ── 검색 (자동완성 드롭다운) ──────────────────────────────────────────
function _highlight(text, q) {
  if (!q) return _escSb(text);
  const lower = text.toLowerCase();
  const pos = lower.indexOf(q.toLowerCase());
  if (pos < 0) return _escSb(text);
  return _escSb(text.slice(0, pos)) + '<mark>' + _escSb(text.slice(pos, pos + q.length)) + '</mark>' + _escSb(text.slice(pos + q.length));
}

// 통합 검색 — 메뉴 + 학생 + 교사 + 가맹점 + ... 모든 데이터
function searchAllFor(q) {
  const ql = q.toLowerCase().trim();
  if (!ql) return [];
  /* 🔎 (2026-08-06) 띄어쓰기 때문에 못 찾던 것 — 「레벨테스트」로 검색하면
     라벨이 「📝 레벨 테스트」인 카드가 영영 안 걸렸다(글자 그대로 대조라서).
     한글 메뉴 이름은 사람마다 붙여 쓰기도, 띄어 쓰기도 한다. 공백을 지운 사본으로도
     한 번 더 대조한다. 2글자 미만은 과매칭이 나므로 제외. */
  const _ns = s => String(s || '').toLowerCase().replace(/\s+/g, '');
  const matchBy = (needle) => {
    const nn = _ns(needle);
    return _globalSearchIndex.filter(it =>
      (it.label    || '').toLowerCase().includes(needle) ||
      (it.labelEn  || '').toLowerCase().includes(needle) ||
      (it.sub      || '').toLowerCase().includes(needle) ||
      (nn.length >= 2 && (
        _ns(it.label).includes(nn) || _ns(it.labelEn).includes(nn) || _ns(it.sub).includes(nn)
      ))
    );
  };
  let hits = matchBy(ql);
  // 🆕 문장형 검색 fallback — "법인카드 내역 보여줘"처럼 명령어가 붙으면 단어별로 매칭
  if (hits.length === 0 && /\s/.test(ql)) {
    const STOP = ['보여줘','보여주세요','알려줘','알려주세요','열어줘','열어','찾아줘','찾아','조회','검색','해줘','해주세요','좀','내역','관리','페이지','메뉴','화면','정보','목록'];
    const tokens = ql.split(/\s+/).filter(t => t.length >= 2 && STOP.indexOf(t) === -1);
    const seen = new Set();
    tokens.forEach(t => {
      matchBy(t).forEach(h => {
        const key = (h.kind || '') + '|' + (h.label || '');
        if (!seen.has(key)) { seen.add(key); hits.push(h); }
      });
    });
  }
  /* 지정 바로가기(top) — 같은 말에 여러 카드가 걸릴 때 «찾던 것» 을 맨 위로.
     예: 「레벨테스트」 는 집계 카드(🏅 배치 현황)와 신청·등록 결과 카드에 둘 다 걸리는데,
     사람이 찾는 건 거의 항상 «학생이 접수한 신청·등록 결과» 쪽이다.
     단, 별칭의 «유사어» 에만 스쳐 걸린 경우(예: 「등록」)까지 위로 올리면 방해가 되므로
     이름이 그 말로 «시작할 때» 만 적용한다. */
  const topRank = it => (it.top && (_ns(it.label).indexOf(_ns(ql)) === 0 ||
                                    _ns(it.labelEn).indexOf(_ns(ql)) === 0)) ? 0 : 1;
  // 정렬: (0) 지정 바로가기  (1) 메뉴 최우선  (2) 매칭 위치 앞쪽  (3) 짧은 이름
  return hits.sort((a, b) => {
    const at = topRank(a), bt = topRank(b);
    if (at !== bt) return at - bt;
    if (a.kind === 'menu' && b.kind !== 'menu') return -1;
    if (a.kind !== 'menu' && b.kind === 'menu') return 1;
    const ai = Math.min(
      (a.label.toLowerCase().indexOf(ql) + 1) || 999,
      (a.labelEn.toLowerCase().indexOf(ql) + 1) || 999
    );
    const bi = Math.min(
      (b.label.toLowerCase().indexOf(ql) + 1) || 999,
      (b.labelEn.toLowerCase().indexOf(ql) + 1) || 999
    );
    if (ai !== bi) return ai - bi;
    return (a.label || '').length - (b.label || '').length;
  }).slice(0, 30);  // 자동완성에 너무 많이 안 보이도록 30개 제한
}

let _searchActiveIdx = -1;
let _searchCurrentHits = [];
function renderSearchDropdown(q) {
  const dd = document.getElementById('menu-search-dropdown');
  if (!dd) return;
  if (!q) { dd.classList.remove('show'); dd.innerHTML = ''; _searchActiveIdx = -1; _searchCurrentHits = []; return; }
  const hits = searchAllFor(q);
  _searchCurrentHits = hits;
  if (hits.length === 0) {
    // 🥭 Phase 21f — "일치 결과 없음" 대신 AI 묻기 버튼 (큰 클릭 영역)
    const safeQ = q.replace(/[&<>"']/g, c => (
      {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
    ));
    const hint = adminLang === 'en' ? 'Press Enter or click' : 'Enter 또는 클릭';
    const askLabel = adminLang === 'en' ? 'Ask Mangoi AI' : '망고아이 AI에게 묻기';
    dd.innerHTML =
      '<div class="menu-search-ai-fallback" id="menu-ai-fallback">' +
        '<div class="ai-fallback-row">' +
          '<span class="ai-fallback-icon">🤖</span>' +
          '<div class="ai-fallback-body">' +
            '<div class="ai-fallback-title">' + askLabel + '</div>' +
            '<div class="ai-fallback-q">"' + safeQ + '"</div>' +
          '</div>' +
          '<span class="ai-fallback-hint">' + hint + '</span>' +
        '</div>' +
        '<div class="ai-fallback-bar"><div class="ai-fallback-bar-fill"></div></div>' +
      '</div>';
    dd.classList.add('show');
    _searchActiveIdx = -1;
    // 클릭 핸들러 — askAI() 직접 호출
    const fb = document.getElementById('menu-ai-fallback');
    if (fb) {
      fb.addEventListener('click', function() {
        dd.classList.remove('show');
        if (typeof askAI === 'function') askAI(q);
      });
    }
    return;
  }
  const useEn = (typeof adminLang !== 'undefined' && adminLang === 'en');
  dd.innerHTML = hits.map((h, i) => {
    const kindLbl = useEn ? h.kindLabelEn : h.kindLabelKo;
    const lbl = h.label || '';
    const sub = h.sub || '';
    return `<div class="menu-search-item${i===0?' active':''}" data-idx="${i}">
      <span style="display:inline-block;min-width:90px;font-size:10px;font-weight:700;color:#6b7280;background:#f3f4f6;padding:2px 6px;border-radius:10px;text-align:center;">${_escSb(kindLbl)}</span>
      <span style="flex:1;">${_highlight(lbl, q)}</span>
      ${sub ? `<span style="font-size:11px;color:#9ca3af;">${_escSb(sub)}</span>` : ''}
    </div>`;
  }).join('');
  dd.classList.add('show');
  _searchActiveIdx = 0;
}

(function bindMenuSearch(){
  const input = document.getElementById('menu-search');
  const clear = document.getElementById('menu-search-clear');
  const dd    = document.getElementById('menu-search-dropdown');
  if (!input || !dd) return;

  let timer;
  // 🥭 Phase 21g — 자동 트리거 디바운스
  // 사용자가 타이핑 멈춘 후 2초 → 메뉴 매칭 없으면 askAI() 자동 호출
  // 카운트다운 표시기를 드롭다운 안에 그려줘 시각 피드백
  let _aiAutoTimer = null;
  let _aiCountdownTimer = null;
  const AI_AUTO_DELAY_MS = 2000;
  function _cancelAiAuto() {
    if (_aiAutoTimer) { clearTimeout(_aiAutoTimer); _aiAutoTimer = null; }
    if (_aiCountdownTimer) { clearInterval(_aiCountdownTimer); _aiCountdownTimer = null; }
  }
  function _scheduleAiAuto(q) {
    _cancelAiAuto();
    if (!q || q.length < 2) return;
    let remaining = AI_AUTO_DELAY_MS;
    _aiCountdownTimer = setInterval(() => {
      remaining -= 100;
      const fb = document.getElementById('menu-ai-fallback');
      if (!fb) { _cancelAiAuto(); return; }
      const hint = fb.querySelector('.ai-fallback-hint');
      if (hint) {
        const sec = Math.max(0, Math.ceil(remaining / 100) / 10).toFixed(1);
        hint.textContent = '🤖 ' + sec + '초';
        hint.style.background = 'rgba(245, 158, 11, 0.85)';
        hint.style.color = '#fff';
      }
      // 진행 바 업데이트
      const bar = fb.querySelector('.ai-fallback-bar-fill');
      if (bar) bar.style.width = ((1 - remaining/AI_AUTO_DELAY_MS) * 100).toFixed(1) + '%';
    }, 100);
    _aiAutoTimer = setTimeout(() => {
      _cancelAiAuto();
      // 메뉴 매칭이 없을 때만 자동 호출 (안전장치)
      if (_searchCurrentHits.length === 0 && typeof askAI === 'function') {
        dd.classList.remove('show');
        askAI(q);
      }
    }, AI_AUTO_DELAY_MS);
  }

  // ➡️ 검색어 유무에 따라 왼쪽 아이콘을 돋보기 ↔ '이동' 화살표로 전환
  const wrap = input.closest('.hero-search');
  function _syncGoIcon(){ if (wrap) wrap.classList.toggle('has-q', !!(input.value || '').trim()); }

  // ➡️ 검색어 입력 후 왼쪽 화살표(또는 Enter) → 최적 매칭 메뉴카드로 이동
  function _searchGoTopMatch(){
    const q = (input.value || '').trim();
    if (!q) { input.focus(); return; }
    let hits = (Array.isArray(_searchCurrentHits) && _searchCurrentHits.length)
                 ? _searchCurrentHits : searchAllFor(q);
    if (!hits || !hits.length) {            // 매칭 없으면 AI에게 위임
      dd.classList.remove('show');
      if (typeof askAI === 'function') askAI(q);
      return;
    }
    const hit = hits.find(h => h.kind === 'menu') || hits[0];   // 메뉴 카드 우선
    if (hit && typeof hit.action === 'function') {
      hit.action();
      dd.classList.remove('show');
      input.blur();
    }
  }
  window._searchGoTopMatch = _searchGoTopMatch;
  const goBtn = document.getElementById('menu-search-go');
  if (goBtn) goBtn.addEventListener('click', (e) => { e.preventDefault(); _searchGoTopMatch(); });

  input.addEventListener('input', () => {
    clearTimeout(timer);
    _cancelAiAuto();
    _syncGoIcon();
    timer = setTimeout(() => {
      renderSearchDropdown(input.value);
      // 렌더 후 메뉴 매칭이 없으면 자동 트리거 예약
      if (_searchCurrentHits.length === 0) {
        _scheduleAiAuto(input.value.trim());
      }
    }, 80);
  });

  // 🔎 실시간 서버 검색 — 이름/기능을 DB 에서 즉시 찾아 드롭다운에 표시 (느린 AI 대기 불필요)
  let _liveTimer;
  input.addEventListener('input', () => {
    clearTimeout(_liveTimer);
    const q = (input.value || '').trim();
    if (q.length < 2) return;
    _liveTimer = setTimeout(() => _liveServerSearch(q), 200);
  });
  async function _liveServerSearch(q) {
    let data;
    try {
      const r = await fetch('/api/admin/omnisearch?q=' + encodeURIComponent(q), { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return;
      data = await r.json();
    } catch { return; }
    if ((input.value || '').trim() !== q) return;        // 입력이 바뀌었으면 무시
    const results = (data && data.results) || [];
    if (!results.length) return;
    const live = results.map(x => ({
      kind: x.type === 'teacher' ? '🧑‍🏫 교사' : '👨‍🎓 학생',
      kindLabelKo: x.type === 'teacher' ? '🧑‍🏫 교사' : '👨‍🎓 학생',
      kindLabelEn: x.type === 'teacher' ? '🧑‍🏫 Teacher' : '👨‍🎓 Student',
      label: x.name || '', labelEn: x.name || '', sub: x.sub || '',
      action: () => { if (x.url) window.open(x.url, '_blank'); else jumpToMenuByLabelMatch('강사'); }
    }));
    _cancelAiAuto();                                      // 결과 있으니 AI 자동호출 취소
    const menus = searchAllFor(q).filter(h => h.kind === 'menu');
    const combined = live.concat(menus).slice(0, 30);
    _searchCurrentHits = combined;
    _searchActiveIdx = 0;
    const useEn = (typeof adminLang !== 'undefined' && adminLang === 'en');
    dd.innerHTML = combined.map((h, i) =>
      '<div class="menu-search-item' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '">' +
        '<span style="display:inline-block;min-width:90px;font-size:10px;font-weight:700;color:#6b7280;background:#f3f4f6;padding:2px 6px;border-radius:10px;text-align:center;">' + _escSb(useEn ? h.kindLabelEn : h.kindLabelKo) + '</span>' +
        '<span style="flex:1;">' + _highlight(h.label || '', q) + '</span>' +
        (h.sub ? '<span style="font-size:11px;color:#9ca3af;">' + _escSb(h.sub) + '</span>' : '') +
      '</div>'
    ).join('');
    dd.classList.add('show');
  }
  input.addEventListener('focus', () => {
    if (input.value.trim()) renderSearchDropdown(input.value);
  });
  input.addEventListener('blur', () => {
    // 포커스 잃으면 자동 호출 취소 (다른 곳 클릭 시 의도 흐트러짐 방지)
    setTimeout(_cancelAiAuto, 200);
  });
  input.addEventListener('keydown', (e) => {
    const items = dd.querySelectorAll('.menu-search-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _searchActiveIdx = Math.min(items.length - 1, _searchActiveIdx + 1);
      items.forEach((el, i) => el.classList.toggle('active', i === _searchActiveIdx));
      const cur = items[_searchActiveIdx]; if (cur) cur.scrollIntoView({block:'nearest'});
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _searchActiveIdx = Math.max(0, _searchActiveIdx - 1);
      items.forEach((el, i) => el.classList.toggle('active', i === _searchActiveIdx));
      const cur = items[_searchActiveIdx]; if (cur) cur.scrollIntoView({block:'nearest'});
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = _searchActiveIdx >= 0 ? _searchActiveIdx : 0;
      const hit = _searchCurrentHits[idx];
      // 🥭 Phase 21 — 드롭다운 매칭 있으면 메뉴 점프, 없으면 AI 명령으로 위임
      if (hit && typeof hit.action === 'function') {
        hit.action();
        dd.classList.remove('show');
        input.blur();
      } else {
        const q = (input.value || '').trim();
        if (q && typeof askAI === 'function') {
          dd.classList.remove('show');
          askAI(q);
        }
      }
    } else if (e.key === 'Escape') {
      dd.classList.remove('show'); input.blur();
    }
  });
  // 드롭다운 항목 클릭
  dd.addEventListener('click', (ev) => {
    const item = ev.target.closest('.menu-search-item');
    if (!item) return;
    const idx = parseInt(item.dataset.idx, 10);
    const hit = _searchCurrentHits[idx];
    if (hit && typeof hit.action === 'function') {
      hit.action();
      dd.classList.remove('show');
      input.value = '';
    }
  });
  // 외부 클릭 시 닫기
  document.addEventListener('click', (ev) => {
    if (!input.contains(ev.target) && !dd.contains(ev.target)) {
      dd.classList.remove('show');
    }
  });
  // 지우기 버튼
  if (clear) clear.addEventListener('click', () => {
    input.value = '';
    dd.classList.remove('show');
    _syncGoIcon();
    input.focus();
  });
  // 음성검색 등 프로그램적으로 값이 바뀌어도 아이콘 동기화
  input.addEventListener('change', _syncGoIcon);
  _syncGoIcon();
})();

/* ════════════════════════════════════════════════════════════
   🥭 Phase 21 — AI 명령 호출 + 응답 패널 렌더링
   - askAI(command): /api/admin/ai-command 호출 → intent 별 분기
   - 4가지 intent 처리:
     · answer    → 텍스트 답변 표시
     · navigate  → window.location 이동 (사용자 확인 짧게)
     · query     → 도구 결과를 데이터 카드/표로 렌더
     · action    → 빨간 확인 다이얼로그 → confirm 시 /api/admin/ai-action 실행
   ════════════════════════════════════════════════════════════ */
function _aiPanelOpen() {
  const p = document.getElementById('ai-panel');
  if (p) p.style.display = 'block';
}
function _aiPanelClose() {
  const p = document.getElementById('ai-panel');
  if (p) p.style.display = 'none';
  const c = document.getElementById('ai-content');
  if (c) c.innerHTML = '';
}
function _aiSetLoading(on, title) {
  const ld = document.getElementById('ai-loading');
  const ct = document.getElementById('ai-content');
  const tt = document.getElementById('ai-panel-title');
  if (ld) ld.style.display = on ? 'flex' : 'none';
  if (ct && on) ct.innerHTML = '';
  if (tt && title) tt.textContent = title;
}
function _aiEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  ));
}
function _aiFmtNum(n) {
  return (typeof n === 'number') ? n.toLocaleString('ko-KR') : _aiEsc(n);
}

// query 결과를 도구별로 보기 좋게 렌더
function _aiRenderQueryResult(tool, result, args) {
  if (!result) return '<div class="ai-error">결과가 비어있습니다.</div>';
  if (result.error) return '<div class="ai-error">오류: ' + _aiEsc(result.error) + '</div>';

  if (tool === 'today_stats') {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
        <div class="card" style="border-left:4px solid #f59e0b"><div class="card-label">📅 매출</div><div class="card-value">₩${_aiFmtNum(result.revenue_krw)}</div></div>
        <div class="card" style="border-left:4px solid #10b981"><div class="card-label">👥 학생수</div><div class="card-value">${_aiFmtNum(result.attended)}/${_aiFmtNum(result.active_students)}</div></div>
        <div class="card" style="border-left:4px solid #ef4444"><div class="card-label">🚫 결석률</div><div class="card-value">${result.absence_rate_pct}%</div></div>
        <div class="card" style="border-left:4px solid #3b82f6"><div class="card-label">✨ 신규</div><div class="card-value">${_aiFmtNum(result.new_signups)}</div></div>
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-top:8px">기준일: ${_aiEsc(result.date)} (KST)</div>
    `;
  }

  if (tool === 'weekly_dashboard') {
    return `
      <div>최근 7일 — 총 세션 <b>${_aiFmtNum(result.total_sessions)}</b>회 ·
        재연결 <b>${_aiFmtNum(result.total_disconnects)}</b>회 ·
        평균 발화 <b>${result.avg_speaking_pct}%</b></div>
    `;
  }

  if (tool === 'find_student') {
    if (!result.matches || result.matches.length === 0) {
      return '<div class="ai-error">"' + _aiEsc(args?.q || '') + '" 검색 결과 없음</div>';
    }
    let html = '<div class="ai-tool-name">🔍 학생 검색 — ' + result.count + '명</div><table>'
      + '<tr><th>UID</th><th>한글</th><th>영문</th><th>상태</th><th>가입일</th><th></th></tr>';
    for (const s of result.matches) {
      const uidEnc = encodeURIComponent(s.user_id || '');
      html += '<tr>'
        + '<td><code>' + _aiEsc(s.user_id) + '</code></td>'
        + '<td>' + _aiEsc(s.korean_name) + '</td>'
        + '<td>' + _aiEsc(s.english_name) + '</td>'
        + '<td>' + _aiEsc(s.status) + '</td>'
        + '<td>' + _aiEsc(s.signup_date) + '</td>'
        + '<td><a href="/admin/student.html?uid=' + uidEnc + '" style="color:#f59e0b">상세 →</a></td>'
        + '</tr>';
    }
    html += '</table>';
    return html;
  }

  if (tool === 'revenue') {
    if (!result.items || result.items.length === 0) return '<div class="ai-error">매출 데이터 없음</div>';
    let html = '<div class="ai-tool-name">💰 매출 (' + _aiEsc(result.period) + ')</div><table>'
      + '<tr><th>기간</th><th style="text-align:right">매출</th></tr>';
    for (const r of result.items) {
      html += '<tr><td>' + _aiEsc(r.label) + '</td><td style="text-align:right">₩' + _aiFmtNum(r.revenue) + '</td></tr>';
    }
    html += '</table>';
    return html;
  }

  if (tool === 'active_rooms') {
    if (!result.rooms || result.rooms.length === 0) return '<div class="ai-error">현재 활성 수업 없음</div>';
    let html = '<div class="ai-tool-name">📡 활성 방 — ' + result.count + '개</div><table>'
      + '<tr><th>방 ID</th><th>참여자</th><th>시작</th></tr>';
    for (const r of result.rooms) {
      html += '<tr><td><code>' + _aiEsc(r.room_id) + '</code></td><td>' + _aiFmtNum(r.users) + '명</td><td>'
           + new Date(r.started_at).toLocaleString('ko-KR') + '</td></tr>';
    }
    html += '</table>';
    return html;
  }

  if (tool === 'recent_recordings') {
    if (!result.recordings || result.recordings.length === 0) return '<div class="ai-error">녹화 데이터 없음</div>';
    let html = '<div class="ai-tool-name">🎬 최근 녹화 — ' + result.count + '개</div><table>'
      + '<tr><th>방</th><th>학생</th><th>시작</th><th>길이</th><th>크기</th></tr>';
    for (const r of result.recordings) {
      const dur = r.duration_ms ? Math.round(r.duration_ms/60000) + '분' : '—';
      const sz = r.size_bytes ? (r.size_bytes/1048576).toFixed(1) + 'MB' : '—';
      html += '<tr><td><code>' + _aiEsc(r.room_id) + '</code></td><td>' + _aiEsc(r.user_id) + '</td>'
           + '<td>' + new Date(r.started_at).toLocaleString('ko-KR') + '</td>'
           + '<td>' + dur + '</td><td>' + sz + '</td></tr>';
    }
    html += '</table>';
    return html;
  }

  // fallback — JSON 그대로
  return '<pre style="font-size:12px;background:#f9fafb;padding:10px;border-radius:6px;overflow:auto">'
       + _aiEsc(JSON.stringify(result, null, 2)) + '</pre>';
}

async function askAI(command) {
  _aiPanelOpen();
  _aiSetLoading(true, '🤖 AI 처리 중…');

  let res;
  try {
    const r = await fetch('/api/admin/ai-command', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    });
    res = await r.json();
  } catch (e) {
    _aiSetLoading(false, '⚠️ 오류');
    document.getElementById('ai-content').innerHTML =
      '<div class="ai-error">AI 호출 실패: ' + _aiEsc(String(e && e.message || e)) + '</div>';
    return;
  }
  _aiSetLoading(false, '🤖 AI 응답');

  const ct = document.getElementById('ai-content');
  if (!res || res.ok === false) {
    ct.innerHTML = '<div class="ai-error">' + _aiEsc(res?.error || '알 수 없는 오류') +
      (res?.detail ? ' — ' + _aiEsc(res.detail) : '') + '</div>';
    return;
  }

  // intent 분기
  if (res.intent === 'answer') {
    ct.innerHTML = '<div class="ai-answer">' + _aiEsc(res.answer || '') + '</div>';
    return;
  }

  if (res.intent === 'navigate') {
    // 🥭 Phase 21h/21i — 3가지 navigate 방식 분기:
    //   ① external_url → 새 탭 열기 시도 + 차단 대비 큰 버튼 fallback
    //   ② menu_id      → 같은 페이지의 메뉴 카드로 스크롤
    //   ③ url          → 같은 탭에서 이동 (window.location)
    if (res.external_url) {
      // 팝업 차단을 우회하기 어려우므로 패널에 명시적 큰 버튼을 항상 표시
      ct.innerHTML =
        '<div class="ai-answer">' + _aiEsc(res.answer || '외부 링크를 엽니다…') + '</div>' +
        '<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">' +
          '<a href="' + _aiEsc(res.external_url) + '" target="_blank" rel="noopener" ' +
             'class="ai-action-confirm-btn" ' +
             'style="display:inline-flex;align-items:center;justify-content:center;gap:8px;' +
                    'padding:14px 22px;background:linear-gradient(135deg,#fbbf24,#f59e0b);' +
                    'color:#fff;border-radius:12px;text-decoration:none;font-weight:700;' +
                    'font-size:15px;box-shadow:0 8px 20px -6px rgba(245,158,11,0.5)">' +
            '🔗 새 탭에서 열기 — ' + _aiEsc(new URL(res.external_url).hostname) +
          '</a>' +
          '<div style="font-size:11px;color:#9ca3af;text-align:center">' +
            '브라우저 팝업이 차단된 경우 위 버튼을 클릭하세요' +
          '</div>' +
        '</div>';
      // 자동 팝업도 시도 (허용된 경우 즉시 열림)
      setTimeout(() => {
        try {
          /* 🔴 2026-09-02: 'noopener' 를 기능 문자열로 주면 «탭은 열리는데 반환값이 null» 이라(표준) 반환값 판정이 늘 «막힘» 이 된다. 빼고 w.opener=null 로 같은 보호를 건다. */
          const w = window.open(res.external_url, '_blank');
          if (w) { try { w.opener = null; } catch (e) {} }
          // 자동 열기 성공하면 패널의 버튼은 그대로 두 (사용자가 닫고 다시 열 수 있게)
          if (!w) console.info('[ai-navigate] popup blocked — fallback button shown');
        } catch (e) {
          console.warn('[ai-navigate] window.open failed:', e);
        }
      }, 300);
      return;
    }
    ct.innerHTML = '<div class="ai-answer">' + _aiEsc(res.answer || '페이지로 이동합니다…') + '</div>';
    if (res.menu_id) {
      // 🥭 Phase 21k — 단계 분리:
      //  ① 즉시 legacy-cards 펼침 (display:block 적용)
      //  ② 부모 details 들도 모두 open
      //  ③ 200ms 대기 (layout 완성 대기)
      //  ④ scrollIntoView + 노란 펄스 강조
      //  ⑤ 카드를 못 찾으면 콘솔 경고 + 에러 메시지 추가
      const card = document.getElementById(res.menu_id);
      if (!card) {
        console.warn('[ai-navigate] menu_id not found:', res.menu_id);
        const ct2 = document.getElementById('ai-content');
        if (ct2) ct2.insertAdjacentHTML('beforeend',
          '<div class="ai-error" style="margin-top:10px">⚠️ 메뉴 카드 "' + _aiEsc(res.menu_id) +
          '" 을 페이지에서 찾을 수 없습니다. (HTML 갱신 필요)</div>');
        return;
      }
      // ① legacy-cards 펼침 (toggleLegacyCards 가 details 컨테이너 펼침)
      const lc = document.getElementById('legacy-cards');
      if (lc && !lc.classList.contains('legacy-show')) {
        if (typeof toggleLegacyCards === 'function') {
          toggleLegacyCards();
        } else {
          lc.classList.add('legacy-show');
        }
      }
      // ② 카드 자신 + 모든 조상 details 를 open 처리 (중첩 details 도 포함)
      if (card.tagName === 'DETAILS') card.open = true;
      let p = card.parentElement;
      while (p) {
        if (p.tagName === 'DETAILS') p.open = true;
        if (p.id === 'legacy-cards') break;
        p = p.parentElement;
      }
      // ③ 200ms 대기 후 스크롤 — layout reflow 시간 확보
      setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // ④ 노란 펄스 강조 (3초간)
        card.style.transition = 'box-shadow 0.6s';
        card.style.boxShadow = '0 0 0 4px rgba(245, 158, 11, 0.6), 0 12px 32px -8px rgba(245, 158, 11, 0.4)';
        setTimeout(() => { card.style.boxShadow = ''; }, 3000);
      }, 200);
    } else {
      setTimeout(() => { window.location.href = res.url || '/admin.html'; }, 600);
    }
    return;
  }

  if (res.intent === 'query') {
    let html = '';
    if (res.answer) html += '<div class="ai-answer" style="margin-bottom:10px">' + _aiEsc(res.answer) + '</div>';
    html += _aiRenderQueryResult(res.tool, res.result, res.args);
    ct.innerHTML = html;
    return;
  }

  if (res.intent === 'action') {
    const argsJson = JSON.stringify(res.args || {});
    ct.innerHTML =
      '<div class="ai-answer">' + _aiEsc(res.answer || '') + '</div>' +
      '<div class="ai-action-confirm">' +
        '<div class="label">⚠️ 확인이 필요한 작업</div>' +
        '<div>' + _aiEsc(res.confirm_text || '실행하시겠습니까?') + '</div>' +
        '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:#9ca3af">실행 상세</summary>' +
        '<pre style="font-size:11px;background:#f9fafb;padding:8px;border-radius:6px;margin-top:6px">' +
        _aiEsc(JSON.stringify({name: res.name, args: res.args}, null, 2)) +
        '</pre></details>' +
        '<div class="ai-action-buttons">' +
          '<button class="ai-action-confirm-btn" onclick="executeAiAction(' +
            "'" + _aiEsc(res.name) + "'," + _aiEsc(argsJson).replace(/'/g, "&#39;") + ')">실행</button>' +
          '<button class="ai-action-cancel-btn" onclick="_aiPanelClose()">취소</button>' +
        '</div>' +
      '</div>';
    return;
  }

  // 🥭 Phase 22 — schedule_plan: AI 가 자연어에서 다건 스케줄 파싱한 결과를 카드로 표시
  if (res.intent === 'schedule_plan') {
    const items = Array.isArray(res.items) ? res.items : [];
    const dayNames = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금', sat:'토', sun:'일' };
    const actionNames = {
      register_recurring: '🆕 정규수업 등록',
      schedule_one_off:   '📅 단일 일정 등록',
      change_schedule:    '🔄 스케줄 변경',
      postpone_class:     '⏸ 수업 연기',
    };
    const typeNames = { regular:'정규수업', level_test:'레벨테스트', trial:'체험수업' };
    const typeColor = { regular:'#3b82f6', level_test:'#f59e0b', trial:'#10b981' };
    let html = '<div class="ai-answer">' + _aiEsc(res.answer || 'AI가 스케줄을 파싱했습니다') + '</div>';
    if (items.length === 0) {
      html += '<div class="ai-error" style="margin-top:10px">⚠️ 파싱된 스케줄이 없습니다. 학생명·요일·시간을 명확히 다시 입력해 주세요.</div>';
      ct.innerHTML = html;
      return;
    }
    html += '<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">';
    items.forEach((it, idx) => {
      const dayList = Array.isArray(it.days) ? it.days.map(d => dayNames[d] || d).join('·') : '';
      const tColor = typeColor[it.type] || '#6b7280';
      html += '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
          '<span style="font-size:11px;color:#6b7280;font-weight:600">#' + (idx+1) + '</span>' +
          '<span style="font-size:13px;font-weight:700;color:#111827">' + _aiEsc(actionNames[it.action] || it.action) + '</span>' +
          '<span style="margin-left:auto;background:' + tColor + ';color:#fff;font-size:10px;padding:2px 8px;border-radius:8px;font-weight:700">' +
            _aiEsc(typeNames[it.type] || it.type) + '</span>' +
        '</div>' +
        '<div style="font-size:14px;color:#374151;line-height:1.6">' +
          '<b style="color:#111827">' + _aiEsc(it.student_name) + '</b> 학생' +
          (dayList ? ' · 매주 <b>' + _aiEsc(dayList) + '</b>요일' : '') +
          (it.date ? ' · <b>' + _aiEsc(it.date) + '</b>' : '') +
          (it.time ? ' · <b>' + _aiEsc(it.time) + '</b>' : '') +
        '</div>' +
        '<div style="font-size:11px;color:#9ca3af;margin-top:4px">' + _aiEsc(it.label || '') + '</div>' +
      '</div>';
    });
    html += '</div>';
    const argsJson = JSON.stringify({ items: items });
    html += '<div class="ai-action-confirm" style="margin-top:14px">' +
      '<div class="label">⚠️ ' + _aiEsc(res.confirm_text || items.length + '건을 등록할까요?') + '</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:4px">학생 이름이 DB에 등록되어 있어야 합니다. 미등록 학생은 결과에 따로 표시됩니다.</div>' +
      '<div class="ai-action-buttons">' +
        '<button class="ai-action-confirm-btn" onclick="executeAiAction(\'schedule_batch\',' + _aiEsc(argsJson).replace(/'/g, "&#39;") + ')">' + items.length + '건 모두 등록</button>' +
        '<button class="ai-action-cancel-btn" onclick="_aiPanelClose()">취소</button>' +
      '</div>' +
    '</div>';
    ct.innerHTML = html;
    return;
  }

  // 🥭 Phase 4-3 — bulk_modify: 일괄 변경/취소/연기 미리보기 → 확인 → bulk_apply 실행
  if (res.intent === 'bulk_modify') {
    const opNames = { postpone:'⏸ 일괄 연기', cancel:'🗑 일괄 취소', reschedule:'🔄 일괄 시간 이동' };
    const dayNames = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금', sat:'토', sun:'일' };
    const c = res.criteria || {};
    let html = '<div class="ai-answer" style="font-size:15px">' + _aiEsc(res.answer || '') + '</div>';
    html += '<div style="margin-top:12px;border:1px solid #e5e7eb;border-radius:10px;padding:14px;background:#fff">';
    html += '<div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:10px">' + _aiEsc(opNames[res.operation] || res.operation) + '</div>';
    html += '<div style="font-size:13px;color:#374151;line-height:1.8">';
    if (c.student_name) html += '👤 학생: <b>' + _aiEsc(c.student_name) + '</b><br>';
    if (c.teacher_name) html += '🧑‍🏫 강사: <b>' + _aiEsc(c.teacher_name) + '</b><br>';
    if (Array.isArray(c.days) && c.days.length) html += '🔁 요일: <b>' + c.days.map(d => dayNames[d]||d).join('·') + '</b><br>';
    if (c.time) html += '🕐 시간: <b>' + _aiEsc(c.time) + '</b><br>';
    if (c.date_from || c.date_to) html += '📅 기간: <b>' + (c.date_from||'~') + ' ~ ' + (c.date_to||'~') + '</b><br>';
    if (res.operation === 'reschedule') {
      if (res.shift_minutes) html += '⏩ 이동: <b>' + (res.shift_minutes>0?'+':'') + res.shift_minutes + '분</b> (' + (res.shift_minutes>0?'뒤로':'앞으로') + ')<br>';
      if (res.new_time) html += '🆕 새 시간: <b>' + _aiEsc(res.new_time) + '</b><br>';
    }
    html += '</div></div>';
    const argsJson = JSON.stringify({
      operation: res.operation,
      criteria: c,
      shift_minutes: res.shift_minutes || 0,
      new_time: res.new_time || null
    });
    html += '<div class="ai-action-confirm" style="margin-top:14px">' +
      '<div class="label">⚠️ ' + _aiEsc(res.confirm_text || '실행할까요?') + '</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:4px">조건에 맞는 활성 스케줄 모두 한 번에 처리됩니다 (취소는 soft-delete, 복구 가능)</div>' +
      '<div class="ai-action-buttons">' +
        '<button class="ai-action-confirm-btn" onclick="executeAiAction(\'bulk_apply\',' + _aiEsc(argsJson).replace(/\'/g, "&#39;") + ')">실행</button>' +
        '<button class="ai-action-cancel-btn" onclick="_aiPanelClose()">취소</button>' +
      '</div>' +
    '</div>';
    ct.innerHTML = html;
    return;
  }

  ct.innerHTML = '<div class="ai-error">알 수 없는 intent: ' + _aiEsc(res.intent) + '</div>';
}

// 사용자 확인 후 액션 실행
async function executeAiAction(name, args) {
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { args = {}; }
  }
  _aiSetLoading(true, '실행 중…');
  try {
    const r = await fetch('/api/admin/ai-action', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, args })
    });
    const j = await r.json();
    _aiSetLoading(false, '✅ 완료');
    const ct = document.getElementById('ai-content');
    if (!j.ok) {
      ct.innerHTML = '<div class="ai-error">실행 실패: ' + _aiEsc(j.error || '알 수 없는 오류') + '</div>';
      return;
    }

    // 🥭 schedule_batch 결과는 사람 친화적 카드로 표시 (JSON 원본 X)
    if (name === 'schedule_batch' && Array.isArray(j.items)) {
      const items = j.items;
      // Phase 3: status 종류 확장 - inserted, inserted_auto_created, inserted_with_conflict, insert_failed, student_not_found_in_db
      const ok = items.filter(x => x.status && x.status.startsWith('inserted'));
      const notFound = items.filter(x => x.status === 'student_not_found_in_db');
      const conflicts = items.filter(x => x.conflict_with);
      const autoCreatedItems = items.filter(x => x.auto_created);
      const dayNames = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금', sat:'토', sun:'일' };
      const actionNames = {
        register_recurring: '🆕 정규수업 등록',
        schedule_one_off:   '📅 단일 일정 등록',
        change_schedule:    '🔄 스케줄 변경',
        postpone_class:     '⏸ 수업 연기',
      };
      const typeNames = { regular:'정규수업', level_test:'레벨테스트', trial:'체험수업' };
      const typeColor = { regular:'#3b82f6', level_test:'#f59e0b', trial:'#10b981' };
      // type 별 등록 카운트 (체험/레벨 누락 진단용)
      const typeCount = { regular: 0, trial: 0, level_test: 0 };
      ok.forEach(x => { if (typeCount[x.type] !== undefined) typeCount[x.type]++; });
      let html = '<div class="ai-answer" style="font-size:15px">' +
        '✅ <b>' + items.length + '건</b> 처리 완료 ' +
        '<span style="color:#10b981">(등록 ' + ok.length + ')</span>' +
        (autoCreatedItems.length ? ' <span style="color:#8b5cf6">(🤖 학생 자동등록 ' + autoCreatedItems.length + ')</span>' : '') +
        (conflicts.length ? ' <span style="color:#f59e0b">(⚠️ 시간 충돌 ' + conflicts.length + ')</span>' : '') +
        (notFound.length ? ' <span style="color:#ef4444">(미등록 학생 ' + notFound.length + ')</span>' : '') +
      '</div>';
      // 유형별 카운트 (정규/체험/레벨)
      if (ok.length > 0) {
        html += '<div style="margin-top:6px;font-size:12px;color:#6b7280">📊 유형별: ' +
          '<span style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700">정규 ' + typeCount.regular + '</span> ' +
          '<span style="background:#10b981;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;margin-left:4px">체험 ' + typeCount.trial + '</span> ' +
          '<span style="background:#3b82f6;color:#fff;padding:2px 8px;border-radius:6px;font-weight:700;margin-left:4px">레벨 ' + typeCount.level_test + '</span>' +
        '</div>';
      }
      // 등록된 게 1건 이상이면 즉시 캘린더 확인 안내 + 전체 스케줄 페이지 링크
      if (ok.length > 0) {
        html += '<div style="margin-top:8px;padding:10px 14px;background:linear-gradient(135deg,rgba(14,165,233,0.1),rgba(3,105,161,0.1));border:1px solid rgba(14,165,233,0.3);border-radius:10px;display:flex;align-items:center;gap:10px;font-size:13px;color:#0c4a6e">' +
          '<span>📌 <b>' + ok.length + '건이 캘린더에 즉시 반영되었습니다.</b> 각 학생의 캘린더에서 ⭐ 점선 블록으로 표시됩니다.</span>' +
          '<a href="/admin/weekly-schedule.html" target="_blank" style="margin-left:auto;background:#0369a1;color:#fff;padding:6px 14px;border-radius:8px;font-weight:700;text-decoration:none;font-size:12px">📅 학원 전체 캘린더 →</a>' +
        '</div>';
      }

      // 등록 성공 카드들
      if (ok.length) {
        html += '<div style="margin-top:12px"><div style="font-size:12px;color:#10b981;font-weight:700;margin-bottom:6px">✅ 등록 완료</div><div style="display:flex;flex-direction:column;gap:8px">';
        ok.forEach(it => {
          const dayList = Array.isArray(it.days) ? it.days.map(d => dayNames[d] || d).join('·') : '';
          const tColor = typeColor[it.type] || '#6b7280';
          html += '<div style="border:1px solid #d1fae5;border-left:4px solid #10b981;border-radius:8px;padding:10px 14px;background:#f0fdf4">' +
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">' +
              '<span style="font-size:13px;font-weight:700;color:#111827">' + _aiEsc(actionNames[it.action] || it.action) + '</span>' +
              (it.auto_created ? '<span style="background:#8b5cf6;color:#fff;font-size:10px;padding:2px 8px;border-radius:8px;font-weight:700">🤖 자동등록</span>' : '') +
              (it.conflict_with ? '<span style="background:#f59e0b;color:#fff;font-size:10px;padding:2px 8px;border-radius:8px;font-weight:700" title="기존 schedule_id=' + it.conflict_with.id + ' 와 시간 겹침">⚠️ 충돌</span>' : '') +
              '<span style="margin-left:auto;background:' + tColor + ';color:#fff;font-size:10px;padding:2px 8px;border-radius:8px;font-weight:700">' + _aiEsc(typeNames[it.type] || it.type) + '</span>' +
            '</div>' +
            '<div style="font-size:14px;color:#374151">' +
              '<a href="/admin/student.html?uid=' + encodeURIComponent(it.resolved_user_id) + '" style="color:#1d4ed8;font-weight:700;text-decoration:none">' +
              _aiEsc(it.student_name) + '</a> 학생' +
              (it.resolved_teacher_name ? ' · 강사 <b>' + _aiEsc(it.resolved_teacher_name) + '</b>' : '') +
              (dayList ? ' · 매주 <b>' + _aiEsc(dayList) + '</b>요일' : '') +
              (it.date ? ' · <b>' + _aiEsc(it.date) + '</b>' : '') +
              (it.time ? ' · <b>' + _aiEsc(it.time) + '</b>' : '') +
            '</div>' +
            '<div style="font-size:11px;color:#6b7280;margin-top:3px;display:flex;align-items:center;gap:8px">' +
              '<span>학생ID: ' + _aiEsc(it.resolved_user_id) + '</span>' +
              '<a href="/admin/student.html?uid=' + encodeURIComponent(it.resolved_user_id) + '&tab=schedule" target="_blank" style="margin-left:auto;background:#0ea5e9;color:#fff;padding:3px 10px;border-radius:6px;font-weight:700;font-size:11px;text-decoration:none">📅 캘린더에서 확인</a>' +
            '</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      // INSERT 실패한 항목 (학생은 있는데 class_schedules INSERT 실패)
      const insertFailed = items.filter(x => x.status === 'insert_failed');
      if (insertFailed.length) {
        html += '<div style="margin-top:14px"><div style="font-size:12px;color:#dc2626;font-weight:700;margin-bottom:6px">❌ 스케줄 등록 실패</div><div style="display:flex;flex-direction:column;gap:8px">';
        insertFailed.forEach(it => {
          html += '<div style="border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:8px;padding:10px 14px;background:#fef2f2;font-size:13px">' +
            '<b style="color:#991b1b">' + _aiEsc(it.student_name) + '</b> 학생 (ID: ' + _aiEsc(it.resolved_user_id||'?') + ')' +
            '<div style="font-size:11.5px;color:#7f1d1d;margin-top:4px">' + _aiEsc(it.error || '알 수 없는 INSERT 오류') + '</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      // 미등록 학생 안내
      if (notFound.length) {
        html += '<div style="margin-top:14px"><div style="font-size:12px;color:#ef4444;font-weight:700;margin-bottom:6px">⚠️ 학생 DB 등록 필요</div><div style="display:flex;flex-direction:column;gap:8px">';
        notFound.forEach(it => {
          const dayList = Array.isArray(it.days) ? it.days.map(d => dayNames[d] || d).join('·') : '';
          html += '<div style="border:1px solid #fecaca;border-left:4px solid #ef4444;border-radius:8px;padding:10px 14px;background:#fef2f2">' +
            '<div style="font-size:14px;color:#991b1b">' +
              '<b>' + _aiEsc(it.student_name) + '</b> 학생을 DB에서 찾을 수 없습니다.' +
            '</div>' +
            '<div style="font-size:12px;color:#7f1d1d;margin-top:3px">' +
              '요청: ' +
              (dayList ? '매주 ' + _aiEsc(dayList) + '요일 ' : '') +
              (it.date ? _aiEsc(it.date) + ' ' : '') +
              (it.time ? _aiEsc(it.time) + ' ' : '') +
              _aiEsc(typeNames[it.type] || it.type) +
            '</div>' +
            '<div style="font-size:11px;color:#9ca3af;margin-top:6px">→ 학생관리에서 먼저 학생을 등록한 뒤 다시 시도해 주세요.</div>' +
          '</div>';
        });
        html += '</div></div>';
      }

      // 액션 버튼들 (Phase 3: 미등록 학생 자동등록 + 재시도)
      html += '<div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">' +
        '<a href="/admin.html#card-students-mgmt" class="ai-action-confirm-btn" style="flex:1;min-width:140px;text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px">👥 학생관리 열기</a>';
      // 미등록 학생이 있으면 신청양식 + 빠른 자동등록 버튼 (Phase 3-3 + Phase 5)
      if (notFound.length) {
        const retryItems = notFound.map(x => ({ action: x.action, student_name: x.student_name, days: x.days, date: x.date, time: x.time, type: x.type, label: x.label }));
        const retryArgsJson = JSON.stringify({ items: retryItems, auto_create_students: true });
        const formItemsJson = JSON.stringify(retryItems);
        html += '<button class="ai-action-confirm-btn" onclick="openNewStudentForm(' + _aiEsc(formItemsJson).replace(/\'/g, "&#39;") + ')" style="flex:1;min-width:200px;background:linear-gradient(135deg,#0ea5e9,#0369a1);display:inline-flex;align-items:center;justify-content:center;gap:6px">📝 ' + notFound.length + '명 신청서 작성 후 등록</button>' +
          '<button class="ai-action-cancel-btn" onclick="executeAiAction(\'schedule_batch\',' + _aiEsc(retryArgsJson).replace(/\'/g, "&#39;") + ')" style="flex:1;min-width:140px;background:rgba(139,92,246,0.1);color:#7c3aed;border-color:#a855f7;display:inline-flex;align-items:center;justify-content:center;gap:6px" title="이름만 입력된 임시 학생으로 빠르게 등록">⚡ 빠른 자동등록</button>';
      }
      html += '<button class="ai-action-cancel-btn" onclick="_aiPanelClose()" style="flex:0 0 80px">닫기</button>' +
      '</div>';

      // Phase 1 안내 (작게)
      if (j.note) {
        html += '<details style="margin-top:14px"><summary style="cursor:pointer;font-size:11px;color:#9ca3af">📌 Phase 1 안내 + 원본 응답</summary>' +
          '<div style="font-size:11px;color:#6b7280;margin-top:6px">' + _aiEsc(j.note) + '</div>' +
          '<pre style="font-size:10px;background:#f9fafb;padding:8px;border-radius:6px;margin-top:6px;overflow:auto">' +
          _aiEsc(JSON.stringify(j, null, 2)) + '</pre>' +
        '</details>';
      }

      ct.innerHTML = html;
      return;
    }

    // 🥭 Phase 4-3 — bulk_apply 결과를 사람 친화적 카드로
    if (name === 'bulk_apply' && Array.isArray(j.items)) {
      const opVerb = { cancelled:'취소됨', postponed:'연기됨', rescheduled:'시간 변경됨' };
      let html = '<div class="ai-answer" style="font-size:15px">' +
        '✅ <b>' + (j.matched_count||0) + '건</b> 매칭 / <b style="color:#10b981">' + (j.updated_count||0) + '건</b> 처리 완료' +
      '</div>';
      if (j.items.length) {
        html += '<div style="margin-top:12px;display:flex;flex-direction:column;gap:6px">';
        j.items.forEach(it => {
          html += '<div style="border:1px solid #d1fae5;border-left:4px solid #10b981;border-radius:8px;padding:8px 12px;background:#f0fdf4;font-size:13px">' +
            'ID #' + it.id + ' · <b>' + _aiEsc(opVerb[it.action] || it.action) + '</b>' +
            (it.old_time ? ' · ' + it.old_time + (it.new_time ? ' → <b>' + it.new_time + '</b>' : '') : '') +
          '</div>';
        });
        html += '</div>';
      }
      html += '<div style="margin-top:14px;display:flex;gap:10px">' +
        '<a href="/admin/weekly-schedule.html" class="ai-action-confirm-btn" style="flex:1;text-align:center;text-decoration:none">📅 전체 스케줄 보기</a>' +
        '<button class="ai-action-cancel-btn" onclick="_aiPanelClose()">닫기</button>' +
      '</div>';
      ct.innerHTML = html;
      return;
    }

    // 일반 액션 결과 (기존)
    ct.innerHTML = '<div class="ai-answer">✅ <b>' + _aiEsc(name) + '</b> 실행 완료.</div>' +
      '<pre style="font-size:11px;background:#f0fdf4;padding:10px;border-radius:6px;margin-top:8px">' +
      _aiEsc(JSON.stringify(j, null, 2)) + '</pre>';
  } catch (e) {
    _aiSetLoading(false, '⚠️ 오류');
    document.getElementById('ai-content').innerHTML =
      '<div class="ai-error">실행 중 오류: ' + _aiEsc(String(e && e.message || e)) + '</div>';
  }
}

// 🥭 Phase 5 — 신규학생 신청양식 모달 (미등록 학생 정보 입력 → 등록 + 스케줄 배정)
window.openNewStudentForm = function(items) {
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
  if (!Array.isArray(items) || items.length === 0) return;
  const dayNames = { mon:'월', tue:'화', wed:'수', thu:'목', fri:'금', sat:'토', sun:'일' };
  const typeNames = { regular:'정규수업', level_test:'레벨테스트', trial:'체험수업' };
  function escAttr(s){ return String(s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  // Phase 7i: 동일 student_name 으로 그룹화 → 1명당 1개 fieldset, 스케줄은 리스트로
  const groups = {};
  items.forEach(it => {
    const key = String(it.student_name || '').trim();
    if (!key) return;
    if (!groups[key]) groups[key] = { name: key, items: [] };
    groups[key].items.push(it);
  });
  const groupNames = Object.keys(groups);

  const existing = document.getElementById('newStudentFormBg');
  if (existing) existing.remove();
  const bg = document.createElement('div');
  bg.id = 'newStudentFormBg';
  bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
  let html = '<div style="background:#fff;border-radius:14px;max-width:760px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,0.4)">';
  html += '<div style="padding:18px 22px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#0ea5e9,#0369a1);color:#fff;border-radius:14px 14px 0 0">';
  html += '<span style="font-size:18px;font-weight:700">📝 신규학생 등록 + 스케줄 배정</span>';
  html += '<span style="margin-left:auto;font-size:12px;opacity:.85">' + groupNames.length + '명 학생 · 총 ' + items.length + '건 스케줄</span>';
  html += '<button onclick="closeNewStudentForm()" style="background:transparent;border:none;color:#fff;font-size:22px;cursor:pointer;padding:0 6px">✕</button>';
  html += '</div>';
  html += '<div style="padding:18px 22px;background:#f9fafb;border-bottom:1px solid #e5e7eb;font-size:12.5px;color:#374151;line-height:1.55">';
  html += '⚡ <b>아이디</b> · 학년 · 연락처 · 학부모 연락처 만 채우면 됩니다 (모두 선택입력 - 비워도 OK) · 동명 학생은 자동으로 한 신청서에 묶임';
  html += '</div>';
  html += '<form id="newStudentFormBody" onsubmit="return submitNewStudentForm(event)" style="padding:18px 22px">';

  groupNames.forEach((name, gIdx) => {
    const grp = groups[name];
    html += '<fieldset style="border:1px solid #d1d5db;border-radius:10px;padding:14px 16px;margin-bottom:14px;background:#fff">';
    html += '<legend style="font-weight:700;font-size:14px;color:#0369a1;padding:0 8px">학생 #' + (gIdx+1) + ': ' + escAttr(name) + ' <span style="font-weight:500;color:#6b7280;font-size:12px">(스케줄 ' + grp.items.length + '건)</span></legend>';
    // 스케줄 리스트
    html += '<div style="margin-bottom:12px">';
    grp.items.forEach(it => {
      const dayList = Array.isArray(it.days) ? it.days.map(d => dayNames[d]||d).join('·') : '';
      const sched = (dayList ? '매주 ' + dayList + '요일 ' : '') + (it.date ? it.date + ' ' : '') + (it.time||'') + ' · ' + (typeNames[it.type]||it.type);
      html += '<div style="font-size:11.5px;color:#6b7280;background:#f0f9ff;padding:6px 10px;border-radius:6px;margin-bottom:4px">📅 ' + escAttr(sched) + '</div>';
    });
    html += '</div>';
    // 학생 정보 입력
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">';
    html += '<label>학생명 (한글)<input type="text" name="korean_name_' + gIdx + '" value="' + escAttr(name) + '" readonly style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;background:#f3f4f6;margin-top:4px"></label>';
    html += '<label><b style="color:#0369a1">🆔 아이디 (login_id)</b><input type="text" name="login_id_' + gIdx + '" placeholder="예: mango_001 (비우면 자동 생성)" style="width:100%;padding:8px;border:1.5px solid #0ea5e9;border-radius:6px;margin-top:4px;background:#f0f9ff"></label>';
    html += '<label>학생명 (영문)<input type="text" name="english_name_' + gIdx + '" placeholder="예: Jung Wooyoung" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></label>';
    html += '<label>학년·생년<input type="text" name="grade_' + gIdx + '" placeholder="예: 초등 3학년" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></label>';
    html += '<label>학원/센터<input type="text" name="center_' + gIdx + '" placeholder="예: 강남센터" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></label>';
    html += '<label>학생 연락처<input type="tel" name="phone_' + gIdx + '" placeholder="010-0000-0000" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></label>';
    html += '<label>학부모 연락처<input type="tel" name="parent_phone_' + gIdx + '" placeholder="010-0000-0000" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px"></label>';
    html += '<label style="grid-column:1 / -1">메모<textarea name="notes_' + gIdx + '" rows="2" placeholder="알레르기, 학습목표 등" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin-top:4px;resize:vertical"></textarea></label>';
    html += '</div></fieldset>';
  });
  html += '<input type="hidden" name="__items" value="' + escAttr(JSON.stringify(items)) + '">';
  html += '<input type="hidden" name="__groups" value="' + escAttr(JSON.stringify(groupNames)) + '">';
  html += '<div style="display:flex;gap:10px;margin-top:8px">';
  html += '<button type="submit" style="flex:1;padding:13px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer">✅ ' + groupNames.length + '명 등록 + ' + items.length + '건 스케줄 배정 실행</button>';
  html += '<button type="button" onclick="closeNewStudentForm()" style="padding:13px 22px;background:#fff;color:#6b7280;border:1px solid #d1d5db;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer">취소</button>';
  html += '</div></form></div>';
  bg.innerHTML = html;
  document.body.appendChild(bg);
};

window.closeNewStudentForm = function(){
  const el = document.getElementById('newStudentFormBg');
  if (el) el.remove();
};

window.submitNewStudentForm = async function(ev) {
  ev.preventDefault();
  const form = ev.target;
  const items = JSON.parse(form.__items.value);
  const groupNames = JSON.parse(form.__groups?.value || '[]');
  // 폼 데이터 → student_meta { 학생명: {...} } (그룹 기준)
  const meta = {};
  groupNames.forEach((name, gIdx) => {
    meta[name] = {
      login_id:      form['login_id_'+gIdx]?.value.trim() || '',
      english_name:  form['english_name_'+gIdx]?.value.trim() || '',
      grade:         form['grade_'+gIdx]?.value.trim() || '',
      center:        form['center_'+gIdx]?.value.trim() || '',
      phone:         form['phone_'+gIdx]?.value.trim() || '',
      parent_phone:  form['parent_phone_'+gIdx]?.value.trim() || '',
      notes:         form['notes_'+gIdx]?.value.trim() || ''
    };
  });
  closeNewStudentForm();
  const args = { items: items, auto_create_students: true, student_meta: meta };
  await executeAiAction('schedule_batch', args);
  return false;
};

// 닫기 버튼
document.getElementById('ai-panel-close')?.addEventListener('click', _aiPanelClose);

// 사이드바 클릭 → 메뉴 점프 (이벤트 위임)
document.getElementById('admin-sidebar-list')?.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[data-menu-id]');
  if (!a) return;
  ev.preventDefault();
  jumpToMenu(a.dataset.menuId);
});

// 🎤 대시보드 진입 시 성우 음성 1 회 자동재생 — TTS·버튼 모두 제거, mp3 만
// 🗑️ (2026-07-22 사장님 지시 "심플하게") 진입 인사(안녕하세요 음성 mp3+말풍선) 완전 비활성.
//    금색 배너 제거 후에도 이 코드가 남아 "안녕하세요 망고아이" 가 계속 나왔던 원인. 재추가 금지.
(function setupAiGreeting() {
  return;
  const showBubble = () => {
    const lang = (typeof adminLang !== 'undefined' && adminLang === 'en') ? 'en' : 'ko';
    const text = lang === 'en' ? 'How can I help you?' : '무엇을 도와 드릴까요?';
    const bubble = document.getElementById('ai-greeting-bubble');
    const span = document.getElementById('ai-greeting-text');
    if (bubble && span) {
      span.textContent = text;
      bubble.style.display = 'block';
      setTimeout(() => {
        if (bubble.style.display !== 'none') {
          bubble.style.transition = 'opacity 0.6s, transform 0.6s';
          bubble.style.opacity = '0';
          bubble.style.transform = 'translateY(-6px)';
          setTimeout(() => { bubble.style.display = 'none'; }, 700);
        }
      }, 8000);
    }
  };
  let _audio = null;
  let _played = false;
  const playVoice = () => {
    if (_played) return;
    _played = true;
    showBubble();
    try {
      if (_audio) { try { _audio.pause(); _audio.currentTime = 0; } catch(e){} }
      _audio = new Audio('/audio/admin-search-hello.mp3');
      _audio.volume = 1.0;
      _audio.preload = 'auto';
      const p = _audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(err => { _played = false; console.info('[greet] autoplay blocked, will retry on user gesture:', err.name); });
      }
    } catch(e) { _played = false; console.warn('[greet] mp3 init error:', e); }
  };
  setTimeout(playVoice, 600);
  const onceTrigger = () => {
    if (_played) { cleanup(); return; }
    playVoice();
    if (_played) cleanup();
  };
  function cleanup() {
    document.removeEventListener('click', onceTrigger, { capture: true });
    document.removeEventListener('keydown', onceTrigger, { capture: true });
    document.removeEventListener('touchstart', onceTrigger, { capture: true });
    document.removeEventListener('scroll', onceTrigger, { capture: true });
  }
  document.addEventListener('click', onceTrigger, { capture: true });
  document.addEventListener('keydown', onceTrigger, { capture: true });
  document.addEventListener('touchstart', onceTrigger, { capture: true });
  document.addEventListener('scroll', onceTrigger, { capture: true, passive: true });
})();

// 페이지 로드 시 메뉴 인덱스 빌드 — 이건 fetch 가 없어서 즉시 끝난다(메뉴 검색은 바로 된다).
buildMenuIndex();

/* 🐢 (2026-08-13 수정요청 #02 보강) 데이터 색인은 «검색창을 처음 건드릴 때» 만든다.
   예전엔 부팅 800ms 뒤에 무조건 만들었다. 그런데 buildGlobalIndex 는 데이터 API 를 **9개** 부른다 —
     학생 1000명 · 강사 · 지사 · 대리점 전체(limit=0) · 수강신청 500 · 레벨테스트 500 ·
     공지 · 교재 · 녹화 200
   부팅 통짜 로드 12개를 카드 열 때로 미뤄 놓고도 이게 남아 있어서, 결국 첫 화면에서
   API 10개가 나가고 있었다. 실제 브라우저(Playwright)로 부팅 요청을 세어 보고 발견했다 —
   jsdom 으로 블록만 떼어 돌릴 때는 이 경로가 안 잡혔다.
   직원 대부분은 사이드바로 다니고 통합검색은 가끔 쓴다. 안 쓰는 사람에겐 9개가 전부 낭비다.

   ⚠️ 메뉴 검색은 그대로 «즉시» 된다 — 위 buildMenuIndex() 가 이미 돌았다.
      데이터 색인이 늦게 완성되면 그때 드롭다운을 한 번 다시 그려 결과를 채운다
      (검색어를 이미 친 상태에서 색인이 도착하는 경우). */
let _globalIndexStarted = false;
function ensureGlobalIndex() {
  if (_globalIndexStarted) return;
  _globalIndexStarted = true;
  buildGlobalIndex().then(() => {
    console.log('[search] global index built:', _globalSearchIndex.length, 'items');
    const el = document.getElementById('menu-search');
    if (el && el.value.trim()) renderSearchDropdown(el.value);
  });
}
window.ensureAdminSearchIndex = ensureGlobalIndex;   // 진단·수동 호출용
(function wireLazyGlobalIndex() {
  const el = document.getElementById('menu-search');
  if (!el) { setTimeout(wireLazyGlobalIndex, 1000); return; }   // 늦게 그려져도 붙는다
  el.addEventListener('focus', ensureGlobalIndex);
  el.addEventListener('input', ensureGlobalIndex);
})();

// 색인 재빌드용 헬퍼 (등록·삭제 후 호출하면 됨) — 명시적 요청이므로 지연 규칙과 무관하게 바로 만든다
window.rebuildGlobalSearchIndex = function() {
  buildMenuIndex();
  _globalIndexStarted = true;
  return buildGlobalIndex();
};

// 한/영 토글 시 사이드바도 갱신 — toggleAdminLang 의 끝에 호출되도록 hook
(function hookLangToggle() {
  const original = window.toggleAdminLang;
  if (typeof original !== 'function') return;
  window.toggleAdminLang = function() {
    original.apply(this, arguments);
    if (typeof renderSidebar === 'function') renderSidebar();
    // 메뉴 인덱스도 다시 빌드해서 통합 색인의 메뉴 라벨이 최신 언어로 갱신되게
    if (typeof buildMenuIndex === 'function') buildMenuIndex();
  };
})();

// ───── Phase 11 — 우상단 사용자 메뉴 (마이페이지·로그아웃) ─────
(function initTopUserMenu(){
  const btn   = document.getElementById('topUserBtn');
  const popup = document.getElementById('topUserPopup');
  const label = document.getElementById('topUserLabel');
  const head  = document.getElementById('topUserHeader');
  const logoutBtn = document.getElementById('topLogoutBtn');
  if (!btn || !popup) return;

  // /me 로 로그인 정보 채우기
  fetch('/api/admin/me', { credentials: 'include' })
    .then(r => r.ok ? r.json() : null)
    .then(j => {
      if (!j || !j.ok || !j.user) return;
      const u = j.user;
      const display = (u.name || u.username || '관리자') + (u.username ? ' (@' + u.username + ')' : '');
      if (label) label.textContent = '👤 ' + (u.name || u.username || '관리자');
      if (head)  head.textContent  = display;
    })
    .catch(()=>{});

  // 클릭으로 펼치기·접기
  btn.addEventListener('click', (ev) => {
    if (ev.target.closest('a, button')) return;   // 메뉴 항목 클릭은 통과
    popup.style.display = (popup.style.display === 'block') ? 'none' : 'block';
    ev.stopPropagation();
  });
  document.addEventListener('click', (ev) => {
    if (!btn.contains(ev.target)) popup.style.display = 'none';
  });

  // 로그아웃
  if (logoutBtn) logoutBtn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    if (!confirm('정말 로그아웃 하시겠습니까?')) return;
    try { await fetch('/api/admin/logout', { method:'POST', credentials:'include' }); } catch {}
    location.replace('/admin/login');
  });
})();

// ════════════════════════════════════════════════════════════════════
// 📥 회계 리포트 6종 — 실제 D1 데이터 → 인쇄 가능한 HTML + CSV 다운로드
// (2026-05-03 추가)
// ════════════════════════════════════════════════════════════════════

(function(){
  // 기본값 = 현재(KST)월
  function defaultMonth(){
    const d = new Date(Date.now() + 9*3600*1000);
    return d.toISOString().slice(0,7);
  }
  function defaultYear(){
    const d = new Date(Date.now() + 9*3600*1000);
    return d.getUTCFullYear();
  }
  // 기간 입력 보정
  function getInputs(){
    const periodEl = document.getElementById('acc-rep-period');
    const yearEl   = document.getElementById('acc-rep-year');
    const qEl      = document.getElementById('acc-rep-quarter');
    if (periodEl && !periodEl.value) periodEl.value = defaultMonth();
    if (yearEl   && !yearEl.value)   yearEl.value   = defaultYear();
    return {
      period: (periodEl && periodEl.value) || defaultMonth(),
      year:   Number(yearEl && yearEl.value) || defaultYear(),
      quarter: Number(qEl && qEl.value) || 1,
    };
  }

  function fmtKRW(n){
    if (n === null || n === undefined || isNaN(n)) return '—';
    return '₩ ' + Number(n).toLocaleString('ko-KR');
  }
  function fmtNum(n, unit){
    if (n === null || n === undefined || isNaN(n)) return '—';
    if (unit === 'KRW') return fmtKRW(n);
    if (unit === '%')   return Number(n).toFixed(1) + '%';
    if (unit === '배')   return Number(n).toFixed(2) + '배';
    return Number(n).toLocaleString('ko-KR') + (unit?' '+unit:'');
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /* 🏷️ 신뢰도 배지 (2026-08-16) — 서버가 내려준 출처(sources)를 그대로 보여 준다.
     지어낸 숫자와 실제 숫자가 같은 표에 섞여 있어 구분이 안 되던 문제를 푼다. */
  const BADGE = {
    actual:    ['실데이터', '#166534', '#dcfce7'],
    estimated: ['추정',     '#92400e', '#fef3c7'],
    none:      ['자료없음', '#991b1b', '#fee2e2'],
    review:    ['확인필요', '#1e40af', '#dbeafe'],
  };
  function badge(src){
    const b = BADGE[src]; if (!b) return '';
    return `<span style="display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;background:${b[2]};color:${b[1]};margin-left:6px;vertical-align:1px">${b[0]}</span>`;
  }
  const BADGE_LEGEND = `<div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;color:#6b7280;margin:10px 0 0">
      <span>${badge('actual')} 통장·카드·결제 기록에서 그대로 가져온 값</span>
      <span>${badge('estimated')} 계산식으로 만든 값 — 참고만</span>
      <span>${badge('review')} 사람이 한 번 봐 줘야 하는 값</span>
      <span>${badge('none')} 아직 가져올 자료가 없는 값</span>
    </div>`;

  /* 🔍 대사 배너 — 「매출–입금 대사」에 따로 들어가지 않아도 리포트 첫 줄에서 보이게. */
  function reconcileBanner(rec){
    if (!rec) return '';
    const V = {
      ok:      ['#166534', '#f0fdf4', '#86efac', '✅ 장부와 통장이 맞습니다'],
      warn:    ['#92400e', '#fffbeb', '#fcd34d', '⚠️ 장부와 통장이 조금 어긋납니다'],
      alert:   ['#991b1b', '#fef2f2', '#fca5a5', '🚨 장부와 통장이 크게 어긋납니다'],
      no_data: ['#374151', '#f9fafb', '#d1d5db', 'ℹ️ 이 달은 통장 자료가 없습니다'],
    }[rec.verdict] || null;
    if (!V) return '';
    /* 기준은 통장이다(2026-08-18) — 실제로 들어온 「케이씨피」 정산금을 먼저 말하고,
       장부는 그 옆에 붙인다. 차이(%)의 분모도 통장이다. */
    const detail = rec.verdict === 'no_data' ? '' :
      `<div style="margin-top:6px;font-size:12px;color:#374151">
        통장에 들어온 「케이씨피」 정산금 <b>${fmtKRW(rec.deposit_pg)}</b>${rec.lag_days ? `<span style="color:#1e3a8a"> (이 달 결제분이 ${rec.lag_days}일 뒤 들어온 구간 기준 — 같은 달 통장에 찍힌 금액은 ${fmtKRW(rec.deposit_pg_same_month)})</span>` : ''} → 수수료 ${window.pgFeeRateLabel()}를 되돌린 통장 기준 매출 <b>${rec.bank_revenue == null ? '—' : fmtKRW(rec.bank_revenue)}</b> ·
        장부 매출(KCP 정산 대상) <b>${fmtKRW(rec.revenue)}</b> → 예상 입금 <b>${fmtKRW(rec.expected)}</b>
        (차이 ${rec.diff == null ? '—' : fmtKRW(rec.diff)}, 통장 기준 ${rec.diff_pct}%)
      </div>`;
    const extra = [rec.transfer_note, rec.b2b_note].filter(Boolean)
      .map(t => `<div style="margin-top:6px;font-size:12px;color:#374151">· ${esc(t)}</div>`).join('');
    return `<div style="background:${V[1]};border:1px solid ${V[2]};border-left:4px solid ${V[0]};border-radius:8px;padding:11px 14px;margin:12px 0;line-height:1.65">
        <b style="color:${V[0]};font-size:13px">${V[3]}</b>
        <div style="margin-top:4px;font-size:12.5px;color:#374151">${esc(rec.message || '')}</div>
        ${detail}${extra}
      </div>`;
  }

  /* 🔎 눌러서 펼치는 상세 내역 — 「합계 → 내역 → 원본 거래」 */
  function drill(title, rows, opts){
    if (!rows || !rows.length) return '';
    const o = opts || {};
    return `<details style="border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb;margin:8px 0">
      <summary style="cursor:pointer;padding:9px 14px;font-size:12.5px;font-weight:600;color:#374151">${esc(title)}</summary>
      <div style="padding:0 14px 12px;background:#fff">
        <table style="font-size:12.5px">
          <thead><tr><th>${esc(o.dateLabel || '일자')}</th><th>${esc(o.nameLabel || '내용')}</th><th class="num">금액</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.name != null ? r.name : r.remark)}</td><td class="num">${fmtKRW(r.amount)}</td></tr>`).join('')}</tbody>
        </table>
        ${o.note ? `<p style="font-size:11px;color:#6b7280;margin:8px 0 0;line-height:1.6">${esc(o.note)}</p>` : ''}
      </div>
    </details>`;
  }

  function noteList(notes){
    if (!notes || !notes.length) return '';
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:11px 14px;margin:10px 0;font-size:12.5px;line-height:1.75;color:#374151">
      ${notes.map(n => `<div>· ${esc(n)}</div>`).join('')}
    </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════════
     🔒 월 마감 (2026-08-17)
     마감하면 그 달 리포트가 스냅샷으로 굳는다. 그 뒤 자료가 더 들어와도
     «이미 내보낸 숫자» 는 안 바뀌고, 대신 «달라졌다» 고 알려 준다.
     ═══════════════════════════════════════════════════════════════════ */
  const closeApi = (qs) => '/api/admin/reports/close?' + qs;

  window.accCloseRefresh = async function(){
    const el = document.getElementById('acc-close-state');
    const det = document.getElementById('acc-close-detail');
    const cbtn = document.getElementById('acc-close-btn');
    const rbtn = document.getElementById('acc-reopen-btn');
    if (!el) return;
    const period = getInputs().period;
    el.textContent = period + ' 확인 중…'; if (det) det.innerHTML = '';
    try {
      const r = await fetch(closeApi('period=' + encodeURIComponent(period)), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'API error');
      if (d.closed) {
        const when = new Date((d.closed_at||0) + 9*3600*1000).toISOString().slice(0,16).replace('T',' ');
        el.innerHTML = `<b style="color:#166534">${esc(period)} 마감됨</b> · ${esc(when)} · ${esc(d.closed_by||'')}`;
        if (cbtn) cbtn.style.display = 'none';
        if (rbtn) rbtn.style.display = '';
        const parts = [];
        if (d.forced) parts.push(`<span style="color:#b45309">⚠️ 확인 필요 항목을 알고도 마감했습니다.</span>`);
        (d.warnings||[]).forEach(w => parts.push('· ' + esc(w)));
        if (d.drift) parts.push(d.drift.changed
          ? `<b style="color:#b45309">⚠️ ${esc(d.drift.message)}</b>`
          : `<span style="color:#166534">✅ ${esc(d.drift.message)}</span>`);
        if (d.snapshot_pl) parts.push(`마감본 — 매출 ${fmtKRW(d.snapshot_pl.revenue)} · 비용 ${fmtKRW(d.snapshot_pl.cost)} · 순이익 ${fmtKRW(d.snapshot_pl.net_income)} (${d.snapshot_pl.margin_pct}%)`);
        if (det) det.innerHTML = parts.join('<br>');
      } else {
        el.innerHTML = `<b style="color:#6b7280">${esc(period)} 미마감</b>`;
        if (cbtn) { cbtn.style.display = ''; cbtn.disabled = !d.closable; cbtn.style.opacity = d.closable ? '1' : '.5'; }
        if (rbtn) rbtn.style.display = 'none';
        const parts = [];
        if (!d.closable) parts.push(`<span style="color:#6b7280">${esc(d.closable_reason||'')}</span>`);
        if ((d.warnings||[]).length) {
          parts.push(`<b style="color:#b45309">마감 전에 확인해 주세요 (${d.warnings.length}건)</b>`);
          d.warnings.forEach(w => parts.push('· ' + esc(w)));
        } else if (d.closable) {
          parts.push('<span style="color:#166534">확인이 필요한 항목이 없습니다 — 바로 마감할 수 있습니다.</span>');
        }
        if (d.preview) parts.push(`지금 숫자 — 매출 ${fmtKRW(d.preview.revenue)} · 비용 ${fmtKRW(d.preview.cost)} · 순이익 ${fmtKRW(d.preview.net_income)} (${d.preview.margin_pct}%)`);
        if (det) det.innerHTML = parts.join('<br>');
      }
      if (det && (d.log||[]).length) {
        det.innerHTML += `<details style="margin-top:7px"><summary style="cursor:pointer;font-size:11.5px;color:#6b7280">기록 ${d.log.length}건 보기</summary>`
          + d.log.map(l => `<div style="font-size:11.5px;color:#6b7280">${esc(new Date((l.at||0)+9*3600*1000).toISOString().slice(0,16).replace('T',' '))} · ${l.action==='close'?'마감':'해제'} · ${esc(l.actor||'')}${l.reason?' · '+esc(l.reason):''}</div>`).join('')
          + '</details>';
      }
    } catch(e) {
      el.textContent = '오류: ' + (e.message||e);
    }
  };

  window.accCloseMonth = async function(){
    const period = getInputs().period;
    if (!confirm(`${period} 를 마감할까요?\n\n마감하면 그 달 숫자가 그대로 굳습니다.\n나중에 자료가 더 들어와도 리포트 숫자는 안 바뀌고, «달라졌다»고 알려 줍니다.\n(마감 해제는 사유를 적으면 언제든 가능합니다)`)) return;
    try {
      let r = await fetch(closeApi('period=' + encodeURIComponent(period)), { method:'POST', credentials:'include' });
      let d = await r.json();
      if (!d.ok && d.needs_force) {
        const list = (d.warnings||[]).map(w => '· ' + w).join('\n');
        if (!confirm(`확인이 필요한 항목이 ${d.warnings.length}건 있습니다.\n\n${list}\n\n그래도 이대로 마감할까요?\n(«확인하고도 마감함»으로 기록에 남습니다)`)) return;
        r = await fetch(closeApi('period=' + encodeURIComponent(period) + '&force=1'), { method:'POST', credentials:'include' });
        d = await r.json();
      }
      if (!d.ok) throw new Error(d.error || '마감 실패');
      alert(`${period} 마감했습니다.`);
      accCloseRefresh();
    } catch(e) { alert('마감 실패: ' + (e.message||e)); }
  };

  window.accReopenMonth = async function(){
    const period = getInputs().period;
    const reason = prompt(`${period} 마감을 해제합니다.\n\n사유를 적어 주세요 (기록에 남습니다):`, '');
    if (reason === null) return;
    if (!reason.trim()) { alert('사유를 적어 주세요.'); return; }
    try {
      const r = await fetch('/api/admin/reports/reopen?period=' + encodeURIComponent(period) + '&reason=' + encodeURIComponent(reason.trim()),
        { method:'POST', credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || '해제 실패');
      alert(`${period} 마감을 해제했습니다.`);
      accCloseRefresh();
    } catch(e) { alert('해제 실패: ' + (e.message||e)); }
  };

  /* 🏪 배정 못 한 결제 아이디 → 대리점/지사 붙이기 (2026-08-17)
     대리점이 원생 수강료를 자기 계정으로 결제하면 그 아이디는 학생 원부에 없다.
     ① 캐피타운 대리점으로 등록(근본) ② 지사 직접 지정(즉시) — 둘 다 여기서. */
  let _payerFr = [];
  window.accPayerLoad = async function(){
    const st = document.getElementById('acc-payer-state');
    const tb = document.getElementById('acc-payer-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="6" class="empty">불러오는 중…</td></tr>';
    try {
      const r = await fetch('/api/admin/reports/payers?months=12', { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'API error');
      _payerFr = d.franchises || [];
      if (st) st.innerHTML = d.unresolved_count
        ? `<b style="color:#b45309">소속을 못 붙인 결제 아이디 ${d.unresolved_count}곳 · ${fmtKRW(d.unresolved_krw)}</b> (최근 12개월)`
        : `<span style="color:#166534">최근 12개월 결제가 모두 소속에 붙어 있습니다.</span>`;
      if (!(d.rows||[]).length) { tb.innerHTML = '<tr><td colspan="6" class="empty">배정 못 한 결제가 없습니다.</td></tr>'; return; }
      const frOpts = ['<option value="">— 지사 선택 —</option>']
        .concat(_payerFr.map(f => `<option value="${f.id}">${esc(f.name)}${f.active ? '' : ' (비활성)'}</option>`)).join('');
      const brOpts = ['<option value="">— 지사 선택 —</option>']
        .concat(_payerFr.map(f => `<option value="${esc(f.name)}">${esc(f.name)}</option>`)).join('');
      tb.innerHTML = d.rows.map(it => {
        const id = esc(it.user_id).replace(/'/g,'&#39;');
        return `<tr style="background:#fffbeb">
          <td><b>${esc(it.user_id)}</b><div style="font-size:10.5px;color:#9ca3af">${esc(it.reason||'')} · ${it.months}개월</div></td>
          <td style="text-align:right">${it.pays}</td>
          <td style="text-align:right">${fmtKRW(it.amount)}</td>
          <td style="font-size:11px;color:#6b7280">${esc(it.first_at||'')}~${esc(it.last_at||'')}</td>
          <td><select onchange="accPayerAssign('${id}', this.value, this)" style="padding:3px 6px;font-size:12px;border-radius:6px;border:1px solid #d1d5db">${frOpts}</select></td>
          <td><input id="cap-nm-${id}" placeholder="대리점 이름" style="padding:3px 6px;font-size:12px;width:110px;border-radius:6px;border:1px solid #d1d5db">
              <select id="cap-br-${id}" style="padding:3px 6px;font-size:12px;border-radius:6px;border:1px solid #d1d5db">${brOpts}</select>
              <button onclick="accPayerRegister('${id}')" style="padding:3px 9px;font-size:12px">등록</button></td>
        </tr>`;
      }).join('');
      if ((d.assigned||[]).length) {
        tb.innerHTML += `<tr><td colspan="6" style="padding-top:10px"><details><summary style="cursor:pointer;font-size:11.5px;color:#6b7280">이미 지정한 아이디 ${d.assigned.length}곳 보기</summary>`
          + d.assigned.map(a => `<div style="font-size:11.5px;color:#374151">${esc(a.payer_user_id)} → <b>${esc(a.franchise_name)}</b>
              <button onclick="accPayerAssign('${esc(a.payer_user_id).replace(/'/g,'&#39;')}', '', null)" style="padding:1px 7px;font-size:11px;margin-left:6px">해제</button></div>`).join('')
          + '</details></td></tr>';
      }
    } catch(e) { tb.innerHTML = `<tr><td colspan="6" class="empty" style="color:#ef4444">에러: ${esc(e.message||e)}</td></tr>`; }
  };

  window.accPayerAssign = async function(payer, fid, sel){
    if (sel && !fid) return;
    if (!fid && !confirm(`${payer} 의 지사 지정을 해제할까요?`)) return;
    if (sel) sel.disabled = true;
    try {
      const r = await fetch('/api/admin/reports/payers?payer=' + encodeURIComponent(payer) + '&franchise_id=' + encodeURIComponent(fid || 0),
        { method:'POST', credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || '저장 실패');
      accPayerLoad();
    } catch(e) { if (sel) sel.disabled = false; alert('저장 실패: ' + (e.message||e)); }
  };

  window.accPayerRegister = async function(payer){
    const nm = (document.getElementById('cap-nm-' + payer)||{}).value || '';
    const br = (document.getElementById('cap-br-' + payer)||{}).value || '';
    if (!nm.trim()) { alert('대리점 이름을 적어 주세요.'); return; }
    if (!br) { alert('소속 지사를 골라 주세요.'); return; }
    if (!confirm(`「${nm.trim()}」 을(를) ${br} 소속 캐피타운 대리점으로 등록할까요?\n\n로그인 아이디: ${payer}\n등록하면 이 아이디의 결제가 전부 ${br} 매출로 잡힙니다.`)) return;
    try {
      const qs = new URLSearchParams({ name: nm.trim(), branch: br, login_id: payer });
      const r = await fetch('/api/admin/capitown/agencies?' + qs.toString(), { method:'POST', credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message || d.error || '등록 실패');
      alert(d.message ? d.message : `등록했습니다 (${d.action === 'created' ? '신규' : '수정'}).`);
      accPayerLoad();
    } catch(e) { alert('등록 실패: ' + (e.message||e)); }
  };

  /* 🏦 배정 못 한 B2B 통장 입금 → 가맹점 연결 (2026-08-18)
     학원이 수업료를 통장으로 바로 보내면 카페24를 안 거쳐 결제 장부에 없다.
     여기서 «이 적요는 이 지사» 를 한 번 정하면 가맹점별 정산서에 바로 합산된다. */
  let _b2bFr = [];
  window.accB2bLoad = async function(){
    const st = document.getElementById('acc-b2b-state');
    const tb = document.getElementById('acc-b2b-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="6" class="empty">불러오는 중…</td></tr>';
    try {
      const r = await fetch('/api/admin/reports/b2b-payees?months=12', { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'API error');
      _b2bFr = d.franchises || [];
      if (st) st.innerHTML = d.unresolved_count
        ? `<b style="color:#b45309">아직 붙이지 못한 B2B 입금 ${d.unresolved_count}곳 · ${fmtKRW(d.unresolved_krw)}</b>`
          + ` <span style="color:#6b7280">(최근 12개월 B2B 합계 ${fmtKRW(d.total_krw)} 중 ${fmtKRW(d.assigned_krw)} 배정됨)</span>`
        : `<span style="color:#166534">최근 12개월 B2B 입금 ${fmtKRW(d.total_krw)} 이 모두 가맹점에 붙어 있습니다.</span>`;
      if (!(d.items||[]).length) { tb.innerHTML = '<tr><td colspan="6" class="empty">최근 12개월에 B2B 통장 입금이 없습니다.</td></tr>'; return; }
      tb.innerHTML = d.items.map(it => {
        const cur = it.franchise_id || '';
        const opts = ['<option value="">— 지정 안 함 —</option>']
          .concat(_b2bFr.map(f => `<option value="${f.id}"${String(f.id) === String(cur) ? ' selected' : ''}>${esc(f.name)}${f.active ? '' : ' (비활성)'}</option>`)).join('');
        const where = it.franchise_id
          ? `<b>${esc(it.matched_name || '')}</b>`
            + (it.matched_by && it.matched_by !== '지정'
                ? ` <span style="font-size:10px;color:#1e40af;background:#dbeafe;padding:1px 6px;border-radius:99px">자동 · ${esc(it.matched_by)}</span>`
                : ' <span style="font-size:10px;color:#166534;background:#dcfce7;padding:1px 6px;border-radius:99px">지정</span>')
          : '<span style="color:#b45309">— 배정 못 함 —</span>';
        return `<tr${it.franchise_id ? '' : ' style="background:#fffbeb"'}>
          <td><b>${esc(it.payee)}</b></td>
          <td style="text-align:right">${it.count}</td>
          <td style="text-align:right">${fmtKRW(it.amount)}</td>
          <td style="font-size:11px;color:#6b7280">${esc(it.first_at||'')}~${esc(it.last_at||'')}</td>
          <td style="font-size:11.5px">${where}</td>
          <td><select onchange="accB2bAssign('${esc(it.payee).replace(/'/g,'&#39;')}', this.value, this)"
                     style="padding:3px 6px;font-size:12px;border-radius:6px;border:1px solid #d1d5db">${opts}</select></td>
        </tr>`;
      }).join('');
    } catch(e) { tb.innerHTML = `<tr><td colspan="6" class="empty" style="color:#ef4444">에러: ${esc(e.message||e)}</td></tr>`; }
  };

  window.accB2bAssign = async function(payee, fid, sel){
    if (!fid && !confirm(`「${payee}」 의 지사 지정을 해제할까요?`)) { if (sel) accB2bLoad(); return; }
    if (sel) sel.disabled = true;
    try {
      const r = await fetch('/api/admin/reports/b2b-payees?payee=' + encodeURIComponent(payee) + '&franchise_id=' + encodeURIComponent(fid || 0),
        { method:'POST', credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || '저장 실패');
      accB2bLoad();
    } catch(e) { if (sel) sel.disabled = false; alert('저장 실패: ' + (e.message||e)); }
  };

  /* 🏷️ 지출 계정과목 분류 — 「기타출금」 을 쪼갠다 (2026-08-17)
     지사 대표자명과 일치하면 자동으로 「지사수수료」. 나머지는 여기서 한 번 정하면
     그 거래처의 지난·앞으로의 출금이 전부 그 과목으로 들어간다(QuickBooks·Xero 방식). */
  let _payeeCats = [];
  window.accPayeeLoad = async function(){
    const st = document.getElementById('acc-payee-state');
    const tb = document.getElementById('acc-payee-tbody');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="5" class="empty">불러오는 중…</td></tr>';
    try {
      const r = await fetch('/api/admin/reports/payees?months=6', { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'API error');
      _payeeCats = d.categories || [];
      if (st) st.innerHTML = d.unresolved_count
        ? `<b style="color:#b45309">아직 정하지 않은 거래처 ${d.unresolved_count}곳 · ${fmtKRW(d.unresolved_krw)}</b> (최근 6개월)`
        : `<span style="color:#166534">최근 6개월 「기타출금」이 모두 분류돼 있습니다.</span>`;
      if (!(d.items||[]).length) { tb.innerHTML = '<tr><td colspan="5" class="empty">분류할 출금이 없습니다.</td></tr>'; return; }
      tb.innerHTML = d.items.map(it => {
        const cur = it.category || '';
        const opts = ['<option value="">— 정해 주세요 —</option>']
          .concat(_payeeCats.map(c => `<option value="${esc(c)}"${c === cur ? ' selected' : ''}>${esc(c)}</option>`)).join('');
        const auto = it.source && it.source.indexOf('auto') === 0
          ? '<span style="font-size:10px;color:#1e40af;background:#dbeafe;padding:1px 6px;border-radius:99px;margin-left:5px">자동</span>' : '';
        return `<tr${it.category ? '' : ' style="background:#fffbeb"'}>
          <td><b>${esc(it.payee)}</b>${auto}${it.corporate ? '<span style="font-size:10px;color:#6b7280;margin-left:5px">법인</span>' : ''}
              ${it.remark !== it.payee ? `<div style="font-size:10.5px;color:#9ca3af">적요: ${esc(it.remark)}</div>` : ''}</td>
          <td style="text-align:right">${it.count}</td>
          <td style="text-align:right">${fmtKRW(it.amount)}</td>
          <td style="font-size:11px;color:#6b7280">${esc(it.first_at||'')}~${esc(it.last_at||'')}</td>
          <td><select onchange="accPayeeSet('${esc(it.payee).replace(/'/g,'&#39;')}', this.value, this)"
                     style="padding:3px 6px;font-size:12px;border-radius:6px;border:1px solid #d1d5db">${opts}</select></td>
        </tr>`;
      }).join('');
    } catch(e) { tb.innerHTML = `<tr><td colspan="5" class="empty" style="color:#ef4444">에러: ${esc(e.message||e)}</td></tr>`; }
  };

  window.accPayeeSet = async function(payee, category, sel){
    if (!category) return;
    if (sel) sel.disabled = true;
    try {
      const r = await fetch('/api/admin/reports/payees?payee=' + encodeURIComponent(payee) + '&category=' + encodeURIComponent(category),
        { method:'POST', credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || '저장 실패');
      if (sel) { sel.disabled = false; const tr = sel.closest('tr'); if (tr) tr.style.background = ''; }
      accPayeeLoad();
    } catch(e) { if (sel) sel.disabled = false; alert('저장 실패: ' + (e.message||e)); }
  };

  // 기간을 바꾸면 마감 현황도 따라오게
  document.addEventListener('DOMContentLoaded', () => {
    const p = document.getElementById('acc-rep-period');
    if (p) p.addEventListener('change', () => window.accCloseRefresh && window.accCloseRefresh());
  });

  // 메인: 리포트 종류별 fetch + render
  window.openReport = async function(type){
    const inputs = getInputs();
    let url, csvUrl, title;
    switch(type){
      case 'monthly':
        url    = `/api/admin/reports/monthly?period=${inputs.period}`;
        csvUrl = url + '&format=csv';
        title  = `월간 회계 리포트 (${inputs.period})`;
        break;
      case 'quarterly':
        url    = `/api/admin/reports/quarterly?year=${inputs.year}&q=${inputs.quarter}`;
        csvUrl = url + '&format=csv';
        title  = `${inputs.year}년 ${inputs.quarter}분기 보고서`;
        break;
      case 'annual':
        url    = `/api/admin/reports/annual?year=${inputs.year}`;
        csvUrl = url + '&format=csv';
        title  = `${inputs.year}년 연간 결산`;
        break;
      case 'franchise':
        url    = `/api/admin/reports/franchise?period=${inputs.period}`;
        csvUrl = url + '&format=csv';
        title  = `가맹점별 정산서 (${inputs.period})`;
        break;
      case 'payslips':
        url    = `/api/admin/reports/payslips?period=${inputs.period}`;
        csvUrl = url + '&format=csv';
        title  = `강사별 급여명세서 (${inputs.period})`;
        break;
      case 'kpi':
        url    = `/api/admin/reports/kpi?period=${inputs.period}`;
        csvUrl = url + '&format=csv';
        title  = `경영지표 KPI (${inputs.period})`;
        break;
      default: alert('알 수 없는 리포트: '+type); return;
    }

    // 새 창 먼저 열기 (사용자 액션 컨텍스트 유지 — 팝업 차단 회피)
    const win = window.open('', '_blank', 'width=1100,height=900,scrollbars=yes');
    if (!win) {
      alert('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
      return;
    }
    win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
      <style>body{font-family:MangoiHanSC,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;color:#111;padding:30px;text-align:center}.spinner{display:inline-block;width:36px;height:36px;border:4px solid #e5e7eb;border-top-color:#fb923c;border-radius:50%;animation:s 0.8s linear infinite;margin-bottom:14px}@keyframes s{to{transform:rotate(360deg)}}</style>
      </head><body><div class="spinner"></div><div>리포트 데이터 불러오는 중...</div>
</body></html>`);

    try {
      const r = await fetch(url, { credentials:'include' });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || 'API error');
      const html = renderReport(type, data, csvUrl);
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch(e) {
      win.document.body.innerHTML = `<h2 style="color:#ef4444">에러: ${e.message}</h2>
        <p>API 호출 실패 — wrangler 배포 후 다시 시도하세요.</p>
        <p><code>${url}</code></p>`;
    }
  };

  // ════════════════════════════════════════════════════════════════
  // 렌더링 — 인쇄 가능한 HTML 문서 생성
  // ════════════════════════════════════════════════════════════════
  function renderReport(type, d, csvUrl){
    const baseStyle = `
      <style>
        @page { size:A4; margin:18mm 14mm; }
        body{font-family:MangoiHanSC,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;color:#111;padding:24px;max-width:1000px;margin:0 auto;background:#fff}
        h1{font-size:24px;margin:0 0 4px;border-bottom:3px solid #fb923c;padding-bottom:8px}
        h2{font-size:16px;color:#374151;margin:20px 0 8px}
        .meta{color:#6b7280;font-size:12px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}
        th{background:#f3f4f6;padding:8px 10px;text-align:left;border-bottom:2px solid #d1d5db;font-weight:700}
        td{padding:8px 10px;border-bottom:1px solid #e5e7eb}
        td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
        tr.total td{background:#fef3c7;font-weight:800;border-top:2px solid #f59e0b}
        /* 📐 컬럼이 많은 표 — 「가맹점별 정산서」가 「장부 결제」·「B2B 직접입금」 두 칸이 늘어
           10칸이 되면서 PC 에서 가로로 넘친다는 제보를 받고 넣었다(2026-08-18).
           ⚠️ 처음엔 숫자 칸에 white-space:nowrap 을 줬다가 표의 «최소 폭» 이 693 → 746px 로
              오히려 넓어졌다(측정으로 확인). 넘치는 표에 nowrap 은 반대 방향이다.
              지금은 글자·여백만 줄이고 아무것도 nowrap 하지 않는다 — 어느 폭에서든 예전보다 좁다.
           .tblwrap 은 «표 안에서만» 스크롤되게 하는 안전망이다. 페이지 본문이 통째로 옆으로
           밀리는 것(진짜 문제)과 달리, 표 하나만 밀리는 건 읽는 데 지장이 없다. */
        .tblwrap{overflow-x:auto}
        /* 📊 추이 표의 막대 — 폭을 여기서 정한다(인라인 고정폭이면 표가 못 줄어든다) */
        .bar{display:inline-block;vertical-align:middle;width:70px;height:8px;background:#f1f5f9;border-radius:3px;overflow:hidden}
        table.compact .bar{width:52px}
        .barcell{width:1px}
        /* 좁은 화면에서는 막대를 뺀다 — 인쇄와 같은 이유다(막대는 «줄지 않는» 폭이고, 장식이다).
           1100px 팝업이 윈도 배율 150% 인 PC 에서 실효 733px 가 되는 것이 실제로 걸린 경우다. */
        @media screen and (max-width:820px){ table.compact .barcell{display:none} }
        table.compact{font-size:11.5px}
        table.compact th,table.compact td{padding:6px 7px}
        table.compact th{white-space:normal;line-height:1.35;vertical-align:bottom}
        /* 배지는 헤더 «아래 줄» 로 내린다 — 옆에 붙으면 그 칸이 배지 폭만큼 넓어진다 */
        table.compact th > span{display:block !important;margin:3px 0 0 !important;margin-left:0 !important}
        @media print{
          table.compact{font-size:9.5px}
          table.compact th,table.compact td{padding:4px 5px}
          /* 막대는 인쇄에서 뺀다 — A4 본문 640px 에 «줄지 않는» 폭을 얹으면 표가 넘친다.
             한 열의 th/td 를 전부 없애는 것이라 칸이 어긋나지 않는다. */
          table.compact .barcell{display:none}
        }
        .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}
        .kpi{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px}
        .kpi .l{font-size:11px;color:#6b7280;margin-bottom:4px}
        .kpi .v{font-size:20px;font-weight:800;color:#111}
        .pl-box{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}
        .pl-box .b{padding:14px;border-radius:10px;border:1px solid #e5e7eb;background:#f9fafb}
        .pl-box .b.rev{background:#dbeafe;border-color:#93c5fd}
        .pl-box .b.cost{background:#fee2e2;border-color:#fca5a5}
        .pl-box .b.net{background:#dcfce7;border-color:#86efac}
        .pl-box .b.margin{background:#fef3c7;border-color:#fcd34d}
        .pl-box .l{font-size:11px;color:#374151;margin-bottom:4px}
        .pl-box .v{font-size:18px;font-weight:800}
        .toolbar{position:fixed;top:10px;right:10px;background:#fff;padding:8px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.1);z-index:1000}
        .toolbar button{padding:8px 14px;font-size:13px;border:0;border-radius:6px;cursor:pointer;margin-left:6px;font-weight:600}
        .toolbar .print{background:#fb923c;color:#fff}
        .toolbar .xlsx{background:#217346;color:#fff}
        .toolbar .csv{background:#10b981;color:#fff}
        .toolbar .close{background:#6b7280;color:#fff}
        @media print{.toolbar{display:none}body{padding:0}}
        .footer{margin-top:30px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:center}
      </style>`;
    // 📊 엑셀 — 숫자가 «숫자» 로 들어가고 상세 내역이 시트로 나뉜다(CSV 는 한 장뿐)
    const xlsxUrl = csvUrl.replace('format=csv', 'format=xlsx');
    const toolbar = `<div class="toolbar">
        <button class="print" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
        <button class="xlsx" onclick="location.href='${xlsxUrl}'">📊 엑셀</button>
        <button class="csv" onclick="location.href='${csvUrl}'">📥 CSV</button>
        <button class="close" onclick="window.close()">✕ 닫기</button>
      </div>`;
    const footer = `<div class="footer">망고아이 ERP · 생성: ${new Date().toLocaleString('ko-KR')} · 출처: webrtc-unified-platform</div>`;

    let body = '';
    if (type === 'monthly')   body = renderMonthly(d);
    else if (type === 'quarterly') body = renderQuarterly(d);
    else if (type === 'annual')    body = renderAnnual(d);
    else if (type === 'franchise') body = renderFranchise(d);
    else if (type === 'payslips')  body = renderPayslips(d);
    else if (type === 'kpi')       body = renderKpi(d);

    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${d.label||'Report'}</title>${baseStyle}</head><body>${toolbar}${body}${footer}
</body></html>`;
  }

  function renderMonthly(d){
    const s = d.summary, c = d.cost, p = d.pl, src = d.sources || {}, det = d.detail || {};
    // 📣 한 문장 요약 — 사장님이 첫 줄만 읽어도 이번 달이 어땠는지 알 수 있게(2026-08-16)
    const headline = `이번 달 매출 <b>${fmtKRW(p.revenue)}</b>, 쓴 돈 <b>${fmtKRW(p.cost)}</b>, `
      + (p.confident
          ? `남은 돈 <b>${fmtKRW(p.net_income)}</b> (이익률 ${p.margin_pct}%) 입니다.`
          : `계산상 <b>${fmtKRW(p.net_income)}</b> 이지만 <b>장부와 통장이 어긋나 확정 숫자가 아닙니다.</b>`);
    return `
      <h1>📅 월간 회계 리포트</h1>
      <div class="meta">${d.label}</div>
      ${d.coverage && d.coverage.level !== 'full' ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-left:4px solid #f59e0b;border-radius:8px;padding:11px 14px;margin:12px 0;font-size:12.5px;line-height:1.7">
        <b style="color:#92400e">⚠️ 이 달은 비용 자료가 온전하지 않습니다 — 아래 순이익은 참고값입니다.</b><br>
        ${esc(d.coverage.note || '')}
      </div>` : ''}
      ${d.closed && d.closed.is_closed ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-left:4px solid #166534;border-radius:8px;padding:11px 14px;margin:12px 0;font-size:12.5px;line-height:1.7">
        <b style="color:#166534">🔒 마감된 달입니다 — 아래 숫자는 «마감본»입니다.</b>
        마감 ${esc(new Date((d.closed.closed_at||0)+9*3600*1000).toISOString().slice(0,16).replace('T',' '))} · ${esc(d.closed.closed_by||'')}
        ${d.closed.forced ? '<br><span style="color:#b45309">⚠️ 확인 필요 항목을 알고도 마감했습니다.</span>' : ''}
        ${d.closed.drift && d.closed.drift.changed ? `<br><b style="color:#b45309">⚠️ ${esc(d.closed.drift.message)}</b>` : ''}
      </div>` : ''}
      <div style="background:#fff7ed;border-radius:10px;padding:14px 18px;margin:12px 0;font-size:15px;line-height:1.65;font-weight:600;color:#111">${headline}</div>
      ${reconcileBanner(d.reconcile)}
      <div class="pl-box">
        <div class="b rev"><div class="l">매출</div><div class="v">${fmtKRW(p.revenue)}</div></div>
        <div class="b cost"><div class="l">비용</div><div class="v">${fmtKRW(p.cost)}</div></div>
        <div class="b net"><div class="l">순이익${p.confident ? '' : ' (미확정)'}</div><div class="v">${fmtKRW(p.net_income)}</div></div>
        <div class="b margin"><div class="l">이익률</div><div class="v">${p.margin_pct}%</div></div>
      </div>
      ${s.cash_has_data ? `<h2>💵 통장 기준 실제 현금흐름 <span style="font-weight:400;font-size:12px;color:#6b7280">(신한 계좌 — 장부와 무관한 «사실»)</span></h2>
      <table>
        <tr><th>실제 입금</th><td class="num" style="color:#059669;font-weight:700">${fmtKRW(s.cash_in_krw)}</td>
            <th>실제 출금</th><td class="num" style="color:#dc2626;font-weight:700">${fmtKRW(s.cash_out_krw)}</td></tr>
        <tr><th>순증감 (통장이 실제로 늘거나 준 돈)</th>
            <td class="num" colspan="3" style="font-weight:800;font-size:15px;color:${(s.cash_net_krw||0) < 0 ? '#dc2626' : '#059669'}">${fmtKRW(s.cash_net_krw)}</td></tr>
      </table>
      <p style="font-size:11px;color:#6b7280;margin:4px 0 14px">※ 통장 입출금과 아래 손익은 시점이 달라 서로 다른 것이 정상이며, 둘의 차이는 위 대사 결과로 설명됩니다.${(s.revenue_gap_krw||0) > 0 ? ` <b style="color:#b45309">이 달은 장부에 안 잡힌 결제가 ${fmtKRW(s.revenue_gap_krw)} 있어 아래 손익이 실제보다 나쁘게 나옵니다.</b>` : ''}</p>` : ''}
      <h2>매출 — 어디서 들어왔나</h2>
      <table>
        <tr><th>장부 결제 (카페24 등)${badge(src.revenue_book)}</th><td class="num">${fmtKRW(s.revenue_book)}</td><td class="num">${(s.pay_count||0).toLocaleString()} 건</td></tr>
        <tr><th>통장 직접입금 (B2B)${badge(src.revenue_b2b)}</th><td class="num">${fmtKRW(s.revenue_b2b)}</td><td class="num">${(s.b2b_count||0).toLocaleString()} 건</td></tr>
        <tr class="total"><td>매출 합계</td><td class="num">${fmtKRW(p.revenue)}</td><td></td></tr>
        <!-- ⛔ «성격 미확인 입금» 줄과 그 설명은 2026-08-18 사장님 지시로 제거했다.
             매출 합계에 안 넣는 계산은 그대로다 — 금액을 매출 표에 적지 않을 뿐이다. -->
        ${(s.seed_excluded_krw||0) > 0 ? `<tr><td colspan="3" style="font-weight:400;color:#6b7280;font-size:12px">※ 시연용 테스트 결제 ${fmtKRW(s.seed_excluded_krw)} (${s.seed_excluded_count}건)은 실매출이 아니라 위 숫자에서 제외했습니다</td></tr>` : ''}
      </table>
      ${drill(`통장 직접입금 ${(det.b2b_rows||[]).length}건 자세히 보기`, det.b2b_rows, { nameLabel:'보낸 곳', note:'카페24를 거치지 않고 통장으로 바로 들어온 수업료입니다. 2026-08-16부터 매출로 반영합니다.' })}
      <!-- ⛔ «성격 미확인 입금 …건» 펼치기도 함께 제거(2026-08-18 지시) — 위 줄과 한 세트다 -->
      <h2>학생 · 수업</h2>
      <table>
        <tr><th>결제 학생수</th><td class="num">${(s.paying_users||0).toLocaleString()} 명</td>
            <th>평균 결제액</th><td class="num">${fmtKRW(s.avg_per_user)}</td></tr>
        <tr><th>활동 학생수 (수업·결제)</th><td class="num">${(s.active_real||0).toLocaleString()} 명</td>
            <th>재적 학생수 (원부)${badge(src.active_students)}</th><td class="num">${(s.active_students||0).toLocaleString()} 명</td></tr>
        <tr><th>신규 가입</th><td class="num">${(s.new_signups||0).toLocaleString()} 명</td>
            <th>만료</th><td class="num">${(s.expirations||0).toLocaleString()} 명</td></tr>
        <tr><th>총 수업 분${badge(src.class_minutes)}</th><td class="num">${(s.class_minutes||0).toLocaleString()} 분</td>
            <th>세션 수</th><td class="num">${(s.class_sessions||0).toLocaleString()} 건</td></tr>
        ${(s.class_zero_sessions||0) > 0 ? `<tr><td colspan="4" style="font-weight:400;color:#6b7280;font-size:12px">※ 수업 기록 ${s.class_zero_sessions.toLocaleString()}건의 수업시간이 0으로 저장돼 있어 «총 수업 분»이 실제보다 적게 나옵니다</td></tr>` : ''}
        <tr><td colspan="4" style="font-weight:400;color:#6b7280;font-size:12px">※ 재적 학생수는 퇴원 처리가 안 된 옛 학생까지 포함돼 있어 지표의 분모로 쓰지 않습니다</td></tr>
      </table>
      <h2>쓴 돈 — 어디에 썼나</h2>
      <table>
        <tr><th>${c.teacher_payroll_source === 'bank' ? '강사 급여 (신한 송금)' : '강사 급여'}${badge(src.teacher_payroll)}</th><td class="num">${fmtKRW(c.teacher_payroll)}</td><td class="num">${c.teacher_count} 명</td></tr>
        ${(c.teacher_dup_excluded||0) > 0 ? `<tr><td colspan="3" style="font-weight:400;color:#6b7280;font-size:12px">※ 계좌의 강사급여 송금 ${fmtKRW(c.teacher_dup_excluded)} 은 급여명세와 중복이라 제외</td></tr>` : ''}
        <tr><th>PG 수수료 (${window.pgFeeRateLabel()})${badge(src.pg_fee)}</th><td class="num">${fmtKRW(c.pg_fee)}</td><td></td></tr>
        ${c.op_cost_source === 'actual' ? `
        <tr><th>법인카드 지출${badge('actual')}</th><td class="num">${fmtKRW(c.op_card||0)}</td><td></td></tr>
        ${(c.op_bank_rows||[]).map(b => `<tr><th>계좌 출금 — ${esc(b.category)}${badge(b.category === '기타출금' ? 'review' : 'actual')}</th><td class="num">${fmtKRW(b.total)}</td><td></td></tr>`).join('')}
        ${(c.bank_dup_excluded||0) > 0 ? `<tr><td colspan="3" style="font-weight:400;color:#6b7280;font-size:12px">※ 계좌 출금 중 급여이체·카드대금 ${fmtKRW(c.bank_dup_excluded)} 은 강사급여·법인카드 항목과 중복이라 제외</td></tr>` : ''}
        ` : `
        <tr><th>운영비 (매출의 10%로 추정)${badge('estimated')}</th><td class="num">${fmtKRW(c.op_cost)}</td><td></td></tr>
        `}
        ${(c.refunds||0) > 0 ? `<tr><th>학생 환불${badge('actual')}</th><td class="num">${fmtKRW(c.refunds)}</td><td></td></tr>` : ''}
        <tr class="total"><td>합계</td><td class="num">${fmtKRW(c.total)}</td><td></td></tr>
      </table>
      ${(c.unclassified_krw||0) > 0 ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-left:4px solid #dc2626;border-radius:8px;padding:11px 14px;margin:10px 0;font-size:12.5px;line-height:1.7">
        <b style="color:#991b1b">⚠️ 계정과목이 안 붙은 출금이 ${fmtKRW(c.unclassified_krw)} 있습니다 — 이 달 비용의 ${c.unclassified_pct}%입니다.</b><br>
        임대료·광고비·수당 중 무엇인지 정해 주시면, 다음 달부터 같은 거래처는 자동으로 그 과목에 들어갑니다.
      </div>` : ''}
      ${drill(`미분류 출금 자세히 보기 (금액 큰 순 ${(det.unclassified_rows||[]).length}건)`, det.unclassified_rows, { nameLabel:'받는 곳', note:'적요만으로는 무슨 돈인지 알 수 없는 출금입니다.' })}
      ${drill(`법인카드 사용 내역 (금액 큰 순 ${(det.card_rows||[]).length}건)`, det.card_rows, { nameLabel:'가맹점' })}
      <h2>결제 수단별 분포</h2>
      <table>
        <thead><tr><th>결제수단</th><th class="num">건수</th><th class="num">금액</th></tr></thead>
        <tbody>
          ${(d.by_method||[]).map(m => `<tr><td>${esc(m.method||'기타')}</td><td class="num">${m.cnt}</td><td class="num">${fmtKRW(m.total)}</td></tr>`).join('')}
        </tbody>
      </table>
      ${BADGE_LEGEND}`;
  }

  /* 📊 분기·연간 공통 추세표 — 막대로 매출·순이익 흐름을 같이 보여 준다(2026-08-16).
     예전에는 숫자 표만 있어서 «오르는지 내리는지» 를 눈으로 못 읽었다. */
  /* 📅 자료 상태 배지 — 통장·카드 연동 이전 달은 비용이 없어 «가짜 흑자» 가 된다.
     그 달의 순이익을 그냥 보여 주면 회사 상태를 완전히 잘못 읽는다(2026-08-17). */
  const COV = {
    full:    ['온전',      '#166534', '#dcfce7'],
    partial: ['자료부족',  '#b45309', '#fef3c7'],
    none:    ['자료없음',  '#991b1b', '#fee2e2'],
    future:  ['아직 안 옴','#6b7280', '#f3f4f6'],
  };
  function covBadge(lv){
    const c = COV[lv]; if (!c) return '';
    return `<span style="display:inline-block;font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;background:${c[2]};color:${c[1]};margin-left:6px">${c[0]}</span>`;
  }

  function trendTable(d, headLabel){
    // 아직 오지 않은 달은 표에서 뺀다 — 0원 줄이 합계에 섞이면 안 된다
    const ms = (d.monthlies || []).filter(m => !m.coverage || m.coverage.level !== 'future');
    const t = d.totals || {}, tf = d.totals_full || null;
    const max = Math.max(1, ...ms.map(m => Math.abs(m.revenue||0)), ...ms.map(m => Math.abs(m.net||0)));
    /* 📊 막대 — 폭을 인라인이 아니라 CSS(.bar)로 준다. 인라인 width:70px 는 «줄어들지 않는»
       고정폭이라 막대 2칸만으로 표의 최소 폭에 140px 가 얹혔다(2026-08-18 실측: 표 최소폭 898px).
       인쇄에서는 아예 숨긴다 — A4 본문은 640px 뿐이고, 막대는 없어도 숫자로 다 읽힌다. */
    const bar = (v, color) => {
      const w = Math.min(100, Math.round((Math.abs(v||0) / max) * 100));
      return `<span class="bar"><span style="display:block;height:100%;width:${w}%;background:${color};border-radius:0 3px 3px 0"></span></span>`;
    };
    const st = d.sync_starts || {};
    const bad = ms.filter(m => m.coverage && m.coverage.level !== 'full');
    return `
      ${bad.length ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 15px;margin:12px 0;font-size:12.5px;line-height:1.75">
        <b style="color:#92400e">⚠️ 자료가 온전하지 않은 달이 ${bad.length}개 있습니다 — 그 달의 순이익을 그대로 믿으면 안 됩니다.</b><br>
        통장 연동은 <b>${esc(st.bankFrom || '미연동')}</b>, 법인카드 연동은 <b>${esc(st.cardFrom || '미연동')}</b> 부터입니다.
        그 전 달은 <b>비용이 없거나 일부만</b> 잡혀서 순이익이 실제보다 좋게(때로는 흑자로) 나옵니다.<br>
        해당 달: ${bad.map(m => `<b>${esc(m.period)}</b>`).join(' · ')}
      </div>` : ''}
      <div class="tblwrap"><table class="compact">
        <thead><tr><th>${headLabel}</th><th class="num">매출</th><th class="barcell"></th><th class="num">장부 결제</th><th class="num">통장 B2B</th><th class="num">결제건</th><th class="num">강사 급여</th><th class="num">비용 합계</th><th class="num">순이익</th><th class="barcell"></th></tr></thead>
        <tbody>
          ${ms.map(m => {
            const lv = (m.coverage && m.coverage.level) || 'full';
            const dim = lv !== 'full';
            return `<tr${dim ? ' style="background:#fffbeb"' : ''}>
            <td>${esc(m.period)}${covBadge(lv)}</td>
            <td class="num">${fmtKRW(m.revenue)}</td><td class="barcell">${bar(m.revenue, '#3b82f6')}</td>
            <td class="num">${fmtKRW(m.revenue_book)}</td>
            <td class="num">${fmtKRW(m.revenue_b2b)}</td>
            <td class="num">${m.pays}</td>
            <td class="num">${fmtKRW(m.payroll)}</td>
            <td class="num">${fmtKRW(m.cost)}</td>
            <td class="num"><b style="color:${dim ? '#9ca3af' : ((m.net||0) < 0 ? '#dc2626' : '#166534')}">${fmtKRW(m.net)}</b>${dim ? '<div style="font-size:10px;color:#b45309">참고값</div>' : ''}</td>
            <td class="barcell">${dim ? '' : bar(m.net, (m.net||0) < 0 ? '#ef4444' : '#22c55e')}</td>
          </tr>`; }).join('')}
          <tr class="total"><td>합계 (전체)</td><td class="num">${fmtKRW(t.revenue)}</td><td class="barcell"></td><td class="num">${fmtKRW(t.revenue_book)}</td><td class="num">${fmtKRW(t.revenue_b2b)}</td><td class="num">${t.pays}</td><td class="num">${fmtKRW(t.payroll)}</td><td class="num">${fmtKRW(t.cost)}</td><td class="num">${fmtKRW(t.net)}</td><td class="barcell"></td></tr>
          ${tf ? `<tr class="total" style="background:#dcfce7"><td>합계 (자료 온전한 달만)<div style="font-size:10.5px;font-weight:400;color:#166534">${(d.full_months||[]).join(' · ') || '없음'}</div></td>
            <td class="num">${fmtKRW(tf.revenue)}</td><td class="barcell"></td><td class="num">${fmtKRW(tf.revenue_book)}</td><td class="num">${fmtKRW(tf.revenue_b2b)}</td><td class="num">${tf.pays}</td><td class="num">${fmtKRW(tf.payroll)}</td><td class="num">${fmtKRW(tf.cost)}</td>
            <td class="num"><b style="color:${(tf.net||0) < 0 ? '#dc2626' : '#166534'}">${fmtKRW(tf.net)}</b></td><td class="barcell"></td></tr>` : ''}
        </tbody>
      </table></div>
      <p style="font-size:11.5px;color:#6b7280;margin:10px 0 0;line-height:1.7">
        ※ 매출 = 장부 결제(카페24 등) + 통장 직접입금(B2B).<br>
        ※ <b>회사 상태는 「자료 온전한 달만」 합계로 보세요.</b> 전체 합계에는 비용이 덜 잡힌 달이 섞여 있어 실제보다 좋게 나옵니다.<br>
        ※ 아직 오지 않은 달은 표에서 뺐습니다.
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;color:#6b7280;margin-top:8px">
        <span>${covBadge('full')} 통장·카드 자료가 그 달 전체에 있음</span>
        <span>${covBadge('partial')} 자료가 일부만 있어 비용이 덜 잡힘</span>
        <span>${covBadge('none')} 비용 자료가 아예 없음 — 순이익 무의미</span>
      </div>`;
  }

  // 이익률은 «자료 온전한 달» 기준을 앞세운다 — 전체 기준은 비용이 덜 잡혀 부풀려진다
  function trendMeta(d){
    const hasFull = d.totals_full && (d.full_months||[]).length;
    return hasFull
      ? `${d.label} · 이익률 <b>${d.margin_pct_full}%</b> <span style="font-size:11px">(자료 온전한 ${d.full_months.length}개월 기준)</span>`
      : `${d.label} · <span style="color:#b45309">자료가 온전한 달이 없어 이익률을 내지 않았습니다</span>`;
  }

  function renderQuarterly(d){
    return `
      <h1>📊 분기 보고서</h1>
      <div class="meta">${trendMeta(d)}</div>
      ${trendTable(d, '월')}`;
  }

  function renderAnnual(d){
    return `
      <h1>📈 연간 결산</h1>
      <div class="meta">${trendMeta(d)}</div>
      ${trendTable(d, '월')}`;
  }

  /* 🏢 가맹점별 정산서.
     💳 총 매출 = 「장부 결제」(카페24 등) + 「B2B 직접입금」(학원이 통장으로 바로 보낸 수업료).
        예전엔 장부 결제만 세서 B2B 로 받는 가맹점이 매출 0 으로 찍혔다(2026-08-18 수정). */
  /* 요율 표기 — 값이 없으면 «—». 0.6 → «60.0%». 화면에 숫자를 손으로 쓰지 않는다:
     예전에 「평균 수수료율 15%」 라고 박아 두었다가 정책이 60% 로 바뀌자 거짓말이 됐다. */
  const pctRate = v => (v == null || isNaN(v)) ? '—' : (Number(v) * 100).toFixed(1) + '%';

  function renderFranchise(d){
    const src = d.sources || {};
    const t = d.totals || {};
    return `
      <h1>🏢 가맹점별 정산서</h1>
      <div class="meta">${d.label} · 학생 단위 실제 귀속 (균등분배 아님) · 장부 결제 + B2B 직접입금</div>
      ${d.hq_fee_rate_forced != null ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:8px;padding:11px 14px;margin:10px 0;font-size:12.5px;line-height:1.7">
        <b style="color:#991b1b">⚠️ 수수료율을 ${pctRate(d.hq_fee_rate_forced)} 로 «강제 지정»한 «만약» 계산입니다.</b>
        저장된 설정이 아니라 주소의 <code>?hq_fee=</code> 로 눌러 쓴 값이라 <b>이대로 가맹점에 보내면 안 됩니다.</b>
      </div>` : ''}
      ${noteList(d.notes)}
      ${(d.b2b_total||0) > 0 ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-left:4px solid #2563eb;border-radius:8px;padding:11px 14px;margin:10px 0;font-size:12.5px;line-height:1.7">
        <b style="color:#1e40af">🏦 B2B 직접입금 ${(d.b2b_count||0).toLocaleString()}건 · ${fmtKRW(d.b2b_total)}</b> 을 이 정산서에 포함했습니다
        (가맹점에 붙인 금액 <b>${fmtKRW(d.b2b_assigned)}</b>${(d.b2b_unassigned_krw||0) > 0 ? ` · 아직 못 붙인 금액 <b>${fmtKRW(d.b2b_unassigned_krw)}</b>` : ''}).<br>
        학원이 수업료를 통장으로 바로 보내는 결제라 카페24 결제 장부에는 없습니다. 수수료율은 B2C 와 같은 값을 적용했습니다.
      </div>
      ${drill(`B2B 직접입금 ${(d.b2b_rows||[]).length}건 자세히 보기 — 어느 가맹점에 붙었는지`,
        (d.b2b_rows||[]).map(r => ({ date: r.date, name: r.remark + ' → ' + (r.matched_name ? r.matched_name + ' (' + r.matched_by + ')' : '배정 못 함'), amount: r.amount })),
        { nameLabel: '보낸 곳 → 붙은 가맹점', note: '「지정」은 사람이 직접 붙인 것, 「대리점」·「지사」는 입금 적요가 그 이름과 맞아 자동으로 붙은 것입니다. 후보가 둘 이상이면 붙이지 않습니다.' })}` : ''}
      ${(d.unassigned_krw||0) > 0 ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-left:4px solid #f59e0b;border-radius:8px;padding:11px 14px;margin:10px 0;font-size:12.5px;line-height:1.7">
        <b style="color:#92400e">⚠️ 소속을 확정하지 못한 매출이 ${fmtKRW(d.unassigned_krw)} (${d.unassigned_pct}%) 있습니다.</b><br>
        대부분은 <b>학생 원부에 없는 아이디로 들어온 결제</b>입니다 — 대리점·직원이 학생 몫을 대신 결제하면
        그 아이디가 학생 원부에 없어 어느 지사인지 알 수 없습니다. 아무 가맹점에도 넣지 않았습니다.
        <br><b>아래 아이디가 어느 지사인지 알려 주시면 그 뒤부터 자동으로 붙습니다.</b>
        ${(d.b2b_unassigned_krw||0) > 0 ? `<br>그중 <b>${fmtKRW(d.b2b_unassigned_krw)}</b> 은 B2B 통장 입금입니다 — 관리자 화면 「회계관리 › 🏦 배정 못 한 B2B 입금」 에서 지정할 수 있습니다.` : ''}
      </div>
      ${drill(`배정 못 한 결제 아이디 ${(d.unassigned_payers||[]).length}개 — 어느 지사인지 알려 주세요`,
        (d.unassigned_payers||[]).map(u => ({ date: u.user_id, name: u.reason + ' · ' + u.pays + '건', amount: u.amount })),
        { dateLabel: '결제 아이디', nameLabel: '사유' })}
      ${drill(`배정 못 한 B2B 입금 ${(d.b2b_unassigned||[]).length}곳 — 어느 대리점·지사인지 알려 주세요`,
        (d.b2b_unassigned||[]).map(u => ({ date: u.payee, name: u.reason + ' · ' + u.count + '건', amount: u.amount })),
        { dateLabel: '입금 적요', nameLabel: '사유' })}` : ''}
      <div class="tblwrap"><table class="compact">
        <thead><tr><th>가맹점</th><th class="num">학생수</th><th class="num">결제건</th><th class="num">장부 결제</th><th class="num">B2B 입금${badge(src.b2b_revenue)}</th><th class="num">총 매출${badge(src.gross_revenue)}</th><th class="num">수수료율</th><th class="num">본사 수수료${badge(src.hq_fee)}</th><th class="num">정산액</th><th>송금예정</th><th>상태</th></tr></thead>
        <tbody>
          ${d.rows.length ? d.rows.map(r => `<tr><td>${esc(r.franchise_name)}</td><td class="num">${(r.students||0).toLocaleString()}</td><td class="num">${r.pay_count||0}</td><td class="num">${fmtKRW(r.book_revenue)}</td><td class="num">${(r.b2b_revenue||0) > 0 ? fmtKRW(r.b2b_revenue) : '—'}</td><td class="num">${fmtKRW(r.gross_revenue)}</td><td class="num">${pctRate(r.hq_fee_rate)}${r.rate_mixed ? '<span title="이 가맹점 안에서 대리점마다 요율이 다릅니다 — 실제로 떼인 비율(가중평균)입니다" style="color:#b45309;font-size:10px"> 혼합</span>' : ''}</td><td class="num">${fmtKRW(r.hq_fee)}</td><td class="num"><b>${fmtKRW(r.net_settlement)}</b></td><td>${esc(r.due_date)}</td><td>${esc(r.status)}</td></tr>`).join('')
            : '<tr><td colspan="11" style="text-align:center;color:#6b7280">이 달에 가맹점으로 귀속된 매출이 없습니다</td></tr>'}
          <tr class="total"><td>합계</td><td></td><td></td><td class="num">${fmtKRW(t.book)}</td><td class="num">${fmtKRW(t.b2b)}</td><td class="num">${fmtKRW(t.gross)}</td><td class="num">${pctRate(d.hq_fee_rate)}</td><td class="num">${fmtKRW(t.fee)}</td><td class="num">${fmtKRW(t.net)}</td><td></td><td></td></tr>
        </tbody>
      </table></div>
      <p style="font-size:11px;color:#6b7280;margin:6px 0 0;line-height:1.7">
        ※ <b>장부 결제</b> = 카페24 등 결제 기록(student_payments) · <b>B2B 직접입금</b> = 학원이 신한 통장으로 바로 보낸 수업료.
        결제건에는 B2B 입금 건수도 포함됩니다. <b>학생수</b>는 결제 장부에서만 셀 수 있어 B2B 입금은 반영되지 않습니다
        (통장 입금에는 학생 정보가 없습니다).<br>
        ※ 이 달 매출 총계 <b>${fmtKRW(d.revenue_total)}</b> = 장부 결제 ${fmtKRW(d.book_total)} + B2B 직접입금 ${fmtKRW(d.b2b_total)} ·
        가맹점에 배정한 금액 <b>${fmtKRW(t.gross)}</b>
      </p>
      ${BADGE_LEGEND}`;
  }

  function renderPayslips(d){
    return `
      <h1>👨‍🏫 강사별 급여명세서</h1>
      <div class="meta">${d.label} · 총 ${d.teacher_count}명</div>
      ${noteList(d.notes)}
      <div class="tblwrap"><table class="compact">
        <thead><tr><th>강사ID</th><th>이름</th><th>국가</th><th class="num">수업분</th><th class="num">기본급여</th><th class="num">상여</th><th class="num">공제</th><th class="num">실지급</th></tr></thead>
        <tbody>
          ${d.rows.map(r => `<tr><td>${r.teacher_id}</td><td><b>${r.teacher_name||r.teacher_id}</b></td><td>${r.country||''}</td><td class="num">${(r.minutes||0).toLocaleString()}</td><td class="num">${fmtKRW(r.payment_krw)}</td><td class="num">${fmtKRW(r.bonus)}</td><td class="num" style="color:#dc2626">${fmtKRW(-Math.abs(r.deduction||0))}</td><td class="num"><b>${fmtKRW(r.net)}</b></td></tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#6b7280">데이터 없음</td></tr>'}
          <tr class="total"><td colspan="3">합계</td><td class="num">${(d.totals.minutes||0).toLocaleString()}</td><td class="num">${fmtKRW(d.totals.payment)}</td><td class="num">${fmtKRW(d.totals.bonus)}</td><td class="num">${fmtKRW(d.totals.deduction)}</td><td class="num">${fmtKRW(d.totals.net)}</td></tr>
        </tbody>
      </table></div>`;
  }

  function renderKpi(d){
    // 계산할 근거가 없는 지표는 숫자를 지어내지 않고 «자료없음» 으로 보여 준다(2026-08-16)
    return `
      <h1>⭐ 경영지표 (KPI)</h1>
      <div class="meta">${d.label}</div>
      <div class="kpi-grid">
        ${d.kpis.map(k => `<div class="kpi" style="${k.available === false ? 'opacity:.72' : ''}">
          <div class="l">${esc(k.label)}${badge(k.source)}</div>
          <div class="v" style="${k.available === false ? 'font-size:15px;color:#991b1b' : ''}">${k.available === false ? '자료없음' : fmtNum(k.value, k.unit)}</div>
          ${k.note ? `<div style="font-size:10.5px;color:#6b7280;margin-top:5px;line-height:1.55">${esc(k.note)}</div>` : ''}
        </div>`).join('')}
      </div>
      <h2>요약 손익</h2>
      <table>
        <tr><th>매출 (장부 결제 + 통장 B2B)</th><td class="num">${fmtKRW(d.revenue)}</td></tr>
        <tr><th>비용 (강사급여 포함)</th><td class="num">${fmtKRW(d.cost)}</td></tr>
        <tr class="total"><td>순이익</td><td class="num">${fmtKRW(d.net)}</td></tr>
      </table>
      <p style="font-size:11px;color:#6b7280;margin-top:14px;line-height:1.7">
        ※ ARPU = 매출 ÷ <b>그 달 활동 학생수</b>(수업에 들어왔거나 결제한 학생). 재적 학생수로 나누지 않습니다 —
        원부에 퇴원 처리가 안 된 옛 학생이 많아 값이 왜곡됩니다.<br>
        ※ CAC = <b>법인카드의 실제 광고비</b> ÷ 신규 학생수. 광고비 자료가 없으면 계산하지 않습니다(예전에는 «매출의 5%»로 지어냈습니다).<br>
        ※ ROI = 순이익 ÷ 비용 · LTV/CAC가 3 이상이면 건전한 편입니다.
      </p>
      ${BADGE_LEGEND}`;
  }
})();


// ════════════════════════════════════════════════════════════════════
// 💰 회계관리 submenu 핸들러 모음 (2026-05-03 추가)
// ════════════════════════════════════════════════════════════════════
(function(){
  const _fmt = n => (n === null || n === undefined || isNaN(n)) ? '—'
                  : '₩ ' + Number(n).toLocaleString('ko-KR');
  const _esc = s => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const _today = () => new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);
  const _showErr = (tbody, e, cols) => {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${cols||7}" class="empty" style="color:#ef4444">에러: ${_esc(e.message||e)}</td></tr>`;
  };
  const _badge = (text, color) => {
    const colors = { ok:'#10b981', warn:'#f59e0b', bad:'#ef4444', info:'#3b82f6' };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:99px;background:${colors[color]||'#6b7280'};color:#fff;font-size:11px;font-weight:700">${_esc(text)}</span>`;
  };

  // ──────────────────────────────────────────────────────────
  // 1. 학생 결제 내역
  // ──────────────────────────────────────────────────────────
  /* 🏢 (2026-08-18 수정요청 #02) 지사 드롭다운 채우기.
     241개짜리 목록이라 fields=min 으로 {id,name} 만 받는다(25KB → 6KB).
     한 번 받으면 캐시한다 — 「불러오기」를 누를 때마다 다시 받을 이유가 없다.
     ⚠️ 목록을 못 받아도 화면은 살아 있어야 한다. 그 경우 이름 타이핑 검색으로 동작한다
        (서버가 franchise=<이름조각> 도 받는다). */
  let _payFranchises = null;
  async function _payLoadFranchises(){
    if (_payFranchises) return _payFranchises;
    const dl = document.getElementById('acc-pay-franchise-list');
    try {
      const r = await fetch('/api/admin/franchises?fields=min', { credentials:'include' });
      const d = await r.json();
      _payFranchises = (d && d.ok && Array.isArray(d.items)) ? d.items : [];
    } catch(e) { _payFranchises = []; }
    if (dl) dl.innerHTML = _payFranchises.map(f => `<option value="${_esc(f.name)}"></option>`).join('');
    return _payFranchises;
  }
  // 입력칸에 포커스가 오는 순간 목록을 채운다 — 눌렀는데 비어 있으면 «필터가 없다» 고 오해한다
  window.accFillFranchiseList = _payLoadFranchises;
  /* 입력칸의 글자를 서버 파라미터로 바꾼다.
     목록의 이름과 «정확히» 같으면 그 지사 하나(franchise_id), 아니면 이름 검색(franchise). */
  function _payFranchiseParams(qs){
    const el = document.getElementById('acc-pay-franchise');
    const v = (el && el.value || '').trim();
    if (!v) return;
    const hit = (_payFranchises || []).filter(f => String(f.name) === v);
    if (hit.length === 1) qs.set('franchise_id', hit[0].id);
    else qs.set('franchise', v);
  }

  window.accLoadPayments = async function(){
    const from   = document.getElementById('acc-pay-from').value;
    const to     = document.getElementById('acc-pay-to').value;
    const method = document.getElementById('acc-pay-method').value;
    const status = document.getElementById('acc-pay-status').value;
    // 💳 (2026-08-12 수정요청 #03) B2B/B2C 구분 — 서버가 대리점 결제유형으로 파생·필터
    const channel = (document.getElementById('acc-pay-channel')||{}).value || '';
    const tbody  = document.getElementById('acc-pay-tbody');
    tbody.innerHTML = '<tr><td colspan="11" class="empty">불러오는 중…</td></tr>';
    try {
      await _payLoadFranchises();
      const qs = new URLSearchParams();
      if (from)   qs.set('from', from);
      if (to)     qs.set('to', to);
      if (method) qs.set('method', method);
      if (status) qs.set('status', status);
      if (channel) qs.set('channel', channel);
      _payFranchiseParams(qs);
      const r = await fetch('/api/admin/reports/payments-list?' + qs.toString(), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      if (!d.rows.length) { _accPayRows = []; tbody.innerHTML = '<tr><td colspan="11" class="empty">조건에 맞는 결제 내역이 없습니다.</td></tr>'; return; }
      _accPayRows = d.rows;
      accRenderPayments();
    } catch(e) { _showErr(tbody, e, 11); }
  };

  /* ▲▼ (2026-08-30 v4 제안서 11) 결제/주문 내역 정렬.
     · 머리글 클릭 → 오름차순(▲) ↔ 내림차순(▼) 토글
     · Shift+클릭  → 다중 정렬(1차·2차… 우선순위 번호를 화살표 옆에 표시)
     · 정렬하지 않은 칸은 «↕» 로 «누르면 정렬된다» 는 것을 먼저 알린다.
     ⚠️ 이 표는 «서버가 준 한 페이지» 를 그대로 정렬한다 — 전체 결과 정렬이 아니다.
        (전체 정렬이 필요하면 서버 ORDER BY 를 받아야 하는 별건이다.)
     ⚠️ 숫자 칸은 문자열로 비교하지 않는다 — '9' > '10' 이 되어 조용히 틀린다. */
  var _accPayRows = [];
  var _accPaySort = [];   // [{key, dir}] — dir: 1=오름차순 ▲ / -1=내림차순 ▼
  const _ACC_PAY_NUM = { paid_at: 1, id: 1, amount_krw: 1 };

  function _accPayVal(row, key) {
    if (key === 'channel') return row.channel || '';
    if (key === 'franchise_name') return row.franchise_name || '';
    return row[key];
  }
  function _accPayCmp(a, b) {
    for (var i = 0; i < _accPaySort.length; i++) {
      var k = _accPaySort[i].key, dir = _accPaySort[i].dir;
      var x = _accPayVal(a, k), y = _accPayVal(b, k), c;
      if (_ACC_PAY_NUM[k]) {
        c = (Number(x) || 0) - (Number(y) || 0);
      } else {
        c = String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), 'ko');
      }
      if (c) return c * dir;
    }
    return 0;
  }
  function _accPayArrows() {
    document.querySelectorAll('#acc-pay-table th[data-sort-key]').forEach(function (th) {
      var key = th.getAttribute('data-sort-key');
      var idx = -1;
      for (var i = 0; i < _accPaySort.length; i++) if (_accPaySort[i].key === key) { idx = i; break; }
      var sp = th.querySelector('.accpay-arrow');
      if (!sp) return;
      if (idx < 0) { sp.textContent = '↕'; sp.style.opacity = '.35'; return; }
      sp.textContent = (_accPaySort[idx].dir > 0 ? '▲' : '▼') + (_accPaySort.length > 1 ? String(idx + 1) : '');
      sp.style.opacity = '1';
    });
  }
  window.accSortPayments = function (key, shiftKey) {
    if (!key) return;
    var idx = -1;
    for (var i = 0; i < _accPaySort.length; i++) if (_accPaySort[i].key === key) { idx = i; break; }
    if (!shiftKey) {
      _accPaySort = (idx === 0 && _accPaySort.length === 1)
        ? [{ key: key, dir: -_accPaySort[0].dir }]    // 같은 칸을 또 누르면 방향만 뒤집는다
        : [{ key: key, dir: 1 }];
    } else if (idx >= 0) {
      _accPaySort[idx].dir = -_accPaySort[idx].dir;
    } else {
      _accPaySort.push({ key: key, dir: 1 });
    }
    accRenderPayments();
  };

  window.accRenderPayments = function () {
    const tbody = document.getElementById('acc-pay-tbody');
    if (!tbody) return;
    var rows = _accPayRows.slice();
    if (_accPaySort.length) rows.sort(_accPayCmp);
    _accPayArrows();
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty">조건에 맞는 결제 내역이 없습니다.</td></tr>'; return; }
    {
      tbody.innerHTML = rows.map(p => {
        /* 🐛 (2026-08-16) paid_at 은 이미 «밀리초» 다. ×1000 을 하고 있어서 화면에
           서기 58,000년대 날짜가 찍혔다(CSV 는 정상이라 눈에 안 띄었다). */
        const t = new Date((p.paid_at||0)+9*3600*1000).toISOString().slice(0,16).replace('T',' ');
        const c = p.status === 'paid' ? 'ok' : p.status === 'refunded' ? 'warn' : 'bad';
        const ch = p.channel === 'B2B'
          ? '<span style="display:inline-block;padding:2px 8px;border-radius:99px;background:#1d4ed8;color:#fff;font-size:11px;font-weight:700">B2B</span>'
          : '<span style="display:inline-block;padding:2px 8px;border-radius:99px;background:#0891b2;color:#fff;font-size:11px;font-weight:700">B2C</span>';
        /* 🧑 이름이 없는 결제가 실제로 있다 — 학생 원부에 없는 아이디로 들어오는 대리결제.
           «-» 로 얼버무리지 않고 «원부 없음» 이라고 밝힌다(가맹점 정산의 «배정 불가» 와 같은 건). */
        const nm = p.student_name
          ? `<b>${_esc(p.student_name)}</b>`
          : '<span style="color:#9ca3af;font-size:11px">원부 없음</span>';
        const fr = p.franchise_name
          ? _esc(p.franchise_name)
          : '<span style="color:#9ca3af;font-size:11px">미배정</span>';
        return `<tr><td>${_esc(t)}</td><td>${_esc('#'+p.id)}</td><td>${nm}</td>
                <td style="font-size:11px;color:#6b7280">${_esc(p.user_id||'')}</td>
                <td>${ch}</td><td>${fr}</td><td>${_esc(p.shop_name||'-')}</td>
                <td>${_esc(p.memo||'-')}</td><td style="text-align:right">${_fmt(p.amount_krw)}</td>
                <td>${_esc(p.method||'')}</td><td>${_badge(p.status, c)}</td></tr>`;
      }).join('');
    }
  };
  window.accDownloadPaymentsCsv = async function(fmt){
    // 지사 목록을 먼저 확보해야 «고른 지사 하나»(franchise_id)로 정확히 내려받는다.
    // 목록 없이 이름만 보내면 이름이 서로의 일부인 지사끼리 섞여 나올 수 있다.
    await _payLoadFranchises();
    const from = document.getElementById('acc-pay-from').value;
    const to = document.getElementById('acc-pay-to').value;
    const method = document.getElementById('acc-pay-method').value;
    const status = document.getElementById('acc-pay-status').value;
    const channel = (document.getElementById('acc-pay-channel')||{}).value || '';
    const qs = new URLSearchParams({ format: (fmt === 'xlsx' ? 'xlsx' : 'csv') });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    // 🧾 (2026-08-18) 화면과 «같은» 조건으로 내려받는다. 예전엔 결제수단·상태·지사를
    //    빼고 보내서, 화면엔 걸러 놓고 파일엔 전부 담기는 어긋남이 있었다.
    if (method) qs.set('method', method);
    if (status) qs.set('status', status);
    if (channel) qs.set('channel', channel);
    _payFranchiseParams(qs);
    location.href = '/api/admin/reports/payments-list?' + qs.toString();
  };
  window.accDownloadPaymentsXlsx = function(){ window.accDownloadPaymentsCsv('xlsx'); };

  // ──────────────────────────────────────────────────────────
  // 2. 국가별 강사료 환전
  // ──────────────────────────────────────────────────────────
  window.accLoadForex = async function(){
    const month = document.getElementById('acc-fx-month').value || _today().slice(0,7);
    const tbody = document.getElementById('acc-fx-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty">불러오는 중…</td></tr>';
    try {
      const r = await fetch('/api/admin/reports/payslips?period=' + encodeURIComponent(month), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      // 국가별 그룹화
      const fxRates = { '필리핀':24.34, 'PH':24.34, 'Philippines':24.34,
                        '미국':1365, 'US':1365, 'USA':1365, '캐나다':1365, 'CA':1365,
                        '영국':1720, 'UK':1720, '호주':1720, 'AU':1720,
                        '한국':1, 'KR':1, 'Korea':1 };
      const byCountry = {};
      for (const r of d.rows||[]) {
        const c = r.country || '한국';
        const fx = fxRates[c] || 1;
        if (!byCountry[c]) byCountry[c] = { country:c, count:0, krw:0, fx };
        byCountry[c].count++;
        byCountry[c].krw += (r.net||r.payment_krw||0);
      }
      const arr = Object.values(byCountry);
      if (!arr.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty">${month} 강사 급여 데이터 없음</td></tr>`; return; }
      tbody.innerHTML = arr.map(r => {
        const local = r.fx > 0 ? Math.round(r.krw / r.fx) : r.krw;
        return `<tr><td>${_esc(r.country)}</td><td style="text-align:right">${r.count}</td>
                <td style="text-align:right">${local.toLocaleString()}</td>
                <td style="text-align:right">${r.fx.toLocaleString()}</td>
                <td style="text-align:right">${_fmt(r.krw)}</td>
                <td>${_badge('대기','info')}</td></tr>`;
      }).join('');
    } catch(e) { _showErr(tbody, e, 6); }
  };

  // ──────────────────────────────────────────────────────────
  // 3. 가맹점 정산
  // ──────────────────────────────────────────────────────────
  // 📊 카페24 매출·손익 추이 대시보드 (Chart.js 콤보차트 + KPI)
  window._c24finData = null; window._c24finChart = null;
  window.c24FinSummary = async function(range){
    const en = (window.adminLang==='en');
    range = range || window._c24finRange || 24; window._c24finRange = range;
    const kpiBox = document.getElementById('c24fin-kpis');
    const cv = document.getElementById('c24finChart');
    const chartWrap = document.getElementById('c24fin-chartwrap');
    const fbBox = document.getElementById('c24fin-fallback');
    if (!cv) return;
    // 범위 버튼 활성화 표시
    document.querySelectorAll('.c24fin-rbtn').forEach(function(b){ var on = Number(b.getAttribute('data-r'))===Number(range); b.style.background = on?'#3b82f6':'transparent'; b.style.color = on?'#fff':'#94a3b8'; });
    const won = function(n){ n=Number(n||0); var a=Math.abs(n); var s=n<0?'-':''; if(a>=1e8) return s+'₩'+(a/1e8).toFixed(1)+'억'; if(a>=1e4) return s+'₩'+Math.round(a/1e4).toLocaleString('ko-KR')+'만'; return s+'₩'+a.toLocaleString('ko-KR'); };
    const wonFull = function(n){ try{ return '₩'+Number(n||0).toLocaleString('ko-KR'); }catch(e){ return n; } };
    try {
      if (!window._c24finData){
        const d = await (await fetch('/api/admin/finance-cafe24/summary', { credentials:'include' })).json();
        if (!d.ok) throw new Error(d.error||d.code||'error');
        window._c24finData = d;
      }
      const all = (window._c24finData.months||[]).slice().reverse(); // 오래된→최근
      const months = all.slice(-range);
      if (!months.length){
        /* 🈳 (2026-08-18) «데이터 없음» 만 띄우면 고장인지 원래 빈 건지 구분이 안 된다.
           실측: Neo4j 연결은 정상(교재 62권 등 다른 노드는 조회됨)인데 회계 노드(AccBook)만
           0건이었다. 적재는 카페24 서버 쪽 작업이라 워커가 대신 채울 수 없다 —
           요청서: docs/카페24_회계데이터_적재요청_2026-08-18.md */
        if(kpiBox) kpiBox.innerHTML='<div style="color:#94a3b8;grid-column:1/-1;line-height:1.6">'
          +(en?'No accounting data in Neo4j yet. The connection is fine — the Cafe24 server has not loaded the ledger (AccBook) data.'
               :'카페24 회계 데이터가 아직 Neo4j에 적재되지 않았습니다. 연결은 정상이고(교재·학생 명부는 조회됩니다), 회계장부(AccBook) 적재는 카페24 서버 쪽 작업입니다.')
          +'</div>';
        return;
      }
      // 구간 합계 + 마진율
      // 🧾 income/expense 는 서버(finance-cafe24/summary)가 「케이씨피M」을 이미 뺀 값이다.
      //    (「케이씨피M」 = 하나은행에서 옮겨 온 운영자금 — 매출이 아니라 자금 이동)
      const sumInc = months.reduce(function(s,m){return s+(Number(m.income)||0);},0);
      const sumExp = months.reduce(function(s,m){return s+(Number(m.expense)||0);},0);
      const sumNet = sumInc - sumExp;
      const margin = sumInc>0 ? Math.round(sumNet/sumInc*1000)/10 : 0;
      // 최근 달 전월 대비
      const last = months[months.length-1], prev = months[months.length-2];
      const momInc = (prev && prev.income>0) ? Math.round(((last.income-prev.income)/prev.income)*1000)/10 : null;
      // KPI 카드
      if (kpiBox){
        var kcard = function(lab, val, sub, color){ return '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 14px">'
          + '<div style="font-size:11px;color:#94a3b8">'+lab+'</div>'
          + '<div style="font-size:19px;font-weight:800;color:'+color+';margin-top:3px;letter-spacing:-0.3px">'+val+'</div>'
          + (sub?'<div style="font-size:10.5px;color:#64748b;margin-top:2px">'+sub+'</div>':'')+'</div>'; };
        kpiBox.innerHTML =
          kcard('총 매출', won(sumInc), range+'개월 합계', '#60a5fa')
          + kcard('총 지출', won(sumExp), range+'개월 합계', '#f87171')
          + kcard('순이익', won(sumNet), (sumNet>=0?'▲ 흑자':'▼ 적자'), (sumNet>=0?'#34d399':'#fb7185'))
          + kcard('영업이익률', margin+'%', (momInc!=null?('최근 매출 '+(momInc>=0?'▲':'▼')+Math.abs(momInc)+'% MoM'):'—'), (margin>=0?'#fbbf24':'#fb7185'));
      }
      /* ⛔ «「케이씨피M」 N건 ₩… 제외» 안내 상자 제거(2026-08-18 사장님 지시).
         집계에서 빼는 것은 그대로지만, 그 이름과 금액이 화면에 뜨는 것 자체를 원치 않으신다.
         («제외했습니다» 라고 적어 주는 것도 «아직 남아 있다» 로 읽힌다 — 대사 카드·월간
          리포트·손익계산서에서 같은 이유로 이미 뺐다.) 되살리지 말 것. */
      var noteBox = document.getElementById('c24fin-sum-total');
      if (noteBox) { noteBox.style.display = 'none'; noteBox.innerHTML = ''; }
      // 데이터 시리즈
      const labels = months.map(function(m){ return m.ym.slice(2); }); // YY-MM
      const inc = months.map(function(m){ return Number(m.income)||0; });
      const exp = months.map(function(m){ return Number(m.expense)||0; });
      const net = months.map(function(m){ return Number(m.net)||0; });

      // ── 폴백 막대 (Chart.js 미로드 시에도 항상 데이터가 보이도록) ──
      const renderFallback = function(){
        if (!fbBox) return;
        var mx = Math.max.apply(null, inc.concat(exp).concat([1]));
        fbBox.innerHTML = months.map(function(m){
          var i=Number(m.income)||0, e=Number(m.expense)||0, n=Number(m.net)||0;
          return '<div style="display:grid;grid-template-columns:52px 1fr 96px;gap:8px;align-items:center;font-size:10.5px">'
            + '<span style="color:#94a3b8;font-weight:600">'+m.ym.slice(2)+'</span>'
            + '<div style="display:flex;flex-direction:column;gap:2px">'
            +   '<div style="background:rgba(96,165,250,0.15);border-radius:99px;height:7px;overflow:hidden"><div style="width:'+Math.max(1,Math.round(i/mx*100))+'%;height:100%;background:#60a5fa"></div></div>'
            +   '<div style="background:rgba(248,113,113,0.15);border-radius:99px;height:7px;overflow:hidden"><div style="width:'+Math.max(1,Math.round(e/mx*100))+'%;height:100%;background:#f87171"></div></div>'
            + '</div>'
            + '<span style="text-align:right;font-weight:700;color:'+(n>=0?'#34d399':'#fb7185')+'">'+won(n)+'</span>'
            + '</div>';
        }).join('') + '<div style="margin-top:5px;font-size:10px;color:#64748b"><span style="color:#60a5fa">■</span> 매출 <span style="color:#f87171">■</span> 지출 · 우측=순익</div>';
      };
      // Chart.js 미로드 → 폴백 표시 + CDN 로드 시도(성공하면 다시 그림)
      if (typeof Chart === 'undefined') {
        if (chartWrap) chartWrap.style.display = 'none';
        if (fbBox) fbBox.style.display = 'flex';
        renderFallback();
        if (!window._c24finLoadingChart) {
          window._c24finLoadingChart = true;
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
          s.onload = function(){ window._c24finLoadingChart = false; window.c24FinSummary(window._c24finRange); };
          s.onerror = function(){ window._c24finLoadingChart = false; /* 폴백 유지 */ };
          document.head.appendChild(s);
        }
        return;
      }
      // Chart.js 사용 가능 → 예쁜 콤보차트, 폴백 숨김
      if (chartWrap) chartWrap.style.display = 'block';
      if (fbBox) { fbBox.style.display = 'none'; fbBox.innerHTML = ''; }
      const ctx = cv.getContext('2d');
      const gInc = ctx.createLinearGradient(0,0,0,300); gInc.addColorStop(0,'rgba(96,165,250,0.95)'); gInc.addColorStop(1,'rgba(96,165,250,0.55)');
      const gExp = ctx.createLinearGradient(0,0,0,300); gExp.addColorStop(0,'rgba(248,113,113,0.9)'); gExp.addColorStop(1,'rgba(248,113,113,0.5)');
      if (window._c24finChart){ try{ window._c24finChart.destroy(); }catch(e){} }
      window._c24finChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [
          { type:'bar', label:'매출', data:inc, backgroundColor:gInc, borderRadius:5, borderSkipped:false, maxBarThickness:22, order:3 },
          { type:'bar', label:'지출', data:exp, backgroundColor:gExp, borderRadius:5, borderSkipped:false, maxBarThickness:22, order:2 },
          { type:'line', label:'순이익', data:net, borderColor:'#34d399', backgroundColor:'#34d399', borderWidth:2.5, pointRadius:2.5, pointHoverRadius:5, pointBackgroundColor:'#34d399', tension:0.35, fill:false, order:1 }
        ]},
        options: {
          responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false },
          plugins:{
            legend:{ labels:{ color:'#cbd5e1', usePointStyle:true, pointStyle:'rectRounded', padding:14, font:{size:11.5} } },
            tooltip:{ backgroundColor:'#0b1220', borderColor:'#334155', borderWidth:1, padding:10, titleColor:'#f1f5f9', bodyColor:'#cbd5e1',
              callbacks:{ label:function(c){ return '  '+c.dataset.label+': '+wonFull(c.raw); } } }
          },
          scales:{
            x:{ grid:{ display:false }, ticks:{ color:'#94a3b8', font:{size:10}, maxRotation:0, autoSkip:true, maxTicksLimit:12 } },
            y:{ grid:{ color:'rgba(148,163,184,0.12)' }, ticks:{ color:'#94a3b8', font:{size:10}, callback:function(v){ return won(v); } } }
          }
        }
      });
    } catch(e){ if(kpiBox) kpiBox.innerHTML='<div style="color:#f87171;grid-column:1/-1;font-size:12px">집계 실패: '+String(e&&e.message||e)+'</div>'; }
  };

  /* ═══════════════════════════════════════════════════════════════════════
     🧾 지출결의 탭 전용 — 분류(추정) · 상태 · 검색 · 정렬  (2026-08-24 사장님 요청)

     [왜] 이 탭은 표 하나뿐이라 «훑어보기» 밖에 안 됐다. 그런데 원본에 **금액이 없어서**
     («prop_keys` = content·doc_id·name·pay_date·reg_date·state 여섯 개, 2026-08-24 실측)
     합계·추이 같은 진짜 집계를 만들 수가 없다. 그래서 금액 없이도 되는 것부터 한다 —
     «무엇이 · 몇 건 · 언제 · 어떤 상태로» 를 세어 주고, 찾고, 줄 세운다.
     금액 요청서: docs/카페24_지출결의_속성추가_적재요청_2026-08-24.md

     ⚠️ 분류는 **제목 글자로 하는 추정**이다. 원본에 분류 칸이 없다.
        그래서 화면에도 「분류(추정)」 이라고 적는다 — 원본에 있는 값처럼 보이면 안 된다.
     ⚠️ `state` 는 **뜻을 우리가 모른다**(카페24에 문의 중). 그래서 «승인»·«반려» 같은 말로
        옮기지 않는다. 원본 코드를 그대로 적고, **다수와 다른 값만** 눈에 띄게 한다.
        ⛔ 코드값에 이름을 붙이지 말 것 — 답을 받기 전까지는 그게 지어내는 것이다.
     ⛔ 칩·검색칸을 `<button>`·`<select>` 로 만들지 말 것 — `admin-inline-c.css` 의 전역 규칙이
        인라인 style 을 `!important` 로 이겨 파란 알약이 된다(CLAUDE.md 2장 두 항목).
        `<span>` 과 `<input>` 을 쓰고, 모양은 파일 맨 끝 꼬리 블록(#sub-c24-finance …)에서 준다.
     ═══════════════════════════════════════════════════════════════════════ */
  var C24X_KINDS = [
    /* 순서가 규칙이다 — 위에서부터 먼저 맞는 것으로 정한다.
       실측 50건의 제목을 보고 지은 것이다(격주 급여가 대다수, 나머지가 세무·시설). */
    { key:'salary', ko:'급여',      en:'Payroll',  re:/\b(salary|payroll|cut|13th\s*month)\b/i },
    { key:'tax',    ko:'세무·행정', en:'Tax/Admin',re:/(tax|itr|permit|financial\s+statement|percentage|audit|accounting|billing)/i },
    { key:'fac',    ko:'시설·수리', en:'Facility', re:/(floor|roof|water\s*tank|air.?condition|electric|wiring|power\s*station|building|deposit|repair|replacement|tank)/i },
    { key:'loan',   ko:'대출·대여', en:'Loan',     re:/\bloan\b/i },
  ];
  /** 제목으로 분류를 «추정» 한다. 못 맞히면 «기타» — 억지로 밀어 넣지 않는다. */
  window.c24ExpKindOf = function(name){
    var t = String(name == null ? '' : name);
    for (var i = 0; i < C24X_KINDS.length; i++) if (C24X_KINDS[i].re.test(t)) return C24X_KINDS[i];
    return { key:'etc', ko:'기타', en:'Other' };
  };

  /** 지출결의 표를 그린다(필터·정렬 포함). c24FinLoad 가 expenses 일 때만 부른다. */
  window.__c24ExpSetup = function(rows, cols, esc, filteredOut){
    var en = (window.adminLang === 'en');
    var head = document.getElementById('c24fin-head');
    var body = document.getElementById('c24fin-body');
    var cnt  = document.getElementById('c24fin-count');
    var table = document.getElementById('c24fin-table');
    if (!head || !body || !table) return;

    // 분류·상태를 미리 붙여 둔다(그릴 때마다 정규식을 다시 돌리지 않게)
    var list = rows.map(function(r){ var k = window.c24ExpKindOf(r.name); return Object.assign({}, r, { __kind: en ? k.en : k.ko, __kkey: k.key }); });

    /* 🔢 «다수와 다른 상태» — 코드의 뜻을 모르니 이름을 붙이는 대신 «흔한 값과 다르다» 로만 말한다.
       (실측 50건은 49건이 1, 1건이 0. 그 1건이 눈에 띄어야 사람이 확인하러 간다) */
    var freq = {}; list.forEach(function(r){ var v = String(r.state == null ? '' : r.state); freq[v] = (freq[v]||0)+1; });
    var major = null, best = -1;
    Object.keys(freq).forEach(function(v){ if (freq[v] > best) { best = freq[v]; major = v; } });
    list.forEach(function(r){ r.__odd = (String(r.state == null ? '' : r.state) !== major); });

    /* 🔢 상태 값 목록 — 많은 순으로. 어느 값이 몇 건인지 «세어서» 보여 준다.
       (2026-08-24 실측: 580건에 0·1·2 가 섞여 있었다. 예전 «1 아님» 한 칩으로는 0 과 2 가 뭉쳐 보였다) */
    var stVals = Object.keys(freq).sort(function(a, b){ return freq[b] - freq[a]; });
    var state = { kind: 'all', st: null, q: '', sort: 'reg_date', dir: -1 };

    var pick = function(){
      var q = state.q.trim().toLowerCase();
      var out = list.filter(function(r){
        if (state.kind !== 'all' && r.__kkey !== state.kind) return false;
        if (state.st !== null && String(r.state == null ? '' : r.state) !== state.st) return false;
        if (q && (String(r.name||'') + ' ' + String(r.content||'')).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      out.sort(function(a, b){
        var x = String(a[state.sort] == null ? '' : a[state.sort]);
        var y = String(b[state.sort] == null ? '' : b[state.sort]);
        return x < y ? -state.dir : x > y ? state.dir : 0;
      });
      return out;
    };

    // ── 도구 줄 ── (없으면 표 «위» 에 만든다. admin.html 을 건드리지 않으려고 JS 로 세운다)
    var wrap = table.parentElement;
    var tools = document.getElementById('c24fin-tools');
    if (!tools) { tools = document.createElement('div'); tools.id = 'c24fin-tools'; wrap.parentElement.insertBefore(tools, wrap); }
    tools.style.display = '';   // 다른 탭을 보고 오면 숨겨져 있다(c24FinLoad 가 감춘다)

    var drawTools = function(){
      var cur = pick();
      var per = {}; list.forEach(function(r){ per[r.__kkey] = (per[r.__kkey]||0) + 1; });
      var chip = function(k, label, n, on){
        return '<span class="c24x-chip' + (on ? ' c24x-on' : '') + '" data-k="' + k + '" role="button" tabindex="0">'
             + esc(label) + ' <b>' + n + '</b></span>';
      };
      var chips = [chip('all', en ? 'All' : '전체', list.length, state.kind === 'all')];
      C24X_KINDS.forEach(function(k){ if (per[k.key]) chips.push(chip(k.key, en ? k.en : k.ko, per[k.key], state.kind === k.key)); });
      if (per.etc) chips.push(chip('etc', en ? 'Other' : '기타', per.etc, state.kind === 'etc'));

      tools.innerHTML =
        '<div class="c24x-row">' + chips.join('') +
          (stVals.length > 1 ? stVals.map(function(v){
            /* 코드의 «뜻» 은 모른다 — 이름을 붙이지 않고 숫자를 그대로 적는다.
               다수와 다른 값만 노랗게 해 «확인해 볼 것» 임을 알린다. */
            return '<span class="c24x-chip' + (v === major ? '' : ' c24x-odd') + (state.st === v ? ' c24x-on' : '')
                 + '" data-st="' + esc(v) + '" role="button" tabindex="0">'
                 + (en ? 'State ' : '상태 ') + esc(v === '' ? '—' : v) + ' <b>' + freq[v] + '</b></span>';
          }).join('') : '') +
          '<input id="c24x-q" class="c24x-q" type="text" autocomplete="off" placeholder="' +
            (en ? 'Search title / content' : '제목·내용 검색') + '" value="' + esc(state.q) + '">' +
          '<span class="c24x-n">' + (en ? cur.length + ' / ' + list.length + ' shown' : list.length + '건 중 ' + cur.length + '건') + '</span>' +
        '</div>' +
        '<div class="c24x-note">' + (en
          ? 'Category is a guess from the title (the source has no category field). The meaning of the state code is being confirmed with Cafe24. Amounts are not in the source yet.'
          : '분류는 <b>제목으로 추정</b>한 값입니다(원본에 분류 칸이 없습니다). 상태 코드의 뜻은 카페24에 확인 중이라 숫자를 그대로 적습니다 — 맨 오른쪽 <b>문서번호</b>로 카페24에서 그 문서를 찾아보실 수 있습니다. '
            + '<b>금액은 원본에 아직 없습니다</b> — 그래서 합계·추이를 만들 수 없습니다.')
          + (filteredOut ? (en ? ' Excluded ' + filteredOut + ' unrelated request(s).' : ' 다른 곳 지출품의 ' + filteredOut + '건은 제외했습니다.') : '')
        + '</div>';
    };

    var drawHead = function(){
      head.innerHTML = '<tr>' + cols.map(function(c){
        var on = (state.sort === c[0]);
        return '<th class="c24x-th' + (on ? ' c24x-sorted' : '') + '" data-s="' + c[0] + '" role="button" tabindex="0" '
             + 'style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">'
             + esc(c[1]) + (on ? (state.dir < 0 ? ' ▼' : ' ▲') : '') + '</th>';
      }).join('') + '</tr>';
    };

    var drawBody = function(){
      var cur = pick();
      if (!cur.length) {
        body.innerHTML = '<tr><td colspan="' + cols.length + '" style="padding:20px;text-align:center;color:#9ca3af">'
          + (en ? 'No rows match.' : '조건에 맞는 건이 없습니다.') + '</td></tr>';
        return;
      }
      body.innerHTML = cur.map(function(row){
        return '<tr style="border-bottom:1px solid #f1f5f9">' + cols.map(function(c){
          var v = row[c[0]];
          var wrapS = (c[0] === 'content' || c[0] === 'name') ? 'max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' : '';
          var inner;
          if (c[0] === '__kind') inner = '<span class="c24x-tag c24x-tag-' + row.__kkey + '">' + esc(v) + '</span>';
          else if (c[0] === 'state') inner = '<span class="c24x-st' + (row.__odd ? ' c24x-st-odd' : '') + '">' + esc(v == null || v === '' ? '—' : v) + '</span>';
          else inner = esc(v == null || v === '' ? '—' : v);
          return '<td style="padding:7px 10px;' + wrapS + '" title="' + esc(v) + '">' + inner + '</td>';
        }).join('') + '</tr>';
      }).join('');
    };

    var redraw = function(){ drawTools(); drawHead(); drawBody(); };

    /* 조작은 «위임» 으로 받는다 — 다시 그릴 때마다 리스너를 새로 달면 겹쳐 쌓인다.
       ⛔ 같은 요소에 두 번 달리지 않게 표식을 둔다(탭을 오갈 때마다 이 함수가 다시 불린다).
       🔁 단, 리스너가 «첫 호출의 클로저» 를 계속 보면 안 된다 — 탭 재진입·🌐 전환으로
          c24FinLoad 가 다시 돌면 rows/언어가 바뀌는데, 옛 클로저의 redraw() 가 첫 로드의
          자료로 화면을 «되돌린다»(2026-08-27 발견). 상태·그리기 함수는 요소에 실어
          매 호출 바꿔 끼우고, 리스너는 그 칸을 통해서만 부른다. */
    tools.__c24 = { state: state, redraw: redraw, drawBody: drawBody, pick: pick, list: list, en: en };
    head.__c24 = { state: state, drawHead: drawHead, drawBody: drawBody };
    if (!tools.__c24wired) {
      tools.__c24wired = true;
      var hit = function(e){
        var c = tools.__c24; if (!c) return;
        var el = e.target.closest ? e.target.closest('.c24x-chip') : null;
        if (!el) return;
        if (el.hasAttribute('data-st')) {
          var v = el.getAttribute('data-st');
          c.state.st = (c.state.st === v) ? null : v;      // 한 번 더 누르면 해제
        } else { c.state.kind = el.getAttribute('data-k'); }
        c.redraw();
      };
      tools.addEventListener('click', hit);
      tools.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit(e); } });
      tools.addEventListener('input', function(e){
        var c = tools.__c24; if (!c) return;
        if (!e.target || e.target.id !== 'c24x-q') return;
        c.state.q = e.target.value;
        c.drawBody();
        // 입력칸을 다시 그리면 포커스가 날아가므로 «건수» 만 갱신한다
        var n = tools.querySelector('.c24x-n');
        if (n) n.textContent = c.en ? (c.pick().length + ' / ' + c.list.length + ' shown') : (c.list.length + '건 중 ' + c.pick().length + '건');
      });
    }
    if (!head.__c24wired) {
      head.__c24wired = true;
      var sortHit = function(e){
        var c = head.__c24; if (!c) return;
        var th = e.target.closest ? e.target.closest('.c24x-th') : null;
        if (!th) return;
        var k = th.getAttribute('data-s');
        if (c.state.sort === k) c.state.dir = -c.state.dir; else { c.state.sort = k; c.state.dir = (k === 'reg_date' || k === 'pay_date') ? -1 : 1; }
        c.drawHead(); c.drawBody();
      };
      head.addEventListener('click', sortHit);
      head.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortHit(e); } });
    }

    // 「총 N건」 줄은 도구 줄이 대신 말해 준다 — 같은 말을 두 곳에 쓰지 않는다.
    if (cnt) cnt.textContent = '';
    redraw();
  };

  // 🧾 카페24 회계 실데이터 (5종 탭) — Neo4j finance-cafe24
  const c24finEsc = function(s){ return String(s==null?'':s).replace(/[<>&"]/g,function(c){return({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]);}); };
  const c24finWon = function(n){ try{ return '₩'+Number(n||0).toLocaleString('ko-KR'); }catch(e){ return n; } };
  // 컬럼 정의 (kind별) — [키, 머리글(ko), 서식함수?]
  const C24FIN_COLS = {
    /* 🧾 「구분」 은 **`type`(1=수입 / 2=지출)** 이다 — 뜻이 정의된 유일한 칸이고,
       위 합계(매출·지출)도 같은 값으로 계산한다. 한 화면에서 줄과 합계가 어긋날 수 없다.
       ⛔ 예전에는 카페24 원본 `acc_type` 을 그대로 찍었는데, 그 값의 뜻이 **어디에도 정의돼
          있지 않아** 화면에 「0」 이 떴다(2026-08-24 사장님 「구분은 무슨 뜻이야?」).
          적재 요청서에도 「구분 표시용」이라고만 적혀 있다 — 카페24에 뜻을 물어보기 전에는
          이름을 붙일 수 없다(지출결의 `state` 코드와 같은 사정).
       ✅ `acc_type` 은 지우지 않고 그 칸 **툴팁**에 원본으로 남긴다(C24FIN_TITLE). */
    ledger:   [['date','일자'],['type','구분'],['subject','계정과목'],['money','금액',c24finWon],['store','거래처'],['memo','적요'],['month','귀속월']],
    payroll:  [['user_id','대상'],['month','월'],['base','기본급',c24finWon],['total','지급계',c24finWon],['deduction','공제계',c24finWon],['actual','실지급',c24finWon],['work_day','근무일']],
    /* 🧾 지출결의 — 2026-08-24 실측으로 칸을 다시 짰다(PR #465).
       카페24 원본(`ExpenseReport`)의 속성은 content·doc_id·name·pay_date·reg_date·state **여섯 개뿐**이다.
       ⛔ 그래서 예전 「거래처(organ)」·「결제(method)」 칸은 **값이 올 수 없어 늘 «—»** 였다 —
          빈 칸을 세워 두면 «아직 안 들어온 값» 처럼 보여 오해를 만든다. 뺐다.
       ✅ 대신 원본에 있는데 안 그리던 `state` 를 세우고, 제목에서 **추정** 분류를 붙인다.
       ⚠️ 금액(money)이 원본에 없어 합계·추이는 여전히 만들 수 없다 —
          적재 요청서: docs/카페24_지출결의_속성추가_적재요청_2026-08-24.md
       ⚠️ 이 탭만 전용 화면(`__c24ExpSetup` — 칩·검색·자체 정렬)이 그린다. 아래 머리글 정렬은
          나머지 네 탭 몫이다. 한 탭에 정렬을 두 벌 두지 않으려고 그렇게 갈랐다(2026-08-24 병합). */
    expenses: [['reg_date','일자'],['__kind','분류(추정)'],['name','제목'],['content','내용'],['pay_date','지급일'],['state','상태'],['doc_id','문서번호']],
    tax:      [['date','작성일'],['supplier','공급자'],['receiver','공급받는자'],['supply','공급가',c24finWon],['tax','세액',c24finWon],['total','합계',c24finWon],['tax_type','과세']],
    deposits: [['date','일자'],['center_id','센터ID'],['amount','금액',c24finWon],['method','결제']],
  };
  const C24FIN_COLS_EN = {
    date:'Date', type:'Type', acc_type:'Type', subject:'Account', money:'Amount', store:'Vendor', memo:'Memo', month:'Month',
    user_id:'Payee', base:'Base pay', total:'Total', deduction:'Deduction', actual:'Net pay', work_day:'Work days',
    reg_date:'Date', name:'Title', organ:'Vendor', method:'Payment', content:'Detail', pay_date:'Paid on',
    __kind:'Category', state:'State',
    supplier:'Supplier', receiver:'Receiver', supply:'Supply', tax:'Tax', tax_type:'Taxation',
    center_id:'Center ID', amount:'Amount',
  };
  // ↕️ 숫자로 정렬할 칸 — 서식함수(₩)가 붙은 칸은 자동으로 숫자다. 여기엔 «서식은 없는데 숫자인» 칸만 적는다.
  const C24FIN_NUMCOL = { work_day:1, type:1 };
  /* 🈯 «글자로 바꿔 보여 주는» 칸 — 서식함수(c[2])와 달리 **오른쪽 정렬을 하지 않는다**
     (c[2] 는 금액용이라 우측정렬·고정폭 글꼴이 함께 붙는다). 정렬은 원래 값(숫자)으로 한다. */
  const C24FIN_TEXTFMT = {
    type: function(v, en){
      const n = Number(v);
      if (n === 1) return en ? 'Income'  : '수입';
      if (n === 2) return en ? 'Expense' : '지출';
      // ⛔ 모르는 값은 «지어내지» 않는다 — 원본을 그대로 보여 주고 툴팁이 사정을 말한다.
      return (v == null || v === '') ? '—' : String(v);
    },
  };
  /* 💬 툴팁(제목) — 화면에 안 그리는 원본값을 여기 남긴다. 뜻을 모르는 `acc_type` 이 그 예다. */
  const C24FIN_TITLE = {
    type: function(row, en){
      const raw = (row.acc_type == null || row.acc_type === '') ? '—' : String(row.acc_type);
      return (en ? 'Cafe24 raw: type=' + String(row.type) + ' · acc_type=' + raw + ' (meaning unconfirmed)'
                 : '카페24 원본: type=' + String(row.type) + ' · acc_type=' + raw + ' (뜻 미확인)');
    },
  };
  // 🈳 빈 화면 안내용 — 탭별로 어느 Neo4j 노드가 비어 있는지 이름을 말해 준다(2026-08-18, AccBook 0건 실측)
  const C24FIN_NODE_OF = { ledger:'회계장부 AccBook', payroll:'급여 Payroll', expenses:'지출결의 ExpenseReport', tax:'세금계산서 TaxInvoice', deposits:'예치금 SavedMoney' };
  /* ↕️ 정렬 상태 (2026-08-24 사장님 지시 — 다섯 탭 표에 올림순·내림순).
     받아 온 행을 여기 담아 두고 «다시 그리기» 만 한다 — 정렬할 때 서버를 다시 부르지 않는다.
     dir: 1=올림순 ▲ / -1=내림순 ▼ / 0=원래 순서(서버가 준 날짜 내림차순).
     ⚠️ 서버가 limit=1000 으로 잘라 준 목록을 정렬하는 것이다. 「제일 큰 금액」이 아니라
        「가져온 1000건 중 제일 큰 금액」이다 — 건수 표시에 «(표시된 건 기준)» 이 붙는 이유. */
  window._c24finSort = { kind:'', rows:[], cols:[], key:'', dir:0, en:false };
  window.c24FinLoad = async function(kind){
    const en = (window.adminLang==='en');
    const body = document.getElementById('c24fin-body');
    const cnt = document.getElementById('c24fin-count');
    if (!body) return;
    document.querySelectorAll('.c24fin-tab').forEach(function(b){ b.style.background = (b.getAttribute('data-k')===kind)?'#f59e0b':'#fff'; b.style.color=(b.getAttribute('data-k')===kind)?'#fff':'#334155'; });
    const esc = c24finEsc;
    const cols = C24FIN_COLS[kind] || C24FIN_COLS.ledger;
    // 탭을 바꾸면 정렬은 초기화한다(칸 이름이 탭마다 다르다).
    window._c24finSort = { kind:kind, rows:[], cols:cols, key:'', dir:0, en:en };
    c24FinDrawHead();
    body.innerHTML = '<tr><td colspan="'+cols.length+'" style="padding:20px;text-align:center;color:#9ca3af">'+(en?'Loading…':'불러오는 중…')+'</td></tr>';
    try {
      const r = await fetch('/api/admin/finance-cafe24/'+kind+'?limit=1000', { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||d.code||'API error');
      const rows = d.rows||[];
      // 🧾 회계장부 탭 — 매출 판정은 전부 서버가 한다(규칙 정본 = accounting-reports.ts).
      //    · excluded_from_revenue : 자금이동 행인가 (합계에서 통째로 뺀다)
      //    · counts_as_revenue     : 매출로 셀 행인가 (위 요약 KPI·추이와 **같은 규칙**)
      //    ⚠️ 여기서 type===1 만 보고 더하면 요약 KPI 와 숫자가 어긋난다 —
      //       같은 화면에 「매출 ₩A」와 「총매출 ₩B」가 따로 찍히는 사고가 난다.
      var isExcl = function(row){ return !!row.excluded_from_revenue; };
      var isRev  = function(row){ return !!row.counts_as_revenue; };
      const won = c24finWon;
      if (cnt) {
        var base = (en? rows.length+' rows' : '총 '+rows.length+'건');
        /* ⚠️ 서버가 limit=1000 에서 잘랐을 수 있다 — 그러면 정렬해서 맨 위에 온 것은
           「제일 큰 금액」이 아니라 **「가져온 1000건 중 제일 큰 금액」** 이다.
           정렬을 단 뒤로는 이 사실이 다섯 탭 모두에서 오해를 부르므로 탭을 가리지 않고 적는다
           (예전에는 회계장부 탭에만 붙어 있었다). */
        var cutTail = (rows.length >= 1000
          ? ' <span style="color:#9ca3af">' + (en?'(shown rows only)':'(표시된 건 기준)') + '</span>' : '');
        if (kind === 'ledger' && rows.length) {
          var sInc = 0, sExp = 0, sExc = 0, nExc = 0;
          rows.forEach(function(row){
            var m = Number(row.money)||0;
            if (isExcl(row)) { sExc += m; nExc++; return; }
            if (Number(row.type) === 1) { if (isRev(row)) sInc += m; }
            else if (Number(row.type) === 2) sExp += m;
          });
          cnt.innerHTML = esc(base)
            + ' · <b style="color:#1d4ed8">' + (en?'Revenue ':'매출 ') + esc(won(sInc)) + '</b>'
            + ' · <b style="color:#b91c1c">' + (en?'Expense ':'지출 ') + esc(won(sExp)) + '</b>'
            /* ⛔ «「케이씨피M」 N건 ₩… 제외» 표기 제거(2026-08-18 지시). 합계에서 빼는 계산은
               그대로다(위에서 sExc 로 걸러 낸다) — 화면에 이름·금액을 쓰지 않을 뿐이다. */
            + cutTail;
        } else if (kind === 'expenses' && (d.filtered_out || 0) > 0) {
          /* 🧾 이 탭은 카페24 원본에서 «우리 것이 아닌» 지출품의서를 뺀 목록이다
             (한글 결재 · 결재라인 Joy·박상인 — 2026-08-24 사장님 지시. 정본 src/c24-expense-filter.ts).
             몇 건을 뺐는지 적어 두는 이유는 «원본과 건수가 다른 것»이 고장으로 오인되지 않게 하기 위함이다. */
          cnt.innerHTML = esc(base) + ' <span style="color:#9ca3af">· '
            + (en ? 'excluded ' + d.filtered_out + ' unrelated request(s)' : '다른 곳 지출품의 ' + d.filtered_out + '건 제외')
            + '</span>' + cutTail;
        } else { cnt.innerHTML = esc(base) + cutTail; }
      }
      /* 🧾 지출결의만 전용 그리기(분류 추정·상태·검색·정렬)로 넘긴다 — PR #465.
         ⛔ 다른 탭(장부·급여·세금·예치금)은 손대지 않는다 — 그쪽은 금액이 있어 지금 화면이 맞다.
         ⚠️ 그래서 **이 탭에는 아래 머리글 정렬(c24FinDrawBody)이 안 걸린다.** 전용 화면이 자기
            정렬(`c24x-th`·▲▼)을 이미 갖고 있어서, 한 탭에 정렬을 두 벌 두지 않으려고 이렇게 갈랐다
            (2026-08-24 두 작업이 같은 화면에서 만나 병합할 때 내린 판단). */
      var _tools = document.getElementById('c24fin-tools');
      if (kind === 'expenses') { window.__c24ExpSetup(rows, cols, esc, d.filtered_out || 0); return; }
      if (_tools) _tools.style.display = 'none';
      // ↕️ 정렬용으로 원본을 담아 둔다 — 이후 «머리글 누르기» 는 서버를 다시 부르지 않는다.
      window._c24finSort.rows = rows;
      c24FinDrawBody();
    } catch(e){
      body.innerHTML = '<tr><td colspan="'+cols.length+'" style="padding:20px;text-align:center;color:#dc2626">'+(en?'Load failed: ':'불러오기 실패: ')+esc(String(e&&e.message||e))+'</td></tr>';
    }
  };

  /* ↕️ 표 머리글 — 누르면 올림순 ▲ → 내림순 ▼ → 원래 순서 로 돈다.
     ⚠️ 머리글 글자와 화살표를 **다른 `<span>`** 에 담는다. 한 덩어리로 쓰면 i18n 사전(전체 문자열 일치)이
        「일자」와 「일자 ▲」를 다른 말로 보게 된다 — CLAUDE.md 2장 「i18n 사전」 함정.
     ⚠️ «정렬 중» 강조는 **클래스(.c24fin-on)로만** 준다. 인라인 color/border 는 이 카드에서
        화면에 안 나온다(admin-inline-c.css 8770·8793 의 !important 가 이긴다 — 실측).
        규칙은 그 파일 맨 끝 «#card-accounting-mgmt» 블록에 있다. */
  function c24FinDrawHead(){
    const head = document.getElementById('c24fin-head');
    const S = window._c24finSort;
    if (!head || !S || !S.cols) return;
    const esc = c24finEsc;
    head.innerHTML = '<tr>'+S.cols.map(function(c){
      const on = (S.key === c[0] && S.dir !== 0);
      const arrow = on ? (S.dir > 0 ? '▲' : '▼') : '⇅';
      const label = S.en ? (C24FIN_COLS_EN[c[0]] || c[1]) : c[1];
      const tip = S.en ? 'Sort — asc / desc / original order' : '정렬 — 올림순 / 내림순 / 원래 순서';
      return '<th data-c="'+esc(c[0])+'" class="'+(on?'c24fin-on':'')+'"'
        + ' onclick="c24FinSort(\''+esc(c[0])+'\')" title="'+esc(tip)+'"'
        + ' style="padding:9px 10px;text-align:left;cursor:pointer;'
        + 'user-select:none;-webkit-user-select:none;white-space:nowrap">'
        + '<span>'+esc(label)+'</span>'
        + '<span aria-hidden="true" style="margin-left:4px;font-size:10px;opacity:'+(on?'1':'0.35')+'">'+arrow+'</span>'
        + '</th>';
    }).join('')+'</tr>';
  }

  /* ↕️ 본문 — 정렬 상태(S.key·S.dir)를 적용해 다시 그린다.
     ⛔ 원본 배열(S.rows)을 제자리에서 뒤집지 말 것 — «원래 순서» 로 못 돌아온다. slice() 로 사본을 만든다. */
  function c24FinDrawBody(){
    const body = document.getElementById('c24fin-body');
    const S = window._c24finSort;
    if (!body || !S || !S.cols) return;
    const esc = c24finEsc, en = S.en, cols = S.cols, kind = S.kind;
    let rows = S.rows || [];
    if (S.key && S.dir !== 0){
      const col = cols.filter(function(c){ return c[0] === S.key; })[0];
      if (col){
        const isNum = !!col[2] || !!C24FIN_NUMCOL[S.key];
        const dir = S.dir;
        rows = rows.slice().sort(function(a, b){
          const va = a[S.key], vb = b[S.key];
          const ea = (va == null || va === ''), eb = (vb == null || vb === '');
          // 빈 값은 방향과 상관없이 늘 아래로 — 내림순으로 뒤집었더니 빈 칸이 맨 위를 덮는 일을 막는다.
          if (ea && eb) return 0;
          if (ea) return 1;
          if (eb) return -1;
          let r;
          if (isNum) { r = (Number(va) || 0) - (Number(vb) || 0); }
          else { try { r = String(va).localeCompare(String(vb), 'ko', { numeric:true, sensitivity:'base' }); }
                 catch(e){ r = String(va) < String(vb) ? -1 : (String(va) > String(vb) ? 1 : 0); } }
          return dir < 0 ? -r : r;
        });
      }
    }
    body.innerHTML = rows.length ? rows.map(function(row){
      return '<tr style="border-bottom:1px solid #f1f5f9">'+cols.map(function(c){
        var v = row[c[0]];
        var tf = C24FIN_TEXTFMT[c[0]];
        var disp = c[2] ? c[2](v) : (tf ? esc(tf(v, en)) : esc(v==null||v===''?'—':v));
        var tt = C24FIN_TITLE[c[0]] ? C24FIN_TITLE[c[0]](row, en) : v;
        var align = c[2] ? 'text-align:right;font-family:MangoiHanSC,Consolas,monospace' : '';
        var wrap = (c[0]==='content'||c[0]==='memo'||c[0]==='subject') ? 'max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' : '';
        /* ⛔ «매출 제외» 배지·취소선·「케이씨피M」 툴팁 제거(2026-08-18 지시).
           장부 행 자체는 카페24 원본이라 그대로 두고, 표시만 다른 행과 같게 한다.
           합계에서 빼는 계산은 c24FinLoad 의 isExcl() 로 그대로 돈다. */
        return '<td style="padding:7px 10px;'+align+';'+wrap+'" title="'+esc(tt)+'">'+disp+'</td>';
      }).join('')+'</tr>';
    }).join('') : '<tr><td colspan="'+cols.length+'" style="padding:20px;text-align:center;color:#9ca3af;line-height:1.6">'
      +(en?'No data — the Cafe24 server has not loaded this data ('+(C24FIN_NODE_OF[kind]||kind)+') into Neo4j yet. The connection itself is fine.'
           :'데이터 없음 — 카페24 서버에서 이 데이터('+(C24FIN_NODE_OF[kind]||kind)+')를 아직 Neo4j에 적재하지 않았습니다. 연결 자체는 정상입니다.')
      +'</td></tr>';
    c24FinDrawNote();
  }

  /* ↕️ 지금 무엇으로 정렬돼 있는지 한 줄로 알려 준다 — 화살표만으로는 «내림순» 인지 말이 안 나오고,
        이 화면은 색을 덮는 CSS 가 여러 겹이라 **뜻을 지고 가는 것은 이 글자**다.
     ⚠️ `data-ko`/`data-en` 도 함께 갱신한다. 그것 없이 textContent 로만 쓰면 🌐 를 눌러도 안 따라온다
        (CLAUDE.md 2장 「JS 로 그린 라벨」). 여기는 아이콘이 아니라 «글자» 요소라 그 두 속성이 맞는 도구다. */
  function c24FinDrawNote(){
    const note = document.getElementById('c24fin-sortnote');
    const S = window._c24finSort;
    if (!note || !S) return;
    const put = function(ko, en, on){
      note.setAttribute('data-ko', ko);
      note.setAttribute('data-en', en);
      note.textContent = S.en ? en : ko;
      note.classList.toggle('c24fin-note-on', !!on);   // 색은 클래스로 — 인라인은 이 카드에서 진다
    };
    if (!S.key || S.dir === 0){ put('머리글을 누르면 정렬', 'Click a header to sort', false); return; }
    const col = (S.cols||[]).filter(function(c){ return c[0] === S.key; })[0];
    const koLabel = col ? col[1] : S.key;
    const enLabel = col ? (C24FIN_COLS_EN[col[0]] || col[1]) : S.key;
    put('정렬: ' + koLabel + ' · ' + (S.dir > 0 ? '올림순 ▲' : '내림순 ▼'),
        'Sorted by ' + enLabel + ' · ' + (S.dir > 0 ? 'ascending ▲' : 'descending ▼'), true);
  }

  /* 🌐 언어를 바꾸면 머리글·안내 줄을 다시 그린다.
     `toggleAdminLang()` 은 **새로고침 없이 DOM 만** 갈아서, JS 가 textContent 로 그린 글자는
     안 따라온다(CLAUDE.md 2장 「JS 로 그린 라벨」). 표 내용(빈 화면 안내문)도 언어를 타므로 함께 그린다.
     ⚠️ 서버를 다시 부르지 않는다 — 담아 둔 행을 그대로 다시 그릴 뿐이다. */
  document.addEventListener('mangoi:lang-changed', function(ev){
    const S = window._c24finSort;
    if (!S || !S.cols || !S.cols.length) return;
    const lang = (ev && ev.detail && ev.detail.lang) || window.adminLang;
    S.en = (lang === 'en');
    /* ⛔ 지출결의는 전용 화면(`__c24ExpSetup`)이 머리글·본문을 자기 방식(`data-s`·칩·검색)으로 그린다.
       여기서 다시 그리면 **그 화면을 덮어써 자체 정렬이 죽는다.** 그 탭은 통째로 다시 불러
       전용 화면이 새 언어로 그리게 한다(서버는 120초 KV 캐시라 홉이 늘지 않는다). */
    if (S.kind === 'expenses') { try { window.c24FinLoad('expenses'); } catch(e){} return; }
    c24FinDrawHead();
    c24FinDrawBody();
  });

  // ↕️ 머리글 클릭 — 같은 칸이면 올림순 → 내림순 → 원래 순서, 다른 칸이면 그 칸 올림순부터.
  window.c24FinSort = function(key){
    const S = window._c24finSort;
    if (!S || !S.cols || !S.rows || !S.rows.length) return;
    if (S.key === key) { S.dir = (S.dir === 1) ? -1 : (S.dir === -1 ? 0 : 1); if (S.dir === 0) S.key = ''; }
    else { S.key = key; S.dir = 1; }
    c24FinDrawHead();
    c24FinDrawBody();
  };

  window.accLoadFranchise = async function(){
    const month = document.getElementById('acc-fr-month').value || _today().slice(0,7);
    const tbody = document.getElementById('acc-fr-tbody');
    const cards = document.getElementById('ph204-branch-cards');
    const bars  = document.getElementById('ph204-bars');
    const _en = (window.adminLang==='en');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty">'+(_en?'Loading…':'불러오는 중…')+'</td></tr>';
    if (cards) cards.innerHTML = '<div class="empty" style="grid-column:1/-1;padding:16px;text-align:center;color:#94a3b8">'+(_en?'Loading…':'불러오는 중…')+'</div>';
    try {
      // 🕸️ 실제 정산 = 지사별 직접 집계 (students_erp.franchise ⨝ student_payments, 월별)
      const r = await fetch('/api/admin/settlement/branch-summary?period=' + encodeURIComponent(month), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      const rows = (d.rows||[]).filter(x => (x.gross_revenue||0) > 0);
      const T = d.totals || { gross:0, fee:0, net:0 };
      const setTxt = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
      setTxt('ph204-kpi-gross', _fmt(T.gross));
      setTxt('ph204-kpi-hq', _fmt(T.fee));
      setTxt('ph204-kpi-payout', _fmt(T.net));
      setTxt('ph204-kpi-pending', rows.length + (_en?'':' 개'));
      // 실제 적용된 «가중평균» 본사 마진율 — 지사·대리점마다 요율이 다를 수 있어서
      // 고정 문구(예전 「평균 수수료율 15%」)를 쓰면 거짓말이 된다.
      const DEF = d.defaults || { hq_rate:0.6, branch_rate:0.4 };
      const pct = function(x){ return (Math.round((x||0)*1000)/10) + '%'; };
      const effHq = T.gross > 0 ? (T.fee / T.gross) : DEF.hq_rate;
      setTxt('ph204-kpi-hq-rate', (_en ? 'Applied ' : '적용 ') + pct(effHq)
        + (_en ? ' · default ' : ' · 기본 ') + pct(DEF.hq_rate));
      if (cards) {
        cards.innerHTML = rows.length ? rows.map(x => {
          const rate = Math.round((x.commission_rate||0)*1000)/10;
          const brRate = Math.round((x.branch_rate!=null ? x.branch_rate : (1-(x.commission_rate||0)))*1000)/10;
          // 요율이 어디서 왔는지 밝힌다 — 「왜 이 지사만 다르지?」를 화면에서 바로 알 수 있게.
          const srcMap = { 'default': _en?'default':'기본값', 'branch': _en?'branch set':'지사 설정',
                           'agency': _en?'agency set':'대리점 설정', 'mixed': _en?'mixed':'대리점별 상이' };
          const srcTxt = srcMap[x.rate_source] || '';
          const srcTag = srcTxt ? ' <span style="font-size:9.5px;color:#64748b">('+srcTxt+')</span>' : '';
          const typeIcon = x.type==='agency' ? '🤝' : '🏬';
          return '<div style="padding:14px 16px;background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04)">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:800;font-size:14px;color:#0f172a">'+typeIcon+' '+_esc(x.franchise_name)+'</div>'
            + '<span style="padding:3px 8px;background:#fee2e2;color:#991b1b;font-size:10.5px;font-weight:700;border-radius:99px">'+(_en?'⏰ Pending':'⏰ 송금 대기')+'</span></div>'
            + '<div style="font-size:11px;color:#6b7280;margin-bottom:8px">'+(_en?'Payments':'결제 건수')+' '+(x.pay_count||0)+'</div>'
            + '<div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;margin-bottom:4px"><span>'+(_en?'Revenue':'매출')+'</span><b style="color:#1f2937">'+_fmt(x.gross_revenue)+'</b></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;margin-bottom:4px"><span>'+(_en?'HQ margin':'본사 마진')+' ('+rate+'%)'+srcTag+'</span><b style="color:#b45309">- '+_fmt(x.hq_fee)+'</b></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:13.5px;padding-top:6px;border-top:1px dashed #cbd5e1;margin-top:6px"><b style="color:#166534">'+(_en?'→ Payout':'→ 지점에 송금')+' ('+brRate+'%)</b><b style="color:#15803d;font-size:15px">'+_fmt(x.net_settlement)+'</b></div>'
            + '</div>';
        }).join('') : '<div class="empty" style="grid-column:1/-1;padding:20px;text-align:center;color:#94a3b8">'+(_en?'No settlement data for this month':'이번 달 정산 데이터 없음')+'</div>';
      }
      if (bars) {
        const top = rows.slice(0,12);
        const max = top.length ? top[0].gross_revenue : 1;
        bars.innerHTML = top.length ? top.map(x => {
          const pct = Math.max(2, Math.round((x.gross_revenue/max)*100));
          const col = x.type==='agency' ? '#10b981,#059669' : '#3b82f6,#1d4ed8';
          return '<div style="display:grid;grid-template-columns:130px 1fr 110px;gap:10px;align-items:center;font-size:12px"><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_esc(x.franchise_name)+'</span><div style="background:#e2e8f0;border-radius:99px;height:18px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:linear-gradient(90deg,'+col+');border-radius:99px"></div></div><b style="text-align:right;color:#1e3a8a">'+_fmt(x.gross_revenue)+'</b></div>';
        }).join('') : '<div class="empty" style="color:#94a3b8;font-size:12px">'+(_en?'No data':'데이터 없음')+'</div>';
      }
      if (tbody) tbody.innerHTML = rows.map(x => `
        <tr><td><b>${_esc(x.franchise_name)}</b></td>
            <td style="text-align:right">${_fmt(x.gross_revenue)}</td>
            <td style="text-align:right;color:#dc2626">${_fmt(x.hq_fee)}</td>
            <td style="text-align:right"><b>${_fmt(x.net_settlement)}</b></td>
            <td>${_esc(x.due_date||'-')}</td>
            <td>${_badge(x.status||'pending','warn')}</td></tr>`).join('') ||
        ('<tr><td colspan="6" class="empty">'+(_en?'No data':'가맹점 데이터 없음')+'</td></tr>');
    } catch(e) { if(tbody) _showErr(tbody, e, 6); if(cards) cards.innerHTML='<div class="empty" style="grid-column:1/-1;color:#dc2626;padding:16px">'+(_en?'Load failed':'불러오기 실패')+': '+_esc(String(e&&e.message||e))+'</div>'; }
  };

  /* ⚙️ 수수료 비율 설정 (2026-08-18) — 지사·대리점별 수동 설정
     기본값은 「지점 40% / 본사 60%」. 여기서 저장한 곳만 그 값을 쓰고,
     저장하지 않은 곳은 기본값으로 계산된다(서버 settlement_rate_override 가 정본).
     ⚠️ 저장 뒤에는 반드시 accLoadFranchise() 를 다시 불러 정산 카드·표를 갱신한다 —
        안 그러면 「저장했는데 금액이 그대로」로 보인다. */
  window.accLoadRateConfig = async function(){
    const _en = (window.adminLang==='en');
    const tbody = document.getElementById('ph204-rate-tbody');
    if (!tbody) return;
    const month = (document.getElementById('acc-fr-month')||{}).value || _today().slice(0,7);
    const scope = (document.getElementById('ph204-rate-scope')||{}).value || 'branch';
    const q     = (document.getElementById('ph204-rate-q')||{}).value || '';
    tbody.innerHTML = '<tr><td colspan="6" class="empty">'+(_en?'Loading…':'불러오는 중…')+'</td></tr>';
    try {
      const qs = new URLSearchParams({ period: month, scope: scope });
      if (q) qs.set('q', q);
      const r = await fetch('/api/admin/settlement/rate-config?' + qs.toString(), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      const rows = d.rows || [];
      const cnt = document.getElementById('ph204-rate-count');
      if (cnt) cnt.textContent = (_en ? (rows.length+' shown · '+d.counts.overridden+' set')
                                      : ('표시 '+rows.length+'곳 · 수동 설정 '+d.counts.overridden+'곳'))
                                 + (d.truncated ? (_en?' (top 500)':' (상위 500곳만)') : '');
      // 본사(hq)가 아니면 서버가 저장을 막는다 — 버튼도 미리 잠가 오해를 없앤다.
      const ro = !d.editable;
      tbody.innerHTML = rows.length ? rows.map(function(x){
        const key = encodeURIComponent(x.scope_key);
        const brPct = Math.round((x.branch_rate||0)*1000)/10;
        const hqPct = Math.round((x.hq_rate||0)*1000)/10;
        const tag = x.is_override
          ? '<span style="padding:1px 6px;background-color:#dcfce7;color:#166534;font-size:10px;font-weight:700;border-radius:99px">'+(_en?'set':'수동')+'</span>'
          : (x.rate_source==='inherited'
              ? '<span style="padding:1px 6px;background-color:#fef3c7;color:#92400e;font-size:10px;font-weight:700;border-radius:99px">'+(_en?'inherited':'지사 상속')+'</span>'
              : '<span style="padding:1px 6px;background-color:#f1f5f9;color:#64748b;font-size:10px;font-weight:700;border-radius:99px">'+(_en?'default':'기본값')+'</span>');
        const id = x.scope_type+'|'+x.scope_key;
        return '<tr>'
          + '<td>'+(x.scope_type==='agency' ? '🤝 '+(_en?'Agency':'대리점') : '🏬 '+(_en?'Branch':'지사'))+'</td>'
          + '<td><b>'+_esc(x.scope_key)+'</b>'+(x.parent?' <span style="font-size:10px;color:#94a3b8">/ '+_esc(x.parent)+'</span>':'')+' '+tag
            // 같은 이름의 대리점이 여러 지사에 걸쳐 있으면 «다 같이 바뀐다» 고 미리 알린다.
            + (x.parent_count > 1 ? ' <span title="'+(_en?'This name exists under several branches — the rate applies to all of them.':'이 이름의 대리점이 여러 지사에 있습니다. 요율은 그 전부에 적용됩니다.')+'" style="padding:1px 6px;background-color:#fee2e2;color:#991b1b;font-size:10px;font-weight:700;border-radius:99px">'+(_en?'multi-branch':'지사 '+x.parent_count+'곳')+'</span>' : '')
            + '</td>'
          + '<td style="text-align:right">'+_fmt(x.gross_revenue)+'</td>'
          + '<td style="text-align:right"><input type="number" min="0" max="100" step="0.1" value="'+brPct+'" '+(ro?'disabled':'')
            + ' data-rate-key="'+_esc(id)+'" oninput="accRateSync(this)" style="width:72px;padding:3px 6px;font-size:12px;text-align:right;border:1px solid #d1d5db;border-radius:5px"></td>'
          + '<td style="text-align:right"><span data-rate-hq="'+_esc(id)+'" style="font-weight:700">'+hqPct+'%</span></td>'
          + '<td style="white-space:nowrap">'
            + '<button '+(ro?'disabled':'')+' onclick="accSaveRate(\''+x.scope_type+'\',\''+key+'\')" style="padding:3px 8px;font-size:11px;background-color:#2563eb;color:#fff;border:0;border-radius:5px;cursor:pointer;font-weight:700">'+(_en?'Save':'저장')+'</button> '
            + (x.is_override ? '<button '+(ro?'disabled':'')+' onclick="accResetRate(\''+x.scope_type+'\',\''+key+'\')" style="padding:3px 8px;font-size:11px;background-color:#f1f5f9;color:#334155;border:1px solid #cbd5e1;border-radius:5px;cursor:pointer">'+(_en?'Reset':'기본값')+'</button>' : '')
          + '</td></tr>';
      }).join('') : ('<tr><td colspan="6" class="empty">'+(_en?'No matching branches/agencies':'해당하는 지사·대리점 없음')+'</td></tr>');
    } catch(e){ _showErr(tbody, e, 6); }
  };

  // 지점 수수료 % 를 치면 본사 마진 % 가 따라 움직인다(합이 100%).
  window.accRateSync = function(el){
    const key = el.getAttribute('data-rate-key');
    const out = document.querySelector('[data-rate-hq="'+(window.CSS&&CSS.escape?CSS.escape(key):key)+'"]');
    if (!out) return;
    let v = Number(el.value);
    if (!isFinite(v)) return;
    v = Math.min(100, Math.max(0, v));
    out.textContent = (Math.round((100 - v)*10)/10) + '%';
  };

  window.accSaveRate = async function(scopeType, keyEnc){
    const _en = (window.adminLang==='en');
    const scopeKey = decodeURIComponent(keyEnc);
    const id = scopeType+'|'+scopeKey;
    const input = document.querySelector('[data-rate-key="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');
    if (!input) return;
    const br = Number(input.value);
    if (!isFinite(br) || br < 0 || br > 100) { alert(_en?'Enter 0~100':'0~100 사이 숫자를 넣어 주세요.'); return; }
    try {
      const r = await fetch('/api/admin/settlement/rate-config', {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ scope_type: scopeType, scope_key: scopeKey, branch_rate: br })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      await accLoadRateConfig();
      await accLoadFranchise();   // 정산 금액에 «즉시» 반영 — 이 줄이 빠지면 화면이 안 바뀐다
    } catch(e){ alert((_en?'Save failed: ':'저장 실패: ')+String(e&&e.message||e)); }
  };

  window.accResetRate = async function(scopeType, keyEnc){
    const _en = (window.adminLang==='en');
    const scopeKey = decodeURIComponent(keyEnc);
    if (!confirm(_en ? ('Reset "'+scopeKey+'" to the default (branch 40% / HQ 60%)?')
                     : ('「'+scopeKey+'」 를 기본값(지점 40% / 본사 60%)으로 되돌릴까요?'))) return;
    try {
      const r = await fetch('/api/admin/settlement/rate-config', {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ scope_type: scopeType, scope_key: scopeKey, reset: true })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      await accLoadRateConfig();
      await accLoadFranchise();
    } catch(e){ alert((_en?'Reset failed: ':'되돌리기 실패: ')+String(e&&e.message||e)); }
  };

  // ──────────────────────────────────────────────────────────
  // 4. 환불 / 취소 관리
  // ──────────────────────────────────────────────────────────
  window.accLoadRefunds = async function(){
    const status = document.getElementById('acc-rf-status').value;
    const tbody = document.getElementById('acc-rf-tbody');
    const _en = (window.adminLang==='en');
    tbody.innerHTML = '<tr><td colspan="9" class="empty">'+(_en?'Loading…':'불러오는 중…')+'</td></tr>';
    // ⚠️ paid_at·created_at 은 **밀리초**다(실측: 1756430065000). 예전 코드가 ×1000 을 한 번 더
    //    해서 서기 5만년대 날짜(+051907-…)를 찍고 있었다. 초로 착각하지 말 것.
    const _day = function(ms){
      var n = Number(ms||0); if (!n) return '-';
      try { return new Date(n + 9*3600*1000).toISOString().slice(0,10); } catch(e){ return '-'; }
    };
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      const r = await fetch('/api/admin/reports/refunds-list?' + qs.toString(), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      tbody.innerHTML = (d.rows||[]).map(r => {
        // 원부에서 빠진 학생(퇴원 등)은 이름이 없다. 지어내지 말고 «(원부 없음)» 이라고 밝힌다.
        const nm = r.student_name || (_en?'(not in roster)':'(원부 없음)');
        const nmStyle = r.student_name ? '' : 'color:#94a3b8';
        const uid = r.login_id || r.user_id || '';
        // 환불금액은 실제로 되돌린 건(refunded/cancelled)만 금액을 적는다.
        const refunded = (r.status==='refunded' || r.status==='cancelled');
        return `<tr><td>${_esc(_day(r.created_at))}</td>
                <td style="${nmStyle}"><b>${_esc(nm)}</b></td>
                <td><code style="font-size:11px">${_esc(uid)}</code></td>
                <td>${_esc(_day(r.paid_at))}</td>
                <td style="text-align:right">${_fmt(r.amount_krw)}</td>
                <td style="text-align:right">${refunded ? _fmt(r.amount_krw) : '-'}</td>
                <td>${_esc(r.memo||'-')}</td>
                <td>${_badge(r.status, r.status==='refunded'?'warn':'bad')}</td>
                <td><button class="primary" style="padding:3px 8px;font-size:11px" onclick="alert('상세 처리는 별도 페이지에서')">처리</button></td></tr>`;
      }).join('') || ('<tr><td colspan="9" class="empty">'+(_en?'No refund/cancel records':'환불/취소 내역 없음')+'</td></tr>');
    } catch(e) { _showErr(tbody, e, 9); }
  };

  // ──────────────────────────────────────────────────────────
  // 5. 세무 (부가세·세금계산서·현금영수증)
  // ──────────────────────────────────────────────────────────
  window.accLoadTax = async function(){
    const month = document.getElementById('acc-tax-month').value || _today().slice(0,7);
    const kind  = document.getElementById('acc-tax-kind').value || 'vat';
    const tbody = document.getElementById('acc-tax-tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="empty">집계 중…</td></tr>';
    try {
      const r = await fetch(`/api/admin/reports/tax?period=${encodeURIComponent(month)}&kind=${kind}`, { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      tbody.innerHTML = (d.rows||[]).map(r => `
        <tr><td>${_esc(r.kind)}</td>
            <td style="text-align:right">${_fmt(r.supply)}</td>
            <td style="text-align:right">${_fmt(r.vat)}</td>
            <td style="text-align:right"><b>${_fmt(r.total)}</b></td>
            <td style="text-align:right">${(r.count||0).toLocaleString()}</td></tr>`).join('') +
        `<tr style="background:#fef3c7;font-weight:700"><td colspan="2">납부할 부가세</td>
         <td style="text-align:right">${_fmt(d.summary.vat)}</td>
         <td colspan="2">원천세 ${_fmt(d.summary.withholding)}</td></tr>`;
    } catch(e) { _showErr(tbody, e, 5); }
  };

  // ──────────────────────────────────────────────────────────
  // 6. 회계 전표 / 분개장
  // ──────────────────────────────────────────────────────────
  window.accLoadJournal = async function(){
    let from = document.getElementById('acc-jrn-from').value;
    let to   = document.getElementById('acc-jrn-to').value;
    if (!from || !to) {
      // 기본 = 이번 달 전체
      const today = _today();
      const ym = today.slice(0,7);
      from = ym + '-01'; to = today;
      document.getElementById('acc-jrn-from').value = from;
      document.getElementById('acc-jrn-to').value = to;
    }
    const tbody = document.getElementById('acc-jrn-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty">불러오는 중…</td></tr>';
    try {
      const qs = new URLSearchParams({ from, to });
      const r = await fetch('/api/admin/reports/journal?' + qs.toString(), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      tbody.innerHTML = (d.entries||[]).map(e => `
        <tr><td>${_esc(e.date)}</td><td><code style="font-size:11px">${_esc(e.doc_no)}</code></td>
            <td>${_esc(e.desc)}</td>
            <td style="text-align:right;color:#0ea5e9">${_esc(e.debit_account)} ${_fmt(e.amount)}</td>
            <td style="text-align:right;color:#dc2626">${_esc(e.credit_account)} ${_fmt(e.amount)}</td>
            <td><code style="font-size:10px">${_esc(e.ref||'')}</code></td></tr>`).join('') +
        `<tr style="background:#fef3c7;font-weight:800"><td colspan="3">합계</td>
         <td style="text-align:right">차변 ${_fmt(d.totals.debit)}</td>
         <td style="text-align:right">대변 ${_fmt(d.totals.credit)}</td><td>대차 ${d.totals.debit===d.totals.credit?'✓ 일치':'✗ 불일치'}</td></tr>` ||
         '<tr><td colspan="6" class="empty">전표 데이터 없음</td></tr>';
    } catch(e) { _showErr(tbody, e, 6); }
  };

  window.accNewJournalEntry = function(){
    const date  = prompt('일자 (YYYY-MM-DD)', _today());
    if (!date) return;
    const desc  = prompt('적요 (예: 사무실 임대료 지급)');
    if (!desc) return;
    const debit = prompt('차변 계정과목 (예: 임대료)');
    if (!debit) return;
    const credit = prompt('대변 계정과목 (예: 현금)');
    if (!credit) return;
    const amount = Number(prompt('금액 (KRW)', '0'));
    if (!amount || isNaN(amount)) { alert('금액이 올바르지 않습니다.'); return; }
    alert(`전표 입력 (수동 기록):\n\n  일자: ${date}\n  적요: ${desc}\n  차변: ${debit} ${amount.toLocaleString()}\n  대변: ${credit} ${amount.toLocaleString()}\n\n현재 자동 기록은 student_payments + payslips 에서만 생성됩니다.\n수동 전표는 별도 ledger 테이블이 추가되면 저장 가능합니다.`);
  };

  // ──────────────────────────────────────────────────────────
  // 7. 매출 대시보드 (차트)
  // ──────────────────────────────────────────────────────────
  window.accLoadSalesChart = async function(){
    const wrap = document.getElementById('acc-sales-chart');
    wrap.innerHTML = '<div style="text-align:center;padding:30px"><span class="empty">차트 생성 중…</span></div>';
    try {
      const year = new Date().getUTCFullYear();
      const r = await fetch('/api/admin/reports/annual?year=' + year, { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      // 차트 캔버스 + 표
      wrap.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:14px;width:100%;max-width:100%;box-sizing:border-box">
          <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e5e7eb;min-width:0;overflow:hidden;box-sizing:border-box">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">${year}년 월별 매출 (KRW)</div>
            <!-- ⚠️ 캔버스는 «높이가 정해진 position:relative 래퍼» 안에 넣는다.
                 responsive + maintainAspectRatio:false 는 부모의 크기를 그대로 따라가는데,
                 높이가 없는 부모에 넣으면 캔버스가 자기 높이로 부모를 늘리고
                 그걸 다시 읽어 창 크기가 바뀔 때마다 그래프가 컨테이너를 벗어난다(2026-08-18 수리).
                 그리드도 1fr 1fr 이면 내용보다 작게 줄지 못해 넘친다 → minmax(min(100%,300px),1fr) + min-width:0. -->
            <div style="position:relative;width:100%;height:min(240px,55vh)">
              <canvas id="acc-sales-canvas"></canvas>
            </div>
          </div>
          <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e5e7eb;overflow:auto;max-height:300px;min-width:0;box-sizing:border-box">
            <table style="width:100%;font-size:11px;border-collapse:collapse">
              <thead><tr style="background:#f3f4f6"><th style="padding:6px;text-align:left">월</th><th style="padding:6px;text-align:right">매출</th><th style="padding:6px;text-align:right">순이익</th></tr></thead>
              <tbody>${d.monthlies.map(m=>`<tr><td style="padding:5px;border-bottom:1px solid #f3f4f6">${m.period}</td><td style="padding:5px;text-align:right;border-bottom:1px solid #f3f4f6">${_fmt(m.revenue)}</td><td style="padding:5px;text-align:right;border-bottom:1px solid #f3f4f6;color:${m.net>=0?'#16a34a':'#dc2626'}">${_fmt(m.net)}</td></tr>`).join('')}
              <tr style="background:#fef3c7;font-weight:800"><td style="padding:6px">합계</td><td style="padding:6px;text-align:right">${_fmt(d.totals.revenue)}</td><td style="padding:6px;text-align:right">${_fmt(d.totals.net)}</td></tr></tbody>
            </table>
          </div>
        </div>`;
      // Chart.js 그리기 (전역 Chart 사용 — 페이지 상단에 이미 로드됨)
      if (typeof Chart !== 'undefined') {
        const ctx = document.getElementById('acc-sales-canvas');
        // 이전 차트는 반드시 버린다 — innerHTML 로 캔버스를 갈아끼워도
        // 옛 인스턴스의 리사이즈 감시가 남아 크기 계산을 흔든다.
        if (window._accSalesChart) { try { window._accSalesChart.destroy(); } catch(_e) {} }
        window._accSalesChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: d.monthlies.map(m=>m.period.slice(5)+'월'),
            datasets: [
              { label:'매출', data: d.monthlies.map(m=>m.revenue), backgroundColor:'rgba(251,146,60,0.7)' },
              { label:'순이익', data: d.monthlies.map(m=>m.net), backgroundColor:'rgba(34,197,94,0.7)', type:'line', borderColor:'rgba(34,197,94,1)', tension:0.3 },
            ],
          },
          options: {
            responsive:true, maintainAspectRatio:false, resizeDelay:120,
            layout:{ padding:{ top:2, right:2, bottom:0, left:2 } },
            plugins:{ legend:{ position:'bottom', labels:{ boxWidth:12, font:{ size:11 } } } },
            scales:{
              // 넓은 화면에서는 12개 라벨이 다 들어가고, 좁아지면 자동으로 건너뛴다.
              // 글자를 기울이지 않아야(maxRotation:0) 아래로 밀려나지 않는다.
              x:{ grid:{ display:false }, ticks:{ font:{ size:10 }, maxRotation:0, autoSkip:true } },
              y:{ beginAtZero:true, ticks:{ font:{ size:10 }, maxTicksLimit:6 } },
            },
          },
        });
      }
    } catch(e) {
      wrap.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px">에러: ${_esc(e.message||e)}</div>`;
    }
  };

  // ──────────────────────────────────────────────────────────
  // 8. 미수금 / 미지급금
  // ──────────────────────────────────────────────────────────
  window.accLoadReceivables = async function(){
    const kind = document.getElementById('acc-ar-kind').value || 'receivable';
    const tbody = document.getElementById('acc-ar-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty">불러오는 중…</td></tr>';
    try {
      const r = await fetch('/api/admin/reports/receivables?kind=' + kind, { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      /* 🔁 (2026-08-18) 서버가 주는 각주(notes)를 반드시 같이 보여 준다.
            B2C 학생은 선불 구조라 미수금에서 빠졌는데, 그 사실을 안 적으면
            「어제보다 인원이 확 줄었다」로만 보인다. 왜 줄었는지가 각주에 있다. */
      const _arNotes = (d.notes || []).length
        ? `<tr><td colspan="6" style="background:#f9fafb;color:#4b5563;font-size:11.5px;line-height:1.7;padding:8px 10px">${
            d.notes.map(n => '· ' + _esc(n)).join('<br>')}</td></tr>` : '';
      if (!d.rows.length) { tbody.innerHTML = _arNotes + '<tr><td colspan="6" class="empty">데이터 없음</td></tr>'; return; }
      tbody.innerHTML = _arNotes + d.rows.map(r => {
        const overdueColor = r.days > 30 ? 'color:#dc2626;font-weight:700' : '';
        return `<tr><td>${_esc(r.target)}</td><td>${_esc(r.issued||'')}</td>
                <td style="text-align:right">${_fmt(r.amount)}</td>
                <td style="text-align:right;${overdueColor}">${r.days||0}일</td>
                <td>${_esc(r.note||'')}</td>
                <td><button class="primary" style="padding:3px 8px;font-size:11px" onclick="alert('처리는 별도 화면에서')">처리</button></td></tr>`;
      }).join('') +
      `<tr style="background:#fef3c7;font-weight:700"><td colspan="2">합계 ${d.totals.count}건</td><td style="text-align:right">${_fmt(d.totals.amount)}</td><td colspan="3"></td></tr>`;
    } catch(e) { _showErr(tbody, e, 6); }
  };

  // ──────────────────────────────────────────────────────────
  // 9. 손익 / 재무제표 — 생성 / PDF / Excel
  // ──────────────────────────────────────────────────────────
  /* 📅 분기별 조회 (2026-08-18) — 「월별 / 분기별」 토글.
     서버(reports/statement)는 period 를 «YYYY-MM» 과 «YYYY-Qn» 둘 다 받는다.
     화면 표기는 «2026 1분기» 형태(20XX N분기). 생성·PDF·Excel 이 모두 _statementUrl()
     하나만 쓰므로, 여기만 고치면 세 기능이 같이 분기를 따라간다. */
  let _fsGenerated = false;                 // 한 번이라도 [생성] 을 눌렀나 (기간을 바꾸면 다시 그린다)
  function _fsQuarterOf(ym){                // '2026-04' → '2026-Q2'
    const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
    return m ? m[1] + '-Q' + (Math.floor((Number(m[2]) - 1) / 3) + 1) : '';
  }
  function _fsFillQuarters(){
    const sel = document.getElementById('acc-fs-quarter');
    if (!sel || sel.options.length) return;
    const now = new Date();
    const cy = now.getFullYear(), cq = Math.floor(now.getMonth() / 3) + 1;
    for (let y = cy; y >= cy - 2; y--) {
      for (let q = 4; q >= 1; q--) {
        if (y === cy && q > cq) continue;    // 아직 오지 않은 분기는 넣지 않는다
        const o = document.createElement('option');
        o.value = y + '-Q' + q;
        o.textContent = y + ' ' + q + '분기';
        /* ⚠️ JS 로 그린 라벨은 i18n 사전(전체 문자열 일치)이 못 고친다 → data-ko/data-en 을 함께 넣는다 */
        o.setAttribute('data-ko', y + ' ' + q + '분기');
        o.setAttribute('data-en', 'Q' + q + ' ' + y);
        sel.appendChild(o);
      }
    }
    // 지금 보고 있는 «월» 이 속한 분기를 기본값으로 (사람이 보던 시점을 잃지 않게)
    const want = _fsQuarterOf((document.getElementById('acc-fs-month') || {}).value);
    if (want && Array.prototype.some.call(sel.options, o => o.value === want)) sel.value = want;
  }
  window.accFsModeChange = function(){
    const mode = (document.getElementById('acc-fs-mode') || {}).value || 'month';
    _fsFillQuarters();
    const mEl = document.getElementById('acc-fs-month');
    const qEl = document.getElementById('acc-fs-quarter');
    /* ⚠️ hidden 속성 대신 display 를 직접 만진다 — 작성자 CSS 가 display 를 정해 두면
       브라우저 기본 [hidden]{display:none} 이 밀려서 «숨겼는데 그대로 보이는» 일이 난다. */
    if (mEl) mEl.style.display = mode === 'quarter' ? 'none' : '';
    if (qEl) qEl.style.display = mode === 'quarter' ? '' : 'none';
    if (_fsGenerated) window.accGenStatement();
  };
  window.accFsPeriodChange = function(){ if (_fsGenerated) window.accGenStatement(); };
  function _statementUrl(format){
    const mode = (document.getElementById('acc-fs-mode') || {}).value || 'month';
    let period;
    if (mode === 'quarter') {
      _fsFillQuarters();
      period = ((document.getElementById('acc-fs-quarter') || {}).value)
            || _fsQuarterOf((document.getElementById('acc-fs-month') || {}).value)
            || _fsQuarterOf(_today().slice(0,7));
    } else {
      period = (document.getElementById('acc-fs-month') || {}).value || _today().slice(0,7);
    }
    const type  = document.getElementById('acc-fs-type').value || 'pl';
    const qs = new URLSearchParams({ type, period });
    if (format) qs.set('format', format);
    return '/api/admin/reports/statement?' + qs.toString();
  }
  window.accGenStatement = async function(){
    _fsGenerated = true;
    const wrap = document.getElementById('acc-fs-result');
    wrap.innerHTML = '<div style="text-align:center;padding:30px;color:#6b7280">생성 중…</div>';
    try {
      const r = await fetch(_statementUrl(), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      let html = `<div style="font-size:18px;font-weight:800;color:#111;border-bottom:3px solid #fb923c;padding-bottom:6px;margin-bottom:14px">${_esc(d.label)}</div>`;
      for (const sec of d.sections) {
        html += `<div style="font-size:14px;font-weight:700;color:#374151;margin:14px 0 6px">${_esc(sec.title)}</div>`;
        html += '<table style="width:100%;border-collapse:collapse;font-size:13px">';
        for (const it of sec.items) {
          const cls = it.highlight ? 'background:#fef3c7;font-weight:800' :
                      it.total ? 'background:#f3f4f6;font-weight:700;border-top:2px solid #d1d5db' :
                      it.sub ? 'font-style:italic;color:#6b7280' : '';
          const big = it.big ? 'font-size:16px;color:#fb923c' : '';
          if (it.amount === undefined) {
            html += `<tr style="${cls}"><td colspan="2" style="padding:6px 10px">${_esc(it.name)}</td></tr>`;
          } else {
            const amtColor = (it.amount < 0) ? 'color:#dc2626' : '';
            html += `<tr style="${cls}"><td style="padding:6px 10px;${big}">${_esc(it.name)}</td>
                     <td style="padding:6px 10px;text-align:right;${big};${amtColor}">${_fmt(it.amount)}</td></tr>`;
          }
        }
        html += '</table>';
      }
      wrap.innerHTML = html;
    } catch(e) {
      wrap.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px">에러: ${_esc(e.message||e)}</div>`;
    }
  };
  /* 🔍 매출–입금 대사 (2026-08-16, 2026-08-18 기준 전환) — 통장 「케이씨피」 입금이 기준.
     · 기준 = 신한 통장에 실제로 들어온 「케이씨피」 정산금 → 수수료 역산 = «통장 기준 매출»
     · 장부 매출·예상 입금은 그 옆에 놓는 비교값이다(장부는 KCP 정산 대상 결제만 센다)
     · B2B 직접입금·기타 입금·자기 계좌 간 자금 이동은 대사에서 제외
       (자금 이동은 2026-08-18 사장님 지시로 «참고» 문구에서도 뺐다 — 아래 «참고» 에는
        성격이 아직 확인되지 않은 입금만 남는다)
     월별로는 PG 정산 시차 때문에 어긋나는 게 정상이라, 판정은 서버가 «누적» 으로 한다. */
  function _rcUrl(format){
    const m = (document.getElementById('acc-rc-months') || {}).value || '6';
    const qs = new URLSearchParams({ months: m });
    if (format) qs.set('format', format);
    return '/api/admin/reports/reconcile?' + qs.toString();
  }
  window.accLoadReconcile = async function(){
    const wrap = document.getElementById('acc-rc-result');
    if (!wrap) return;
    wrap.innerHTML = '<div style="text-align:center;padding:30px;color:#6b7280">대사 중…</div>';
    try {
      const r = await fetch(_rcUrl(), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'API error');
      const V = { ok:['#059669','#ecfdf5','🟢 정상'], warn:['#d97706','#fffbeb','🟡 주의'],
                  alert:['#dc2626','#fef2f2','🔴 확인 필요'], no_data:['#6b7280','#f9fafb','⚪ 자료 없음'] };
      window.notePgFeeRate(d.pg_fee_rate);   // 서버가 정본 — 표기를 여기서 맞춘다
      const v = V[d.verdict] || V.no_data;
      const t = d.totals || {};
      let html = `<div style="font-size:16px;font-weight:800;color:#111;border-bottom:3px solid #fb923c;padding-bottom:6px;margin-bottom:12px">${_esc(d.label)}</div>`;
      /* ⏳ 판정 근거는 «시차 맞춘» 값이다 — 같은 달끼리 빼면 창의 양 끝이 서로 다른
         결제를 보고 있어 매번 한 방향으로 «통장이 적다» 가 나온다(2026-08-18). */
      const lm = d.lag_matched;
      const headDiff = lm ? lm.diff : t.diff;
      const headPct  = lm ? lm.diff_pct : t.diff_pct;
      html += `<div style="background:${v[1]};border:1px solid ${v[0]}33;border-left:4px solid ${v[0]};border-radius:8px;padding:10px 12px;margin-bottom:12px">
        <div style="font-weight:800;color:${v[0]};margin-bottom:4px">${v[2]} · 차이 ${_fmt(headDiff)} (${headPct}% · 통장 기준)</div>
        <div style="font-size:12px;color:#374151">${_esc(d.message)}</div></div>`;
      if (lm) {
        html += `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#1e3a8a;line-height:1.7">
          <b>⏳ PG 정산 시차 ${lm.lag_days}일을 맞춰 비교했습니다</b><br>
          케이씨피는 <b>주 1회</b> 정산하는데 결제일부터 입금까지 2~4주가 걸립니다. 그래서 «같은 달 장부 vs 같은 달 통장» 을 그대로 빼면
          <b>아직 정산 안 된 최근 결제가 통째로 «미입금» 으로 잡힙니다.</b> 아래 월별 표가 들쭉날쭉한 것은 그 때문이며 정상입니다.<br>
          · 결제 <b>${_esc(lm.pay_from)} ~ ${_esc(lm.pay_to)}</b> — 장부 ${_fmt(lm.revenue)} (${lm.pay_count}건) · 예상 입금 ${_fmt(lm.expected)}<br>
          · 입금 <b>${_esc(lm.deposit_from)} ~ ${_esc(lm.deposit_to)}</b> — 실제 ${_fmt(lm.deposit_pg)} · 통장 기준 매출 ${_fmt(lm.bank_revenue)}<br>
          · <b>차이 ${_fmt(lm.diff)} (${lm.diff_pct}%)</b> ← 판정은 이 값으로 합니다
          <div style="margin-top:6px;color:#3730a3">※ 시차 ${lm.lag_days}일은 실측 추정치입니다. KCP 정산명세서를 받으면 실제 값으로 맞출 수 있습니다.</div>
        </div>`;
      }
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px">'
        + '<thead style="background:#f3f4f6"><tr>'
        + '<th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb">월</th>'
        + '<th style="padding:6px 8px;text-align:right;border-bottom:2px solid #e5e7eb;background:#fff7ed">실제 PG 입금<br><span style="font-weight:400;color:#c2410c">기준 · 통장</span></th>'
        + '<th style="padding:6px 8px;text-align:right;border-bottom:2px solid #e5e7eb;background:#fff7ed">통장 기준 매출<br><span style="font-weight:400;color:#c2410c">수수료 역산</span></th>'
        + '<th style="padding:6px 8px;text-align:right;border-bottom:2px solid #e5e7eb">장부 매출<br><span style="font-weight:400;color:#6b7280">KCP 정산 대상</span></th>'
        + '<th style="padding:6px 8px;text-align:right;border-bottom:2px solid #e5e7eb">예상 입금<br><span style="font-weight:400;color:#6b7280">수수료 ' + window.pgFeeRateLabel() + ' 차감</span></th>'
        + '<th style="padding:6px 8px;text-align:right;border-bottom:2px solid #e5e7eb">차이</th>'
        + '<th style="padding:6px 8px;text-align:right;border-bottom:2px solid #e5e7eb">기타 입금<br><span style="font-weight:400;color:#6b7280">참고</span></th>'
        + '</tr></thead><tbody>';
      (d.rows || []).forEach(row => {
        const dc = row.diff == null ? '#9ca3af' : (row.diff < 0 ? '#dc2626' : '#059669');
        html += `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:6px 8px;font-weight:600">${_esc(row.period)}</td>
          <td style="padding:6px 8px;text-align:right;font-weight:700;background:#fffbf5">${row.has_bank ? _fmt(row.deposit_pg) : '<span style="color:#9ca3af">자료없음</span>'}</td>
          <td style="padding:6px 8px;text-align:right;background:#fffbf5">${row.bank_revenue == null ? '<span style="color:#9ca3af">—</span>' : _fmt(row.bank_revenue)}</td>
          <td style="padding:6px 8px;text-align:right">${_fmt(row.revenue)}</td>
          <td style="padding:6px 8px;text-align:right;color:#6b7280">${_fmt(row.expected)}</td>
          <td style="padding:6px 8px;text-align:right;font-weight:700;color:${dc}">${row.diff == null ? '—' : _fmt(row.diff)}</td>
          <td style="padding:6px 8px;text-align:right;color:#9ca3af">${row.has_bank ? _fmt(row.deposit_other) : '—'}</td></tr>`;
      });
      html += `<tr style="background:#fef3c7;font-weight:800">
        <td style="padding:7px 8px">누적 합계${d.reconciled_months ? `<br><span style="font-weight:400;font-size:10px;color:#92400e">통장 자료 있는 ${d.reconciled_months}개월</span>` : ''}</td>
        <td style="padding:7px 8px;text-align:right">${_fmt(t.deposit_pg)}</td>
        <td style="padding:7px 8px;text-align:right">${_fmt(t.bank_revenue)}</td>
        <td style="padding:7px 8px;text-align:right">${_fmt(t.revenue)}</td>
        <td style="padding:7px 8px;text-align:right">${_fmt(t.expected)}</td>
        <td style="padding:7px 8px;text-align:right;color:${t.diff < 0 ? '#dc2626' : '#059669'}">${_fmt(t.diff)}</td>
        <td></td></tr></tbody></table>`;
      const notes = [d.transfer_note, d.b2b_note, d.non_kcp_note, d.no_bank_note].filter(Boolean);
      html += `<p style="margin-top:8px;font-size:11px;color:#6b7280;line-height:1.6">
        ※ <b>기준은 통장</b>입니다 — 신한 통장에 실제로 들어온 「케이씨피」 정산금(${_esc(d.basis_label || '통장 「케이씨피」 입금')})을 기준으로, 장부가 얼마나 어긋나는지 봅니다.<br>
        ※ 대사 대상은 「케이씨피」 입금 <b>하나뿐</b>입니다. 통장 직접입금(B2B)·기타 입금·자기 계좌 간 자금 이동은 <b>제외</b>했고, 장부 매출도 KCP 정산 대상 결제만 셉니다.<br>
        ※ 카드 결제는 PG(케이씨피)가 <b>2~4주 뒤</b>에 정산해 넣어 주므로 <b>월별로 어긋나는 것은 정상</b>입니다. 판정은 위의 <b>시차를 맞춘 비교</b>로 합니다(누적만으로는 창의 양 끝이 서로 다른 결제를 봅니다).<br>
        ※ 시연용 테스트 결제는 장부 매출에서 이미 제외했습니다. 기타 입금(국세 환급·타행 이체 등)은 수업료가 아니라 참고로만 표시합니다.
        ${d.bank_data_from ? '<br>※ 계좌 입금 자료는 ' + _esc(d.bank_data_from) + ' 부터 있습니다(그 전 달은 판정하지 않습니다).' : ''}</p>`;
      if (notes.length) {
        html += '<div style="margin-top:8px;background:#f9fafb;border:1px solid #e5e7eb;border-left:4px solid #94a3b8;border-radius:8px;padding:8px 10px;font-size:11px;color:#475569;line-height:1.7">'
          + '<b style="color:#334155">대사에서 뺀 금액</b><br>'
          + notes.map(n => '· ' + _esc(n)).join('<br>') + '</div>';
      }
      wrap.innerHTML = html;
    } catch(e) {
      wrap.innerHTML = `<div style="color:#ef4444;text-align:center;padding:20px">에러: ${_esc(e.message||e)}</div>`;
    }
  };
  window.accReconcileExcel = function(){ window.open(_rcUrl('csv'), '_blank'); };

  window.accStatementPdf = async function(){
    // 새 창에 인쇄 가능한 형태로 출력
    const w = window.open('', '_blank', 'width=1000,height=900,scrollbars=yes');
    if (!w) { alert('팝업이 차단되었습니다.'); return; }
    w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>재무제표</title></head><body><div style="text-align:center;padding:30px">생성 중…</div></body></html>');
    try {
      const r = await fetch(_statementUrl(), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      let body = `<h1 style="font-size:22px;border-bottom:3px solid #fb923c;padding-bottom:8px">${_esc(d.label)}</h1>`;
      for (const sec of d.sections) {
        body += `<h2 style="font-size:14px;color:#374151;margin:16px 0 6px">${_esc(sec.title)}</h2>`;
        body += '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px">';
        for (const it of sec.items) {
          const bg = it.highlight ? '#fef3c7' : it.total ? '#f3f4f6' : '#fff';
          const fw = it.highlight || it.total ? 'bold' : 'normal';
          const fs = it.big ? '16px' : '13px';
          if (it.amount === undefined) {
            body += `<tr style="background:${bg};font-weight:${fw}"><td colspan="2" style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${_esc(it.name)}</td></tr>`;
          } else {
            const ac = it.amount < 0 ? '#dc2626' : '#111';
            body += `<tr style="background:${bg};font-weight:${fw}"><td style="padding:8px 10px;font-size:${fs};border-bottom:1px solid #e5e7eb">${_esc(it.name)}</td><td style="padding:8px 10px;font-size:${fs};text-align:right;color:${ac};border-bottom:1px solid #e5e7eb">${_fmt(it.amount)}</td></tr>`;
          }
        }
        body += '</table>';
      }
      w.document.open();
      w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${_esc(d.label)}</title>
        <style>@page{size:A4;margin:18mm 14mm}body{font-family:MangoiHanSC,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;color:#111;padding:30px;max-width:900px;margin:0 auto}.toolbar{position:fixed;top:10px;right:10px;background:#fff;padding:8px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.1)}.toolbar button{padding:8px 14px;font-size:13px;border:0;border-radius:6px;cursor:pointer;margin-left:6px;font-weight:600}@media print{.toolbar{display:none}body{padding:0}}</style>
        </head><body>
        <div class="toolbar">
          <button style="background:#fb923c;color:#fff" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
          <button style="background:#6b7280;color:#fff" onclick="window.close()">✕ 닫기</button>
        </div>
        ${body}
        <p style="margin-top:30px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:center">망고아이 ERP · 생성: ${new Date().toLocaleString('ko-KR')}</p>
        <!-- BUILD:20260714145001 -->
</body></html>`);
      w.document.close();
    } catch(e) {
      w.document.body.innerHTML = `<h2 style="color:#ef4444">에러: ${_esc(e.message||e)}</h2>`;
    }
  };
  window.accStatementExcel = function(){
    location.href = _statementUrl('csv');
  };

  // ━━━━━━━━━━ 💳 법인카드 사용내역 (신한법인카드 연동 + AI 분석) ━━━━━━━━━━
  let _cardData = null;
  // false = 카드사 동기화가 안 된 상태(= 화면 숫자가 예시 데이터). 화면에 반드시 표시한다.
  let _cardSynced = false;
  // 서버가 준 연동 상태(state / message_ko / last_error …) — «왜 비었는지»의 유일한 근거
  let _cardStatus = null;
  function _cardSampleBanner() {
    if (_cardSynced) return '';
    return '<div style="margin:0 0 10px;padding:10px 12px;border:1px solid #f59e0b;background:rgba(245,158,11,0.10);'
      + 'border-radius:8px;color:#b45309;font-size:13px;font-weight:700">'
      + '⚠️ 카드사 미연동 — 아래 지출 내역은 실제 결제가 아니라 예시(샘플) 데이터입니다. 회계 판단에 사용하지 마세요.<br>'
      + '<span style="font-weight:500">Card sync not connected — the transactions below are sample data, not real payments.</span></div>';
  }
  let _cardCharts = {};
  // 한도 ₩1,000,000 카드에 맞게 카테고리 평균·임계값 조정 (총합이 1M 안에 들도록)
  const CARD_CATEGORIES = {
    '식대':       { icon: '🍱', color: '#f59e0b', avg: 250000, threshold: 350000 },
    '교통':       { icon: '🚕', color: '#10b981', avg: 100000, threshold: 150000 },
    // 🏨 숙박 — 출장 숙소(2026-08-15 신설). 이모지는 Unicode 6.0 이라 Win10 에서도 안 깨진다
    '숙박':       { icon: '🏨', color: '#f43f5e', avg: 150000, threshold: 300000 },
    '사무용품':   { icon: '📎', color: '#3b82f6', avg: 80000,  threshold: 130000 },
    '통신':       { icon: '📞', color: '#8b5cf6', avg: 50000,  threshold: 80000 },
    '마케팅':     { icon: '📣', color: '#ec4899', avg: 200000, threshold: 350000 },
    /* ☁️ SW구독 — 장비에서 떼어냄(2026-08-15). 기준은 «끊으면 못 쓰나».
       임계값을 장비(₩250,000)보다 높게 잡는다 — AI·클라우드는 원래 매달 나가는 고정비라
       장비 기준으로 재면 매달 빨간불이 켜져서 경고가 무의미해진다. */
    '구독':       { icon: '☁️', color: '#0ea5e9', avg: 300000, threshold: 500000 },
    '장비':       { icon: '💻', color: '#06b6d4', avg: 120000, threshold: 250000 },
    '복리후생':   { icon: '🎁', color: '#a855f7', avg: 100000, threshold: 200000 },
    '기타':       { icon: '❓', color: '#6b7280', avg: 50000,  threshold: 100000 },
  };

  window.cardSync = async function() {
    const btn = document.getElementById('acc-card-sync-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 동기화 중…'; }
    try {
      const monthEl0 = document.getElementById('acc-card-month');
      const q0 = monthEl0 && monthEl0.value ? ('?month=' + encodeURIComponent(monthEl0.value)) : '';
      const r = await fetch('/api/admin/corpcard/sync' + q0, { method: 'POST', credentials: 'include' });
      let d = null;
      try { d = await r.json(); } catch {}
      _cardStatus = (d && d.status) || null;
      if (r.ok && d && d.ok && d.data) { _cardData = d.data; _cardSynced = _cardHasReal(); }
      else { _cardData = null; _cardSynced = false; if (!_cardStatus && d && d.error) _cardStatus = { state: d.error, message_ko: d.message || '', message_en: d.message_en || '' }; }
    } catch (e) {
      _cardData = null; _cardSynced = false;
    }
    /* ⛔ (2026-08-07) 연동이 안 되면 «아무것도 보여주지 않는다».
     * 예전엔 여기서 generateCardSampleData() 로 가짜 지출내역을 채웠다. 경고 배너를 붙여도
     * 표에 숫자가 떠 있으면 사람은 그 숫자를 읽는다 — 회계 판단이 오도된다.
     * 없는 건 없다고 말하는 편이 낫다. */
    renderCardStatus();
    if (_cardSynced && _cardData) { renderCardKpis(); renderCardCharts(); renderCardTable(); renderCardFeedback(); }
    else { renderCardNotConnected(); }
    // ⚠️ (2026-08-03) 예전엔 실패했을 때도 무조건 '✅ 동기화 완료' 라고 찍었다.
    //   '/api/admin/corpcard/sync' 는 서버에 없고(라이브 404), 카드사 연동 자체가 없다.
    //   그래서 화면엔 generateCardSampleData() 가 만든 **가짜 카드 내역**이 뜨는데
    //   버튼은 성공했다고 말했다 — 지출 판단을 오도한다.
    if (btn) {
      btn.disabled = false;
      btn.textContent = _cardSynced ? '✅ 동기화 완료' : '⚠️ 미연동 (예시 데이터)';
      setTimeout(() => btn.textContent = '🔄 신한 동기화', _cardSynced ? 1500 : 3000);
    }
    /* ⚠️ (2026-08-13) 예전엔 실패하면 무조건 «키가 등록되지 않았습니다» 라고 띄웠다.
       실제로는 키가 멀쩡한데 계정이 «데모(샌드박스)» 라 CODEF 가 조회를 거부(CF-00017)하는
       경우가 있었고, 그때 이 문구는 사실이 아니었다 — 키를 몇 번을 다시 넣어도 해결되지 않는다.
       이제 사유는 서버(status)가 판정하고, 여기서는 그 문장을 그대로 보여 준다. */
    if (!_cardSynced) {
      var en0 = !!(window.adminLang && window.adminLang !== 'ko');
      var msg = _cardStatus && (en0 ? _cardStatus.message_en : _cardStatus.message_ko);
      alert('⚠️ ' + (msg || '카드사 동기화에 실패했습니다. 화면의 연동 상태를 확인하세요.')
        + (_cardStatus && _cardStatus.last_error ? '\n\n[서버 원문]\n' + _cardStatus.last_error : ''));
    }
  };

  // 실데이터로 볼 수 있는 상태인가 — 연동 정상(ok)이거나 그 달만 비었을 때(no_data)만 true
  function _cardHasReal() {
    if (!_cardData) return false;
    if (_cardData.current && _cardData.current.length) return true;
    return !!(_cardStatus && (_cardStatus.state === 'ok' || _cardStatus.state === 'no_data'));
  }

  /* 📣 연동 상태 한 줄 — «연동 안 됨» 한 마디로 뭉개지 않고 상태별로 다르게 말한다.
     회계 담당이 필리핀 스태프라 한/영 두 벌([[accounting-staff-english]]). */
  function renderCardStatus() {
    var box = document.getElementById('acc-card-status');
    if (!box) return;
    var s = _cardStatus;
    if (!s) { box.innerHTML = ''; return; }
    /* 상단 카드번호를 **실제 설정된 카드**로 맞춘다. 예전엔 HTML 에 «8842» 가 박혀 있었는데
       실제 등록 카드가 바뀌면서 어긋났다(2026-08-14: 화면 8842 / 바로빌 4819 / 실카드 3575).
       시크릿(BAROBILL_CARDNUM)을 바꾸면 화면도 따라오게 한다. */
    if (s.card_last4) {
      var numEl = document.getElementById('acc-card-num');
      if (numEl) numEl.textContent = '**** **** **** ' + s.card_last4;
    }
    var en = !!(window.adminLang && window.adminLang !== 'ko');
    var TONE = {
      ok:              ['#059669', 'rgba(5,150,105,0.08)',  '✅'],
      no_data:         ['#0f4c81', 'rgba(15,76,129,0.08)',  'ℹ️'],
      never_synced:    ['#b45309', 'rgba(245,158,11,0.10)', '⏳'],
      not_configured:  ['#b45309', 'rgba(245,158,11,0.10)', '🔑'],
      sandbox_account: ['#b45309', 'rgba(245,158,11,0.12)', '🧪'],
      sync_error:      ['#b91c1c', 'rgba(220,38,38,0.08)',  '⚠️'],
    };
    var t = TONE[s.state] || TONE.sync_error;
    var when = s.last_sync_at
      ? new Date(s.last_sync_at + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' KST'
      : (en ? 'never' : '없음');
    var html = '<div style="border:1px solid ' + t[0] + ';background:' + t[1] + ';border-radius:8px;padding:10px 12px">'
      + '<div style="font-size:13px;font-weight:800;color:' + t[0] + ';line-height:1.6">' + t[2] + ' '
      + _esc(en ? (s.message_en || s.message_ko || '') : (s.message_ko || '')) + '</div>'
      + '<div style="margin-top:5px;font-size:11px;color:#6b7280">'
      + (en ? 'Last sync: ' : '마지막 동기화: ') + when
      + ' · ' + (en ? 'stored rows: ' : '적재 건수: ') + (s.rows_total || 0)
      + (s.base ? ' · ' + _esc(s.base) : '') + '</div>';
    if (s.last_error) {
      html += '<details style="margin-top:6px"><summary style="font-size:11px;color:#6b7280;cursor:pointer">'
        + (en ? 'Raw error from the card provider' : '카드사(' + _esc(s.provider === 'barobill' ? '바로빌' : 'CODEF') + ') 오류 원문') + '</summary>'
        + '<div style="margin-top:4px;font-size:11px;color:#6b7280;word-break:break-all;line-height:1.6">'
        + _esc(s.last_error) + '</div></details>';
    }
    box.innerHTML = html + '</div>';
  }
  /* 🧪 연동 자가진단 — 샌드박스 호스트로 «키·응답·파싱» 만 확인한다.
     ⛔ 서버가 dryRun 으로 돌려 D1 에 한 줄도 안 쓴다. 결과도 회계 표가 아니라
        이 진단 상자에만 띄운다(데모 숫자가 실제 지출로 오인되면 안 되므로). */
  window.cardSelfTest = async function () {
    var btn = document.getElementById('acc-card-selftest-btn');
    var en = !!(window.adminLang && window.adminLang !== 'ko');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 진단 중…'; }
    var d = null;
    try {
      var r = await fetch('/api/admin/corpcard/selftest', { method: 'POST', credentials: 'include' });
      try { d = await r.json(); } catch (e) {}
    } catch (e) {}
    if (btn) { btn.disabled = false; btn.textContent = '🧪 연동 자가진단'; }

    var box = document.getElementById('acc-card-status');
    var res = d && d.result;
    // 프로바이더에 따라 문구가 다르다 — 바로빌엔 «토큰 발급» 단계도 «데모» 개념도 없다
    var prov = (d && d.provider) || (_cardStatus && _cardStatus.provider) || 'codef';
    var isBaro = prov === 'barobill';
    var lines = [];
    if (!d || !d.ok) {
      lines.push(en ? 'Self-test could not run (keys missing or request blocked).'
                    : '자가진단을 실행하지 못했습니다(키 미등록이거나 요청이 막혔습니다).');
    } else {
      var got = res ? (res.seen || 0) : 0;
      var errs = (res && res.errors) || [];
      if (isBaro) {
        // 접속 자체가 됐는가 — HTTP 오류·SOAP 오류가 없으면 문이 열린 것이다
        var reached = !errs.some(function (e) { return /barobill_http_|soap_fault/.test(e); });
        lines.push((reached ? '✅ ' : '❌ ') + (en ? 'Connecting to BaroBill' : '바로빌 접속·인증'));
      } else {
        var okToken = !errs.some(function (e) { return /codef_token_failed/.test(e); });
        lines.push((okToken ? '✅ ' : '❌ ') + (en ? 'CODEF login (OAuth token)' : 'CODEF 로그인(토큰 발급)'));
      }
      lines.push((got > 0 ? '✅ ' : '❌ ') + (en ? 'Transaction query & parsing' : '거래내역 조회·파싱')
        + ' — ' + got + (en ? ' rows' : '건'));
      if (errs.length) lines.push('⚠️ ' + _esc(String(errs[0]).slice(0, 260)));
      lines.push(isBaro
        ? (en ? 'Nothing was saved — this only checks the connection. Press Sync to store real transactions.'
              : '이 진단은 <b>저장하지 않습니다.</b> 실제로 채우려면 «🔄 동기화» 를 누르세요.')
        : (en ? 'Demo rows are NOT stored — this only proves the pipeline works.'
              : '데모 데이터는 <b>저장하지 않습니다.</b> 배선이 살아 있다는 것만 확인한 것입니다.'));
    }
    if (box) {
      /* 이전 진단 결과는 지우고 새로 그린다.
         예전엔 beforeend 로 계속 붙여서, 두 번 누르면 상자가 두 개·세 개로 쌓였다(실측). */
      var old = document.getElementById('acc-card-selftest');
      if (old) old.remove();
      box.insertAdjacentHTML('beforeend',
        '<div id="acc-card-selftest" style="margin-top:8px;border:1px dashed #6b7280;border-radius:8px;padding:10px 12px;background:#f9fafb">'
        + '<div style="font-size:12px;font-weight:800;color:#374151;margin-bottom:4px">🧪 '
        + (en ? 'Connection self-test' : '연동 자가진단') + '</div>'
        + '<div style="font-size:12px;color:#4b5563;line-height:1.8">' + lines.join('<br>') + '</div></div>');
    }
  };

  window.cardLoad = async function() {
    // 💳 (2026-08-13) 서버 적재분 조회 — CODEF 일일 자동 동기화가 채운 D1 데이터를 읽는다.
    //   연동(키) 미설정이고 적재분도 없으면 «미연동»을 그대로 보여 준다. 가짜 숫자는 안 채운다.
    var monthEl = document.getElementById('acc-card-month');
    var q = monthEl && monthEl.value ? ('?month=' + encodeURIComponent(monthEl.value)) : '';
    try {
      var r = await fetch('/api/admin/corpcard/transactions' + q, { credentials: 'include' });
      var d = null; try { d = await r.json(); } catch (e) {}
      _cardStatus = (d && d.status) || null;
      if (r.ok && d && d.ok && d.data) { _cardData = d.data; _cardSynced = _cardHasReal(); }
      else {
        _cardData = null; _cardSynced = false;
        if (!_cardStatus) _cardStatus = { state: (d && d.error) || 'sync_error', message_ko: '', message_en: '' };
      }
    } catch (e) { _cardData = null; _cardSynced = false; }
    renderCardStatus();
    // 실데이터가 아니면 숫자를 한 칸도 채우지 않는다 — ₩0 도 «실제 0원 지출» 로 읽힌다
    if (!_cardSynced) { renderCardNotConnected(); return; }
    renderCardKpis(); renderCardCharts(); renderCardTable(); renderCardFeedback();
  };

  /* 미연동 안내 — 숫자 대신 «무엇이 없고 무엇을 하면 되는지»를 적는다.
     회계 담당이 필리핀 스태프라 한/영 두 벌로 쓴다([[accounting-staff-english]]). */
  function renderCardNotConnected() {
    var en = !!(window.adminLang && window.adminLang !== 'ko');
    // 상태별 사유를 그대로 쓴다. «연동 안 됨» 은 사유를 모를 때만(2026-08-13)
    var why = _cardStatus && (en ? (_cardStatus.message_en || _cardStatus.message_ko) : _cardStatus.message_ko);
    var tbody = document.getElementById('acc-card-rows');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="9" style="padding:22px;text-align:center;color:#6b7280;font-size:13px;line-height:1.8">'
        + (en
          ? '<b>No real transactions to show.</b><br>Nothing is displayed on purpose — sample figures could be mistaken for real spending.'
          : '<b>보여드릴 실제 지출내역이 없습니다.</b><br>예시 숫자를 띄우면 실제 지출로 오인될 수 있어 일부러 비워 둡니다.')
        + (why ? '<br><span style="color:#b45309">' + _esc(why) + '</span>' : '')
        + '</td></tr>';
    }
    // KPI 타일도 «—» 로 되돌린다 — 이전 조회의 숫자가 남아 있으면 그 달 값으로 오인된다
    [['kpi-cur-month', '₩—'], ['kpi-prev-month', '₩—'], ['kpi-3m-avg', '₩—'], ['kpi-alerts', '—건'],
     ['kpi-cur-month-sub', '건수 —'], ['kpi-prev-vs-cur', '전월 대비 —%'], ['kpi-3m-vs-cur', '평균 대비 —%']]
      .forEach(function (p) { var el = document.getElementById(p[0]); if (el) el.textContent = p[1]; });
    // 색은 renderCardKpis 가 칠한 두 칸만 원래 회색으로 (나머지는 HTML 인라인 색을 지키기 위해 안 건드림)
    ['kpi-prev-vs-cur', 'kpi-3m-vs-cur'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.style.color = '#9ca3af';
    });
    ['acc-card-pie', 'acc-card-line'].forEach(function (id) {
      var c = document.getElementById(id);
      if (c && c.getContext) { try { c.getContext('2d').clearRect(0, 0, c.width, c.height); } catch (e) {} }
    });
    var fb = document.getElementById('acc-card-feedback-list');
    if (fb) fb.innerHTML = '<li>' + (en ? 'Connect the card company feed to see analysis here.'
                                        : '카드사 연동을 붙이면 이 자리에 분석이 표시됩니다.') + '</li>';
  }

  // 🆕 법인카드 섹션을 열면 자동 조회 — 버튼 안 눌러도 지출내역 바로 표시
  (function(){
    var d = document.getElementById('acc-corpcard');
    if (d && !d.__cardAutoBound) {
      d.__cardAutoBound = true;
      // 월 선택 기본값 = 이번 달(KST) — admin.html 의 하드코딩(2026-04)을 덮는다
      var mEl = document.getElementById('acc-card-month');
      if (mEl) {
        mEl.value = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
        // 🆕 (2026-08-15) 월을 바꾸면 바로 조회한다. 예전엔 [조회]를 눌러야 반영돼서
        //   달만 바꾸고 「안 바뀐다」로 읽혔다. (월은 서버 조회라 renderCardTable 로는 안 된다)
        mEl.addEventListener('change', function () { window.cardLoad(); });
      }
      d.addEventListener('toggle', function(){ if (d.open) window.cardLoad(); });
      if (d.open) window.cardLoad();
    }
  })();

  function generateCardSampleData() {
    // 한도 ₩1,000,000에 맞춰 모든 거래 금액 축소
    const merchants = [
      { name: '스타벅스 강남R점',   cat: '식대',     range: [4500, 18000] },
      { name: '카카오T 택시',       cat: '교통',     range: [6000, 22000] },
      { name: '배민 한식주문',      cat: '식대',     range: [9000, 32000] },
      { name: 'AWS 클라우드',       cat: '구독',     range: [25000, 80000] },
      { name: 'Google Ads 광고',    cat: '마케팅',   range: [30000, 120000] },
      { name: 'Cloudflare Workers', cat: '구독',     range: [8000, 25000] },
      { name: '오피스디포',         cat: '사무용품', range: [8000, 45000] },
      { name: 'SKT 통신요금',       cat: '통신',     range: [38000, 65000] },
      { name: '교보문고 영등포',    cat: '사무용품', range: [12000, 35000] },
      { name: 'Facebook Ads',       cat: '마케팅',   range: [40000, 150000] },
      { name: 'GS칼텍스 주유',      cat: '교통',     range: [30000, 60000] },
      { name: '쿠팡 사무용품',      cat: '사무용품', range: [8000, 38000] },
      { name: '회식 — 강남고기집',  cat: '복리후생', range: [55000, 120000] },
      { name: 'Figma Pro',          cat: '구독',     range: [22000, 38000] },
      { name: '마이크로소프트 365', cat: '구독',     range: [12000, 28000] },
      { name: '카카오톡 비즈채널',  cat: '마케팅',   range: [20000, 80000] },
      { name: '직원 선물 (기프티콘)', cat: '복리후생', range: [10000, 50000] },
      { name: '문구점 — 모나미',    cat: '사무용품', range: [3000, 15000] },
    ];
    const current = []; let id = 1;
    let runningTotal = 0;
    const MONTHLY_LIMIT = 1000000; // 한도
    for (let day = 1; day <= 28 && runningTotal < MONTHLY_LIMIT * 0.92; day++) {
      const count = Math.random() < 0.35 ? 0 : (Math.random() < 0.7 ? 1 : 2);
      for (let j = 0; j < count; j++) {
        const m = merchants[Math.floor(Math.random() * merchants.length)];
        const amount = Math.round(m.range[0] + Math.random() * (m.range[1] - m.range[0]));
        if (runningTotal + amount > MONTHLY_LIMIT) break;
        runningTotal += amount;
        const hh = String(8 + Math.floor(Math.random()*12)).padStart(2,'0');
        const mm = String(Math.floor(Math.random()*60)).padStart(2,'0');
        current.push({ id: id++, datetime: `2026-04-${String(day).padStart(2,'0')} ${hh}:${mm}`, merchant: m.name, category: m.cat, amount, memo: '' });
      }
    }
    // 6개월 추이 (₩1M 한도 내에서 60~95% 사용률)
    return {
      current,
      history: {
        '2025-11': 720000, '2025-12': 880000,
        '2026-01': 650000, '2026-02': 920000,
        '2026-03': 780000, '2026-04': runningTotal,
      },
    };
  }

  function renderCardKpis() {
    if (!_cardData) return;
    const cur = _cardData.current.reduce((s, t) => s + t.amount, 0);
    const months = Object.keys(_cardData.history).sort();
    const prev = _cardData.history[months[months.length - 2]] || 0;
    const last3 = months.slice(-4, -1).map(m => _cardData.history[m]);
    const avg3m = last3.length ? Math.round(last3.reduce((s, v) => s + v, 0) / last3.length) : 0;

    const $el = (id) => document.getElementById(id);
    $el('kpi-cur-month').textContent = '₩' + cur.toLocaleString('ko-KR');
    $el('kpi-cur-month-sub').textContent = '건수 ' + _cardData.current.length;
    $el('kpi-prev-month').textContent = '₩' + prev.toLocaleString('ko-KR');
    const vsPrev = prev ? ((cur - prev) / prev * 100) : 0;
    $el('kpi-prev-vs-cur').textContent = '전월 대비 ' + (vsPrev >= 0 ? '+' : '') + vsPrev.toFixed(1) + '%';
    $el('kpi-prev-vs-cur').style.color = vsPrev > 10 ? '#dc2626' : vsPrev < -5 ? '#059669' : '#6b7280';
    $el('kpi-3m-avg').textContent = '₩' + avg3m.toLocaleString('ko-KR');
    const vs3m = avg3m ? ((cur - avg3m) / avg3m * 100) : 0;
    $el('kpi-3m-vs-cur').textContent = '평균 대비 ' + (vs3m >= 0 ? '+' : '') + vs3m.toFixed(1) + '%';
    $el('kpi-3m-vs-cur').style.color = vs3m > 15 ? '#dc2626' : vs3m < -10 ? '#059669' : '#6b7280';

    const catSums = {};
    _cardData.current.forEach(t => { catSums[t.category] = (catSums[t.category] || 0) + t.amount; });
    let alerts = 0;
    for (const c in catSums) {
      const meta = CARD_CATEGORIES[c];
      if (meta && catSums[c] > meta.threshold) alerts++;
    }
    $el('kpi-alerts').textContent = alerts + '건';
    $el('kpi-alerts').style.color = alerts > 2 ? '#dc2626' : alerts > 0 ? '#d97706' : '#059669';
  }

  /* 📊 Chart.js 지연 로드 (2026-08-15)
     [무슨 일이 있었나] 법인카드 화면의 차트 두 개가 **영영 안 그려졌다.** KPI 숫자는
     채워지는데 차트만 빈칸이라 «데이터가 없나?» 싶은 상태였다(라이브 실측).
     원인: Chart.js 로더가 **대시보드 위젯 안에만** 있다. 법인카드를 먼저 열면
     Chart 가 undefined 라 renderCardCharts 가 조용히 return 하고 **다시 시도하지 않는다.**
     (파일은 이미 저장소에 있다 — /vendor/chartjs/chart.umd.min.js 205KB)
     → 여기서도 같은 방식으로 한 번 받아 두고 다시 그린다. 우리 서버 우선, 실패 시 CDN. */
  var _chartWait = 0;
  function ensureChartJs(after) {
    if (typeof Chart !== 'undefined') { after(); return; }
    if (window._admChartLoading) {            // 다른 위젯이 이미 받는 중이면 기다렸다 그린다
      if (_chartWait++ > 20) return;          // 6초까지만 — 무한 재시도 방지
      setTimeout(function () { ensureChartJs(after); }, 300);
      return;
    }
    window._admChartLoading = true;
    var s = document.createElement('script');
    s.src = '/vendor/chartjs/chart.umd.min.js';
    s.onload = function () { window._admChartLoading = false; try { after(); } catch (e) {} };
    s.onerror = function () {
      window._admChartLoading = false;
      if (window._admChartCdnTried) return;
      window._admChartCdnTried = true;        // 우리 서버에서 못 받으면 CDN 으로 한 번만 물러선다
      var c = document.createElement('script');
      c.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      c.onload = function () { try { after(); } catch (e) {} };
      document.head.appendChild(c);
    };
    document.head.appendChild(s);
  }

  function renderCardCharts() {
    if (!_cardData) return;
    if (typeof Chart === 'undefined') { ensureChartJs(renderCardCharts); return; }
    const catSums = {};
    _cardData.current.forEach(t => { catSums[t.category] = (catSums[t.category] || 0) + t.amount; });
    const labels = Object.keys(catSums);
    const data = labels.map(l => catSums[l]);
    const colors = labels.map(l => (CARD_CATEGORIES[l] && CARD_CATEGORIES[l].color) || '#9ca3af');

    if (_cardCharts.pie) _cardCharts.pie.destroy();
    const pieCtx = document.getElementById('acc-card-pie');
    if (pieCtx) {
      _cardCharts.pie = new Chart(pieCtx.getContext('2d'), {
        type: 'doughnut',
        data: { labels: labels.map(l => ((CARD_CATEGORIES[l] && CARD_CATEGORIES[l].icon) || '•') + ' ' + l), datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 12 } },
            tooltip: { callbacks: { label: (c) => c.label + ': ₩' + c.parsed.toLocaleString('ko-KR') } }
          }
        }
      });
    }

    const months = Object.keys(_cardData.history).sort();
    const monthData = months.map(m => _cardData.history[m]);
    if (_cardCharts.line) _cardCharts.line.destroy();
    const lineCtx = document.getElementById('acc-card-line');
    if (lineCtx) {
      _cardCharts.line = new Chart(lineCtx.getContext('2d'), {
        type: 'line',
        data: { labels: months, datasets: [{ label: '월별 사용액 (KRW)', data: monthData, borderColor: '#0f4c81', backgroundColor: 'rgba(15,76,129,0.15)', fill: true, tension: 0.35, pointRadius: 5, pointBackgroundColor: '#0f4c81' }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { y: { ticks: { callback: (v) => '₩' + (v/1000000).toFixed(1) + 'M' } } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => '₩' + c.parsed.y.toLocaleString('ko-KR') } } }
        }
      });
    }
  }

  /* 🔃 법인카드 표 정렬 (2026-08-16) — 급여표(.pr-th)와 같은 방식·같은 CSS 를 쓴다.
     헤더 클릭 = 내림→오름→해제 토글, Shift+클릭 = 2차·3차 키 추가.
     비어 있으면 기본값(일시 최신순) — 예전 동작 그대로다. */
  let _cardSort = [];
  const _CARD_SORT_LABELS_KO = { datetime: '일시', merchant: '가맹점', category: '카테고리', amount: '금액', vs: '평균 대비' };
  const _CARD_SORT_LABELS_EN = { datetime: 'Date', merchant: 'Merchant', category: 'Category', amount: 'Amount', vs: 'vs Avg' };

  function _compareCardRows(a, b) {
    for (const s of _cardSort) {
      const va = a['_s_' + s.key], vb = b['_s_' + s.key];
      let cmp;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), 'ko');
      if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  }

  window.onCardHeaderClick = function(key, shiftKey) {
    const idx = _cardSort.findIndex(s => s.key === key);
    if (shiftKey) {
      if (idx === -1) _cardSort.push({ key, dir: 'desc' });
      else if (_cardSort[idx].dir === 'desc') _cardSort[idx].dir = 'asc';
      else _cardSort.splice(idx, 1);
    } else {
      if (_cardSort.length === 1 && _cardSort[0].key === key) {
        if (_cardSort[0].dir === 'desc') _cardSort[0].dir = 'asc';
        else _cardSort = [];
      } else _cardSort = [{ key, dir: 'desc' }];
    }
    renderCardTable();
  };

  window.clearCardSort = function() { _cardSort = []; renderCardTable(); };

  function _updateCardSortArrows() {
    const L = (typeof adminLang !== 'undefined' && adminLang === 'en');
    document.querySelectorAll('#acc-card-thead .pr-th').forEach(th => {
      const arrow = th.querySelector('.pr-arrow');
      th.classList.remove('pr-active');
      if (arrow) arrow.textContent = '↕';
      const idx = _cardSort.findIndex(s => s.key === th.getAttribute('data-sort-key'));
      if (idx !== -1) {
        th.classList.add('pr-active');
        if (arrow) arrow.textContent = (_cardSort[idx].dir === 'asc' ? '▲' : '▼') + (_cardSort.length > 1 ? String(idx + 1) : '');
      }
    });
    const statusEl = document.getElementById('acc-card-sort-status');
    if (!statusEl) return;
    if (_cardSort.length === 0) {
      // 정렬을 안 걸었을 때도 «지금 무슨 순서인지» 는 말해 준다(빈칸이면 사용자가 모른다)
      statusEl.innerHTML = '<span style="color:#9ca3af">' + (L ? 'Sort: Date (newest) · click a header to sort, Shift+click to add' : '정렬: 일시 최신순 · 헤더를 누르면 정렬, Shift+클릭으로 2차 정렬') + '</span>';
      return;
    }
    const labels = L ? _CARD_SORT_LABELS_EN : _CARD_SORT_LABELS_KO;
    const chips = _cardSort.map((s, i) =>
      `<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-weight:600">${i + 1}. ${labels[s.key] || s.key} ${s.dir === 'asc' ? '▲' : '▼'}</span>`
    ).join('');
    statusEl.innerHTML = '<span style="color:#6b7280">' + (L ? 'Sort:' : '정렬:') + '</span>' + chips
      + '<button onclick="clearCardSort()" style="background:#fff;border:1px solid #d1d5db;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;color:#6b7280;margin-left:4px">'
      + (L ? '✕ Clear' : '✕ 해제') + '</button>';
  }

  window.renderCardTable = function() {
    if (!_cardData) return;
    const tbody = document.getElementById('acc-card-rows');
    if (!tbody) return;
    // 표 바로 위에 '미연동/예시 데이터' 경고를 한 번만 띄운다
    try {
      const host = tbody.closest('table') ? tbody.closest('table').parentNode : null;
      if (host) {
        let b = document.getElementById('acc-card-sample-banner');
        const html = _cardSampleBanner();
        if (!html) { if (b) b.remove(); }
        else {
          if (!b) { b = document.createElement('div'); b.id = 'acc-card-sample-banner'; host.insertBefore(b, host.firstChild); }
          b.innerHTML = html;
        }
      }
    } catch (e) {}
    const catFilter = document.getElementById('acc-card-cat') ? document.getElementById('acc-card-cat').value : '';
    const search = ((document.getElementById('acc-card-search') && document.getElementById('acc-card-search').value) || '').toLowerCase();
    // 🆕 (2026-08-15) 「평균 대비」 필터 — 고액/평균↑ 건만 골라 보려는 요청.
    //   표에 찍는 판정과 «같은 함수»를 써야 한다. 여기서 따로 계산하면 필터와 배지가 어긋난다.
    const vsFilter = (document.getElementById('acc-card-vs') && document.getElementById('acc-card-vs').value) || '';
    // 🌐 부가세 신고용 필터 — 해외/국내/접대비확인. 카테고리와 «다른 축»이라 셀렉트를 따로 뒀다
    const flagFilter = (document.getElementById('acc-card-flag') && document.getElementById('acc-card-flag').value) || '';
    const catCounts = {};
    _cardData.current.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
    const vsOf = (t) => {
      const meta = CARD_CATEGORIES[t.category] || CARD_CATEGORIES['기타'];
      const catAvg = (meta.avg / Math.max(catCounts[t.category] || 1, 1));
      return t.amount > meta.threshold ? 'high' : t.amount > catAvg * 1.5 ? 'over' : 'normal';
    };
    const _VS_RANK = { high: 2, over: 1, normal: 0 };

    /* 🔃 (2026-08-16) 정렬용 값(_s_*)을 «먼저» 붙인 뒤 정렬한다 — 평균 대비는 화면 라벨
       (고액/평균↑/정상)로 문자 정렬하면 이모지 코드포인트 순이 되어 순서가 엉킨다.
       등급*1e12 + 금액 → 한 번 클릭으로 «고액 먼저, 그 안에서 큰 금액순».
       ⚠️ 등급 판정은 위 vsOf 하나만 쓴다 — 필터·배지·정렬이 어긋나면 안 된다.
       값은 사본에만 붙이고 원본(_cardData.current)은 그대로 둔다(메모 편집이 원본을 본다). */
    const rows = _cardData.current.filter(t => {
      if (catFilter && t.category !== catFilter) return false;
      if (search && !(t.merchant.toLowerCase().includes(search))) return false;
      if (vsFilter && vsOf(t) !== vsFilter) return false;
      if (flagFilter === 'overseas'  && !t.overseas)  return false;
      if (flagFilter === 'domestic'  &&  t.overseas)  return false;
      if (flagFilter === 'entertain' && !t.entertain) return false;
      return true;
    }).map(t => {
      const st = vsOf(t);
      return Object.assign({}, t, {
        _meta: CARD_CATEGORIES[t.category] || CARD_CATEGORIES['기타'], _st: st,
        _s_datetime: String(t.datetime || ''), _s_merchant: String(t.merchant || ''),
        _s_category: String(t.category || ''), _s_amount: Number(t.amount) || 0,
        _s_vs: _VS_RANK[st] * 1e12 + (Number(t.amount) || 0),
      });
    });
    if (_cardSort.length > 0) rows.sort(_compareCardRows);
    else rows.sort((a, b) => b.datetime.localeCompare(a.datetime));   // 기본 = 일시 최신순(예전 동작)
    _updateCardSortArrows();

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:30px;text-align:center;color:#9ca3af">조건에 맞는 거래가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(t => {
      const meta = t._meta;
      const st = t._st;                       // 위 map 에서 vsOf 로 이미 판정 — 재계산 금지
      const vs = st === 'high' ? '🔴 고액' : st === 'over' ? '🟡 평균↑' : '🟢 정상';
      const color = st === 'high' ? '#dc2626' : st === 'over' ? '#d97706' : '#059669';
      const safeM = String(t.merchant).replace(/[<>]/g, '');
      /* 🌐 해외 = 부가세 매입세액 «불공제» 가능성. ⚠️ = 기업업무추진비(접대비) 확인 필요.
         둘 다 서버(corpcard-sync.ts)가 판정해서 내려준다 — 화면에서 다시 계산하지 않는다. */
      const flags = (t.overseas ? '<span title="해외 결제 — 세금계산서 없음, 부가세 매입세액 불공제 가능" style="margin-left:6px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">🌐 해외</span>' : '')
        + (t.entertain ? '<span title="건당 3만원 초과 식대 — 외부인 동석이면 기업업무추진비(접대비)입니다. 확인해 주세요" style="margin-left:4px;background:#fffbeb;color:#b45309;border:1px solid #fde68a;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:700">⚠️ 접대비?</span>' : '');
      return `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px 10px;color:#6b7280;font-family:MangoiHanSC,Consolas,monospace;font-size:11px">${t.datetime}</td>
        <td style="padding:8px 10px;color:#111;font-weight:600">${safeM}${flags}</td>
        <td style="padding:8px 10px"><span style="background:${meta.color}22;color:${meta.color};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${meta.icon} ${t.category}</span></td>
        <td style="padding:8px 10px;text-align:right;font-weight:800;color:${color};font-family:MangoiHanSC,Consolas,monospace">₩${t.amount.toLocaleString('ko-KR')}</td>
        <td style="padding:8px 10px;color:${color};font-size:11px;font-weight:700">${vs}</td>
        <td style="padding:8px 10px;text-align:center"><button onclick="cardEditMemo(${t.id})" style="padding:3px 8px;font-size:11px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;cursor:pointer">📝</button></td>
      </tr>`;
    }).join('');
  };

  window.cardEditMemo = function(id) {
    if (!_cardData) return;
    const t = _cardData.current.find(x => x.id === id);
    if (!t) return;
    const memo = prompt('메모 입력 (지출 사유, 영수증 번호 등)', t.memo || '');
    if (memo === null) return;
    t.memo = memo.trim();
    // ⚠️ (2026-08-03) 예전엔 결과를 버리는 fire-and-forget 이었다. 서버에 라우트가 없어
    //   (라이브 404) 메모는 새로고침하면 사라지는데 사용자는 저장된 줄 알았다.
    (async () => {
      let saved = false;
      try {
        const r = await fetch('/api/admin/corpcard/memo', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, memo: t.memo })
        });
        saved = r.ok;
      } catch (e) { saved = false; }
      if (!saved) {
        alert('⚠️ 메모가 서버에 저장되지 않았습니다 (미연동).\n\n'
          + '새로고침하면 사라집니다.\n\n'
          + 'Memo was not saved to the server — it will disappear on reload.');
      }
    })();
  };

  function renderCardFeedback() {
    if (!_cardData) return;
    const feedback = [];
    const cur = _cardData.current.reduce((s, t) => s + t.amount, 0);
    const months = Object.keys(_cardData.history).sort();
    const prev = _cardData.history[months[months.length - 2]] || 0;
    const last3 = months.slice(-4, -1).map(m => _cardData.history[m]);
    const avg3m = last3.length ? last3.reduce((s, v) => s + v, 0) / last3.length : 0;

    if (prev) {
      const diff = ((cur - prev) / prev * 100);
      if (diff > 20) feedback.push(`⚠️ <b>전월 대비 ${diff.toFixed(0)}% 증가</b> (₩${prev.toLocaleString('ko-KR')} → ₩${cur.toLocaleString('ko-KR')}). 마케팅·강사료 카테고리 검토 필요`);
      else if (diff < -10) feedback.push(`✅ 전월 대비 ${Math.abs(diff).toFixed(0)}% 절감 — 비용 통제 양호`);
      else feedback.push(`📊 전월 대비 ${diff>=0?'+':''}${diff.toFixed(1)}% — 정상 범위`);
    }
    if (avg3m) {
      const diff = ((cur - avg3m) / avg3m * 100);
      if (diff > 25) feedback.push(`🔥 <b>3개월 평균 대비 ${diff.toFixed(0)}% 초과</b> — 일회성 지출인지 확인 필요`);
      else feedback.push(`📈 3개월 평균(₩${Math.round(avg3m).toLocaleString('ko-KR')}) 대비 ${diff>=0?'+':''}${diff.toFixed(1)}%`);
    }
    const catSums = {};
    _cardData.current.forEach(t => { catSums[t.category] = (catSums[t.category] || 0) + t.amount; });
    for (const c in catSums) {
      const meta = CARD_CATEGORIES[c];
      if (meta && catSums[c] > meta.threshold) {
        const over = ((catSums[c] - meta.threshold) / meta.threshold * 100);
        feedback.push(`🚨 <b>${meta.icon} ${c}</b>: 임계값(₩${meta.threshold.toLocaleString('ko-KR')}) 대비 ${over.toFixed(0)}% 초과 — ₩${catSums[c].toLocaleString('ko-KR')}`);
      }
    }
    let topCat = null, topVal = 0;
    for (const c in catSums) { if (catSums[c] > topVal) { topCat = c; topVal = catSums[c]; } }
    if (topCat && cur) {
      const pct = (topVal / cur * 100);
      feedback.push(`💎 가장 큰 지출: <b>${CARD_CATEGORIES[topCat].icon} ${topCat}</b> ₩${topVal.toLocaleString('ko-KR')} (전체의 ${pct.toFixed(0)}%)`);
    }
    const big = _cardData.current.filter(t => t.amount >= 500000).length;
    if (big > 0) feedback.push(`💰 단건 ₩500,000 이상 거래: <b>${big}건</b> — 영수증·세금계산서 확인 권장`);
    feedback.push(`💡 <b>AI 추천</b>: 마케팅 광고비는 ROAS(광고 효율) 측정 후 조정 권장. 식대는 전월 대비 ${prev?(((cur-prev)/prev*100)>0?'증가':'감소'):'-'} 추세`);

    document.getElementById('acc-card-feedback-list').innerHTML = feedback.map(f => `<li>${f}</li>`).join('');
  }

  window.cardExportExcel = function() {
    if (!_cardData) { alert('먼저 거래내역을 동기화해 주세요.'); return; }
    const rows = _cardData.current;
    /* 🌐/⚠️ 열을 함께 내보낸다 — 회계담당이 분기 부가세 신고 때 엑셀에서 바로 걸러 쓴다.
       (화면 필터는 적용하지 않는다. 전체를 주고 엑셀에서 거르는 편이 실수가 적다) */
    const csv = ['일시,가맹점,카테고리,금액(KRW),국내/해외,접대비확인,메모'].concat(
      rows.map(t => [t.datetime, '"' + t.merchant.replace(/"/g,'""') + '"', t.category, t.amount,
        (t.overseas ? '해외' : '국내'), (t.entertain ? '확인필요' : ''),
        '"' + (t.memo||'').replace(/"/g,'""') + '"'].join(','))
    ).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '법인카드_사용내역_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ━━━━━━━━━━ 🔐 권한 설정 (역할별 매트릭스) ━━━━━━━━━━
  const ROLE_KEYS = ['hq_exec','hq_mgr','hq_teacher','franchise','branch','agency'];
  // 기능 그룹 → 각 행
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  🔐 통합 권한 매트릭스 — 관리자 사이드바의 "모든" 메뉴(73개)를 역할별로 제어.
  //     • id 가 'card-…' 인 행은 실제 사이드바 카드(id)에 1:1 로 자동 반영됩니다.
  //     • 시맨틱 id(dashboard, students_list …)는 여러 카드를 묶어서 제어(MATRIX_CARD_MAP).
  //     • franchise(지사본사) 기본값은 미지정 시 지사(branch)를 상속(하단 backfill).
  //  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const PERM_FEATURES = [
    { group_ko: '🏠 대시보드 · 통계', group_en: '🏠 Dashboard · Analytics', items: [
      { id: 'dashboard',        name_ko: '메인 대시보드',                 name_en: 'Main Dashboard',            def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'✅', student:'✅' } },
      { id: 'today_kpi',        name_ko: '오늘의 핵심 지표 (매출·출석·결석·신규)', name_en: 'Today KPIs',       def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'👁️', parent:'❌', student:'❌' } },
      { id: 'kpi_dashboard',    name_ko: '운영 대시보드 KPI (8대 지표)',   name_en: 'Operations KPI Dashboard',  def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'realtime_class',   name_ko: '실시간 수업 현황',              name_en: 'Live Class Status',         def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'👁️', parent:'❌', student:'❌' } },
      { id: 'finance_realtime', name_ko: '실시간 재무 (수입·지출·손익)',   name_en: 'Realtime Finance',          def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'learning_insights',name_ko: '학습 인사이트 (위험도·세그먼트)', name_en: 'Learning Insights',        def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'ai_insights_hub',  name_ko: 'AI 인사이트 대시보드',           name_en: 'AI Insights Dashboard',     def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
    ]},
    { group_ko: '👨‍🎓 학생 · 학부모 관리', group_en: '👨‍🎓 Student · Parent', items: [
      { id: 'students_list',    name_ko: '학생 목록·상세보기',            name_en: 'Student List · Details',    def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'👁️', parent:'❌', student:'❌' } },
      { id: 'students_unified', name_ko: '통합 학생관리',                 name_en: 'Unified Student Mgmt',      def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'👁️', parent:'❌', student:'❌' } },
      { id: 'students_self',    name_ko: '내 학습 정보 조회',             name_en: 'My Learning Info',          def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'❌', parent:'✅', student:'✅' } },
      { id: 'ai_student_analysis', name_ko: 'AI 학습 분석 (Llama 3.3)',   name_en: 'AI Learning Analysis',      def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'enrollment',       name_ko: '수강신청 관리',                 name_en: 'Enrollment Management',     def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', branch:'✅', agency:'✅', parent:'👁️', student:'👁️' } },
      { id: 'card-family-mgmt', name_ko: '가족·형제 계정 관리',           name_en: 'Family / Sibling Accounts', def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'✅', parent:'✅', student:'❌' } },
      { id: 'card-counseling-booking', name_ko: '상담 예약 관리',         name_en: 'Counseling Booking',        def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'✅', parent:'✅', student:'❌' } },
      { id: 'card-referral',    name_ko: '친구추천·리퍼럴',               name_en: 'Referral',                  def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'✅', parent:'✅', student:'❌' } },
      { id: 'card-parent-digest', name_ko: '학부모 주간 다이제스트',      name_en: 'Parent Weekly Digest',      def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'✅', student:'❌' } },
      { id: 'card-parent-faq-bot', name_ko: '학부모 FAQ 봇',             name_en: 'Parent FAQ Bot',            def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'✅', student:'❌' } },
      { id: 'card-alumni',      name_ko: '졸업생·동문 관리',              name_en: 'Alumni',                    def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'✅' } },
    ]},
    { group_ko: '🧑‍🏫 강사 관리', group_en: '🧑‍🏫 Teacher Management', items: [
      { id: 'teachers_list',    name_ko: '강사 목록·평가',                name_en: 'Teacher List · Evaluation', def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', branch:'✅', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'teacher_payroll',  name_ko: '강사 급여·정산 (교사=본인만)',   name_en: 'Teacher Payroll · Settle',  def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-mbti-mgmt',   name_ko: '강사 MBTI·성향 매칭',           name_en: 'Teacher MBTI / Fit',        def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-supervisor',  name_ko: '수업 감독·품질 모니터링',        name_en: 'Class Supervision / QA',    def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-report-forms',name_ko: '리포트 양식 관리',              name_en: 'Report Form Templates',     def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'❌', student:'❌' } },
      { id: 'card-class-ratings', name_ko: '⭐ 학생 수업 평가 (별점 리포트) 🆕', name_en: 'Student Class Ratings', def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', franchise:'👁️', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-cafe24-lists', name_ko: '🗂 카페24 명부(직원·교재) 🆕', name_en: 'Cafe24 Records', def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', franchise:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-teacher-link', name_ko: '🔗 강사 계정 연결 🆕', name_en: 'Link Teacher Accounts', def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', franchise:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-schedule-requests', name_ko: '📅 수업 연기·변경 요청 🆕', name_en: 'Postpone/Reschedule Requests', def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', franchise:'👁️', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-class-audit', name_ko: '📜 수업 변경 이력 🆕', name_en: 'Class Change History', def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', franchise:'👁️', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
    ]},
    { group_ko: '📝 평가 · 리포트', group_en: '📝 Evaluation · Reports', items: [
      { id: 'students_eval',    name_ko: '평가서 작성·수정',              name_en: 'Evaluation Create · Edit',  def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-ai-eval-draft', name_ko: 'AI 평가서 초안 생성',         name_en: 'AI Evaluation Draft',       def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-ai-lesson-report', name_ko: 'AI 수업 리포트',           name_en: 'AI Lesson Report',          def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'👁️', student:'👁️' } },
      { id: 'card-monthly-report', name_ko: '월간 학습 리포트',           name_en: 'Monthly Learning Report',   def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'✅', student:'✅' } },
      { id: 'card-comparison-report', name_ko: '또래 비교 리포트',        name_en: 'Peer Comparison Report',    def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'✅', student:'❌' } },
      { id: 'card-lesson-log',  name_ko: '수업 일지 기록',                name_en: 'Lesson Log',                def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'✅', student:'✅' } },
    ]},
    { group_ko: '💰 회계 · 정산 · 포인트', group_en: '💰 Accounting · Settlement', items: [
      { id: 'student_payments', name_ko: '학생 결제 내역',                name_en: 'Student Payment History',   def: { hq_exec:'✅', hq_mgr:'👁️', hq_teacher:'❌', branch:'✅', agency:'👁️', parent:'❌', student:'❌' } },
      { id: 'refunds',          name_ko: '환불·취소 처리',                name_en: 'Refund · Cancel',           def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'✅', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'recurring_billing',name_ko: '정기결제 자동화',               name_en: 'Recurring Billing',         def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'auto_dunning',     name_ko: '미납 자동 추적 (D-1/7/14)',      name_en: 'Auto Dunning',              def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'accounting_reports', name_ko: '회계 리포트 다운로드',         name_en: 'Accounting Report Download',def: { hq_exec:'✅', hq_mgr:'👁️', hq_teacher:'❌', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'corpcard',         name_ko: '법인카드 사용내역',             name_en: 'Corporate Card Usage',      def: { hq_exec:'✅', hq_mgr:'❌', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'financials',       name_ko: '손익·재무제표',                 name_en: 'P&L · Financial Stmt',      def: { hq_exec:'✅', hq_mgr:'❌', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'points_gift',      name_ko: '포인트·기프트콘 관리',           name_en: 'Points · Gifticon',         def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', branch:'✅', agency:'👁️', parent:'❌', student:'❌' } },
    ]},
    { group_ko: '🎬 교육 콘텐츠 · 학습', group_en: '🎬 Content · Learning', items: [
      { id: 'recordings_view',  name_ko: '수업 녹화본 조회',              name_en: 'Class Recordings View',     def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'👁️', parent:'✅', student:'✅' } },
      { id: 'card-review-quiz', name_ko: '🧠 복습퀴즈 출제 🆕',            name_en: 'Review Quiz Authoring',     def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'textbooks',        name_ko: '교재 콘텐츠 관리',              name_en: 'Textbook Content Mgmt',     def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'❌', parent:'👁️', student:'👁️' } },
      { id: 'voice_coaching',   name_ko: '음성 코칭 진도 (AI 발음)',       name_en: 'Voice Coaching Progress',   def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'👁️', agency:'❌', parent:'👁️', student:'👁️' } },
      { id: 'card-pronunciation', name_ko: 'AI 발음 클리닉',              name_en: 'Pronunciation Clinic',      def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'✅' } },
      { id: 'card-microlearn',  name_ko: '마이크로러닝 (5분 학습)',        name_en: 'Micro-learning',            def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'✅' } },
      { id: 'card-mini-toeic',  name_ko: '미니 토익·레벨 퀴즈',           name_en: 'Mini TOEIC / Quiz',         def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'✅' } },
      { id: 'card-video-dict',  name_ko: '영상 받아쓰기',                 name_en: 'Video Dictation',           def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'✅' } },
      { id: 'card-voice-diary', name_ko: '음성 일기',                    name_en: 'Voice Diary',               def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'👁️', student:'✅' } },
      { id: 'card-level-tests', name_ko: '레벨 테스트 관리',              name_en: 'Level Tests',               def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'✅' } },
      { id: 'card-homework',    name_ko: '숙제 관리',                    name_en: 'Homework',                  def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'✅', student:'✅' } },
      { id: 'card-badges-mgmt', name_ko: '배지·업적 관리',                name_en: 'Badges · Achievements',     def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'✅' } },
      { id: 'card-gallery',     name_ko: '학습 갤러리·전시',              name_en: 'Learning Gallery',          def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'✅', parent:'✅', student:'✅' } },
    ]},
    { group_ko: '🗓️ 수업 운영 · 출결', group_en: '🗓️ Class Ops · Attendance', items: [
      { id: 'card-timetable',   name_ko: '시간표·수업 일정',              name_en: 'Timetable',                 def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'✅', student:'✅' } },
      { id: 'card-room-invite', name_ko: '화상방 초대·입장 링크',          name_en: 'Room Invite Link',          def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'✅', parent:'❌', student:'❌' } },
      { id: 'card-praise-stats',name_ko: '칭찬 포인트 통계',              name_en: 'Praise Points Stats',       def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'👁️', student:'❌' } },
      { id: 'card-attendance-status', name_ko: '실시간 출결 현황',        name_en: 'Attendance Status',         def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'✅', student:'✅' } },
      { id: 'card-auto-attendance', name_ko: '자동 출석 체크',            name_en: 'Auto Attendance',           def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'✅', parent:'❌', student:'❌' } },
      { id: 'card-class-attendance', name_ko: '수업별 출석부',            name_en: 'Class Attendance Sheet',    def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'✅', parent:'❌', student:'❌' } },
      { id: 'card-calendar',    name_ko: '📅 캘린더 관리 🆕',              name_en: 'Calendar Management',       def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'❌', student:'❌' } },
      { id: 'all_schedules',    name_ko: '📅 전체 스케줄 🆕',              name_en: 'All Schedules',              def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'❌', student:'❌' } },
    ]},
    // 🆕 📚 자료실 — 대상별 방(사용설명서·동영상·매뉴얼). card-lib-* 는 사이드바 카드에 1:1 자동 반영
    { group_ko: '📚 자료실 (사용설명서 · 매뉴얼)', group_en: '📚 Library (Manuals)', items: [
      { id: 'card-lib-admin',   name_ko: '📕 관리자 자료실',              name_en: 'Admin Library',             def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-lib-teacher', name_ko: '👨‍🏫 강사 자료실',               name_en: 'Teacher Library',           def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-lib-branch',  name_ko: '🏢 지사 자료실',                name_en: 'Branch Library',            def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', franchise:'✅', branch:'✅', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-lib-agency',  name_ko: '🏬 대리점 자료실',              name_en: 'Agency Library',            def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', franchise:'✅', branch:'❌', agency:'✅', parent:'❌', student:'❌' } },
      { id: 'card-lib-student', name_ko: '🎒 학생·학부모 자료실',          name_en: 'Student · Parent Library',  def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'✅', student:'✅' } },
    ]},
    { group_ko: '📢 알림 · 커뮤니티 · 마케팅', group_en: '📢 Notify · Community · Marketing', items: [
      { id: 'community',        name_ko: '학원 게시판 (소식·FAQ) 작성',    name_en: 'Notice Board — write',      def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', branch:'✅', agency:'❌', parent:'👁️', student:'👁️' } },
      { id: 'card-community',   name_ko: '학부모·학생 커뮤니티',           name_en: 'Parent · Student Community',def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'✅', student:'✅' } },
      { id: 'card-notifications', name_ko: '인앱 알림 센터',              name_en: 'In-app Notifications',      def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'👁️', student:'👁️' } },
      { id: 'card-webpush-mgmt',name_ko: '웹푸시 발송 관리',              name_en: 'Web Push Management',       def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-popups-mgmt', name_ko: '팝업 공지 관리',                name_en: 'Popup Notices',             def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-poster-maker',name_ko: '포스터 만들기',                name_en: 'Poster Maker',              def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'kakao_blast',      name_ko: '카톡 공지 발송',                name_en: 'KakaoTalk Broadcast',       def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'✅', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'inquiries',        name_ko: '신규상담 처리',                 name_en: 'New Inquiries',             def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', branch:'✅', agency:'✅', parent:'❌', student:'❌' } },
      { id: 'nps_survey',       name_ko: '월간 NPS 설문',                 name_en: 'Monthly NPS Survey',        def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'marketing_studio', name_ko: '마케팅 스튜디오 (AI 카피·세그먼트)', name_en: 'Marketing Studio',      def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
    ]},
    // 🆕 수업 연기/변경 시간 제한 우회 권한 — 본사/강사는 언제든지 가능, 지사/대리점/학생은 24h/30분 룰 준수
    { group_ko: '📅 수업 변경 권한', group_en: '📅 Lesson Change Permissions', items: [
      { id: 'lesson_postpone_anytime', name_ko: '수업 연기 시간 무제한 (30분룰 우회)',
        name_en: 'Postpone Anytime (bypass 30-min rule)',
        def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'lesson_change_anytime',   name_ko: '수업 변경 시간 무제한 (24시간룰 우회)',
        name_en: 'Change Anytime (bypass 24-hour rule)',
        def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
    ]},
    { group_ko: '🔐 시스템 · 관리', group_en: '🔐 System · Admin', items: [
      { id: 'permissions',      name_ko: '권한 설정',                    name_en: 'Permission Settings',       def: { hq_exec:'✅', hq_mgr:'❌', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'audit_log',        name_ko: '감사 로그 조회',                name_en: 'Audit Log View',            def: { hq_exec:'✅', hq_mgr:'👁️', hq_teacher:'❌', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'franchise_mgmt',   name_ko: '가맹점·지사 관리',              name_en: 'Franchise · Branch Mgmt',   def: { hq_exec:'✅', hq_mgr:'❌', hq_teacher:'❌', franchise:'👁️', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-data-export', name_ko: '데이터 내보내기 (CSV·백업)',     name_en: 'Data Export',               def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-admin-alerts',name_ko: '관리자 경보·이상탐지',           name_en: 'Admin Alerts',              def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-admin-ghost', name_ko: '수업 관찰 (사용자 화면 미러링)',   name_en: 'Class Observation',                def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
      { id: 'card-admin-whisper', name_ko: '수업 위스퍼 (강사 실시간 코칭)', name_en: 'Class Whisper',            def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
    ]},
  ];

  // 🆕 '지사본사(franchise)' 역할 — 각 기능의 기본 권한을 자동 주입.
  //    명시값이 없으면 지사(branch) 권한을 상속(지사본부 = 지사 총괄 성격).
  PERM_FEATURES.forEach(g => g.items.forEach(it => {
    if (it.def && it.def.franchise === undefined) {
      it.def.franchise = (it.def.branch !== undefined) ? it.def.branch : '❌';
    }
  }));

  let _permMatrix = null;
  function loadPermMatrix() {
    try {
      const saved = localStorage.getItem('mangoi_perm_matrix');
      if (saved) {
        const parsed = JSON.parse(saved);
        // 🆕 이전에 저장된 매트릭스에 franchise 키가 없으면 기본값으로 backfill
        PERM_FEATURES.forEach(g => g.items.forEach(it => {
          if (!parsed[it.id]) parsed[it.id] = { ...it.def };
          else if (parsed[it.id].franchise === undefined) parsed[it.id].franchise = it.def.franchise;
        }));
        return parsed;
      }
    } catch {}
    // 기본값
    const m = {};
    PERM_FEATURES.forEach(g => g.items.forEach(it => { m[it.id] = { ...it.def }; }));
    return m;
  }
  function savePermMatrix() {
    try { localStorage.setItem('mangoi_perm_matrix', JSON.stringify(_permMatrix)); } catch {}
    // 백엔드에도 저장 (실 운영)
    fetch('/api/admin/permissions', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ matrix: _permMatrix })
    }).catch(() => {});
    pushAuditLog('권한 매트릭스 저장됨');
  }

  function renderPermMatrix() {
    if (!_permMatrix) _permMatrix = loadPermMatrix();
    const tbody = document.getElementById('role-perm-rows');
    if (!tbody) return;
    const en = (typeof adminLang !== 'undefined' && adminLang === 'en');
    const tip = en ? 'Click to cycle ✅ → 👁️ → ❌' : '클릭하여 ✅ → 👁️ → ❌ 순환';
    let html = '';
    PERM_FEATURES.forEach(g => {
      const groupLabel = en ? (g.group_en || g.group_ko || g.group || '') : (g.group_ko || g.group_en || g.group || '');
      html += `<tr class="group-row"><td colspan="7">${groupLabel}</td></tr>`;
      g.items.forEach(it => {
        const itemName = en ? (it.name_en || it.name_ko || it.name || '') : (it.name_ko || it.name_en || it.name || '');
        const state = _permMatrix[it.id] || it.def;
        html += `<tr>
          <td style="padding:8px 12px;color:#374151;border-bottom:1px solid #f3f4f6">${itemName}</td>` +
          ROLE_KEYS.map((r, idx) => {
            const cur = state[r] || '❌';
            const isHQ = r.startsWith('hq');
            const isLastHQ = (r === 'hq_teacher');
            const cls = ['perm-cell-wrap'];
            if (isHQ) cls.push('col-hq');
            if (isLastHQ) cls.push('col-divider');
            return `<td class="${cls.join(' ')}" style="padding:6px 8px;text-align:center;border-bottom:1px solid #f3f4f6"><button type="button" onclick="permCycle('${it.id}','${r}')" class="perm-cell" data-state="${cur}" title="${tip}">${cur}</button></td>`;
          }).join('') +
        `</tr>`;
      });
    });
    tbody.innerHTML = html;
  }

  window.permCycle = function(featureId, role) {
    if (!_permMatrix) _permMatrix = loadPermMatrix();
    const cur = (_permMatrix[featureId] && _permMatrix[featureId][role]) || '❌';
    const next = cur === '✅' ? '👁️' : cur === '👁️' ? '❌' : '✅';
    if (!_permMatrix[featureId]) _permMatrix[featureId] = {};
    _permMatrix[featureId][role] = next;
    savePermMatrix();
    renderPermMatrix();
    pushAuditLog(`${featureId} · ${role} 권한 변경: ${cur} → ${next}`);
  };

  window.permResetDefaults = function() {
    if (!confirm('모든 권한을 기본값으로 재설정합니다. 계속하시겠습니까?')) return;
    _permMatrix = {};
    PERM_FEATURES.forEach(g => g.items.forEach(it => { _permMatrix[it.id] = { ...it.def }; }));
    savePermMatrix();
    renderPermMatrix();
    pushAuditLog('권한 매트릭스 기본값 재설정');
  };

  window.permSaveAll = function() {
    savePermMatrix();
    alert('✅ 모든 권한이 저장되었습니다.');
  };

  window.permExport = function() {
    if (!_permMatrix) _permMatrix = loadPermMatrix();
    const blob = new Blob([JSON.stringify(_permMatrix, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mangoi_permissions_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 사용자 목록 (데모)
  const SAMPLE_USERS = [
    { uid:'admin',          name:'정우영',  role:'hq_exec',    branch:'본사 · 대표이사',  status:'active' },
    { uid:'cfo01',           name:'김재무',  role:'hq_exec',    branch:'본사 · CFO',       status:'active' },
    { uid:'ops_lead',        name:'박운영',  role:'hq_mgr',     branch:'본사 · 운영 매니저', status:'active' },
    { uid:'hq_t_001',        name:'강선생',  role:'hq_teacher', branch:'본사 · 마스터 강사', status:'active' },
    { uid:'hq_t_002',        name:'문선생',  role:'hq_teacher', branch:'본사 · 콘텐츠 강사', status:'active' },
    { uid:'branch_busan',    name:'이지점',  role:'branch', branch:'부산 지사',       status:'active', branch_id:'test_br_3'  /* 부산 */ },
    { uid:'branch_daegu',    name:'최지점',  role:'branch', branch:'대구 지사',       status:'active', branch_id:'test_br_8'  /* 대구 */ },
    { uid:'branch_incheon',  name:'정지점',  role:'branch', branch:'인천 지사',       status:'active', branch_id:'test_br_2'  /* 인천 */ },
    { uid:'agency_gn001',    name:'한대리',  role:'agency', branch:'강남점 대리점',   status:'active', agency_id:'test_ag_0',  parent_branch_id:'test_br_0'  /* 서울 강남구 */ },
    { uid:'agency_sc002',    name:'송대리',  role:'agency', branch:'서초점 대리점',   status:'active', agency_id:'test_ag_1',  parent_branch_id:'test_br_1'  /* 서울 서초구 */ },
    { uid:'agency_pj003',    name:'백대리',  role:'agency', branch:'판교점 대리점',   status:'pending', agency_id:'test_ag_4',  parent_branch_id:'test_br_4'  /* 경기 성남 */ },
    { uid:'parent_hong01',   name:'홍길순',  role:'parent', branch:'학부모 (홍길동 모)', status:'active' },
    { uid:'parent_kim02',    name:'김순영',  role:'parent', branch:'학부모 (김민수 모)', status:'active' },
    { uid:'parent_lee03',    name:'이수자',  role:'parent', branch:'학부모 (이지민 모)', status:'active' },
    { uid:'student_hong',    name:'홍길동',  role:'student', branch:'중2 · B1',       status:'active' },
    { uid:'student_kim',     name:'김민수',  role:'student', branch:'고1 · B2',       status:'active' },
    { uid:'student_lee',     name:'이지민',  role:'student', branch:'초5 · A2',       status:'active' },
    { uid:'student_park',    name:'박서연',  role:'student', branch:'중3 · B1',       status:'active' },
  ];

  const ROLE_LABEL = {
    hq_exec:    { icon:'👑', name:'본사·경영진', name_en:'HQ · Executive', color:'#dc2626' },
    hq_mgr:     { icon:'🛠️', name:'본사·관리자', name_en:'HQ · Manager',   color:'#ef4444' },
    hq_teacher: { icon:'👨‍🏫', name:'본사·교사',   name_en:'HQ · Teacher',   color:'#f87171' },
    hq:         { icon:'🏢', name:'본사',         name_en:'HQ',             color:'#ef4444' }, // 레거시 호환
    franchise:  { icon:'🏢', name:'지사본사',     name_en:'Franchise',      color:'#d97706' },
    branch:     { icon:'🏬', name:'지사',         name_en:'Branch',         color:'#f59e0b' },
    agency:     { icon:'🤝', name:'대리점',       name_en:'Agency',         color:'#10b981' },
    parent:     { icon:'👨‍👩', name:'학부모',       name_en:'Parent',         color:'#3b82f6' },
    student:    { icon:'🎓', name:'학생',         name_en:'Student',        color:'#a855f7' },
  };

  /* 👤 (2026-08-30 v4 제안서 12) 역할별 사용자 관리 — «실제» 계정으로 개편.
     [무엇이 문제였나] 이 표는 화면에 박아 둔 예시 18명(홍길동·김민수 …)을 그리고 있었다.
       실제 조직과 아무 관계가 없는데 «관리자 화면의 표» 라 사실처럼 읽힌다 — 그 표를 근거로
       「누가 무엇을 볼 수 있나」를 판단하면 그대로 오판이 된다.
     [고침] 서버가 admin_account 를 읽어 실무 6대 역할로 갈라 준다
       (경영진 · 한국 관리자 · 필리핀 관리자 · 대표지사 · 지사 · 대리점).
       ⛔ 학부모·학생은 넣지 않는다 — 관리자 포털에 로그인하지 않는다(사장님 지시).
       ⛔ 강사는 「강사 관리」가 정본이라 여기서 빼고, 몇 명인지 숫자만 밝힌다.
     ⚠️ 한국/필리핀은 admin_account.nationality 를 그대로 쓴다. 비어 있으면 «미지정» —
        이름·아이디로 추측하지 않는다(추측하면 조용히 틀린다).
     ⚠️ 판정은 «성공이라고 말했는가» 로 한다 — 종단 404 본문에는 ok 칸이 없어서
        `d.ok === false` 로만 거르면 그냥 통과하고 «사용자가 없다» 로 보인다(CLAUDE.md 2장). */
  var _roleUsersCache = null;

  window.renderUsersByRole = async function() {
    const L = (typeof adminLang !== 'undefined' && adminLang === 'en');
    const roleFilter = document.getElementById('role-filter')?.value || '';
    const search = (document.getElementById('role-user-search')?.value || '').toLowerCase();
    const tbody = document.getElementById('role-user-rows');
    const cardsEl = document.getElementById('role-counts');
    const noteEl = document.getElementById('role-counts-note');
    if (!tbody) return;

    if (!_roleUsersCache) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#9ca3af">' + (L ? 'Loading…' : '불러오는 중…') + '</td></tr>';
      try {
        const r = await fetch('/api/admin/reports/staff-roles', { credentials: 'include', cache: 'no-store' });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d || d.ok !== true || !Array.isArray(d.users)) {
          tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#b91c1c">'
            + (L ? 'Could not load the staff list. Please sign in again and retry.'
                 : '직원 명부를 불러오지 못했습니다. 다시 로그인한 뒤 시도해 주세요.') + '</td></tr>';
          return;
        }
        _roleUsersCache = d;
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="padding:20px;text-align:center;color:#b91c1c">'
          + (L ? 'Network error.' : '네트워크 오류입니다.') + '</td></tr>';
        return;
      }
    }
    const d = _roleUsersCache;

    // 역할 카드 — 서버가 준 순서 그대로(6대 실무 역할)
    if (cardsEl) {
      const COLORS = { exec:'#7f1d1d', mgr_kr:'#b91c1c', mgr_ph:'#c2410c', franchise:'#a16207', branch:'#b45309', agency:'#047857' };
      cardsEl.innerHTML = (d.roles || []).map(function (r) {
        return '<div style="background:#fff;border:1px solid #e5e7eb;padding:10px 12px;border-radius:8px">'
          + '<div style="font-size:11px;color:#6b7280">' + r.icon + ' ' + _esc(L ? r.en : r.ko) + '</div>'
          + '<div style="font-size:18px;font-weight:800;color:' + (COLORS[r.key] || '#334155') + '">'
          + r.count + (L ? '' : '명') + '</div></div>';
      }).join('');
    }
    if (noteEl) {
      const ex = d.excluded || {};
      const bits = [];
      if (ex.teachers) bits.push(L ? ('Teachers ' + ex.teachers + ' (see Teacher Management)') : ('강사 ' + ex.teachers + '명은 「강사 관리」에서 봅니다'));
      if (d.unassigned_region) bits.push(L ? ('Region unset ' + d.unassigned_region) : ('국적 미지정 관리자 ' + d.unassigned_region + '명'));
      if (ex.other) bits.push(L ? ('Unclassified ' + ex.other) : ('분류 밖 계정 ' + ex.other + '개'));
      noteEl.textContent = bits.join(' · ') + (bits.length ? ' · ' : '') + (L ? d.note_en : d.note_ko);
    }

    const rows = (d.users || []).filter(function (u) {
      if (roleFilter && u.role !== roleFilter) return false;
      if (search && (u.username + ' ' + (u.name || '')).toLowerCase().indexOf(search) < 0) return false;
      return true;
    });
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af">'
        + (L ? 'No user matches.' : '조건에 맞는 사용자가 없습니다.') + '</td></tr>';
      return;
    }
    const COLORS2 = { exec:'#7f1d1d', mgr_kr:'#b91c1c', mgr_ph:'#c2410c', franchise:'#a16207', branch:'#b45309', agency:'#047857' };
    tbody.innerHTML = rows.map(function (u) {
      const color = COLORS2[u.role] || '#6b7280';
      return '<tr style="border-bottom:1px solid #f3f4f6">'
        + '<td style="padding:8px 10px;font-family:MangoiHanSC,Consolas,monospace;color:#0ea5e9;font-size:11.5px">' + _esc(u.username) + '</td>'
        + '<td style="padding:8px 10px;color:#111;font-weight:600">' + _esc(u.name || '') + '</td>'
        + '<td style="padding:8px 10px;text-align:center"><span style="background:' + color + '22;color:' + color
        + ';padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">' + u.role_icon + ' ' + _esc(L ? u.role_en : u.role_ko) + '</span></td>'
        + '<td style="padding:8px 10px;color:#6b7280;font-size:11.5px">' + _esc(u.email || '—') + '</td>'
        /* «상태» 칸 — admin_account 에는 활성/정지 칸이 없다. 지어내지 않고 «—» 로 둔다
           (CLAUDE.md 2장 「측정할 수 없는 값을 그럴듯하게 채우고 싶을 때」). */
        + '<td style="padding:8px 10px;text-align:center;color:#9ca3af">—</td>'
        + '<td style="padding:8px 10px;text-align:center;color:#9ca3af;font-size:11px">'
        + _esc(u.nationality || (L ? 'region unset' : '국적 미지정')) + '</td>'
        + '</tr>';
    }).join('');
  };
  /* 다시 불러오기 — 직원 등록·삭제 뒤에 부른다 */
  window.reloadUsersByRole = function(){ _roleUsersCache = null; return window.renderUsersByRole(); };

  // ━━━━━━━━━━ ➕ 본사 직원 등록 (직급별) ━━━━━━━━━━
  const HQE_KEY = 'mangoi_hq_employees';
  function _hqeLoad() {
    try { return JSON.parse(localStorage.getItem(HQE_KEY) || '[]'); } catch (e) { return []; }
  }
  function _hqeSave(arr) {
    try { localStorage.setItem(HQE_KEY, JSON.stringify(arr.slice(0, 500))); } catch (e) {}
  }
  function _hqeMergeIntoSampleUsers() {
    // 기존 SAMPLE_USERS 에서 hq_* 직원 중 _origin='dynamic' 인 것 제거 후 다시 채움
    const dyn = _hqeLoad();
    // SAMPLE_USERS 는 const 이지만 push/splice 로 변경 가능
    for (let i = SAMPLE_USERS.length - 1; i >= 0; i--) {
      if (SAMPLE_USERS[i]._origin === 'dynamic') SAMPLE_USERS.splice(i, 1);
    }
    dyn.forEach(e => {
      SAMPLE_USERS.push({
        uid: e.uid, name: e.name, role: e.rank,
        branch: e.branch || (e.rank === 'hq_exec' ? '본사 · 경영진' : e.rank === 'hq_mgr' ? '본사 · 관리자' : '본사 · 교사'),
        status: 'active',
        email: e.email, phone: e.phone,
        _origin: 'dynamic'
      });
    });
  }
  function _hqeRefreshAll() {
    _hqeMergeIntoSampleUsers();
    // 카운트 갱신
    const all = _hqeLoad();
    const counts = { hq_exec:0, hq_mgr:0, hq_teacher:0 };
    SAMPLE_USERS.forEach(u => { if (counts[u.role] !== undefined) counts[u.role] += 1; });
    const setText = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = (typeof adminLang!=='undefined' && adminLang==='en' ? n + ' people' : n + '명'); };
    setText('cnt-hq_exec', counts.hq_exec);
    setText('cnt-hq_mgr', counts.hq_mgr);
    setText('cnt-hq_teacher', counts.hq_teacher);
    const c = document.getElementById('hqe-saved-count');
    if (c) c.textContent = (typeof adminLang!=='undefined' && adminLang==='en' ? 'Saved HQ employees: ' + all.length : '저장된 본사 직원: ' + all.length + '명');
    // 등록 목록 패널 갱신
    const list = document.getElementById('hqe-list');
    if (list) {
      if (all.length === 0) {
        list.innerHTML = '<span style="color:#9ca3af">아직 등록된 직원이 없습니다.</span>';
      } else {
        const groups = { hq_exec: [], hq_mgr: [], hq_teacher: [] };
        all.forEach(e => { if (groups[e.rank]) groups[e.rank].push(e); });
        const labelMap = { hq_exec: '👑 경영진', hq_mgr: '🛠️ 관리자', hq_teacher: '👨‍🏫 교사' };
        list.innerHTML = Object.keys(groups).map(k => {
          if (groups[k].length === 0) return '';
          return '<div style="margin-bottom:8px"><b style="color:#0f172a">' + labelMap[k] + '</b> <span style="color:#6b7280">(' + groups[k].length + '명)</span><br>' +
            groups[k].map(e => '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;background:#fff;border:1px solid #e5e7eb;border-radius:99px;font-size:11px"><b>' + e.name + '</b> <code style="color:#0ea5e9;font-size:10.5px">' + e.uid + '</code></span>').join('') + '</div>';
        }).join('');
      }
    }
    // 역할별 사용자 표 다시 렌더 (열려있을 때만)
    if (typeof renderUsersByRole === 'function') renderUsersByRole();
  }
  /* ➕ 본사 직원 등록 — 서버에 «진짜로» 만든다.  (2026-08-18 수리)
     ⚠️ 예전 이 함수는 localStorage 에만 넣고 「✅ 등록 완료」 알림을 띄웠다.
        서버로는 아무것도 안 보내서, «등록했는데 로그인이 안 되는» 계정이 만들어졌다.
        (CLAUDE.md 「비밀번호 변경 시연 껍데기 4벌」과 같은 종류)
     임시 비밀번호는 서버가 만들어 **이 화면에서 한 번만** 보여 준다. 어디에도 저장하지 않는다. */
  window.registerHqEmployee = async function() {
    const $ = id => document.getElementById(id);
    const uid = ($('hqe-uid')?.value || '').trim();
    const name = ($('hqe-name')?.value || '').trim();
    const rank = ($('hqe-rank')?.value || 'hq_mgr');
    const email = ($('hqe-email')?.value || '').trim();
    const phone = ($('hqe-phone')?.value || '').trim();
    const branch = ($('hqe-branch')?.value || '').trim();
    const msg = $('hqe-msg');
    const btn = document.querySelector('#card-permissions button.primary');
    function show(t, ok) {
      if (!msg) { alert(t); return; }
      msg.style.display = 'block';
      msg.style.background = ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
      msg.style.borderColor = ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)';
      msg.style.color = ok ? '#065f46' : '#b91c1c';
      msg.innerHTML = t;
    }
    if (msg) msg.style.display = 'none';

    // 화면에서도 한 번 거른다(서버가 정본이지만, 왕복 전에 알려주는 편이 빠르다)
    if (!uid || uid.length < 3) return show('⚠️ 아이디는 3자 이상 입력하세요.');
    if (!/^[a-zA-Z0-9_]+$/.test(uid)) return show('⚠️ 아이디는 영문/숫자/_만 가능합니다.');
    if (!name) return show('⚠️ 이름을 입력하세요.');

    if (btn) btn.disabled = true;
    try {
      const r = await fetch('/api/admin/staff-create', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uid, name: name, rank: rank, email: email, phone: phone })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        show('⚠️ ' + (j.message || j.error || '등록하지 못했습니다.'));
        return;
      }
      // 임시 비번은 지금 한 번만 보인다 — 눈에 띄게 크게.
      show(
        '<b style="font-size:13.5px">✅ ' + name + '(' + uid + ') 계정을 만들었습니다.</b><br>' +
        '<div style="margin-top:8px;padding:10px 12px;background:#fff;border:2px solid #10b981;border-radius:8px">' +
          '<div style="font-size:11.5px;color:#6b7280;font-weight:700">임시 비밀번호 — 이 화면에서만 보입니다</div>' +
          '<div style="font-family:MangoiHanSC,Consolas,monospace;font-size:20px;font-weight:800;letter-spacing:1px;color:#065f46;margin-top:3px">' +
            (j.temp_password || '') + '</div>' +
        '</div>' +
        '<div style="margin-top:8px;font-size:12px;line-height:1.7">' +
          '본인에게 전달하시고, <b>로그인 후 마이페이지에서 비밀번호를 바꾸라고</b> 안내하세요.<br>' +
          '잃어버리면 「강사·직원 비밀번호 재설정」으로 다시 만들 수 있습니다.' +
        '</div>', true);

      // 화면 목록용 기록(이 브라우저에만 남는 편의용 목록이다 — 계정 자체는 서버에 있다)
      const arr = _hqeLoad();
      arr.unshift({ uid, name, rank, email, phone, branch, registered_at: Date.now() });
      _hqeSave(arr);
      _hqeRefreshAll();
      pushAuditLog((adminLang==='en'?'HQ employee created: ':'본사 직원 계정 생성: ') + name + ' (' + uid + ' · ' + rank + ')');
      ['hqe-uid','hqe-name','hqe-email','hqe-phone','hqe-branch'].forEach(id => { const e = $(id); if (e) e.value = ''; });
    } catch (e) {
      show('⚠️ 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.');
    } finally {
      if (btn) btn.disabled = false;
    }
  };
  // 페이지 로드 시 + 권한 카드 토글 시 갱신
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(_hqeRefreshAll, 200);
    const card = document.getElementById('card-permissions');
    if (card) card.addEventListener('toggle', () => { if (card.open) _hqeRefreshAll(); });
  });

  // ━━━━━━━━━━ 🔐 RBAC: 로그인·세션·스코프 ━━━━━━━━━━
  const SESSION_KEY = 'mangoi_admin_session';
  function _allUsers() {
    // SAMPLE_USERS + 동적 등록된 본사 직원
    const dyn = (function(){ try { return JSON.parse(localStorage.getItem('mangoi_hq_employees') || '[]'); } catch(e){ return []; } })();
    return SAMPLE_USERS.concat(dyn.map(e => ({
      uid: e.uid, name: e.name, role: e.rank,
      branch: e.branch || '',
      _origin: 'dynamic'
    })));
  }
  function _loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch(e){ return null; }
  }
  function _saveSession(s) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch(e){}
  }
  function _clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch(e){}
  }
  window._adminSession = _loadSession();

  // ━━━ 🎭 데모 역할 미리보기(ph117 역할전환) 감지 ━━━ (2026-07-12)
  //   ph117 역할전환 버튼은 localStorage 'admin_session' 에 가짜 퍼소나(uid만; role 없음)를 써서
  //   메뉴/배너만 그 역할처럼 보이게 한다. 하지만 서버 쿠키는 여전히 관리자라 서버는 전체를 내려주고,
  //   급여표 필터는 실제 세션(_adminSession, 관리자) 기준이라 안 걸려서 → "강사 모드"인데 전체가 보였다.
  //   여기서 미리보기 퍼소나를 감지해 '유효 역할'을 돌려주면, 급여·평가 화면이 미리보기 역할을
  //   정직하게 반영(강사=본인만/차단)한다. 실제 데이터 보안은 서버가 별도로 강제(진짜 강사 로그인 기준).
  window._previewPersona = function(){
    try { return JSON.parse(localStorage.getItem('admin_session') || 'null'); } catch(e){ return null; }
  };
  window._isRolePreview = function(){
    var p = window._previewPersona();
    return !!(p && p.uid && !/^(hq_exec|hq_mgr|admin)$/.test(p.uid));
  };
  // 유효 역할: 미리보기 중이면 그 역할, 아니면 실제 세션 역할.
  window._effectiveRole = function(){
    var real = (window._adminSession && window._adminSession.role) || null;
    var p = window._previewPersona();
    if (p && p.uid){
      if (/^hq_t/.test(p.uid))    return 'hq_teacher';
      if (/^branch/.test(p.uid))  return 'branch';
      if (/^agency/.test(p.uid))  return 'agency';
      if (/^parent/.test(p.uid))  return 'parent';
      if (/^student/.test(p.uid)) return 'student';
      if (p.uid === 'hq_mgr')     return 'hq_mgr';
      if (p.uid === 'hq_exec' || p.uid === 'admin') return 'hq_exec';
    }
    return real;
  };
  // 미리보기 중인 강사 표시명(본인 행 매칭용). 실제 세션이면 세션 이름.
  window._effectiveOwnName = function(){
    var p = window._previewPersona();
    if (p && p.uid && /^hq_t/.test(p.uid)) return String(p.name || '').replace(/\s*강사\s*$/,'').trim();
    return (window._adminSession && window._adminSession.name) || '';
  };

  // ━━━ 🔐 강사 급여 접근 정책 (요청: 2026-06-16) ━━━
  //  • 본사 경영진(hq_exec)·관리자(hq_mgr) = 전체 급여 열람 (로그인 시에만)
  //  • 교사(hq_teacher)               = 본인 급여명세서만 (card-payroll, 렌더에서 본인 행만 필터)
  //  • 지사(branch)·대리점(agency)·기타·비로그인 = 차단 + 거절 메시지
  //  반환: { ok, ownOnly, message }
  window.PAYROLL_DENY_MSG = '죄송합니다. 경영자와 관리자가 아니라서 열어드릴 수 없네요.';
  window.payrollAccess = function(cardId) {
    var s = window._adminSession;
    // 🎭 미리보기 중이면 유효 역할로 판정(관리자가 강사 모드로 미리볼 때 본인만/차단을 정직하게 반영)
    var _effRole = (typeof window._effectiveRole === 'function') ? window._effectiveRole() : (s && s.role);
    if (_effRole) { s = { role: _effRole, name: (typeof window._effectiveOwnName==='function'? window._effectiveOwnName() : (s&&s.name)) }; }
    var NEED = '🔒 로그인 후 이용해 주세요. 강사 급여는 본사 관리자·경영진(전체)과 교사 본인(본인 급여)만 볼 수 있습니다.';
    if (!s || !s.role) return { ok:false, ownOnly:false, message: NEED };
    if (s.role === 'hq_exec' || s.role === 'hq_mgr') return { ok:true, ownOnly:false, message:'' };
    if (s.role === 'hq_teacher') {
      // 교사는 본인 급여명세서(card-payroll)만 — 전체 자동정산(card-payroll-auto)은 불가
      if (cardId === 'card-payroll') return { ok:true, ownOnly:true, message:'' };
      return { ok:false, ownOnly:false, message:'본인 급여명세서만 확인할 수 있어요. 전체 급여·자동정산은 본사 관리자·경영진만 볼 수 있습니다.' };
    }
    // branch / agency / parent / student / 기타
    return { ok:false, ownOnly:false, message: window.PAYROLL_DENY_MSG };
  };
  // 차단 메시지 토스트 (중앙 상단, 3.2초)
  window._payrollGuardToast = function(msg) {
    try {
      var t = document.createElement('div');
      t.setAttribute('role','alert');
      t.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:99999;max-width:340px;'
        + 'background:#1f2937;color:#fff;padding:14px 18px;border-radius:12px;font-size:14px;line-height:1.6;'
        + 'font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);text-align:center';
      t.innerHTML = '🔒 ' + String(msg || window.PAYROLL_DENY_MSG).replace(/</g,'&lt;');
      document.body.appendChild(t);
      setTimeout(function(){ try{ t.style.transition='opacity .4s'; t.style.opacity='0'; }catch(e){} }, 2800);
      setTimeout(function(){ try{ t.remove(); }catch(e){} }, 3300);
    } catch(e) { try { alert(msg); } catch(_){} }
  };
  // 교사 본인 급여 행 판별 (로그인 uid/이름 매칭)
  //   ⚠️ 급여 데이터는 엔드포인트마다 강사명 칼럼이 다르다: /all 은 teacher_name,
  //      /calculate 는 korean_name·english_name. 셋 다 비교해야 본인 행이 매칭된다
  //      (기존엔 teacher_name 만 봐서, /calculate 로 로드되는 card-payroll 에선 강사가
  //       본인 행조차 못 찾고 빈 화면이 됐다. 2026-07-12 수정)
  window._payrollIsOwnRow = function(r, s) {
    if (!r || !s) return false;
    var uid = String(s.uid || '').toLowerCase();
    var nml = String(s.name || '').trim().toLowerCase();
    if (uid && ((r.teacher_uid != null && String(r.teacher_uid).toLowerCase() === uid) ||
                (r.teacher_id  != null && String(r.teacher_id).toLowerCase()  === uid))) return true;
    if (!nml) return false;
    var names = [r.teacher_name, r.korean_name, r.english_name, r.name]
      .map(function(x){ return String(x == null ? '' : x).trim().toLowerCase(); });
    return names.indexOf(nml) !== -1;
  };

  function _renderSessionBanner() {
    const banner = document.getElementById('admin-session-banner');
    const overlay = document.getElementById('admin-login-overlay');
    if (!banner) return;
    const s = window._adminSession;
    if (!s) {
      banner.style.display = 'none';
      // ph239: 두 번째 로그인 모달 대신 admin/login.html 로 자동 redirect (1회 제한)
      if (overlay) overlay.style.display = 'none';
      try {
        if (!sessionStorage.getItem('_admin_login_redirected')) {
          sessionStorage.setItem('_admin_login_redirected', '1');
          var next = encodeURIComponent(location.pathname + location.search);
          setTimeout(function(){ location.replace('/admin/login.html?next=' + next); }, 120);
        }
      } catch(e) {}
      return;
    }
    // 세션 있음 — redirect 플래그 청소 (다음 로그아웃 시 다시 redirect 가능하도록)
    try { sessionStorage.removeItem('_admin_login_redirected'); } catch(e){}
    if (overlay) overlay.style.display = 'none';
    const ROLE_DESC = {
      hq_exec:    { icon:'👑', name:'본사·경영진', name_en:'HQ Executive', bg:'linear-gradient(135deg,#4b5563,#1f2937)', fg:'#f9fafb' },
      hq_mgr:     { icon:'🛠️', name:'본사·관리자', name_en:'HQ Manager',   bg:'linear-gradient(135deg,#fef3c7,#fde68a)', fg:'#78350f' },
      hq_teacher: { icon:'👨‍🏫', name:'본사·교사',   name_en:'HQ Teacher',   bg:'linear-gradient(135deg,#fed7aa,#fdba74)', fg:'#7c2d12' },
      branch:     { icon:'🏬', name:'지사',        name_en:'Branch',       bg:'linear-gradient(135deg,#fef3c7,#fcd34d)', fg:'#78350f' },
      agency:     { icon:'🤝', name:'대리점',      name_en:'Agency',       bg:'linear-gradient(135deg,#dcfce7,#bbf7d0)', fg:'#166534' },
      parent:     { icon:'👨‍👩', name:'학부모',     name_en:'Parent',       bg:'linear-gradient(135deg,#dbeafe,#bfdbfe)', fg:'#1e3a8a' },
      student:    { icon:'🎓', name:'학생',        name_en:'Student',      bg:'linear-gradient(135deg,#f3e8ff,#e9d5ff)', fg:'#581c87' },
    };
    const info = ROLE_DESC[s.role] || { icon:'?', name:s.role, name_en:s.role, bg:'#f3f4f6', fg:'#374151' };
    const en = (typeof adminLang !== 'undefined' && adminLang === 'en');
    const scope = s.role === 'branch' ? (en ? 'My branch + sub-agencies only' : '내 지사 + 산하 대리점만')
              :   s.role === 'agency' ? (en ? 'My agency only' : '내 대리점만')
              :   s.role.startsWith('hq') ? (en ? 'All data (HQ)' : '전체 (본사)')
              :   '';
    banner.style.cssText += '; background:' + info.bg + ';color:' + info.fg + ';border:1px solid rgba(0,0,0,0.05)';
    banner.style.display = 'block';
    banner.innerHTML = '<div style="display:flex;align-items:center;gap:6px;font-weight:800;font-size:12px">' +
      '<span>' + info.icon + '</span>' +
      '<span>' + (en ? info.name_en : info.name) + '</span>' +
      '<span style="flex:1"></span>' +
      '<button onclick="window.adminLogout && window.adminLogout()" title="' + (en?'Sign out':'로그아웃') + '" style="background:transparent;border:0;cursor:pointer;color:inherit;font-size:11px;font-weight:700">↪ ' + (en?'logout':'로그아웃') + '</button>' +
      '</div>' +
      '<div style="margin-top:4px;font-size:11px;font-weight:600;opacity:0.9">' + (s.name || s.uid) + (s.branch ? ' · ' + s.branch : '') + '</div>' +
      '<div style="margin-top:3px;font-size:10.5px;font-weight:500;opacity:0.75">📦 ' + scope + '</div>';
  }

  // 🔐 (2026-08-19) 화면 안에서 비번을 대조하던 «옛 오버레이 로그인» 폐지.
  //   admin.html 에 `#admin-login-overlay` 폼은 이미 없어 부를 곳이 없는데, SAMPLE_USERS 에
  //   평문 비번(busan·gn001·teacher…)이 남아 있었다. 이 파일은 /js/adm-core.js 로 **누구나
  //   받아 볼 수 있는 공개 자산**이라, 그 값이 곧 실계정(branch_busan 등) 비번 힌트였다.
  //   → 평문 비번을 지우고, 이 함수는 서버 로그인으로만 보낸다. 화면에서 «비번이 맞나» 를
  //     판정하는 길을 남겨 두면 언제든 같은 유출이 다시 생긴다.
  window.adminLogin = function() {
    const $ = id => document.getElementById(id);
    const msg = $('admin-login-msg');
    if (msg) { msg.textContent = '🔐 로그인 화면으로 이동합니다.'; msg.style.display = 'block'; }
    location.href = '/admin/login?next=' + encodeURIComponent(location.pathname + location.search);
  };

  window.adminLogout = function() {
    // 🔐 (2026-07-13) localStorage만 지우면 HttpOnly 쿠키(mango_admin_session)가 살아있어
    //   다음 진입 때 서버가 로그인 상태로 판단 → 자동 재로그인되던 버그.
    //   서버 세션(쿠키+DB)까지 종료한 뒤 로그인 화면으로 보낸다.
    _clearSession();
    window._adminSession = null;
    try { localStorage.removeItem('admin_session'); sessionStorage.clear(); } catch(e){}
    var done = false;
    function goLogin(){ if (done) return; done = true; location.replace('/admin/login'); }
    try {
      fetch('/api/admin/logout', { method:'POST', credentials:'include' }).then(goLogin, goLogin);
      setTimeout(goLogin, 1500); // 네트워크가 늦거나 실패해도 로그인 화면으로
    } catch(e) { goLogin(); }
  };

  // ━━━ 스코프 필터 (일반화 — Phase 2) ━━━
  // kind: 'agencies' | 'branches' | 'students' | 'recordings' | 'payments' |
  //       'enrollments' | 'teachers' | 'attendance' | 'corpcard' | 기타
  // 본사: 모두 / 지사: 자기 지사 + 산하 대리점 + 그 학생들 / 대리점: 자기 대리점만
  window.adminScopeFilter = function(items, kind) {
    if (!Array.isArray(items)) return items;
    const s = window._adminSession;
    if (!s) return items;                                  // 세션 없으면 그대로
    if (s.role && s.role.startsWith('hq')) return items;   // 본사는 모두 보임
    if (s.role === 'branch') {
      if (kind === 'agencies') {
        return items.filter(a => (a.parent_branch_id === s.branch_id) ||
          (a.parent_branch && s.branch && a.parent_branch.indexOf(s.branch.split(' ')[0]) >= 0));
      }
      if (kind === 'branches') return items.filter(b => b.id === s.branch_id || b.branch_id === s.branch_id);
      // 그 외 모든 kind (students/recordings/payments/enrollments/...)
      // — branch_id 또는 parent_branch_id 일치하는 것만
      return items.filter(it =>
        (it.branch_id === s.branch_id) ||
        (it.parent_branch_id === s.branch_id) ||
        // 학생 데이터 등이 agency_id 만 있고 branch_id 가 없으면 — 그 대리점의 parent_branch_id 로 매칭
        (it.agency_id && _agencyParentBranch(it.agency_id) === s.branch_id)
      );
    }
    if (s.role === 'agency') {
      if (kind === 'agencies') return items.filter(a => a.id === s.agency_id || a.agency_id === s.agency_id);
      if (kind === 'branches') return [];               // 대리점은 다른 지사 안 보임
      // 그 외: 자기 agency_id 만
      return items.filter(it => it.agency_id === s.agency_id);
    }
    return items;
  };
  // 대리점 ID → 부모 지사 ID 캐시 (시드에서 조회)
  let _agencyToBranchCache = null;
  function _agencyParentBranch(agencyId) {
    if (!_agencyToBranchCache) {
      _agencyToBranchCache = {};
      try {
        const ags = JSON.parse(localStorage.getItem('mangoi_test_agencies') || '[]');
        ags.forEach(a => { if (a.agency_id) _agencyToBranchCache[a.agency_id] = a.parent_branch_id; });
      } catch(e){}
    }
    return _agencyToBranchCache[agencyId];
  }

  // 🔐 RBAC: 카드별 가시성 정책 (Phase 3 — 화이트리스트 + 사이드바 자동 동기화)
  // 카드 ID → 최소 역할 레벨
  //   ★exec    = 본사 경영진만
  //   ★mgrOrUp = 본사 경영진 + 관리자
  //   ★hq      = 본사 누구나 (교사 포함)
  //   ★branch  = 본사 + 지사
  //   ★agency  = 본사 + 지사 + 대리점 (모든 직원 — 학부모/학생 제외)
  //   ★all     = 누구나 (등록되지 않은 카드는 기본 ★all)
  const CARD_POLICY = {
    'card-calendar':          'agency',   // 📅 캘린더 관리(휴가·공휴일) — 모든 관리자
    'card-review-quiz':       'hq',       // 🧠 복습퀴즈 출제 — 본사(교사 포함)
    // 회계 / 경영 / 시스템 — 경영진만
    'card-permissions':       'exec',
    'card-corpcard':          'exec',
    'card-financials':        'exec',
    'card-test-seed':         'exec',
    'card-retention':         'exec',     // 보관기간 자동 파기
    // 회계 — 경영진 + 관리자
    'card-accounting-mgmt':   'mgrOrUp',
    'card-accounting-reports':'mgrOrUp',
    // 🏢 (2026-09-10 신설) 대리점별 AI 사용료 단가 — 돈이 걸린 설정이라 회계와 같은 등급.
    //   서버(ai-billing.ts POST /rate)도 scope.type==='hq' 로 한 번 더 막는다 — 여기는
    //   «눌러도 안 되는 버튼» 을 안 보이게 하는 것뿐.
    'card-ai-billing':        'mgrOrUp',
    // 본사 전용 (교사 포함)
    'card-settlement-stats':  'hq',       // 정산통계관리
    'card-payroll':           'mgrOrUp',  // 강사 급여·평가 (교사는 본인만 — _applyMenuVisibility 특례 + 렌더 필터)
    'card-payroll-auto':      'mgrOrUp',  // 강사 급여 자동 정산 (전체 — 교사 불가)
    'card-notifications':     'mgrOrUp',  // 알림 큐
    // 본사 + 지사
    'card-teacher-mgmt':      'branch',   // 강사관리
    'card-active-rooms':      'branch',   // 실시간 수업 현황
    // ⚠️ (2026-08-09) card-centers 는 이제 «카드»가 아니라 card-franchises 안의 하위항목이다.
    //    _applyMenuVisibility 는 details.menu-card 만 순회하므로 이 줄은 더 이상 발동하지 않는다.
    //    지우지 않고 남겨 둔 이유 = 다시 카드로 떼어낼 때 원래 등급이 무엇이었는지 알아야 해서.
    //    실효 등급은 아래 card-franchises 의 'branch' 가 대신한다(둘 중 엄격한 쪽으로 맞췄다).
    'card-centers':           'branch',   // (inert) 🏪 대리점(학원) 전국 목록
    'card-rankings':          'branch',   // 학생 랭킹
    // 본사 + 지사 + 대리점 (대리점은 자기 데이터만 — adminScopeFilter 가 처리)
    'card-students-mgmt':     'agency',
    /* 🏢 조직 관리 — 안에 대표지사 + 지사(241) + 대리점·학원(921)이 함께 들어 있다.
       🔓 (2026-08-18 사장님 수정요청 #03·#04) 'branch' → 'agency'.
          사장님이 「영업사원·지사장·학원장이 보기 쉽게」 하라고 하신 화면인데, 정작
          **학원장에게는 카드째 안 보였고**(등급 'branch') 지사장이 열어도 API 가 403 이라
          **빈 표**만 떴다. 셋 중 둘에게 닫힌 화면이었다.
       ⚠️ 전국 명부를 연 것이 아니다 — 자료는 서버가 자른다:
            · /api/admin/franchises · /api/admin/centers → scopeFranchiseCond/scopeCenterCond
              (src/scope.ts) 로 지사 = 자기 지사, 대리점 = 자기 한 칸
            · 등록·수정·대표지사 지정은 canEditOrg() 로 본사만 (403)
          화면 쪽 짝은 아래 _applyOrgScopeUI() — 본사 전용 칸(대표지사·등록 폼)을 감춘다.
          **서버와 화면 둘 다** 봐야 한다. 한쪽만 고치면 새거나, 빈 폼이 남는다. */
    'card-franchises':        'agency',   // 🏢 조직 관리 (대표지사 › 지사 › 대리점)
    'card-enrollments':       'agency',   // 수강신청
    'card-level-tests':       'agency',   // 레벨 테스트
    'card-pronunciation':     'agency',   // 발음교정
    'card-recording-storage': 'agency',   // 녹화 관리
    'card-textbooks':         'agency',   // 교재 콘텐츠
    'card-community':         'agency',   // 커뮤니티
    // 'card-meeting-minutes': removed
    'card-data-export':       'agency',   // 데이터 내보내기
    'card-daily-charts':      'agency',   // 일자별 차트
  };
  /* 🏢 조직 관리 카드 — 본사 전용 칸을 지사·대리점에게 감춘다 (2026-08-18 수정요청 #03·#04)
     카드 등급(CARD_POLICY)은 **카드 한 장 단위**라, 카드를 열면 그 안이 통째로 열린다.
     그런데 이 카드 안에는 «보여도 되는 것»(자기 지사·자기 대리점 목록 — 서버가 잘라 준다)과
     «보이면 안 되는 것»(대표지사 권역표, 등록·수정 폼)이 섞여 있다. 그래서 칸 단위로 한 번 더 자른다.
     ⚠️ 서버가 이미 403 으로 막고 있다. 여기서 감추는 것은 «눌러도 안 되는 버튼» 을 안 보이게 하려는
        것이지 보안이 아니다 — 이 함수를 지운다고 자료가 새지는 않는다(반대로, 서버 쪽
        canEditOrg() 를 지우면 이 함수가 있어도 URL 로 뚫린다).
     ⚠️ 감추는 방법은 «.rbac-hide 클래스» 다. 인라인 display 는 #legacy-cards 안에서
        admin-inline-c.css 의 «카드들 보이게» 복구 규칙(!important)에 진다 — 역할별 카드 숨김이
        PC 에서 통째로 안 먹던 것이 그 때문이었고(#264 로 수리), 여기도 같은 함정 위에 있다.
        ⚠️ 이 클래스를 «읽는» 쪽(buildMenuIndex 등)은 `details.menu-card` 만 훑는다.
           여기서 붙이는 대상은 카드가 아니라 카드 «안» 의 하위 칸이라 그 판정에 안 걸린다. */
  function _applyOrgScopeUI(isHQ) {
    var hq = !!isHQ;                 // 모르는 역할은 false — 막는 쪽으로 떨어진다
    /* 감출 칸 —
         · 🏛️ 대표지사(card-master-branches) = 전국 권역표. 자기 대표지사만 보이더라도
           «등록·배정» 이 본사 일이라 칸째 감춘다.
         · 🏯 본사 관리(card-hq-orgs) = 법인 정보(사업자등록번호·대표이사·주소). 지사·대리점이
           볼 것도 고칠 것도 아니다. API(/api/admin/org/hq)는 지사 허용목록에 없어 이미 403 이라,
           감추지 않으면 «열리는데 늘 비어 있는 칸» 이 된다. */
    var ids = ['card-master-branches', 'card-hq-orgs'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('rbac-hide', !hq);
    });
    // 등록 폼 — «+ 지사 신규 등록», «+ 대리점(학원) 신규 등록». 서버가 403 이라 눌러도 안 된다.
    ['fr-add-btn', 'ct-add-btn'].forEach(function (bid) {
      var btn = document.getElementById(bid);
      var box = btn && btn.closest ? btn.closest('details') : null;
      if (box) box.classList.toggle('rbac-hide', !hq);
    });
  }

  function _applyMenuVisibility() {
    const s = window._adminSession;
    if (!s) return;
    let role = s.role;
    // 🪪 (2026-07-13) role 값 정규화 — 로그인 경로마다 세션 role 이 달랐다:
    //   login.html='hq_exec', 마이페이지 주입=서버 원문 'hq', 옛 세션='hq_mgr' 기본값.
    //   'admin'(대표) 계정은 무조건 경영진, 서버 scope 'hq'(라벨 '본사·경영진')도 경영진으로 통일.
    if (s.uid === 'admin' || role === 'exec' || role === 'admin' || role === 'hq') role = 'hq_exec';
    else if (role === 'mgr' || role === 'manager') role = 'hq_mgr';
    const isExec = role === 'hq_exec';
    const isMgrOrUp = isExec || role === 'hq_mgr';
    // 🗑️ (2026-08-21) 레벨테스트 신청 삭제 버튼 노출 판정에 재사용 — 본사(경영진·관리자)만.
    //   서버(api-admin.ts DELETE /api/admin/leveltest/applications)가 이미 같은 조건으로 403 을
    //   던진다. 여기서 감추는 것은 "눌러도 안 되는 버튼"을 안 보이게 하는 것뿐 — 보안은 서버 쪽.
    window._isHqMgrOrUp = isMgrOrUp;
    const isHQ = role && role.startsWith('hq');
    const isBranchUp = isHQ || role === 'branch';
    const isAgencyUp = isBranchUp || role === 'agency';
    function levelOK(lvl) {
      if (lvl === 'exec')      return isExec;
      if (lvl === 'mgrOrUp')   return isMgrOrUp;
      if (lvl === 'hq')        return isHQ;
      if (lvl === 'branch')    return isBranchUp;
      if (lvl === 'agency')    return isAgencyUp;
      return true; // 'all' 기본
    }
    const isTeacher = role === 'hq_teacher';
    document.querySelectorAll('details.menu-card').forEach(el => {
      if (!el.id) return;
      let visible;
      if (el.id === 'card-payroll') {
        // 강사 급여·평가: 경영진/관리자 전체 + 교사 본인만(렌더에서 필터). 지사·대리점·기타 차단.
        visible = isMgrOrUp || isTeacher;
      } else {
        const policy = CARD_POLICY[el.id];
        visible = policy ? levelOK(policy) : isHQ; // 정책 미등록 카드는 본사 전용
      }
      // 🔐 (2026-08-18) 인라인 display 가 아니라 «.rbac-hide» 클래스로 감춘다.
      //   인라인은 admin-inline-c.css 의 «카드들 보이게» 복구 규칙(!important)에 져서
      //   PC(≥1024px)에서 하나도 안 감춰지고 있었다. 자세한 경위는 그 CSS 주석 참고.
      //   ⚠️ 이 클래스를 «읽는» 쪽(buildMenuIndex·검색색인·바로가기·리텐션 허브)과 짝이다.
      el.classList.toggle('rbac-hide', !visible);
      el.style.display = '';   // 옛 방식이 남긴 인라인 값 청소(있으면)
    });
    _applyOrgScopeUI(isHQ);     // 본사(교사 포함)만 조직을 «고칠» 수 있다 — 모르는 역할은 막는 쪽으로
    // 사이드바 즉시 재인덱싱 (역할로 감춘 카드 제외됨)
    if (typeof buildMenuIndex === 'function') buildMenuIndex();
    /* 🔐 (2026-08-18) 역할 적용이 끝났다고 알린다.
       PC 사이드바(adm-ia6.js)는 정적 GROUPS 목록으로 그려 역할을 모르기 때문에, 이 신호를 받아
       «가리키는 카드가 전부 감춰진» 항목을 감춘다. 안 그러면 눌러도 빈 화면인 메뉴가 남는다.
       ⚠️ 이 함수는 로그인·세션 갱신 때마다 다시 도므로 신호도 그때마다 나간다. */
    try { document.dispatchEvent(new CustomEvent('mangoi:menu-visibility')); } catch (e) { /* 무시 */ }
  }

  // 페이지 로드 시 세션 확인
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      _renderSessionBanner();
      if (window._adminSession) _applyMenuVisibility();
      // Enter 키로 로그인
      const pw = document.getElementById('admin-login-pw');
      if (pw) pw.addEventListener('keydown', e => { if (e.key === 'Enter') window.adminLogin(); });
      const uid = document.getElementById('admin-login-uid');
      if (uid) uid.addEventListener('keydown', e => { if (e.key === 'Enter') window.adminLogin(); });
    }, 100);
  });

  function pushAuditLog(msg) {
    const box = document.getElementById('perm-audit-log');
    if (!box) return;
    const ts = new Date().toLocaleString('ko-KR');
    const item = document.createElement('div');
    item.style.cssText = 'padding:6px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-size:11.5px';
    item.innerHTML = `<span style="color:#9ca3af;font-family:MangoiHanSC,Consolas,monospace">${ts}</span> · ${msg}`;
    if (box.querySelector('div[style*="text-align:center"]')) box.innerHTML = '';
    box.insertBefore(item, box.firstChild);
  }

  // 권한 카드가 처음 열릴 때 자동 렌더
  document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('card-permissions');
    if (card) {
      card.addEventListener('toggle', () => {
        if (card.open) {
          renderPermMatrix();
          renderUsersByRole();
        }
      });
    }
  });

  // ━━━━━━━━━━ 🌱 테스트 데이터 시드 — 생성기 완전 제거 (2026-07-02) ━━━━━━━━━━
  // 가짜 학생/지사/대리점을 만들던 하드코딩 데이터 풀(KO_FIRST·KO_LAST·SI_DO·
  // COURSE_LV·TEACHERS_PH)과 랜덤 생성 로직은 삭제됐다. 학생 목록은 항상
  // 실제 서버 데이터(Neo4j graph-list → D1 unified 폴백)만 사용한다.
  // 아래 seedTest* 함수들은 예전 localStorage 시드 잔재 정리 + 재조회 스텁만 남긴다.

  function _seedLog(html, ok=true) {
    const box = document.getElementById('seed-result');
    if (!box) return;
    box.style.display = 'block';
    const div = document.createElement('div');
    div.style.cssText = `padding:8px 12px;margin-bottom:6px;border-radius:8px;font-size:12.5px;line-height:1.6;background:${ok?'#f0fdf4':'#fef2f2'};border:1px solid ${ok?'#86efac':'#fecaca'};color:${ok?'#15803d':'#991b1b'}`;
    div.innerHTML = html;
    box.insertBefore(div, box.firstChild);
  }

  // ── 1. 학생 시드 — 생성기 제거됨. localStorage 잔재 정리 + 실데이터 재조회만 ──
  window.seedTestStudents = async function() {
    try { localStorage.removeItem('mangoi_test_students'); localStorage.removeItem('mangoi_test_branches'); localStorage.removeItem('mangoi_test_agencies'); } catch{}
    if (typeof loadStudentList === 'function') loadStudentList();
  };

  // ── 2. 지사 시드 — 생성기 제거됨. localStorage 잔재 정리만 ──
  window.seedTestBranches = async function() {
    try { localStorage.removeItem('mangoi_test_branches'); } catch{}
  };

  // ── 3. 대리점 시드 — 생성기 제거됨. localStorage 잔재 정리만 ──
  window.seedTestAgencies = async function() {
    try { localStorage.removeItem('mangoi_test_agencies'); } catch{}
  };

  // ── 4. 전체 일괄 — 생성기 제거됨. 잔재 정리 + 실데이터 재조회만 ──
  window.seedTestAll = async function() {
    await seedTestStudents();
    await seedTestBranches();
    await seedTestAgencies();
    _seedLog('<b>ℹ️ 테스트 시드 생성 기능은 제거되었습니다</b><br>학생 목록은 실제 서버 데이터(Neo4j 그래프DB → D1 폴백)만 표시합니다.', true);
  };

  // ── 5. 전체 삭제 ──
  window.seedTestPurge = async function() {
    if (!confirm('⚠️ 모든 테스트 데이터(is_test=true)를 영구 삭제합니다.\n\n실제 운영 데이터에는 영향이 없습니다.\n계속하시겠습니까?')) return;
    try {
      await fetch('/api/admin/seed/purge', { method:'POST', credentials:'include' });
    } catch {}
    try {
      localStorage.removeItem('mangoi_test_students');
      localStorage.removeItem('mangoi_test_branches');
      localStorage.removeItem('mangoi_test_agencies');
    } catch {}
    _seedLog('<b>🗑 모든 테스트 데이터 삭제 완료</b><br>학생·지사·대리점 테스트 데이터가 정리되었습니다.', false);
    document.getElementById('seed-preview').style.display = 'none';
    // 학생 목록 테이블도 초기화
    const stb = document.getElementById('sm-students-table');
    if (stb) {
      const tbody = stb.querySelector('tbody');
      if (tbody) tbody.innerHTML = '';
    }
  };

  // ── 6. 시드 데이터 미리보기 테이블 렌더 ──
  function _getSeedData() {
    let s = [], b = [], a = [];
    try { s = JSON.parse(localStorage.getItem('mangoi_test_students') || '[]'); } catch {}
    try { b = JSON.parse(localStorage.getItem('mangoi_test_branches') || '[]'); } catch {}
    try { a = JSON.parse(localStorage.getItem('mangoi_test_agencies') || '[]'); } catch {}
    return { students: s, branches: b, agencies: a };
  }

  function renderSeedPreview() {
    const data = _getSeedData();
    const total = data.students.length + data.branches.length + data.agencies.length;
    const preview = document.getElementById('seed-preview');
    if (!preview) return;
    if (total === 0) { preview.style.display = 'none'; return; }
    preview.style.display = 'block';
    document.getElementById('seed-cnt-students').textContent = data.students.length;
    document.getElementById('seed-cnt-branches').textContent = data.branches.length;
    document.getElementById('seed-cnt-agencies').textContent = data.agencies.length;
    // 기본 탭 — 학생
    if (!window._seedActiveTab) window._seedActiveTab = 'students';
    seedShowTab(window._seedActiveTab);
    // 학생 데이터를 학생관리 테이블에도 같이 주입
    syncStudentsToMainTable(data.students);
  }

  window.seedShowTab = function(tab) {
    window._seedActiveTab = tab;
    document.querySelectorAll('.seed-tab').forEach(b => b.classList.remove('seed-tab-active'));
    const btn = document.getElementById('seed-tab-' + tab);
    if (btn) btn.classList.add('seed-tab-active');
    const data = _getSeedData();
    const wrap = document.getElementById('seed-tab-content');
    if (!wrap) return;
    if (tab === 'students') wrap.innerHTML = renderStudentsTable(data.students);
    else if (tab === 'branches') wrap.innerHTML = renderBranchesTable(data.branches);
    else if (tab === 'agencies') wrap.innerHTML = renderAgenciesTable(data.agencies);
  };

  function renderStudentsTable(rows) {
    if (!rows.length) return '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">아직 생성된 학생이 없습니다. 위에서 [🎓 학생 20명 생성]을 눌러주세요.</div>';
    return `<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:780px">
      <thead style="background:#f9fafb;position:sticky;top:0">
        <tr>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">아이디</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">이름</th>
          <th style="padding:9px 10px;text-align:center;border-bottom:2px solid #e5e7eb">학년</th>
          <th style="padding:9px 10px;text-align:center;border-bottom:2px solid #e5e7eb">레벨</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">코스</th>
          <th style="padding:9px 10px;text-align:right;border-bottom:2px solid #e5e7eb">결제액</th>
          <th style="padding:9px 10px;text-align:center;border-bottom:2px solid #e5e7eb">잔여/총</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">강사</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">소속</th>
        </tr>
      </thead>
      <tbody>${rows.map(s => `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:8px 10px;font-family:MangoiHanSC,Consolas,monospace;color:#0ea5e9;font-size:11.5px">${_se(s.user_id)}</td>
          <td style="padding:8px 10px;color:#111;font-weight:600">${_se(s.name)}</td>
          <td style="padding:8px 10px;text-align:center;color:#6b7280">${_se(s.grade||'-')}</td>
          <td style="padding:8px 10px;text-align:center"><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${_se(s.level||'-')}</span></td>
          <td style="padding:8px 10px;color:#374151">${_se(s.program||'-')}</td>
          <td style="padding:8px 10px;text-align:right;color:#10b981;font-weight:700;font-family:MangoiHanSC,Consolas,monospace">₩${(s.amount||0).toLocaleString('ko-KR')}</td>
          <td style="padding:8px 10px;text-align:center;color:#6b7280">${(s.classes_total - s.classes_used)||0} / ${s.classes_total||0}</td>
          <td style="padding:8px 10px;color:#6b7280;font-size:11.5px">${_se(s.teacher||'-')}</td>
          <td style="padding:8px 10px;color:#6b7280;font-size:11.5px">${_se(s.franchise||'-')}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  }

  function renderBranchesTable(rows) {
    if (!rows.length) return '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">아직 생성된 지사가 없습니다. 위에서 [🏬 지사 20개 생성]을 눌러주세요.</div>';
    return `<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px">
      <thead style="background:#f9fafb;position:sticky;top:0">
        <tr>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">지사명</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">지역</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">매니저</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">전화</th>
          <th style="padding:9px 10px;text-align:right;border-bottom:2px solid #e5e7eb">학생수</th>
          <th style="padding:9px 10px;text-align:right;border-bottom:2px solid #e5e7eb">강사수</th>
          <th style="padding:9px 10px;text-align:right;border-bottom:2px solid #e5e7eb">월매출</th>
          <th style="padding:9px 10px;text-align:center;border-bottom:2px solid #e5e7eb">개소일</th>
          <th style="padding:9px 10px;text-align:center;border-bottom:2px solid #e5e7eb">상태</th>
        </tr>
      </thead>
      <tbody>${rows.map(b => `
        <tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:8px 10px;color:#111;font-weight:700">${_se(b.name)}</td>
          <td style="padding:8px 10px;color:#6b7280;font-size:11.5px">${_se(b.city)} ${_se(b.district)}</td>
          <td style="padding:8px 10px;color:#374151">${_se(b.manager_name||'-')}</td>
          <td style="padding:8px 10px;color:#6b7280;font-family:MangoiHanSC,Consolas,monospace;font-size:11px">${_se(b.manager_phone||'-')}</td>
          <td style="padding:8px 10px;text-align:right;color:#1e40af;font-weight:700">${b.students_count||0}명</td>
          <td style="padding:8px 10px;text-align:right;color:#7c2d12;font-weight:700">${b.teachers_count||0}명</td>
          <td style="padding:8px 10px;text-align:right;color:#10b981;font-weight:700;font-family:MangoiHanSC,Consolas,monospace">₩${(b.monthly_revenue||0).toLocaleString('ko-KR')}</td>
          <td style="padding:8px 10px;text-align:center;color:#6b7280;font-size:11px">${_se(b.open_date||'-')}</td>
          <td style="padding:8px 10px;text-align:center">${b.status==='active' ? '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">● 운영중</span>' : '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">⏸ 대기</span>'}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  }

  function renderAgenciesTable(rows) {
    if (!rows.length) return '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">아직 생성된 대리점이 없습니다. 위에서 [🤝 대리점 20개 생성]을 눌러주세요.</div>';
    return `<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:880px">
      <thead style="background:#f9fafb;position:sticky;top:0">
        <tr>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">대리점명</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">소속 지사</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">점주</th>
          <th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">전화</th>
          <th style="padding:9px 10px;text-align:right;border-bottom:2px solid #e5e7eb">학생수</th>
          <th style="padding:9px 10px;text-align:center;border-bottom:2px solid #e5e7eb">수수료</th>
          <th style="padding:9px 10px;text-align:right;border-bottom:2px solid #e5e7eb">월매출</th>
          <th style="padding:9px 10px;text-align:center;border-bottom:2px solid #e5e7eb">계약 종료</th>
          <th style="padding:9px 10px;text-align:center;border-bottom:2px solid #e5e7eb">상태</th>
        </tr>
      </thead>
      <tbody>${rows.map(a => {
        const stColor = a.status==='active' ? 'd1fae5/065f46' : a.status==='pending' ? 'fef3c7/92400e' : 'fee2e2/991b1b';
        const stLabel = a.status==='active' ? '● 활성' : a.status==='pending' ? '⏸ 대기' : '✕ 만료';
        const [bg,fg] = stColor.split('/');
        return `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:8px 10px;color:#111;font-weight:700">${_se(a.name)}</td>
          <td style="padding:8px 10px;color:#6b7280;font-size:11px">${_se(a.parent_branch||'-')}</td>
          <td style="padding:8px 10px;color:#374151">${_se(a.owner_name||'-')}</td>
          <td style="padding:8px 10px;color:#6b7280;font-family:MangoiHanSC,Consolas,monospace;font-size:11px">${_se(a.owner_phone||'-')}</td>
          <td style="padding:8px 10px;text-align:right;color:#1e40af;font-weight:700">${a.students_count||0}명</td>
          <td style="padding:8px 10px;text-align:center"><span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${_se(a.commission_rate||'-')}</span></td>
          <td style="padding:8px 10px;text-align:right;color:#10b981;font-weight:700;font-family:MangoiHanSC,Consolas,monospace">₩${(a.monthly_revenue||0).toLocaleString('ko-KR')}</td>
          <td style="padding:8px 10px;text-align:center;color:#6b7280;font-size:11px">${_se(a.contract_end||'-')}</td>
          <td style="padding:8px 10px;text-align:center"><span style="background:#${bg};color:#${fg};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">${stLabel}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  function _se(s){return String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));}

  // 학생 시드 데이터를 학생관리 테이블에도 자동 주입 (#sm-students-table)
  function syncStudentsToMainTable(students) {
    const stb = document.getElementById('sm-students-table');
    if (!stb) return;
    let tbody = stb.querySelector('tbody');
    if (!tbody) {
      tbody = document.createElement('tbody');
      stb.appendChild(tbody);
    }
    // is_test 행만 정리하고 다시 주입
    Array.from(tbody.querySelectorAll('tr.test-row')).forEach(tr => tr.remove());
    students.forEach(s => {
      const tr = document.createElement('tr');
      tr.className = 'test-row';
      tr.innerHTML = `
        <td><code style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:4px;font-size:11px">${_se(s.user_id)}</code> <span style="background:#dcfce7;color:#15803d;font-size:9px;padding:1px 6px;border-radius:99px;margin-left:4px;font-weight:700">TEST</span></td>
        <td><b>${_se(s.name)}</b></td>
        <td><span class="sess-count">${(s.classes_used||0)}</span></td>
        <td><div class="date-line"><span class="date-d">${_se(s.grade||'-')}</span><span class="date-t">${_se(s.level||'-')} 레벨</span></div></td>
        <td><div class="date-line"><span class="date-d">${_se(s.teacher||'-')}</span><span class="date-t">잔여 ${(s.classes_total - s.classes_used)||0}회</span></div></td>
        <td><a href="/admin/student?uid=${encodeURIComponent(s.user_id)}" target="_blank" style="color:#0984e3">🎓 상세보기</a></td>`;
      tbody.appendChild(tr);
    });
  }

  // 시드 카드 열릴 때 자동 미리보기
  document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('card-test-seed');
    if (card) {
      card.addEventListener('toggle', () => { if (card.open) renderSeedPreview(); });
    }
    // 페이지 로드 시 이미 시드 데이터가 있으면 학생관리 테이블에 자동 주입
    setTimeout(() => {
      const data = _getSeedData();
      if (data.students.length) syncStudentsToMainTable(data.students);
    }, 800);
  });

  // 각 시드 함수가 끝날 때 미리보기 자동 갱신 + 학생관리 섹션 자동 로드
  function reloadStudentMgmtSections() {
    // _erpCache 강제 초기화 (시드 데이터로 재 fetch)
    try { window._erpCache = null; } catch{}
    // 학생관리 섹션의 [불러오기] 버튼들 자동 클릭
    setTimeout(() => {
      try {
        if (typeof window.loadExpiring === 'function') window.loadExpiring();
        if (typeof window.loadTodayAttend === 'function') window.loadTodayAttend();
        if (typeof window.loadStreakRanking === 'function') window.loadStreakRanking();
        if (typeof window.loadRecentConsult === 'function') window.loadRecentConsult();
        if (typeof window.loadBulkList === 'function') window.loadBulkList();
      } catch(e) { console.warn('[seed] 자동 로드 일부 실패:', e); }
    }, 200);
  }
  const _origStudents = window.seedTestStudents;
  window.seedTestStudents = async function() {
    await _origStudents();
    renderSeedPreview();
    reloadStudentMgmtSections();
  };
  const _origBranches = window.seedTestBranches;
  window.seedTestBranches = async function() {
    await _origBranches();
    renderSeedPreview();
    reloadStudentMgmtSections();
  };
  const _origAgencies = window.seedTestAgencies;
  window.seedTestAgencies = async function() {
    await _origAgencies();
    renderSeedPreview();
    reloadStudentMgmtSections();
  };
  // 페이지 로드 시 시드 데이터가 있으면 즉시 학생관리 섹션 자동 로드
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      const data = _getSeedData();
      if (data.students.length) reloadStudentMgmtSections();
    }, 1500);
  });
  // 글로벌 노출 (디버그용)
  window.__reloadStudentMgmt = reloadStudentMgmtSections;

  // 🚀 페이지 로드 시 시드 데이터가 없으면 자동 생성 (테스트 모드 자동 활성화)
  function autoSeedIfNeeded() {
    try { localStorage.removeItem('mangoi_test_students'); localStorage.removeItem('mangoi_test_branches'); localStorage.removeItem('mangoi_test_agencies'); } catch{}
    return; // 🚫 자동 테스트 시드 영구 비활성화
    const data = _getSeedData();
    if (data.students.length === 0) {
      // 자동으로 시드 학생 20명 생성 (사일런트)
      try {
        if (typeof window.seedTestStudents === 'function') {
          // 원래 함수 직접 호출 (UI 없이)
          (async () => {
            await _origStudents();
            // 학생관리 섹션 자동 새로고침
            setTimeout(() => {
              try { window._erpCache = null; } catch{}
              reloadStudentMgmtSections();
              // 강제로 모든 details 펼침
              document.querySelectorAll('.menu-card details summary').forEach(s => {
                const label = (s.textContent || '').trim();
                if (/만료 임박|오늘 출결|연속 출석|최근 상담|학생 목록/.test(label)) {
                  const d = s.parentElement;
                  if (d && d.tagName === 'DETAILS' && !d.open) d.open = true;
                }
              });
            }, 400);
          })();
        }
      } catch(e) { console.warn('[seed] 자동 시드 실패:', e); }
    } else {
      // 이미 있으면 즉시 캐시 무효화 + 섹션 로드
      try { window._erpCache = null; } catch{}
      reloadStudentMgmtSections();
    }
  }

  // 페이지 로드 후 1초 뒤 자동 시드 (다른 스크립트 초기화 후)
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(autoSeedIfNeeded, 1000);
  });
  setTimeout(autoSeedIfNeeded, 2500);

  window.__autoSeed = autoSeedIfNeeded;

  // ━━━ 학생관리 카드 상단 빠른 버튼 ━━━
  // ⚡ 시드 데이터 없으면 생성하고 + 모든 섹션 강제 로드
  window.quickSeedAndLoad = async function() {
    const data = _getSeedData();
    if (data.students.length === 0) {
      // 시드 자동 생성
      if (typeof window.seedTestStudents === 'function') {
        await window.seedTestStudents();
      }
    } else {
      // 이미 있으면 캐시 무효화 후 재로드
      try { window._erpCache = null; } catch{}
      reloadStudentMgmtSections();
    }
    // 학생 목록 details 자동 펼침
    setTimeout(() => {
      document.querySelectorAll('details summary').forEach(s => {
        const label = s.textContent || '';
        if (/학생 목록|만료 임박|오늘 출결|연속 출석|최근 상담/.test(label)) {
          const d = s.parentElement;
          if (d && d.tagName === 'DETAILS' && !d.open) d.open = true;
        }
      });
    }, 300);
  };

  // 🔄 단순 새로고침
  window.quickReloadStudentMgmt = function() {
    try { window._erpCache = null; } catch{}
    reloadStudentMgmtSections();
  };
})();

/* ══════════════════════════════════════════════════════════════════════
   ⏮ 보관기간이 «남았는데» 삭제됨으로 내려간 녹화 되살리기 (2026-09-02)

   왜 필요한가 — 보관기간을 1개월 → 3개월로 늘리기 «전» 에 만들어진 녹화는
   옛 30일 값이 `expires_at` 에 박혀 있어 이미 만료로 내려가 있었다.
   2026-09-02 에 그 값을 90일로 소급했으므로, 이제 «만료가 아닌데 목록에서
   안 보이는» 행이 남는다(그날 실측 1,329건 — 6월 423 · 7월 902 · 8월 4).

   ⚠️ 판정을 여기서 다시 하지 않는다. 서버의 단건 복원
      (PATCH /api/recordings/:id/status)이 R2 head() 로 실물을 «봤을 때만»
      완료로 올리고, 조회가 실패하면 막지 않는다(fail-open). 이 함수는
      그것을 여러 번 부를 뿐이다 — 판정을 복제하면 두 곳이 어긋난다.

   ⚠️ 「파일 없음」(409 file_gone)은 실패가 아니라 «사실» 이다. 그대로 둔다.
   ⛔ 새 일괄 API 를 만들지 않았다 — 그러면 판정이 두 벌이 되고
      src/index.ts(공동 금지구역)의 관문 등록도 필요해진다.
   ══════════════════════════════════════════════════════════════════════ */
window.recRestoreExpiredBulk = async function recRestoreExpiredBulk() {
  var EN = (window.adminLang === 'en');
  var btn = document.getElementById('rec-restore-bulk');
  var bar = document.getElementById('rec-search-bar');
  if (!bar) return;
  var box = document.getElementById('rec-restore-result');
  if (!box) { box = document.createElement('div'); box.id = 'rec-restore-result'; bar.appendChild(box); }
  var say = function (html) { box.innerHTML = html; };

  if (btn) btn.disabled = true;
  try {
    /* ── 1) 대상 모으기 — «만료가 아직 안 된» deleted 행만 ── */
    say(EN ? 'Looking for recordings still in retention…' : '보관기간이 남은 녹화를 찾는 중…');
    var now = Date.now(), targets = [], offset = 0, guard = 0;
    while (guard++ < 40) {
      var lr = await fetch('/api/recordings?status=deleted&limit=200&offset=' + offset, { credentials: 'include' });
      var ld = await lr.json().catch(function () { return null; });
      /* ⚠️ «실패라고 말했는가» 가 아니라 «성공이라고 말했는가» 로 판정한다 —
         404 본문에는 ok 칸이 없어 `ok === false` 검사는 그냥 통과한다(2장 함정). */
      if (!ld || ld.ok !== true || !Array.isArray(ld.items)) break;
      for (var i = 0; i < ld.items.length; i++) {
        var it = ld.items[i];
        if (Number(it.expires_at) > now) targets.push(it);
      }
      if (ld.items.length < 200) break;
      offset += 200;
    }

    if (!targets.length) {
      say(EN ? 'Nothing to restore — no recording is still within its retention window.'
             : '되살릴 것이 없습니다 — 보관기간이 남았는데 내려간 녹화가 없습니다.');
      return;
    }

    var msg = EN
      ? targets.length + ' recording(s) are still within their retention window but were taken off the list.\n\n'
        + 'Restore them? Only recordings whose video file actually exists will come back.'
      : '보관기간이 아직 남았는데 목록에서 내려간 녹화가 ' + targets.length + '건 있습니다.\n\n'
        + '되살릴까요? 영상 파일이 실제로 남아 있는 것만 되살아납니다.';
    if (!confirm(msg)) { say(''); return; }

    /* ── 2) 서버 단건 복원을 동시 5개로 ── */
    var idx = 0, restored = 0, gone = 0, failed = 0;
    var render = function () {
      var done = restored + gone + failed;
      say((EN ? 'Restoring… ' : '되살리는 중… ') + done + ' / ' + targets.length
        + ' · ' + (EN ? 'restored ' : '복원 ') + restored
        + ' · ' + (EN ? 'file already gone ' : '파일 없음 ') + gone
        + (failed ? (' · ' + (EN ? 'failed ' : '실패 ') + failed) : ''));
    };
    var worker = async function () {
      while (idx < targets.length) {
        var t = targets[idx++];
        try {
          var pr = await fetch('/api/recordings/' + t.id + '/status', {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' })
          });
          var pd = await pr.json().catch(function () { return null; });
          if (pd && pd.ok === true) restored++;
          else if (pd && pd.error === 'file_gone') gone++;   // 실패가 아니라 «사실»
          else failed++;
        } catch (e) { failed++; }
        if ((restored + gone + failed) % 10 === 0) render();
      }
    };
    render();
    await Promise.all([worker(), worker(), worker(), worker(), worker()]);

    say('<b>' + (EN ? 'Done.' : '완료했습니다.') + '</b> '
      + (EN ? 'Restored ' : '되살림 ') + '<b>' + restored + '</b>'
      + ' · ' + (EN ? 'file already gone ' : '파일이 이미 없음 ') + gone
      + (failed ? (' · ' + (EN ? 'failed ' : '실패 ') + failed) : '')
      + '<br><span style="color:#6b7280">'
      + (EN ? 'Recordings whose file was already gone stay off the list — that is the truth, not an error.'
            : '파일이 이미 없는 녹화는 그대로 둡니다 — 고장이 아니라 사실입니다.')
      + '</span>');

    /* ⚠️ 목록을 다시 읽되 결과 문구는 남긴다(재조회가 «완료» 를 지우던 사고가 있었다). */
    if (typeof loadRecordings === 'function') loadRecordings();
  } finally {
    if (btn) btn.disabled = false;
  }
};
