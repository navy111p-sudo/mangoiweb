// ═══════════════════════════════════════════════════════════════════════════
// adm-teacher-links.js — 강사 ↔ 로그인 아이디 연결 (2026-08-08)
//
// 왜 이 화면이 필요한가
//   출근·지각을 계산하려면 «출석 기록의 로그인 계정» 과 «강사» 가 이어져 있어야 한다.
//   라이브 실측: teacher_account_links 0행 · teachers 29명 중 로그인 계정 보유 7명 ·
//   최근 30일 출석 4,954행 중 강사와 매칭되는 행 0건. 그래서 근태가 계산 자체가 안 됐다.
//
// ⚠️ 자동 매칭을 «일부러» 하지 않는다
//   teacher_legacy_accounts.teacher_name 은 아이디를 그대로 복사한 값(mangoi_006)이다.
//   이름 근거가 없으므로 추측으로 이으면 엉뚱한 사람의 근태·급여가 된다.
//   사람이 고른 것만 저장한다. 대신 «아직 안 이어진 것» 을 세어 눈에 띄게 해 둔다.
//
// 되돌리기 = admin.html 에서 이 파일 <script> 한 줄과 #card-teacher-links 블록 제거.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  var _tlTeachers = [];   // [{id, name, active}]
  var _tlAccounts = [];   // [{username, last_login_at}]
  var _tlLinks = {};      // username → {teacher_id, teacher_name}
  var _tlLoaded = false;
  var _tlShowLeft = false;  // 「퇴사 강사도 보기」 체크 상태 (tlRender 가 매번 다시 읽는다)

  function esc(v) {
    return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) {
      return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c];
    });
  }
  function isEn() { return (typeof adminLang !== 'undefined' && adminLang === 'en'); }
  function fmtDay(ms) {
    if (!ms) return '—';
    var d = new Date(Number(ms));
    if (isNaN(d.getTime())) return '—';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* 🚪 «퇴사(비활성) 강사인가» — 판정은 여기 한 곳뿐이다.
     ⚠️ 모르면 «재직» 으로 둔다. 숨기는 쪽으로 실패하면 멀쩡한 강사가 목록에서 조용히 사라져
        연결 자체를 못 하게 된다(빠지는 쪽이 훨씬 나쁘다). teachers.active 는 NULL 이 들어갈 수
        있고(스키마 DEFAULT 1 · 서버도 곳곳에서 COALESCE(active,1) 를 쓴다) `Number(null) === 0`
        이 참이므로 null 검사를 먼저 해야 한다. */
  function tlIsLeft(t) {
    return !!t && t.active != null && Number(t.active) === 0;
  }

  window.tlLoad = async function () {
    var wrap = document.getElementById('tl-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div style="padding:24px;text-align:center;color:#98a2b3;font-size:13px">'
      + (isEn() ? 'Loading…' : '불러오는 중…') + '</div>';
    try {
      var r = await fetch('/api/admin/teachers/links', { credentials: 'include' });
      var j = await r.json();
      if (!j || !j.ok) throw new Error((j && j.error) || 'load_failed');
      _tlTeachers = (j.teachers || []).map(function (t) {
        return { id: String(t.id), name: t.name || ('#' + t.id), active: t.active };
      });
      _tlAccounts = j.accounts || [];
      _tlLinks = {};
      (j.links || []).forEach(function (l) {
        _tlLinks[l.username] = { teacher_id: String(l.teacher_id), teacher_name: l.teacher_name };
      });
      _tlLoaded = true;
      tlRender();
    } catch (e) {
      wrap.innerHTML = '<div style="padding:24px;text-align:center;color:#b42318;font-size:13px">'
        + (isEn() ? 'Load failed: ' : '불러오기 실패: ') + esc(e.message) + '</div>';
    }
  };

  window.tlRender = function () {
    var wrap = document.getElementById('tl-wrap');
    if (!wrap || !_tlLoaded) return;
    var en = isEn();
    var q = String((document.getElementById('tl-search') || {}).value || '').trim().toLowerCase();
    var onlyUnlinked = !!(document.getElementById('tl-only-unlinked') || {}).checked;
    _tlShowLeft = !!(document.getElementById('tl-show-left') || {}).checked;

    var rows = _tlAccounts.filter(function (a) {
      if (q && String(a.username).toLowerCase().indexOf(q) < 0) return false;
      if (onlyUnlinked && _tlLinks[a.username]) return false;
      return true;
    });

    var linked = _tlAccounts.filter(function (a) { return !!_tlLinks[a.username]; }).length;
    var badge = document.getElementById('tl-badge');
    if (badge) {
      var left = _tlAccounts.length - linked;
      badge.textContent = left > 0
        ? (en ? (left + ' to link') : ('연결 필요 ' + left + '개'))
        : (en ? 'all linked' : '전부 연결됨');
      badge.style.color = left > 0 ? '#b45309' : '#067647';
    }
    var cnt = document.getElementById('tl-count');
    if (cnt) cnt.textContent = (en ? 'Linked ' : '연결 ') + linked + ' / ' + _tlAccounts.length;

    if (!rows.length) {
      wrap.innerHTML = '<div style="padding:24px;text-align:center;color:#98a2b3;font-size:13px">'
        + (en ? 'Nothing to show.' : '표시할 계정이 없습니다.') + '</div>';
      return;
    }

    // 이미 다른 계정에 쓰인 강사는 목록에서 «사용 중» 으로 표시 — 한 사람을 두 계정에 잇는 실수를 줄인다
    var usedBy = {};
    Object.keys(_tlLinks).forEach(function (u) { usedBy[_tlLinks[u].teacher_id] = u; });

    var html = '<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff">'
      + '<thead><tr>'
      + '<th style="text-align:left;padding:8px 12px;background:#f7f9fc;color:#5b6b7f;font-size:11.5px;border-bottom:1px solid #dde3ea">'
      + (en ? 'LOGIN ID' : '로그인 아이디') + '</th>'
      + '<th style="text-align:left;padding:8px 12px;background:#f7f9fc;color:#5b6b7f;font-size:11.5px;border-bottom:1px solid #dde3ea">'
      + (en ? 'LAST LOGIN' : '마지막 로그인') + '</th>'
      + '<th style="text-align:left;padding:8px 12px;background:#f7f9fc;color:#5b6b7f;font-size:11.5px;border-bottom:1px solid #dde3ea">'
      + (en ? 'TEACHER' : '강사') + '</th>'
      + '<th style="text-align:right;padding:8px 12px;background:#f7f9fc;color:#5b6b7f;font-size:11.5px;border-bottom:1px solid #dde3ea">'
      + (en ? 'STATUS' : '상태') + '</th>'
      + '</tr></thead><tbody>';

    rows.forEach(function (a, i) {
      var cur = _tlLinks[a.username];
      var bg = i % 2 ? '#fafbfc' : '#ffffff';
      var opts = '<option value="">' + (en ? '— not linked —' : '— 연결 안 됨 —') + '</option>';
      _tlTeachers.forEach(function (t) {
        var mine = cur && cur.teacher_id === t.id;
        var left = tlIsLeft(t);
        /* 🚪 (2026-09-09) 퇴사 강사는 기본으로 목록에서 뺀다.
           왜 — 이 드롭다운만 active 를 안 걸러서, 같은 사람이 원부에 두 줄로 있으면
           («FAR»(id 22, 재직) 과 «HT FARRAH»(id 3, 퇴사)) 여기서 잘못 고르기 쉬웠다.
           그 연결은 출근·급여가 갈리는 자리라 조용히 틀리면 되돌리기 어렵다.
           ⛔ 이미 그 강사에게 이어진 계정(mine)은 «절대» 숨기지 않는다 — 숨기면 그 줄이
              「연결 안 됨」으로 보여, 사람이 멀쩡한 연결을 다시 만들려 든다.
           ✅ 되돌릴 길은 화면에 둔다 — 「퇴사 강사도 보기」 체크박스(#tl-show-left). */
        if (left && !mine && !_tlShowLeft) return;
        var takenBy = usedBy[t.id];
        var tag = (takenBy && !mine) ? ' (' + (en ? 'used: ' : '사용 중: ') + takenBy + ')' : '';
        if (left) tag += ' (' + (en ? 'left' : '퇴사') + ')';
        opts += '<option value="' + esc(t.id) + '"' + (mine ? ' selected' : '') + '>'
             + esc(t.name) + tag + '</option>';
      });
      html += '<tr style="background:' + bg + '">'
        // 🔤 이 저장소 규칙: font-family 맨 앞은 반드시 MangoiHanSC (hanzi_font_harness 가 지킨다).
        //    안 그러면 한자가 화면마다 다른 글꼴로 보인다.
        + '<td style="padding:7px 12px;border-bottom:1px solid #f0f2f5;font-family:MangoiHanSC,ui-monospace,Consolas,monospace;color:#344054;font-weight:700">'
        + esc(a.username) + '</td>'
        + '<td style="padding:7px 12px;border-bottom:1px solid #f0f2f5;color:#667085">' + fmtDay(a.last_login_at) + '</td>'
        + '<td style="padding:7px 12px;border-bottom:1px solid #f0f2f5">'
        + '<select data-username="' + esc(a.username) + '" onchange="tlSave(this)" style="padding:5px 8px;font-size:12.5px;min-width:190px">'
        + opts + '</select></td>'
        + '<td id="tl-st-' + esc(a.username) + '" style="padding:7px 12px;border-bottom:1px solid #f0f2f5;text-align:right;font-size:11.5px;'
        + (cur ? 'color:#067647;font-weight:700">' + (en ? 'linked' : '연결됨')
               : 'color:#b45309;font-weight:700">' + (en ? 'not linked' : '연결 필요'))
        + '</td></tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  };

  window.tlSave = async function (sel) {
    var username = sel.getAttribute('data-username');
    var teacherId = sel.value;
    var st = document.getElementById('tl-st-' + username);
    var en = isEn();
    if (st) { st.style.color = '#667085'; st.textContent = en ? 'saving…' : '저장 중…'; }
    try {
      var r = await fetch('/api/admin/teachers/links', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, teacher_id: teacherId })
      });
      var j = await r.json();
      if (!j || !j.ok) throw new Error((j && j.error) || 'save_failed');
      if (teacherId) _tlLinks[username] = { teacher_id: String(j.teacher_id), teacher_name: j.teacher_name };
      else delete _tlLinks[username];
      tlRender();   // 「사용 중」 표시와 카운트를 다시 계산해야 하므로 전체 재렌더
    } catch (e) {
      if (st) { st.style.color = '#b42318'; st.textContent = (en ? 'failed: ' : '실패: ') + e.message; }
    }
  };

  // 카드를 펼칠 때 한 번만 자동 로드 — 부팅 때 미리 받지 않는다(필리핀 회선 배려)
  var card = document.getElementById('card-teacher-links');
  if (card) card.addEventListener('toggle', function () { if (this.open && !_tlLoaded) tlLoad(); });
})();
