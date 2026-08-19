// ═══════════════════════════════════════════════════════════════════════════
// adm-schedule-seed.js — 🗓 지난 수업에서 «수업 일정» 만들기 · 2026-08-19 (사장님 A안)
//
//   왜 —
//     학생 상세보기의 「📅 일정변경」 버튼도, 주간 시간표도 class_schedules 를 본다.
//     그런데 운영 D1 실측(2026-08-18)에서 그 표의 진짜 학생 것은 **6명 15건**뿐이었다
//     (673행 중 658행이 user_id='lms'·'type_seed' 자리표시자). 학생 29,398명 중 6명이다.
//     반면 실제 수업 기록은 **attendance 에 182,612건** 있다.
//     자료가 없는 게 아니라 «앞으로의 일정» 칸으로 옮겨지지 않았을 뿐이다.
//
//   ⚠️ 사장님이 고르신 것은 A안 — «미리보기 → 사람이 고르기 → 만들기» 다.
//      ⛔ «누르면 전부 자동» 으로 바꾸지 말 것. 그만둔 학생에게 수업이 잡히면
//         「내 일정에 왜 이게 있냐」가 수백 건 들어온다. 서버도 apply 에서 한 번 더 막는다.
//
//   ⚠️ 요일 번호 — 서버(attendance·class_schedules)는 0=일…6=토 다. 이 화면도 그대로 쓴다.
//      주간 시간표(weekly-schedule.html)만 0=월 이라 거기서 바꾼다. 섞으면
//      「화요일로 봤는데 월요일에 잡히는」 사고가 난다(CLAUDE.md 「요일 번호 체계」 함정).
//
//   ⚠️ 글자색을 span/div 에 주지 않는다 — admin-inline-c.css 가 .sub-body 안의
//      p/span/div 색을 !important 로 덮는다. 색은 <td>·배경색으로 낸다.
//
//   👩‍🏫 강사 이름은 서버가 «카페24 강사번호 → 급여표 이름 → 원부(teachers) 번호» 로 찾아 준다.
//      ⛔ 화면에서 번호를 손대지 말 것. attendance.teacher_name 에는 옛 동기화가 넣은
//         **남의 이름**이 남아 있고, 카페24 번호와 원부 번호는 서로 다른 체계다
//         (자세한 이유는 api-admin.ts 의 loadCafe24TeacherMap 주석).
//      「원부 미연결」은 이름은 맞는데 원부에 그 이름이 없다는 뜻이다 — 일정은 생기고
//      강사 칸만 빈다. 관리자 › 강사 관리에서 이름을 맞추면 다음부터 붙는다.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var ROWS = [];                 // 미리보기 결과(정본). 만들 때도 여기서 고른 것만 보낸다.
  var WIRED = false;

  function isEn() { return window.adminLang === 'en'; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(n) { return (Number(n) || 0).toLocaleString('ko-KR'); }
  /** 라벨 — 🌐 를 눌러도 따라오도록 data-ko/data-en 을 함께 박는다 */
  function t(ko, en) { return 'data-ko="' + esc(ko) + '" data-en="' + esc(en) + '">' + esc(isEn() ? en : ko); }

  var DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  var DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dowName(d) { return (isEn() ? DOW_EN : DOW_KO)[d] || String(d); }

  function say(msg, color) {
    var m = $('seed-msg');
    if (m) { m.style.color = color || '#475569'; m.textContent = msg; }
  }

  // ── 미리보기 ─────────────────────────────────────────────────────────────
  /* keepMsg — 만들고 나서 다시 훑을 때는 «몇 건 만들었습니다» 를 지우지 않는다.
     (지우면 결과를 읽기도 전에 사라진다 — 2026-08-19 실측으로 잡음) */
  function preview(keepMsg) {
    var qs = [];
    var f = ($('seed-from') || {}).value, to = ($('seed-to') || {}).value, mn = ($('seed-min') || {}).value;
    if (f) qs.push('from=' + encodeURIComponent(f));
    if (to) qs.push('to=' + encodeURIComponent(to));
    if (mn) qs.push('min_seen=' + encodeURIComponent(mn));
    $('seed-box').innerHTML = '<div style="padding:16px;color:#64748b;font-size:13px;text-align:center">'
      + esc(isEn() ? 'Scanning past classes…' : '지난 수업을 훑는 중…') + '</div>';
    if (!keepMsg) say('');
    fetch('/api/admin/schedule-seed/preview' + (qs.length ? '?' + qs.join('&') : ''),
      { cache: 'no-store', credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && (d.message || d.error)) || 'failed');
        ROWS = d.items || [];
        // 서버가 정한 «권장» 규칙을 그대로 체크 초기값으로 쓴다 — 규칙을 화면에 또 적지 않는다
        ROWS.forEach(function (r) { r._pick = !!(r.in_roster && r.active && !r.already); });
        if ($('seed-from')) $('seed-from').value = d.from;
        if ($('seed-to')) $('seed-to').value = d.to;
        renderSummary(d);
        render();
      })
      .catch(function (e) {
        $('seed-box').innerHTML = '<div style="padding:16px;color:#b91c1c;font-size:13px">'
          + esc((isEn() ? 'Preview failed: ' : '미리보기 실패: ') + (e.message || e)) + '</div>';
      });
  }

  function renderSummary(d) {
    var T = d.totals || {};
    var box = $('seed-summary');
    if (!box) return;
    box.style.display = '';
    box.innerHTML =
      '<b>' + esc(d.from) + ' ~ ' + esc(d.to) + '</b>'
      + '<span ' + t(' · 최소 ' + d.min_seen + '회 반복', ' · repeated ≥' + d.min_seen) + '</span><br>'
      + '<span ' + t('찾은 패턴 ', 'Patterns ') + '</span><b>' + num(T.patterns) + '</b>'
      + '<span ' + t(' · 학생 ', ' · students ') + '</span><b>' + num(T.students) + '</b>'
      + '<span ' + t(' · 권장(기본 체크) ', ' · recommended ') + '</span><b>' + num(T.recommended) + '</b>'
      /* 왜 빠졌는지 숫자로 보여 준다 — 「왜 이것밖에 안 되지」 를 화면에서 답한다 */
      + '<br><span ' + t(
        '자동 제외 — 이미 일정 있음 ' + num(T.skip_already)
        + ' · 수강 중 아님 ' + num(T.skip_not_active)
        + ' · 명부에 없음 ' + num(T.skip_not_in_roster),
        'Auto-excluded — already scheduled ' + num(T.skip_already)
        + ' · not active ' + num(T.skip_not_active)
        + ' · not in roster ' + num(T.skip_not_in_roster)) + '</span>'
      /* 👩‍🏫 강사가 안 붙는 건수를 미리 알린다 — 만들고 나서 「강사가 없네」가 안 되게 */
      + '<br><span ' + t(
        '권장분 강사 — 미상 ' + num(T.no_teacher) + '건 · 원부 미연결 ' + num(T.teacher_unlinked) + '건',
        'Teacher on recommended — unknown ' + num(T.no_teacher)
        + ' · not linked to roster ' + num(T.teacher_unlinked)) + '</span>';
  }

  function pickedCount() { return ROWS.filter(function (r) { return r._pick; }).length; }

  function render() {
    var box = $('seed-box');
    if (!box) return;
    $('seed-actions').style.display = ROWS.length ? 'flex' : 'none';
    if (!ROWS.length) {
      box.innerHTML = '<div style="padding:18px;color:#64748b;font-size:13px;text-align:center">'
        + esc(isEn() ? 'No repeating pattern found in that period.' : '그 기간에는 반복 패턴이 없습니다.') + '</div>';
      return;
    }
    var head = '<thead><tr style="background-color:#f1f5f9">'
      + '<th style="padding:7px 8px;width:34px"></th>'
      + '<th style="padding:7px 8px;text-align:left;font-size:11.5px;color:#334155" ' + t('학생', 'Student') + '</th>'
      + '<th style="padding:7px 8px;text-align:left;font-size:11.5px;color:#334155" ' + t('만들 일정', 'Schedule to create') + '</th>'
      + '<th style="padding:7px 8px;text-align:left;font-size:11.5px;color:#334155" ' + t('강사', 'Teacher') + '</th>'
      + '<th style="padding:7px 8px;text-align:right;font-size:11.5px;color:#334155" ' + t('관측', 'Seen') + '</th>'
      + '<th style="padding:7px 8px;text-align:left;font-size:11.5px;color:#334155" ' + t('상태', 'Status') + '</th>'
      + '</tr></thead>';
    var body = ROWS.map(function (r, i) {
      var why = r.already ? (isEn() ? 'already scheduled' : '이미 일정 있음')
              : !r.in_roster ? (isEn() ? 'not in roster' : '명부에 없음')
              : !r.active ? (isEn() ? 'not active' : '수강 중 아님')
              : (isEn() ? 'ready' : '만들 수 있음');
      var bg = r.already ? '#fef3c7' : (!r.in_roster || !r.active) ? '#fee2e2' : '#dcfce7';
      return '<tr style="border-bottom:1px solid #f1f5f9">'
        + '<td style="padding:6px 8px;text-align:center"><input type="checkbox" class="seed-pick" data-i="' + i + '"'
          + (r._pick ? ' checked' : '') + '></td>'
        + '<td style="padding:6px 8px;font-size:12.5px;color:#0f172a"><b>' + esc(r.student_name || r.user_id) + '</b>'
          + '<span style="color:#94a3b8;font-size:11px"> ' + esc(r.user_id) + '</span>'
          + (r.shop_name ? '<br><span style="color:#64748b;font-size:11px">' + esc(r.shop_name) + '</span>' : '') + '</td>'
        + '<td style="padding:6px 8px;font-size:12.5px;color:#1e293b">'
          + esc((isEn() ? 'every ' : '매주 ') + dowName(r.dow) + ' ' + r.start_time) + ' · ' + esc(r.duration_min) + (isEn() ? 'min' : '분') + '</td>'
        + '<td style="padding:6px 8px;font-size:12px;color:#475569">' + esc(r.teacher_name || '—')
          + (r.teacher_name && !r.teacher_id
              ? '<br><span style="background-color:#fef3c7;border-radius:999px;padding:1px 6px;font-size:10.5px">'
                + esc(isEn() ? 'not linked' : '원부 미연결') + '</span>' : '') + '</td>'
        + '<td style="padding:6px 8px;font-size:12px;color:#475569;text-align:right">' + num(r.seen)
          + (r.last_date ? '<br><span style="color:#94a3b8;font-size:11px">' + esc(r.last_date) + '</span>' : '') + '</td>'
        + '<td style="padding:6px 8px"><span style="background-color:' + bg + ';border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700">'
          + esc(why) + '</span></td>'
        + '</tr>';
    }).join('');
    box.innerHTML = '<table style="width:100%;border-collapse:collapse;background-color:#fff;min-width:640px">'
      + head + '<tbody>' + body + '</tbody></table>';
    updatePicked();
  }

  function updatePicked() {
    var el = $('seed-picked');
    if (el) el.textContent = (isEn() ? 'Ticked: ' : '선택: ') + pickedCount() + (isEn() ? '' : '건');
  }

  // ── 만들기 ───────────────────────────────────────────────────────────────
  function apply() {
    var picked = ROWS.filter(function (r) { return r._pick; });
    if (!picked.length) { say(isEn() ? 'Nothing ticked.' : '선택한 것이 없습니다.', '#b91c1c'); return; }
    /* ⚠️ 실서비스 학생 일정이다. 몇 명에게 몇 건이 생기는지 숫자로 보여 주고 한 번 더 묻는다. */
    var students = new Set(picked.map(function (r) { return r.user_id; })).size;
    var q = isEn()
      ? 'Create ' + picked.length + ' schedules for ' + students + ' students?\n\nThis writes to live data. Students will see these classes.'
      : '학생 ' + students + '명에게 수업 일정 ' + picked.length + '건을 만듭니다.\n\n실서비스 자료에 들어갑니다 — 학생 화면에도 보입니다. 진행할까요?';
    if (!confirm(q)) return;

    var btn = $('seed-apply-btn');
    if (btn) btn.disabled = true;
    say(isEn() ? 'Creating…' : '만드는 중…');
    fetch('/api/admin/schedule-seed/apply', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: picked.map(function (r) {
          return { user_id: r.user_id, dow: r.dow, start_time: r.start_time,
                   duration_min: r.duration_min, teacher_uid: r.teacher_uid, teacher_name: r.teacher_name };
        })
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) throw new Error((d && (d.message || d.error)) || 'failed');
      say((isEn() ? '✅ Created ' + d.created + ' schedules.' : '✅ 수업 일정 ' + d.created + '건을 만들었습니다.')
        + (d.without_teacher ? (isEn() ? ' (' + d.without_teacher + ' without teacher)'
                                       : ' (강사 미배정 ' + d.without_teacher + '건)') : '')
        + (d.skipped_count ? (isEn() ? ' (' + d.skipped_count + ' skipped)' : ' (건너뜀 ' + d.skipped_count + '건)') : ''),
        '#15803d');
      preview(true); // 다시 훑어서 «이미 일정 있음» 으로 바뀐 것을 눈으로 확인시킨다(결과 메시지는 남긴다)
    }).catch(function (e) {
      say((isEn() ? '❌ Failed: ' : '❌ 실패: ') + (e.message || e), '#b91c1c');
    }).then(function () { if (btn) btn.disabled = false; });
  }

  // ── 배선 ─────────────────────────────────────────────────────────────────
  function wire() {
    if (WIRED) return;
    WIRED = true;
    var b = $('seed-preview-btn'); if (b) b.addEventListener('click', preview);
    var a = $('seed-apply-btn'); if (a) a.addEventListener('click', apply);
    var box = $('seed-box');
    if (box) box.addEventListener('change', function (e) {
      var c = e.target.closest && e.target.closest('.seed-pick');
      if (!c) return;
      var r = ROWS[Number(c.dataset.i)];
      if (r) { r._pick = c.checked; updatePicked(); }
    });
    var rec = $('seed-check-rec');
    if (rec) rec.addEventListener('click', function () {
      ROWS.forEach(function (r) { r._pick = !!(r.in_roster && r.active && !r.already); });
      render();
    });
    var none = $('seed-check-none');
    if (none) none.addEventListener('click', function () {
      ROWS.forEach(function (r) { r._pick = false; });
      render();
    });
  }

  var card = document.getElementById('card-schedule-seed');
  if (card) card.addEventListener('toggle', function () { if (this.open) wire(); });
  window.scheduleSeedPreview = preview;   // 콘솔·다른 화면에서 부를 수 있게
})();
