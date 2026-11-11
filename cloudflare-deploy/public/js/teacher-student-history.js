/* Student history is loaded only when requested, never persisted in browser storage. */
(function () {
  'use strict';
  if (window.MangoiTeacherHistory) return;
  var dialog, context, content, monthInput, title, sequence = 0, controller, opener;
  var prevBtn, nextBtn, todayBtn, refreshBtn;
  // Month grid (like the manager's student calendar) is the default; List keeps the full feedback view.
  // The choice lives only for this page visit — nothing is written to browser storage.
  var view = 'month', viewBar, lastData, focusDay;
  // Lesson type names — the same four types the manager's calendar labels (admin/student.html MGS_AI_COLORS).
  var TYPES = { regular: ['Regular class', '정규수업'], trial: ['Trial class', '체험수업'], level_test: ['Level test', '레벨테스트'], makeup: ['Make-up class', '보강수업'] };
  // A report is expected only where a lesson was due; postponed / cancelled / paused / upcoming days owe none.
  var REPORT_DUE = { done: 1, student_absent: 1, late_postpone: 1, unknown: 1 };
  function t(en, ko) { return document.documentElement.lang === 'ko' ? ko : en; }
  function kstToday() { return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); }   // like the rest of the portal
  function element(tag, text) { var el = document.createElement(tag); if (text != null) el.textContent = text; return el; }
  function button(text, action) { var b = element('button', text); b.type = 'button'; b.onclick = action; return b; }
  function ensureDialog() {
    if (dialog) return;
    var style = element('style');
    style.textContent = '#teacher-history{width:min(920px,calc(100% - 24px));max-height:90dvh;box-sizing:border-box;border:1px solid #94a3b8;border-radius:14px;padding:20px;background:var(--card,#fff);color:var(--fg,#172338)}#teacher-history::backdrop{background:#0008}#teacher-history header,#teacher-history nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap}#teacher-history h2{flex:1;margin:0;font-size:20px}#teacher-history button,#teacher-history input{font:inherit;padding:10px;border:1px solid #94a3b8;border-radius:8px;background:var(--card,#fff);color:inherit;min-height:44px}#teacher-history nav{margin:16px 0}#teacher-history .history-day{border-top:1px solid #94a3b8;padding:10px 0}#teacher-history .history-lesson{border-left:3px solid #4980bd;padding:8px 12px;margin:8px 0}#teacher-history .history-summary{padding:12px;border:1px solid #94a3b8;border-radius:8px;margin:12px 0}#teacher-history summary{cursor:pointer;padding:8px 0}#teacher-history .history-note{white-space:pre-wrap;overflow-wrap:anywhere}#teacher-history .history-alert{color:#a54409}html[data-t="dark"] #teacher-history{background:#172338;color:#edf3ff}html[data-t="dark"] #teacher-history .history-alert{color:#ffcd8a}@media(max-width:600px){#teacher-history{padding:12px}#teacher-history h2{font-size:17px}#teacher-history nav input{max-width:150px}}'
      + '#teacher-history .history-view{display:inline-flex;margin-left:auto}#teacher-history .history-view button{border-radius:0}#teacher-history .history-view button:first-child{border-radius:8px 0 0 8px}#teacher-history .history-view button:last-child{border-radius:0 8px 8px 0;border-left:0}#teacher-history .history-view button[aria-pressed="true"]{background:#2563eb;border-color:#2563eb;color:#fff}'
      + '#teacher-history .history-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid #94a3b8;border-radius:8px;overflow:hidden;margin:12px 0}#teacher-history .history-cal>div{min-width:0;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:4px;box-sizing:border-box}#teacher-history .history-cal>div:nth-child(7n){border-right:0}#teacher-history .history-cal .cal-head{text-align:center;font-weight:700;font-size:13px;padding:6px 2px;background:#f1f5f9}#teacher-history .history-cal .cal-day{min-height:96px;font-size:12px}#teacher-history .history-cal .cal-empty{background:#f8fafc}#teacher-history .history-cal .cal-num{font-weight:700;font-size:13px}#teacher-history .history-cal .cal-sun{color:#dc2626}#teacher-history .history-cal .cal-sat{color:#2563eb}#teacher-history .history-cal .cal-today{box-shadow:inset 0 0 0 2px #f59e0b}'
      + '#teacher-history .history-cal button.cal-chip{display:block;width:100%;min-height:0;margin:3px 0 0;padding:3px 4px;border:0;border-radius:4px;text-align:left;font-size:11px;line-height:1.3;color:#fff;background:#b45309;overflow-wrap:anywhere;cursor:pointer}#teacher-history .history-cal button.cal-chip.st-done{background:#15803d}#teacher-history .history-cal button.cal-chip.st-upcoming{background:#2563eb}#teacher-history .history-cal button.cal-chip.st-unknown{background:#64748b}#teacher-history .history-cal button.cal-chip.st-cancelled,#teacher-history .history-cal button.cal-chip.st-holiday,#teacher-history .history-cal button.cal-chip.st-leave{background:#cbd5e1;color:#172338}'
      + 'html[data-t="dark"] #teacher-history .history-cal .cal-head{background:#22324d}html[data-t="dark"] #teacher-history .history-cal .cal-empty{background:#1b2a42}html[data-t="dark"] #teacher-history .history-cal>div{border-color:#334766}html[data-t="dark"] #teacher-history .history-cal .cal-sun{color:#fca5a5}html[data-t="dark"] #teacher-history .history-cal .cal-sat{color:#93c5fd}'
      // Lesson card lines like the manager's calendar: type · time range · teacher · [status] · report.
      + '#teacher-history .cal-chip .cal-l{display:block}#teacher-history .cal-chip .cal-ty{font-weight:700}#teacher-history .cal-chip .cal-tc{font-weight:700;text-transform:uppercase}#teacher-history .cal-chip .cal-st{display:inline-block;margin:2px 0;padding:1px 4px;border-radius:3px;background:#fff;color:#172338;font-weight:700}#teacher-history .cal-chip .cal-rep{font-size:10px}'
      // Holidays: KR = light red cell + red pill, PH = light blue (same colours as the manager's calendar).
      + '#teacher-history .history-cal .cal-hol{background:#fef2f2}#teacher-history .history-cal .cal-hol.cal-hol-ph{background:#eff6ff}#teacher-history .history-cal .cal-hpill{display:block;margin-top:2px;padding:1px 4px;border-radius:3px;font-size:10px;font-weight:700;line-height:1.3;color:#fff;background:#dc2626;overflow-wrap:anywhere}#teacher-history .history-cal .cal-hpill.ph{color:#1e40af;background:#dbeafe}'
      + 'html[data-t="dark"] #teacher-history .history-cal .cal-hol{background:#3b1f27}html[data-t="dark"] #teacher-history .history-cal .cal-hol.cal-hol-ph{background:#1e2c4a}'
      // ✎ Write feedback (2026-11-11): only on MY past lessons without a report (server: can_write). Phone = icon only.
      + '#teacher-history button.cal-write{display:block;width:100%;min-height:32px;margin:2px 0 0;padding:3px 4px;font-size:11px;font-weight:700;color:#1d4ed8;background:#eff6ff;border:1px solid #93c5fd;border-radius:4px;cursor:pointer}#teacher-history .history-lesson button.cal-write{display:inline-block;width:auto;font-size:13px;padding:6px 12px}html[data-t="dark"] #teacher-history button.cal-write{color:#bfdbfe;background:#1e2c4a;border-color:#3b82f6}'
      + '@media(max-width:600px){#teacher-history .history-cal button.cal-write .cal-wt{display:none}#teacher-history .history-view{margin-left:0}#teacher-history .history-cal .cal-day{min-height:60px;padding:2px}#teacher-history .history-cal button.cal-chip{font-size:10px;padding:2px}#teacher-history .cal-chip .cal-detail{display:none}#teacher-history .history-cal .cal-hpill{font-size:9px;padding:1px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}';
    document.head.appendChild(style);
    dialog = element('dialog'); dialog.id = 'teacher-history'; dialog.setAttribute('aria-labelledby', 'teacher-history-title');
    var header = element('header'); title = element('h2'); title.id = 'teacher-history-title'; header.appendChild(title);
    header.appendChild(button('×', function () { dialog.close(); })); header.lastChild.setAttribute('aria-label', t('Close history', '수업 이력 닫기'));
    var nav = element('nav'); nav.setAttribute('aria-label', t('History month', '수업 이력 월 선택'));
    prevBtn = nav.appendChild(button('◀', function () { move(-1); }));
    monthInput = element('input'); monthInput.type = 'month'; monthInput.min = '2000-01';
    monthInput.onchange = load; nav.appendChild(monthInput);
    nextBtn = nav.appendChild(button('▶', function () { move(1); }));
    // «This month» — one tap back from any month, like the manager's [Today] button.
    todayBtn = nav.appendChild(button('', function () { var now = kstToday().slice(0, 7); if (monthInput.value !== now) { monthInput.value = now; load(); } }));
    refreshBtn = nav.appendChild(button('', load));
    syncNavLabels();
    viewBar = element('span'); viewBar.className = 'history-view'; viewBar.setAttribute('role', 'group');
    viewBar.appendChild(button(t('Month', '월'), function () { setView('month'); }));
    viewBar.appendChild(button(t('List', '목록'), function () { setView('list'); }));
    nav.appendChild(viewBar);
    content = element('div'); content.setAttribute('aria-live', 'polite');
    dialog.append(header, nav, content); document.body.appendChild(dialog);
    dialog.addEventListener('close', function () {
      ++sequence; if (controller) controller.abort(); content.replaceChildren();
      var target = opener && opener.isConnected ? opener : Array.from(document.querySelectorAll('[data-history-schedule]')).find(function (b) {
        return context.roomId ? b.getAttribute('data-history-room') === context.roomId : b.getAttribute('data-history-schedule') === String(context.scheduleId);
      });
      if (target) target.focus();
    });
  }
  // Labels follow the page language at every open (EN/KO toggle), so they live in one place.
  function syncNavLabels() {
    prevBtn.setAttribute('aria-label', t('Previous month', '이전 달')); nextBtn.setAttribute('aria-label', t('Next month', '다음 달'));
    todayBtn.textContent = t('This month', '이번 달'); todayBtn.setAttribute('aria-label', t('Go to this month', '이번 달로 이동'));
    refreshBtn.textContent = t('Refresh', '새로고침'); monthInput.setAttribute('aria-label', t('Month', '월'));
  }
  function move(delta) {
    var d = new Date(monthInput.value + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + delta);
    var value = d.toISOString().slice(0, 7); if (value < '2000-01') return;
    monthInput.value = value; load();
  }
  function note(parent, report) {
    if (!report) { parent.appendChild(element('p', t('Feedback: not written', '피드백: 미작성'))); return; }
    var details = element('details'), summary = element('summary', t('View feedback (read only)', '피드백 보기 (읽기 전용)'));
    details.appendChild(summary);
    var text = document.documentElement.lang === 'ko' ? (report.note_ko || report.note_en) : (report.note_en || report.note_ko);
    var body = element('div', text || t('No written note', '작성된 내용 없음')); body.className = 'history-note'; details.appendChild(body); parent.appendChild(details);
  }
  // ✎ The server decided (row.can_write); the page that opened the history writes it in its own class-log window.
  function writeButton(row) {
    if (row.can_write !== true || !context || typeof context.onWrite !== 'function') return null;
    var label = t('Write feedback', '피드백 작성'), b = button('', function () {
      // Open the class log only after the dialog's own close handler ran (it returns focus to the opener first).
      dialog.addEventListener('close', function () { context.onWrite(row); }, { once: true }); dialog.close();
    });
    b.className = 'cal-write'; b.appendChild(document.createTextNode('✎ '));
    var text = element('span', label); text.className = 'cal-wt'; b.appendChild(text);
    b.setAttribute('aria-label', label + ' · ' + row.date + (row.start ? ' ' + row.start : ''));
    return b;
  }
  function teacherText(row) {
    return t('Teacher: ', '담당 교사: ') + (row.teacher_name || t('Not recorded', '기록 없음'))
      + (row.teacher_source === 'feedback' ? t(' · Feedback record', ' · 피드백 기록 기준')
        : row.teacher_source === 'lms' ? t(' · Old LMS record', ' · 옛 LMS 기록 기준') : t(' · Schedule record', ' · 예약 기록 기준'));
  }
  function render(data) {
    content.replaceChildren();
    var previous = element('section'); previous.className = 'history-summary';
    previous.appendChild(element('h3', t('Previous class / teacher', '이전 수업 / 담당 교사')));
    previous.appendChild(element('p', t('Before ', '기준 수업일: ') + (data.before || context.date)));
    if (data.previous) {
      previous.appendChild(element('p', data.previous.date + ' · ' + teacherText(data.previous))); note(previous, data.previous.feedback);
    } else previous.appendChild(element('p', t('No earlier class record found.', '이전 수업 기록이 없습니다.')));
    content.appendChild(previous);
    content.appendChild(element('p', t('All teachers for this student. Past teacher names follow saved feedback, schedule or old-LMS records; missing records are shown as unknown.', '이 학생의 전체 교사 수업 이력입니다. 과거 담당 교사는 저장된 피드백·예약·옛 LMS 기록을 기준으로 표시하며, 없는 기록은 미확인으로 표시합니다.')));
    if (data.warnings && data.warnings.length) { var warning = element('p', t('Some records (attendance or teacher names) could not be loaded. Refresh to retry.', '일부 기록(출결 또는 교사 이름)을 불러오지 못했습니다. 새로고침해 주세요.')); warning.className = 'history-alert'; content.appendChild(warning);
      // twin_account: the same student's other cafe24 account (X / mangoai_X) could not be checked — only this account is shown.
      if (data.warnings.indexOf('twin_account') >= 0) { var twin = element('p', t("This student's other account (old-LMS / reservations) could not be checked, so only this account's records are shown.", '같은 학생의 다른 계정(옛 LMS·예약) 기록을 확인하지 못해 이 계정 기록만 보여 드립니다.')); twin.className = 'history-alert'; content.appendChild(twin); } }
    lastData = data; syncViewBar();
    if (view === 'month') { renderMonth(data); return; }
    var lastDate, section, jumpTo;
    (data.items || []).forEach(function (row) {
      if (row.date !== lastDate) { section = element('section'); section.className = 'history-day'; section.appendChild(element('h3', row.date)); content.appendChild(section); lastDate = row.date;
        if (row.date === focusDay) { jumpTo = section; section.tabIndex = -1; } }
      var lesson = element('article'); lesson.className = 'history-lesson';
      var time = row.start && window.MangoiClassDisplay ? window.MangoiClassDisplay.range({start_time:row.start,duration_min:row.duration_min}) : row.start || t('Time not recorded','시간 기록 없음');
      lesson.appendChild(element('b', time)); lesson.appendChild(element('p', teacherText(row)));
      lesson.appendChild(element('p', (document.documentElement.lang === 'ko' ? row.label_ko : row.label_en) + (row.teacher_changed ? t(' · Teacher changed', ' · 교사 변경') : '')));
      note(lesson, row.feedback); var wb = writeButton(row); if (wb) lesson.appendChild(wb); section.appendChild(lesson);
    });
    if (!data.items || !data.items.length) content.appendChild(element('p', t('No class records for this month.', '이 달의 수업 기록이 없습니다.')));
    focusDay = null;
    if (jumpTo && jumpTo.scrollIntoView) { jumpTo.scrollIntoView({ block: 'start' }); if (jumpTo.focus) jumpTo.focus(); }
  }
  // Calendar grid of the selected month (Sun–Sat, as on the manager's student page). Each lesson is a card with the same
  // lines as the manager's calendar — type · time range · teacher · [status] · report — and holidays are labelled
  // (KR red, PH blue). Pressing a card opens the List view at that day for the time, teacher and read-only feedback.
  // [start, rest] — «5:50pm» + « – 6:10pm · 20 min». A phone shows only the start (the rest is a .cal-detail).
  function timeParts(row) {
    if (!row.start) return ['—', ''];
    var show = window.MangoiClassDisplay;
    if (!show) return [row.start, ''];
    var start = show.time(row.start), full = row.duration_min > 0 ? show.range({ start_time: row.start, duration_min: row.duration_min }) : start;
    return full.indexOf(start) === 0 ? [start, full.slice(start.length)] : [full, ''];
  }
  // null = no report line (nothing was due that day). Written feedback is always shown, whatever the state.
  function reportText(row) {
    if (row.feedback) return t('Report: written ✎', '보고서: 작성됨 ✎');
    if (!REPORT_DUE[row.state]) return null;
    return row.report_loaded === false ? t('Report: could not check', '보고서: 확인 불가') : t('Report: not written', '보고서: 미작성');
  }
  function lessonChip(row, date) {
    var ko = document.documentElement.lang === 'ko', label = ko ? row.label_ko : row.label_en;
    var type = TYPES[row.class_type] ? TYPES[row.class_type][ko ? 1 : 0] : '';
    var status = (label || '') + (row.teacher_changed ? t(' · Teacher changed', ' · 교사 변경') : '');
    var teacher = row.teacher_name || t('Teacher not recorded', '담당 교사 기록 없음'), report = reportText(row), when = timeParts(row), range = when.join('');
    var chip = button('', function () { focusDay = date; setView('list'); });
    chip.className = 'cal-chip st-' + String(row.state || 'unknown').replace(/[^a-z_]/g, '');
    function line(cls, text) { var el = element('span', text); el.className = 'cal-l ' + cls; chip.appendChild(el); }
    if (type) line('cal-ty cal-detail', type);
    var time = element('b', when[0]); time.className = 'cal-l cal-tm'; chip.appendChild(time);
    if (when[1]) { var rest = element('span', when[1]); rest.className = 'cal-detail'; time.appendChild(rest); }
    line('cal-tc cal-detail', teacher);
    if (status) { var badge = element('span', status); badge.className = 'cal-st cal-detail'; chip.appendChild(badge); }
    if (report) line('cal-rep cal-detail', report);
    var tip = [date, type, range, teacher, status, report].filter(Boolean).join(' · ');
    chip.setAttribute('title', tip); chip.setAttribute('aria-label', tip);
    return chip;
  }
  function renderMonth(data) {
    var parts = monthInput.value.split('-'), y = Number(parts[0]), m = Number(parts[1]) - 1;
    var first = new Date(Date.UTC(y, m, 1)).getUTCDay(), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var byDate = {}, holOf = {};
    (data.items || []).forEach(function (row) { (byDate[row.date] = byDate[row.date] || []).push(row); });
    (data.holidays || []).forEach(function (h) { (holOf[h.date] = holOf[h.date] || []).push(h); });
    var now = kstToday();
    var grid = element('div'); grid.className = 'history-cal';
    var heads = [t('Sun','일'), t('Mon','월'), t('Tue','화'), t('Wed','수'), t('Thu','목'), t('Fri','금'), t('Sat','토')];
    heads.forEach(function (h, i) { var c = element('div', h); c.className = 'cal-head' + (i === 0 ? ' cal-sun' : i === 6 ? ' cal-sat' : ''); grid.appendChild(c); });
    for (var e = 0; e < first; e++) { var blank = element('div'); blank.className = 'cal-day cal-empty'; grid.appendChild(blank); }
    for (var d = 1; d <= days; d++) {
      var date = monthInput.value + '-' + (d < 10 ? '0' : '') + d, dow = (first + d - 1) % 7;
      var hol = holOf[date] || [], holKr = hol.some(function (h) { return h.country !== 'PH'; });
      var cell = element('div'); cell.className = 'cal-day' + (date === now ? ' cal-today' : '') + (hol.length ? ' cal-hol' + (holKr ? '' : ' cal-hol-ph') : '');
      var num = element('div', String(d)); num.className = 'cal-num' + (dow === 0 || holKr ? ' cal-sun' : dow === 6 ? ' cal-sat' : ''); cell.appendChild(num);
      hol.forEach(function (h) {
        var name = h.name || t('Holiday', '공휴일'), pill = element('span', name);
        pill.className = 'cal-hpill' + (h.country === 'PH' ? ' ph' : '');
        pill.setAttribute('title', (h.country === 'PH' ? t('PH holiday: ', '필리핀 공휴일: ') : t('KR holiday: ', '한국 공휴일: ')) + name);
        cell.appendChild(pill);
      });
      (byDate[date] || []).forEach(function (row) { cell.appendChild(lessonChip(row, date)); var wb = writeButton(row); if (wb) cell.appendChild(wb); });
      grid.appendChild(cell);
    }
    while (grid.children.length % 7) { var tail = element('div'); tail.className = 'cal-day cal-empty'; grid.appendChild(tail); }
    content.appendChild(grid);
    if (!data.items || !data.items.length) content.appendChild(element('p', t('No class records for this month.', '이 달의 수업 기록이 없습니다.')));
    else content.appendChild(element('p', t('Tap a lesson to see its teacher and feedback in the List view.', '수업을 누르면 목록 보기에서 담당 교사와 피드백을 볼 수 있습니다.')));
  }
  function syncViewBar() {
    if (!viewBar) return;
    var b = viewBar.children || [];
    if (b[0]) { b[0].textContent = t('Month', '월'); b[0].setAttribute('aria-pressed', String(view === 'month')); }
    if (b[1]) { b[1].textContent = t('List', '목록'); b[1].setAttribute('aria-pressed', String(view === 'list')); }
    viewBar.setAttribute('aria-label', t('View', '보기 방식'));
  }
  function setView(next) {
    view = next; syncViewBar();
    if (lastData && dialog && dialog.open) render(lastData);
  }
  async function load() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput.value)) return;
    var request = ++sequence; if (controller) controller.abort(); controller = new AbortController(); lastData = null;
    content.replaceChildren(element('p', t('Loading class history…', '수업 이력을 불러오는 중…'))); content.setAttribute('aria-busy', 'true');
    try {
      // Old-LMS rows have no reservation id: the server checks the room against this teacher's own LMS records.
      var params = new URLSearchParams(context.scheduleId
        ? {part:'student_history',schedule_id:String(context.scheduleId),date:context.date,month:monthInput.value}
        : {part:'student_history',room_id:context.roomId,student_uid:context.studentUid,date:context.date,month:monthInput.value});
      var response = await fetch('/api/teacher/portal?' + params, {credentials:'same-origin',cache:'no-store',signal:controller.signal});
      var data = await response.json(); if (request !== sequence || !dialog.open) return;
      if (!response.ok || !data.ok) throw new Error('history_unavailable'); render(data);
    } catch (error) {
      if (request !== sequence || !dialog.open) return;
      content.replaceChildren(element('p', t('Could not load class history. Check your session and try Refresh.', '수업 이력을 불러오지 못했습니다. 로그인 상태를 확인하고 새로고침해 주세요.')));
    } finally { if (request === sequence) content.setAttribute('aria-busy','false'); }
  }
  window.MangoiTeacherHistory = {open:function (value) {
    ensureDialog(); context = value; opener = value.opener || document.activeElement; title.textContent = value.name + ' · ' + t('Summary / Calendar', '수업 요약 / 캘린더');
    dialog.querySelector('header button').setAttribute('aria-label',t('Close history','수업 이력 닫기'));
    syncNavLabels(); dialog.querySelector('nav').setAttribute('aria-label',t('History month','수업 이력 월 선택'));
    monthInput.value = value.date.slice(0,7); syncViewBar(); if (!dialog.open) dialog.showModal(); load();
  }};
  document.addEventListener('teacher-feedback-saved', function () { if (dialog && dialog.open) load(); });
  window.addEventListener('class-time-format', function () { if (dialog && dialog.open) load(); });
})();
