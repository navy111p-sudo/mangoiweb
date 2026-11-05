/* 👀 매일보고 «팀 보고판» / Daily handover team board — 2026-11-04
 * 사장님: 「일일보고에서 모든 매니저들과 본사 임직원들의 일일보고를 한 번에 확인하고 싶어」.
 *
 * 서버 GET /api/approval/handover/board(정본 src/handover-board.ts)가 사람별 한 줄을 «먼저 볼 것» 순서로 내려준다.
 * 이 파일은 «그리기» 만 한다:
 *   · 확인·보완 요청은 기존 POST /opened · /ack · /return 을 그대로 부른다.
 *     허락(받는 사람·경영진·장지웅 부장 10초 읽기)은 서버가 매번 다시 본다 — 여기 버튼은 힌트일 뿐.
 *   · ⛔ 403(경영진이 아님)이면 칸을 숨긴 채 조용히 끝낸다 — 다른 직원 화면은 예전 그대로다.
 *   · 글자는 전부 textContent 로만 넣는다(보고 본문은 사람이 쓴 글이다).
 * 이웃과의 약속: 보고 상태를 바꾸면 document 에 'mh:handover-changed' 를 쏜다(받은 보고 목록이 따라온다).
 */
(function () {
  'use strict';
  var box = document.getElementById('mh-board');
  if (!box) return;
  var API = '/api/approval/handover';
  var params = new URLSearchParams(location.search);
  var S = { today: '', day: '', data: null, filter: 'all', open: null, focus: null, loading: false, seq: 0 };
  var openedAt = {};
  // 🌐 한국어 번역 상태 — 보고 판(id:version)별. S 밖에 두는 이유: 60초마다 다시 읽어 그려도 번역이 풀리지 않게.
  var KO = window.MangoiHandoverKo || null, ko = { on: {}, done: {}, busy: {}, err: {} };

  function $(id) { return box.querySelector('#mhb-' + id); }
  function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
  function kst(ms) { return ms ? new Date(Number(ms) + 9 * 3600000).toISOString().slice(5, 16).replace('T', ' ') : '—'; }
  function shiftDay(day, n) { return new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
  var WEEK = ['일/Sun', '월/Mon', '화/Tue', '수/Wed', '목/Thu', '금/Fri', '토/Sat'];

  var KIND = { visit: '방문상담 / Visit', call: '전화 / Call', meeting: '미팅 / Meeting', demo: '시연 / Demo', manage: '관리방문 / Account care', other: '기타 / Other' };
  var KIND_SHORT = { visit: '방문', call: '전화', meeting: '미팅', demo: '시연', manage: '관리', other: '기타' };

  /* 요약 칸 = 보기 거르개. 칸의 숫자와 눌렀을 때 보이는 줄 수가 «같은 판정» 에서 나오게 둔다. */
  var FILTERS = [
    { key: 'required', label: '작성 대상 / Required', count: 'required', test: function (r) { return r.required; } },
    { key: 'submitted', label: '제출 / Submitted', count: 'submitted', test: function (r) { return r.required && !!r.report; } },
    { key: 'missing', label: '미제출 / Not submitted', count: 'missing', tone: 'bad', test: function (r) { return r.state === 'missing'; } },
    { key: 'issue', label: '문제 있음 / Issues', count: 'issue', tone: 'bad', test: function (r) { return r.issue; } },
    { key: 'awaiting', label: '미확인 / Unread', count: 'awaiting', test: function (r) { return !!r.report && r.report.status === 'submitted'; } }
  ];
  function filterOf(key) { return FILTERS.filter(function (f) { return f.key === key; })[0] || null; }

  async function call(path, body) {
    var r = await fetch(API + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) { location.href = '/admin/login?next=%2Fdaily-handover.html'; throw new Error('로그인이 필요합니다 / Sign in required'); }
    var j = await r.json().catch(function () { return null; });
    if (r.ok && j && j.ok === true) return j; // «성공이라고 말했는가» 로 판정(404 본문엔 ok 칸이 없다)
    var e = new Error(errorText(j, r.status)); e.status = r.status; throw e;
  }
  function errorText(j, status) {
    var code = j && j.error;
    if (code === 'read_first') return j.message || '보고를 읽은 뒤 확인할 수 있습니다. / Read the report first.';
    if (code === 'conflict') return '그사이 보고가 바뀌었습니다. 새로고침 후 다시 해 주세요. / The report changed — refresh and try again.';
    if (status === 403) return '권한이 없습니다. / Not allowed.';
    return '처리하지 못했습니다 / Could not complete: ' + (code || status);
  }
  function say(text, bad) { var m = $('msg'); m.textContent = text || ''; m.className = bad ? 'notice' : 'small'; m.hidden = !text; }

  function nameOf(username) {
    if (!username) return '—';
    var d = S.data, hit = d.rows.filter(function (r) { return r.username === username; })[0] || d.not_on_roster.filter(function (r) { return r.username === username; })[0];
    if (hit) return hit.name;
    return d.me && d.me.username === username ? (d.me.name || username) : username;
  }
  function tagOf(row) {
    if (row.state === 'issue') return [row.issue ? '문제 · 미확인 / Issue · unread' : '긴급 · 미확인 / Urgent · unread', 'bad'];
    if (row.state === 'awaiting') return ['미확인 / Unread', 'warn'];
    if (row.state === 'returned') return ['보완 요청함 / Changes requested', 'warn'];
    if (row.state === 'acknowledged') return ['확인됨 / Acknowledged', 'good'];
    if (row.state === 'missing') return ['미제출 / Not submitted', 'bad'];
    return [row.holiday ? '공휴일 / Holiday' : '오늘 안 씀 / Not due today', 'quiet'];
  }
  function salesLine(s) {
    if (!s.total) return '영업일지 0건 / No sales log';
    var parts = Object.keys(KIND_SHORT).filter(function (k) { return s.counts[k]; }).map(function (k) { return KIND_SHORT[k] + ' ' + s.counts[k]; });
    return '영업 / Sales · ' + parts.join(' · ');
  }
  function whoNote(row) {
    var bits = [];
    if (row.sales) bits.push(salesLine(row.sales));
    if (!row.on_roster) bits.push('명단 밖 / Not on roster');
    if (row.prev_missed && row.prev_day) bits.push('⚠ ' + row.prev_day.slice(5) + ' 미제출 / missed');
    return bits.join(' · ');
  }
  function whatText(row) {
    if (row.report) return headlineOf(row) || '—';
    if (row.state === 'missing') return '아직 제출하지 않음' + (row.due_time ? ' · 마감 ' + row.due_time : '') + ' / Not submitted yet';
    return '오늘은 보고 대상이 아닙니다 / No report due today';
  }
  function whatMeta(row) {
    var meta = el('small', null, 'mhb-meta');
    if (!row.report) return meta;
    var bits = [row.issue ? '문제 있음 / Issue' : '문제 없음 / No issue'];
    if (row.urgent) bits.push('긴급 / Urgent');
    if (row.open) bits.push('남은 일 / Open' + (row.open.deadline ? ' · ' + row.open.deadline.slice(5).replace('T', ' ') : ''));
    var files = (row.report.payload.attachments || []).length;
    if (files) bits.push('첨부 / Files ' + files);
    meta.append(document.createTextNode(bits.join(' · ')));
    if (row.open && row.open.overdue) meta.append(el('span', ' · 기한 지남 / Overdue', 'mhb-late'));
    return meta;
  }

  function field(label, value, extra) {
    var f = el('div', null, 'mhb-field'), v = el('div', value);
    f.append(el('b', label));
    if (extra) v.append(extra);
    f.append(v);
    return f;
  }
  function fileLinks(ids) {
    var wrap = el('div', null, 'mhb-files'), names = {};
    (S.data.files || []).forEach(function (f) { names[f.id] = f.name; });
    ids.forEach(function (id) {
      var a = el('a', names[id] || '첨부파일 / Attachment');
      a.href = API + '/attachment?id=' + encodeURIComponent(id); a.target = '_blank'; a.rel = 'noopener';
      wrap.append(a);
    });
    return wrap;
  }
  /* 🌐 한국어로 번역 (2026-11-05 사장님 「한글번역 버튼을 적당한 곳에 설치해서 작동하게 해줘」 — 이 보고판 스크린샷)
     자리: 펼친 보고의 맨 위 — 본문을 읽기 «전» 에 누르는 버튼이라서. 펼친 줄의 한 줄 요약(headline)도 함께 한국어가 된다.
     번역 자체는 공용 js/handover-ko.js(읽기 화면과 같은 번역)가 한다 — ⛔ 여기에 번역 로직을 다시 만들지 말 것.
     화면에만 보이고 저장된 보고는 안 바뀐다. 보고가 고쳐지면(version 이 바뀌면) 새 글이라 다시 번역한다. */
  function koKey(r) { return r.id + ':' + r.version; }
  function shown(r) { var k = koKey(r); return ko.on[k] && ko.done[k] ? ko.done[k] : (r.payload || {}); }
  function headlineOf(row) {
    var k = koKey(row.report);
    if (!(ko.on[k] && ko.done[k])) return row.headline;
    return (String(ko.done[k].work || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean)[0] || '').slice(0, 120) || row.headline; // 서버 firstLine 과 같은 규칙
  }
  function koBar(row) {
    var k = koKey(row.report), bar = el('div', null, 'mhb-ko'), done = ko.done[k];
    var b = el('button', ko.busy[k] ? '번역 중… / Translating…' : ko.on[k] ? '🔤 원문 보기 / Original'
      : ko.err[k] ? '⚠️ 번역 실패 · 다시 누르기 / Retry' : '🌐 한국어로 번역 / Translate to Korean');
    b.type = 'button'; b.disabled = !!ko.busy[k]; b.setAttribute('aria-pressed', String(!!ko.on[k]));
    b.onclick = function () { toggleKo(row); };
    bar.append(b);
    if (ko.on[k]) bar.append(el('small', 'AI 번역 · 이름·숫자는 원문으로 확인 / AI translation — check names & numbers in the original'
      + (done.__failed ? ' · ' + done.__failed + '줄은 원문 그대로 / ' + done.__failed + ' line(s) left as written' : '')));
    return bar;
  }
  async function toggleKo(row) {
    var r = row.report, k = koKey(r);
    if (ko.busy[k]) return;
    if (ko.on[k]) { ko.on[k] = false; paint(); focusKo(row); return; }
    if (!ko.done[k]) {
      ko.busy[k] = true; ko.err[k] = false; say(''); paint();
      try { ko.done[k] = await KO.translate(r.payload || {}); }
      catch (e) { ko.err[k] = true; say('번역하지 못했습니다. 잠시 후 다시 눌러 주세요. / Could not translate — please try again.', true); }
      ko.busy[k] = false;
    }
    ko.on[k] = !!ko.done[k];
    paint(); focusKo(row);
  }
  // 다시 그리면 버튼이 새로 만들어져 키보드 포커스가 사라진다 — 같은 보고가 아직 펼쳐져 있으면 버튼으로 돌려놓는다.
  function focusKo(row) { var b = S.open === row.username && box.querySelector('.mhb-ko button'); if (b) b.focus(); }

  function body(row) {
    var b = el('div', null, 'mhb-body'), r = row.report;
    if (!r) {
      b.append(el('p', row.state === 'missing'
        ? '아직 보내지 않았습니다' + (row.due_time ? ' (마감 ' + row.due_time + ')' : '') + '. 지난 근무일에 안 냈다면 다음 날 오전 대표님께 알림이 갑니다. / Not sent yet; a missed day is reported to the CEO next morning.'
        : '오늘은 보고 대상이 아닙니다(휴무·근무일 아님). / Not due today (day off).', 'small'));
      return b;
    }
    if (KO && KO.needs(r.payload || {})) b.append(koBar(row));
    var d = shown(r);
    b.append(field('오늘 한 일 / Work', d.work || '—'));
    b.append(field('문제와 조치 / Issue & action', d.no_issue ? '문제 없음 / No issues' : (d.issue || '—')));
    if (d.no_open) b.append(field('남은 일 / Open items', '없음 / None'));
    else {
      var late = row.open && row.open.overdue ? el('span', '\n기한 지남 / Overdue', 'mhb-late') : null;
      b.append(field('남은 일 / Open items', (d.open || '—') + '\n담당 / Owner: ' + nameOf(d.owner) + ' · 기한 / Due: ' + String(d.deadline || '—').replace('T', ' ') + ' KST', late));
    }
    if (d.student || d.class_info) b.append(field('학생·수업 / Student & class', [d.student, d.class_info].filter(Boolean).join(' / ')));
    if (row.sales && row.sales.items.length) {
      b.append(field('영업 활동 / Sales log', row.sales.items.map(function (i) {
        return '• ' + (KIND[i.kind] || i.kind) + (i.lead ? ' · ' + i.lead : '') + (i.outcome ? ' — ' + i.outcome : '');
      }).join('\n')));
    }
    if ((d.attachments || []).length) b.append(field('첨부 / Files', null, fileLinks(d.attachments)));
    var who = '전달 / To: ' + nameOf(r.recipient) + ' · 제출 / Sent: ' + kst(r.submitted_at) + ' KST';
    if (r.acknowledged_by) who += ' · 응답 / By: ' + nameOf(r.acknowledged_by) + ' ' + kst(r.acknowledged_at) + ' KST';
    b.append(el('p', who, 'small mhb-by'));
    if (r.feedback) b.append(el('p', '보완 요청 / Feedback: ' + r.feedback, 'notice'));
    b.append(actions(row));
    return b;
  }
  function actions(row) {
    var bar = el('div', null, 'mhb-actions');
    if (row.can_respond) {
      var ack = el('button', '내용 확인 완료 / Acknowledge', 'primary'), ret = el('button', '보완 요청 / Request changes');
      ack.type = ret.type = 'button';
      ack.onclick = function () { respond(row, 'ack', ack); };
      ret.onclick = function () { respond(row, 'return', ret); };
      bar.append(ack, ret);
      armReadGate(row, ack);
    }
    var link = el('a', '읽기 화면에서 열기 · 이력·보류 / Open in reader');
    link.href = '/daily-handover.html?date=' + encodeURIComponent(S.day) + '&report=' + encodeURIComponent(row.report.id);
    bar.append(link);
    bar.append(el('p', '확인은 «읽었다» 는 표시이고 남은 일을 끝내지 않습니다. / Acknowledging does not close open tasks.', 'small'));
    return bar;
  }
  // 장지웅 부장(확인 의무자)은 연 뒤 N초가 지나야 확인 — 서버가 같은 판정을 한다(409 read_first). 연 순간을 한 번 남긴다.
  function armReadGate(row, ack) {
    var sec = Number(S.data.read_min_sec) || 0;
    if (!sec) return;
    var key = row.report.id + ':' + row.report.version;
    if (!openedAt[key]) {
      openedAt[key] = Date.now();
      if (row.can_mark_opened) call('/opened', { id: row.report.id, version: row.report.version }).catch(function () { delete openedAt[key]; });
    }
    // ⚠️ 이 버튼은 아직 화면에 붙기 «전» 에 불린다 — «안 붙었으면 멈춤» 으로 쓰면 첫 틱에서 멈춰 버튼이 켜진 채 남는다
    //    (브라우저 검사가 실제로 잡음: 바로 눌러 409 read_first). «붙었다가 떨어진» 버튼만 멈춘다(다시 그려진 경우).
    var start = openedAt[key], label = ack.textContent, attached = false;
    (function tick() {
      if (ack.isConnected) attached = true; else if (attached) return;
      var left = Math.ceil((start + sec * 1000 - Date.now()) / 1000);
      if (left > 0) { ack.disabled = true; ack.textContent = '📖 ' + left + '초 뒤 확인 가능 / Available in ' + left + 's'; setTimeout(tick, 500); }
      else { ack.disabled = false; ack.textContent = label; }
    })();
  }
  async function respond(row, kind, button) {
    var feedback = '';
    if (kind === 'return') {
      feedback = (prompt('보완할 내용을 적어 주세요. / What needs clarification?') || '').trim();
      if (!feedback) return;
    }
    button.disabled = true;
    try {
      await call('/' + kind, { id: row.report.id, version: row.report.version, feedback: feedback });
      say(kind === 'ack' ? '✓ ' + row.name + ' 보고를 확인했습니다. / Acknowledged.' : '↩ ' + row.name + '에게 보완 요청을 보냈습니다. / Change request sent.');
      document.dispatchEvent(new CustomEvent('mh:handover-changed', { detail: { from: 'board' } }));
      await load(current());
    } catch (e) { say(e.message, true); button.disabled = false; }
  }

  function item(row) {
    var art = el('article', null, 'mhb-item'), open = S.open === row.username, t = tagOf(row);
    art.dataset.state = row.state;
    var head = el('button', null, 'mhb-head');
    head.type = 'button'; head.dataset.user = row.username; head.setAttribute('aria-expanded', String(open));
    var who = el('span', null, 'mhb-who'), note = whoNote(row);
    who.append(el('strong', row.name));
    if (note) who.append(el('small', note));
    var what = el('span', null, 'mhb-what');
    what.append(el('span', whatText(row)), whatMeta(row));
    var tag = el('span', t[0], 'mhb-tag');
    tag.dataset.tone = t[1];
    head.append(who, what, tag);
    head.onclick = function () { S.open = open ? null : row.username; S.focus = row.username; paint(); };
    art.append(head);
    if (open) art.append(body(row));
    return art;
  }
  function paintSummary(s) {
    var host = $('summary');
    host.replaceChildren();
    FILTERS.forEach(function (f) {
      var b = el('button', null, 'mhb-cell'), n = Number(s[f.count]) || 0;
      b.type = 'button'; b.setAttribute('aria-pressed', String(S.filter === f.key));
      if (f.tone && n > 0) b.dataset.tone = f.tone;
      b.append(el('b', String(n)), el('span', f.label));
      b.onclick = function () { S.filter = S.filter === f.key ? 'all' : f.key; S.open = null; paint(); };
      host.append(b);
    });
  }
  function emptyText() {
    return ({ missing: '미제출 없음 — 모두 냈습니다. / Everyone has submitted.', issue: '문제가 적힌 보고가 없습니다. / No issues reported.',
      awaiting: '미확인 보고가 없습니다. / Nothing unread.', submitted: '아직 낸 사람이 없습니다. / No submissions yet.' })[S.filter]
      || '이 날짜에 보고 대상·보고가 없습니다. / No roster or reports for this date.';
  }
  function paint() {
    var j = S.data, f = filterOf(S.filter);
    $('date').value = S.day; $('date').max = S.today;
    $('next').disabled = S.day >= S.today; $('today').disabled = S.day === S.today;
    paintSummary(j.summary);
    var notes = ['기준일 / Date: ' + S.day + ' (' + WEEK[new Date(S.day + 'T00:00:00Z').getUTCDay()] + ')'];
    if (f) notes.push('보기 / Showing: ' + f.label);
    if (!j.duty_known) notes.push('⚠ 작성 대상 명단을 못 읽어 낸 보고만 보입니다 / Roster unavailable');
    if (!j.sales_known) notes.push('⚠ 영업일지를 못 읽었습니다 / Sales log unavailable');
    $('note').textContent = notes.join(' · ');
    $('show-all').hidden = !f;
    var list = $('list'), rows = j.rows.filter(function (r) { return !f || f.test(r); });
    list.replaceChildren();
    if (!rows.length) list.append(el('p', emptyText(), 'small'));
    rows.forEach(function (r) { list.append(item(r)); });
    var others = j.not_on_roster || [];
    $('others').hidden = !others.length;
    $('others-sum').textContent = '보고 명단에 없는 본사 계정 ' + others.length + '명 / Not on the report roster: ' + others.length;
    $('others-list').textContent = others.map(function (o) { return o.name; }).join(', ');
    if (S.focus) {
      var h = Array.prototype.filter.call(list.querySelectorAll('.mhb-head'), function (x) { return x.dataset.user === S.focus; })[0];
      S.focus = null;
      if (h) h.focus();
    }
  }

  async function load(day) {
    var seq = ++S.seq;
    S.loading = true;
    try {
      var j = await call('/board' + (day ? '?date=' + encodeURIComponent(day) : ''));
      if (seq !== S.seq) return;
      if (!day) S.today = j.day; // 날짜 없이 부르면 서버가 «오늘(KST)» 을 돌려준다
      S.day = j.day; S.data = j; box.hidden = false;
      paint();
    } catch (e) {
      if (seq !== S.seq) return;
      if (e.status === 403 || !S.data) { box.hidden = true; return; } // 경영진이 아님(또는 첫 조회 실패) — 칸을 안 보인다
      say('보고판을 새로 못 읽었습니다. 잠시 후 다시 / Could not refresh the board: ' + e.message, true);
    } finally { if (seq === S.seq) S.loading = false; }
  }
  function go(day) { if (!day || day > S.today) return; S.open = null; say(''); load(day); }
  // «오늘» 을 보고 있으면 날짜 없이 묻는다 — 서버가 오늘(KST)을 정하므로, 화면을 연 채 자정을 넘기면 새 날로 넘어간다.
  function current() { return S.day === S.today ? '' : S.day; }

  $('prev').onclick = function () { go(shiftDay(S.day, -1)); };
  $('next').onclick = function () { go(shiftDay(S.day, 1)); };
  $('today').onclick = function () { S.open = null; say(''); load(''); };
  $('date').onchange = function () { if (/^\d{4}-\d{2}-\d{2}$/.test(this.value)) go(this.value); };
  $('refresh').onclick = function () { say(''); load(current()); };
  $('show-all').onclick = function () { S.filter = 'all'; S.open = null; paint(); };
  document.addEventListener('mh:handover-changed', function (e) { if (!(e.detail && e.detail.from === 'board') && S.data) load(current()); });
  setInterval(function () { if (S.data && !document.hidden && !S.loading) load(current()); }, 60000);

  // 첫 조회는 «오늘» 로 연다(오늘이 언제인지는 서버가 정한다 — KST). ?date= 로 왔으면 그 날짜를 이어서 연다.
  (async function init() {
    await load('');
    var want = params.get('date') || '';
    if (S.data && /^\d{4}-\d{2}-\d{2}$/.test(want) && want !== S.day && want < S.today) go(want);
  })();
})();
