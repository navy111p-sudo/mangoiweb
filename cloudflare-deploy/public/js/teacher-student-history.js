/* Student history is loaded only when requested, never persisted in browser storage. */
(function () {
  'use strict';
  if (window.MangoiTeacherHistory) return;
  var dialog, context, content, monthInput, title, sequence = 0, controller, opener;
  // Month grid (like the manager's student calendar) is the default; List keeps the full feedback view.
  // The choice lives only for this page visit — nothing is written to browser storage.
  var view = 'month', viewBar, lastData, focusDay;
  function t(en, ko) { return document.documentElement.lang === 'ko' ? ko : en; }
  function element(tag, text) { var el = document.createElement(tag); if (text != null) el.textContent = text; return el; }
  function button(text, action) { var b = element('button', text); b.type = 'button'; b.onclick = action; return b; }
  function ensureDialog() {
    if (dialog) return;
    var style = element('style');
    style.textContent = '#teacher-history{width:min(920px,calc(100% - 24px));max-height:90dvh;box-sizing:border-box;border:1px solid #94a3b8;border-radius:14px;padding:20px;background:var(--card,#fff);color:var(--fg,#172338)}#teacher-history::backdrop{background:#0008}#teacher-history header,#teacher-history nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap}#teacher-history h2{flex:1;margin:0;font-size:20px}#teacher-history button,#teacher-history input{font:inherit;padding:10px;border:1px solid #94a3b8;border-radius:8px;background:var(--card,#fff);color:inherit;min-height:44px}#teacher-history nav{margin:16px 0}#teacher-history .history-day{border-top:1px solid #94a3b8;padding:10px 0}#teacher-history .history-lesson{border-left:3px solid #4980bd;padding:8px 12px;margin:8px 0}#teacher-history .history-summary{padding:12px;border:1px solid #94a3b8;border-radius:8px;margin:12px 0}#teacher-history summary{cursor:pointer;padding:8px 0}#teacher-history .history-note{white-space:pre-wrap;overflow-wrap:anywhere}#teacher-history .history-alert{color:#a54409}html[data-t="dark"] #teacher-history{background:#172338;color:#edf3ff}html[data-t="dark"] #teacher-history .history-alert{color:#ffcd8a}@media(max-width:600px){#teacher-history{padding:12px}#teacher-history h2{font-size:17px}#teacher-history nav input{max-width:150px}}'
      + '#teacher-history .history-view{display:inline-flex;margin-left:auto}#teacher-history .history-view button{border-radius:0}#teacher-history .history-view button:first-child{border-radius:8px 0 0 8px}#teacher-history .history-view button:last-child{border-radius:0 8px 8px 0;border-left:0}#teacher-history .history-view button[aria-pressed="true"]{background:#2563eb;border-color:#2563eb;color:#fff}'
      + '#teacher-history .history-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid #94a3b8;border-radius:8px;overflow:hidden;margin:12px 0}#teacher-history .history-cal>div{min-width:0;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;padding:4px;box-sizing:border-box}#teacher-history .history-cal>div:nth-child(7n){border-right:0}#teacher-history .history-cal .cal-head{text-align:center;font-weight:700;font-size:13px;padding:6px 2px;background:#f1f5f9}#teacher-history .history-cal .cal-day{min-height:84px;font-size:12px}#teacher-history .history-cal .cal-empty{background:#f8fafc}#teacher-history .history-cal .cal-num{font-weight:700;font-size:13px}#teacher-history .history-cal .cal-sun{color:#dc2626}#teacher-history .history-cal .cal-sat{color:#2563eb}#teacher-history .history-cal .cal-today{box-shadow:inset 0 0 0 2px #f59e0b}'
      + '#teacher-history .history-cal button.cal-chip{display:block;width:100%;min-height:0;margin:3px 0 0;padding:3px 4px;border:0;border-radius:4px;text-align:left;font-size:11px;line-height:1.3;color:#fff;background:#b45309;overflow-wrap:anywhere;cursor:pointer}#teacher-history .history-cal button.cal-chip.st-done{background:#15803d}#teacher-history .history-cal button.cal-chip.st-upcoming{background:#2563eb}#teacher-history .history-cal button.cal-chip.st-unknown{background:#64748b}#teacher-history .history-cal button.cal-chip.st-cancelled,#teacher-history .history-cal button.cal-chip.st-holiday,#teacher-history .history-cal button.cal-chip.st-leave{background:#cbd5e1;color:#172338}'
      + 'html[data-t="dark"] #teacher-history .history-cal .cal-head{background:#22324d}html[data-t="dark"] #teacher-history .history-cal .cal-empty{background:#1b2a42}html[data-t="dark"] #teacher-history .history-cal>div{border-color:#334766}html[data-t="dark"] #teacher-history .history-cal .cal-sun{color:#fca5a5}html[data-t="dark"] #teacher-history .history-cal .cal-sat{color:#93c5fd}'
      + '@media(max-width:600px){#teacher-history .history-view{margin-left:0}#teacher-history .history-cal .cal-day{min-height:60px;padding:2px}#teacher-history .history-cal button.cal-chip{font-size:10px;padding:2px}#teacher-history .cal-chip .cal-label{display:none}}';
    document.head.appendChild(style);
    dialog = element('dialog'); dialog.id = 'teacher-history'; dialog.setAttribute('aria-labelledby', 'teacher-history-title');
    var header = element('header'); title = element('h2'); title.id = 'teacher-history-title'; header.appendChild(title);
    header.appendChild(button('×', function () { dialog.close(); })); header.lastChild.setAttribute('aria-label', t('Close history', '수업 이력 닫기'));
    var nav = element('nav'); nav.setAttribute('aria-label', t('History month', '수업 이력 월 선택'));
    nav.appendChild(button('◀', function () { move(-1); })); nav.lastChild.setAttribute('aria-label', t('Previous month', '이전 달'));
    monthInput = element('input'); monthInput.type = 'month'; monthInput.min = '2000-01'; monthInput.setAttribute('aria-label', t('Month', '월'));
    monthInput.onchange = load; nav.appendChild(monthInput);
    nav.appendChild(button('▶', function () { move(1); })); nav.lastChild.setAttribute('aria-label', t('Next month', '다음 달'));
    nav.appendChild(button(t('Refresh', '새로고침'), load));
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
      note(lesson, row.feedback); section.appendChild(lesson);
    });
    if (!data.items || !data.items.length) content.appendChild(element('p', t('No class records for this month.', '이 달의 수업 기록이 없습니다.')));
    focusDay = null;
    if (jumpTo && jumpTo.scrollIntoView) { jumpTo.scrollIntoView({ block: 'start' }); if (jumpTo.focus) jumpTo.focus(); }
  }
  // Calendar grid of the selected month (Sun–Sat, as on the manager's student page). Each lesson is a chip;
  // pressing it opens the List view at that day, where the time, teacher and read-only feedback are shown in full.
  function renderMonth(data) {
    var parts = monthInput.value.split('-'), y = Number(parts[0]), m = Number(parts[1]) - 1;
    var first = new Date(Date.UTC(y, m, 1)).getUTCDay(), days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var byDate = {};
    (data.items || []).forEach(function (row) { (byDate[row.date] = byDate[row.date] || []).push(row); });
    var now = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);   // today in KST, like the rest of the portal
    var grid = element('div'); grid.className = 'history-cal';
    var heads = [t('Sun','일'), t('Mon','월'), t('Tue','화'), t('Wed','수'), t('Thu','목'), t('Fri','금'), t('Sat','토')];
    heads.forEach(function (h, i) { var c = element('div', h); c.className = 'cal-head' + (i === 0 ? ' cal-sun' : i === 6 ? ' cal-sat' : ''); grid.appendChild(c); });
    for (var e = 0; e < first; e++) { var blank = element('div'); blank.className = 'cal-day cal-empty'; grid.appendChild(blank); }
    for (var d = 1; d <= days; d++) {
      var date = monthInput.value + '-' + (d < 10 ? '0' : '') + d, dow = (first + d - 1) % 7;
      var cell = element('div'); cell.className = 'cal-day' + (date === now ? ' cal-today' : '');
      var num = element('div', String(d)); num.className = 'cal-num' + (dow === 0 ? ' cal-sun' : dow === 6 ? ' cal-sat' : ''); cell.appendChild(num);
      (byDate[date] || []).forEach(function (row) {
        var label = document.documentElement.lang === 'ko' ? row.label_ko : row.label_en;
        var chip = button('', (function (day) { return function () { focusDay = day; setView('list'); }; })(date));
        chip.className = 'cal-chip st-' + String(row.state || 'unknown').replace(/[^a-z_]/g, '');
        chip.appendChild(element('b', !row.start ? '—' : window.MangoiClassDisplay ? window.MangoiClassDisplay.time(row.start) : row.start));
        var sub = element('span', ' ' + (label || '') + (row.feedback ? ' ✎' : '')); sub.className = 'cal-label'; chip.appendChild(sub);
        var tip = date + ' · ' + (row.teacher_name || t('Teacher not recorded', '담당 교사 기록 없음')) + (label ? ' · ' + label : '') + (row.feedback ? t(' · Feedback written', ' · 피드백 작성됨') : '');
        chip.setAttribute('title', tip); chip.setAttribute('aria-label', tip);
        cell.appendChild(chip);
      });
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
    var navigation=dialog.querySelectorAll('nav button');
    navigation[0].setAttribute('aria-label',t('Previous month','이전 달'));navigation[1].setAttribute('aria-label',t('Next month','다음 달'));navigation[2].textContent=t('Refresh','새로고침');
    monthInput.setAttribute('aria-label',t('Month','월'));dialog.querySelector('nav').setAttribute('aria-label',t('History month','수업 이력 월 선택'));
    monthInput.value = value.date.slice(0,7); syncViewBar(); if (!dialog.open) dialog.showModal(); load();
  }};
  document.addEventListener('teacher-feedback-saved', function () { if (dialog && dialog.open) load(); });
  window.addEventListener('class-time-format', function () { if (dialog && dialog.open) load(); });
})();
