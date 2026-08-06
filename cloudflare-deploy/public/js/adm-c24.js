/* 🗂 카페24 명부 — 직원 · 교재 (card-cafe24-lists)
 *
 * [왜] 카페24에서 넘어온 데이터 중 **직원(Staff)과 교재(Book)는 조회 창구만 있고
 *      볼 화면이 없었다.** 그래서 «옮겨는 놨는데 아무도 못 보는» 상태였다.
 *      (강사·학생 명부는 화면이 있는데 이 둘만 빠져 있었다)
 *
 * ⛔ 여기서 데이터를 고치지 않는다. 보기 전용이다 — 원천은 카페24 야간 동기화다.
 * ⚠️ Neo4j 가 안 붙으면 «비어 있음»이 아니라 «연결이 안 됨»이라고 말한다.
 *    빈 표를 보여주면 «직원이 0명»으로 오해한다.
 */
(function () {
  var _tab = 'staff';
  var _cache = { staff: null, books: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isEn() { return !!(window.adminLang && window.adminLang !== 'ko'); }
  function T(ko, en) { return isEn() ? en : ko; }

  function note(msg) {
    var h = document.getElementById('c24-table');
    if (h) h.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;font-size:13px;line-height:1.8">' + msg + '</div>';
  }

  function renderStaff(rows) {
    if (!rows.length) return note(T('직원 기록이 없습니다.', 'No staff records.'));
    var h = '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="background:#f3f4f6">'
      + ['이름 / Name', '닉네임 / Nickname', '이메일 / Email', '상태 / Status', '소속 / Branch'].map(function (x) {
          return '<th style="padding:8px;text-align:left">' + x + '</th>'; }).join('')
      + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var active = String(r.status || '').indexOf('퇴') < 0 && !r.retire_date;
      h += '<tr style="border-bottom:1px solid #e5e7eb">'
        + '<td style="padding:8px;font-weight:700">' + esc(r.name) + '</td>'
        + '<td style="padding:8px">' + esc(r.nickname) + '</td>'
        + '<td style="padding:8px">' + esc(r.email) + '</td>'
        + '<td style="padding:8px"><span style="padding:2px 9px;border-radius:99px;font-size:11px;font-weight:800;background:'
        + (active ? '#dcfce7;color:#166534' : '#f3f4f6;color:#6b7280') + '">'
        + esc(r.status || (active ? T('재직', 'Active') : T('퇴사', 'Left'))) + '</span></td>'
        + '<td style="padding:8px">' + esc(r.franchise_id) + '</td></tr>';
    });
    document.getElementById('c24-table').innerHTML = h + '</tbody></table>';
  }

  function renderBooks(rows) {
    if (!rows.length) return note(T('교재 기록이 없습니다.', 'No textbook records.'));
    var h = '<table style="width:100%;border-collapse:collapse;font-size:12.5px"><thead><tr style="background:#f3f4f6">'
      + ['교재명 / Title', '메모 / Memo', '상태 / Status', '그룹 / Group'].map(function (x) {
          return '<th style="padding:8px;text-align:left">' + x + '</th>'; }).join('')
      + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr style="border-bottom:1px solid #e5e7eb">'
        + '<td style="padding:8px;font-weight:700">' + esc(r.name) + '</td>'
        + '<td style="padding:8px;color:#6b7280">' + esc(r.memo) + '</td>'
        + '<td style="padding:8px">' + esc(r.status) + '</td>'
        + '<td style="padding:8px">' + esc(r.group_id) + '</td></tr>';
    });
    document.getElementById('c24-table').innerHTML = h + '</tbody></table>';
  }

  window.c24Tab = function (which) {
    _tab = which;
    ['staff', 'books'].forEach(function (k) {
      var b = document.getElementById('c24-tab-' + k);
      if (b) { b.style.background = (k === which) ? '#1e40af' : '#e5e7eb'; b.style.color = (k === which) ? '#fff' : '#374151'; }
    });
    window.c24Load();
  };

  window.c24Load = async function () {
    var q = ((document.getElementById('c24-q') || {}).value || '').trim();
    var cnt = document.getElementById('c24-count');
    note(T('불러오는 중…', 'Loading…'));
    var path = (_tab === 'staff') ? '/api/admin/staff/graph-list' : '/api/admin/books/graph-list';
    try {
      var res = await fetch(path + (q ? ('?q=' + encodeURIComponent(q)) : ''), { credentials: 'include', cache: 'no-store' });
      var j = await res.json();
      if (!j || !j.ok) {
        // 🔴 «없음»과 «못 붙음»을 구분해서 말한다 — 빈 표는 «0명»으로 읽힌다.
        if (j && (j.code === 'NEO4J_NOT_CONFIGURED' || j.code === 'NEO4J_UNREACHABLE')) {
          return note('<b>' + T('그래프DB에 연결하지 못했습니다.', 'Could not reach the graph database.') + '</b><br>'
            + T('직원·교재가 0명이라는 뜻이 아닙니다. 카페24 동기화 서버 상태를 확인해 주세요.',
                'This does not mean there are zero records. Please check the Cafe24 sync server.'));
        }
        return note(T('불러오지 못했습니다: ', 'Failed to load: ') + esc((j && (j.message || j.error)) || 'unknown'));
      }
      var rows = (_tab === 'staff') ? (j.staff || []) : (j.books || []);
      _cache[_tab] = rows;
      if (cnt) cnt.textContent = T(rows.length + '건', rows.length + ' rows');
      (_tab === 'staff') ? renderStaff(rows) : renderBooks(rows);
    } catch (e) {
      note(T('오류: ', 'Error: ') + esc(e.message));
    }
  };

  try {
    var card = document.getElementById('card-cafe24-lists');
    if (card) card.addEventListener('toggle', function () {
      if (card.open && !card.__c24) { card.__c24 = true; window.c24Tab('staff'); }
    });
  } catch (e) {}
})();
