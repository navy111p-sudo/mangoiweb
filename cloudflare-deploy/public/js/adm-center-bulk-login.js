/* 📥 대리점 로그인 아이디 일괄 입력 (2026-11-02 사장님 「엑셀로 아이디 일괄 입력 기능 만들어줘」)

   대리점(centers) 921곳 대부분이 «로그인 아이디» 칸에 「계정 없음」이다 — 카페24가 옛 LMS 대리점
   아이디를 넘겨 주지 않아(docs/카페24_지사아이디_적재요청_2026-10-29.md) 하나씩 ✏️ 수정으로 넣어야
   했다. 이 화면은 엑셀(붙여넣기·.xlsx·.csv)을 받아 «미리보기 → 만들기» 두 단계로 한꺼번에 넣는다.

   ✅ 새 서버 경로가 없다 — 대리점 ✏️ 수정 저장과 «같은» PATCH /api/admin/centers {id, login_username,
      login_password} 를 줄마다 부른다. 그래서 검사(아이디 형식·중복·같은 이름 대리점·본사만)는 전부
      서버 정본 checkAgencyLogin / agency-login-gate.ts 가 그대로 한다(여기서 복제하지 않는다).
   ⛔ 이미 로그인 계정이 있는 대리점은 «건너뛴다» — 같은 PATCH 가 그 계정의 비밀번호를 «바꾸기» 때문에
      (그 대리점이 지금 쓰는 비밀번호가 말없이 바뀐다). 바꾸려면 ✏️ 수정에서 하나씩.
   ⛔ 이름 부분일치·추정 매칭 금지 — centers.name 은 유일하지 않다. ID 가 있으면 ID 로, 없으면
      «이름이 정확히 같은 대리점이 하나뿐» 일 때만 잇는다. ID 와 이름을 둘 다 주면 둘이 맞아야 한다.
   ⛔ 비밀번호는 화면에 그리지 않고, 끝나면 입력칸을 비운다(옛 LMS 원문 비밀번호는 우리가 모른다 —
      엑셀에 칸이 없으면 «공통 초기 비밀번호» 칸으로 넣는다). */
(function () {
  'use strict';

  function en() { return (typeof adminLang !== 'undefined' && adminLang === 'en') || window.adminLang === 'en'; }
  function t(ko, e) { return en() ? e : ko; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' '); }
  function hkey(s) { return String(s == null ? '' : s).replace(/[\s_·.\-()]/g, '').toLowerCase(); }

  var USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
  var MAX_ROWS = 1000;

  /* 머리글 이름 → 칸 뜻. 위치가 아니라 «이름» 으로 찾는다(열 순서를 못 박지 않는다).
     ⚠️ 「ID」 는 대리점 목록 표의 첫 칸(대리점 번호)과 같은 글자라 «대리점 번호» 로 본다.
        로그인 아이디는 「아이디」·「로그인 아이디」 로 적는다. */
  var HEAD = {
    id: ['id', '대리점id', '센터id', '번호', 'no', 'centerid'],
    name: ['대리점', '대리점명', '대리점학원명', '학원명', '학원', '센터명', '센터', '대리점이름', 'agency', 'name'],
    login: ['아이디', '로그인아이디', '로그인', 'loginid', 'login', 'username', 'userid', '계정'],
    pw: ['비밀번호', '비번', '패스워드', 'password', 'pw', 'pass']
  };
  function colOf(h) {
    var k = hkey(h);
    for (var f in HEAD) if (HEAD[f].indexOf(k) >= 0) return f;
    return '';
  }

  /* 2차원 표(줄 × 칸) → [{line, id, name, login, pw}] — 머리글 줄은 앞 3줄 안에서 찾는다. */
  function tableToRows(table) {
    var lines = (table || []).filter(function (cells) {
      return cells && cells.some(function (c) { return String(c == null ? '' : c).trim() !== ''; });
    });
    if (!lines.length) return { error: t('붙여넣은 데이터가 없습니다.', 'No data.') };
    var hIdx = -1, map = null;
    for (var i = 0; i < Math.min(3, lines.length); i++) {
      var m = lines[i].map(colOf);
      if (m.indexOf('login') >= 0 && (m.indexOf('id') >= 0 || m.indexOf('name') >= 0)) { hIdx = i; map = m; break; }
    }
    if (hIdx < 0) {
      return { error: t('머리글 줄을 못 찾았습니다 — 「아이디」 칸과 「ID」(대리점 번호) 또는 「대리점명」 칸이 있는 머리글 줄도 함께 넣으세요.',
                        'Header row not found — include a header with "아이디" (login) and "ID" or "대리점명".') };
    }
    var rows = [];
    for (var j = hIdx + 1; j < lines.length; j++) {
      var r = { line: j + 1, id: '', name: '', login: '', pw: '' };
      lines[j].forEach(function (c, ci) { var f = map[ci]; if (f && !r[f]) r[f] = String(c == null ? '' : c).trim(); });
      if (!r.id && !r.name && !r.login) continue;
      rows.push(r);
    }
    if (!rows.length) return { error: t('머리글 아래에 데이터 줄이 없습니다.', 'No data rows under the header.') };
    if (rows.length > MAX_ROWS) return { error: t('한 번에 ' + MAX_ROWS + '줄까지만 넣을 수 있습니다.', 'Up to ' + MAX_ROWS + ' rows at a time.') };
    return { rows: rows };
  }

  /* 붙여넣은 글자 → 2차원 표. 엑셀 복사는 탭, CSV 파일은 쉼표(따옴표 처리). */
  function textToTable(raw) {
    var s = String(raw || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (s.indexOf('\t') >= 0) return s.split('\n').map(function (l) { return l.split('\t'); });
    var out = [], row = [], cell = '', q = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell); out.push(row);
    return out;
  }

  /* 줄 ↔ 대리점 잇기 + 줄마다 «할 일» 판정(순수 함수 — 하니스가 그대로 돌린다).
     centers: GET /api/admin/centers?limit=0 의 items(id·name·login_ids).
     반환: [{row, center, status:'ready'|'skip', reason, pw}] */
  function plan(rows, centers, defaultPw) {
    var byId = {}, byName = {};
    (centers || []).forEach(function (c) {
      byId[String(c.id)] = c;
      var k = norm(c.name); (byName[k] = byName[k] || []).push(c);
    });
    var loginCount = {}, centerCount = {};
    rows.forEach(function (r) { if (r.login) { var k = r.login.toLowerCase(); loginCount[k] = (loginCount[k] || 0) + 1; } });
    var out = rows.map(function (r) {
      var c = null, why = '';
      var idTxt = String(r.id || '').replace(/[,\s]/g, '');
      if (idTxt) {
        if (!/^\d+$/.test(idTxt)) why = 'bad_id';
        else if (!byId[idTxt]) why = 'id_not_found';
        else {
          c = byId[idTxt];
          if (r.name && norm(r.name) !== norm(c.name)) { why = 'id_name_mismatch'; c = null; }
        }
      } else if (r.name) {
        var cand = byName[norm(r.name)] || [];
        if (!cand.length) why = 'name_not_found';
        else if (cand.length > 1) why = 'name_ambiguous';
        else c = cand[0];
      } else why = 'no_center';
      var pw = r.pw || defaultPw || '';
      if (!why) {
        if (!r.login) why = 'no_login';
        else if (!USERNAME_RE.test(r.login)) why = 'bad_login';
        else if (loginCount[r.login.toLowerCase()] > 1) why = 'login_dup_in_file';
        else if (!Array.isArray(c.login_ids)) why = 'login_unknown';
        else if (c.login_ids.length) {
          why = c.login_ids.some(function (u) { return String(u).toLowerCase() === r.login.toLowerCase(); }) ? 'already_linked' : 'has_account';
        }
        else if (!pw) why = 'no_password';
        else if (pw.length < 6) why = 'short_password';
      }
      if (!why) centerCount[c.id] = (centerCount[c.id] || 0) + 1;
      return { row: r, center: c, status: why ? 'skip' : 'ready', reason: why, pw: why ? '' : pw };
    });
    // 같은 대리점에 줄이 둘 이상이면 어느 아이디인지 모른다 — 둘 다 건너뛴다.
    out.forEach(function (p) {
      if (p.status === 'ready' && centerCount[p.center.id] > 1) { p.status = 'skip'; p.reason = 'center_dup_in_file'; p.pw = ''; }
    });
    return out;
  }

  var REASON = {
    bad_id: ['대리점 ID 가 숫자가 아님', 'Agency ID is not a number'],
    id_not_found: ['그 ID 의 대리점이 없음', 'No agency with that ID'],
    id_name_mismatch: ['ID 와 대리점명이 서로 다른 대리점', 'ID and name point to different agencies'],
    name_not_found: ['그 이름의 대리점이 없음', 'No agency with that name'],
    name_ambiguous: ['같은 이름 대리점이 여럿 — ID 칸을 넣어 주세요', 'Several agencies share this name — add the ID column'],
    no_center: ['대리점 ID·이름이 비어 있음', 'Agency ID/name empty'],
    no_login: ['아이디가 비어 있음', 'Login ID empty'],
    bad_login: ['아이디는 영문·숫자·밑줄(_) 3~32자', 'Login ID must be 3–32 letters/digits/_'],
    login_dup_in_file: ['같은 아이디가 엑셀에 두 번 이상', 'Same login ID appears twice in the sheet'],
    login_unknown: ['계정 여부를 확인하지 못함', 'Could not check existing account'],
    already_linked: ['이미 이 아이디로 연결됨', 'Already linked with this ID'],
    has_account: ['이미 다른 계정이 있음 — 바꾸려면 ✏️ 수정에서', 'Already has an account — change it via ✏️ Edit'],
    no_password: ['비밀번호 없음 — 엑셀 칸이나 «공통 초기 비밀번호» 를 넣으세요', 'No password — add a column or the common initial password'],
    short_password: ['비밀번호는 6자 이상', 'Password must be 6+ chars'],
    center_dup_in_file: ['같은 대리점이 엑셀에 두 번 이상', 'Same agency appears twice in the sheet']
  };
  function reasonText(code) { var r = REASON[code]; return r ? (en() ? r[1] : r[0]) : code; }

  var _plan = null, _running = false;
  function $(id) { return document.getElementById(id); }

  function setRun(on) {
    var b = $('ct-bulk-run');
    if (!b) return;
    b.disabled = !on;
    b.style.background = on ? '#16a34a' : '#9ca3af';
    b.style.cursor = on ? 'pointer' : 'not-allowed';
  }

  async function readFile(f) {
    var buf = await f.arrayBuffer();
    var head = new Uint8Array(buf.slice(0, 2));
    var lib = window.__smBulk || {};
    if (head[0] === 0x50 && head[1] === 0x4B) {          // PK = zip = .xlsx
      if (!lib.parseXlsx) throw new Error(t('엑셀 읽기 도구가 아직 안 올라왔습니다 — 잠시 뒤 다시', 'Excel reader not loaded yet — retry shortly'));
      return lib.parseXlsx(buf);
    }
    var txt = lib.decodeText ? lib.decodeText(buf) : new TextDecoder('utf-8').decode(buf);
    return textToTable(txt);
  }

  async function preview() {
    var res = $('ct-bulk-result');
    if (!res || _running) return;
    _plan = null; setRun(false);
    var table;
    try {
      var f = ($('ct-bulk-file') || {}).files;
      if (f && f[0]) table = await readFile(f[0]);
      else table = textToTable(($('ct-bulk-paste') || {}).value || '');
    } catch (e) {
      res.innerHTML = '<span style="color:#b91c1c">' + esc(t('파일을 읽지 못했습니다: ', 'Could not read the file: ') + (e && e.message || e)) + '</span>';
      return;
    }
    var parsed = tableToRows(table);
    if (parsed.error) { res.innerHTML = '<span style="color:#b91c1c">' + esc(parsed.error) + '</span>'; return; }
    res.innerHTML = '<span style="color:#475467">' + esc(t('대리점 목록 전체를 불러오는 중…', 'Loading all agencies…')) + '</span>';
    var d;
    try {
      var r = await fetch('/api/admin/centers?limit=0', { cache: 'no-store', credentials: 'include' });
      d = await r.json().catch(function () { return {}; });
      if (!r.ok || d.ok !== true || !Array.isArray(d.items)) throw new Error(d.message || d.error || ('HTTP ' + r.status));
    } catch (e) {
      res.innerHTML = '<span style="color:#b91c1c">' + esc(t('대리점 목록을 못 불러왔습니다: ', 'Could not load agencies: ') + (e && e.message || e)) + '</span>';
      return;
    }
    if (d.can_login === false) {
      res.innerHTML = '<span style="color:#b91c1c">' + esc(t('대리점 로그인 계정은 본사 계정만 만들 수 있습니다.', 'Only HQ accounts can create agency logins.')) + '</span>';
      return;
    }
    var defPw = ($('ct-bulk-defpw') || {}).value || '';
    _plan = plan(parsed.rows, d.items, defPw);
    render();
  }

  function render(results) {
    var res = $('ct-bulk-result');
    if (!res || !_plan) return;
    var ready = _plan.filter(function (p) { return p.status === 'ready'; }).length;
    var skip = _plan.length - ready;
    var head = results
      ? t('결과', 'Result')
      : t('미리보기 — 만들 수 있는 곳 ' + ready + ' · 건너뛰는 줄 ' + skip, 'Preview — ready ' + ready + ' · skipped ' + skip);
    var rows = _plan.map(function (p, i) {
      var r = results && results[i];
      var st, color;
      if (r) { st = r.ok ? t('✅ 만들었음', '✅ Created') : '❌ ' + r.msg; color = r.ok ? '#15803d' : '#b91c1c'; }
      else if (p.status === 'ready') { st = t('만들 예정', 'Will create'); color = '#1d4ed8'; }
      else { st = '— ' + reasonText(p.reason); color = p.reason === 'already_linked' ? '#475467' : '#b45309'; }
      return '<tr><td>' + p.row.line + '</td><td>' + esc(p.center ? p.center.id : (p.row.id || '')) + '</td><td>'
        + esc(p.center ? p.center.name : (p.row.name || '')) + '</td><td style="font-family:MangoiHanSC,ui-monospace,monospace">'
        + esc(p.row.login) + '</td><td style="color:' + color + '">' + esc(st) + '</td></tr>';
    }).join('');
    res.innerHTML = '<div style="font-weight:700;margin:4px 0 6px;color:#101828">' + esc(head) + '</div>'
      + '<div style="max-height:360px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px">'
      + '<table style="width:100%;font-size:12px;border-collapse:collapse"><thead><tr>'
      + '<th>' + esc(t('엑셀 줄', 'Row')) + '</th><th>ID</th><th>' + esc(t('대리점', 'Agency')) + '</th><th>'
      + esc(t('아이디', 'Login ID')) + '</th><th>' + esc(t('결과', 'Status')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    setRun(!results && ready > 0);
    var b = $('ct-bulk-run');
    if (b && !results) b.textContent = ready ? t(ready + '곳 로그인 계정 만들기', 'Create ' + ready + ' logins') : t('만들 곳 없음', 'Nothing to create');
  }

  async function run() {
    if (!_plan || _running) return;
    var todo = _plan.filter(function (p) { return p.status === 'ready'; });
    if (!todo.length) return;
    if (!window.confirm(t(todo.length + '곳에 로그인 계정을 만듭니다. 만든 뒤에는 그 아이디·비밀번호로 바로 로그인됩니다. 계속할까요?',
                          'Create login accounts for ' + todo.length + ' agencies? They can sign in right away.'))) return;
    _running = true; setRun(false);
    var b = $('ct-bulk-run');
    var results = new Array(_plan.length);
    var done = 0, okN = 0;
    for (var i = 0; i < _plan.length; i++) {
      var p = _plan[i];
      if (p.status !== 'ready') continue;
      if (b) b.textContent = t('만드는 중… ' + done + '/' + todo.length, 'Creating… ' + done + '/' + todo.length);
      try {
        var r = await fetch('/api/admin/centers', {
          method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.center.id, login_username: p.row.login, login_password: p.pw })
        });
        var d = await r.json().catch(function () { return {}; });
        // «성공이라고 말했는가» 로 판정 — 계정까지 실제로 만들어졌을 때만(login_result === 'created').
        if (r.ok && d.ok === true && d.login_result === 'created') { results[i] = { ok: true }; okN++; }
        else results[i] = { ok: false, msg: d.message || d.error || ('HTTP ' + r.status) };
      } catch (e) {
        results[i] = { ok: false, msg: t('연결 실패', 'Network error') };
      }
      done++;
    }
    _running = false;
    _plan.forEach(function (p) { p.pw = ''; });
    var dp = $('ct-bulk-defpw'); if (dp) dp.value = '';
    render(results);
    if (b) b.textContent = t('완료 — ' + okN + '/' + todo.length + '곳 만들었음', 'Done — ' + okN + '/' + todo.length + ' created');
    if (typeof window.loadCenters === 'function') { try { window.loadCenters(); } catch (e) {} }
  }

  function reset() { _plan = null; setRun(false); var r = $('ct-bulk-result'); if (r) r.innerHTML = ''; }

  function bind() {
    var w = $('ct-bulk-wrap');
    if (!w || w.__bound) return;
    w.__bound = true;
    w.addEventListener('toggle', function () {
      // 본사가 아니면(서버가 can_login=false 로 알려 줌) 이 칸 자체를 감춘다 — 눌러도 403 나는 버튼을 안 보이게.
      if (window._ctCanLogin === false) w.style.display = 'none';
    });
    var pv = $('ct-bulk-preview'); if (pv) pv.addEventListener('click', preview);
    var rn = $('ct-bulk-run'); if (rn) rn.addEventListener('click', run);
    ['ct-bulk-paste', 'ct-bulk-file', 'ct-bulk-defpw'].forEach(function (id) {
      var el = $(id); if (el) { el.addEventListener('input', reset); el.addEventListener('change', reset); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();

  window.__ctBulkLogin = { textToTable: textToTable, tableToRows: tableToRows, plan: plan, reasonText: reasonText };
})();
