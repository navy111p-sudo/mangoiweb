/* Student history is loaded only when requested, never persisted in browser storage. */
(function () {
  'use strict';
  if (window.MangoiTeacherHistory) return;
  var dialog, context, content, monthInput, title, sequence = 0, controller, opener;
  function t(en, ko) { return document.documentElement.lang === 'ko' ? ko : en; }
  function element(tag, text) { var el = document.createElement(tag); if (text != null) el.textContent = text; return el; }
  function button(text, action) { var b = element('button', text); b.type = 'button'; b.onclick = action; return b; }
  function ensureDialog() {
    if (dialog) return;
    var style = element('style');
    style.textContent = '#teacher-history{width:min(920px,calc(100% - 24px));max-height:90dvh;box-sizing:border-box;border:1px solid #94a3b8;border-radius:14px;padding:20px;background:var(--card,#fff);color:var(--fg,#172338)}#teacher-history::backdrop{background:#0008}#teacher-history header,#teacher-history nav{display:flex;align-items:center;gap:10px;flex-wrap:wrap}#teacher-history h2{flex:1;margin:0;font-size:20px}#teacher-history button,#teacher-history input{font:inherit;padding:10px;border:1px solid #94a3b8;border-radius:8px;background:var(--card,#fff);color:inherit;min-height:44px}#teacher-history nav{margin:16px 0}#teacher-history .history-day{border-top:1px solid #94a3b8;padding:10px 0}#teacher-history .history-lesson{border-left:3px solid #4980bd;padding:8px 12px;margin:8px 0}#teacher-history .history-summary{padding:12px;border:1px solid #94a3b8;border-radius:8px;margin:12px 0}#teacher-history summary{cursor:pointer;padding:8px 0}#teacher-history .history-note{white-space:pre-wrap;overflow-wrap:anywhere}#teacher-history .history-alert{color:#a54409}html[data-t="dark"] #teacher-history{background:#172338;color:#edf3ff}html[data-t="dark"] #teacher-history .history-alert{color:#ffcd8a}@media(max-width:600px){#teacher-history{padding:12px}#teacher-history h2{font-size:17px}#teacher-history nav input{max-width:150px}}';
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
    content = element('div'); content.setAttribute('aria-live', 'polite');
    dialog.append(header, nav, content); document.body.appendChild(dialog);
    dialog.addEventListener('close', function () {
      ++sequence; if (controller) controller.abort(); content.replaceChildren();
      var target = opener && opener.isConnected ? opener : Array.from(document.querySelectorAll('[data-history-schedule]')).find(function (b) { return b.getAttribute('data-history-schedule') === String(context.scheduleId); });
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
      + (row.teacher_source === 'feedback' ? t(' · Feedback record', ' · 피드백 기록 기준') : t(' · Schedule record', ' · 예약 기록 기준'));
  }
  function render(data) {
    content.replaceChildren();
    var previous = element('section'); previous.className = 'history-summary';
    previous.appendChild(element('h3', t('Previous class / teacher', '이전 수업 / 담당 교사')));
    previous.appendChild(element('p', t('Before ', '기준 수업일: ') + context.date));
    if (data.previous) {
      previous.appendChild(element('p', data.previous.date + ' · ' + teacherText(data.previous))); note(previous, data.previous.feedback);
    } else previous.appendChild(element('p', t('No earlier class record found.', '이전 수업 기록이 없습니다.')));
    content.appendChild(previous);
    content.appendChild(element('p', t('All teachers for this student. Past teacher names follow saved feedback or schedule records; missing records are shown as unknown.', '이 학생의 전체 교사 수업 이력입니다. 과거 담당 교사는 저장된 피드백·예약 기록을 기준으로 표시하며, 없는 기록은 미확인으로 표시합니다.')));
    if (data.warnings && data.warnings.length) { var warning = element('p', t('Some attendance records could not be loaded. Refresh to retry.', '일부 출결 기록을 불러오지 못했습니다. 새로고침해 주세요.')); warning.className = 'history-alert'; content.appendChild(warning); }
    var lastDate, section;
    (data.items || []).forEach(function (row) {
      if (row.date !== lastDate) { section = element('section'); section.className = 'history-day'; section.appendChild(element('h3', row.date)); content.appendChild(section); lastDate = row.date; }
      var lesson = element('article'); lesson.className = 'history-lesson';
      var time = row.start && window.MangoiClassDisplay ? window.MangoiClassDisplay.range({start_time:row.start,duration_min:row.duration_min}) : row.start || t('Time not recorded','시간 기록 없음');
      lesson.appendChild(element('b', time)); lesson.appendChild(element('p', teacherText(row)));
      lesson.appendChild(element('p', (document.documentElement.lang === 'ko' ? row.label_ko : row.label_en) + (row.teacher_changed ? t(' · Teacher changed', ' · 교사 변경') : '')));
      note(lesson, row.feedback); section.appendChild(lesson);
    });
    if (!data.items || !data.items.length) content.appendChild(element('p', t('No class records for this month.', '이 달의 수업 기록이 없습니다.')));
  }
  async function load() {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput.value)) return;
    var request = ++sequence; if (controller) controller.abort(); controller = new AbortController();
    content.replaceChildren(element('p', t('Loading class history…', '수업 이력을 불러오는 중…'))); content.setAttribute('aria-busy', 'true');
    try {
      var params = new URLSearchParams({part:'student_history',schedule_id:String(context.scheduleId),date:context.date,month:monthInput.value});
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
    monthInput.value = value.date.slice(0,7); if (!dialog.open) dialog.showModal(); load();
  }};
  document.addEventListener('teacher-feedback-saved', function () { if (dialog && dialog.open) load(); });
  window.addEventListener('class-time-format', function () { if (dialog && dialog.open) load(); });
})();
