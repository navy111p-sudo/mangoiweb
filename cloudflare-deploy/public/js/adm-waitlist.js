/* 🪑 대기자 명단 (sub-waitlist)
 *
 * [왜] 원하는 시간에 자리가 없으면 상담이 그대로 끝난다. 이미 관심을 보인 고객이라
 *      신규 광고보다 회수 단가가 훨씬 싸다. 줄을 세워 두고 자리가 나면 연락한다.
 *
 * [지금까지] 서버(GET/POST /api/admin/stats/waitlist)는 2026-08-04 에 만들어져 있었는데
 *      **볼 화면이 없어** 아무도 쓰지 못했다. 그 반쪽을 잇는다.
 *
 * 🎯 이 화면의 핵심은 목록이 아니라 «지금 자리가 난 사람» 이다.
 *    서버가 희망 요일·시간에 **비어 있는 강사**를 계산해 주므로, 그 사람을 맨 위로 올리고
 *    전화 걸기 버튼을 바로 붙인다. 명단만 보여 주면 또 아무도 안 본다.
 */
(function () {
  var _rows = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isEn() { return !!(window.adminLang && window.adminLang !== 'ko'); }
  /* 한/영 병기 — 운영 인력 상당수가 필리핀이라 한국어만 박아 두면 그 사람들에게는 빈 화면과 같다.
     ⚠️ 부르는 시점에 판정한다(모듈 로드 시 고정하면 언어를 바꿔도 안 따라온다). */
  function T(ko, enText) { var en = isEn(); return en ? enText : ko; }
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function dowLabel(v) {
    var n = Number(v);
    if (!isNaN(n) && n >= 0 && n <= 6) return isEn() ? DOW_EN[n] : DOW[n];
    return esc(v || '—');
  }
  function fmtDate(ms) {
    if (!ms) return '—';
    var d = new Date(Number(ms) + 9 * 3600 * 1000);   // KST
    return d.toISOString().slice(5, 10).replace('-', '/');
  }

  function render() {
    var host = document.getElementById('wl-table');
    if (!host) return;
    if (!_rows.length) {
      host.innerHTML = '<div style="padding:18px;text-align:center;color:#6b7280;font-size:13px">'
        + T('대기 중인 분이 없습니다.', 'No one is waiting.') + '</div>';
      return;
    }
    // 🎯 «자리가 난 사람» 을 맨 위로 — 이 화면을 여는 이유가 그것이다.
    var rows = _rows.slice().sort(function (a, b) {
      var fa = Number(a.free_teacher_count || 0) > 0 ? 0 : 1;
      var fb = Number(b.free_teacher_count || 0) > 0 ? 0 : 1;
      return fa !== fb ? fa - fb : Number(b.created_at || 0) - Number(a.created_at || 0);
    });

    var ready = rows.filter(function (r) { return Number(r.free_teacher_count || 0) > 0; }).length;
    var sum = document.getElementById('wl-summary');
    if (sum) {
      sum.textContent = ready
        ? T('지금 연결 가능한 분 ' + ready + '명', ready + ' can be matched now')
        : T('대기 ' + rows.length + '명 — 지금 맞는 자리는 없습니다', rows.length + ' waiting — no open slot right now');
      sum.style.color = ready ? '#166534' : '#6b7280';
    }

    var h = '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="background:#f3f4f6">'
      + [T('학생', 'Student'), T('연락처', 'Phone'), T('희망 요일·시간', 'Preferred'),
         T('지금 비는 강사', 'Free teachers now'), T('접수', 'Added'), ''].map(function (x) {
          return '<th style="padding:8px;text-align:left">' + x + '</th>'; }).join('')
      + '</tr></thead><tbody>';

    rows.forEach(function (r) {
      var free = r.free_teachers;
      var cnt = Number(r.free_teacher_count || 0);
      var freeCell;
      if (free == null) {
        // 희망 요일·시간을 안 적었으면 «없음» 이 아니라 «못 따짐» 이다. 구분해서 말한다.
        freeCell = '<span style="color:#9ca3af">' + T('희망 시간 미기재', 'no preferred time') + '</span>';
      } else if (cnt > 0) {
        freeCell = '<span style="padding:2px 9px;border-radius:99px;font-size:11px;font-weight:800;background:#dcfce7;color:#166534">'
          + cnt + T('명 가능', ' free') + '</span>'
          + '<div style="margin-top:3px;font-size:11px;color:#6b7280">'
          + free.map(function (f) { return esc(f.name); }).join(', ') + '</div>';
      } else {
        freeCell = '<span style="padding:2px 9px;border-radius:99px;font-size:11px;font-weight:800;background:#fee2e2;color:#991b1b">'
          + T('자리 없음', 'no slot') + '</span>';
      }
      var phone = String(r.phone || '').trim();
      h += '<tr style="border-bottom:1px solid #e5e7eb' + (cnt > 0 ? ';background:#f0fdf4' : '') + '">'
        + '<td style="padding:8px;font-weight:700">' + esc(r.student_name) + '</td>'
        + '<td style="padding:8px">' + (phone
            ? '<a href="tel:' + esc(phone) + '" style="color:#1e40af;font-weight:700;text-decoration:none">' + esc(phone) + '</a>'
            : '<span style="color:#9ca3af">—</span>') + '</td>'
        + '<td style="padding:8px">' + dowLabel(r.day_pref) + ' ' + esc(r.time_pref || '')
        + (r.teacher_pref ? '<div style="font-size:11px;color:#6b7280">' + T('희망 강사: ', 'wants: ') + esc(r.teacher_pref) + '</div>' : '')
        + '</td>'
        + '<td style="padding:8px">' + freeCell + '</td>'
        + '<td style="padding:8px;color:#6b7280">' + fmtDate(r.created_at) + '</td>'
        + '<td style="padding:8px;white-space:nowrap">'
        + '<button onclick="wlResolve(' + Number(r.id) + ')" style="padding:5px 10px;font-size:12px;font-weight:800;background:#166534;color:#fff;border:0;border-radius:6px;cursor:pointer">'
        + T('등록됨', 'Enrolled') + '</button> '
        + '<button onclick="wlCancel(' + Number(r.id) + ')" style="padding:5px 10px;font-size:12px;background:#fff;color:#991b1b;border:1px solid #fecaca;border-radius:6px;cursor:pointer">'
        + T('취소', 'Cancel') + '</button>'
        + '</td></tr>';
    });
    host.innerHTML = h + '</tbody></table>';
  }

  window.wlLoad = async function () {
    var host = document.getElementById('wl-table');
    var status = ((document.getElementById('wl-status') || {}).value) || 'waiting';
    if (host) host.innerHTML = '<div style="padding:14px;color:#6b7280;font-size:12px">' + T('불러오는 중…', 'Loading…') + '</div>';
    try {
      var res = await fetch('/api/admin/stats/waitlist?status=' + encodeURIComponent(status),
                            { credentials: 'include', cache: 'no-store' });
      var j = await res.json();
      if (!j || !j.ok) throw new Error((j && (j.message || j.error)) || 'failed');
      _rows = j.rows || [];   // 서버 응답 키는 rows (api-admin.ts /api/admin/stats/waitlist)
      render();
    } catch (e) {
      if (host) host.innerHTML = '<div style="padding:14px;color:#b91c1c;font-size:12px">'
        + T('불러오지 못했습니다: ', 'Failed to load: ') + esc(e.message) + '</div>';
    }
  };

  async function post(body, okMsgKo, okMsgEn) {
    try {
      var res = await fetch('/api/admin/stats/waitlist', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      var j = await res.json();
      if (j && j.ok) { if (okMsgKo) alert(T(okMsgKo, okMsgEn)); wlLoad(); return true; }
      alert(T('실패: ', 'Failed: ') + ((j && (j.message || j.error)) || 'unknown'));
    } catch (e) { alert(T('오류: ', 'Error: ') + e.message); }
    return false;
  }

  window.wlAdd = function () {
    var name = (document.getElementById('wl-name').value || '').trim();
    if (!name) { alert(T('학생 이름을 입력하세요.', 'Enter the student name.')); return; }
    post({
      action: 'add', student_name: name,
      phone: (document.getElementById('wl-phone').value || '').trim(),
      day_pref: (document.getElementById('wl-day').value || '').trim(),
      time_pref: (document.getElementById('wl-time').value || '').trim(),
      teacher_pref: (document.getElementById('wl-teacher').value || '').trim(),
      note: (document.getElementById('wl-note').value || '').trim(),
    }, '대기자로 등록했습니다.', 'Added to the waitlist.').then(function (ok) {
      if (ok) ['wl-name', 'wl-phone', 'wl-time', 'wl-teacher', 'wl-note'].forEach(function (id) {
        var el = document.getElementById(id); if (el) el.value = '';
      });
    });
  };
  window.wlResolve = function (id) {
    if (!confirm(T('이 분을 «등록 완료»로 처리할까요?', 'Mark this person as enrolled?'))) return;
    post({ action: 'resolve', id: id });
  };
  window.wlCancel = function (id) {
    if (!confirm(T('이 분을 «취소»로 처리할까요?', 'Mark this person as cancelled?'))) return;
    post({ action: 'cancel', id: id });
  };

  try {
    var card = document.getElementById('sub-waitlist');
    if (card) card.addEventListener('toggle', function () {
      if (card.open && !card.__wl) { card.__wl = true; window.wlLoad(); }
    });
  } catch (e) {}
})();
