/* ══════════════════════════════════════════════════════════════════════════════
   📅 수업 연기·변경 창 — 관리자(admin.html 「오늘 수업」)·매니저(manager.html 「오늘 전체 수업」) 공용

   (2026-09-23) 사장님 「매니저 화면도 똑같이 — 필리핀 매니저 Karl, MaiMai, Melca」.
   관리자 화면에 먼저 만든 창(js/adm-today-classes.js)을 **그대로** 이 파일로 옮겼다 —
   두 화면이 각자 한 벌씩 들면 한쪽만 고쳐지는 사고가 난다(CLAUDE.md 2장 「같은 판정이 두 곳」).

   쓰는 법:  window.mangoiMoveModal.open(row, { day, isEn, canCancel, me, onClose })
     · row      = /api/admin/classes/today 의 sessions[] 한 줄 (schedule_id·start_ts·start_time·
                  student_name·student_uid·teacher_name·can_move)
     · day      = 'YYYY-MM-DD' (그 목록의 날짜)
     · isEn()   = 지금 영어 화면인가 — 화면마다 언어 정본이 달라 부르는 쪽이 준다
     · canCancel= 이 계정이 «취소» 를 할 수 있는가(본사 계열) — 모르면 false
     · me       = { name } — 요청 기록의 «처리한 사람»
     · onClose(changed) — 창을 닫을 때. changed=true 면 목록을 다시 받을 것
   ⚠️ manager.html 은 «외부 리소스 0개» 계약이라 **버튼을 누를 때만** 이 파일을 받는다.
   ⚠️ 이 파일을 고치면 부르는 두 곳의 `?v=` 를 **같은 번호로** 함께 올릴 것.
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  var _isEn = function () { return false; };
  function isEn() { try { return !!(_opt.isEn ? _opt.isEn() : _isEn()); } catch (e) { return false; } }
  function T(ko, en) { return isEn() ? en : ko; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hhmm(ts) {
    try {
      return new Date(ts).toLocaleTimeString('ko-KR', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul'
      });
    } catch (e) { return '-'; }
  }
  function kstTodayStr() {
    return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  }
  /* ══════════════════════════════════════════════════════════════════════
     📅 (2026-09-22) 줄에서 바로 연기 · 변경 · 취소 — manager.html 의 taRun 과 «같은 서버 경로».
     ⚠️ 새 판정을 만들지 않는다:
        · 연기·변경 → POST /schedule-requests(기록) → POST /schedule-requests/decide(적용)
          (겹침 검사·반복수업 자동이동 거부·스코프 재확인·강사 차단·변경이력을 서버가 한다)
        · 취소 → DELETE /class-schedules/:id (status='cancelled' + 이력)
          ⛔ request_type:'cancel' 로 보내지 말 것 — 서버 승인이 그것을 status='postponed' 로
             적어(급여 규칙이 걸림) 화면이 거짓말을 하게 된다(CLAUDE.md 2장).
     ⛔ 취소는 막는 쪽으로 실패: can_move===true · 역할을 «알고» 본사 계열일 때만.
        (DELETE 는 지사·대리점에 403 — 주면 «눌러도 안 되는 버튼».)
     ══════════════════════════════════════════════════════════════════════ */
  var _mvChanged = false;
  /* 부르는 화면이 넘겨 준 것 — { day, isEn, canCancel, me:{name}, onClose(changed) }.
     ⛔ 역할 판정(누가 취소할 수 있나)은 화면마다 근거가 달라(admin=__ADM_ME.role · manager=scope)
        «부르는 쪽» 이 canCancel 로 넘긴다. 여기서는 «그리고 날짜 지정 수업인가» 만 더 본다. */
  var _opt = {};
  function mvMe() { return _opt.me || null; }
  function mvCanCancel(r) {
    return _opt.canCancel === true && !!r && r.can_move === true;   // 모르면 안 준다
  }
  function mvMsgOf(j) {
    var a = j && j.applied;
    if (a === 'moved')     return { ok: true,  s: T('이번 한 번 옮겼습니다.', 'Moved (this class only).') };
    if (a === 'postponed') return { ok: true,  s: T('연기 처리했습니다.', 'Postponed.') };
    if (a === 'recorded')  return { ok: false, s: T('반복 수업이라 자동으로 못 옮깁니다 — 시간표에서 직접 옮겨 주세요.', 'Weekly class — move it by hand in the timetable.') };
    if (a === 'conflict')  return { ok: false, s: T('그 시간에 다른 수업이 있어 못 옮겼습니다 — 직접 옮겨 주세요.', 'That slot is taken — move it by hand.') };
    return { ok: true, s: T('처리했습니다.', 'Done.') };
  }
  function mvErrOf(st, j) {
    var e = (j && j.error) || '';
    if (e === 'forbidden_teacher') {
      var w = (j && (isEn() ? j.who_line_en : j.who_line)) || '';
      return T('강사 계정은 처리할 수 없습니다.', 'Teachers cannot do this.') + (w ? ' ' + w : '');
    }
    if (st === 403 || e === 'forbidden_scope') return T('권한 밖의 수업입니다.', 'Not in your scope.');
    if (st === 409 || e === 'already_decided') return T('이미 처리된 요청입니다.', 'Already handled.');
    if (st === 404) return T('수업을 찾을 수 없습니다.', 'Class not found.');
    return T('처리하지 못했습니다. 다시 눌러 주세요.', 'Failed. Try again.');
  }
  function mvReq(method, path, payload) {
    return fetch(path, {
      method: method, credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload || {})
    }).then(function (rs) {
      return rs.json().catch(function () { return null; }).then(function (j) { return { st: rs.status, j: j }; });
    });
  }
  function tcMoveModalClose() {
    var b = $('tc-move-modal');
    if (b && b.parentNode) b.parentNode.removeChild(b);
    var ch = _mvChanged;
    _mvChanged = false;
    if (b && typeof _opt.onClose === 'function') { try { _opt.onClose(ch); } catch (e) {} }
  }
  /* 동작별 색 — 연기=호박(이번 한 번) · 변경=남색(앞으로 계속) · 취소=빨강. */
  /* ⚠️ 눌린 상태를 «짙은 바탕 + 흰 글자» 로 칠하지 않는다 — 관리자 화면의 밝기 페인터
        (js/adm-light-surfaces.js)가 짙은 인라인 바탕을 밝게 덮어 «흰 바탕에 흰 글자» 가 된다
        (2026-09-23 브라우저 실측). 옅은 바탕 + 짙은 글자 + 두꺼운 테두리로 — 페인터가 안 건드린다. */
  var MV_COLOR = { postpone: ['#b45309', '#fff4e0'], series: ['#3b3fc4', '#ecedff'], cancel: ['#b42318', '#fdecea'] };
  function mvModeStyle(el, mode, on) {
    var c = MV_COLOR[mode] || ['#1d4ed8', '#eff6ff'];
    el.style.border = (on ? '2px solid ' + c[0] : '2px solid #d1d5db');
    el.style.background = on ? c[1] : '#fff';
    el.style.color = on ? c[0] : '#111827';
  }
  function mvBtn(mode, label, on) {
    var c = MV_COLOR[mode] || ['#1d4ed8', '#eff6ff'];
    return '<button type="button" data-mv-mode="' + mode + '" aria-pressed="' + (on ? 'true' : 'false') + '" '
      + 'style="padding:6px 12px;border-radius:8px;border:2px solid ' + (on ? c[0] : '#d1d5db') + ';'
      + 'background:' + (on ? c[1] : '#fff') + ';color:' + (on ? c[0] : '#111827') + ';font-weight:800;cursor:pointer">'
      + label + '</button>';
  }
  function mvSubBtn(sub, label, on) {
    return '<button type="button" data-mv-sub="' + sub + '" aria-pressed="' + (on ? 'true' : 'false') + '" '
      + 'style="padding:6px 10px;border-radius:8px;font-size:12.5px;cursor:pointer;color:#111827;'
      + 'border:1.5px solid ' + (on ? '#b45309' : '#d1d5db') + ';background:' + (on ? '#fff4e0' : '#fff') + ';font-weight:' + (on ? '800' : '500') + '">'
      + label + '</button>';
  }
  /* 📅 날짜 칸 — 「9/24 (목)」. 요일은 UTC 로 뽑는다(로컬 시간대면 하루 밀린다). */
  function mvDayLabel(iso) {
    var d = new Date(iso + 'T00:00:00Z');
    var w = isEn() ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] : ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' (' + w + ')';
  }
  function mvAddDays(iso, n) {
    return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  }
  /* 지금 고른 동작 — 'hold'(완전히 연기) · 'date'(지정한 날짜로 연기) · 'series'(변경·계속) · 'cancel'. */
  function mvAct() {
    var box = $('tc-move-modal'); if (!box) return 'hold';
    var on = box.querySelector('[data-mv-mode][aria-pressed="true"]');
    var mode = on ? on.getAttribute('data-mv-mode') : 'postpone';
    if (mode !== 'postpone') return mode;
    var sb = box.querySelector('[data-mv-sub][aria-pressed="true"]');
    return (sb && sb.getAttribute('data-mv-sub') === 'date') ? 'date' : 'hold';
  }
  function mvChip(kind, val, label, on) {
    return '<button type="button" data-mv-' + kind + '="' + esc(val) + '" aria-pressed="' + (on ? 'true' : 'false') + '" '
      + 'style="padding:5px 0;border-radius:8px;font-size:12px;cursor:pointer;min-width:' + (kind === 'day' ? '64px' : '52px') + ';'
      + 'border:2px solid ' + (on ? '#065f46' : '#e2e8f0') + ';background:' + (on ? '#d1fae5' : '#f8fafc') + ';color:' + (on ? '#065f46' : '#101828') + ';font-weight:' + (on ? '900' : '600') + '">'
      + esc(label) + '</button>';
  }
  function mvPaintChips(base, orig) {
    var dEl = $('tc-mv-date'), tEl = $('tc-mv-time');
    var dv = dEl ? dEl.value : '', tv = tEl ? tEl.value : '';
    var dh = '';
    for (var i = 0; i < 14; i++) { var iso = mvAddDays(base, i); dh += mvChip('day', iso, mvDayLabel(iso), iso === dv); }
    if (dv && dh.indexOf('"' + dv + '"') < 0) dh += mvChip('day', dv, mvDayLabel(dv), true);
    var th = '', seen = {};
    for (var m = 7 * 60; m <= 23 * 60 + 40; m += 20) {
      var hm = (m / 60 < 10 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 < 10 ? '0' : '') + (m % 60);
      seen[hm] = 1; th += mvChip('hm', hm, hm, hm === tv);
    }
    if (tv && !seen[tv]) th = mvChip('hm', tv, tv, true) + th;
    var a = $('tc-mv-days'), b = $('tc-mv-hms');
    if (a) a.innerHTML = dh;
    if (b) b.innerHTML = th;
  }
  function tcOpenMoveModal(r, opt) {
    if (!r) return;
    tcMoveModalClose();
    _opt = opt || {};
    var day = /^\d{4}-\d{2}-\d{2}$/.test(String(_opt.day || '')) ? String(_opt.day) : kstTodayStr();
    var canCancel = mvCanCancel(r);
    _mvData = null; _mvPick = ''; _mvSer = null;
    var who = String(r.student_name || r.student_uid || '');
    var inp = 'padding:6px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#101828;box-sizing:border-box';
    var box = document.createElement('div');
    box.id = 'tc-move-modal';
    box.setAttribute('data-day', day);
    box.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.55);display:flex;justify-content:center;padding:16px;overflow-y:auto';
    box.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:440px;width:100%;margin:auto;padding:18px;box-shadow:0 20px 50px -10px rgba(0,0,0,0.4);color:#111827">'
      + '<div style="font-weight:800;font-size:15px;margin-bottom:4px">📅 ' + T('수업 연기·변경', 'Postpone / move class') + '</div>'
      + '<div style="font-size:12.5px;color:#475467;margin-bottom:12px">' + esc(who) + ' · ' + esc(day) + ' ' + esc(hhmm(r.start_ts)) + (r.teacher_name ? ' · ' + esc(r.teacher_name) : '') + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'
      +   mvBtn('postpone', T('⏸ 연기 <small style="font-weight:500">이번 한 번</small>', '⏸ Postpone <small style="font-weight:500">once</small>'), true)
      +   mvBtn('series', T('🔄 변경 <small style="font-weight:500">앞으로 계속</small>', '🔄 Change <small style="font-weight:500">from now on</small>'), false)
      +   (canCancel ? mvBtn('cancel', T('수업 취소', 'Cancel class'), false) : '')
      + '</div>'
      /* ⏸ 연기 = «이번 한 번». 두 갈래: 날짜 미정 / 지정한 날짜 (2026-09-23 사장님 샘플 C). */
      + '<div id="tc-mv-sub" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'
      +   mvSubBtn('hold', T('완전히 연기 (날짜 미정)', 'Postpone (no new date)'), true)
      +   mvSubBtn('date', T('지정한 날짜로 연기', 'Postpone to a date'), false)
      + '</div>'
      + '<div id="tc-mv-when" hidden style="display:none;margin-bottom:10px">'
      +   '<div id="tc-mv-when-l" style="font-size:12px;font-weight:700;color:#344054;margin-bottom:4px"></div>'
      +   '<div id="tc-mv-days" style="display:flex;gap:4px;overflow-x:auto;padding-bottom:4px"></div>'
      +   '<div id="tc-mv-hms" style="display:flex;flex-wrap:wrap;gap:4px;max-height:124px;overflow-y:auto;margin-top:6px"></div>'
      +   '<div style="font-size:11.5px;color:#475467;margin-top:6px">' + T('다른 날짜·시각', 'Other date/time') + ' '
      +     '<input type="date" id="tc-mv-date" value="' + esc(day) + '" style="' + inp + ';font-size:12px;padding:3px"> '
      +     '<input type="time" id="tc-mv-time" step="600" value="' + esc(String(r.start_time || '').slice(0, 5)) + '" style="' + inp + ';font-size:12px;padding:3px"></div>'
      + '</div>'
      /* 📅 (2026-09-23 Karl 제안) 새 시간에 되는 강사 — 날짜·시각 변경일 때만 */
      + '<div id="tc-mv-teachers" hidden style="display:none;font-size:12px;line-height:1.6;color:#344054;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px;margin-bottom:10px"></div>'
      /* 🔄 변경(앞으로 계속) 미리보기 — 서버가 «어느 회차가 어떻게 바뀌는지» 를 먼저 세어 준다. */
      + '<div id="tc-mv-series" hidden style="display:none;font-size:12px;line-height:1.6;color:#101828;background:#ecedff;border:1px solid #b9bcf7;border-radius:8px;padding:8px 10px;margin-bottom:10px"></div>'
      /* 무엇이 일어나는지 한 줄 — 이번 한 번인지, 앞으로 계속인지. */
      + '<div id="tc-mv-note" style="font-size:12px;line-height:1.55;color:#101828;border-radius:8px;padding:8px 10px;margin-bottom:10px"></div>'
      + '<label style="font-size:12px;color:#475467">' + T('사유 (선택)', 'Reason (optional)') + '<br>'
      +   '<input type="text" id="tc-mv-reason" maxlength="200" placeholder="' + T('예: 학부모 연락', 'e.g. parent called') + '" style="width:100%;' + inp + '"></label>'
      + (canCancel ? '' : '<div style="font-size:11.5px;color:#475467;margin-top:6px">'
          + (r.can_move === true
              ? T('수업 «취소» 는 본사 계정에서 합니다.', 'Cancelling a class is done by an HQ account.')
              : T('«취소» 는 날짜가 정해진 수업에서만 됩니다.', 'Cancel is offered only for a date-fixed class.')) + '</div>')
      + '<div id="tc-mv-msg" style="font-size:12.5px;font-weight:700;margin-top:10px;min-height:1em"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">'
      +   '<button type="button" id="tc-mv-close" style="padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;background:#f9fafb;color:#111827;cursor:pointer">' + T('닫기', 'Close') + '</button>'
      +   '<button type="button" id="tc-mv-go" style="padding:8px 16px;border:0;border-radius:8px;background:#065f46;color:#fff;font-weight:800;cursor:pointer">' + T('실행', 'Apply') + '</button>'
      + '</div></div>';
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      if (e.target === box) { tcMoveModalClose(); return; }
      var pk = e.target.closest && e.target.closest('[data-mv-pick]');
      if (pk) { _mvPick = pk.getAttribute('data-mv-pick') || ''; mvPaint(); if (mvAct() === 'series') mvSeriesLater(r); return; }
      var mb = e.target.closest && e.target.closest('[data-mv-mode]');
      if (mb) {
        var all = box.querySelectorAll('[data-mv-mode]');
        for (var i = 0; i < all.length; i++) {
          var on = all[i] === mb;
          all[i].setAttribute('aria-pressed', on ? 'true' : 'false');
          mvModeStyle(all[i], all[i].getAttribute('data-mv-mode'), on);
        }
        mvSync(r, day); return;
      }
      var sb = e.target.closest && e.target.closest('[data-mv-sub]');
      if (sb) {
        var subs = box.querySelectorAll('[data-mv-sub]');
        for (var j = 0; j < subs.length; j++) {
          var so = subs[j] === sb;
          subs[j].setAttribute('aria-pressed', so ? 'true' : 'false');
          subs[j].style.borderColor = so ? '#b45309' : '#d1d5db';
          subs[j].style.background = so ? '#fff4e0' : '#fff';
          subs[j].style.fontWeight = so ? '800' : '500';
        }
        mvSync(r, day); return;
      }
      var dc = e.target.closest && e.target.closest('[data-mv-day]');
      var tc = e.target.closest && e.target.closest('[data-mv-hm]');
      if (dc || tc) {
        if (dc) $('tc-mv-date').value = dc.getAttribute('data-mv-day');
        if (tc) $('tc-mv-time').value = tc.getAttribute('data-mv-hm');
        mvPaintChips(day, r); mvWhenChanged(r);
      }
    });
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var pk = e.target.closest && e.target.closest('[data-mv-pick]');
      if (pk) { e.preventDefault(); _mvPick = pk.getAttribute('data-mv-pick') || ''; mvPaint(); if (mvAct() === 'series') mvSeriesLater(r); }
    });
    ['tc-mv-date', 'tc-mv-time'].forEach(function (id) {
      var el = $(id);
      if (el) {
        el.addEventListener('change', function () { mvPaintChips(day, r); mvWhenChanged(r); });
        el.addEventListener('input', function () { mvWhenChanged(r); });
      }
    });
    mvPaintChips(day, r);
    mvSync(r, day);
    $('tc-mv-close').addEventListener('click', tcMoveModalClose);
    $('tc-mv-go').addEventListener('click', function () { mvRun(r, day); });
  }
  /* 📅 (2026-09-23 Karl 매니저 제안) 새 날짜·시각에 «누가 되는가».
     "some students choose specific teacher" — 그래서 **학생의 담당 강사를 먼저** 말하고,
     안 되면 그 시간에 빈 다른 강사를 보여 준다. 판정은 서버(move-candidates)가 한다 —
     옮기기 승인이 쓰는 그 겹침 검사라 여기서 «가능» 이면 승인에서도 안 막힌다.
     ⛔ 읽기 전용 — 강사를 바꾸지 않는다. 안 되면 «실행해도 안 옮겨진다» 를 사실대로 말한다.
     ⚠️ 늦게 온 응답이 새 입력을 덮지 않게 번호(_mvSeq)로 물러난다. */
  var _mvSeq = 0, _mvTimer = null;
  function mvWhy(w) {
    return w === 'busy' ? T('이 시간 다른 수업', 'another class then')
      : w === 'substituting' ? T('그날 대체 수업 중', 'substituting then')
      : w === 'time_off' ? T('근무 불가 등록', 'marked unavailable')
      : w === 'long_class_cap' ? T('긴 수업 정원 참', 'long-class cap reached')
      : T('안 됨', 'not available');
  }
  /* 🖼 (2026-09-23 사장님 「이렇게 강사리스트가 나와서 선택하면 좋을 것 같아」 ·
        「그 시간대 가능한 강사들만」) — 홈 「강사 소개」 카드처럼 사진 카드로, **그 시간에 되는
        강사만** 보여 주고 누르면 고른다. 담당 강사가 되면 맨 앞에 두고 미리 골라 둔다
        ("some students choose specific teacher" — 학생이 고른 강사를 먼저). */
  var _mvData = null, _mvPick = '';
  function mvCard(t, tag) {
    var on = String(t.id) === String(_mvPick);
    var nm = t.display_name || t.name || '';
    var face = t.photo
      ? '<img src="' + esc(t.photo) + '" alt="" loading="lazy" style="width:56px;height:56px;border-radius:50%;object-fit:cover;display:block;margin:0 auto">'
      : '<div style="width:56px;height:56px;border-radius:50%;margin:0 auto;background:#e0e7ff;color:#3730a3;font-weight:800;font-size:22px;line-height:56px;text-align:center">' + esc(String(nm).replace(/^teacher\s+/i, '').charAt(0).toUpperCase() || '?') + '</div>';
    return '<div role="button" tabindex="0" data-mv-pick="' + esc(t.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" '
      + 'style="cursor:pointer;width:92px;box-sizing:border-box;padding:8px 4px;border-radius:12px;text-align:center;'
      + 'border:2px solid ' + (on ? '#1d4ed8' : '#e2e8f0') + ';background:' + (on ? '#eff6ff' : '#fff') + '">'
      + face
      + '<div style="font-size:11.5px;font-weight:800;color:#101828;margin-top:4px;line-height:1.25;word-break:break-word">' + esc(nm) + '</div>'
      + (tag ? '<div style="font-size:10px;color:#065f46;font-weight:700">' + tag + '</div>' : '')
      + (on ? '<div style="font-size:10px;color:#1d4ed8;font-weight:800">✔ ' + T('선택', 'picked') + '</div>' : '')
      + '</div>';
  }
  function mvTeachersHtml(d) {
    var h = '';
    if (d.student_conflict) {
      h += '<div style="color:#b91c1c;font-weight:700;margin-bottom:6px">⚠ ' + T('학생에게 이 시간 다른 수업이 있어 옮길 수 없습니다.', 'The student already has a class then — it cannot move.') + '</div>';
    }
    var c = d.current;
    if (c && !c.free) {
      h += '<div style="margin-bottom:6px">👤 ' + T('담당 강사', 'Assigned teacher') + ' <b>' + esc(c.display_name || c.name) + '</b> — '
        + '<b style="color:#b91c1c">⛔ ' + esc(mvWhy(c.why)) + '</b>'
        + (d.teacher_change_ok ? ' · ' + T('아래에서 다른 강사를 고르세요.', 'pick another teacher below.') : '') + '</div>';
    } else if (!c) {
      h += '<div style="margin-bottom:6px">👤 ' + T('담당 강사 미배정', 'No assigned teacher') + '</div>';
    }
    var list = [];
    if (c && c.free) list.push(mvCard(c, T('담당 강사', 'assigned')));
    if (d.teacher_change_ok) {
      (d.candidates || []).forEach(function (t) { list.push(mvCard(t, '')); });
    }
    h += '<div style="font-weight:700;margin-bottom:4px">' + T('이 시간 가능한 강사', 'Teachers free at this time') + ' ' + list.length + T('명', '') + '</div>';
    if (list.length) h += '<div style="display:flex;flex-wrap:wrap;gap:6px;max-height:260px;overflow-y:auto">' + list.join('') + '</div>';
    else h += '<div style="color:#b91c1c">' + T('이 시간에 되는 강사가 없습니다. 다른 시간을 고르세요.', 'No teacher is free then. Pick another time.') + '</div>';
    if (!d.teacher_change_ok && (d.candidates || []).length) {
      h += '<div style="color:#92400e;margin-top:6px">' + T('카페24 수업은 날짜를 바꾸면서 강사까지 바꿀 수 없습니다(같은 날짜 안에서는 됩니다).', 'A cafe24 class cannot change teacher while moving to another date (same day is OK).') + '</div>';
    }
    if (d.busy_count > 0) h += '<div style="color:#475467;margin-top:6px">' + T('그 시간 안 되는 강사 ', 'Not available then: ') + d.busy_count + T('명 (목록에서 뺐습니다)', '') + '</div>';
    return h;
  }
  function mvPaint() {
    var box = $('tc-mv-teachers'); if (!box || !_mvData) return;
    box.innerHTML = mvTeachersHtml(_mvData);
  }
  function mvTeachersLater(r) {
    if (_mvTimer) clearTimeout(_mvTimer);
    _mvTimer = setTimeout(function () { mvLoadTeachers(r); }, 350);
  }
  function mvLoadTeachers(r) {
    var box = $('tc-mv-teachers'); if (!box || box.hidden) return;
    var date = String(($('tc-mv-date') || {}).value || '').trim();
    var time = String(($('tc-mv-time') || {}).value || '').slice(0, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) {
      box.innerHTML = T('새 날짜와 시각을 고르면 되는 강사를 보여 드립니다.', 'Pick a date and time to see available teachers.');
      return;
    }
    var my = ++_mvSeq;
    _mvData = null;
    box.innerHTML = T('강사 확인 중…', 'Checking teachers…');
    fetch('/api/pay/enroll/admin/move-candidates?schedule_id=' + encodeURIComponent(r.schedule_id)
          + '&date=' + encodeURIComponent(date) + '&time=' + encodeURIComponent(time), { credentials: 'include' })
      .then(function (rs) { return rs.json().catch(function () { return null; }).then(function (j) { return { st: rs.status, j: j }; }); })
      .then(function (res) {
        if (my !== _mvSeq || !$('tc-mv-teachers')) return;
        if (!res.j || res.j.ok !== true) {
          box.innerHTML = '<span style="color:#475467">' + (res.st === 403
            ? T('강사 가능 여부는 이 계정으로 볼 수 없습니다. (옮기기는 됩니다)', 'This account cannot see teacher availability. (Moving still works.)')
            : T('강사 가능 여부를 불러오지 못했습니다. (옮기기는 됩니다)', 'Could not load teacher availability. (Moving still works.)')) + '</span>';
          return;
        }
        _mvData = res.j;
        /* 기본 선택 = 담당 강사(그 시간에 되면). 안 되면 아무도 안 고른 채로 둔다 — 지어내지 않는다. */
        var cur = res.j.current;
        var keep = _mvPick && ((cur && cur.free && String(cur.id) === _mvPick)
          || (res.j.teacher_change_ok && (res.j.candidates || []).some(function (t) { return String(t.id) === _mvPick; })));
        if (!keep) _mvPick = (cur && cur.free) ? String(cur.id) : '';
        mvPaint();
      })
      .catch(function () {
        if (my !== _mvSeq) return;
        box.innerHTML = '<span style="color:#475467">' + T('강사 가능 여부를 불러오지 못했습니다. (옮기기는 됩니다)', 'Could not load teacher availability. (Moving still works.)') + '</span>';
      });
  }
  /* ── 🔄 (2026-09-23 사장님 「연기는 지정한 날짜에 한 번이고, 변경은 계속이야.」) ──
     ⏸ 연기 ▸ 완전히  = 이 회만 «연기»(날짜 미정) — /schedule-requests(postpone) + /decide
     ⏸ 연기 ▸ 지정 날짜 = 이 회만 새 날짜·시각으로   — /schedule-requests(change)  + /decide
     🔄 변경(앞으로 계속) = 이 회부터 같은 요일·시각 수업 «전부» — /api/pay/enroll/admin/series-move
     ⛔ 예전 버튼 이름 «날짜·시각 변경» 은 실제로 «이 회만» 옮겼다 — 새 규칙으로는 «연기 ▸ 지정 날짜» 다.
        이름만 바꾸고 하는 일(서버 경로)은 그대로 둔다. */
  var _mvSer = null, _mvSerSeq = 0, _mvSerTimer = null;
  function mvSync(r, day) {
    var act = mvAct();
    var picking = act === 'date' || act === 'series';
    var show = function (id, on, disp) { var el = $(id); if (el) { el.hidden = !on; el.style.display = on ? (disp || 'block') : 'none'; } };
    show('tc-mv-sub', act === 'hold' || act === 'date', 'flex');
    show('tc-mv-when', picking);
    show('tc-mv-teachers', picking);
    show('tc-mv-series', act === 'series');
    var wl = $('tc-mv-when-l');
    if (wl) wl.textContent = act === 'series'
      ? T('📅 새 요일·시각 — 이 회가 옮겨 갈 날짜를 고르면, 앞으로의 회차도 같은 요일·시각으로 갑니다', '📅 New day & time — pick where this class goes; later classes follow the same weekday & time')
      : T('📅 이 회를 옮길 날짜 · 🕐 시각', '📅 Date · 🕐 time for this one class');
    var note = $('tc-mv-note');
    if (note) {
      var who = String(r.student_name || r.student_uid || '');
      var nd = String(($('tc-mv-date') || {}).value || ''), nt = String(($('tc-mv-time') || {}).value || '').slice(0, 5);
      var when = mvDayLabel(day) + ' ' + String(r.start_time || '').slice(0, 5);
      var styleOf = { hold: ['#fff4e0', '#f5c77a'], date: ['#fff4e0', '#f5c77a'], series: ['#ecedff', '#b9bcf7'], cancel: ['#fdecea', '#f3a8a0'] }[act];
      note.style.background = styleOf[0]; note.style.border = '1px solid ' + styleOf[1];
      note.innerHTML = act === 'hold'
        ? T('<b>이번 한 번만</b> — ' + esc(when) + ' 수업이 «연기» 상태가 됩니다(새 날짜는 나중에). 다음 회부터는 원래 시간표 그대로입니다.',
            '<b>This class only</b> — ' + esc(when) + ' becomes «postponed» (new date later). Following classes stay as they are.')
        : act === 'date'
        ? T('<b>이번 한 번만</b> — ' + esc(when) + ' → ' + esc(nd ? mvDayLabel(nd) : '?') + ' ' + esc(nt) + '. 다음 회부터는 원래 시간표 그대로입니다.',
            '<b>This class only</b> — ' + esc(when) + ' → ' + esc(nd ? mvDayLabel(nd) : '?') + ' ' + esc(nt) + '. Following classes stay as they are.')
        : act === 'series'
        ? T('<b>앞으로 계속</b> — 이 회부터 같은 요일·시각의 수업을 <b>모두</b> 옮깁니다. 한 회라도 자리가 겹치면 아무것도 바꾸지 않습니다.',
            '<b>From now on</b> — this and every later class at the same weekday & time move. If any one clashes, nothing changes.')
        : T('<b>이번 한 번만</b> — ' + esc(who) + ' · ' + esc(when) + ' 수업을 취소합니다.', '<b>This class only</b> — cancels ' + esc(who) + ' · ' + esc(when) + '.');
    }
    if (picking) mvTeachersLater(r);
    if (act === 'series') mvSeriesLater(r);
  }
  function mvWhenChanged(r) {
    var box = $('tc-move-modal'); if (!box) return;
    mvSync(r, (box.getAttribute('data-day') || ''));
  }
  function mvSeriesLater(r) {
    if (_mvSerTimer) clearTimeout(_mvSerTimer);
    _mvSerTimer = setTimeout(function () { mvLoadSeries(r); }, 400);
  }
  /* 서버에 «미리보기»(apply 없이)를 묻는다 — 몇 회가 어디로 가는지·겹치는 날짜·막히는 이유. */
  function mvSeriesBody(r) {
    var nd = String(($('tc-mv-date') || {}).value || '').trim();
    var nt = String(($('tc-mv-time') || {}).value || '').slice(0, 5);
    var cur = (_mvData && _mvData.current) ? String(_mvData.current.id) : '';
    var body = { schedule_id: Number(r.schedule_id), new_date: nd, new_time: nt };
    if (_mvPick && _mvPick !== cur) body.teacher_id = _mvPick;
    return body;
  }
  function mvSerKey(b) { return [b.schedule_id, b.new_date, b.new_time, b.teacher_id || ''].join('|'); }
  function mvLoadSeries(r) {
    var box = $('tc-mv-series'); if (!box || box.hidden) return;
    var b = mvSeriesBody(r);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.new_date) || !/^\d{1,2}:\d{2}$/.test(b.new_time)) {
      box.innerHTML = T('새 요일·시각을 고르면 앞으로 바뀌는 회차를 보여 드립니다.', 'Pick a new day & time to see which classes change.'); return;
    }
    var my = ++_mvSerSeq;
    _mvSer = null;
    box.innerHTML = T('앞으로의 회차 확인 중…', 'Checking later classes…');
    mvReq('POST', '/api/pay/enroll/admin/series-move', b).then(function (res) {
      if (my !== _mvSerSeq || !$('tc-mv-series')) return;
      _mvSer = { key: mvSerKey(b), st: res.st, j: res.j };
      box.innerHTML = mvSeriesHtml(res.st, res.j);
    }).catch(function () {
      if (my !== _mvSerSeq) return;
      box.innerHTML = '<span style="color:#b91c1c">' + T('앞으로의 회차를 불러오지 못했습니다. 다시 골라 주세요.', 'Could not load later classes. Pick again.') + '</span>';
    });
  }
  function mvSerErr(st, j) {
    var e = (j && j.error) || '';
    if (e === 'mirror_series') return T('카페24 수업은 «앞으로 계속» 바꾸기를 <b>카페24에서</b> 해야 합니다 — 여기서 바꾸면 밤마다 카페24 동기화가 옛 시간표로 다시 만듭니다. 이번 한 번만 옮기려면 «⏸ 연기 ▸ 지정한 날짜로 연기» 를 쓰세요.',
      'A cafe24 class must be changed «from now on» <b>in cafe24</b> — otherwise the nightly sync recreates the old timetable. To move just this one class use «⏸ Postpone ▸ to a date».');
    if (e === 'weekly_row') return T('매주 반복 수업은 시간표에서 바꿔 주세요.', 'A weekly class is changed in the timetable.');
    if (e === 'no_change') return T('지금과 같은 요일·시각입니다. 다른 요일·시각을 고르세요.', 'That is the same day & time. Pick another.');
    if (e === 'too_many') return T('앞으로의 회차가 너무 많아(60회 초과) 한 번에 못 옮깁니다. 시간표에서 나눠 옮겨 주세요.', 'Too many later classes (over 60). Move them in the timetable.');
    if (e === 'forbidden_scope' || e === 'teacher_move_forbidden' || st === 403) return T('담당 강사를 바꾸며 옮기는 것은 본사 계정에서 합니다. 담당 강사를 그대로 두면 됩니다.', 'Changing the teacher is done by an HQ account. Keep the assigned teacher to proceed.');
    if (e === 'forbidden_teacher') return T('강사 계정은 처리할 수 없습니다.', 'Teachers cannot do this.');
    return mvErrOf(st, j);
  }
  function mvSeriesHtml(st, j) {
    if (!j) return '<span style="color:#b91c1c">' + T('확인하지 못했습니다.', 'Could not check.') + '</span>';
    var items = j.items || [];
    var line = function (it) {
      return '<div>' + esc(mvDayLabel(it.from_date)) + ' ' + esc(it.from_time) + ' → <b>' + esc(mvDayLabel(it.to_date)) + ' ' + esc(it.to_time) + '</b></div>';
    };
    var list = function () {
      var h = items.slice(0, 8).map(line).join('');
      if (items.length > 8) h += '<div style="color:#475467">' + T('… 외 ', '… and ') + (items.length - 8) + T('회', ' more') + '</div>';
      return h;
    };
    var tch = (j.teacher && j.teacher.changed)
      ? '<div style="margin-top:4px">👤 ' + T('담당 강사: ', 'Teacher: ') + esc(j.teacher.from_name || '—') + ' → <b>' + esc(j.teacher.to_name || '') + '</b></div>' : '';
    if (j.ok === true) {
      return '<div style="font-weight:800;margin-bottom:4px">🔄 ' + T('앞으로 ', 'From now on: ') + items.length + T('회를 옮깁니다', ' classes move') + '</div>' + list() + tch;
    }
    if (j.error === 'conflict') {
      var cs = (j.conflicts || []).map(function (c) { return esc(mvDayLabel(c.date)); }).join(', ');
      return '<div style="color:#b91c1c;font-weight:800">⛔ ' + T('자리가 겹치는 날이 있어 옮길 수 없습니다: ', 'Some dates clash, so nothing can move: ') + cs + '</div>'
        + '<div style="color:#475467;margin-top:2px">' + T('다른 요일·시각이나 다른 강사를 고르세요. (앞으로 ', 'Pick another day/time or teacher. (') + items.length + T('회 중)', ' classes in total)') + '</div>';
    }
    return '<span style="color:#92400e">' + mvSerErr(st, j) + '</span>';
  }
  /* 🔄 변경(앞으로 계속) 실행 — 미리보기와 «같은 조건» 일 때만. 확인창에 회차를 그대로 적는다. */
  function mvRunSeries(r, day, reason, swapTo, curT) {
    var msg = $('tc-mv-msg'), go = $('tc-mv-go');
    var bad = function (t) { msg.style.color = '#b91c1c'; msg.innerHTML = t; };
    var b = mvSeriesBody(r);
    if (swapTo) b.teacher_id = String(swapTo.id);
    if (!_mvSer || _mvSer.key !== mvSerKey(b)) { bad(T('앞으로의 회차를 확인하는 중입니다. 잠깐 뒤 다시 눌러 주세요.', 'Still checking later classes — press again in a moment.')); mvSeriesLater(r); return; }
    var j = _mvSer.j;
    if (!j || j.ok !== true) { bad(j && j.error === 'conflict' ? T('자리가 겹치는 날이 있어 옮길 수 없습니다 — 위 목록을 보세요.', 'Some dates clash — see the list above.') : mvSerErr(_mvSer.st, j)); return; }
    var items = j.items || [];
    var lines = items.slice(0, 10).map(function (it) { return '· ' + mvDayLabel(it.from_date) + ' ' + it.from_time + ' → ' + mvDayLabel(it.to_date) + ' ' + it.to_time; }).join('\n')
      + (items.length > 10 ? '\n' + T('… 외 ', '… and ') + (items.length - 10) + T('회', ' more') : '');
    var tline = (j.teacher && j.teacher.changed) ? '\n\n' + T('담당 강사: ', 'Teacher: ') + (j.teacher.from_name || '—') + ' → ' + (j.teacher.to_name || '') : '';
    var who = String(r.student_name || r.student_uid || '');
    if (!window.confirm(T('앞으로 계속 바꿀까요?\n\n' + who + ' · ' + items.length + '회\n' + lines + tline + '\n\n· 한 회라도 그 사이 자리가 겹치면 아무것도 바꾸지 않습니다.',
                          'Change from now on?\n\n' + who + ' · ' + items.length + ' classes\n' + lines + tline + '\n\n· If any one clashes in the meantime, nothing changes.'))) return;
    go.disabled = true;
    msg.style.color = '#475467'; msg.textContent = T('처리 중...', 'Sending...');
    var payload = { schedule_id: b.schedule_id, new_date: b.new_date, new_time: b.new_time, apply: true, reason: reason || undefined };
    if (b.teacher_id) payload.teacher_id = b.teacher_id;
    mvReq('POST', '/api/pay/enroll/admin/series-move', payload).then(function (res) {
      var jj = res.j;
      if (!jj || jj.ok !== true) {
        go.disabled = false;
        if (jj && jj.error === 'conflict') { _mvSer = { key: mvSerKey(b), st: res.st, j: jj }; var sb = $('tc-mv-series'); if (sb) sb.innerHTML = mvSeriesHtml(res.st, jj); bad(T('그 사이 자리가 겹쳐 아무것도 바꾸지 않았습니다.', 'A clash appeared — nothing was changed.')); return; }
        bad(mvSerErr(res.st, jj) + ' ' + T('(아무것도 바꾸지 않았습니다)', '(Nothing was changed)')); return;
      }
      _mvChanged = true;
      var n = Number(jj.moved) || 0, total = Number(jj.count) || items.length;
      if (n === total) { msg.style.color = '#047857'; msg.textContent = T('앞으로 ' + n + '회를 옮겼습니다. (닫으면 목록을 다시 불러옵니다)', 'Moved ' + n + ' classes from now on. (Closing reloads the list)'); }
      else { msg.style.color = '#92400e'; msg.textContent = T('⚠ ' + total + '회 중 ' + n + '회만 옮겨졌습니다 — 그 사이 누군가 바꾼 회차가 있습니다. 시간표에서 확인해 주세요.', '⚠ Only ' + n + ' of ' + total + ' moved — some were changed meanwhile. Check the timetable.'); }
    }).catch(function () { go.disabled = false; bad(T('연결이 끊겼습니다. 결과를 모르니 목록을 다시 불러와 확인해 주세요.', 'Network error — reload the list to check the result.')); _mvChanged = true; });
  }
  function mvRun(r, day) {
    var box = $('tc-move-modal'); if (!box) return;
    /* 서버 경로는 그대로 — «완전히 연기» = postpone, «지정한 날짜로 연기» = 예전 «날짜·시각 변경»(이 회만 옮김). */
    var act = mvAct();
    var mode = act === 'hold' ? 'postpone' : act === 'date' ? 'change' : act;
    var msg = $('tc-mv-msg');
    var go = $('tc-mv-go');
    var newDate = String(($('tc-mv-date') || {}).value || '').trim();
    var newTime = String(($('tc-mv-time') || {}).value || '').slice(0, 5);
    var reason = String(($('tc-mv-reason') || {}).value || '').trim();
    var who = String(r.student_name || r.student_uid || '');
    var when = day + ' ' + hhmm(r.start_ts);
    var bad = function (t) { msg.style.color = '#b91c1c'; msg.textContent = t; };
    if ((mode === 'change' || mode === 'series') && !(/^\d{4}-\d{2}-\d{2}$/.test(newDate) && /^\d{1,2}:\d{2}$/.test(newTime))) {
      bad(T('새 날짜와 시각을 먼저 고르세요.', 'Pick a new date and time first.')); return;
    }
    if (mode === 'cancel' && !mvCanCancel(r)) { bad(T('이 수업은 여기서 취소할 수 없습니다.', 'This class cannot be cancelled here.')); return; }
    /* 🧑‍🏫 고른 강사가 담당 강사와 다르면 «강사도 바꾼다». 강사 확인을 못 받았으면(실패·권한 없음)
       예전처럼 담당 강사 그대로 옮긴다 — 모르는 채로 강사를 바꾸지 않는다. */
    var curT = (_mvData && _mvData.current) || null;
    var curId = curT ? String(curT.id) : '';
    var swapTo = null;
    if ((mode === 'change' || mode === 'series') && _mvData) {
      if (_mvData.date !== newDate || String(_mvData.time) !== newTime) {
        bad(T('강사 확인이 끝날 때까지 잠깐 기다려 주세요.', 'Wait a moment — checking teachers for the new time.')); mvTeachersLater(r); return;
      }
      if (_mvPick && _mvPick !== curId) {
        swapTo = (_mvData.candidates || []).filter(function (t) { return String(t.id) === _mvPick; })[0] || null;
        if (!swapTo || !_mvData.teacher_change_ok) { bad(T('고른 강사로 바꿀 수 없습니다. 목록을 다시 확인해 주세요.', 'Cannot switch to that teacher. Check the list again.')); return; }
      }
      if (!_mvPick && !(curT && curT.free)) { bad(T('이 시간에 되는 강사를 먼저 골라 주세요.', 'Pick a teacher who is free at this time first.')); return; }
    }
    if (mode === 'series') { mvRunSeries(r, day, reason, swapTo, curT); return; }
    var swapLine = swapTo
      ? T('\n· 담당 강사: ' + ((curT && (curT.display_name || curT.name)) || '—') + ' → ' + (swapTo.display_name || swapTo.name),
          '\n· Teacher: ' + ((curT && (curT.display_name || curT.name)) || '—') + ' → ' + (swapTo.display_name || swapTo.name))
      : '';
    /* 💰 연기를 시작 30분보다 이르게 하면 서버가 «사전 연기»(fee_type='free')로 매기고
       급여가 «사전 연기 지급률»(기본 0)을 따른다 — manager.html 과 같은 경고. */
    var mins = (typeof r.start_ts === 'number' && r.start_ts > 0) ? Math.round((r.start_ts - Date.now()) / 60000) : null;
    var feeWarn = (mode === 'postpone' && mins !== null && mins > 30)
      ? T('\n\n⚠ «사전 연기» 로 기록됩니다 (시작 30분보다 이름).\n   이 수업의 강사 수업료가 급여 규칙 «사전 연기 지급률» 을 따릅니다 — 0원일 수 있습니다.',
          '\n\n⚠ Recorded as an EARLY postponement (more than 30 min before).\n   Teacher pay for this class follows «postponed_early_pay_percent» — it may be 0.')
      : '';
    var ask = mode === 'cancel'
      ? T('이 수업을 취소할까요?\n\n' + who + ' · ' + when + '\n\n· 목록에서 사라집니다.\n· 되돌리려면 시간표에서 직접 고쳐야 합니다.',
          'Cancel this class?\n\n' + who + ' · ' + when + '\n\n· It disappears from the lists.\n· To undo it you must fix it in the timetable.')
      : mode === 'change'
      ? T('이번 한 번만 옮길까요? (지정한 날짜로 연기)\n\n' + who + '\n' + when + '  →  ' + newDate + ' ' + newTime + '\n\n· 다음 회부터는 원래 시간표 그대로입니다.\n· 그 시간에 다른 수업이 있으면 안 옮기고 알려 드립니다.' + swapLine,
          'Move just this one class? (postpone to a date)\n\n' + who + '\n' + when + '  →  ' + newDate + ' ' + newTime + '\n\n· Later classes keep the usual timetable.\n· If that slot is taken it will not move — you will be told.' + swapLine)
      : T('이 수업을 연기할까요?\n\n' + who + ' · ' + when + '\n\n· 수업이 «연기» 상태가 됩니다. 새 날짜는 나중에 잡습니다.',
          'Postpone this class?\n\n' + who + ' · ' + when + '\n\n· The class becomes «postponed». Pick a new date later.') + feeWarn;
    if (!window.confirm(ask)) return;
    go.disabled = true;
    msg.style.color = '#475467'; msg.textContent = T('처리 중...', 'Sending...');
    var me = mvMe();
    var nm = (me && (me.name || me.uid)) || '';
    var unlock = function () { go.disabled = false; };
    var sid = Number(r.schedule_id);
    var p;
    if (mode === 'cancel') {
      p = mvReq('DELETE', '/api/admin/class-schedules/' + encodeURIComponent(sid), { reason: reason || undefined }).then(function (res) {
        if (!res.j || res.j.ok !== true) {
          bad(res.st === 403 ? T('수업 «취소» 는 본사 계정에서 합니다.', 'Cancelling a class is done by an HQ account.') : mvErrOf(res.st, res.j));
          unlock(); return;
        }
        _mvChanged = true;
        msg.style.color = '#047857'; msg.textContent = T('취소했습니다. (닫으면 목록을 다시 불러옵니다)', 'Cancelled. (Closing reloads the list)');
      });
    } else {
      /* 강사 변경 → 옮기기 순서. 옮기기 승인(/decide)의 겹침 검사는 «그 행의 담당 강사» 로 재므로
         강사를 먼저 바꿔야 새 강사 기준으로 잰다. 옮기지 못하면 강사를 원래대로 되돌린다
         (반쪽 — «강사만 바뀌고 시간은 그대로» — 을 남기지 않는다). */
      var patchTeacher = function (tid) {
        return mvReq('PATCH', '/api/admin/class-schedules/' + encodeURIComponent(sid), { teacher_id: String(tid) });
      };
      var pre = swapTo ? patchTeacher(swapTo.id) : Promise.resolve({ st: 200, j: { ok: true } });
      p = pre.then(function (pt) {
        if (!pt.j || pt.j.ok !== true) {
          bad((pt.st === 403 ? T('담당 강사 변경은 본사 계정에서 합니다.', 'Changing the teacher is done by an HQ account.') : mvErrOf(pt.st, pt.j))
            + ' ' + T('(아무것도 바꾸지 않았습니다)', '(Nothing was changed)'));
          unlock(); return;
        }
        if (swapTo) _mvChanged = true;
        var rollback = function (why) {
          if (!swapTo || !curId) { bad(why); unlock(); return; }
          return patchTeacher(curId).then(function (rb) {
            bad(why + ' ' + ((rb.j && rb.j.ok === true)
              ? T('담당 강사는 원래대로 되돌렸습니다.', 'The teacher was switched back.')
              : T('⚠ 담당 강사를 원래대로 되돌리지 못했습니다 — 시간표에서 확인해 주세요.', '⚠ Could not switch the teacher back — check the timetable.')));
            unlock();
          });
        };
        return mvReq('POST', '/api/admin/schedule-requests', {
        schedule_id: sid,
        request_type: mode === 'change' ? 'change' : 'postpone',
        requester_role: 'admin',
        requester_name: nm || undefined,
        teacher_name: (swapTo && (swapTo.display_name || swapTo.name)) || r.teacher_name || nm || T('관리자', 'admin'),
        student_name: r.student_name || r.student_uid || undefined,
        student_uid: r.student_uid || undefined,
        new_date: mode === 'change' ? newDate : undefined,
        new_time: mode === 'change' ? newTime : undefined,
        reason: reason || undefined
      }).then(function (mk) {
        if (!mk.j || mk.j.ok !== true || !mk.j.id) { return rollback(mvErrOf(mk.st, mk.j)); }
        return mvReq('POST', '/api/admin/schedule-requests/decide', { id: Number(mk.j.id), action: 'approve', decided_by: nm || undefined }).then(function (res) {
          _mvChanged = true;
          if (!res.j || res.j.ok !== true) {
            return rollback(mvErrOf(res.st, res.j) + ' ' + T('요청은 저장됐습니다 — 「수업 연기·변경 요청」에서 승인해 주세요.',
                                                  'The request is saved — approve it in the schedule requests.'));
          }
          var m = mvMsgOf(res.j);
          /* 강사까지 바꿨는데 «옮겨지지» 않았으면(겹침·반복) 강사를 되돌린다. */
          if (swapTo && res.j.applied !== 'moved') return rollback(m.s);
          msg.style.color = m.ok ? '#047857' : '#92400e';
          msg.textContent = m.s + (swapTo ? ' ' + T('담당 강사: ', 'Teacher: ') + (swapTo.display_name || swapTo.name) + '.' : '')
            + ' ' + T('(닫으면 목록을 다시 불러옵니다)', '(Closing reloads the list)');
        });
      });
      });
    }
    p.catch(function () { bad(T('연결이 끊겼습니다. 다시 눌러 주세요.', 'Network error. Try again.')); unlock(); });
  }
  window.mangoiMoveModal = { open: tcOpenMoveModal, close: tcMoveModalClose };
})();
