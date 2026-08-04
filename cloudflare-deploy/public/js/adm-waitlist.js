// ═══════════════════════════════════════════════════════════════
// adm-waitlist.js — 🪑 대기자 명단 (2026-08-04 신규)
//   화면: admin.html > 💌 신규상담 → 등록 전환 > 🪑 대기자 명단
//   서버: GET/POST /api/admin/stats/waitlist  (api-admin.ts)
//
//   왜 만들었나 —
//     원하는 시간에 자리가 없으면 상담이 그대로 끝나고 있었다. 이미 관심을 보인 고객이라
//     신규 광고보다 회수 단가가 훨씬 싸다. 줄을 세워두고 자리가 나면 연락하기 위한 최소 기능.
//
//   ⚠️ 라벨은 한/영 둘 다.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  var DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function isEn() {
    try {
      if (window.adminLang) return String(window.adminLang) === 'en';
      return document.documentElement.getAttribute('data-lang') === 'en';
    } catch (e) { return false; }
  }
  function $(id) { return document.getElementById(id); }
  function val(id) { var e = $(id); return e ? String(e.value || '').trim() : ''; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function ymd(ts) {
    var n = Number(ts); if (!n) return '—';
    var d = new Date(n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  async function post(body) {
    var r = await fetch('/api/admin/stats/waitlist', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await r.json();
  }

  window.addWaitlist = async function addWaitlist() {
    var en = isEn();
    var name = val('wl-name');
    if (!name) {
      alert(en ? 'Enter the student name.' : '학생 이름을 입력해 주세요.');
      var f = $('wl-name'); if (f) f.focus();
      return;
    }
    var j;
    try {
      j = await post({
        action: 'add', student_name: name, phone: val('wl-phone'),
        day_pref: val('wl-day'), time_pref: val('wl-time'), note: val('wl-note')
      });
    } catch (e) {
      alert((en ? 'Network error: ' : '통신 오류: ') + (e && e.message ? e.message : e));
      return;
    }
    if (!j || !j.ok) {
      alert((en ? 'Failed: ' : '실패: ') + ((j && (j.message_en && en ? j.message_en : j.message || j.error)) || ''));
      return;
    }
    ['wl-name', 'wl-phone', 'wl-time', 'wl-note'].forEach(function (id) { var e = $(id); if (e) e.value = ''; });
    var dsel = $('wl-day'); if (dsel) dsel.value = '';
    window.loadWaitlist();
  };

  window.resolveWaitlist = async function resolveWaitlist(id, action) {
    var en = isEn();
    var ask = action === 'resolve'
      ? (en ? 'Mark as enrolled?' : '등록 완료로 처리할까요?')
      : (en ? 'Cancel this waitlist entry?' : '이 대기를 취소할까요?');
    if (!confirm(ask)) return;
    var j;
    try { j = await post({ action: action, id: id }); }
    catch (e) { alert((en ? 'Network error' : '통신 오류')); return; }
    if (!j || !j.ok) { alert((en ? 'Failed' : '실패')); return; }
    window.loadWaitlist();
  };

  window.loadWaitlist = async function loadWaitlist() {
    var wrap = $('wl-wrap'), sum = $('wl-summary'), nb = $('wl-note-box');
    if (!wrap) return;
    var en = isEn();
    wrap.innerHTML = '<div style="padding:16px;color:#9ca3af;font-size:12.5px">' + (en ? 'Loading…' : '불러오는 중…') + '</div>';

    var d;
    try {
      var st = val('wl-filter') || 'waiting';
      var r = await fetch('/api/admin/stats/waitlist?status=' + encodeURIComponent(st), { credentials: 'include', cache: 'no-store' });
      d = await r.json();
    } catch (e) {
      wrap.innerHTML = '<div style="padding:16px;color:#dc2626;font-size:12.5px">'
        + (en ? 'Network error: ' : '통신 오류: ') + esc(e && e.message ? e.message : e) + '</div>';
      return;
    }
    if (!d || !d.ok) {
      wrap.innerHTML = '<div style="padding:16px;color:#dc2626;font-size:12.5px">'
        + (en ? 'Failed to load. ' : '불러오지 못했습니다. ') + esc((d && (d.message || d.error)) || '') + '</div>';
      return;
    }

    if (nb) nb.textContent = en ? (d.note_en || '') : (d.note || '');
    var c = d.counts || {};
    if (sum) {
      sum.innerHTML = (en ? 'Waiting ' : '대기중 ') + '<b>' + (c.waiting || 0) + '</b>'
        + ' · ' + (en ? 'enrolled ' : '등록됨 ') + '<b style="color:#16a34a">' + (c.enrolled || 0) + '</b>'
        + ' · ' + (en ? 'cancelled ' : '취소 ') + '<b style="color:#94a3b8">' + (c.cancelled || 0) + '</b>';
    }

    var rows = d.rows || [];
    if (!rows.length) {
      wrap.innerHTML = '<div style="padding:18px;color:#9ca3af;font-size:12.5px">'
        + (en ? 'No one on the waitlist.' : '대기자가 없습니다.') + '</div>';
      return;
    }

    var th = 'padding:8px 10px;text-align:left;font-size:11.5px;color:#475569;background:#f8fafc;border-bottom:2px solid #e5e7eb;white-space:nowrap';
    var td = 'padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12.5px;vertical-align:top';
    var h = '<table style="width:100%;border-collapse:collapse;min-width:700px"><thead><tr>'
      + '<th style="' + th + '">' + (en ? 'Student' : '학생') + '</th>'
      + '<th style="' + th + '">' + (en ? 'Phone' : '연락처') + '</th>'
      + '<th style="' + th + '">' + (en ? 'Preferred' : '희망 시간') + '</th>'
      + '<th style="' + th + ';width:32%">' + (en ? 'Teachers free at that slot' : '그 시간 배정 가능한 강사') + '</th>'
      + '<th style="' + th + '">' + (en ? 'Added' : '등록일') + '</th>'
      + '<th style="' + th + '">' + (en ? 'Action' : '처리') + '</th>'
      + '</tr></thead><tbody>';

    rows.forEach(function (w) {
      var dp = w.day_pref === '' || w.day_pref == null ? null : Number(w.day_pref);
      var pref = (dp != null && dp >= 0 && dp <= 6 ? (en ? DOW_EN[dp] : DOW_KO[dp]) : '')
        + (w.time_pref ? ' ' + esc(w.time_pref) : '');
      var freeHtml;
      if (w.free_teachers == null) {
        freeHtml = '<span style="color:#94a3b8">'
          + (en ? 'Add a weekday & time to match' : '희망 요일·시간을 적으면 자동 매칭')
          + '</span>';
      } else if (!w.free_teachers.length) {
        freeHtml = '<span style="color:#dc2626;font-weight:700">'
          + (en ? 'No teacher free — still full' : '가능한 강사 없음 — 아직 자리 없음') + '</span>';
      } else {
        freeHtml = '<span style="color:#16a34a;font-weight:800">✅ ' + w.free_teacher_count
          + (en ? ' free' : '명 가능') + '</span> <span style="color:#475569">'
          + esc(w.free_teachers.map(function (t) { return t.name; }).join(', ')) + '</span>';
      }
      var badge = w.status === 'enrolled'
        ? '<span style="color:#16a34a;font-weight:700">✅ ' + (en ? 'Enrolled' : '등록') + '</span>'
        : (w.status === 'cancelled'
          ? '<span style="color:#94a3b8">✖ ' + (en ? 'Cancelled' : '취소') + '</span>'
          : '<button type="button" onclick="resolveWaitlist(' + Number(w.id) + ',\'resolve\')" style="padding:4px 9px;font-size:11.5px;font-weight:700;background:#16a34a;color:#fff;border:0;border-radius:6px;cursor:pointer">'
            + (en ? 'Enrolled' : '등록완료') + '</button> '
          + '<button type="button" onclick="resolveWaitlist(' + Number(w.id) + ',\'cancel\')" style="padding:4px 9px;font-size:11.5px;background:#fff;color:#64748b;border:1px solid #d1d5db;border-radius:6px;cursor:pointer">'
            + (en ? 'Cancel' : '취소') + '</button>');

      h += '<tr>'
        + '<td style="' + td + ';font-weight:700">' + esc(w.student_name)
        + (w.note ? '<div style="font-size:11px;color:#94a3b8;font-weight:400">' + esc(w.note) + '</div>' : '') + '</td>'
        + '<td style="' + td + ';color:#475569">' + esc(w.phone || '—') + '</td>'
        + '<td style="' + td + ';white-space:nowrap">' + (pref.trim() || '<span style="color:#cbd5e1">—</span>') + '</td>'
        + '<td style="' + td + '">' + freeHtml + '</td>'
        + '<td style="' + td + ';color:#94a3b8;white-space:nowrap">' + ymd(w.created_at) + '</td>'
        + '<td style="' + td + ';white-space:nowrap">' + badge + '</td>'
        + '</tr>';
    });
    h += '</tbody></table>';
    wrap.innerHTML = h;
  };
})();
