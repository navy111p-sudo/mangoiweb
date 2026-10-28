/* 📵 adm-phone-gaps.js — «번호 없는 학생» 목록과 그 자리 입력 (2026-10-28)
 *
 * [무엇] 다음 N일 «아직 안내 문자가 나갈» 수업이 있는데 «수업 30분 전 안내 문자» 가 갈 번호가 없는 학생을 보여 주고,
 *        그 줄에서 바로 학부모·학생 번호를 넣게 한다.
 *   · 목록 = GET /api/admin/student/phone-gaps (판정 정본 src/phone-gaps.ts — 리마인더와 같은 규칙·같은 번호 판정)
 *   · 저장 = 기존 PATCH /api/admin/student/:uid/contact (→ student_erp_override — 야간 동기화가 못 덮는 자리)
 * ⛔ 판정을 여기서 다시 하지 않는다 — «누가 못 받는가» 는 서버만 안다. 화면은 그리기만 한다.
 * ⛔ «참고 번호»(카페24 이탈위험 표)를 칸에 자동으로 넣지 않는다 — 누구 번호인지(학생/학부모) 모른다.
 * ⛔ 빈 칸은 보내지 않는다 — 그 PATCH 는 빈 문자열을 «지우겠다» 로 읽는다(남은 번호가 지워진다).
 * ⚠️ 저장한 뒤 목록을 «다시 불러» 그 학생이 빠졌는지로 확인한다 — 「저장했다」와 「문자가 간다」는 다르다.
 */
(function () {
  'use strict';
  if (window.__pg && window.__pg.__loaded) return;

  function $(id) { return document.getElementById(id); }
  /* 🌐 정본은 window.adminLang (adm-today-classes.js 와 같은 판정). ⛔ 죽은 키 'adminLang' 을 읽지 말 것. */
  function isEn() {
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
  }
  function T(ko, en) { return isEn() ? en : ko; }
  /* 줄 안내는 두 말을 함께 들고 그릴 때 고른다 — 저장 «그때» 의 언어로 굳히면 🌐 를 눌러도 그 줄만 옛 말로 남는다. */
  function pair(ko, en) { return { ko: ko, en: en }; }
  function txt(m) { return !m ? '' : (typeof m === 'string' ? m : (isEn() ? m.en : m.ko)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var MIN_DIGITS = 10;   // 리마인더 문자 문턱(서버 SMS_MIN_DIGITS 와 같다 — deliverLessonReminder 의 `normalized.length < 10`)
  var DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
  var DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** 숫자만 남긴다(하이픈·공백 허용). */
  function digits(v) { return String(v == null ? '' : v).replace(/[^0-9]/g, ''); }

  /** 입력 한 칸 판정 — '' = 비움(안 보냄) · 'ok' · 'short' · 'bad'. */
  function checkPhone(v) {
    var raw = String(v == null ? '' : v).trim();
    if (!raw) return '';
    if (/[^0-9+\-\s().]/.test(raw)) return 'bad';
    return digits(raw).length >= MIN_DIGITS ? 'ok' : 'short';
  }

  /** PATCH 본문 — 채운 칸만 싣는다. 둘 다 비면 null(보내지 않음). */
  function buildBody(parentVal, studentVal) {
    var b = {};
    if (checkPhone(parentVal) === 'ok') b.parent_phone = String(parentVal).trim();
    if (checkPhone(studentVal) === 'ok') b.student_phone = String(studentVal).trim();
    return (b.parent_phone || b.student_phone) ? b : null;
  }

  /** 다음 수업 칸 — 「10/29(수) 16:00 · 이번 7일 3회」. */
  function fmtNext(g, days) {
    var d = String(g.next_date || ''), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    var day = '';
    if (m) {
      var dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
      day = (+m[2]) + '/' + (+m[3]) + '(' + (isEn() ? DOW_EN[dow] : DOW_KO[dow]) + ')';
    }
    var t = String(g.next_time || '').slice(0, 5);
    var n = Number(g.classes) || 0;
    return (day + (t ? ' ' + t : '')).trim() + ' · ' + T('이번 ' + days + '일 ' + n + '회', n + ' in ' + days + ' days');
  }

  function statusText(g) {
    if (g.status === 'short') return T('⚠️ 번호가 ' + (Number(g.short_len) || 0) + '자리라 문자가 안 감',
      '⚠️ Number has only ' + (Number(g.short_len) || 0) + ' digits — no text sent');
    return T('📵 번호 없음 — 문자 안 감', '📵 No number — no text sent');
  }

  /** 목록 위 안내 줄 — 사실만. */
  function summaryLines(r) {
    var out = [];
    var gaps = (r && r.gaps) || [];
    out.push(T(
      '다음 ' + r.days + '일(' + r.from + ' ~ ' + r.to + ') 아직 안내 문자가 나갈 수업이 있는 학생 ' + r.students + '명 중 문자가 갈 학생 ' + r.reachable + '명 · 번호가 없는 학생 ' + gaps.length + '명',
      'Next ' + r.days + ' days (' + r.from + ' – ' + r.to + '): ' + r.students + ' students with upcoming classes · ' + r.reachable + ' will get a text · ' + gaps.length + ' have no usable number'));
    if (r.complete === false) out.push(T(
      '⚠️ 번호 조회를 일부 못 했습니다 — 이 목록에 «이미 번호가 있는» 학생이 섞여 있을 수 있습니다. 잠시 뒤 다시 불러오세요.',
      '⚠️ Some numbers could not be checked — this list may include students who already have one. Reload in a moment.'));
    if (r.sms_mode && r.sms_mode !== 'real') out.push(T(
      '⚠️ 지금 문자 발송이 꺼져 있습니다(' + r.sms_mode + ') — 번호를 넣어도 실제 문자는 안 갑니다.',
      '⚠️ Texting is off right now (' + r.sms_mode + ') — numbers are saved but no real text goes out.'));
    if (r.reminder_enabled === false) out.push(T(
      '⚠️ 수업 전 안내 문자 스위치가 꺼져 있습니다 — 번호를 넣어도 지금은 안 갑니다.',
      '⚠️ The class reminder switch is off — no reminder goes out even with a number.'));
    if (r.hint_complete === false) out.push(T(
      'ℹ️ 참고 번호(카페24 이탈위험 표)를 읽지 못해 그 칸이 비어 있습니다.',
      'ℹ️ Could not read the reference numbers (cafe24 retention table) — that column is empty.'));
    return out;
  }

  function said(ok, ko, en) { return { ok: ok, text: T(ko, en), ko: ko, en: en }; }
  /** 저장 응답 → 사람에게 할 말. ok=true 면 목록을 다시 불러 확인한다. */
  function saveMsg(st, d) {
    if (st === 401) return said(false, '로그인이 풀렸습니다. 다시 로그인해 주세요.', 'Session expired. Please log in again.');
    if (!d || d.ok !== true) {
      var m = d && (d.message || d.who_line || d.error);
      var mEn = d && (d.message_en || d.who_line_en || m);
      return said(false, '❌ 저장 못 함' + (m ? ' — ' + m : ''), '❌ Not saved' + (mEn ? ' — ' + mEn : ''));
    }
    /* ⚠️ phone_kept:false 는 «직원 입력 칸»(student_erp_override)에 못 적었다는 뜻이다. 이유가 둘이라(① 그 칸 쓰기 실패
       ② 이 아이디로 명부 행을 정확일치로 못 찾음 — 그때는 명부에도 안 적혔다) 서버가 함께 주는
       roster_updated(명부 행이 실제로 바뀌었나 · 모르면 null)로 가른다. 모르면 단정하지 않는다. */
    if (d.phone_kept === false) {
      var mk;
      if (d.roster_updated === false) {
        mk = said(false, '❌ 저장되지 않았습니다 — 이 아이디로 명부를 찾지 못했습니다(수업 예약 아이디와 명부 아이디의 대소문자가 다르거나 명부에 없는 아이디). 이 아이디를 본사 개발 담당에게 알려 주세요.',
          '❌ Not saved — no roster record was found for this ID (the booking ID may differ in upper/lower case, or the ID is not in the roster). Please send this ID to the HQ developer.');
      } else if (d.roster_updated === true) {
        mk = said(true, '⚠️ 명부에는 적었지만 «직원 입력 칸» 에는 못 적었습니다 — 확인 중…', '⚠️ Saved to the roster but not to the staff field — checking…');
      } else {
        mk = said(true, '⚠️ 일부만 저장됐을 수 있습니다 — 확인 중…', '⚠️ May be only partly saved — checking…');
      }
      mk.kept = false; mk.roster = (d.roster_updated === true || d.roster_updated === false) ? d.roster_updated : null;
      return mk;
    }
    var okm = said(true, '✅ 저장했습니다 — 확인 중…', '✅ Saved — checking…'); okm.kept = true; return okm;
  }

  /** 다시 불러온 뒤 그 학생에 대해 할 말 — { row: 줄에 남길 말 | null, flash: 띄울 말 | null }.
   *  ⚠️ «목록에서 빠졌다» 를 «이제 문자가 간다» 로 읽지 않는다 — 수업 시각이 지나도 빠진다.
   *     «이 번호로 간다» 는 직원 입력 칸에 «적힌 것이 확인된»(kept === true) 때만 말한다. */
  function afterReload(m, d, uid) {
    /* ⚠️ 줄이 다시 그려져 사라질 수 있으므로 «한 번 더 저장» 할 곳은 이 화면이 아니라 «학생 상세» 다(같은 저장 API).
       경고(warn)는 초록 성공 상자가 아니라 주황으로, 저절로 안 사라지게 그린다(flash). */
    var redo = pair(' 학생 상세 화면(이 아이디)에서 연락처를 한 번 더 저장해 주세요.', ' Please save the contact once more on the student detail page (this ID).');
    if (!d || d.ok !== true) return { warn: true, row: null, flash: pair(
      '⚠️ ' + uid + ' — 저장 요청은 처리됐지만 목록을 다시 불러오지 못해 확인하지 못했습니다.' +
        (m.kept === false ? ' 다만 «직원 입력 칸» 에는 못 적었습니다 —' + redo.ko : ' 잠시 뒤 [🔄 불러오기]를 눌러 확인해 주세요.'),
      '⚠️ ' + uid + ' — the save went through, but the list could not be reloaded to check it.' +
        (m.kept === false ? ' It was not written to the staff field, though —' + redo.en : ' Press [🔄 Load] in a moment to check.')) };
    var still = (d.gaps || []).some(function (g) { return String(g.uid) === uid; });
    var off = (d.sms_mode && d.sms_mode !== 'real') || d.reminder_enabled === false;
    var offKo = off ? ' (다만 지금은 문자 발송이 꺼져 있어 실제로는 안 갑니다.)' : '';
    var offEn = off ? ' (But texting is off right now, so nothing is actually sent.)' : '';
    if (still && m.kept === false && m.roster !== true) return { row: pair(
      '❌ 문자가 갈 번호로 확인되지 않았습니다 — 명부에서 이 아이디를 못 찾았을 수 있습니다(수업 예약 아이디와 명부 아이디의 대소문자가 다르거나 명부에 없는 아이디). 이 아이디를 본사 개발 담당에게 알려 주세요.',
      '❌ Not confirmed as reachable — the roster may not have this ID (upper/lower case differs from the booking, or it is not in the roster). Please send this ID to the HQ developer.'), flash: null };
    if (still) return { row: pair('⚠️ 저장했는데 아직 문자가 안 갈 번호로 보입니다 — 번호를 다시 확인해 주세요.', '⚠️ Saved, but it still looks unreachable — please check the number.'), flash: null };
    if (m.kept === false) return { warn: true, row: null, flash: m.roster === true ? pair(
      '⚠️ ' + uid + ' — 명부에는 적었지만 «직원 입력 칸» 에는 못 적었습니다. 카페24 가 다른 번호를 주면 그 번호로 바뀝니다 —' + redo.ko + offKo,
      '⚠️ ' + uid + ' — saved to the roster but not to the staff field; if cafe24 sends another number it will replace this one —' + redo.en + offEn) : pair(
      '⚠️ ' + uid + ' — 목록에서는 빠졌지만 «직원 입력 칸» 에는 못 적었습니다. 카페24 가 다른 번호를 주면 그 번호로 바뀝니다 —' + redo.ko + offKo,
      '⚠️ ' + uid + ' — it left the list, but it could not be written to the staff field; if cafe24 sends another number it will replace this one —' + redo.en + offEn) };
    return { row: null, flash: pair(
      '✅ ' + uid + ' — 저장했습니다. 앞으로 수업 30분 전 안내 문자는 이 번호로 갑니다.' + offKo,
      '✅ ' + uid + ' — saved. Upcoming class reminders (30 min before) go to this number.' + offEn) };
  }

  /** 이 목록은 본사·내부직원 전용 — 서버도 403 으로 막는다. 역할을 «모르면» 보여 준다(서버가 최종 판정). */
  function hideFor(role) {
    var r = String(role || '');
    return r === 'teacher' || r === 'branch' || r === 'agency' || r === 'franchise';
  }

  var state = { data: null, busy: null, again: null, loadedOnce: false, msgs: {}, keepTyped: null };

  /* 한 학생 = 한 줄 상자. 표(table)로 그리면 칸 7개가 1,081px 를 요구해 PC(1440 창 · 실제 칸 624px)에서
     [💾 저장]이 상자 «오른쪽 밖» 으로 밀린다(2026-10-28 브라우저 실측) — 그래서 «학생 정보» 와 «번호 넣기» 두 덩이를
     flex-wrap 으로 두어 좁으면 아래로 내려가게 한다(폰도 같은 모양). */
  function rowHtml(g, days) {
    var uid = String(g.uid || '');
    var hint = g.hint_phone
      ? '<div class="pg-hint" style="font-size:11px;margin-top:3px">ℹ️ ' + esc(T('참고: ', 'Ref: ')) + '<b>' + esc(g.hint_phone) + '</b> — ' +
        esc(T('카페24 이탈위험 표의 번호(학생/학부모 구분 없음). 확인한 뒤 넣으세요.', 'from the cafe24 retention table (student/parent not recorded). Confirm before entering.')) + '</div>'
      : '';
    var msg = txt(state.msgs[uid]);
    return '<div class="pg-row" data-uid="' + esc(uid) + '" style="display:flex;flex-wrap:wrap;gap:6px 14px;align-items:flex-start;padding:8px 4px;border-top:1px solid rgba(148,163,184,0.35)">' +
      '<div class="pg-info" style="flex:1 1 230px;min-width:0;font-size:12.5px;line-height:1.5">' +
        '<a href="/admin/student.html?uid=' + encodeURIComponent(uid) + '" target="_blank" rel="noopener"><b>' + esc(g.name || uid) + '</b></a>' +
        ' <span style="font-size:11px">(' + esc(uid) + ')</span>' +
        '<div style="font-size:12px">📅 ' + esc(fmtNext(g, days)) + '</div>' +
        '<div style="font-size:12px">' + esc(statusText(g)) + '</div>' + hint +
      '</div>' +
      '<div class="pg-edit" style="flex:1 1 330px;min-width:0;display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
        '<input type="tel" class="pg-in" data-role="parent" inputmode="tel" autocomplete="off" style="box-sizing:border-box;width:150px;max-width:100%" placeholder="' + esc(T('학부모 번호', 'Parent no.')) + '" aria-label="' + esc(T('학부모 번호', 'Parent phone')) + '">' +
        '<input type="tel" class="pg-in" data-role="student" inputmode="tel" autocomplete="off" style="box-sizing:border-box;width:150px;max-width:100%" placeholder="' + esc(T('학생 번호', 'Student no.')) + '" aria-label="' + esc(T('학생 번호', 'Student phone')) + '">' +
        '<button type="button" class="primary pg-save" style="padding:4px 10px;font-size:12px">' + esc(T('💾 저장', '💾 Save')) + '</button>' +
        '<div class="pg-msg" style="flex:1 1 100%;font-size:11px;white-space:normal">' + esc(msg) + '</div>' +
      '</div>' +
    '</div>';
  }

  /* ⌨️ 다시 그려도 «쓰다 만» 번호는 남긴다 — 한 줄을 저장하면 목록을 다시 불러 표를 통째로 다시 그리는데,
     그때 아직 저장 안 한 다른 줄의 입력이 사라지면 «넣었는데 없어졌다» 가 된다(언어 바꾸기도 같다). */
  function typedNow() {
    var out = {}, body = $('pg-body');
    if (!body) return out;
    var ins = body.querySelectorAll('.pg-row[data-uid] .pg-in');
    for (var i = 0; i < ins.length; i++) {
      var v = ins[i].value;
      if (!v) continue;
      var tr = ins[i].closest('.pg-row'), uid = tr ? tr.getAttribute('data-uid') : '';
      if (!uid) continue;
      (out[uid] = out[uid] || {})[ins[i].getAttribute('data-role')] = v;
    }
    return out;
  }
  function restoreTyped(typed) {
    var body = $('pg-body');
    if (!body) return;
    var rows = body.querySelectorAll('.pg-row[data-uid]');
    for (var i = 0; i < rows.length; i++) {
      var t = typed[rows[i].getAttribute('data-uid')];
      if (!t) continue;
      var ins = rows[i].querySelectorAll('.pg-in');
      for (var j = 0; j < ins.length; j++) {
        var role = ins[j].getAttribute('data-role');
        if (t[role] != null) ins[j].value = t[role];
      }
    }
  }

  function render() {
    var body = $('pg-body'), cnt = $('pg-count');
    if (!body) return;
    var r = state.data;
    if (!r) return;
    var typed = state.keepTyped || {}, nowT = typedNow();
    for (var k in nowT) if (Object.prototype.hasOwnProperty.call(nowT, k)) typed[k] = nowT[k];
    state.keepTyped = null;
    if (r.ok !== true) {
      body.innerHTML = '<div class="empty">' + esc(txt(r.__err) || T('목록을 못 불러왔습니다 — 잠시 뒤 다시 불러오세요.', 'Could not load the list — try again shortly.')) + '</div>';
      if (cnt) cnt.textContent = '';
      state.keepTyped = typed;   // 목록이 다시 그려질 때 적던 번호를 되살린다(오류 화면이 입력칸을 지운다)
      return;
    }
    var gaps = r.gaps || [];
    var lines = summaryLines(r).map(function (t) { return '<div style="margin:2px 0">' + esc(t) + '</div>'; }).join('');
    if (cnt) cnt.textContent = T(gaps.length + '명', gaps.length + ' students');
    if (!gaps.length) {
      body.innerHTML = '<div style="font-size:12px;line-height:1.6;margin-bottom:6px">' + lines + '</div>' +
        '<div class="empty">' + esc(r.students
          ? T('🎉 다가올 수업이 있는 학생 모두 문자를 받을 번호가 있습니다.', '🎉 Every student with an upcoming class has a number for the reminder.')
          : T('이 기간에 안내 문자가 나갈 수업이 있는 학생이 없습니다(이미 지난 수업은 세지 않습니다).', 'No students have upcoming classes in this period (past classes are not counted).')) + '</div>';
      return;
    }
    body.innerHTML = '<div style="font-size:12px;line-height:1.6;margin-bottom:6px">' + lines + '</div>' +
      '<div class="pg-list">' + gaps.map(function (g) { return rowHtml(g, r.days); }).join('') + '</div>';
    restoreTyped(typed);
  }

  function load() {
    /* 이미 불러오는 중이면 «그다음 한 번» 을 예약하고 그 결과를 돌려준다 — 저장이 겹쳐도(줄 A 를 다시 불러오는 사이
       줄 B 가 끝남) B 의 «목록에서 빠졌나» 확인이 조용히 죽지 않게(load() 가 undefined 를 주면 .then 이 던진다). */
    if (state.busy) {
      if (!state.again) state.again = state.busy.then(function () { state.again = null; return load(); });
      return state.again;
    }
    var sel = $('pg-days');
    var days = sel ? (Number(sel.value) || 7) : 7;
    var btn = $('pg-load'); if (btn) btn.disabled = true;
    var body = $('pg-body');
    if (body && !state.data) { state.keepTyped = typedNow(); body.innerHTML = '<div class="empty">' + esc(T('불러오는 중…', 'Loading…')) + '</div>'; }
    var p = fetch('/api/admin/student/phone-gaps?days=' + days, { credentials: 'include', cache: 'no-store' })
      .then(function (res) {
        return res.json().catch(function () { return null; }).then(function (d) {
          if (res.status === 403) {
            state.data = { ok: false, __err: (d && d.who_line ? pair(d.who_line, d.who_line_en || d.who_line) : null)
              || (d && d.error === 'scope_unknown' ? pair('권한을 확인하지 못했습니다 — 잠시 뒤 다시 불러오세요.', 'Could not check your permission — try again shortly.') : null)
              || pair('본사 계정에서만 볼 수 있습니다.', 'Only HQ accounts can see this list.') };
          } else if (!res.ok || !d || d.ok !== true || !Array.isArray(d.gaps)) {
            state.data = { ok: false };
          } else {
            state.data = d;
          }
          state.loadedOnce = true;
          render();
          return state.data;
        });
      })
      .catch(function () { state.data = { ok: false }; render(); return state.data; })
      .then(function (d) { state.busy = null; if (btn) btn.disabled = false; return d; });
    state.busy = p;
    return p;
  }

  function save(tr) {
    var uid = tr.getAttribute('data-uid') || '';
    var pIn = tr.querySelector('.pg-in[data-role="parent"]');
    var sIn = tr.querySelector('.pg-in[data-role="student"]');
    var msgEl = tr.querySelector('.pg-msg');
    var say = function (m) { state.msgs[uid] = m; if (msgEl) msgEl.textContent = txt(m); };
    var pv = pIn ? pIn.value : '', sv = sIn ? sIn.value : '';
    var cp = checkPhone(pv), cs = checkPhone(sv);
    if (cp === 'bad' || cs === 'bad') return say(pair('숫자와 하이픈(-)만 넣어 주세요.', 'Use digits and hyphens only.'));
    if (cp === 'short' || cs === 'short') return say(pair('번호가 ' + MIN_DIGITS + '자리보다 짧으면 문자가 안 갑니다.', 'Numbers shorter than ' + MIN_DIGITS + ' digits cannot get a text.'));
    var b = buildBody(pv, sv);
    if (!b) return say(pair('학부모나 학생 번호 중 하나를 넣어 주세요.', 'Enter a parent or student number.'));
    var btn = tr.querySelector('.pg-save'); if (btn) btn.disabled = true;
    say(pair('저장 중…', 'Saving…'));
    return fetch('/api/admin/student/' + encodeURIComponent(uid) + '/contact', {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (d) { return saveMsg(res.status, d); });
    }).catch(function () {
      return said(false, '❌ 연결이 끊겨 저장 못 함 — 다시 눌러 주세요.', '❌ Connection lost — not saved. Try again.');
    }).then(function (m) {
      say(m.ko != null ? pair(m.ko, m.en) : m.text);
      if (btn) btn.disabled = false;
      if (!m.ok) return m;
      /* 저장 → 다시 불러 «그 학생이 목록에서 빠졌나» 로 확인한다(발송 정본으로 다시 잰 값). */
      delete state.msgs[uid];
      return load().then(function (d) {
        var a = afterReload(m, d, uid);
        if (a.row) { state.msgs[uid] = a.row; render(); }
        if (a.flash) flash(txt(a.flash), a.warn);
        return m;
      });
    });
  }

  /* 성공은 초록·8초 뒤 사라짐 · 경고(warn)는 주황·사람이 다시 저장하거나 불러올 때까지 남김(할 일이 남은 말이라서).
     색은 background-color 로 쓴다 — background: 인라인은 관리자 옛 다크 규칙에 걸릴 수 있다(CLAUDE.md 2장). */
  function flash(t, warn) {
    var el = $('pg-flash');
    if (!el) return;
    el.textContent = t;
    el.style.display = '';
    el.style.color = warn ? '#92400e' : '#065f46';
    el.style.backgroundColor = warn ? 'rgba(245,158,11,0.14)' : 'rgba(16,185,129,0.12)';
    el.style.borderColor = warn ? 'rgba(245,158,11,0.45)' : 'rgba(16,185,129,0.35)';
    el.setAttribute('data-warn', warn ? '1' : '0');
    clearTimeout(flash._t);
    if (!warn) flash._t = setTimeout(function () { el.style.display = 'none'; }, 8000);
  }

  function applyRole() {
    var sec = $('sm-phone-gaps');
    if (!sec) return;
    var me = window.__ADM_ME;
    /* ⚠️ 인라인 display 로 감추지 말 것 — PC(≥1024px)에서 #legacy-cards details{display:block!important} 가 이긴다
       (2026-10-28 브라우저 실측: 인라인 none · 계산값 block). 그 복구 규칙을 이기는 .rbac-hide 로 감춘다(CLAUDE.md 2장). */
    sec.classList.toggle('rbac-hide', !!(me && hideFor(me.role)));
  }

  function wire() {
    var sec = $('sm-phone-gaps');
    if (!sec || sec.__pgWired) return;
    sec.__pgWired = true;
    var btn = $('pg-load');
    if (btn) btn.addEventListener('click', function () { load(); });
    var sel = $('pg-days');
    if (sel) sel.addEventListener('change', function () { state.data = null; load(); });
    sec.addEventListener('toggle', function () { if (sec.open && !state.loadedOnce) load(); });
    sec.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.pg-save') : null;
      if (!b) return;
      var tr = b.closest('.pg-row');
      if (tr) save(tr);
    });
    sec.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var inp = e.target && e.target.closest ? e.target.closest('.pg-in') : null;
      if (!inp) return;
      e.preventDefault();
      var tr = inp.closest('.pg-row');
      if (tr) save(tr);
    });
    applyRole();
  }

  /* 🌐 언어를 바꾸면 다시 그린다 — 관리자 화면은 document 에서, 다른 화면은 window 에서 쏜다(CLAUDE.md 2장). */
  function onLang() { if (state.data) render(); }
  document.addEventListener('mangoi:lang-changed', onLang);
  window.addEventListener('mangoi:lang-changed', onLang);
  document.addEventListener('mangoi:identity', applyRole);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  window.__pg = {
    __loaded: true, checkPhone: checkPhone, buildBody: buildBody, fmtNext: fmtNext, statusText: statusText,
    summaryLines: summaryLines, saveMsg: saveMsg, afterReload: afterReload, hideFor: hideFor, digits: digits, load: load, save: save,
    render: render, _state: state, MIN_DIGITS: MIN_DIGITS,
  };
})();
