/* 📇 강사 연락처 연결 (card-teacher-contact)
 *
 * [왜 필요한가] 8/7 18:00 레벨테스트에서 강사가 빈 방을 30분 지켰는데 아무 알림도 못 갔다.
 *   원인은 코드가 아니라 «다리»가 없던 것:
 *     · `teachers`(수업 배정의 기준)에는 연락처 컬럼이 아예 없다
 *     · `teacher_profiles`(연락처가 있는 곳)의 linked_teacher_id 는 전 행 NULL 이었다
 *   여기서 한 번 「이 원부 강사 = 이 프로필」을 정해 두면 그 뒤로는 이름을 추측하지 않는다.
 *
 * 🌏 [연락 수단의 현실] 강사 대부분이 필리핀에 있다. 실측:
 *     전화 22건 중 21건이 필리핀 09xx(한국 번호 0건) · 이메일 22 · 카톡ID 20.
 *     SOLAPI 에는 국제 발송 처리가 없고, 카카오 알림톡은 «한국 번호» 기반이라 kakao_id 로는 못 보낸다.
 *     → 지금 자동으로 닿는 국제 수단은 **이메일뿐**이다.
 *     이 화면은 그 사실을 숨기지 않는다. 행마다 «자동 알림 가능/불가»를 그대로 보여 준다 —
 *     연결만 해 놓고 왜 안 가는지 아무도 모르는 상태가 제일 나쁘다(=8/7 에 겪은 것).
 *
 * ⛔ 계정·원부 행은 건드리지 않는다. teacher_profiles.linked_teacher_id 에만 쓴다(되돌리기 쉽게).
 */
(function () {
  var _items = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isEn() { return !!(window.adminLang && window.adminLang !== 'ko'); }
  function T(ko, en) { return isEn() ? en : ko; }

  /* 연락 수단 배지 — «있다/없다» 가 아니라 «자동으로 갈 수 있나» 를 말한다. */
  function reachBadge(r) {
    /* 🔔 (2026-09-14) 웹푸시는 «더해지는» 수단 — 이메일·문자가 있으면 그 옆에 «+ 푸시» 로 붙고,
       둘 다 없어도 푸시를 켠 강사에게는 결석 알림이 «실제로» 갑니다(absent-sweep.ts). 그래서 초록.
       ⛔ 카카오ID 만 있는 강사를 초록으로 그리지 않는다 — 그건 자동으로 닿는 수단이 아니다. */
    var plus = r.push_on ? T(' + 🔔 푸시', ' + 🔔 push') : '';
    if (r.reach_by === 'email') return { txt: T('📧 이메일로 자동 발송', '📧 auto — email') + plus, bg: '#dcfce7', fg: '#166534' };
    if (r.reach_by === 'sms') return { txt: T('📱 문자로 자동 발송', '📱 auto — SMS') + plus, bg: '#dcfce7', fg: '#166534' };
    if (r.reach_by === 'push') return { txt: T('🔔 푸시로 자동 발송 (강사가 켬)', '🔔 auto — push (teacher opted in)'), bg: '#dcfce7', fg: '#166534' };
    if (!r.linked_profile_id) return { txt: T('연결 안 됨 — 알림 못 감', 'Not linked — no alerts'), bg: '#fee2e2', fg: '#991b1b' };
    return { txt: T('자동 발송 불가 — 이메일 없음 · 강사가 화면에서 🔔 알림 받기를 켜면 갑니다', 'No auto alert — needs email, or the teacher turns on 🔔 alerts'), bg: '#fef3c7', fg: '#92400e' };
  }

  function contactCell(r) {
    var out = [];
    if (r.email) out.push('📧 ' + esc(r.email));
    if (r.phone) {
      var tag = r.phone_region === 'PH' ? T('필리핀', 'PH') : r.phone_region === 'KR' ? T('한국', 'KR') : '';
      out.push('📱 ' + esc(r.phone) + (tag ? ' <span style="color:#94a3b8">(' + tag + ')</span>' : ''));
    }
    if (r.kakao_id) out.push('💬 ' + esc(r.kakao_id));
    if (!out.length) return '<span style="color:#9ca3af">' + T('연락처 없음', 'no contact') + '</span>';
    return out.join('<br>');
  }

  function candOptions(r) {
    var out = '<option value="">' + T('— 프로필 선택 —', '— select profile —') + '</option>';
    for (var i = 0; i < r.candidates.length; i++) {
      var c = r.candidates[i];
      var marks = (c.email ? '📧' : '') + (c.phone ? '📱' : '') + (c.kakao_id ? '💬' : '');
      out += '<option value="' + esc(c.id) + '">' + esc(c.name) + (marks ? ' ' + marks : '') + '</option>';
    }
    return out;
  }

  function render() {
    var host = document.getElementById('tct-table');
    if (!host) return;
    /* 급한 것부터 위로 — 알림이 못 가는 사람이 맨 위. 이 화면의 목적이 그것이다. */
    var rows = _items.slice().sort(function (a, b) {
      var ra = a.reachable ? 1 : 0, rb = b.reachable ? 1 : 0;
      if (ra !== rb) return ra - rb;
      return String(a.teacher_name).localeCompare(String(b.teacher_name));
    });

    var h = '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'
      + '<thead><tr style="background:#f3f4f6">'
      + '<th style="padding:8px;text-align:left">' + T('원부 강사', 'Roster teacher') + '</th>'
      + '<th style="padding:8px;text-align:left">' + T('연결된 프로필', 'Linked profile') + '</th>'
      + '<th style="padding:8px;text-align:left">' + T('연락처', 'Contact') + '</th>'
      + '<th style="padding:8px;text-align:left">' + T('알림', 'Alerts') + '</th>'
      + '<th style="padding:8px;text-align:left"></th></tr></thead><tbody>';

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], b = reachBadge(r);
      h += '<tr style="border-bottom:1px solid #e5e7eb">'
        + '<td style="padding:8px;font-weight:700">' + esc(r.teacher_name) + ' <span style="color:#9ca3af;font-size:11px">#' + esc(r.teacher_id) + '</span></td>'
        + '<td style="padding:8px">'
        + (r.linked_profile_id
            ? '<b>' + esc(r.linked_profile_name) + '</b>'
            : (r.candidates.length
                ? '<select id="tct-sel-' + esc(r.teacher_id) + '" style="padding:5px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;max-width:230px">' + candOptions(r) + '</select>'
                : '<span style="color:#b91c1c;font-size:11.5px">' + T('이름이 맞는 프로필이 없습니다', 'No profile matches this name') + '</span>'))
        + '</td>'
        + '<td style="padding:8px;line-height:1.7">' + contactCell(r) + '</td>'
        + '<td style="padding:8px"><span style="display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:800;background:'
        + b.bg + ';color:' + b.fg + '">' + b.txt + '</span></td>'
        + '<td style="padding:8px;white-space:nowrap">'
        + (r.linked_profile_id
            ? '<button onclick="tctUnlink(\'' + esc(r.teacher_id) + '\')" style="padding:5px 11px;font-size:12px;background:#fff;color:#991b1b;border:1px solid #fecaca;border-radius:6px;cursor:pointer">' + T('해제', 'Unlink') + '</button>'
            : (r.candidates.length
                ? '<button onclick="tctSave(\'' + esc(r.teacher_id) + '\')" style="padding:5px 11px;font-size:12px;font-weight:800;background:#1e40af;color:#fff;border:0;border-radius:6px;cursor:pointer">' + T('연결', 'Link') + '</button>'
                : ''))
        + '</td></tr>';
    }
    h += '</tbody></table>';
    if (!rows.length) h = '<div style="font-size:12px;color:#6b7280">' + T('활동 중인 강사가 없습니다.', 'No active teachers.') + '</div>';
    host.innerHTML = h;
  }

  window.tctLoad = async function () {
    var host = document.getElementById('tct-table');
    if (host) host.innerHTML = '<div style="font-size:12px;color:#6b7280">' + T('불러오는 중…', 'Loading…') + '</div>';
    try {
      var res = await fetch('/api/admin/teacher-contacts', { credentials: 'include', cache: 'no-store' });
      var j = await res.json();
      if (!j || !j.ok) throw new Error((j && (j.message || j.error)) || 'failed');
      _items = j.items || [];
      var s = j.summary || {};
      var sum = document.getElementById('tct-summary');
      if (sum) {
        var cant = (s.total || 0) - (s.reachable || 0);
        sum.textContent = cant
          ? T('알림이 못 가는 강사 ' + cant + '명 / 전체 ' + s.total + '명',
              cant + ' of ' + s.total + ' teachers cannot receive alerts')
          : T('모든 강사에게 알림이 갑니다', 'All teachers can receive alerts');
        sum.style.color = cant ? '#b91c1c' : '#166534';
      }
      var badge = document.getElementById('tct-badge');
      if (badge) {
        var need = (s.total || 0) - (s.reachable || 0);
        if (need > 0) { badge.textContent = T(need + '명 알림 불가', need + ' unreachable'); badge.style.display = 'inline-block'; }
        else badge.style.display = 'none';
      }
      render();
    } catch (e) {
      if (host) host.innerHTML = '<div style="font-size:12px;color:#b91c1c">' + T('불러오지 못했습니다: ', 'Failed to load: ') + esc(e.message) + '</div>';
    }
  };

  window.tctSave = async function (teacherId) {
    var sel = document.getElementById('tct-sel-' + teacherId);
    var pid = sel ? sel.value : '';
    if (!pid) { alert(T('프로필을 먼저 고르세요.', 'Pick a profile first.')); return; }
    var label = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : pid;
    if (!confirm(T('이 강사를 «' + label + '» 프로필과 연결할까요?\n결석 알림 등이 이 프로필의 연락처로 갑니다.',
                   'Link this teacher to "' + label + '"?\nAbsence alerts will go to that profile’s contact.'))) return;
    try {
      var res = await fetch('/api/admin/teacher-contacts', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId, profile_id: pid })
      });
      var j = await res.json();
      if (j && j.ok) {
        /* 🔔 연결했다고 끝이 아니다 — 이메일이 없으면 여전히 알림이 못 간다.
           그 사실을 «지금» 말해 주지 않으면 연결만 해 놓고 안심하게 된다. */
        if (!j.reachable) {
          alert(T('연결했습니다. 다만 이 프로필에 이메일이 없어 자동 알림은 아직 못 갑니다.\n(강사 대부분이 필리핀이라 문자는 안 가고 이메일이 필요합니다)',
                  'Linked. But this profile has no email, so automatic alerts still cannot be sent.\n(Most teachers are in the Philippines — SMS does not reach them; email is required.)'));
        }
        tctLoad();
      } else alert(T('실패: ', 'Failed: ') + ((j && (j.message || j.error)) || 'unknown'));
    } catch (e) { alert(T('오류: ', 'Error: ') + e.message); }
  };

  window.tctUnlink = async function (teacherId) {
    if (!confirm(T('연결을 해제할까요? 이 강사에게는 알림이 안 가게 됩니다.',
                   'Remove the link? This teacher will stop receiving alerts.'))) return;
    try {
      await fetch('/api/admin/teacher-contacts', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: teacherId, profile_id: '' })
      });
      tctLoad();
    } catch (e) { alert(T('오류: ', 'Error: ') + e.message); }
  };

  // 카드를 펼치면 한 번 불러온다 (adm-lazy.js 가 이 파일을 그때 넣어 준다)
  try {
    var card = document.getElementById('card-teacher-contact');
    if (card && card.open) window.tctLoad();
    if (card) card.addEventListener('toggle', function () {
      if (card.open && !card.__tctLoaded) { card.__tctLoaded = true; window.tctLoad(); }
    });
  } catch (e) {}
})();
