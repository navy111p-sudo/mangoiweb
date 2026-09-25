/* ⏸ absence-hold-panel.js — 연속 결석 «보류» 학생 알림판 (2026-09-25 사장님 결정)
 *
 * 관리자(/admin.html)·매니저(/manager) 화면을 열면 **자동으로** 맨 위에 뜬다.
 *   · 보류된 학생이 없으면 아무것도 그리지 않는다(빈 상자를 남기지 않음).
 *   · 매니저가 학생·학원에 확인한 뒤 [계속 다님 · 재개] 또는 [그만둠]을 누른다.
 * 서버 정본: src/absence-hold.ts (GET/POST /api/admin/reports/absence-holds…)
 *
 * ⚠️ 한 번만 조회한다(열 때 + 5분마다 한 번). ⛔ body class MutationObserver 금지(홈 정지 전력).
 * ⚠️ 403(강사·지사)이면 조용히 아무것도 안 그린다 — 그 계정은 결정 권한이 없다.
 * ⚠️ 필리핀 매니저가 읽도록 영어·한국어를 함께 적는다(언어 설정을 따라가지 않아도 읽힌다).
 */
(function () {
  if (window.__absenceHoldPanel) return;
  window.__absenceHoldPanel = true;

  var API = '/api/admin/reports/absence-holds';
  var CSS = ''
    + '#ah-panel{margin:10px 0 14px;border:1px solid #efb8ab;background:#fdf3f0;color:#1f2933;border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5;box-sizing:border-box;max-width:100%}'
    + '#ah-panel .ah-h{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;font-weight:700;font-size:14.5px;color:#7a1f10}'
    + '#ah-panel .ah-sub{color:#475467;font-size:12.5px;margin-top:2px}'
    + '#ah-panel .ah-list{display:grid;gap:8px;margin-top:10px}'
    + '#ah-panel .ah-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;background:#ffffff;border:1px solid #f2d3cb;border-radius:10px;padding:9px 11px}'
    + '@media (max-width:620px){#ah-panel .ah-row{grid-template-columns:1fr}}'
    + '#ah-panel .ah-who{font-weight:700;color:#101828}'
    + '#ah-panel .ah-meta{color:#475467;font-size:12.5px}'
    + '#ah-panel .ah-tag{display:inline-block;font-size:11.5px;font-weight:700;border-radius:99px;padding:1px 8px;margin-left:4px}'
    + '#ah-panel .ah-ok{background:#e3f4ea;color:#155f39}'
    + '#ah-panel .ah-no{background:#fce9e5;color:#9b2a1a}'
    + '#ah-panel .ah-btns{display:flex;flex-wrap:wrap;gap:6px}'
    + '#ah-panel button.ah-b{font:inherit;font-size:12.5px;font-weight:700;border-radius:8px;padding:7px 11px;border:1px solid #cbd5e1;background:#ffffff;color:#101828;cursor:pointer;min-height:34px}'
    + '#ah-panel button.ah-b.ah-g{background:#1d7a4b;border-color:#1d7a4b;color:#ffffff}'
    + '#ah-panel button.ah-b.ah-r{background:#b8321f;border-color:#b8321f;color:#ffffff}'
    + '#ah-panel button.ah-b:focus-visible{outline:2px solid #0e6e6a;outline-offset:2px}'
    + '#ah-panel .ah-msg{font-size:12.5px;color:#475467}'
    + '#ah-panel .ah-toggle{font-size:12.5px}'
    + '#ah-badge{display:inline-flex;align-items:center;gap:4px;background:#b8321f;border-color:#b8321f;color:#ffffff;font-weight:800;text-decoration:none}'
    + '#ah-badge .ah-bn{display:inline-block;background:#ffffff;color:#b8321f;border-radius:999px;padding:0 6px;min-width:18px;text-align:center;font-size:11.5px;line-height:1.6}';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function host() {
    return document.getElementById('admin-main-scale') || document.querySelector('.wrap') || document.body;
  }
  function panel() {
    var p = document.getElementById('ah-panel');
    if (p) return p;
    if (!document.getElementById('ah-style')) {
      var st = document.createElement('style'); st.id = 'ah-style'; st.textContent = CSS;
      document.body.appendChild(st);   // body 끝 — 관리자 공용 CSS 보다 뒤라야 이긴다
    }
    p = document.createElement('section');
    p.id = 'ah-panel';
    p.setAttribute('aria-live', 'polite');
    var h = host();
    h.insertBefore(p, h.firstChild);
    return p;
  }

  /* 학생·학부모 연락 결과를 한 줄로 — 번호는 서버가 싣지 않는다(몇 명에게 갔나·왜 못 갔나만). */
  function contactLine(n) {
    var s = n && n.student;
    if (!s) return '';
    if (s.skipped === 'switch_off') return '<span class="ah-tag ah-no">SMS off · 문자 꺼짐</span>';
    if (!s.phones) return '<span class="ah-tag ah-no">No phone · 번호 없음 — 직접 연락</span>';
    var ok = (s.sent || []).filter(function (x) { return x.ok; }).length;
    return ok
      ? '<span class="ah-tag ah-ok">Sent ' + ok + ' · 문자/알림톡 보냄</span>'
      : '<span class="ah-tag ah-no">Send failed · 보내지 못함 — 직접 연락</span>';
  }

  /* ① 상단바 배지 «⏸ 보류 N» + 탭 제목 «(N)» (2026-09-25 사장님 «더 쉽게 보이게»).
     알림판은 화면 «안» 이라 스크롤하면 안 보인다 → 늘 보이는 상단바·탭 제목에 숫자를 둔다.
     상단바(#toWork 결재함)가 있는 화면(/manager)에만 배지를 붙이고, 없으면 탭 제목만 바꾼다.
     ⚠️ 0명이면 배지를 지우고 제목을 원래대로 되돌린다(«(0)» 을 남기지 않음). */
  var baseTitle = null;
  function syncBadge(n) {
    if (baseTitle === null) baseTitle = String(document.title || '').replace(/^\(\d+\)\s*/, '');
    document.title = n > 0 ? '(' + n + ') ' + baseTitle : baseTitle;
    var b = document.getElementById('ah-badge');
    if (!(n > 0)) { if (b) b.remove(); return; }
    var anchor = document.getElementById('toWork');
    if (!anchor || !anchor.parentNode) return;
    if (!b) {
      b = document.createElement('a');
      b.id = 'ah-badge';
      b.className = 'tbtn';
      b.href = '#ah-panel';
      anchor.parentNode.insertBefore(b, anchor);
    }
    b.title = n + ' student(s) on hold — tap to see · 연속 결석 보류 학생 ' + n + '명 — 눌러서 보기';
    b.setAttribute('aria-label', b.title);
    b.innerHTML = '⏸ Hold · 보류 <span class="ah-bn">' + n + '</span>';
  }

  var items = [];
  var armed = {};   // id → 'resume' | 'end' (한 번 더 눌러야 확정 — confirm() 대신)

  function render() {
    syncBadge(items.length);
    if (!items.length) { var old = document.getElementById('ah-panel'); if (old) old.remove(); return; }
    var p = panel();
    var h = '<div class="ah-h"><span>⏸ ' + items.length + ' student(s) on hold · 연속 결석으로 보류된 학생 ' + items.length + '명</span></div>'
      + '<div class="ah-sub">Absent 2 times in a row. No teacher pay while on hold. Ask the student/academy, then choose. '
      + '· 2회 연속 결석 → 다음 수업부터 보류(강사비 0%). 학생·학원에 확인한 뒤 골라 주세요. 학생이 스스로 다시 들어오면 자동으로 풀립니다.</div>'
      + '<div class="ah-list">';
    items.forEach(function (it) {
      var a = armed[it.id];
      h += '<div class="ah-row"><div>'
        + '<div class="ah-who">' + esc(it.student_name || it.student_uid) + ' <span class="ah-meta">(' + esc(it.student_uid) + ')</span></div>'
        + '<div class="ah-meta">Teacher ' + esc(it.teacher_name || '—') + ' · since ' + esc(it.held_after) + ' · absent ' + esc(it.streak || 2) + 'x '
        + contactLine(it.notify) + '</div></div><div class="ah-btns">';
      if (a) {
        h += '<button type="button" class="ah-b ' + (a === 'resume' ? 'ah-g' : 'ah-r') + '" data-ah-go="' + it.id + '">'
          + (a === 'resume' ? 'Confirm resume · 재개 확정' : 'Confirm quit · 그만둠 확정') + '</button>'
          + '<button type="button" class="ah-b" data-ah-cancel="' + it.id + '">Cancel · 취소</button>';
      } else {
        h += '<button type="button" class="ah-b ah-g" data-ah-arm="resume" data-ah-id="' + it.id + '">Continues · 계속 다님(재개)</button>'
          + '<button type="button" class="ah-b ah-r" data-ah-arm="end" data-ah-id="' + it.id + '">Quit · 그만둠</button>';
      }
      h += '</div></div>';
    });
    h += '</div><div class="ah-msg" id="ah-msg"></div>';
    p.innerHTML = h;
  }

  function say(t) { var m = document.getElementById('ah-msg'); if (m) m.textContent = t; }

  function load() {
    fetch(API + '?state=open', { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || d.ok !== true || !Array.isArray(d.items)) return;   // 권한 없음·실패 → 그리지 않는다
        items = d.items; render();
      })
      .catch(function () { /* 조용히 — 다음 주기에 다시 */ });
  }

  document.addEventListener('click', function (e) {
    var bdg = e.target && e.target.closest ? e.target.closest('#ah-badge') : null;
    if (bdg) {
      var pn = document.getElementById('ah-panel');
      if (pn) { e.preventDefault(); pn.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      return;
    }
    var t = e.target && e.target.closest ? e.target.closest('#ah-panel button') : null;
    if (!t) return;
    if (t.hasAttribute('data-ah-arm')) { armed[t.getAttribute('data-ah-id')] = t.getAttribute('data-ah-arm'); render(); return; }
    if (t.hasAttribute('data-ah-cancel')) { delete armed[t.getAttribute('data-ah-cancel')]; render(); return; }
    if (t.hasAttribute('data-ah-go')) {
      var id = t.getAttribute('data-ah-go'), act = armed[id];
      t.disabled = true;
      fetch(API + '/decide', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(id), action: act }),
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { st: r.status, d: d }; }); })
        .then(function (x) {
          delete armed[id];
          if (x.d && x.d.ok === true) {
            items = items.filter(function (it) { return String(it.id) !== String(id); });
            render();
            say(act === 'resume' ? 'Resumed · 재개했습니다' : 'Marked as quit · 그만둠으로 정리했습니다');
          } else {
            render();
            say('Could not save (' + ((x.d && x.d.error) || x.st) + ') · 저장하지 못했습니다');
          }
        })
        .catch(function () { delete armed[id]; render(); say('Network error · 연결 오류 — 다시 눌러 주세요'); });
    }
  });

  load();
  setInterval(load, 5 * 60 * 1000);   // 화면이 열려 있는 동안만 5분에 한 번(요청 1건)
})();
