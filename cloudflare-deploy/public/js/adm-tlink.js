/* 🔗 강사 계정 ↔ 강사 원부 연결 (card-teacher-link)
 *
 * [왜 필요한가] 로그인 계정과 수업 배정은 «이름 문자열»로만 이어져 있었다.
 *   - 계정 이름이 아이디 그대로('mangoi_033')면 원부에서 못 찾아 → 강사 화면이 «수업이 없다»고 한다.
 *     실제로는 수업이 있는데 «누구인지 모르는» 것이다. 강사는 수업이 취소된 줄 알고 안 들어온다.
 *   - 반대로 'Anna' 가 'H·ANNA·H' 안에 들어가 **남의 수업**이 붙은 사고도 났다.
 *
 * [이 화면] 사람이 한 번 «이 계정 = 이 강사»를 정해 준다. 정해 두면 이름 추측은 건너뛴다.
 *
 * ⛔ 계정·원부 행 자체는 건드리지 않는다. 연결표(teacher_account_links)에만 쓴다 — 되돌리기가 쉽다.
 */
(function () {
  var _roster = [];
  var _accounts = [];
  var _tlkShowLeft = false;  // 「퇴사 강사도 보기」 체크 상태 (render 가 매번 다시 읽는다)

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isEn() { return !!(window.adminLang && window.adminLang !== 'ko'); }
  function T(ko, en) { return isEn() ? en : ko; }

  /* 🚪 «퇴사(비활성) 강사인가» — 이 파일의 판정은 여기 한 곳뿐이다.
     ⚠️ 모르면 «재직» 으로 둔다. 숨기는 쪽으로 실패하면 멀쩡한 강사가 목록에서 조용히 사라져
        연결 자체를 못 하게 된다. `Number(null) === 0` 이 참이라 null 검사가 먼저여야 한다.
     ⚠️ 같은 판정이 `adm-teacher-links.js` 의 `tlIsLeft()` 에도 있다 — 두 화면이 서로를
        import 하지 않으므로 복제한다(이 저장소의 `enroll-ops.ts` 선례와 같은 방식).
        한쪽만 고치면 «화면마다 답이 다른» 사고가 되므로, 브라우저 검사가 둘을 함께 잰다. */
  function tlkIsLeft(r) {
    return !!r && r.active != null && Number(r.active) === 0;
  }

  // 상태 한 줄 설명 — 관리자가 «왜 연결해야 하는지»를 바로 알게.
  var STATUS = {
    linked: { ko: '연결됨', en: 'Linked', bg: '#dcfce7', fg: '#166534' },
    auto: { ko: '이름으로 자동 매칭', en: 'Auto-matched by name', bg: '#e0f2fe', fg: '#075985' },
    ambiguous: { ko: '헷갈림 — 골라야 함', en: 'Ambiguous — pick one', bg: '#fef3c7', fg: '#92400e' },
    unlinked: { ko: '연결 안 됨 — 수업이 안 보임', en: 'Not linked — sees no classes', bg: '#fee2e2', fg: '#991b1b' }
  };

  function rosterOptions(selected) {
    var out = '<option value="">' + T('— 선택 —', '— select —') + '</option>';
    for (var i = 0; i < _roster.length; i++) {
      var r = _roster[i];
      var mine = String(r.id) === String(selected || '');
      var left = tlkIsLeft(r);
      /* 🚪 (2026-09-09) 퇴사 강사는 기본으로 목록에서 뺀다 — 잘못 이으면 출근·급여가 갈린다.
         ⛔ 이미 고른 사람(mine)은 «절대» 숨기지 않는다 — 숨기면 그 줄이 「연결 안 됨」으로
            보여 사람이 멀쩡한 연결을 다시 만들려 든다.
         ✅ 되돌릴 길은 화면에 둔다 — 「퇴사 강사도 보기」 체크박스(#tlk-show-left). */
      if (left && !mine && !_tlkShowLeft) continue;
      out += '<option value="' + esc(r.id) + '"' + (mine ? ' selected' : '') +
        '>' + esc(r.name) + ' (#' + esc(r.id) + ')' + (left ? ' (' + T('퇴사', 'left') + ')' : '') + '</option>';
    }
    return out;
  }

  /* 🔌 체크박스 배선 — 인라인 `oninput` 이 아니라 위임 리스너로 단다.
     왜 — 이 파일은 «카드를 펼칠 때» 늦게 실려서(lazy), 인라인이 부르는 이름이 아직 없을 수
     있다. 그러면 콘솔에만 ReferenceError 가 나고 화면은 멀쩡해 보인다(CLAUDE.md 2장
     「인라인 onclick·onchange 가 부르는 이름」). 위임은 표를 다시 그려도 살아남는 이득도 있다. */
  document.addEventListener('change', function (e) {
    var t = e && e.target;
    if (t && t.id === 'tlk-show-left') render();
  });


  /* 🌐 EN/KO 토글 — 이 표의 라벨은 JS 가 그리므로 `data-ko`/`data-en` 루프가 못 고친다.
     ⚠️ 관리자 화면의 그 이벤트는 `document` 에서 발행되고(`adm-core.js` 의 toggleAdminLang)
        `CustomEvent` 기본이 `bubbles:false` 라 window 로 «올라가지 않는다» — window 에만 달면
        영원히 침묵한다(CLAUDE.md 2장). 화면마다 발행처가 달라 «양쪽에 다» 단다(중복 호출은
        다시 그리기뿐이라 무해). */
  ['mangoi:lang-changed'].forEach(function (ev) {
    document.addEventListener(ev, function () { if (_accounts.length) render(); });
    window.addEventListener(ev, function () { if (_accounts.length) render(); });
  });

  function render() {
    var host = document.getElementById('tlk-table');
    if (!host) return;
    _tlkShowLeft = !!(document.getElementById('tlk-show-left') || {}).checked;
    // 급한 것부터 위로 — 연결 안 됨 → 헷갈림 → 자동매칭 → 연결됨
    var order = { unlinked: 0, ambiguous: 1, auto: 2, linked: 3 };
    var rows = _accounts.slice().sort(function (a, b) {
      var d = (order[a.status] || 9) - (order[b.status] || 9);
      return d !== 0 ? d : String(a.username).localeCompare(String(b.username));
    });

    var need = rows.filter(function (r) { return r.status === 'unlinked' || r.status === 'ambiguous'; }).length;
    var sum = document.getElementById('tlk-summary');
    if (sum) {
      sum.textContent = need
        ? T('손봐야 할 계정 ' + need + '개', need + ' account(s) need attention')
        : T('모든 계정이 정상입니다', 'All accounts are fine');
      sum.style.color = need ? '#b91c1c' : '#166534';
    }

    var h = '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
      '<thead><tr style="background:#f3f4f6">' +
      '<th style="padding:8px;text-align:left">' + T('로그인 아이디', 'Login ID') + '</th>' +
      '<th style="padding:8px;text-align:left">' + T('계정에 적힌 이름', 'Name on account') + '</th>' +
      '<th style="padding:8px;text-align:left">' + T('지금 상태', 'Status') + '</th>' +
      '<th style="padding:8px;text-align:left">' + T('원부에서 고르기', 'Pick from roster') + '</th>' +
      '<th style="padding:8px;text-align:left"></th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var st = STATUS[r.status] || STATUS.unlinked;
      var detail = '';
      if (r.status === 'linked') detail = esc(r.linked_teacher_name || '') + ' (#' + esc(r.linked_teacher_id) + ')';
      else if (r.status === 'auto') detail = esc(r.auto_match ? r.auto_match.name : '');
      else if (r.status === 'ambiguous') detail = (r.auto_candidates || []).map(function (c) { return esc(c.name); }).join(' / ');
      else detail = r.name_is_username
        ? T('계정에 이름이 안 들어 있음', 'No real name on the account') : '';

      h += '<tr style="border-bottom:1px solid #e5e7eb">' +
        // ⚠️ font-family 를 여기서 지정하지 않는다 — 한자 글꼴 통일 가드가 지킨다(hanzi_font_harness)
        '<td style="padding:8px;font-weight:700;letter-spacing:.02em">' + esc(r.username) + '</td>' +
        '<td style="padding:8px">' + esc(r.name) + '</td>' +
        '<td style="padding:8px">' +
          '<span style="display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:800;background:' +
          st.bg + ';color:' + st.fg + '">' + T(st.ko, st.en) + '</span>' +
          (detail ? '<div style="margin-top:3px;font-size:11px;color:#6b7280">' + detail + '</div>' : '') +
        '</td>' +
        '<td style="padding:8px"><select id="tlk-sel-' + esc(r.username) + '" style="padding:5px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;max-width:230px">' +
          rosterOptions(r.linked_teacher_id || (r.auto_match ? r.auto_match.id : '')) + '</select></td>' +
        '<td style="padding:8px;white-space:nowrap">' +
          '<button onclick="tlkSave(\'' + esc(r.username) + '\')" style="padding:5px 11px;font-size:12px;font-weight:800;background:#1e40af;color:#fff;border:0;border-radius:6px;cursor:pointer">' +
          T('연결', 'Link') + '</button>' +
          (r.status === 'linked'
            ? ' <button onclick="tlkUnlink(\'' + esc(r.username) + '\')" style="padding:5px 11px;font-size:12px;background:#fff;color:#991b1b;border:1px solid #fecaca;border-radius:6px;cursor:pointer">' +
              T('해제', 'Unlink') + '</button>'
            : '') +
        '</td></tr>';
    }
    h += '</tbody></table>';
    if (!rows.length) h = '<div style="font-size:12px;color:#6b7280">' + T('강사 계정이 없습니다.', 'No teacher accounts.') + '</div>';
    host.innerHTML = h;
  }

  window.tlkLoad = async function () {
    var host = document.getElementById('tlk-table');
    if (host) host.innerHTML = '<div style="font-size:12px;color:#6b7280">' + T('불러오는 중…', 'Loading…') + '</div>';
    try {
      var res = await fetch('/api/admin/teacher-links', { credentials: 'include', cache: 'no-store' });
      var j = await res.json();
      if (!j || !j.ok) throw new Error((j && (j.message || j.error)) || 'failed');
      _accounts = j.accounts || [];
      _roster = j.roster || [];
      render();
    } catch (e) {
      if (host) host.innerHTML = '<div style="font-size:12px;color:#b91c1c">' +
        T('불러오지 못했습니다: ', 'Failed to load: ') + esc(e.message) + '</div>';
    }
  };

  window.tlkSave = async function (username) {
    var sel = document.getElementById('tlk-sel-' + username);
    var tid = sel ? sel.value : '';
    if (!tid) { alert(T('원부에서 강사를 먼저 고르세요.', 'Pick a teacher from the roster first.')); return; }
    var name = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : tid;
    if (!confirm(T('「' + username + '」 계정을 ' + name + ' 님으로 연결할까요?\n연결하면 그 강사의 수업·학생이 이 계정에 보입니다.',
                   'Link account "' + username + '" to ' + name + '?\nThat teacher\'s classes and students will become visible to this account.'))) return;
    try {
      var res = await fetch('/api/admin/teacher-links', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, teacher_id: tid })
      });
      var j = await res.json();
      if (j && j.ok) { alert(T('연결했습니다.', 'Linked.')); tlkLoad(); }
      else alert(T('실패: ', 'Failed: ') + ((j && (j.message || j.error)) || 'unknown'));
    } catch (e) { alert(T('오류: ', 'Error: ') + e.message); }
  };

  window.tlkUnlink = async function (username) {
    if (!confirm(T('연결을 해제할까요? 다시 이름 추측으로 돌아갑니다.',
                   'Remove the link? It will fall back to name guessing.'))) return;
    try {
      await fetch('/api/admin/teacher-links', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, teacher_id: '' })
      });
      tlkLoad();
    } catch (e) { alert(T('오류: ', 'Error: ') + e.message); }
  };

  // 카드를 펼치면 한 번 불러온다 (adm-lazy.js 가 이 파일을 그때 넣어 준다)
  try {
    var card = document.getElementById('card-teacher-link');
    if (card && card.open) window.tlkLoad();
    if (card) card.addEventListener('toggle', function () { if (card.open && !card.__tlkLoaded) { card.__tlkLoaded = true; window.tlkLoad(); } });
  } catch (e) {}
})();
