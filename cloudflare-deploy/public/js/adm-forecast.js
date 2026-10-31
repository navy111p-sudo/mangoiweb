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
      return '<article class="af-student"><div><strong>' + esc(r.name) + '</strong>' + (r.user_id ? '<span class="af-student-id">' + tr('아이디: ', 'ID: ') + esc(r.user_id) + '</span>' : '') + '<span class="af-tag">' + tr('화상수업 관리', 'Lesson care') + '</span><p>' + esc(reason(r)) + (r.end_date ? ' · ' + esc(r.end_date) : '') + '</p><small>' + tr('담당 ', 'Owner: ') + esc(r.owner || '—') + ' · ' + tr('마지막 연락 ', 'Last contact: ') + esc(time(r.contacted_at)) + '</small></div><div class="af-actions"><select aria-label="' + esc(r.name + tr(' 상담 상태', ' care status')) + '" data-status="' + esc(r.user_id) + '">' + [['unreviewed',tr('미확인','Unreviewed')],['in_progress',tr('상담 중','In progress')],['done',tr('처리 완료','Done')]].map(function (s) { return '<option value="' + s[0] + '"' + (r.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select><button type="button" data-contact="' + esc(r.user_id) + '">' + tr('연락 기록', 'Record contact') + '</button><button type="button" data-preview="' + esc(r.user_id) + '">' + tr('상담 문구', 'Message draft') + '</button></div></article>';
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
      '<div class="af-heading"><h3>' + tr('오늘 확인할 학생','Students to review today') + '</h3><div class="af-filters">' + [['pending',tr('미처리','Pending'),tr('아직 상담이나 확인을 끝내지 않은 학생을 보여줍니다.','Shows students whose follow-up is not yet complete.')],['renewal',tr('재등록','Renewals'),tr('수강 종료가 14일 이내로 다가와 재등록 안내가 필요한 학생입니다.','Shows students whose lessons expire within 14 days and need a renewal reminder.')],['risk',tr('위험 신호','Risk signals'),tr('수강 만료가 가깝거나 이미 끝났거나, 오래 수업을 듣지 않은 학생입니다.','Shows students with lessons expiring soon, already expired, or a long gap in attendance.')],['all',tr('전체','All'),tr('처리 여부와 관계없이 현재 관리 대상 학생을 모두 보여줍니다.','Shows all current care candidates, including completed follow-ups.')]].map(function (x) { return '<button type="button" data-af="' + x[0] + '" title="' + esc(x[2]) + '" aria-description="' + esc(x[2]) + '" aria-pressed="' + (filter === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div><div id="af-care-list">' + (care ? rowsMarkup(c) : '<p>' + tr('관리 목록을 불러오지 못했습니다. 새로고침해 주세요.','Unable to load the care list. Please refresh.') + '</p>') + '</div><div id="af-status" role="status"></div>';
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
  // Reviewed bilingual templates: no generated text or send request on preview.
  var careTemplates = [
    {ko: '따뜻한 안부 확인', en: 'A friendly check-in',
      bodyKo: '학생 이름 학생이 최근 수업에 참여하지 못해 안부를 여쭙습니다. 잘 지내고 계신가요? 수업 참여에 어려움이 있거나 도움이 필요한 부분이 있다면 편하게 말씀해 주세요. 다시 즐겁게 수업할 수 있도록 함께 방법을 찾아보겠습니다.',
      bodyEn: 'We noticed that 학생 이름 has not been able to attend lessons recently and wanted to check in. How have you been? If attending lessons has been difficult or you need any support, please let us know. We would be happy to help make returning to lessons enjoyable.'},
    {ko: '결석 사유와 불편 확인', en: 'Attendance and difficulties',
      bodyKo: '학생 이름 학생의 최근 결석과 관련해 확인차 연락드립니다. 일정 때문인지, 수업이나 접속에 불편이 있었는지 여쭤봐도 될까요? 말씀해 주시면 내용을 확인하고 필요한 도움을 안내해 드리겠습니다.',
      bodyEn: 'We are reaching out about 학생 이름’s recent absences. Could you let us know whether there has been a scheduling difficulty, an issue with lessons, or a connection problem? We will review your feedback and help with the next steps.'},
    {ko: '수업 시간 조정 상담', en: 'Adjusting lesson times',
      bodyKo: '학생 이름 학생이 현재 수업 시간에 꾸준히 참여하기 어려우신가요? 희망하시는 요일과 시간대를 알려주시면 변경 가능한 일정을 확인해 드리겠습니다. 편하게 참여할 수 있는 시간으로 학습을 이어가실 수 있도록 돕겠습니다.',
      bodyEn: 'Is it difficult for 학생 이름 to attend regularly at the current lesson time? Please share your preferred days and times so we can check available alternatives. We would be happy to help find a schedule that makes it easier to continue learning.'},
    {ko: '수업 만족도와 개선 상담', en: 'Lesson feedback and improvements',
      bodyKo: '학생 이름 학생이 수업을 어떻게 느끼고 있는지 궁금해 연락드립니다. 수업 난이도나 교재, 선생님의 설명과 진행 방식에서 바라는 점이 있으신가요? 좋았던 점과 아쉬웠던 점을 편하게 알려주시면 학생에게 더 잘 맞는 수업이 되도록 살펴보겠습니다.',
      bodyEn: 'We would love to hear how 학생 이름 feels about the lessons. Is there anything you would like to change about the difficulty, materials, or the teacher’s explanations and approach? Please share what has worked well and what could improve so we can better support the student.'},
    {ko: '수업 재개와 재등록 상담', en: 'Resuming or renewing lessons',
      bodyKo: '학생 이름 학생의 수업을 다시 시작하거나 이어가실 계획이 있으신지 여쭙습니다. 희망하시는 시작 시기와 수업 일정을 알려주시면 현재 수강 상태를 확인해 재개 또는 재등록 방법을 안내해 드리겠습니다. 궁금한 점은 편하게 말씀해 주세요.',
      bodyEn: 'Are you considering resuming or continuing lessons for 학생 이름? Please share your preferred start date and schedule. We will check the current enrollment status and explain how to resume or renew. Please feel free to ask us any questions.'}
  ];
  function openCareDialog(row, trigger) {
    var lang = en() ? 'en' : 'ko', selected = '', drafts = Object.create(null), recipient = null, sending = false;
    var dialog = document.createElement('dialog');
    dialog.className = 'af-dialog';
    dialog.setAttribute('aria-labelledby', 'af-draft-title');
    dialog.innerHTML = '<h3 id="af-draft-title"></h3><p data-intro></p><label for="af-draft-language" data-language-label></label><select id="af-draft-language"><option value="ko">한국어</option><option value="en">English</option></select><label for="af-draft-template" data-template-label></label><select id="af-draft-template"></select><label for="af-draft-message" data-message-label></label><textarea id="af-draft-message" rows="9"></textarea><p class="af-draft-note" data-edit-note></p><p data-recipient></p><div class="af-draft-actions"><button type="button" data-copy></button><button type="button" data-sms></button><button type="button" data-kakao></button><button type="button" data-close></button></div><p role="status" aria-live="polite" data-copy-status></p>';
    var language = dialog.querySelector('#af-draft-language');
    var choices = dialog.querySelector('#af-draft-template');
    var message = dialog.querySelector('textarea');
    var copy = dialog.querySelector('[data-copy]');
    var status = dialog.querySelector('[data-copy-status]');
    var sms = dialog.querySelector('[data-sms]');
    var kakao = dialog.querySelector('[data-kakao]');
    function deliveryControls() {
      sms.textContent = t('휴대폰 문자 보내기', 'Send text message');
      kakao.textContent = t('카카오톡에서 보내기', 'Send in KakaoTalk');
      sms.disabled = sending || selected === '' || !recipient || !recipient.ready || !/^01[016789][0-9]{7,8}$/.test(recipient.phone);
      kakao.disabled = sending || selected === '';
      dialog.querySelector('[data-recipient]').textContent = recipient
        ? t('문자 수신: ', 'Text recipient: ') + row.name + ' · ' + row.user_id + ' · ' + (recipient.role === 'parent' ? t('학부모', 'Parent') : t('학생', 'Student')) + ' · ' + (recipient.phone || t('등록된 번호 없음', 'No registered number')) + t(' / 발신번호: ', ' / Sender: ') + '1644-0561' + (recipient.ready ? '' : t(' · 문자 발송 설정을 확인해 주세요.', ' · Check SMS service configuration.'))
        : t('수신번호 확인 중입니다. 조회되지 않으면 학생 연락처를 확인해 주세요.', 'Checking the recipient. If unavailable, check the student contact details.');
    }
    function t(ko, english) { return lang === 'en' ? english : ko; }
    function key() { return lang + ':' + selected; }
    function remember() { if (selected !== '') drafts[key()] = message.value; }
    function render() {
      dialog.lang = lang;
      language.value = lang;
      dialog.querySelector('h3').textContent = t('상담 문구 선택', 'Choose a consultation message');
      dialog.querySelector('[data-intro]').textContent = t('상담할 때마다 상황에 맞는 문구를 선택해 주세요. 자동으로 발송되지 않습니다.', 'Choose a message for each consultation. Nothing is sent automatically.');
      dialog.querySelector('[data-language-label]').textContent = t('문구 언어', 'Message language');
      dialog.querySelector('[data-template-label]').textContent = t('다섯 가지 상담 문구', 'Five consultation options');
      choices.innerHTML = '<option value="">' + t('상담 문구를 선택해 주세요', 'Select a consultation message') + '</option>' + careTemplates.map(function (item, i) { return '<option value="' + i + '">' + esc(item[lang]) + '</option>'; }).join('');
      choices.value = selected;
      dialog.querySelector('[data-message-label]').textContent = t('내용 확인과 수정', 'Review and edit');
      dialog.querySelector('[data-edit-note]').textContent = t('수정한 내용은 이 창이 열려 있는 동안 문구별·언어별로 유지됩니다. 수정 내용은 자동 번역되지 않습니다.', 'Edits are kept separately for each option and language while this window is open. Edits are not automatically translated.');
      copy.textContent = t('문구 복사', 'Copy message');
      dialog.querySelector('[data-close]').textContent = t('닫기', 'Close');
      message.disabled = copy.disabled = selected === '';
      message.placeholder = t('위에서 문구를 선택하면 내용이 표시됩니다.', 'Select an option above to see the message.');
      if (selected === '') message.value = '';
      else {
        if (!Object.prototype.hasOwnProperty.call(drafts, key())) {
          var name = String(row.name || '').trim();
          // Do not insert foreign-script names into a Korean-only message.
          if (lang === 'ko' && !/^[가-힣ㄱ-ㅎㅏ-ㅣ\s]+$/.test(name)) name = '우리';
          if (!name) name = lang === 'en' ? 'the student' : '우리';
          drafts[key()] = t('안녕하세요. 망고아이입니다.\n', 'Hello, this is MangoAI.\n') + careTemplates[Number(selected)][lang === 'ko' ? 'bodyKo' : 'bodyEn'].replace('학생 이름', name);
        }
        message.value = drafts[key()];
      }
      status.textContent = '';
      deliveryControls();
    }
    choices.onchange = function () { remember(); selected = choices.value; render(); };
    language.onchange = function () { remember(); lang = language.value; render(); };
    copy.onclick = async function () {
      try {
        await navigator.clipboard.writeText(message.value);
        if (dialog.isConnected) status.textContent = t('문구를 복사했습니다.', 'Message copied.');
      } catch (err) {
        message.focus(); message.select();
        status.textContent = t('자동 복사가 되지 않았습니다. 선택된 문구를 직접 복사해 주세요.', 'Automatic copy was unavailable. Please copy the selected text manually.');
      }
    };
    sms.onclick = async function () {
      var text = message.value.trim();
      if (!text || text.length > 1000) { status.textContent = t('문구는 한 글자 이상 천 글자 이하로 입력해 주세요.', 'Enter between 1 and 1,000 characters.'); return; }
      if (sms.disabled || sending) return;
      if (!window.confirm(t('다음 수신자에게 유료 문자를 발송할까요?', 'Send a paid text message to this recipient?') + '\n' + row.name + ' · ' + row.user_id + '\n' + (recipient.role === 'parent' ? t('학부모', 'Parent') : t('학생', 'Student')) + ' ' + recipient.phone + '\n\n' + text)) return;
      sending = true; deliveryControls(); language.disabled = choices.disabled = message.disabled = true;
      try {
        var response = await fetch('/api/admin/forecast/message', {method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user_id:row.user_id, message:text, expected_phone:recipient.phone, confirmed:true, request_id:crypto.randomUUID()})});
        var result = await response.json();
        if (response.ok && result.ok && result.status === 'accepted') status.textContent = t('문자 발송 요청이 접수되었습니다. 실제 도착 여부는 발송 내역에서 확인해 주세요.', 'Text delivery request accepted. Check delivery records for the final result.');
        else {
          var errors = {
            missing_phone: t('등록된 휴대폰 번호를 확인해 주세요.', 'Check the registered mobile number.'),
            recipient_changed: t('수신번호가 변경되었습니다. 창을 다시 열고 확인해 주세요.', 'The recipient number changed. Reopen this window and check it.'),
            duplicate_request: t('중복 발송을 막았습니다. 이전 발송 내역을 확인해 주세요.', 'Duplicate sending blocked. Check the previous delivery record.'),
            delivery_not_ready: t('문자 발송 설정이 완료되지 않았습니다.', 'SMS delivery is not configured.')
          };
          status.textContent = errors[result.error] || t('발송을 확인하지 못했습니다. 중복 발송하지 않도록 발송 내역을 먼저 확인해 주세요.', 'Delivery could not be confirmed. Check the delivery record before retrying.');
        }
      } catch (err) { status.textContent = t('발송 결과를 확인하지 못했습니다. 다시 보내기 전에 발송 내역을 확인해 주세요.', 'The delivery result is unknown. Check delivery records before retrying.'); }
      finally { sending = false; language.disabled = choices.disabled = message.disabled = false; deliveryControls(); }
    };
    kakao.onclick = async function () {
      if (!message.value.trim()) return;
      // Copy first: a separate explicit link opens Kakao after clipboard completion.
      try {
        await navigator.clipboard.writeText(message.value);
        status.textContent = t('문구를 복사했습니다. 카카오 채널 관리자에서 학생과 수신자를 확인한 뒤 붙여 넣고 전송해 주세요. 아직 발송되지 않았습니다. ', 'Message copied. In Kakao Channel Manager, verify the student and recipient, paste the message, and send it. Nothing has been sent yet. ');
        var link = document.createElement('a'); link.href = 'https://center-pf.kakao.com/'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = t('카카오 채널 관리자 열기', 'Open Kakao Channel Manager'); status.appendChild(link);
      } catch (err) { message.focus(); message.select(); status.textContent = t('문구를 직접 복사한 뒤 카카오 채널 관리자에서 수신자를 확인하고 보내 주세요.', 'Copy the selected message manually, then verify the recipient and send it in Kakao Channel Manager.'); }
    };
    dialog.addEventListener('cancel', function (e) { if (sending) e.preventDefault(); });
    dialog.querySelector('[data-close]').onclick = function () { if (!sending) dialog.close(); };
    dialog.addEventListener('close', function () { dialog.remove(); if (trigger.isConnected) trigger.focus(); });
    render(); document.body.appendChild(dialog); dialog.showModal(); choices.focus();
    get('/api/admin/forecast/message?uid=' + encodeURIComponent(row.user_id)).then(function (data) {
      recipient = data.recipient; if (dialog.isConnected) deliveryControls();
    }).catch(function () {
      if (dialog.isConnected) dialog.querySelector('[data-recipient]').textContent = t('수신번호를 불러오지 못했습니다. 창을 다시 열어 주세요.', 'Could not load the recipient. Reopen this window.');
    });
  }
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
    var target = student(uid); if (target) openCareDialog(target, b);
  });
  document.getElementById('card-ai-forecast').addEventListener('toggle', function () { if (this.open) load(false); });
  new MutationObserver(function () { if (cache) draw(); }).observe(document.documentElement, {attributes:true,attributeFilter:['lang']});
  load(false);
})();
