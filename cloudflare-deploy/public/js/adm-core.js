// ═══════════════════════════════════════════════════════════════
// adm-core.js — admin.html 핵심 로직 (2단계 스크립트 추출, 2026-07-14)
//   원복: 이 파일 내용을 admin.html 의 <script src=.../adm-core.js> 위치에 인라인.
//   외부 classic script 라 admin.html 의 다른 <script> 와 전역 스코프를 공유한다.
// ═══════════════════════════════════════════════════════════════
let chartAtt = null, chartRwd = null;
var adminLang = 'ko';
// i18n-sweep.js 가 현재 언어를 인식하도록 노출
try { window.getLang = function(){ return adminLang; }; } catch(e){}
// currentLang — 학생관리 load 함수들이 사용. adminLang 와 동기화.
var currentLang = adminLang;
try { window.currentLang = currentLang; } catch{}

// 🎚 상단 헤더 접기/펼치기 — localStorage 에 상태 저장
window.toggleTopHeader = function() {
  document.body.classList.toggle('th-collapsed');
  try {
    localStorage.setItem('mangoi_admin_topheader_collapsed',
      document.body.classList.contains('th-collapsed') ? '1' : '0');
  } catch(e){}
};
// 페이지 로드 시 이전 상태 복원
try {
  if (localStorage.getItem('mangoi_admin_topheader_collapsed') === '1') {
    document.addEventListener('DOMContentLoaded', () => document.body.classList.add('th-collapsed'));
  }
} catch(e){}

// ════════════════════════════════════════════════
// 🎚 상단 툴바 — 자동 숨김 + 마우스 hover 시 표시
//   1) 페이지 로드 후 3초 노출
//   2) 마우스가 헤더 위에서 떠나면 살짝 기다렸다가 숨김
//   3) 화면 맨 위(8px 띠) 또는 헤더에 마우스 올리면 다시 표시
//   4) 클릭/포커스 안에 있으면 숨기지 않음 (드롭다운 사용 중 보호)
// ════════════════════════════════════════════════
(function thAutoHide() {
  // 🩹 자동 숨김 비활성화 (2026-06-23): 헤더 위아래 들썩임 제거. sticky 라 항상 고정됨.
  var AUTO_HIDE_ENABLED = false;
  if (!AUTO_HIDE_ENABLED) return;
  document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('th-auto-hide');
    const trigger = document.getElementById('th-hover-trigger');
    const header  = document.querySelector('.top-header');
    if (!header) return;

    let hideTimer = null;
    const HIDE_DELAY = 1200;       // 마우스 떠난 후 숨김까지 대기
    const FIRST_HIDE = 3500;       // 첫 노출 후 자동 숨김

    function show() {
      clearTimeout(hideTimer);
      document.body.classList.remove('th-hidden');
    }
    function scheduleHide(delay) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        // 헤더 내부 input/select 가 포커스 중이면 숨기지 않음
        if (header.contains(document.activeElement)) { scheduleHide(800); return; }
        document.body.classList.add('th-hidden');
      }, delay);
    }

    // 처음엔 노출 후 자동 숨김
    show();
    scheduleHide(FIRST_HIDE);

    // 헤더 hover — 들어오면 표시, 떠나면 숨김 예약
    header.addEventListener('mouseenter', show);
    header.addEventListener('mouseleave', () => scheduleHide(HIDE_DELAY));

    // 화면 맨 위 트리거 띠 — 들어오면 표시
    if (trigger) {
      trigger.addEventListener('mouseenter', show);
    }

    // 키보드 포커스가 헤더 내부로 들어오면 표시 유지
    header.addEventListener('focusin', show);
    header.addEventListener('focusout', () => scheduleHide(HIDE_DELAY));

    // 터치 디바이스 — 화면 상단 탭 시 표시 토글
    document.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      if (t && t.clientY < 20) show();
    }, { passive: true });
  });
})();

function toggleAdminLang() {
  adminLang = (adminLang === 'ko') ? 'en' : 'ko';
  currentLang = adminLang;
  try { window.currentLang = currentLang; } catch{}
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

async function load() {
  const _pe = document.getElementById('period');
  const days = (_pe && _pe.value) || '7';   // #period 제거됨 → 기본 7일
  let data;
  let httpStatus = null;
  let rawBody = '';
  try {
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
      '<div class="card" style="grid-column:1/-1;border-left:4px solid #dc2626;">' +
        '<div class="card-label" style="color:#dc2626;font-weight:700;">⚠️ ' + (L?'Dashboard Load Failed':'데이터 로드 실패') + ' · ' + statusLabel + '</div>' +
        '<div style="margin-top:10px;font-size:13px;color:#374151;white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,monospace;">' + msg + '</div>' +
        '<div style="margin-top:10px;font-size:11px;color:#6b7280;line-height:1.5;">' +
          (L?'Check F12 Console for full details. Most likely cause: D1 migration not applied yet — run <code>npx wrangler d1 execute mango-db --remote --file=migration-attendance-fields.sql</code>'
             :'F12 콘솔에서 자세한 내용을 확인하세요.<br>가장 흔한 원인: D1 마이그레이션 미적용 → <code style="background:#f3f4f6;padding:2px 4px;border-radius:3px;">npx wrangler d1 execute mango-db --remote --file=migration-attendance-fields.sql</code> 실행 필요.') +
        '</div>' +
      '</div>';
    return;
  }
  if (!data) return;

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
  const speakers = data.top_speakers || [];
  document.getElementById('top-speakers').innerHTML = speakers.length === 0
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

  // 매출·학생흐름 차트 + 학생 랭킹 — 별도 endpoint 라 dashboard load 와 함께 같이 호출
  loadRevenueChart();
  loadStudentFlowChart();
  loadKpiSparklines();           // 5개 KPI 카드의 미니 꺾은선 그래프
  loadStudentRankings();          // 발화·시선·집중도 랭킹
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
    const r = await fetch('/api/admin/stats/today' + (window.mangoiScopeQS?mangoiScopeQS('?'):''), { credentials:'include', cache:'no-store' });
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
    const rate = (typeof j.absence?.rate_pct === 'number') ? j.absence.rate_pct : 0;
    $('today-absence').textContent = rate.toFixed(1) + '%';
    $('today-absence-sub').textContent =
      (j.absence?.absent || 0) + (L ? ' absent / ' : '명 결석 / ') +
      (j.absence?.scheduled || 0) + (L ? ' scheduled' : '명 예정');

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
    const r = await fetch('/api/admin/stats/revenue?' + params + (window.mangoiScopeQS?mangoiScopeQS('&'):''), { credentials:'include', cache:'no-store' });
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
    const r = await fetch('/api/admin/stats/student-flow?' + params, { credentials:'include', cache:'no-store' });
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
                            { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) return;
      renderSparkline(c.id, j.items || [], c.color);
    } catch (e) { console.warn('[spark]', c.period, 'failed:', e); }
  }));
}

function renderSparkline(canvasId, items, color) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (_sparkCharts[canvasId]) _sparkCharts[canvasId].destroy();

  // 데이터 없으면 빈 라인 표시
  const labels = items.map(i => i.label);
  const data   = items.map(i => i.revenue || 0);
  const hasData = data.some(v => v > 0);

  // 색상 → rgba 알파 변환 (#f59e0b → rgba(245,158,11,0.18))
  const hex2rgba = (hex, a) => {
    const h = hex.replace('#','');
    const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
  };

  _sparkCharts[canvasId] = new Chart(el.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: hasData ? color : '#d1d5db',
        backgroundColor: hasData ? hex2rgba(color, 0.18) : 'rgba(209,213,219,.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
      }]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      animation: { duration: 600 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(28,25,23,0.95)',
          titleFont: { size: 11, weight: '600' },
          bodyFont: { size: 12, weight: '700' },
          padding: 8,
          cornerRadius: 6,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y || 0;
              if (v >= 100000000) return (v/100000000).toFixed(1) + '억';
              if (v >= 10000)     return (v/10000).toFixed(1) + '만원';
              return v.toLocaleString('ko-KR') + '원';
            }
          }
        }
      },
      scales: {
        x: { display: false },
        y: { display: false, beginAtZero: true }
      },
      elements: { line: { capBezierPoints: true }}
    }
  });
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
    const r = await fetch('/api/admin/stats/student-rankings?' + params, { credentials:'include', cache:'no-store' });
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
      teacher: r.teacher_name || r.teacher_id || '-',
      duration_ms: r.duration_ms || 0,
      size_bytes: r.size_bytes || (matchedBlob ? matchedBlob.size : 0),
      participant_names: r.participant_names,
      consented_user_ids: r.consented_user_ids,
      status: r.status,
      blobKey: matchedKey,
      blobUrl: matchedBlob ? matchedBlob.url : null,
      originalName: matchedBlob ? matchedBlob.originalName : null,
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
      teacher: '-',
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
  if (typeof window.adminScopeFilter === 'function') _scopedRows = window.adminScopeFilter(rows, 'recordings');
  _unifiedRecRows = _scopedRows;
  renderRecordingsTable();
  renderRecordingsPagination();
  // 🔓 검색/로드 완료 시 안내 박스 숨기고 검색바·필터·테이블 모두 표시
  try {
    var promptEl = document.getElementById('rec-prompt-empty');
    var bar = document.getElementById('rec-search-bar');
    var filters = document.getElementById('rec-filters');
    var tableWrap = document.getElementById('rec-table-wrap');
    if (promptEl) promptEl.style.display = 'none';
    if (bar) bar.style.display = 'flex';
    if (filters) filters.style.display = 'flex';
    if (tableWrap) tableWrap.style.display = '';
  } catch(e){}
}

// 🔍 검색 도구 열기 — 안내 숨기고 검색바·필터·테이블 영역 모두 표시 (데이터 로드는 사용자 검색 후)
window.vcRecordingsToolsOpen = function() {
  var promptEl = document.getElementById('rec-prompt-empty');
  var bar = document.getElementById('rec-search-bar');
  var filters = document.getElementById('rec-filters');
  var tableWrap = document.getElementById('rec-table-wrap');
  if (promptEl) promptEl.style.display = 'none';
  if (bar) bar.style.display = 'flex';
  if (filters) filters.style.display = 'flex';
  if (tableWrap) tableWrap.style.display = '';
  // 검색 도구만 열고 데이터는 비워둠 — 사용자가 검색 클릭하면 로드
};

// 🔓 "전체 목록 보기" 버튼용 — 모든 영역 표시 + 즉시 loadRecordings 호출
window.vcRecordingsShow = function() {
  var promptEl = document.getElementById('rec-prompt-empty');
  var bar = document.getElementById('rec-search-bar');
  var filters = document.getElementById('rec-filters');
  var tableWrap = document.getElementById('rec-table-wrap');
  if (promptEl) promptEl.style.display = 'none';
  if (bar) bar.style.display = 'flex';
  if (filters) filters.style.display = 'flex';
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

  // 카운트 배지 업데이트
  const cBoth = rows.filter(r => r.source === 'both').length;
  const cD1 = rows.filter(r => r.source === 'd1only').length;
  const cOrphan = rows.filter(r => r.source === 'orphan').length;
  const cEl = document.getElementById('rec-counts');
  if (cEl) {
    cEl.textContent = adminLang === 'en'
      ? ('Total ' + rows.length + '  ·  ✅ Healthy ' + cBoth + '  ·  ⚠️ Video missing ' + cD1 + '  ·  ⚠️ Record missing ' + cOrphan)
      : ('총 ' + rows.length + '건  ·  ✅ 정상(영상+기록) ' + cBoth + '  ·  ⚠️ 영상 없음 ' + cD1 + '  ·  ⚠️ 기록 없음 ' + cOrphan);
  }

  if (!filtered.length) {
    // colspan 은 thead 의 컬럼 수와 같아야 함 (방/교사/시작/시간/크기/참가자/시선/말하기/총참여도/상태/스토리지/재생 = 12)
    tb.innerHTML = '<tr><td colspan="12" class="empty">'+(adminLang==='en'?'No recordings':'녹화 기록 없음')+'</td></tr>';
    return;
  }

  tb.innerHTML = filtered.map(r => {
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
    else if (r.status === 'deleted')   statusBadge = '<span style="'+badgeBase+'background:#ef4444;color:#fff;">'+(adminLang==='en'?'Deleted':'삭제됨')+'</span>';
    else if (r.status === 'orphan')    statusBadge = '<span style="'+badgeBase+'background:#ea580c;color:#fff;">'+(adminLang==='en'?'Orphan':'고아')+'</span>';
    else                                statusBadge = r.status || '-';

    // 스토리지 배지 (D1=메타데이터 DB, R2=파일 저장소) — 진한 단색 필로 판독성 확보
    let storageBadge;
    if (r.source === 'both')         storageBadge = '<span style="'+badgeBase+'background:#16a34a;color:#fff;" title="영상 파일과 기록 모두 정상">'+(adminLang==='en'?'✔ Healthy':'✔ 정상')+'</span>';
    else if (r.source === 'd1only')  storageBadge = '<span style="'+badgeBase+'background:#f59e0b;color:#fff;" title="기록은 있는데 영상 파일이 없습니다 (업로드 실패 또는 진행 중)">'+(adminLang==='en'?'⚠ Video missing':'⚠ 영상 없음')+'</span>';
    else                              storageBadge = '<span style="'+badgeBase+'background:#dc2626;color:#fff;" title="영상은 있는데 어떤 수업인지 기록이 없습니다 (정리 필요)">'+(adminLang==='en'?'⚠ Record missing':'⚠ 기록 없음')+'</span>';

    // 재생/액션 버튼
    let playBtn;
    if (r.blobKey) {
      const playUrl = '/api/recordings/blob/' + encodeURIComponent(r.blobKey);
      const titleText = '방 ' + (r.room_id || '-') + ' - ' + String(r.teacher || '').replace(/'/g,"");
      playBtn = '<button onclick="playRecording(\''+playUrl+'\', \''+titleText.replace(/'/g,"\\'")+'\')" style="background:#2563eb;color:#fff;padding:5px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;border:none;box-shadow:0 2px 5px rgba(37,99,235,0.40);">▶ '+(adminLang==='en'?'Play':'재생')+'</button>';
    } else if (r.status === 'recording') {
      playBtn = '<span style="color:#94a3b8;font-size:11px;">'+(adminLang==='en'?'In progress':'녹화중')+'</span>';
    } else {
      playBtn = '<span style="color:#94a3b8;font-size:11px;">'+(adminLang==='en'?'Pending upload':'업로드 대기')+'</span>';
    }

    // 🗑️ Phase 4: 삭제/복원 버튼 (D1 id 가 있는 row 에만 — orphan 은 제외)
    let actionBtn = '';
    if (r.id) {
      if (r.status === 'deleted') {
        actionBtn = '<button onclick="setRecordingStatus(' + r.id + ', \'ended\')" title="' + (adminLang==='en'?'Restore this recording':'삭제된 녹화를 복원합니다') + '" style="background:#10b981;color:#fff;padding:5px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:none;margin-left:6px;">↩ ' + (adminLang==='en'?'Restore':'복원') + '</button>';
      } else if (r.status !== 'recording') {
        actionBtn = '<button onclick="setRecordingStatus(' + r.id + ', \'deleted\')" title="' + (adminLang==='en'?'Soft-delete this recording (reversible)':'녹화를 삭제 처리합니다 (복원 가능)') + '" style="background:#fff;color:#dc2626;padding:5px 11px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #f5a3a3;margin-left:6px;">🗑 ' + (adminLang==='en'?'Delete':'삭제') + '</button>';
      }
    }
    playBtn = playBtn + actionBtn;

    const roomCell   = r.room_id || '-';
    const teacherCell = r.teacher || '-';
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
    function calcParticipation(g, s) {
      const gn = (g === null || g === undefined || isNaN(Number(g))) ? null : Number(g);
      const sn = (s === null || s === undefined || isNaN(Number(s))) ? null : Number(s);
      if (gn === null && sn === null) return null;
      if (gn === null) return sn;
      if (sn === null) return gn;
      return (gn + sn) / 2;
    }
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
    const partValue   = calcParticipation(r.gaze_score, r.speaking_score);
    const partCellHtml = partCell(partValue);

    return '<tr>'
      + '<td>' + roomCell + '</td>'
      + '<td>' + teacherCell + '</td>'
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
  const statusEl   = document.getElementById('rec-status-2');   // 녹화 상태 필터(전체/종료/녹화중/중단/삭제) — #rec-status 는 영입본부 폼이라 오작동했음
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
  if (!confirm(adminLang==='en'?'Delete expired data now?':'지금 보관기간 만료 데이터를 파기하시겠습니까?')) return;
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
async function loadActiveRooms() {
  _ensureRoomEnhCss();
  const _L = adminLang==='en';
  try {
    const [rr, ar] = await Promise.all([
      fetch('/api/active-rooms'),
      fetch('/api/admin/alerts').catch(()=>null)
    ]);
    const rooms = await rr.json();
    const tb = document.getElementById('active-rooms-table');
    // 미확인(unack) 알림을 room_id 별로 매핑 → 이상감지 표시·정렬용
    const alertMap = {};
    try {
      if (ar) { const ad = await ar.json(); if (ad && ad.ok !== false) (ad.items||[]).forEach(it => { if (!it.acknowledged_at) alertMap[String(it.room_id)] = it; }); }
    } catch(_) {}
    if (!rooms || rooms.length === 0) {
      tb.innerHTML = '<tr><td colspan="6" class="empty">'+(_L?'No active classes':'현재 진행 중인 수업 없음')+'</td></tr>';
      return;
    }
    const TYPE_KO = { silence_20s:'침묵 20초', forbidden_word:'금지어 감지', low_engagement:'참여 저하', network_poor:'네트워크 저하' };
    // 🚨 이상감지 방을 최상단으로 정렬
    const sorted = rooms.slice().sort((a,b)=> (alertMap[String(b.roomId)]?1:0) - (alertMap[String(a.roomId)]?1:0));
    tb.innerHTML = sorted.map(room => {
      const userNames = (room.users || []).map(u => u.username).join(', ') || '-';
      const roomIdJs = JSON.stringify(room.roomId);
      const al = alertMap[String(room.roomId)];
      const badge = al ? ' <span class="room-alert-badge">🚨 '+(TYPE_KO[al.alert_type]||al.alert_type)+'</span>' : '';
      return `<tr class="${al?'room-alert':''}">
        <td>${room.roomId}${badge}</td>
        <td>${room.userCount}${_L?'':' 명'}${room.observerCount > 0 ? ' <span style="color:#f59e0b;font-size:11px;">('+ (_L?'obs ':'관찰 ') + room.observerCount+')</span>' : ''}</td>
        <td>${userNames}</td>
        <td>${room.hasPdf ? '<span class="badge ok">'+(_L?'Sharing':'공유중')+'</span>' : '-'}</td>
        <td>${room.hasVideo ? '<span class="badge ok">'+(_L?'Sharing':'공유중')+'</span>' : '-'}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap;">
          ${al?`<button onclick="interveneRoom(${roomIdJs})" style="background:#ef4444;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;">🚨 ${_L?'Intervene':'즉시 개입'}</button>`:''}
          <button onclick="observeRoom(${roomIdJs})" style="background:#f59e0b;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;">👁 ${_L?'Ghost':'GHOST 참관'}</button>
          <button onclick="forceEndRoom(${roomIdJs})" title="${_L?'Force end this class (disconnects all participants)':'이 수업을 강제 종료합니다 (모든 참가자 연결 해제)'}" style="background:#dc2626;color:#fff;padding:4px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;">🛑 ${_L?'Force End':'강제 종료'}</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    document.getElementById('active-rooms-table').innerHTML = '<tr><td colspan="6" class="empty">'+(_L?'Load failed: ':'로딩 실패: ') + e.message + '</td></tr>';
  }
}
// 🚨 즉시 개입 — 강사 귓속말(Whisper) 카드로 이동해 즉시 대처
function interveneRoom(roomId){
  try{
    const c=document.getElementById('card-admin-whisper');
    if(c){ if(c.tagName==='DETAILS') c.open=true; c.scrollIntoView({behavior:'smooth',block:'start'}); const o=c.style.boxShadow; c.style.boxShadow='0 0 0 3px rgba(239,68,68,0.6)'; setTimeout(function(){c.style.boxShadow=o;},1800); }
    else { alert('강사 귓속말 기능으로 이동: '+roomId); }
  }catch(_){ }
}

function observeRoom(roomId) {
  // 메인 화상통화 페이지를 관찰자 모드로 열기
  const url = window.location.origin + '/?observe=' + encodeURIComponent(roomId);
  window.open(url, '_blank', 'width=1200,height=800');
}

// 🛑 관리자 강제 종료 (Phase 4)
//   - 2단계 확인: confirm → 사유 입력(선택) → API 호출
//   - API: POST /api/admin/room/:roomId/force-end  body: { reason? }
async function forceEndRoom(roomId) {
  const _L = adminLang==='en';
  const confirmMsg = _L
    ? `Force-end room "${roomId}"? All participants will be disconnected immediately.`
    : `방 "${roomId}" 을 강제 종료하시겠습니까?\n모든 참가자 연결이 즉시 해제됩니다.`;
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
    if (tnew) { var d = tnew.closest('details'); if (d) d.style.display = 'none'; }
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
  class_count: '수업수', rate_per_10min_php: '10분단가',
  monthly_salary_php: '월급(PHP)', monthly_salary_krw: 'KRW',
};
const _SORT_LABELS_EN = {
  teacher_name: 'Teacher', status: 'Status', years: 'Years',
  score_instruction: 'Inst', score_retention: 'Ret', score_punctuality: 'Punct',
  score_admin: 'Admin', score_contribution: 'Contrib',
  weighted_total: 'Weighted', grade: 'Grade',
  class_count: 'Classes', rate_per_10min_php: 'Rate/10m',
  monthly_salary_php: 'Salary(PHP)', monthly_salary_krw: 'KRW',
};

// 등급 한↔영
const _GRADE_EN = { '최우수': 'Outstanding', '매우 우수': 'V.Satisfactory', '우수': 'Satisfactory', '개선 요망': 'Needs Improvement', '미평가': 'Unrated' };
function _gradeText(g) { return adminLang === 'en' ? (_GRADE_EN[g] || g || 'Unrated') : (g || '미평가'); }

function _payrollFieldValue(row, key) {
  if (!row) return null;
  if (['score_instruction','score_retention','score_punctuality','score_admin','score_contribution'].includes(key)) {
    return row.evaluation ? row.evaluation[key] : null;
  }
  if (key === 'grade') return _GRADE_RANK[row.grade] != null ? _GRADE_RANK[row.grade] : -1;
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
    tb.innerHTML = '<tr><td colspan="14" class="empty">' + (_L ? 'Payroll is visible only to HQ managers/executives and each teacher (own payslip).' : '급여는 본사 관리자·경영진(전체)과 교사 본인(본인 급여)만 볼 수 있습니다.') + '</td></tr>';
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
      tb.innerHTML = '<tr><td colspan="14" class="empty" style="line-height:1.7">' + note + '</td></tr>';
      _updateSortArrows();
      return;
    }
    const empty = _L ? 'No active teachers. Add one above or click 🌱 Seed.' : '활성 강사가 없습니다. 위에서 강사를 먼저 등록하거나 🌱 시드 버튼을 사용하세요.';
    tb.innerHTML = '<tr><td colspan="14" class="empty">' + empty + '</td></tr>';
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
  tb.innerHTML = '<tr><td colspan="14" class="empty">' + (_L ? 'Loading...' : '불러오는 중...') + '</td></tr>';
  try {
    const r = await fetch(`/api/admin/payroll/all?year=${year}&month=${month}`, { cache: 'no-store', credentials: 'include' });
    const d = await r.json();
    if (!d.ok) {
      tb.innerHTML = '<tr><td colspan="14" class="empty">' + (_L ? 'Failed: ' : '실패: ') + (d.error || ('HTTP ' + r.status)) + '</td></tr>';
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
    tb.innerHTML = '<tr><td colspan="14" class="empty">' + (_L ? 'Error: ' : '에러: ') + e.message + '</td></tr>';
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
        body: JSON.stringify({ teacher_id: teacherId, year, month, class_count: classCount })
      });
      const d2 = await r2.json().catch(() => ({}));
      if (!r2.ok || d2.ok === false) { alert((_L ? 'Class count save failed: ' : '수업수 저장 실패: ') + (d2.error || ('HTTP ' + r2.status))); return; }
    }
    closeEvalModal();
    calcPayrollAll();
  } catch (e) { alert((adminLang === 'en' ? 'Network error: ' : '네트워크 에러: ') + e.message); }
}

function downloadPayrollCSV() {
  const _L = adminLang === 'en';
  if (_payrollTeacherView()) { try{ window._payrollGuardToast(_L?'Only HQ managers/executives can export payroll.':'전체 급여 내보내기는 본사 관리자·경영진만 가능합니다.'); }catch(e){} return; } // 🔐
  const year  = parseInt(document.getElementById('payroll-year').value, 10);
  const month = parseInt(document.getElementById('payroll-month').value, 10);
  if (!year || !month) { alert(_L ? 'Enter year/month' : '연도/월을 입력하세요'); return; }
  window.open(`/api/admin/export/payroll.csv?year=${year}&month=${month}`, '_blank');
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
    alert((adminLang==='en'?'Failed: ':'실패: ') + (d.error || ('HTTP '+r.status)));
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
  return '<span style="background:' + s.bg + ';color:' + s.color + ';padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600">' +
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
function _hrSeed(t) {
  const key = String(t.id || t.korean_name || t.english_name || '');
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function _hrScore(t) {
  const s = _hrSeed(t);
  const cls   = 60 + (s % 39);
  const ret   = 60 + ((s >> 3) % 39);
  const punct = 60 + ((s >> 6) % 39);
  const admin = 60 + ((s >> 9) % 39);
  const contr = 60 + ((s >> 12) % 39);
  const total = cls*0.25 + ret*0.30 + punct*0.20 + admin*0.15 + contr*0.10;
  return { total: Math.round(total*10)/10, cls, ret, punct, admin, contr };
}
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

async function loadTeacherProfiles() {
  const status = document.getElementById('tp-filter-status')?.value || '';
  const group  = document.getElementById('tp-filter-group')?.value || '';
  const params = new URLSearchParams();
  if (status) params.set('status', status);
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
    tbody.innerHTML = '<tr><td colspan="13" class="empty">열람 권한이 없습니다. (본사 관리자·경영진 전용)</td></tr>';
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
  if (cnt) cnt.textContent = items.length + '명';
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="13" class="empty">강사 데이터 없음 — 위에서 신규 등록</td></tr>';
    return;
  }
  // 인사평가 점수·순위 미리 계산
  const _scored = items.map(t => ({ t, score: _hrScore(t) }));
  _scored.sort((a, b) => b.score.total - a.score.total);
  const _rankMap = new Map();
  _scored.forEach((row, idx) => _rankMap.set(row.t.id, idx + 1));

  tbody.innerHTML = items.map(t => {
    const img = t.image_url
      ? '<img src="' + _aiEsc(t.image_url) + '" style="width:36px;height:36px;border-radius:50%;object-fit:cover" onerror="this.style.display=\'none\'" />'
      : '<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold">' + (t.korean_name||'?').charAt(0) + '</div>';
    const fee = t.fee_per_10min ? Number(t.fee_per_10min).toLocaleString('ko-KR') : '—';
    const join = t.join_date || '—';
    const phone = t.phone || t.kakao_id || '—';
    const score = _hrScore(t);
    const grade = _hrGrade(score.total);
    const rank = _rankMap.get(t.id) || '-';
    const tip = '수업 ' + score.cls + ' · 재등록 ' + score.ret + ' · 근태 ' + score.punct + ' · 행정 ' + score.admin + ' · 조직 ' + score.contr;
    return '<tr>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center">' + img + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb"><b>' + _aiEsc(t.korean_name||'') + '</b>' +
        (t.english_name ? '<br><span style="font-size:11px;color:#6b7280">' + _aiEsc(t.english_name) + '</span>' : '') + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center">' + (_tpStatusBadge(t.status)) + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center">' + (_tpGroupBadge(t.group_name)) + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center">' + (_tpWorkplaceBadge(t.group_name)) + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb">' + _aiEsc(t.active_region||'—') + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:right">' + fee + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb">' + _aiEsc(phone) + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb">' + join + '</td>' +
      '<td class="hr-eval-col" style="padding:6px;border:1px solid #e5e7eb;text-align:center" title="' + _aiEsc(tip) + '">' +
        '<div style="display:inline-flex;align-items:center;gap:5px">' +
          '<span style="font-size:13px;font-weight:800;color:' + grade.color + ';font-variant-numeric:tabular-nums">' + score.total.toFixed(1) + '</span>' +
          '<span style="display:inline-block;padding:2px 8px;background:' + grade.bg + ';color:' + grade.color + ';border-radius:10px;font-size:10.5px;font-weight:800">' + grade.label + '</span>' +
        '</div>' +
      '</td>' +
      '<td class="hr-eval-col" style="padding:6px;border:1px solid #e5e7eb;text-align:center">' + _hrRankBadge(rank) + '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center;white-space:nowrap">' +
        (t.intro_video_url
          ? '<button onclick="viewTeacherVideo(\'' + encodeURIComponent(t.intro_video_url) + '\',\'' + _aiEsc(t.korean_name||'') + '\')" title="소개 영상 보기" style="padding:3px 11px;font-size:11px;background:#7c3aed;color:#fff;border:0;border-radius:5px;cursor:pointer;font-weight:700">▶ 영상</button>'
          : '<span style="color:#9ca3af;font-size:11px">—</span>') +
      '</td>' +
      '<td style="padding:6px;border:1px solid #e5e7eb;text-align:center;white-space:nowrap">' +
        '<button onclick="window.open(\'/?room=mangoi-class\',\'_blank\')" title="🎥 수업 입장 — 학생들과 같은 공용 수업방으로 들어갑니다 (이 링크를 강사에게 주세요)" style="padding:3px 8px;font-size:10px;background:#f59e0b;color:#fff;border:0;border-radius:4px;cursor:pointer">🎥</button> ' +
        '<button onclick="viewTeacherProfile(' + t.id + ')" title="상세 보기" style="padding:3px 8px;font-size:10px;background:#3b82f6;color:#fff;border:0;border-radius:4px;cursor:pointer">🔍</button> ' +
        '<button onclick="editTeacherProfile(' + t.id + ')" title="수정" style="padding:3px 8px;font-size:10px;background:#10b981;color:#fff;border:0;border-radius:4px;cursor:pointer">✏️</button> ' +
        '<button onclick="removeTeacherProfile(' + t.id + ',\'' + _aiEsc(t.korean_name||'') + '\')" title="제거" style="padding:3px 8px;font-size:10px;background:#ef4444;color:#fff;border:0;border-radius:4px;cursor:pointer">🗑️</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

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
    active_region: e('tp-active-region')?.value.trim() || null,
    origin_region: e('tp-origin-region')?.value.trim() || null,
    fee_per_10min: e('tp-fee-10min')?.value ? parseInt(e('tp-fee-10min').value, 10) : null,
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
    btn.textContent = '＋ 강사 등록';
    delete btn.dataset.editId;
  }
  clearTeacherForm();
  loadTeacherProfiles();
}
function clearTeacherForm() {
  ['tp-name','tp-en-name','tp-email','tp-phone','tp-kakao','tp-dob','tp-gender','tp-active-region','tp-origin-region',
   'tp-fee-10min','tp-group','tp-join-date','tp-leave-date','tp-image-url','tp-video-url',
   'tp-education','tp-career','tp-cert','tp-avail-days','tp-avail-hours','tp-bank-name','tp-bank-acct','tp-notes',
   'tp-mbti-type','tp-mbti-hobby','tp-mbti-style','tp-mbti-intro']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const st = document.getElementById('tp-status'); if (st) st.value = '활동중';
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
  const r = await fetch('/api/admin/teacher-profiles/' + id, { credentials:'include' });
  const d = await r.json().catch(()=>({}));
  if (!r.ok || !d.ok) { alert('조회 실패'); return; }
  const t = d.item;
  const html = '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)this.remove()">' +
    '<div style="background:#fff;border-radius:14px;padding:24px;max-width:600px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 60px -10px rgba(0,0,0,0.3)">' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;border-bottom:2px solid #f3f4f6;padding-bottom:14px">' +
        (t.image_url ? '<img src="' + _aiEsc(t.image_url) + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover">' : '<div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:bold">'+(t.korean_name||'?').charAt(0)+'</div>') +
        '<div><div style="font-size:20px;font-weight:bold;color:#1f2937">' + _aiEsc(t.korean_name||'') + '</div>' +
        (t.english_name ? '<div style="color:#6b7280">' + _aiEsc(t.english_name) + '</div>' : '') +
        '<div style="margin-top:4px">' + (_TP_STATUS_BADGE[t.status]||'') + ' ' + (_TP_GROUP_BADGE[t.group_name]||'') + '</div></div>' +
        '<button onclick="this.closest(\'[onclick]\').remove()" style="margin-left:auto;background:transparent;border:0;font-size:20px;cursor:pointer">✕</button>' +
      '</div>' +
      _tpField('이메일', t.email) + _tpField('휴대폰', t.phone) + _tpField('카톡 ID', t.kakao_id) +
      _tpField('MBTI', t.mbti) +
      _tpField('생년월일', t.dob) + _tpField('활동 지역', t.active_region) + _tpField('출신 지역', t.origin_region) +
      _tpField('10분당 수수료', t.fee_per_10min ? Number(t.fee_per_10min).toLocaleString('ko-KR') + ' KRW' : null) +
      _tpField('입사일', t.join_date) + _tpField('퇴사일', t.leave_date) +
      _tpField('학력', t.education) + _tpField('경력', t.career) + _tpField('자격증', t.certifications) +
      _tpField('가능 요일', t.available_days) + _tpField('가능 시간', t.available_hours) +
      _tpField('은행', t.bank_name) + _tpField('계좌', t.bank_account) +
      (t.intro_video_url ? '<div style="margin-top:10px"><b>소개 비디오:</b> <a href="' + _aiEsc(t.intro_video_url) + '" target="_blank" style="color:#3b82f6">' + _aiEsc(t.intro_video_url) + '</a></div>' : '') +
      (t.notes ? '<div style="margin-top:10px;padding:10px;background:#f9fafb;border-radius:6px;font-size:13px"><b>메모:</b><br>' + _aiEsc(t.notes).replace(/\n/g,'<br>') + '</div>' : '') +
    '</div></div>';
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div.firstChild);
}
function _tpField(label, val) {
  if (!val) return '';
  return '<div style="display:flex;font-size:13px;padding:4px 0"><div style="min-width:90px;color:#6b7280;font-weight:600">' + label + '</div><div>' + _aiEsc(String(val)) + '</div></div>';
}
async function editTeacherProfile(id) {
  const r = await fetch('/api/admin/teacher-profiles/' + id, { credentials:'include' });
  const d = await r.json().catch(()=>({}));
  if (!r.ok || !d.ok) { alert('조회 실패'); return; }
  const t = d.item;
  // 폼에 값 채우고 펼침
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('tp-name', t.korean_name); set('tp-en-name', t.english_name); set('tp-email', t.email);
  set('tp-phone', t.phone); set('tp-kakao', t.kakao_id); set('tp-dob', t.dob); set('tp-gender', t.gender);
  set('tp-mbti', t.mbti);
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
async function removeTeacherProfile(id, name) {
  if (!confirm('정말 "' + name + '" 강사를 제거하시겠습니까?\n\n⚠️ 데이터가 영구 삭제됩니다.')) return;
  const r = await fetch('/api/admin/teacher-profiles/' + id, { method:'DELETE', credentials:'include' });
  const d = await r.json().catch(()=>({}));
  if (!r.ok || d.ok === false) { alert('제거 실패: ' + (d.error || ('HTTP ' + r.status))); return; }
  alert('✅ 제거 완료: ' + name);
  loadTeacherProfiles();
}

// ── 가맹점 ──────────────────────────────────────────────────────────
async function loadFranchises() {
  const r = await fetch('/api/admin/franchises',{cache:'no-store',credentials:'include'});
  const d = await r.json().catch(()=>({}));
  const tb = document.getElementById('franchises-table');
  if (!d.ok || !d.items || d.items.length === 0) { tb.innerHTML='<tr><td colspan="6" class="empty">—</td></tr>'; _populateFranchiseSelect([]); return; }
  tb.innerHTML = d.items.map(f =>
    `<tr><td>${f.id}</td><td><b>${_esc(f.name)}</b></td><td>${_esc(f.owner_name)||'—'}</td><td>${_esc(f.phone)||'—'}</td><td>${_esc(f.address)||'—'}</td><td>${_esc(f.opened_at)||'—'}</td></tr>`
  ).join('');
  _populateFranchiseSelect(d.items);
}
function _populateFranchiseSelect(items) {
  const sel = document.getElementById('ct-franchise');
  if (!sel) return;
  const placeholder = adminLang==='en' ? 'Select franchise…' : '가맹점 선택…';
  sel.innerHTML = '<option value="">' + placeholder + '</option>' + items.map(f => `<option value="${f.id}">${_esc(f.name)}</option>`).join('');
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

// ── 교육센터 ─────────────────────────────────────────────────────────
async function loadCenters() {
  const r = await fetch('/api/admin/centers',{cache:'no-store',credentials:'include'});
  const d = await r.json().catch(()=>({}));
  const tb = document.getElementById('centers-table');
  if (!d.ok || !d.items || d.items.length === 0) { tb.innerHTML='<tr><td colspan="6" class="empty">—</td></tr>'; return; }
  tb.innerHTML = d.items.map(c =>
    `<tr><td>${c.id}</td><td>${_esc(c.franchise_name)||'—'}</td><td><b>${_esc(c.name)}</b></td><td>${_esc(c.country)||'—'}</td><td>${_esc(c.manager)||'—'}</td><td>${_esc(c.address)||'—'}</td></tr>`
  ).join('');
}
async function addCenter() {
  const e = id => document.getElementById(id);
  const name = (e('ct-name').value||'').trim();
  if (!name) { alert(adminLang==='en'?'Name required':'이름은 필수'); return; }
  const d = await _menuPost('/api/admin/centers', {
    franchise_id: e('ct-franchise').value || null, name,
    country: e('ct-country').value||null, manager: e('ct-manager').value||null,
    address: e('ct-address').value||null
  });
  if (d) { ['ct-name','ct-country','ct-manager','ct-address'].forEach(id=>e(id).value=''); loadCenters(); }
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
  const tb = document.getElementById('leveltest-apps-table');
  if (!tb) return;
  if (!items.length) { tb.innerHTML = '<tr><td colspan="8" class="empty">'+(adminLang==='en'?'No applications yet':'아직 신청이 없습니다')+'</td></tr>'; return; }
  const STMAP = { pending:['대기','Pending','#f59e0b'], done:['완료','Done','#10b981'], cancelled:['취소','Cancelled','#94a3b8'] };
  tb.innerHTML = items.map(a => {
    const st = STMAP[a.status] || [a.status||'—', a.status||'—', '#94a3b8'];
    const stLabel = adminLang==='en' ? st[1] : st[0];
    const when = ((a.desired_date? _esc(a.desired_date) : '') + (a.desired_time? (' '+_esc(a.desired_time)) : '')) || '—';
    const ai = a.ai_score!=null ? Number(a.ai_score).toFixed(0) : '—';
    const pron = a.pron_score!=null ? Number(a.pron_score).toFixed(0) : '—';
    const lvl = a.final_level ? ('<b style="color:#059669">'+_esc(a.final_level)+'</b>') : '—';
    const actions = a.status==='pending'
      ? `<button onclick="leveltestAppStatus(${a.id},'done')" style="padding:3px 8px;font-size:11px;border:0;border-radius:6px;background:#10b981;color:#fff;cursor:pointer;margin-right:4px">${adminLang==='en'?'✅ Done':'✅ 완료'}</button><button onclick="leveltestAppStatus(${a.id},'cancelled')" style="padding:3px 8px;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer">${adminLang==='en'?'✖':'✖ 취소'}</button>`
      : `<button onclick="leveltestAppStatus(${a.id},'pending')" style="padding:3px 8px;font-size:11px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer">${adminLang==='en'?'↩ Reopen':'↩ 되돌리기'}</button>`;
    return `<tr><td>${_fmtDate(a.created_at)}</td><td><b>${_esc(a.student_name)}</b>${a.student_uid?(' <code style="font-size:10px;color:#64748b">'+_esc(a.student_uid)+'</code>'):''}</td><td>${when}</td><td style="text-align:center">${ai}</td><td style="text-align:center">${pron}</td><td style="text-align:center">${lvl}</td><td><span style="font-size:11px;font-weight:700;color:${st[2]}">${stLabel}</span></td><td style="text-align:right;white-space:nowrap">${actions}</td></tr>`;
  }).join('');
}
async function leveltestAppStatus(id, status) {
  const d = await _menuPost('/api/admin/leveltest/applications', { id, status });
  if (d) loadLeveltestApps();
}

// ── 수강신청 ─────────────────────────────────────────────────────────
async function loadEnrollments() {
  const status = document.getElementById('en-status-filter').value;
  const url = '/api/admin/enrollments' + (status ? `?status=${status}` : '');
  const r = await fetch(url,{cache:'no-store',credentials:'include'});
  const d = await r.json().catch(()=>({}));
  const tb = document.getElementById('enrollments-table');
  if (!d.ok || !d.items || d.items.length === 0) { tb.innerHTML='<tr><td colspan="6" class="empty">—</td></tr>'; return; }
  // 🔐 RBAC 스코프 필터
  let _items = d.items;
  if (typeof window.adminScopeFilter === 'function') _items = window.adminScopeFilter(_items, 'enrollments');
  if (!_items.length) { tb.innerHTML='<tr><td colspan="6" class="empty">' + (adminLang==='en'?'No enrollments visible to your role':'권한 범위에 표시할 수강신청이 없습니다') + '</td></tr>'; return; }
  tb.innerHTML = _items.map(en => {
    const fee = en.monthly_fee_krw ? '₩' + Number(en.monthly_fee_krw).toLocaleString() : '—';
    const statusColor = en.status==='active'?'#10b981':en.status==='confirmed'?'#3b82f6':en.status==='pending'?'#f59e0b':en.status==='cancelled'?'#ef4444':'#6b7280';
    return `<tr><td>${_fmtDate(en.created_at)}</td><td><b>${_esc(en.student_name)}</b></td><td>${_esc(en.package)}</td><td style="text-align:right;">${fee}</td><td><span style="color:${statusColor};font-weight:600;">${_esc(en.status)}</span></td>
      <td>
        <button onclick="setEnrollmentStatus(${en.id},'confirmed')" style="padding:2px 6px;font-size:10px;background:#3b82f6;color:#fff;border:none;border-radius:3px;cursor:pointer;">✓</button>
        <button onclick="setEnrollmentStatus(${en.id},'active')"    style="padding:2px 6px;font-size:10px;background:#10b981;color:#fff;border:none;border-radius:3px;cursor:pointer;">▶</button>
        <button onclick="setEnrollmentStatus(${en.id},'cancelled')" style="padding:2px 6px;font-size:10px;background:#ef4444;color:#fff;border:none;border-radius:3px;cursor:pointer;">✕</button>
      </td></tr>`;
  }).join('');
}
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
    'body { font-family: "맑은 고딕", "Malgun Gothic", sans-serif; }' +
    'table { border-collapse: collapse; mso-table-overlap: never; mso-table-lspace: 0; mso-table-rspace: 0; }' +
    'td { font-family: "맑은 고딕", sans-serif; mso-number-format: "\\@"; vertical-align: middle; }' +
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
      'body { font-family: "맑은 고딕", "Malgun Gothic", sans-serif; font-size: 10pt; color: #1f2937; line-height: 1.5; }' +
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
  // 🥭 Phase 26 — 수업 인원 방식 select (1:1, 1:2, 1:3, 1:4, 1:5, 1:6, 1:N)
  const sizeOptionsList = ['1:1', '1:2', '1:3', '1:4', '1:5', '1:6', '1:N'];
  const sizeOpts = '<option value="">—</option>' +
    sizeOptionsList.map(s => '<option value="' + s + '"' + (v.class_size === s ? ' selected' : '') + '>' + s + '</option>').join('');
  // 수업 유형 — 3 체크박스 (레벨/체험/정규)
  const _enrIsEn = (document.documentElement.lang === 'en' || window.adminLang === 'en');
  const _typeLbl = _enrIsEn ? { level:'Level', trial:'Trial', regular:'Regular' } : { level:'레벨', trial:'체험', regular:'정규' };
  const typeChecks =
    '<label style="font-size:11px;margin-right:6px;cursor:pointer"><input type="checkbox" class="en-row-type" value="level"' + (types.includes('level')?' checked':'') + ' style="margin-right:2px;vertical-align:middle"/>'+_typeLbl.level+'</label>' +
    '<label style="font-size:11px;margin-right:6px;cursor:pointer"><input type="checkbox" class="en-row-type" value="trial"' + (types.includes('trial')?' checked':'') + ' style="margin-right:2px;vertical-align:middle"/>'+_typeLbl.trial+'</label>' +
    '<label style="font-size:11px;cursor:pointer"><input type="checkbox" class="en-row-type" value="regular"' + (types.includes('regular')?' checked':'') + ' style="margin-right:2px;vertical-align:middle"/>'+_typeLbl.regular+'</label>';
  // 요일 — 7 체크박스 (월화수목금토일)
  const dayCodes = ['mon','tue','wed','thu','fri','sat','sun'];
  const dayLabels = _enrIsEn ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['월','화','수','목','금','토','일'];
  const dayChecks = dayCodes.map((c, i) =>
    '<label style="font-size:11px;margin-right:3px;cursor:pointer"><input type="checkbox" class="en-row-day" value="' + c + '"' + (days.includes(c)?' checked':'') + ' style="margin-right:1px;vertical-align:middle"/>' + dayLabels[i] + '</label>'
  ).join('');

  tr.innerHTML =
    '<td style="padding:4px 6px;border:1px solid #e5e7eb;text-align:center;color:#9ca3af;font-size:11px">' + idx + '</td>' +
    '<td style="padding:4px 6px;border:1px solid #e5e7eb"><input class="en-row-name" placeholder="홍길동" value="' + (v.name||'') + '" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px" /></td>' +
    '<td style="padding:4px 6px;border:1px solid #e5e7eb"><input class="en-row-uid" placeholder="user001" value="' + (v.uid||'') + '" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px" /></td>' +
    '<td style="padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap">' + typeChecks + '</td>' +
    '<td style="padding:4px 6px;border:1px solid #e5e7eb"><input class="en-row-package" placeholder="'+(_enrIsEn?'1-Year Regular Class':'1년 정규반')+'" value="' + (v.package||'') + '" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px" /></td>' +
    '<td style="padding:4px 6px;border:1px solid #e5e7eb"><input class="en-row-fee" type="number" placeholder="350000" value="' + (v.fee||'') + '" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px" /></td>' +
    '<td style="padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap">' + dayChecks + '</td>' +
    '<td style="padding:4px 6px;border:1px solid #e5e7eb;white-space:nowrap">' +
      '<input class="en-row-time" type="text" placeholder="'+(_enrIsEn?'10:30 or Mon 7:30, Wed 8:00':'10:30 또는 월7:30,수8:00')+'" value="' + (v.time||'') + '" ' +
        'title="'+(_enrIsEn?'Single time (e.g. 10:30) or per-day time (e.g. Mon 7:30, Wed 8:00)':'단일 시간(예: 10:30) 또는 요일별 시간(예: 월 7:30, 수 8:00)')+'" ' +
        'style="width:calc(100% - 28px);padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px" />' +
      '<button type="button" class="en-row-time-builder" title="요일별 시간 다르게 설정" ' +
        'style="width:24px;height:24px;margin-left:2px;padding:0;background:#fef3c7;border:1px solid #f59e0b;border-radius:4px;cursor:pointer;font-size:12px;vertical-align:middle">⏰</button>' +
    '</td>' +
    '<td style="padding:4px 6px;border:1px solid #e5e7eb"><select class="en-row-size" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px">' + sizeOpts + '</select></td>' +
    '<td style="padding:4px 6px;border:1px solid #e5e7eb"><input class="en-row-start" type="date" value="' + (v.start||'') + '" style="width:100%;padding:4px 6px;border:1px solid #e5e7eb;border-radius:4px;font-size:12px" /></td>' +
    '<td style="padding:4px 6px;border:1px solid #e5e7eb;text-align:center"><button type="button" class="en-row-del" title="이 행 삭제" style="background:transparent;border:0;color:#ef4444;font-size:14px;cursor:pointer;padding:0 6px">✕</button></td>';
  tbody.appendChild(tr);
  // 행 삭제 — 마지막 1행은 항상 유지
  tr.querySelector('.en-row-del').addEventListener('click', () => {
    if (tbody.children.length <= 1) {
      tr.querySelectorAll('input[type="text"], input[type="number"], input[type="date"]').forEach(inp => inp.value = '');
      tr.querySelectorAll('input[type="checkbox"]').forEach(inp => inp.checked = false);
      const sel = tr.querySelector('select'); if (sel) sel.value = '';
    } else {
      tr.remove();
      _renumberEnrollmentRows();
    }
  });
  // 🥭 Phase 32 — ⏰ 버튼 클릭 시 요일별 시간 빌더 모달 오픈
  tr.querySelector('.en-row-time-builder').addEventListener('click', () => {
    _openTimeBuilder(tr);
  });
  if (prefill === undefined) {
    setTimeout(() => { const inp = tr.querySelector('.en-row-name'); if (inp) inp.focus(); }, 0);
  }
}

// 🥭 Phase 32 — 요일별 시간 빌더 모달
function _openTimeBuilder(tr) {
  const dayCodes = ['mon','tue','wed','thu','fri','sat','sun'];
  const dayLabels = ['월','화','수','목','금','토','일'];
  // 현재 행의 요일 체크 상태
  const checkedDays = Array.from(tr.querySelectorAll('.en-row-day:checked')).map(c => c.value);
  // 현재 시간 입력값 파싱
  const currentTime = (tr.querySelector('.en-row-time')?.value || '').trim();
  const parsed = _parseScheduleText(currentTime);
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
      '<div style="display:grid;grid-template-columns:60px 1fr;gap:6px;align-items:center">';
  dayCodes.forEach((code, i) => {
    const isChecked = checkedDays.includes(code) || parsed[code];
    const t = parsed[code] || '';
    html +=
      '<label style="font-weight:700;color:#1f2937;display:flex;align-items:center;gap:6px;cursor:pointer">' +
        '<input type="checkbox" class="tb-day" data-code="' + code + '" ' + (isChecked?'checked':'') + ' style="margin:0;cursor:pointer">' +
        dayLabels[i] +
      '</label>' +
      '<input type="time" step="600" class="tb-time" data-code="' + code + '" value="' + t + '" placeholder="시간" ' +
        'style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px" />';
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
  const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
  // 모두 같은 시간 — prompt 로 시간 입력 받아 모든 체크된 요일에 적용
  overlay.querySelector('#tb-same-time').addEventListener('click', () => {
    const t = prompt('모든 체크된 요일에 적용할 시간 (HH:MM):', '10:30');
    if (!t) return;
    overlay.querySelectorAll('.tb-day:checked').forEach(chk => {
      const code = chk.dataset.code;
      const tin = overlay.querySelector('.tb-time[data-code="' + code + '"]');
      if (tin) tin.value = t;
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
      const tin = overlay.querySelector('.tb-time[data-code="' + code + '"]');
      const t = (tin?.value || '').trim();
      if (t) result.push({ day: code, time: t });
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
    const name = (tr.querySelector('.en-row-name')?.value || '').trim();
    const uid = (tr.querySelector('.en-row-uid')?.value || '').trim();
    const pkg = (tr.querySelector('.en-row-package')?.value || '').trim();
    const fee = tr.querySelector('.en-row-fee')?.value || '';
    const start = tr.querySelector('.en-row-start')?.value || '';
    const time = tr.querySelector('.en-row-time')?.value || '';
    const classSize = tr.querySelector('.en-row-size')?.value || '';
    const types = Array.from(tr.querySelectorAll('.en-row-type:checked')).map(c => c.value);
    const days  = Array.from(tr.querySelectorAll('.en-row-day:checked')).map(c => c.value);
    // 빈 행 건너뜀 (이름·유형·패키지 모두 비어있으면)
    if (!name && types.length === 0 && !pkg) return;
    // 사람이 읽을 수 있는 한글 레이블
    const typesKo = types.map(t => TYPE_LABELS[t] || t);
    const daysKo  = days.map(d => DAY_LABELS[d] || d);
    // 분류 — 레벨테스트 만 vs 모두 vs 부분
    let category = '';
    if (types.length === 1 && types[0] === 'level') category = 'test_only';
    else if (types.length === 3) category = 'full';
    else if (types.length > 0) category = types.join('+');
    out.push({
      student_name: name,
      student_user_id: uid || null,
      package: pkg || (typesKo.join('+') || '미정'), // 패키지 비어있으면 유형으로 자동 채움
      monthly_fee_krw: fee ? parseInt(fee, 10) : null,
      started_at: start ? new Date(start).getTime() : null,
      // 추가 메타 (자동 export·import 시 사용)
      _types: types,
      _types_ko: typesKo,
      _days: days,
      _days_ko: daysKo,
      _time: time,
      _class_size: classSize,
      _started_at_str: start,
      _fee_raw: fee,
      _category: category
    });
  });
  return out;
}

async function addEnrollment() {
  const records = _readEnrollmentRows();
  const status = document.getElementById('en-multi-status');
  if (records.length === 0) {
    alert(adminLang==='en' ? 'Add at least one student row' : '최소 1명 이상의 학생 정보를 입력해 주세요.');
    return;
  }
  // 검증 — 이름 + 수업 유형 최소 1개 필수
  const invalid = records.filter(r => !r.student_name || !r._types || r._types.length === 0);
  if (invalid.length > 0) {
    alert((adminLang==='en' ? 'Missing required (name + at least 1 type): ' : '필수 항목 누락 (이름 + 수업 유형 최소 1개): ') + invalid.length + '건');
    return;
  }
  // N=1 이면 단일 등록 + Phase 22 자동 export, N>1 이면 일괄 등록
  if (records.length === 1) {
    const r = records[0];
    if (status) status.textContent = '⏳ 등록 중…';
    const d = await _menuPost('/api/admin/enrollments', {
      student_name: r.student_name,
      student_user_id: r.student_user_id,
      package: r.package,
      monthly_fee_krw: r.monthly_fee_krw,
      started_at: r.started_at
    });
    if (d) {
      const enrollmentData = {
        id: d.id || d.enrollment_id || ('enroll_' + Date.now()),
        student_name: r.student_name,
        student_user_id: r.student_user_id || '—',
        package: r.package,
        monthly_fee_krw: r.monthly_fee_krw || 0,
        started_at: r._started_at_str || new Date().toISOString().slice(0,10),
        types_ko: (r._types_ko || []).join(', ') || '—',
        days_ko: (r._days_ko || []).join('') || '—',
        time: r._time || '—',
        class_size: r._class_size || '—',
        category: r._category || '',
        created_at: new Date().toISOString().slice(0,19).replace('T', ' ')
      };
      autoExportEnrollment(enrollmentData);
      // 행 초기화
      document.getElementById('en-multi-rows').innerHTML = '';
      _addEnrollmentRow();
      if (status) status.textContent = '✅ 1명 등록 완료';
      loadEnrollments();
    } else {
      if (status) status.textContent = '❌ 등록 실패';
    }
    return;
  }

  // N>1 — 일괄 등록 (Phase 23 의 _bulkRegisterEnrollments 와 동일 패턴)
  if (!confirm((adminLang==='en' ? 'Register ' : '') + records.length + (adminLang==='en' ? ' students at once?' : '명 학생을 동시에 등록하시겠습니까?'))) return;
  if (status) status.textContent = '⏳ 일괄 등록 중… (0 / ' + records.length + ')';
  let ok = 0, fail = 0; const errs = [];
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
          package: r.package,
          monthly_fee_krw: r.monthly_fee_krw,
          started_at: r.started_at
        })
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok !== false) {
        ok++;
        successList.push(r);
      } else {
        fail++;
        errs.push(r.student_name + ': ' + (j.error || ('HTTP ' + res.status)));
      }
    } catch (e) {
      fail++; errs.push(r.student_name + ': ' + (e.message || e));
    }
    if (status) status.textContent = '⏳ 일괄 등록 중… (' + (i+1) + ' / ' + records.length + ')';
  }
  if (status) status.textContent = '✅ 성공 ' + ok + '명 / 실패 ' + fail + '명';
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
    '<style>body{font-family:"Malgun Gothic",sans-serif;font-size:11pt;padding:30px}' +
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
    '<style>body{font-family:"Malgun Gothic",sans-serif;font-size:11pt;padding:30px;}' +
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
  const r = await fetch('/api/admin/enrollments/'+id, {method:'PATCH',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({status})});
  const d = await r.json().catch(()=>({}));
  if (!r.ok || d.ok === false) { alert((adminLang==='en'?'Failed: ':'실패: ')+(d.error||('HTTP '+r.status))); return; }
  loadEnrollments();
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
  return {
    student_name: name,
    student_user_id: (raw.student_user_id || '').trim() || null,
    package: pkg || '미정',
    monthly_fee_krw: feeNum,
    started_at: startMs,
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

async function _bulkRegisterEnrollments(records) {
  const box = document.getElementById('en-import-preview');
  if (box) box.innerHTML = '<div style="color:#9a3412">⏳ 등록 중… (' + records.length + '건)</div>';
  let ok = 0, fail = 0; const errs = [];
  for (const r of records) {
    try {
      const res = await fetch('/api/admin/enrollments', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r)
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok !== false) ok++;
      else { fail++; errs.push(r.student_name + ': ' + (j.error || ('HTTP ' + res.status))); }
    } catch (e) {
      fail++; errs.push(r.student_name + ': ' + (e.message || e));
    }
  }
  if (box) {
    box.innerHTML = '<div style="font-size:13px"><b>✅ 등록 완료 — 성공 ' + ok + '건 / 실패 ' + fail + '건</b>' +
      (errs.length ? '<div style="margin-top:6px;color:#dc2626;font-size:11px">실패 상세:<br>' + errs.map(_aiEsc).join('<br>') + '</div>' : '') +
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
  tb.innerHTML = '<tr><td colspan="6" class="empty">📥 불러오는 중…</td></tr>';

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

  console.log('[ph240] 교재 표 — D1 ' + srvCount + ' + IDB ' + idbCount + ' + 서버파일 ' + srvFileCount + '개 = 표시 ' + items.length + '그룹');

  if (items.length === 0) {
    var fb0 = document.getElementById('tb-filter-bar'); if (fb0) fb0.innerHTML = '';
    tb.innerHTML = '<tr><td colspan="6" class="empty">📭 교재 없음 — 위 [교재 폴더 업로더] 로 추가하거나 [+ 교재 등록] 으로 수동 등록</td></tr>';
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
  var fixed = ['전체교재', 'Phonics', 'MES', 'BTS', 'SIU', '중국어 마스터'];
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
  // fix (2026-06-02) — '전체교재' 접힘 상태면 목록 숨김 (전체교재 다시 누르면 펼쳐짐)
  if (window._tbCollapsed) {
    tb.innerHTML = '<tr><td colspan="6" class="empty" style="cursor:pointer;color:#93c5fd" onclick="(function(){window._tbCollapsed=false;_tbRenderChips(window._tbItems||[]);_tbRenderRows(window._tbActiveFilter);})()">📁 목록이 접혀 있습니다 — \'전체교재\'를 다시 누르거나 여기를 클릭하면 펼쳐집니다</td></tr>';
    return;
  }
  var items = (window._tbItems || []).filter(function(t){ return _tbItemMatches(t, key); });
  function srcChip(src) {
    if (src === 'idb') return '<span style="display:inline-block;padding:2px 7px;background:rgba(16,185,129,0.22);color:#86efac;border-radius:99px;font-size:10.5px;font-weight:800;margin-left:6px" title="브라우저 IndexedDB — 폴더 업로더로 저장됨">💾 내 PC</span>';
    return '<span style="display:inline-block;padding:2px 7px;background:rgba(59,130,246,0.22);color:#93c5fd;border-radius:99px;font-size:10.5px;font-weight:800;margin-left:6px" title="서버 — 모든 기기에서 보임">☁ 서버</span>';
  }
  if (items.length === 0) {
    tb.innerHTML = '<tr><td colspan="6" class="empty">📭 "' + _esc(key) + '" 교재 없음</td></tr>';
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
    '</tr>';
  }).join('');
}
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
  var tname = '교사';
  try {
    var r = await fetch('/api/admin/me', { credentials:'include' });
    var j = await r.json().catch(function(){ return null; });
    if (j && j.ok && j.user) tname = j.user.name || j.user.username || '교사';
  } catch(_){}
  if (nameEl) nameEl.textContent = tname;
  var displayName = '교사 ' + tname;
  // 🌟 (2026-07-05) vc_role=teacher 명시 — 실시간 칭찬 포인트에서 강사로 확정 인식(별 버튼 노출).
  var src = '/?vc_autojoin=1&vc_role=teacher&vc_room=' + encodeURIComponent('mangoi-class') + '&vc_name=' + encodeURIComponent(displayName);
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
let _smSort = [{ key: 'last_seen', dir: 'desc' }];          // 정렬 배열 (우선순위 순)
let _smSearch = '';                                         // 🔍 검색어 (학생명·아이디)
let _smCountBase = '';                                      // 전체 인원수 라벨 (검색 시 "N명 / 전체" 표시용)

// 🔒 역할별 데이터 범위 판별 — 지사/대리점/교사/학부모/학생은 자기 범위만
function mangoiGetDataScope(){
  try {
    var role;
    var sim = localStorage.getItem('mangoi_user_role');
    if (sim){ var M={hq_exec:'exec',hq_mgr:'mgr',hq_teacher:'teacher',franchise:'franchise',branch:'branch',agency:'agency',parent:'parent',student:'student'}; role=M[sim]||sim; }
    else {
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

async function loadStudentList() {
  const _L = adminLang === 'en';
  const tb = document.getElementById('sm-students-tbody');
  const cnt = document.getElementById('sm-students-count');
  if (!tb) return;
  tb.innerHTML = '<tr><td colspan="19" class="empty">' + (_L?'Loading...':'불러오는 중...') + '</td></tr>';
  let seedStudents = [];
  let apiItems = [];
  let _dataSource = 'D1';
  let d = null;
  // 1차: Neo4j 그래프 DB 실데이터 (/api/admin/students/graph-list)
  //   미설정(503)·연결 실패(502)·빈 결과·비본사 403 이면 조용히 D1(unified)로 폴백
  try {
    const rg = await fetch('/api/admin/students/graph-list?limit=1000', { cache: 'no-store', credentials: 'include' });
    const dg = await rg.json();
    if (rg.ok && dg && dg.ok && Array.isArray(dg.students) && dg.students.length) {
      d = dg; _dataSource = 'Neo4j';
    } else if (dg && dg.error) {
      console.warn('[students] 그래프DB 폴백 (D1 사용):', dg.error);
    }
  } catch (e) { console.warn('[students] 그래프DB 접속 실패 — D1 폴백:', e); }
  try {
    if (!d) {
      const _scope = (typeof mangoiGetDataScope==='function') ? mangoiGetDataScope() : null;
      const _su = '/api/admin/students/unified' + (_scope ? ('?scope_field='+encodeURIComponent(_scope.field)+'&scope_value='+encodeURIComponent(_scope.value)) : '');
      const r = await fetch(_su, { cache: 'no-store', credentials: 'include' });
      d = await r.json();
    }
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
  } catch (e) {}
  let merged = apiItems;
  // 🔐 RBAC 스코프 필터 — 본사는 모두, 지사는 산하 대리점만, 대리점은 자기 학생만
  if (typeof window.adminScopeFilter === 'function') merged = window.adminScopeFilter(merged, 'students');
  if (!merged.length) {
    tb.innerHTML = '<tr><td colspan="19" class="empty">' + (_L?'No students yet':'아직 학생 데이터 없음') + '</td></tr>';
    return;
  }
  _smStudents = merged.map(s => ({
    ...s,
    session_count: Number(s.sessions || 0),
    _username_lc: String(s.username || s.user_id || '').toLowerCase()
  }));
  _smCountBase = (_L ? _smStudents.length + ' students' : _smStudents.length + '명')
    + (_dataSource === 'Neo4j' ? (_L ? ' · 🕸️ Graph DB' : ' · 🕸️ 그래프DB 실데이터') : (_L ? ' · D1' : ' · D1'));
  if (cnt) cnt.textContent = _smCountBase;
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

  // 🔍 검색 필터 — 학생명·아이디 부분일치 (대소문자 무시)
  const _q = String(_smSearch || '').trim().toLowerCase();
  const _filtered = _q
    ? _smStudents.filter(s => s._username_lc.indexOf(_q) >= 0 || String(s.user_id || '').toLowerCase().indexOf(_q) >= 0)
    : _smStudents;

  // 인원수 라벨 — 검색 중이면 "검색 N명 / 전체" 로 표시
  const _cntEl = document.getElementById('sm-students-count');
  if (_cntEl && _smCountBase) {
    _cntEl.textContent = _q
      ? (_L ? ('🔍 ' + _filtered.length + ' found / ' + _smCountBase) : ('🔍 검색 ' + _filtered.length + '명 / 전체 ' + _smCountBase))
      : _smCountBase;
  }

  if (!_filtered.length) {
    tb.innerHTML = '<tr><td colspan="19" class="empty">' + (_L ? 'No matching students' : '검색 결과가 없습니다 — “' + _esc(_q) + '”') + '</td></tr>';
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
  tb.innerHTML = arr.map(s => {
    const uid = String(s.user_id || '');
    const uidEnc = encodeURIComponent(uid);
    const safeUid  = _esc(uid);
    const safeName = _esc(s.username || uid);
    return `<tr>
      <td title="${safeUid}"><code>${safeUid}</code></td>
      <td><b>${safeName}</b></td>
      <td style="text-align:center"><a href="/admin/student?uid=${uidEnc}" target="_blank">🎓 ${_L?'Details':'상세'}</a></td>
      <td>${_c(s.payment_type)}</td>
      <td>${_d(s.signup_date)}</td>
      <td>${_d(s.end_date)}</td>
      <td>${_c(s.summary)}</td>
      <td>${splitDt(s.created_at)}</td>
      <td style="text-align:right">${_c(s.classes_per_week)}</td>
      <td style="text-align:right">${(Number(s.points)||0).toLocaleString()}</td>
      <td>${_c(s.enroll_req)}</td>
      <td>${_c(_piiPhone(s.student_phone))}</td>
      <td>${_c(_piiPhone(s.parent_phone))}</td>
      <td>${_c(_piiPhone(s.teacher_phone))}</td>
      <td>${_c(s.shop_name)}</td>
      <td>${_c(s.hq_name)}</td>
      <td>${_c(s.branch2_name)}</td>
      <td style="text-align:right"><span class="sess-count">${(s.session_count||0).toLocaleString()}</span></td>
      <td>${_c(s.status)}</td>
    </tr>`;
  }).join('');
}

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
  if (btn) btn.addEventListener('click', loadStudentList);
  // 🔍 학생명·아이디 검색 — 입력 즉시 필터링
  const sr = document.getElementById('sm-student-search');
  if (sr) sr.addEventListener('input', () => { _smSearch = sr.value; renderStudentTable(); });
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

/* ════════════════════════════════════════════════════════════
   Phase 13 — 학생관리 집계 뷰 5종 (전체 학생 가로 보기)
   - 만료 임박 / 오늘 출결 / 연속 출석 랭킹 / 최근 상담 / 단체 톡짹톡
   - 모든 행에 🔍 자세히 버튼 → /admin/student?uid=X&tab=Y
════════════════════════════════════════════════════════════ */

// 공통: students_erp 캐시 (한 번 fetch 후 재사용 — 시드 갱신 시 무효화 가능)
let _erpCache = null;
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
  try {
    const r = await fetch('/api/admin/students/erp-list?limit=2000', { credentials:'include' });
    const j = await r.json();
    if (window.PIIMask && j && typeof j.can_view_pii !== 'undefined') PIIMask.setCanView(j.can_view_pii);  // 🔒 PII 권한 반영
    _erpCache = (j && j.ok && j.items) || [];
  } catch { _erpCache = []; }
  try { window._erpCache = _erpCache; } catch{}
  return _erpCache;
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
    tb.innerHTML = '<tr><td colspan="5" class="empty">'+(currentLang==='en'?'No data — run 🔁 Recompute all first':'데이터 없음 — 🔁 일괄 재계산을 먼저 실행하세요')+'</td></tr>';
    return;
  }
  tb.innerHTML = items.map((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i+1)+'.';
    const uid = r.student_uid || r.uid;
    const name = (nameMap && nameMap[uid]) || uid;
    return `<tr>
      <td>${medal}</td>
      <td>${escSm(name)}</td>
      <td><strong style="color:#f59e0b">${r.current_streak||0}</strong>${currentLang==='en'?'d':'일'}</td>
      <td>${r.longest_streak||0}${currentLang==='en'?'d':'일'}</td>
      <td>${drillBtn(uid, 'streak')}</td>
    </tr>`;
  }).join('');
}
async function loadStreakRanking() {
  const tb = document.getElementById('sm-streak-tbody');
  const cnt = document.getElementById('sm-streak-count');
  tb.innerHTML = '<tr><td colspan="5" class="empty">'+(currentLang==='en'?'Loading…':'불러오는 중…')+'</td></tr>';
  try {
    const [lb, nameMap] = await Promise.all([
      fetch('/api/streak/leaderboard', { credentials:'include' }).then(x=>x.json()).catch(()=>({ ok:false })),
      _streakNameMap(),
    ]);
    const items = (lb && lb.items) || [];
    cnt.textContent = (currentLang==='en'?'Top ':'상위 ') + items.length + (currentLang==='en'?'':'명');
    _renderStreakRows(items, nameMap);
  } catch {
    tb.innerHTML = '<tr><td colspan="5" class="empty">'+(currentLang==='en'?'Load failed':'불러오기 실패')+'</td></tr>';
  }
}
async function reconcileStreaks() {
  const tb = document.getElementById('sm-streak-tbody');
  const cnt = document.getElementById('sm-streak-count');
  const btn = document.getElementById('sm-streak-reconcile');
  const label = currentLang==='en' ? '🔁 Recompute all' : '🔁 일괄 재계산';
  if (btn) { btn.disabled = true; btn.textContent = currentLang==='en'?'Recomputing…':'재계산 중…'; }
  tb.innerHTML = '<tr><td colspan="5" class="empty">'+(currentLang==='en'?'Recomputing all students…':'전 학생 재계산 중…')+'</td></tr>';
  try {
    const [rc, nameMap] = await Promise.all([
      fetch('/api/admin/streak/reconcile', { method:'POST', credentials:'include' }).then(x=>x.json()).catch(()=>({ ok:false })),
      _streakNameMap(),
    ]);
    if (!rc || !rc.ok) {
      tb.innerHTML = '<tr><td colspan="5" class="empty">'+(currentLang==='en'?'Reconcile failed (admin only)':'재계산 실패 (관리자 전용)')+'</td></tr>';
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
  if (e('fr-add-btn'))      e('fr-add-btn').addEventListener('click', addFranchise);
  if (e('ct-add-btn'))      e('ct-add-btn').addEventListener('click', addCenter);
  if (e('lt-add-btn'))      e('lt-add-btn').addEventListener('click', addLevelTest);
  // 🥭 Phase 34 — 강사 정보 CRUD 버튼
  if (e('tp-add-btn'))          e('tp-add-btn').addEventListener('click', addTeacherProfile);
  if (e('tp-clear-btn'))        e('tp-clear-btn').addEventListener('click', () => {
    clearTeacherForm();
    const btn = e('tp-add-btn');
    if (btn) { btn.textContent = '＋ 강사 등록'; delete btn.dataset.editId; }
  });
  if (e('tp-refresh-btn'))      e('tp-refresh-btn').addEventListener('click', loadTeacherProfiles);
  if (e('tp-filter-status'))    e('tp-filter-status').addEventListener('change', loadTeacherProfiles);
  if (e('tp-filter-group'))     e('tp-filter-group').addEventListener('change', loadTeacherProfiles);
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
  // 모달 배경 클릭으로 닫기
  if (e('eval-modal-bg')) e('eval-modal-bg').addEventListener('click', (ev) => {
    if (ev.target.id === 'eval-modal-bg') closeEvalModal();
  });
  // 평가 점수 입력 시 미리보기 갱신
  ['ev-instruction', 'ev-retention', 'ev-punctuality', 'ev-admin', 'ev-contribution'].forEach(id => {
    if (e(id)) e(id).addEventListener('input', updateEvalPreview);
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
  const label = nextStatus === 'deleted' ? (_L?'delete':'삭제')
              : nextStatus === 'ended'   ? (_L?'restore':'복원')
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
      alert((_L ? 'Failed: ' : '실패: ') + (body.error || ('HTTP ' + r.status)));
      return;
    }
    loadRecordings();
  } catch (e) {
    alert((_L ? 'Network error: ' : '네트워크 에러: ') + e.message);
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

async function testR2() {
  const el = document.getElementById('test-r2-result');
  el.textContent = adminLang==='en'?'Testing...':'테스트 중...';
  el.style.color = '#94a3b8';
  try {
    const r = await fetch('/api/recordings/test-r2');
    const d = await r.json();
    if (d.ok) {
      const recCount = (d.recordingFiles || []).length;
      el.style.color = '#22c55e';
      el.textContent = adminLang==='en'
        ? '✅ R2 (Cloudflare Object Storage) OK! Read/Write OK. Files: ' + recCount
        : '✅ R2 (Cloudflare 객체 저장소) 연결 성공! 쓰기/읽기 OK. 녹화 파일: ' + recCount + '개';
      if (recCount > 0) {
        el.textContent += ' — ' + d.recordingFiles.map(f => f.key + ' (' + (f.size/1024).toFixed(0) + 'KB)').join(', ');
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
Promise.allSettled([
  load(), loadRecordings(), loadRetention(), loadActiveRooms(), loadNotifications(), loadStorageStats(), loadPayrollRates(),
  loadFranchises(), loadCenters(), loadLevelTests(), loadLeveltestApps(), loadEnrollments(), loadCommunity(), loadTextbooks()
]);
// 활성 방 목록 15초마다 자동 갱신
setInterval(loadActiveRooms, 15000);

// ============================================================================
// 🔍 통합 검색 (메뉴 + 학생·교사·가맹점·센터·수강·교재 등 모든 데이터)
// ============================================================================
let _menuIndex = [];          // [{el, ko, en, idx}]
let _globalSearchIndex = [];  // [{ kind, kindLabel, label, sub, action }]

function buildMenuIndex() {
  _menuIndex = [];
  document.querySelectorAll('details.menu-card').forEach((d, idx) => {
    // 🔐 RBAC: display:none 인 카드는 사이드바에 안 띄움
    if (d.style.display === 'none') return;
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
    { kw:'지사 대리점 정산 정산통계 branch agency', card:'card-settlement-stats', label:'지사·대리점·정산 통계' },
    { kw:'재무 회계 매출 지출 손익 정산 accounting finance', card:'card-accounting-mgmt', label:'재무·회계 관리' },
    { kw:'권한 권한설정 역할 접근 permission role', card:'card-permissions', label:'권한 설정' },
    { kw:'학생 학생관리 수강생 student', card:'card-students-mgmt', label:'학생 관리' },
    { kw:'교사 강사 강사관리 선생 선생님 teacher', card:'card-teacher-mgmt', label:'강사 관리' },
    { kw:'포인트 기프트 기프티콘 상점 리워드 적립 point', card:'card-points-mgmt', label:'포인트 관리' },
    { kw:'출석 출결 qr 체크 attendance', card:'card-auto-attendance', label:'출결 관리' },
    { kw:'공지 공지사항 게시판 알림글 notice', card:'card-notice-board', label:'공지사항' },
    { kw:'카카오 알림톡 카톡 kakao', card:'card-kakao-mgmt', label:'카카오 알림톡' },
    { kw:'푸시 웹푸시 알림 push notification', card:'card-webpush-mgmt', label:'웹푸시 알림' },
    { kw:'mbti 매칭 성향 mbti', card:'card-mbti-mgmt', label:'MBTI 매칭' },
    { kw:'배틀 대결 battle', card:'card-battle-mgmt', label:'영어 배틀' },
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
    { kw:'녹화 녹화본 활성방 recording', card:'card-active-rooms', label:'녹화·활성 방' },
    { kw:'가족 가족계정 family', card:'card-family-mgmt', label:'가족 계정' },
    { kw:'동영상 비디오 영상 유튜브 youtube 비디오관리 video', card:'sub-mango-videos', label:'망고아이 비디오 관리 (YouTube)' },
    { kw:'자막 사전 비디오자막 subtitle', card:'card-video-dict', label:'비디오 자막·사전' },
    { kw:'콘텐츠 컨텐츠 교재 자료 content', card:'card-textbooks', label:'교재 콘텐츠 관리' },
    { kw:'갤러리 사진 영상갤러리 gallery', card:'card-gallery', label:'사진·영상 갤러리' },
    { kw:'수강신청 수강 등록 enrollment', card:'card-students-mgmt', label:'학생·수강 관리' },
    { kw:'결제 수납 입금 payment', card:'card-accounting-mgmt', label:'결제·회계' },
    { kw:'레벨테스트 레벨 테스트 level', card:'card-students-mgmt', label:'학생 관리(레벨)' },
    { kw:'법인카드 법인 카드내역 카드사용 지출 지출내역 경비 corpcard', card:'acc-corpcard', label:'법인카드 사용내역 (지출)' },
    { kw:'강의실 입장 테스트 장비점검 웹캠 마이크 점검 테스트하네스 진단 test', card:'card-classroom-test', label:'강의실 입장·장비 점검 테스트' }
  ];
  MENU_ALIASES.forEach(function(a){
    var el = document.getElementById(a.card);
    if (!el || el.style.display === 'none') return;  // RBAC 숨김 카드는 제외
    _globalSearchIndex.push({
      kind:'menu', kindLabelKo:'📋 바로가기', kindLabelEn:'📋 Shortcut',
      label: a.label, labelEn: a.label,
      sub: a.kw,                       // 유사어 — 검색 매칭용
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
    { url: '/api/admin/franchises',       kindKo: '🏬 가맹점',     kindEn: '🏬 Franchise',    items: 'items',
      label: f => f.name,
      sub:   f => f.owner_name || '',
      action: () => jumpToMenuByLabelMatch('가맹점') },
    { url: '/api/admin/centers',          kindKo: '🏫 교육센터',   kindEn: '🏫 Center',       items: 'items',
      label: c => c.name,
      sub:   c => c.country || '',
      action: () => jumpToMenuByLabelMatch('교육센터') },
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
  'card-battle-mgmt':      'student',   // 🎮 영어 배틀 P2P → 학생
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
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // 시각적 강조 — 렌더 안정 후(rAF x2) 배경 틴트+링 글로우 펄스 (2026-06-12)
  requestAnimationFrame(() => { requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: 'auto', block: 'start' }); /* 렌더 후 위치 재보정 */
    el.classList.remove('ph96-highlight');
    void el.offsetWidth; /* 애니메이션 재시작 */
    el.classList.add('ph96-highlight');
    setTimeout(() => { el.classList.remove('ph96-highlight'); }, 3600);
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
  const matchBy = (needle) => _globalSearchIndex.filter(it =>
    (it.label    || '').toLowerCase().includes(needle) ||
    (it.labelEn  || '').toLowerCase().includes(needle) ||
    (it.sub      || '').toLowerCase().includes(needle)
  );
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
  // 정렬: (1) 메뉴 최우선  (2) 매칭 위치 앞쪽  (3) 짧은 이름
  return hits.sort((a, b) => {
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
          const w = window.open(res.external_url, '_blank', 'noopener');
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
        '<a href="/admin/students.html" class="ai-action-confirm-btn" style="flex:1;min-width:140px;text-align:center;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px">👥 학생관리 열기</a>';
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
(function setupAiGreeting() {
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

// 페이지 로드 시 메뉴 인덱스 빌드 + 통합 색인 비동기로 빌드
buildMenuIndex();
// 통합 색인은 데이터 fetch 가 시간 걸리므로 background 로 빌드. 빌드 중에도 메뉴는 검색 가능.
setTimeout(() => {
  buildGlobalIndex().then(() => {
    console.log('[search] global index built:', _globalSearchIndex.length, 'items');
  });
}, 800);
// 색인 재빌드용 헬퍼 (등록·삭제 후 호출하면 됨)
window.rebuildGlobalSearchIndex = function() {
  buildMenuIndex();
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
      <style>body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;color:#111;padding:30px;text-align:center}.spinner{display:inline-block;width:36px;height:36px;border:4px solid #e5e7eb;border-top-color:#fb923c;border-radius:50%;animation:s 0.8s linear infinite;margin-bottom:14px}@keyframes s{to{transform:rotate(360deg)}}</style>
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
        body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;color:#111;padding:24px;max-width:1000px;margin:0 auto;background:#fff}
        h1{font-size:24px;margin:0 0 4px;border-bottom:3px solid #fb923c;padding-bottom:8px}
        h2{font-size:16px;color:#374151;margin:20px 0 8px}
        .meta{color:#6b7280;font-size:12px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;margin:10px 0;font-size:13px}
        th{background:#f3f4f6;padding:8px 10px;text-align:left;border-bottom:2px solid #d1d5db;font-weight:700}
        td{padding:8px 10px;border-bottom:1px solid #e5e7eb}
        td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
        tr.total td{background:#fef3c7;font-weight:800;border-top:2px solid #f59e0b}
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
        .toolbar .csv{background:#10b981;color:#fff}
        .toolbar .close{background:#6b7280;color:#fff}
        @media print{.toolbar{display:none}body{padding:0}}
        .footer{margin-top:30px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;text-align:center}
      </style>`;
    const toolbar = `<div class="toolbar">
        <button class="print" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
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
    const s = d.summary, c = d.cost, p = d.pl;
    return `
      <h1>📅 월간 회계 리포트</h1>
      <div class="meta">${d.label}</div>
      <div class="pl-box">
        <div class="b rev"><div class="l">매출</div><div class="v">${fmtKRW(p.revenue)}</div></div>
        <div class="b cost"><div class="l">비용</div><div class="v">${fmtKRW(p.cost)}</div></div>
        <div class="b net"><div class="l">순이익</div><div class="v">${fmtKRW(p.net_income)}</div></div>
        <div class="b margin"><div class="l">이익률</div><div class="v">${p.margin_pct}%</div></div>
      </div>
      <h2>매출 요약</h2>
      <table>
        <tr><th>결제 건수</th><td class="num">${s.pay_count.toLocaleString()} 건</td>
            <th>결제 학생수</th><td class="num">${s.paying_users.toLocaleString()} 명</td></tr>
        <tr><th>평균 결제액</th><td class="num">${fmtKRW(s.avg_per_user)}</td>
            <th>활성 학생수</th><td class="num">${s.active_students.toLocaleString()} 명</td></tr>
        <tr><th>신규 가입</th><td class="num">${s.new_signups.toLocaleString()} 명</td>
            <th>만료</th><td class="num">${s.expirations.toLocaleString()} 명</td></tr>
        <tr><th>총 수업 분</th><td class="num">${s.class_minutes.toLocaleString()} 분</td>
            <th>세션 수</th><td class="num">${s.class_sessions.toLocaleString()} 건</td></tr>
      </table>
      <h2>비용 내역</h2>
      <table>
        <tr><th>강사 급여</th><td class="num">${fmtKRW(c.teacher_payroll)}</td><td class="num">${c.teacher_count} 명</td></tr>
        <tr><th>PG 수수료 (추정 3.3%)</th><td class="num">${fmtKRW(c.pg_fee)}</td><td></td></tr>
        <tr><th>운영비 (추정 10%)</th><td class="num">${fmtKRW(c.op_cost)}</td><td></td></tr>
        <tr class="total"><td>합계</td><td class="num">${fmtKRW(c.total)}</td><td></td></tr>
      </table>
      <h2>결제 수단별 분포</h2>
      <table>
        <thead><tr><th>결제수단</th><th class="num">건수</th><th class="num">금액</th></tr></thead>
        <tbody>
          ${(d.by_method||[]).map(m => `<tr><td>${m.method||'기타'}</td><td class="num">${m.cnt}</td><td class="num">${fmtKRW(m.total)}</td></tr>`).join('')}
        </tbody>
      </table>`;
  }

  function renderQuarterly(d){
    const ms = d.monthlies, t = d.totals;
    return `
      <h1>📊 분기 보고서</h1>
      <div class="meta">${d.label} · 이익률 ${d.margin_pct}%</div>
      <table>
        <thead><tr><th>월</th><th class="num">매출</th><th class="num">결제건</th><th class="num">강사 급여</th><th class="num">비용 합계</th><th class="num">순이익</th></tr></thead>
        <tbody>
          ${ms.map(m => `<tr><td>${m.period}</td><td class="num">${fmtKRW(m.revenue)}</td><td class="num">${m.pays}</td><td class="num">${fmtKRW(m.payroll)}</td><td class="num">${fmtKRW(m.cost)}</td><td class="num"><b>${fmtKRW(m.net)}</b></td></tr>`).join('')}
          <tr class="total"><td>합계</td><td class="num">${fmtKRW(t.revenue)}</td><td class="num">${t.pays}</td><td class="num">${fmtKRW(t.payroll)}</td><td class="num">${fmtKRW(t.cost)}</td><td class="num">${fmtKRW(t.net)}</td></tr>
        </tbody>
      </table>`;
  }

  function renderAnnual(d){
    const ms = d.monthlies, t = d.totals;
    return `
      <h1>📈 연간 결산</h1>
      <div class="meta">${d.label} · 이익률 ${d.margin_pct}% · 세무사 제출용</div>
      <table>
        <thead><tr><th>월</th><th class="num">매출</th><th class="num">결제건</th><th class="num">강사 급여</th><th class="num">비용 합계</th><th class="num">순이익</th></tr></thead>
        <tbody>
          ${ms.map(m => `<tr><td>${m.period}</td><td class="num">${fmtKRW(m.revenue)}</td><td class="num">${m.pays}</td><td class="num">${fmtKRW(m.payroll)}</td><td class="num">${fmtKRW(m.cost)}</td><td class="num"><b>${fmtKRW(m.net)}</b></td></tr>`).join('')}
          <tr class="total"><td>연간 합계</td><td class="num">${fmtKRW(t.revenue)}</td><td class="num">${t.pays}</td><td class="num">${fmtKRW(t.payroll)}</td><td class="num">${fmtKRW(t.cost)}</td><td class="num">${fmtKRW(t.net)}</td></tr>
        </tbody>
      </table>`;
  }

  function renderFranchise(d){
    return `
      <h1>🏢 가맹점별 정산서</h1>
      <div class="meta">${d.label} · 본사 수수료율 ${(d.hq_fee_rate*100).toFixed(1)}%</div>
      <table>
        <thead><tr><th>가맹점</th><th class="num">총 매출</th><th class="num">본사 수수료</th><th class="num">정산액</th><th>송금예정일</th><th>상태</th></tr></thead>
        <tbody>
          ${d.rows.map(r => `<tr><td>${r.franchise_name}</td><td class="num">${fmtKRW(r.gross_revenue)}</td><td class="num">${fmtKRW(r.hq_fee)}</td><td class="num"><b>${fmtKRW(r.net_settlement)}</b></td><td>${r.due_date}</td><td>${r.status}</td></tr>`).join('')}
          <tr class="total"><td>합계</td><td class="num">${fmtKRW(d.totals.gross)}</td><td class="num">${fmtKRW(d.totals.fee)}</td><td class="num">${fmtKRW(d.totals.net)}</td><td></td><td></td></tr>
        </tbody>
      </table>`;
  }

  function renderPayslips(d){
    return `
      <h1>👨‍🏫 강사별 급여명세서</h1>
      <div class="meta">${d.label} · 총 ${d.teacher_count}명</div>
      <table>
        <thead><tr><th>강사ID</th><th>이름</th><th>국가</th><th class="num">수업분</th><th class="num">기본급여</th><th class="num">상여</th><th class="num">공제</th><th class="num">실지급</th></tr></thead>
        <tbody>
          ${d.rows.map(r => `<tr><td>${r.teacher_id}</td><td><b>${r.teacher_name||r.teacher_id}</b></td><td>${r.country||''}</td><td class="num">${(r.minutes||0).toLocaleString()}</td><td class="num">${fmtKRW(r.payment_krw)}</td><td class="num">${fmtKRW(r.bonus)}</td><td class="num" style="color:#dc2626">${fmtKRW(-Math.abs(r.deduction||0))}</td><td class="num"><b>${fmtKRW(r.net)}</b></td></tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:#6b7280">데이터 없음</td></tr>'}
          <tr class="total"><td colspan="3">합계</td><td class="num">${(d.totals.minutes||0).toLocaleString()}</td><td class="num">${fmtKRW(d.totals.payment)}</td><td class="num">${fmtKRW(d.totals.bonus)}</td><td class="num">${fmtKRW(d.totals.deduction)}</td><td class="num">${fmtKRW(d.totals.net)}</td></tr>
        </tbody>
      </table>`;
  }

  function renderKpi(d){
    return `
      <h1>⭐ 경영지표 (KPI)</h1>
      <div class="meta">${d.label}</div>
      <div class="kpi-grid">
        ${d.kpis.map(k => `<div class="kpi"><div class="l">${k.label}</div><div class="v">${fmtNum(k.value, k.unit)}</div></div>`).join('')}
      </div>
      <h2>요약 손익</h2>
      <table>
        <tr><th>매출</th><td class="num">${fmtKRW(d.revenue)}</td></tr>
        <tr><th>비용 (강사급여 포함)</th><td class="num">${fmtKRW(d.cost)}</td></tr>
        <tr class="total"><td>순이익</td><td class="num">${fmtKRW(d.net)}</td></tr>
      </table>
      <p style="font-size:11px;color:#6b7280;margin-top:14px;line-height:1.6">
        ※ ARPU = 매출 / 활성 학생수 · LTV = 학생당 평균 누적 결제액 · CAC 추정 = 매출의 5%를 마케팅비로 가정 / 신규 학생수 ·
        ROI = 순이익 / 비용 · LTV/CAC가 3 이상이면 건전.
      </p>`;
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
  window.accLoadPayments = async function(){
    const from   = document.getElementById('acc-pay-from').value;
    const to     = document.getElementById('acc-pay-to').value;
    const method = document.getElementById('acc-pay-method').value;
    const status = document.getElementById('acc-pay-status').value;
    const tbody  = document.getElementById('acc-pay-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="empty">불러오는 중…</td></tr>';
    try {
      const qs = new URLSearchParams();
      if (from)   qs.set('from', from);
      if (to)     qs.set('to', to);
      if (method) qs.set('method', method);
      if (status) qs.set('status', status);
      const r = await fetch('/api/admin/reports/payments-list?' + qs.toString(), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      if (!d.rows.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty">조건에 맞는 결제 내역이 없습니다.</td></tr>'; return; }
      tbody.innerHTML = d.rows.map(p => {
        const t = new Date((p.paid_at||0)*1000+9*3600*1000).toISOString().slice(0,16).replace('T',' ');
        const c = p.status === 'paid' ? 'ok' : p.status === 'refunded' ? 'warn' : 'bad';
        return `<tr><td>${_esc(t)}</td><td>${_esc('#'+p.id)}</td><td>${_esc(p.user_id||'')}</td>
                <td>${_esc(p.memo||'-')}</td><td style="text-align:right">${_fmt(p.amount_krw)}</td>
                <td>${_esc(p.method||'')}</td><td>${_badge(p.status, c)}</td></tr>`;
      }).join('');
    } catch(e) { _showErr(tbody, e, 7); }
  };
  window.accDownloadPaymentsCsv = function(){
    const from = document.getElementById('acc-pay-from').value;
    const to = document.getElementById('acc-pay-to').value;
    const qs = new URLSearchParams({ format:'csv' });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    location.href = '/api/admin/reports/payments-list?' + qs.toString();
  };

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
      if (!months.length){ if(kpiBox) kpiBox.innerHTML='<div style="color:#94a3b8;grid-column:1/-1">데이터 없음</div>'; return; }
      // 구간 합계 + 마진율
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

  // 🧾 카페24 회계 실데이터 (5종 탭) — Neo4j finance-cafe24
  window.c24FinLoad = async function(kind){
    const en = (window.adminLang==='en');
    const head = document.getElementById('c24fin-head');
    const body = document.getElementById('c24fin-body');
    const cnt = document.getElementById('c24fin-count');
    if (!body) return;
    document.querySelectorAll('.c24fin-tab').forEach(function(b){ b.style.background = (b.getAttribute('data-k')===kind)?'#f59e0b':'#fff'; b.style.color=(b.getAttribute('data-k')===kind)?'#fff':'#334155'; });
    const esc = function(s){ return String(s==null?'':s).replace(/[<>&"]/g,function(c){return({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]);}); };
    const won = function(n){ try{ return '₩'+Number(n||0).toLocaleString('ko-KR'); }catch(e){ return n; } };
    // 컬럼 정의 (kind별)
    const COLS = {
      ledger:   [['date','일자'],['acc_type','구분'],['subject','계정과목'],['money','금액',won],['store','거래처'],['memo','적요'],['month','귀속월']],
      payroll:  [['user_id','대상'],['month','월'],['base','기본급',won],['total','지급계',won],['deduction','공제계',won],['actual','실지급',won],['work_day','근무일']],
      expenses: [['reg_date','일자'],['name','제목'],['organ','거래처'],['method','결제'],['content','내용'],['pay_date','지급일']],
      tax:      [['date','작성일'],['supplier','공급자'],['receiver','공급받는자'],['supply','공급가',won],['tax','세액',won],['total','합계',won],['tax_type','과세']],
      deposits: [['date','일자'],['center_id','센터ID'],['amount','금액',won],['method','결제']],
    };
    const cols = COLS[kind] || COLS.ledger;
    head.innerHTML = '<tr>'+cols.map(function(c){ return '<th style="padding:9px 10px;text-align:left;border-bottom:2px solid #e5e7eb">'+esc(c[1])+'</th>'; }).join('')+'</tr>';
    body.innerHTML = '<tr><td colspan="'+cols.length+'" style="padding:20px;text-align:center;color:#9ca3af">'+(en?'Loading…':'불러오는 중…')+'</td></tr>';
    try {
      const r = await fetch('/api/admin/finance-cafe24/'+kind+'?limit=1000', { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||d.code||'API error');
      const rows = d.rows||[];
      if (cnt) cnt.textContent = (en? rows.length+' rows' : '총 '+rows.length+'건');
      body.innerHTML = rows.length ? rows.map(function(row){
        return '<tr style="border-bottom:1px solid #f1f5f9">'+cols.map(function(c){
          var v = row[c[0]]; var disp = c[2] ? c[2](v) : esc(v==null||v===''?'—':v);
          var align = c[2] ? 'text-align:right;font-family:Consolas,monospace' : '';
          var wrap = (c[0]==='content'||c[0]==='memo'||c[0]==='subject') ? 'max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' : '';
          return '<td style="padding:7px 10px;'+align+';'+wrap+'" title="'+esc(v)+'">'+disp+'</td>';
        }).join('')+'</tr>';
      }).join('') : '<tr><td colspan="'+cols.length+'" style="padding:20px;text-align:center;color:#9ca3af">'+(en?'No data':'데이터 없음')+'</td></tr>';
    } catch(e){
      body.innerHTML = '<tr><td colspan="'+cols.length+'" style="padding:20px;text-align:center;color:#dc2626">'+(en?'Load failed: ':'불러오기 실패: ')+esc(String(e&&e.message||e))+'</td></tr>';
    }
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
      if (cards) {
        cards.innerHTML = rows.length ? rows.map(x => {
          const rate = Math.round((x.commission_rate||0)*1000)/10;
          const typeIcon = x.type==='agency' ? '🤝' : '🏬';
          return '<div style="padding:14px 16px;background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04)">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:800;font-size:14px;color:#0f172a">'+typeIcon+' '+_esc(x.franchise_name)+'</div>'
            + '<span style="padding:3px 8px;background:#fee2e2;color:#991b1b;font-size:10.5px;font-weight:700;border-radius:99px">'+(_en?'⏰ Pending':'⏰ 송금 대기')+'</span></div>'
            + '<div style="font-size:11px;color:#6b7280;margin-bottom:8px">'+(_en?'Payments':'결제 건수')+' '+(x.pay_count||0)+'</div>'
            + '<div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;margin-bottom:4px"><span>'+(_en?'Revenue':'매출')+'</span><b style="color:#1f2937">'+_fmt(x.gross_revenue)+'</b></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;margin-bottom:4px"><span>'+(_en?'HQ fee':'본사 수수료')+' ('+rate+'%)</span><b style="color:#b45309">- '+_fmt(x.hq_fee)+'</b></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:13.5px;padding-top:6px;border-top:1px dashed #cbd5e1;margin-top:6px"><b style="color:#166534">'+(_en?'→ Payout':'→ 지점에 송금')+'</b><b style="color:#15803d;font-size:15px">'+_fmt(x.net_settlement)+'</b></div>'
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

  // ──────────────────────────────────────────────────────────
  // 4. 환불 / 취소 관리
  // ──────────────────────────────────────────────────────────
  window.accLoadRefunds = async function(){
    const status = document.getElementById('acc-rf-status').value;
    const tbody = document.getElementById('acc-rf-tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="empty">불러오는 중…</td></tr>';
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      const r = await fetch('/api/admin/reports/refunds-list?' + qs.toString(), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'API error');
      tbody.innerHTML = (d.rows||[]).map(r => {
        const t = new Date((r.paid_at||0)*1000+9*3600*1000).toISOString().slice(0,10);
        return `<tr><td>${_esc(t)}</td><td>${_esc(r.user_id||'')}</td>
                <td style="text-align:right">${_fmt(r.amount_krw)}</td>
                <td style="text-align:right">${_fmt(r.amount_krw)}</td>
                <td>${_esc(r.memo||'-')}</td>
                <td>${_badge(r.status, r.status==='refunded'?'warn':'bad')}</td>
                <td><button class="primary" style="padding:3px 8px;font-size:11px" onclick="alert('상세 처리는 별도 페이지에서')">처리</button></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="empty">환불/취소 내역 없음</td></tr>';
    } catch(e) { _showErr(tbody, e, 7); }
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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e5e7eb">
            <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">${year}년 월별 매출 (KRW)</div>
            <canvas id="acc-sales-canvas" height="180"></canvas>
          </div>
          <div style="background:#fff;padding:14px;border-radius:8px;border:1px solid #e5e7eb;overflow:auto;max-height:300px">
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
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: d.monthlies.map(m=>m.period.slice(5)+'월'),
            datasets: [
              { label:'매출', data: d.monthlies.map(m=>m.revenue), backgroundColor:'rgba(251,146,60,0.7)' },
              { label:'순이익', data: d.monthlies.map(m=>m.net), backgroundColor:'rgba(34,197,94,0.7)', type:'line', borderColor:'rgba(34,197,94,1)', tension:0.3 },
            ],
          },
          options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } },
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
      if (!d.rows.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">데이터 없음</td></tr>'; return; }
      tbody.innerHTML = d.rows.map(r => {
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
  function _statementUrl(format){
    const month = document.getElementById('acc-fs-month').value || _today().slice(0,7);
    const type  = document.getElementById('acc-fs-type').value || 'pl';
    const qs = new URLSearchParams({ type, period: month });
    if (format) qs.set('format', format);
    return '/api/admin/reports/statement?' + qs.toString();
  }
  window.accGenStatement = async function(){
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
        <style>@page{size:A4;margin:18mm 14mm}body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Noto Sans KR",sans-serif;color:#111;padding:30px;max-width:900px;margin:0 auto}.toolbar{position:fixed;top:10px;right:10px;background:#fff;padding:8px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.1)}.toolbar button{padding:8px 14px;font-size:13px;border:0;border-radius:6px;cursor:pointer;margin-left:6px;font-weight:600}@media print{.toolbar{display:none}body{padding:0}}</style>
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
  let _cardCharts = {};
  // 한도 ₩1,000,000 카드에 맞게 카테고리 평균·임계값 조정 (총합이 1M 안에 들도록)
  const CARD_CATEGORIES = {
    '식대':       { icon: '🍱', color: '#f59e0b', avg: 250000, threshold: 350000 },
    '교통':       { icon: '🚕', color: '#10b981', avg: 100000, threshold: 150000 },
    '사무용품':   { icon: '📎', color: '#3b82f6', avg: 80000,  threshold: 130000 },
    '통신':       { icon: '📞', color: '#8b5cf6', avg: 50000,  threshold: 80000 },
    '마케팅':     { icon: '📣', color: '#ec4899', avg: 200000, threshold: 350000 },
    '장비':       { icon: '💻', color: '#06b6d4', avg: 120000, threshold: 250000 },
    '복리후생':   { icon: '🎁', color: '#a855f7', avg: 100000, threshold: 200000 },
    '기타':       { icon: '❓', color: '#6b7280', avg: 50000,  threshold: 100000 },
  };

  window.cardSync = async function() {
    const btn = document.getElementById('acc-card-sync-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 동기화 중…'; }
    try {
      const r = await fetch('/api/admin/corpcard/sync', { method: 'POST', credentials: 'include' });
      let d = null;
      try { d = await r.json(); } catch {}
      if (r.ok && d && d.ok && d.data) _cardData = d.data;
      else _cardData = generateCardSampleData();
    } catch (e) {
      _cardData = generateCardSampleData();
    }
    renderCardKpis(); renderCardCharts(); renderCardTable(); renderCardFeedback();
    if (btn) { btn.textContent = '✅ 동기화 완료'; btn.disabled = false; setTimeout(() => btn.textContent = '🔄 신한 동기화', 1500); }
  };

  window.cardLoad = function() {
    if (!_cardData) _cardData = generateCardSampleData();
    renderCardKpis(); renderCardCharts(); renderCardTable(); renderCardFeedback();
  };

  // 🆕 법인카드 섹션을 열면 자동 조회 — 버튼 안 눌러도 지출내역 바로 표시
  (function(){
    var d = document.getElementById('acc-corpcard');
    if (d && !d.__cardAutoBound) {
      d.__cardAutoBound = true;
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
      { name: 'AWS 클라우드',       cat: '장비',     range: [25000, 80000] },
      { name: 'Google Ads 광고',    cat: '마케팅',   range: [30000, 120000] },
      { name: 'Cloudflare Workers', cat: '장비',     range: [8000, 25000] },
      { name: '오피스디포',         cat: '사무용품', range: [8000, 45000] },
      { name: 'SKT 통신요금',       cat: '통신',     range: [38000, 65000] },
      { name: '교보문고 영등포',    cat: '사무용품', range: [12000, 35000] },
      { name: 'Facebook Ads',       cat: '마케팅',   range: [40000, 150000] },
      { name: 'GS칼텍스 주유',      cat: '교통',     range: [30000, 60000] },
      { name: '쿠팡 사무용품',      cat: '사무용품', range: [8000, 38000] },
      { name: '회식 — 강남고기집',  cat: '복리후생', range: [55000, 120000] },
      { name: 'Figma Pro',          cat: '장비',     range: [22000, 38000] },
      { name: '마이크로소프트 365', cat: '장비',     range: [12000, 28000] },
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

  function renderCardCharts() {
    if (!_cardData || typeof Chart === 'undefined') return;
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

  window.renderCardTable = function() {
    if (!_cardData) return;
    const tbody = document.getElementById('acc-card-rows');
    if (!tbody) return;
    const catFilter = document.getElementById('acc-card-cat') ? document.getElementById('acc-card-cat').value : '';
    const search = ((document.getElementById('acc-card-search') && document.getElementById('acc-card-search').value) || '').toLowerCase();
    const rows = _cardData.current.filter(t => {
      if (catFilter && t.category !== catFilter) return false;
      if (search && !(t.merchant.toLowerCase().includes(search))) return false;
      return true;
    }).sort((a, b) => b.datetime.localeCompare(a.datetime));

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:30px;text-align:center;color:#9ca3af">조건에 맞는 거래가 없습니다.</td></tr>';
      return;
    }
    const catCounts = {};
    _cardData.current.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
    tbody.innerHTML = rows.map(t => {
      const meta = CARD_CATEGORIES[t.category] || CARD_CATEGORIES['기타'];
      const catAvg = (meta.avg / Math.max(catCounts[t.category] || 1, 1));
      const vs = t.amount > meta.threshold ? '🔴 고액' : t.amount > catAvg * 1.5 ? '🟡 평균↑' : '🟢 정상';
      const color = t.amount > meta.threshold ? '#dc2626' : t.amount > catAvg * 1.5 ? '#d97706' : '#059669';
      const safeM = String(t.merchant).replace(/[<>]/g, '');
      return `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px 10px;color:#6b7280;font-family:Consolas,monospace;font-size:11px">${t.datetime}</td>
        <td style="padding:8px 10px;color:#111;font-weight:600">${safeM}</td>
        <td style="padding:8px 10px"><span style="background:${meta.color}22;color:${meta.color};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${meta.icon} ${t.category}</span></td>
        <td style="padding:8px 10px;text-align:right;font-weight:800;color:${color};font-family:Consolas,monospace">₩${t.amount.toLocaleString('ko-KR')}</td>
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
    if (memo !== null) {
      t.memo = memo.trim();
      fetch('/api/admin/corpcard/memo', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, memo: t.memo }) }).catch(() => {});
    }
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
    const csv = ['일시,가맹점,카테고리,금액(KRW),메모'].concat(
      rows.map(t => [t.datetime, '"' + t.merchant.replace(/"/g,'""') + '"', t.category, t.amount, '"' + (t.memo||'').replace(/"/g,'""') + '"'].join(','))
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
      { id: 'card-schedule-requests', name_ko: '📅 수업 연기·변경 요청 🆕', name_en: 'Postpone/Reschedule Requests', def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'👁️', franchise:'👁️', branch:'👁️', agency:'❌', parent:'❌', student:'❌' } },
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
      { id: 'card-battle-mgmt', name_ko: '영어 배틀 (3D 보스전)',         name_en: 'English Battle (3D)',       def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'❌', agency:'❌', parent:'❌', student:'✅' } },
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
      { id: 'all_schedules',    name_ko: '📅 학원 전체 스케줄 🆕',         name_en: 'All Academy Schedules',     def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'✅', branch:'✅', agency:'✅', parent:'❌', student:'❌' } },
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
      { id: 'card-admin-ghost', name_ko: '고스트뷰 (사용자 화면 미러링)',   name_en: 'Ghost View',                def: { hq_exec:'✅', hq_mgr:'✅', hq_teacher:'❌', branch:'❌', agency:'❌', parent:'❌', student:'❌' } },
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
    { uid:'admin',          name:'정우영',  role:'hq_exec',    branch:'본사 · 대표이사',  status:'active', password:'admin' },
    { uid:'cfo01',           name:'김재무',  role:'hq_exec',    branch:'본사 · CFO',       status:'active', password:'cfo' },
    { uid:'ops_lead',        name:'박운영',  role:'hq_mgr',     branch:'본사 · 운영 매니저', status:'active', password:'ops' },
    { uid:'hq_t_001',        name:'강선생',  role:'hq_teacher', branch:'본사 · 마스터 강사', status:'active', password:'teacher' },
    { uid:'hq_t_002',        name:'문선생',  role:'hq_teacher', branch:'본사 · 콘텐츠 강사', status:'active', password:'teacher' },
    { uid:'branch_busan',    name:'이지점',  role:'branch', branch:'부산 지사',       status:'active', password:'busan',   branch_id:'test_br_3'  /* 부산 */ },
    { uid:'branch_daegu',    name:'최지점',  role:'branch', branch:'대구 지사',       status:'active', password:'daegu',   branch_id:'test_br_8'  /* 대구 */ },
    { uid:'branch_incheon',  name:'정지점',  role:'branch', branch:'인천 지사',       status:'active', password:'incheon', branch_id:'test_br_2'  /* 인천 */ },
    { uid:'agency_gn001',    name:'한대리',  role:'agency', branch:'강남점 대리점',   status:'active', password:'gn001',   agency_id:'test_ag_0',  parent_branch_id:'test_br_0'  /* 서울 강남구 */ },
    { uid:'agency_sc002',    name:'송대리',  role:'agency', branch:'서초점 대리점',   status:'active', password:'sc002',   agency_id:'test_ag_1',  parent_branch_id:'test_br_1'  /* 서울 서초구 */ },
    { uid:'agency_pj003',    name:'백대리',  role:'agency', branch:'판교점 대리점',   status:'pending', password:'pj003',  agency_id:'test_ag_4',  parent_branch_id:'test_br_4'  /* 경기 성남 */ },
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

  window.renderUsersByRole = function() {
    const roleFilter = document.getElementById('role-filter')?.value || '';
    const search = (document.getElementById('role-user-search')?.value || '').toLowerCase();
    const tbody = document.getElementById('role-user-rows');
    if (!tbody) return;
    const rows = SAMPLE_USERS.filter(u => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (search && !((u.uid + ' ' + u.name + ' ' + u.branch).toLowerCase().includes(search))) return false;
      return true;
    });
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af">조건에 맞는 사용자가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(u => {
      const r = ROLE_LABEL[u.role] || { icon:'?', name:u.role, color:'#6b7280' };
      const statusBadge = u.status === 'active'
        ? '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">● 활성</span>'
        : '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">⏸ 대기</span>';
      return `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px 10px;font-family:Consolas,monospace;color:#0ea5e9;font-size:11.5px">${u.uid}</td>
        <td style="padding:8px 10px;color:#111;font-weight:600">${u.name}</td>
        <td style="padding:8px 10px;text-align:center"><span style="background:${r.color}22;color:${r.color};padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700">${r.icon} ${r.name}</span></td>
        <td style="padding:8px 10px;color:#6b7280;font-size:11.5px">${u.branch}</td>
        <td style="padding:8px 10px;text-align:center">${statusBadge}</td>
        <td style="padding:8px 10px;text-align:center">
          <button onclick="alert('역할 변경 기능 — 추후 백엔드 연동')" style="padding:3px 8px;font-size:11px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;cursor:pointer">역할 변경</button>
        </td>
      </tr>`;
    }).join('');
  };

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
  window.registerHqEmployee = function() {
    const $ = id => document.getElementById(id);
    const uid = ($('hqe-uid')?.value || '').trim();
    const name = ($('hqe-name')?.value || '').trim();
    const rank = ($('hqe-rank')?.value || 'hq_mgr');
    const email = ($('hqe-email')?.value || '').trim();
    const phone = ($('hqe-phone')?.value || '').trim();
    const branch = ($('hqe-branch')?.value || '').trim();
    const msg = $('hqe-msg');
    function showErr(t) { if (msg) { msg.textContent = t; msg.style.display = 'block'; } }
    if (msg) msg.style.display = 'none';
    if (!uid || uid.length < 3) return showErr('⚠️ 아이디는 3자 이상 입력하세요.');
    if (!/^[a-zA-Z0-9_]+$/.test(uid)) return showErr('⚠️ 아이디는 영문/숫자/_만 가능합니다.');
    if (!name) return showErr('⚠️ 이름을 입력하세요.');
    // 중복 체크
    if (SAMPLE_USERS.some(u => u.uid === uid)) return showErr('⚠️ 이미 사용 중인 아이디입니다.');
    const arr = _hqeLoad();
    arr.unshift({ uid, name, rank, email, phone, branch, registered_at: Date.now() });
    _hqeSave(arr);
    _hqeRefreshAll();
    pushAuditLog((adminLang==='en'?'HQ employee registered: ':'본사 직원 등록: ') + name + ' (' + uid + ' · ' + rank + ')');
    // 폼 초기화
    ['hqe-uid','hqe-name','hqe-email','hqe-phone','hqe-branch'].forEach(id => { const e = $(id); if (e) e.value = ''; });
    alert((adminLang==='en' ? '✅ Registered: ' : '✅ 등록 완료: ') + name);
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
      branch: e.branch || '', password: 'demo',  // 동적 등록 직원 데모 비번
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

  window.adminLogin = function() {
    const $ = id => document.getElementById(id);
    const uid = ($('admin-login-uid')?.value || '').trim();
    const pw = ($('admin-login-pw')?.value || '').trim();
    const msg = $('admin-login-msg');
    function showErr(t) { if (msg) { msg.textContent = t; msg.style.display = 'block'; } }
    if (msg) msg.style.display = 'none';
    if (!uid || !pw) return showErr('⚠️ 아이디와 비밀번호를 입력해 주세요.');
    const users = _allUsers();
    const u = users.find(x => x.uid === uid);
    if (!u) return showErr('❌ 존재하지 않는 아이디입니다.');
    if (u.password && u.password !== pw) return showErr('❌ 비밀번호가 일치하지 않습니다.');
    if (u.status === 'pending') return showErr('⏸ 가입 승인 대기 중인 계정입니다.');
    const session = {
      uid: u.uid, name: u.name, role: u.role,
      branch: u.branch || '',
      branch_id: u.branch_id || u.parent_branch_id || null,
      agency_id: u.agency_id || null,
      login_at: Date.now(),
    };
    _saveSession(session);
    window._adminSession = session;
    _renderSessionBanner();
    pushAuditLog((adminLang==='en'?'Login: ':'로그인: ') + u.name + ' (' + u.uid + ' · ' + u.role + ')');
    // 권한별 일부 메뉴 숨김 (본사가 아닌 경우 권한 설정 카드 등)
    _applyMenuVisibility();
    // 학생 목록 등 다시 로드
    if (typeof loadStudentList === 'function') try { loadStudentList(); } catch(e){}
    if (typeof loadFranchises === 'function') try { loadFranchises(); } catch(e){}
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
    // 본사 전용 (교사 포함)
    'card-settlement-stats':  'hq',       // 정산통계관리
    'card-payroll':           'mgrOrUp',  // 강사 급여·평가 (교사는 본인만 — _applyMenuVisibility 특례 + 렌더 필터)
    'card-payroll-auto':      'mgrOrUp',  // 강사 급여 자동 정산 (전체 — 교사 불가)
    'card-notifications':     'mgrOrUp',  // 알림 큐
    // 본사 + 지사
    'card-teacher-mgmt':      'branch',   // 강사관리
    'card-active-rooms':      'branch',   // 실시간 수업 현황
    'card-centers':           'branch',   // 교육센터
    'card-rankings':          'branch',   // 학생 랭킹
    // 본사 + 지사 + 대리점 (대리점은 자기 데이터만 — adminScopeFilter 가 처리)
    'card-students-mgmt':     'agency',
    'card-franchises':        'agency',   // 가맹점 관리 (자기만 보임)
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
      el.style.display = visible ? '' : 'none';
    });
    // 사이드바 즉시 재인덱싱 (display:none 카드 제외됨)
    if (typeof buildMenuIndex === 'function') buildMenuIndex();
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
    item.innerHTML = `<span style="color:#9ca3af;font-family:Consolas,monospace">${ts}</span> · ${msg}`;
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
          <td style="padding:8px 10px;font-family:Consolas,monospace;color:#0ea5e9;font-size:11.5px">${_se(s.user_id)}</td>
          <td style="padding:8px 10px;color:#111;font-weight:600">${_se(s.name)}</td>
          <td style="padding:8px 10px;text-align:center;color:#6b7280">${_se(s.grade||'-')}</td>
          <td style="padding:8px 10px;text-align:center"><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${_se(s.level||'-')}</span></td>
          <td style="padding:8px 10px;color:#374151">${_se(s.program||'-')}</td>
          <td style="padding:8px 10px;text-align:right;color:#10b981;font-weight:700;font-family:Consolas,monospace">₩${(s.amount||0).toLocaleString('ko-KR')}</td>
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
          <td style="padding:8px 10px;color:#6b7280;font-family:Consolas,monospace;font-size:11px">${_se(b.manager_phone||'-')}</td>
          <td style="padding:8px 10px;text-align:right;color:#1e40af;font-weight:700">${b.students_count||0}명</td>
          <td style="padding:8px 10px;text-align:right;color:#7c2d12;font-weight:700">${b.teachers_count||0}명</td>
          <td style="padding:8px 10px;text-align:right;color:#10b981;font-weight:700;font-family:Consolas,monospace">₩${(b.monthly_revenue||0).toLocaleString('ko-KR')}</td>
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
          <td style="padding:8px 10px;color:#6b7280;font-family:Consolas,monospace;font-size:11px">${_se(a.owner_phone||'-')}</td>
          <td style="padding:8px 10px;text-align:right;color:#1e40af;font-weight:700">${a.students_count||0}명</td>
          <td style="padding:8px 10px;text-align:center"><span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${_se(a.commission_rate||'-')}</span></td>
          <td style="padding:8px 10px;text-align:right;color:#10b981;font-weight:700;font-family:Consolas,monospace">₩${(a.monthly_revenue||0).toLocaleString('ko-KR')}</td>
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

