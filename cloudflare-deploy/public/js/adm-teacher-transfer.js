// ═══════════════════════════════════════════════════════════════════════════
// adm-teacher-transfer.js — 강사 «📦 남은 수업 넘기기» 창 (2026-11-05)
//
// 왜
//   매니저 제보: 「Krystel 을 강사 명부에서 퇴사로 바꿨는데 수업이 그대로 남아 있다.
//   오늘 시간표에 KRYSTEL 과 Teacher Krystel 두 이름이 있다.」
//   «퇴사» 는 명부·원부·카페24 미러만 바꾸고 «이미 잡힌 수업» 은 옮기지 않는다.
//   그 수업을 강사별로 하나씩 📅 Move 로 옮기던 것을 한 창에서 끝내게 한다.
//
// 무엇을 하나
//   ① 그 강사의 «앞으로 남은» 망고아이 수업(KRYSTEL 처럼 원부 이름으로 보이는 줄)
//   ② 카페24 예약 건수(Teacher Krystel 처럼 카페24 이름으로 보이는 줄) — 여기서는 못 바꾼다, 카페24에서
//   ③ 넘겨받을 강사를 고르면 줄마다 «넘길 수 있음 / 못 넘김(사유)» 을 서버가 미리 판정 → 고른 줄만 넘긴다
//
// ⛔ 판정·저장을 여기서 하지 않는다 — 서버 정본 src/teacher-class-transfer.ts 가 하고,
//    실제 저장은 기존 «담당 강사 변경» 엔진(moveSchedulesAtomically)이 한다(본사 전용·겹침 검사·감사 기록).
// ⛔ 이 창의 요소에 data-ko/data-en 을 달지 않는다 — i18n 엔진이 textContent 를 통째로 갈아끼운다
//    (CLAUDE.md 2장). 열 때의 언어로 그리고, 다시 열면 다시 그린다.
// 입구: 강사 명부 상태 메뉴의 «📦 남은 수업 넘기기», 그리고 상태를 퇴사·비활동으로 바꾼 직후(남은 수업이 있을 때만).
// 되돌리기 = admin.html 의 이 파일 <script> 한 줄 + adm-core.js 의 tpOpenClassTransfer 호출 두 곳 제거.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  /* 🌐 정본은 window.adminLang(adm-core.js 의 var adminLang 과 같은 바인딩). ⛔ localStorage 'adminLang' 은 죽은 키. */
  function isEn() {
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e) { return false; }
  }
  function T(ko, en) { return isEn() ? en : ko; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var DOW_KO = { Sun: '일', Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금', Sat: '토' };
  /* 상태 값은 서버 정본(teacher-status.ts)의 한국어 글자 — 영어 화면에서는 이 표로만 바꿔 보여 준다(저장값은 그대로). */
  var STATUS_EN = { '활동중': 'Active', '비활동': 'Inactive', '퇴사': 'Resigned' };
  var KIND = {
    enroll: ['수강등록', 'Enrollment'],
    mirror: ['카페24 복사본', 'cafe24 copy'],
    other: ['기타', 'Other']
  };
  /* 서버 사유 코드 → 화면 글자. 한국어는 서버 message 를 그대로 쓰고, 영어는 코드로 고른다. */
  var WHY_EN = {
    conflict: 'Time clash with another class',
    teacher_unavailable: 'Teacher unavailable / on vacation at this time',
    availability_unknown: 'Could not check — fix the class time first'
  };

  var S = null;   // { pid, data, to, busy, msg, fromStatus }

  async function post(pid, body) {
    try {
      var r = await fetch('/api/admin/teacher-profiles/' + encodeURIComponent(pid), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      var d = await r.json().catch(function () { return {}; });
      /* ✅ «성공이라고 말했는가» 로 판정 — 종단 404 본문에는 ok 칸이 없다(CLAUDE.md 2장). */
      return { http: r.status, ok: r.ok && d && d.ok === true, d: d || {} };
    } catch (e) {
      return { http: 0, ok: false, d: { message: String(e) } };
    }
  }

  function close() {
    var ov = document.getElementById('tpx-ov');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.removeEventListener('keydown', onKey, true);
    S = null;
  }
  function onKey(e) { if (e && e.key === 'Escape' && S && !S.busy) close(); }

  function shell() {
    var ov = document.getElementById('tpx-ov');
    if (ov) return ov.querySelector('#tpx-box');
    ov = document.createElement('div');
    ov.id = 'tpx-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background-color:rgba(15,23,42,.45);display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto';
    var box = document.createElement('div');
    box.id = 'tpx-box';
    box.style.cssText = 'background-color:#fff;color:#0f172a;border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.25);width:100%;max-width:780px;padding:18px 18px 14px;font-size:13px;line-height:1.55;box-sizing:border-box';
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov && S && !S.busy) close(); });
    box.addEventListener('click', onClick);
    box.addEventListener('change', onChange);
    document.body.appendChild(ov);
    document.addEventListener('keydown', onKey, true);
    return box;
  }

  function whenTxt(r) {
    if (r.weekly) {
      var d = String(r.day_of_week || '');
      return T('매주 ' + (DOW_KO[d] || d) + '요일', 'Every ' + d);
    }
    return String(r.date || '').slice(5).replace('-', '/');
  }

  function btn(id, label, primary, disabled) {
    return '<button type="button" id="' + id + '"' + (disabled ? ' disabled' : '') + ' style="cursor:' + (disabled ? 'default' : 'pointer')
      + ';font:inherit;font-weight:800;border-radius:9px;padding:7px 14px;border:1px solid ' + (primary ? '#1d4ed8' : '#cbd5e1')
      + ';background-color:' + (primary ? (disabled ? '#93c5fd' : '#2563eb') : '#fff') + ';color:' + (primary ? '#fff' : '#0f172a') + '">'
      + esc(label) + '</button>';
  }

  function render() {
    var box = shell();
    if (!S) return;
    var d = S.data;
    var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
      + '<div style="font-size:16px;font-weight:900;flex:1">📦 ' + esc(T('남은 수업 넘기기', 'Hand over remaining classes'))
      + (d && d.profile ? ' — ' + esc(d.profile.name || '') : '') + '</div>'
      + btn('tpx-close', T('닫기', 'Close'), false, !!S.busy) + '</div>';
    if (!d) {
      box.innerHTML = h + '<div style="padding:16px 0;color:#475569">' + esc(S.msg || T('불러오는 중…', 'Loading…')) + '</div>';
      return;
    }
    var sum = d.summary || {}, bk = sum.by_kind || {}, c24 = d.cafe24 || {};
    var tName = (d.teacher && d.teacher.name) || '';
    if (S.fromStatus) {
      h += '<div style="background-color:#fff7ed;border:1px solid #fdba74;color:#7c2d12;border-radius:10px;padding:8px 10px;margin-bottom:10px">'
        + esc(T('상태를 «' + S.fromStatus + '» 로 바꿨습니다. 이미 잡힌 수업은 자동으로 옮겨지지 않습니다 — 아래에서 넘겨 주세요.',
                'Status changed to «' + (STATUS_EN[S.fromStatus] || S.fromStatus) + '». Classes already booked are NOT moved automatically — hand them over below.'))
        + '</div>';
    }
    h += '<div style="color:#475569;margin-bottom:10px">'
      + esc(T('같은 강사가 두 시스템에 따로 적혀 있습니다: 망고아이 «' + (tName || '—') + '» · 카페24 «' + ((c24.names || []).join(', ') || '—') + '».',
              'The same teacher appears under two names: Mangoi «' + (tName || '—') + '» · cafe24 «' + ((c24.names || []).join(', ') || '—') + '».'))
      + '</div>';

    // ── ① 망고아이 ──
    h += '<div style="font-weight:900;font-size:14px;margin:6px 0 4px">① ' + esc(T('망고아이 수업 ' + (sum.total || 0) + '건 — 여기서 넘길 수 있습니다',
                                                                            'Mangoi classes: ' + (sum.total || 0) + ' — can be handed over here')) + '</div>';
    if (sum.total) {
      h += '<div style="color:#475569;margin-bottom:6px">'
        + esc(T(KIND.enroll[0] + ' ' + (bk.enroll || 0) + ' · ' + KIND.mirror[0] + ' ' + (bk.mirror || 0) + ' · ' + KIND.other[0] + ' ' + (bk.other || 0)
                + (sum.weekly ? ' · 매주 반복 ' + sum.weekly : '') + ' · 학생 ' + (sum.students || 0) + '명'
                + (sum.first_date ? ' · ' + sum.first_date + ' ~ ' + (sum.last_date || '') : ''),
                KIND.enroll[1] + ' ' + (bk.enroll || 0) + ' · ' + KIND.mirror[1] + ' ' + (bk.mirror || 0) + ' · ' + KIND.other[1] + ' ' + (bk.other || 0)
                + (sum.weekly ? ' · weekly ' + sum.weekly : '') + ' · ' + (sum.students || 0) + ' student(s)'
                + (sum.first_date ? ' · ' + sum.first_date + ' ~ ' + (sum.last_date || '') : '')))
        + '</div>';
      var opts = '<option value="">' + esc(T('— 넘겨받을 강사 고르기 —', '— Choose the new teacher —')) + '</option>'
        + (d.targets || []).map(function (t) {
          return '<option value="' + esc(t.id) + '"' + (S.to === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>';
        }).join('');
      h += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:6px 0 8px">'
        + '<label for="tpx-to" style="font-weight:800">' + esc(T('넘겨받을 강사', 'New teacher')) + '</label>'
        + '<select id="tpx-to"' + (S.busy ? ' disabled' : '') + ' style="font:inherit;padding:6px 8px;border-radius:8px;border:1px solid #cbd5e1;background-color:#fff;color:#0f172a;min-width:180px">' + opts + '</select>'
        + (d.to ? '<span style="color:#047857;font-weight:800">' + esc(T('넘길 수 있음 ' + (d.movable || 0) + ' / ' + sum.total + '건', 'Movable ' + (d.movable || 0) + ' / ' + sum.total)) + '</span>'
            + (d.group_count ? ' <span style="color:#b45309;font-weight:800">' + esc(T('· 묶음 주의 ' + d.group_count + '건(기본 제외)', '· ' + d.group_count + ' would become group (unchecked)')) + '</span>' : '') : '')
        + '</div>';
      h += '<div style="max-height:300px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px">'
        + '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'
        + '<thead><tr style="background-color:#f8fafc">'
        + '<th style="padding:6px;text-align:left;width:28px"><input type="checkbox" id="tpx-all"' + (d.to ? '' : ' disabled') + ' aria-label="' + esc(T('전체 선택', 'Select all')) + '"></th>'
        + '<th style="padding:6px;text-align:left">' + esc(T('날짜', 'Date')) + '</th>'
        + '<th style="padding:6px;text-align:left">' + esc(T('시간', 'Time')) + '</th>'
        + '<th style="padding:6px;text-align:left">' + esc(T('학생', 'Student')) + '</th>'
        + '<th style="padding:6px;text-align:left">' + esc(T('구분', 'Type')) + '</th>'
        + '<th style="padding:6px;text-align:left">' + esc(T('판정', 'Check')) + '</th>'
        + '</tr></thead><tbody>';
      (d.rows || []).forEach(function (r) {
        var ok = d.to && r.verdict === 'ok';
        var grp = d.to && r.verdict === 'group';
        var mark = !d.to ? '<span style="color:#94a3b8">—</span>'
          : ok ? '<span style="color:#047857;font-weight:800">✓ ' + esc(T('가능', 'OK')) + '</span>'
          : grp ? '<span style="color:#b45309;font-weight:800">⚠ ' + esc(T('묶음(그룹) 수업이 됩니다 — 같은 시각: ', 'Would become a group class — same time: ') + (r.group_with || []).join(', ')) + '</span>'
          : '<span style="color:#b42318;font-weight:800">✕ ' + esc(isEn() ? (WHY_EN[r.reason] || 'Cannot move') : (r.message || '못 넘김')) + '</span>';
        /* 👥 'group' 은 기본으로 «빼 둔다» — 사람이 체크해야만 넘긴다(1:1 수업이 조용히 그룹이 되지 않게). */
        var checked = ok ? !(S.unchecked && S.unchecked[r.id]) : (grp ? !!(S.groupOn && S.groupOn[r.id]) : false);
        h += '<tr style="border-top:1px solid #f1f5f9">'
          + '<td style="padding:5px 6px"><input type="checkbox" class="tpx-pick" data-id="' + esc(r.id) + '"' + (ok || grp ? '' : ' disabled') + (checked ? ' checked' : '') + '></td>'
          + '<td style="padding:5px 6px;white-space:nowrap">' + esc(whenTxt(r)) + '</td>'
          + '<td style="padding:5px 6px;white-space:nowrap">' + esc(r.start_time || '') + '</td>'
          + '<td style="padding:5px 6px">' + esc(r.student_name ? (r.student_name + ' (' + (r.user_id || '') + ')') : (r.user_id || '')) + '</td>'
          + '<td style="padding:5px 6px;white-space:nowrap">' + esc(T((KIND[r.kind] || KIND.other)[0], (KIND[r.kind] || KIND.other)[1])) + '</td>'
          + '<td style="padding:5px 6px">' + mark + '</td></tr>';
      });
      h += '</tbody></table></div>';
      var nSel = selectedIds().length;
      h += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px">'
        + btn('tpx-go', d.to ? T('✓ 선택한 ' + nSel + '건을 ' + d.to.name + ' 강사에게 넘기기', '✓ Hand over ' + nSel + ' selected to ' + d.to.name)
                             : T('강사를 먼저 고르세요', 'Choose a teacher first'), true, !d.to || !nSel || !!S.busy)
        + '</div>';
      h += '<div style="color:#64748b;font-size:11.5px;margin-top:6px">'
        + esc(T('지난 수업·취소된 수업은 그대로 둡니다(급여·출결 기록 보호). 카페24 복사본은 넘기면 «사람이 고친 수업» 으로 표시돼 카페24 동기화가 덮어쓰지 않습니다. 변경은 수업 변경 이력에 남습니다.',
                'Past and cancelled classes are left as they are (payroll/attendance history). Handed-over cafe24 copies are marked «edited by staff», so the cafe24 sync will not overwrite them. Each change is recorded in the class change history.'))
        + '</div>';
    } else {
      h += '<div style="color:#047857;font-weight:700;margin-bottom:6px">' + esc(T('✓ 넘길 망고아이 수업이 없습니다.', '✓ No Mangoi classes left to hand over.')) + '</div>';
    }

    // ── ② 카페24 ──
    h += '<div style="font-weight:900;font-size:14px;margin:16px 0 4px">② ' + esc(T('카페24 예약 ' + (c24.count || 0) + '건 — 카페24에서 바꿔야 합니다',
                                                                             'cafe24 bookings: ' + (c24.count || 0) + ' — change them in cafe24')) + '</div>';
    if (!c24.known) {
      h += '<div style="color:#92400e">' + esc(c24.failed
        ? T('카페24 예약을 읽지 못했습니다. 잠시 후 다시 열어 주세요.', 'Could not read cafe24 bookings. Try again shortly.')
        : T('이 강사의 카페24 강사 번호를 찾지 못했습니다 — 카페24에서 직접 확인하세요.', 'Could not find this teacher in cafe24 — please check in cafe24 directly.')) + '</div>';
    } else {
      if (c24.failed) h += '<div style="color:#92400e">' + esc(T('⚠ 일부를 읽지 못해 실제보다 적을 수 있습니다.', '⚠ Some bookings could not be read — the real number may be higher.')) + '</div>';
      if (c24.count) {
        h += '<div style="color:#475569;margin-bottom:6px">'
          + esc(T('망고아이에서는 바꿀 수 없습니다(카페24가 정본). 카페24 관리자에서 아래 학생들의 강사를 바꾸세요. 학생 ' + (c24.students || 0) + '명 · ' + (c24.first_date || '') + ' ~ ' + (c24.last_date || ''),
                  'These cannot be changed in Mangoi (cafe24 is the source). Change the teacher for these students in cafe24 admin. ' + (c24.students || 0) + ' student(s) · ' + (c24.first_date || '') + ' ~ ' + (c24.last_date || '')))
          + '</div><div style="max-height:180px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;padding:4px 8px">'
          + (c24.items || []).map(function (it) {
            return '<div style="padding:3px 0;border-bottom:1px solid #f1f5f9">' + esc((it.name ? it.name + ' (' + it.user_id + ')' : it.user_id)
              + ' · ' + T(it.count + '건 · 다음 ' + it.next_date.slice(5).replace('-', '/') + ' ' + it.next_time + ' · 마지막 ' + it.last_date,
                          it.count + ' · next ' + it.next_date.slice(5).replace('-', '/') + ' ' + it.next_time + ' · last ' + it.last_date)) + '</div>';
          }).join('') + '</div>';
      } else {
        h += '<div style="color:#047857;font-weight:700">' + esc(T('✓ 남은 카페24 예약이 없습니다.', '✓ No cafe24 bookings left.')) + '</div>';
      }
    }
    if (S.msg) h += '<div id="tpx-msg" role="status" style="margin-top:12px;padding:8px 10px;border-radius:10px;background-color:' + (S.msgOk ? '#ecfdf5' : '#fef2f2') + ';color:' + (S.msgOk ? '#065f46' : '#991b1b') + ';font-weight:700">' + esc(S.msg) + '</div>';
    box.innerHTML = h;
  }

  function selectedIds() {
    if (!S || !S.data || !S.data.to) return [];
    return (S.data.rows || []).filter(function (r) {
      if (r.verdict === 'ok') return !(S.unchecked && S.unchecked[r.id]);
      if (r.verdict === 'group') return !!(S.groupOn && S.groupOn[r.id]);   // 사람이 고른 것만
      return false;
    }).map(function (r) { return r.id; });
  }

  async function load(to) {
    if (!S) return;
    S.busy = true; S.to = to || ''; render();
    var res = await post(S.pid, to ? { action: 'transfer_preview', to_teacher_id: to } : { action: 'transfer_preview' });
    if (!S) return;
    S.busy = false;
    if (!res.ok) {
      S.msgOk = false;
      S.msg = T('불러오지 못했습니다: ', 'Could not load: ') + (res.d.message || res.d.error || ('HTTP ' + res.http));
      if (!S.data) { S.data = null; render(); return; }
    } else {
      S.data = res.d; S.unchecked = {}; S.groupOn = {};
    }
    render();
  }

  async function apply() {
    if (!S || !S.data || !S.data.to || S.busy) return;
    var ids = selectedIds();
    if (!ids.length) return;
    var who = S.data.to.name;
    if (!window.confirm(T('선택한 ' + ids.length + '건의 담당 강사를 «' + who + '» 로 바꿉니다. 계속할까요?',
                          'Change the teacher of ' + ids.length + ' selected class(es) to «' + who + '»?'))) return;
    var expected = {};
    (S.data.rows || []).forEach(function (r) { if (ids.indexOf(r.id) >= 0) expected[r.id] = r.move_version; });
    S.busy = true; S.msg = T('넘기는 중…', 'Handing over…'); S.msgOk = true; render();
    var res = await post(S.pid, { action: 'transfer_apply', to_teacher_id: S.data.to.id, ids: ids, expected: expected });
    if (!S) return;
    S.busy = false;
    var moved = Number(res.d.moved || 0);
    if (res.ok) {
      S.msgOk = true;
      S.msg = T('✅ ' + moved + '건을 ' + who + ' 강사에게 넘겼습니다.', '✅ Handed over ' + moved + ' class(es) to ' + who + '.');
    } else {
      S.msgOk = false;
      S.msg = (moved ? T(moved + '건은 넘겼고, 나머지는 못 넘겼습니다: ', moved + ' handed over; the rest failed: ')
                     : T('넘기지 못했습니다: ', 'Could not hand over: '))
        + (res.d.message || res.d.error || ('HTTP ' + res.http));
    }
    var keep = S.msg, keepOk = S.msgOk;
    await load(S.data.to.id);   // 결과를 서버에서 다시 읽는다(화면이 추측하지 않는다)
    if (S) { S.msg = keep; S.msgOk = keepOk; render(); }
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !S) return;
    if (t.id === 'tpx-close') { if (!S.busy) close(); return; }
    if (t.id === 'tpx-go') { apply(); return; }
  }
  function onChange(e) {
    var t = e.target;
    if (!t || !S) return;
    if (t.id === 'tpx-to') { S.msg = ''; load(t.value); return; }
    if (t.id === 'tpx-all') {
      S.unchecked = {};
      if (!t.checked) (S.data.rows || []).forEach(function (r) { S.unchecked[r.id] = true; });
      render(); return;
    }
    if (t.classList && t.classList.contains('tpx-pick')) {
      var id = t.getAttribute('data-id');
      var row = (S.data.rows || []).filter(function (r) { return r.id === id; })[0];
      if (row && row.verdict === 'group') {
        S.groupOn = S.groupOn || {};
        if (t.checked) S.groupOn[id] = true; else delete S.groupOn[id];
      } else {
        S.unchecked = S.unchecked || {};
        if (t.checked) delete S.unchecked[id]; else S.unchecked[id] = true;
      }
      render();
    }
  }

  /** 열기. opts.onlyIfAny=true 면 남은 수업(망고아이+카페24)이 있을 때만 연다 — 상태를 바꾼 직후 자동으로 부를 때. */
  window.tpOpenClassTransfer = async function (pid, opts) {
    opts = opts || {};
    if (!pid) return;
    if (opts.onlyIfAny) {
      var res = await post(pid, { action: 'transfer_preview' });
      if (!res.ok) return;   // 상태 저장은 이미 성공했다 — 여기서 못 읽었다고 막지 않는다(메뉴에서 다시 열 수 있다)
      var n = Number((res.d.summary && res.d.summary.total) || 0) + Number((res.d.cafe24 && res.d.cafe24.count) || 0);
      if (!n) return;
      close();
      S = { pid: pid, data: res.d, to: '', busy: false, msg: '', fromStatus: opts.fromStatus || '' };
      render();
      return;
    }
    close();
    S = { pid: pid, data: null, to: '', busy: false, msg: '', fromStatus: opts.fromStatus || '' };
    render();
    await load('');
  };
})();
