/* Shared dashboard/detail loader: two reads, no LLM or outbound messages on load. */
(function () {
  'use strict';
  var root = document.getElementById('forecast-overview');
  if (!root) return;
  var cache = null, pending = null, filter = 'pending', expanded = false;
  var en = function () { return window.adminLang === 'en'; };
  var tr = function (ko, english) { return en() ? english : ko; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var money = function (n) { return n == null ? tr('자료 부족', 'Insufficient data') : '₩' + Math.round(n).toLocaleString('ko-KR'); };
  var people = function (n) { return n == null ? tr('자료 부족', 'Insufficient data') : n.toLocaleString() + tr('명', ' students'); };
  var time = function (n) { return n ? new Date(n).toLocaleString(en() ? 'en-GB' : 'ko-KR', { timeZone: 'Asia/Seoul' }) + ' KST' : tr('확인되지 않음', 'Unverified'); };
  async function get(url, options) {
    var r = await fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options));
    if (!r.ok) { var e = new Error(r.status === 409 ? tr('대상 정보가 바뀌었습니다. 새로고침해 주세요.', 'The snapshot changed. Refresh first.') : tr('불러오지 못했습니다. 다시 시도해 주세요.', 'Unable to load. Please retry.')); e.status = r.status; throw e; }
    var d = await r.json();
    if (!d.ok) throw new Error(tr('자료를 확인하지 못했습니다.', 'Data unavailable.'));
    return d;
  }
  function card(label, value, sub, action, warn) {
    return '<button type="button" class="af-card' + (warn ? ' af-warn' : '') + '" data-af="' + action + '"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(sub) + '</small></button>';
  }
  function reason(r) {
    if (r.reason === 'long_inactive') return tr('최근 미수강 ', 'No classes for ') + r.days_inactive + tr('일', ' days');
    if (r.days_to_expiry < 0) return tr('수강 만료 후 ', 'Expired ') + Math.abs(r.days_to_expiry) + tr('일', ' days ago');
    return r.days_to_expiry === 0 ? tr('오늘 만료', 'Expires today') : tr('만료까지 ', 'Expires in ') + r.days_to_expiry + tr('일', ' days');
  }
  function rowsMarkup(c) {
    var rows = (c.rows || []).filter(function (r) {
      return filter === 'renewal' ? r.renewal : filter === 'risk' ? r.risk : filter === 'money' ? r.due30 && r.risk : filter === 'all' ? true : r.status !== 'done';
    });
    var shown = expanded ? rows : rows.slice(0, 3);
    if (!shown.length) return '<p class="af-muted">' + tr('현재 표시할 관리 대상이 없습니다.', 'No care candidates in this view.') + '</p>';
    return shown.map(function (r) {
      return '<article class="af-student"><div><strong>' + esc(r.name) + '</strong><span class="af-tag">' + tr('화상수업 관리', 'Lesson care') + '</span><p>' + esc(reason(r)) + (r.end_date ? ' · ' + esc(r.end_date) : '') + '</p><small>' + tr('담당 ', 'Owner: ') + esc(r.owner || '—') + ' · ' + tr('마지막 연락 ', 'Last contact: ') + esc(time(r.contacted_at)) + '</small></div><div class="af-actions"><select aria-label="' + esc(r.name + tr(' 상담 상태', ' care status')) + '" data-status="' + esc(r.user_id) + '">' + [['unreviewed',tr('미확인','Unreviewed')],['in_progress',tr('상담 중','In progress')],['done',tr('처리 완료','Done')]].map(function (s) { return '<option value="' + s[0] + '"' + (r.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select><button type="button" data-contact="' + esc(r.user_id) + '">' + tr('연락 기록', 'Record contact') + '</button><button type="button" data-preview="' + esc(r.user_id) + '">' + tr('상담 문구', 'Message draft') + '</button></div></article>';
    }).join('') + (rows.length > 3 ? '<button type="button" data-af="expand">' + (expanded ? tr('3명만 보기','Show 3') : tr('목록 펼치기','Expand list')) + '</button>' : '') + (c.total > 100 ? '<p class="af-muted">' + tr('우선순위 100명까지 표시합니다.', 'Showing the top 100 candidates.') + '</p>' : '');
  }
  function draw() {
    var rev = cache.rev, care = cache.care;
    var r = rev || {}, c = care || {};
    var change = r.change_pct == null ? tr('전월 비교 자료 부족','Previous-month comparison unavailable') : tr('지난달 대비 ','vs last month ') + (r.change_pct > 0 ? '+' : '') + r.change_pct + '%';
    root.hidden = false;
    root.innerHTML = '<div class="af-heading"><div><h2>' + tr('AI 매출·이탈 요약', 'AI revenue & retention') + '</h2><p>' + tr('매출 전망과 오늘 관리할 학생을 한눈에 확인하세요.', 'Revenue outlook and students needing attention.') + '</p></div><div><button type="button" data-af="refresh">' + tr('새로고침','Refresh') + '</button> <button type="button" data-af="detail">' + tr('예측 상세 보기','Forecast details') + '</button></div></div><div class="af-grid">' +
      card(tr('이번 달 예상 매출','Estimated revenue this month'), rev ? money(r.estimated_month) : tr('조회 실패','Unavailable'), change, 'detail') +
      card(tr('14일 이내 재등록 대상','Renewal candidates · 14 days'), care ? people(c.renewals_14d) : tr('조회 실패','Unavailable'), tr('만료 예정 · 재등록 확정 인원 아님','Expiring soon · not confirmed renewals'), 'renewal') +
      card(tr('이탈 위험 관리 대상','Retention care candidates'), care ? people(c.risk_count) : tr('조회 실패','Unavailable'), tr('만료·장기 미수강 신호 기준','Expiry and inactivity signals'), 'risk', c.risk_count > 0) +
      card(tr('위험 학생 갱신 참고액','At-risk renewal reference'), care ? money(c.renewal_reference) : tr('조회 실패','Unavailable'), tr('30일 내 만료 · 직전 결제 확인 ','Due within 30 days · known payments ') + (c.reference_known || 0) + '/' + (c.reference_total || 0), 'money') + '</div>' +
      '<p class="af-note">' + tr('매출: 결제 장부에 기록된 실결제 기준의 참고 추정입니다. 무료 포함 AI는 별도 매출로 더하지 않습니다. 이탈: 화상수업 만료·미수강 기준이며 AI 전용 학습 이탈 분석은 아직 포함되지 않습니다.', 'Revenue is a reference estimate from recorded payments; bundled free AI is not added. Retention covers lesson expiry and inactivity; AI-only learning churn is not included yet.') + '</p>' +
      '<p class="af-muted">' + tr('조회 ', 'Loaded ') + esc(time(cache.at)) + ' · ' + tr('관리 대상 자료 갱신 ', 'Care snapshot ') + esc(time(c.updated_at)) + '</p>' +
      (!rev || !care ? '<p role="status" class="af-notice">' + tr('일부 자료를 불러오지 못했습니다. 해당 수치를 0으로 표시하지 않습니다.', 'Some data could not be loaded. Missing values are not shown as zero.') + '</p>' : '') +
      (care && c.quality === 'insufficient' ? '<p class="af-notice">' + tr('관리 대상 자료가 없거나 3일 이상 지났습니다. 최신 대상만 표시하며 전체 인원 예측은 보류합니다.', 'The snapshot is missing or stale. Only fresh candidates are shown; totals are withheld.') + '</p>' : '') +
      '<div class="af-heading"><h3>' + tr('오늘 확인할 학생','Students to review today') + '</h3><div class="af-filters">' + [['pending',tr('미처리','Pending')],['renewal',tr('재등록','Renewals')],['risk',tr('위험 신호','Risk signals')],['all',tr('전체','All')]].map(function (x) { return '<button type="button" data-af="' + x[0] + '" aria-pressed="' + (filter === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div><div id="af-care-list">' + (care ? rowsMarkup(c) : '<p>' + tr('관리 목록을 불러오지 못했습니다. 새로고침해 주세요.','Unable to load the care list. Please refresh.') + '</p>') + '</div><div id="af-status" role="status"></div>';
    drawDetail();
  }
  function chart(r) {
    var hist = r.history || [], forecast = r.forecast || [], values = hist.concat(forecast);
    if (!values.length) return '';
    var max = Math.max.apply(null, values.map(function (v) { return v.amount; }).concat([1]));
    function coords(rows, offset) { return rows.map(function (v, i) { return (10 + (i + offset) * 580 / Math.max(values.length - 1, 1)).toFixed(1) + ',' + (115 - v.amount / max * 100).toFixed(1); }).join(' '); }
    return '<svg role="img" aria-label="' + tr('실제 매출과 예상 매출 추이','Actual and estimated revenue') + '" viewBox="0 0 600 130"><polyline fill="none" stroke="#0284c7" stroke-width="2" points="' + coords(hist, 0) + '"/><polyline fill="none" stroke="#7c3aed" stroke-width="2" stroke-dasharray="5 4" points="' + coords(hist.slice(-1).concat(forecast), hist.length - 1) + '"/></svg><small>' + tr('실선: 지난 90일 실제 결제 · 점선: 다음 30일 참고 추정 · 동일한 금액 축','Solid: past 90 days payments · dashed: next 30 days estimate · shared scale') + '</small>';
  }
  function drawDetail() {
    var box = document.getElementById('fc-result');
    if (!box || !cache) return;
    var r = cache.rev, c = cache.care;
    box.innerHTML = '<div class="af-detail">' + (r ? '<h3>' + tr('매출 전망','Revenue outlook') + '</h3><p>' + tr('이번 달 기록된 결제액 ','Recorded payments this month ') + money(r.actual_month) + '</p><p>' + tr('이번 달 예상 ','This month estimate ') + money(r.estimated_month) + '</p>' + chart(r) + '<p>' + (en() ? 'Reference estimate: 60% of the last 30-day daily average + 40% of the preceding 60-day average. Check payment sync and renewals.' : esc(r.commentary)) + '</p>' + (r.scenario_range ? '<small>' + tr('일평균 변동 시나리오 범위(신뢰구간 아님): ','Daily-average scenario range (not a confidence interval): ') + money(r.scenario_range[0]) + '–' + money(r.scenario_range[1]) + '</small>' : '') : tr('매출 조회 실패','Revenue unavailable')) + '</div><div class="af-detail"><h3>' + tr('이탈·재등록 관리','Retention and renewals') + '</h3><p>' + tr('예상 이탈 인원: 자료 부족','Predicted leavers: insufficient data') + '</p><p>' + tr('이탈 시점 이력이 없어 0명이나 임의의 확률로 표시하지 않습니다. 위험 신호는 상담 우선순위입니다.','Dated churn history is unavailable. Risk signals indicate care priority, not a probability.') + '</p><p>' + tr('갱신 참고액은 30일 내 만료되는 위험 학생의 직전 결제 합계이며, 확정 손실이나 예상 매출에서 차감하는 금액이 아닙니다. 결제가 확인된 학생만 포함합니다.','The renewal reference sums known previous payments of at-risk students expiring within 30 days. It is not a confirmed loss or a deduction from forecast revenue.') + '</p><button type="button" onclick="document.getElementById(\'forecast-overview\').scrollIntoView({block:\'start\'})">' + tr('관리 대상 보기','View care candidates') + '</button>' + (c ? '<p>' + tr('자료 갱신 ','Snapshot updated ') + esc(time(c.updated_at)) + '</p>' : '') + '</div>';
  }
  async function load(force) {
    if (pending) return pending;
    if (!force && cache && Date.now() - cache.at < 300000) { draw(); return; }
    pending = Promise.allSettled([get('/api/admin/forecast/revenue'), get('/api/admin/forecast/churn')]).then(function (res) {
      if (res.some(function (x) { return x.status === 'rejected' && [401,403].includes(x.reason.status); })) { cache = null; root.hidden = true; var box = document.getElementById('fc-result'); if (box) box.textContent = tr('이 예측은 본사 관리자 전용입니다.','Forecasts are for headquarters administrators.'); return; }
      cache = { rev: res[0].status === 'fulfilled' ? res[0].value : null, care: res[1].status === 'fulfilled' ? res[1].value : null, at: Date.now() };
      draw();
    }).finally(function () { pending = null; });
    return pending;
  }
  window.fcLoad = function () { return load(true); };
  function student(uid) { return cache && cache.care && cache.care.rows.find(function (r) { return r.user_id === uid; }); }
  async function save(uid, status, contacted) {
    var row = student(uid); if (!row) return;
    var controls = root.querySelectorAll('button,select'); controls.forEach(function (el) { el.disabled = true; });
    try {
      await get('/api/admin/forecast/churn', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user_id:uid,case_key:row.case_key,status:status,contacted:contacted}) });
      await load(true);
      var live = document.getElementById('af-status'); if (live) live.textContent = tr('상담 기록을 저장했습니다.','Care record saved.');
    } catch (e) { draw(); document.getElementById('af-status').textContent = e.message; }
    finally { root.querySelectorAll('button,select').forEach(function (el) { el.disabled = false; }); }
  }
  root.addEventListener('change', function (e) { var uid = e.target.getAttribute('data-status'); if (uid) save(uid, e.target.value, false); });
  root.addEventListener('click', async function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var action = b.getAttribute('data-af');
    if (action === 'refresh') { b.disabled = true; b.textContent = tr('갱신 중…','Refreshing…'); await load(true); return; }
    if (action === 'detail') { var detail = document.getElementById('card-ai-forecast'); if (detail) { detail.open = true; detail.scrollIntoView({block:'start'}); } return; }
    if (action) { if (action === 'expand') expanded = !expanded; else { filter = action; expanded = false; } draw(); return; }
    var uid = b.getAttribute('data-contact');
    if (uid) { var r = student(uid); if (r) await save(uid, r.status === 'unreviewed' ? 'in_progress' : r.status, true); return; }
    uid = b.getAttribute('data-preview'); if (!uid) return;
    b.disabled = true;
    try {
      var draft = await get('/api/admin/retention/preview?uid=' + encodeURIComponent(uid));
      var dialog = document.createElement('dialog'); dialog.className = 'af-dialog';
      dialog.innerHTML = '<h3>' + tr('상담 문구 초안','Message draft') + '</h3><p>' + tr('내용을 확인·수정한 뒤 사용하세요. 자동 발송되지 않습니다.','Review and edit before use. This does not send a message.') + '</p><textarea rows="8" aria-label="' + tr('상담 문구','Message draft') + '">' + esc(draft.message) + '</textarea><button type="button">' + tr('닫기','Close') + '</button>';
      document.body.appendChild(dialog); dialog.querySelector('button').onclick = function () { dialog.close(); };
      dialog.addEventListener('close', function () { dialog.remove(); }); dialog.showModal();
    } catch (err) { document.getElementById('af-status').textContent = err.message; }
    finally { b.disabled = false; }
  });
  document.getElementById('card-ai-forecast').addEventListener('toggle', function () { if (this.open) load(false); });
  new MutationObserver(function () { if (cache) draw(); }).observe(document.documentElement, {attributes:true,attributeFilter:['lang']});
  load(false);
})();
