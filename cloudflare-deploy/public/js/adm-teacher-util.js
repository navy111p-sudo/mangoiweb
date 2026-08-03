// ═══════════════════════════════════════════════════════════════
// adm-teacher-util.js — 📊 강사 가동률 (2026-08-04 신규)
//   화면: admin.html > 🧑‍🏫 강사관리 > 📊 강사 가동률
//   서버: GET /api/admin/stats/teacher-utilization  (api-admin.ts)
//
//   왜 만들었나 —
//     강사 수·수업 수는 이미 보였지만 "열어둔 시간 중 얼마나 찼는가" 가 없었다.
//     화상수업의 원가는 강사 시간이라, 이 값 없이는 증원/감원 판단 근거가 없다.
//
//   ⚠️ 라벨은 한/영 둘 다 낸다 — 강사·운영 인력 상당수가 필리핀에 있다.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function isEn() {
    try {
      if (window.adminLang) return String(window.adminLang) === 'en';
      return document.documentElement.getAttribute('data-lang') === 'en';
    } catch (e) { return false; }
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  // 분 → "3시간 20분" / "3h 20m"
  function hm(min) {
    var m = Math.max(0, Math.round(Number(min) || 0));
    var h = Math.floor(m / 60), r = m % 60;
    if (isEn()) return (h ? h + 'h ' : '') + r + 'm';
    return (h ? h + '시간 ' : '') + r + '분';
  }
  // 가동률에 따른 색 — 낮으면 빨강(놀고 있음), 높으면 초록, 과포화는 주황
  function utilColor(p) {
    if (p == null) return '#94a3b8';
    if (p >= 90) return '#f97316';
    if (p >= 60) return '#16a34a';
    if (p >= 30) return '#eab308';
    return '#ef4444';
  }

  window.loadTeacherUtil = async function loadTeacherUtil() {
    var wrap = $('tu-wrap'), sum = $('tu-summary'), note = $('tu-note');
    if (!wrap) return;
    var en = isEn();
    wrap.innerHTML = '<div style="padding:18px;color:#9ca3af;font-size:12.5px">'
      + (en ? 'Loading…' : '불러오는 중…') + '</div>';
    if (sum) sum.textContent = '';

    var d;
    try {
      var r = await fetch('/api/admin/stats/teacher-utilization', { credentials: 'include', cache: 'no-store' });
      d = await r.json();
    } catch (e) {
      wrap.innerHTML = '<div style="padding:16px;color:#dc2626;font-size:12.5px">'
        + (en ? 'Network error: ' : '통신 오류: ') + esc(e && e.message ? e.message : e) + '</div>';
      return;
    }
    if (!d || !d.ok) {
      wrap.innerHTML = '<div style="padding:16px;color:#dc2626;font-size:12.5px">'
        + (en ? 'Failed to load. ' : '불러오지 못했습니다. ')
        + esc((d && (d.message || d.error)) || '') + '</div>';
      return;
    }

    var rows = d.teachers || [], s = d.summary || {}, w = d.window || {};

    if (note) {
      note.innerHTML =
        '<b>' + (en ? 'How this is calculated' : '이 숫자는 이렇게 계산합니다') + '</b><br>'
        + esc(en ? (d.note_en || '') : (d.note || ''))
        + '<br><span style="color:#94a3b8">'
        + (en ? 'Operating window observed from live schedules: ' : '지금 잡힌 수업에서 관측한 운영시간대: ')
        + esc(w.open || '-') + ' ~ ' + esc(w.close || '-')
        + (s.observed_from_schedules === false
            ? (en ? ' (no schedules yet — default window used)' : ' (아직 수업이 없어 기본값 사용)')
            : '')
        + '</span>';
    }

    if (sum) {
      var avg = s.avg_utilization_pct, all = s.overall_utilization_pct;
      sum.innerHTML =
        (en ? 'Teachers ' : '강사 ') + '<b>' + (s.teacher_count || 0) + '</b>'
        + ' · ' + (en ? 'avg ' : '평균 ')
        + '<b style="color:' + utilColor(avg) + '">' + (avg == null ? '—' : avg + '%') + '</b>'
        + ' · ' + (en ? 'overall ' : '전체 ')
        + '<b style="color:' + utilColor(all) + '">' + (all == null ? '—' : all + '%') + '</b>';
    }

    if (!rows.length) {
      wrap.innerHTML = '<div style="padding:18px;color:#9ca3af;font-size:12.5px">'
        + (en ? 'No recurring classes assigned to any teacher yet.'
              : '아직 강사에게 배정된 정기 수업이 없습니다.') + '</div>';
      return;
    }

    var th = 'padding:8px 10px;text-align:left;font-size:11.5px;color:#475569;background:#f8fafc;border-bottom:2px solid #e5e7eb;white-space:nowrap';
    var td = 'padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12.5px;vertical-align:middle';
    var h = '<table style="width:100%;border-collapse:collapse;min-width:640px">'
      + '<thead><tr>'
      + '<th style="' + th + '">' + (en ? 'Teacher' : '강사') + '</th>'
      + '<th style="' + th + ';width:36%">' + (en ? 'Utilization' : '가동률') + '</th>'
      + '<th style="' + th + ';text-align:right">' + (en ? 'Assigned' : '배정') + '</th>'
      + '<th style="' + th + ';text-align:right">' + (en ? 'Available' : '가능') + '</th>'
      + '<th style="' + th + ';text-align:right">' + (en ? 'Classes' : '수업수') + '</th>'
      + '<th style="' + th + '">' + (en ? 'Busiest' : '가장 바쁜 요일') + '</th>'
      + '</tr></thead><tbody>';

    rows.forEach(function (t) {
      var p = t.utilization_pct;
      var col = utilColor(p);
      var barW = p == null ? 0 : Math.max(0, Math.min(100, p));
      h += '<tr>'
        + '<td style="' + td + ';font-weight:700">' + esc(t.name) + '</td>'
        + '<td style="' + td + '">'
        +   '<div style="display:flex;align-items:center;gap:8px">'
        +     '<div style="flex:1;height:9px;background:#f1f5f9;border-radius:99px;overflow:hidden">'
        +       '<div style="width:' + barW + '%;height:100%;background:' + col + '"></div>'
        +     '</div>'
        +     '<b style="color:' + col + ';min-width:46px;text-align:right;font-variant-numeric:tabular-nums">'
        +       (p == null ? '—' : p + '%') + '</b>'
        +   '</div>'
        + '</td>'
        + '<td style="' + td + ';text-align:right;white-space:nowrap">' + hm(t.assigned_min) + '</td>'
        + '<td style="' + td + ';text-align:right;white-space:nowrap;color:#64748b">' + hm(t.available_min) + '</td>'
        + '<td style="' + td + ';text-align:right">' + (t.class_count || 0) + '</td>'
        + '<td style="' + td + ';color:#64748b">'
        +   esc(en ? (t.busiest_dow_en || '—') : (t.busiest_dow_ko || '—')) + '</td>'
        + '</tr>';
    });
    h += '</tbody></table>';

    // 놀고 있는 강사 안내 — 증원/감원 판단의 실제 근거가 되는 부분
    var idle = rows.filter(function (t) { return t.utilization_pct != null && t.utilization_pct < 30; });
    if (idle.length) {
      h += '<div style="margin-top:10px;font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:9px 12px">'
        + '⚠️ ' + (en
          ? ('Under 30% utilization: <b>' + idle.length + '</b> teacher(s) — ' + esc(idle.map(function (t) { return t.name; }).join(', ')))
          : ('가동률 30% 미만 <b>' + idle.length + '</b>명 — ' + esc(idle.map(function (t) { return t.name; }).join(', '))))
        + '</div>';
    }
    wrap.innerHTML = h;
  };
})();
