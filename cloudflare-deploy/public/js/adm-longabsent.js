// ═══════════════════════════════════════════════════════════════════════════
// adm-longabsent.js — 🚷 장기 결석생 (연속 3회 이상)  · 2026-08-13 수정요청 #05
//
//   GET /api/admin/attendance/long-absent?min=&days=&q=&sort=&include=
//   서버가 attendance 를 학생별로 «최신 수업일부터 거꾸로» 세어 연속 결석 횟수를 준다.
//   중간에 출석이 있으면 거기서 끊기므로 카운트가 저절로 리셋된다.
//
//   ⚠️ 이 화면의 숫자는 «걸러낸 뒤» 숫자다. 왜 걸러냈는지를 화면에 같이 적는다 —
//      운영 실측(2026-08-13): 후보 207명 중 명부에 없음 132 · 출석기록 없음 13 ·
//      수강종료 8 · 비활성 1 → 실제로 챙겨야 할 학생 53명.
//      숫자만 보여 주고 근거를 숨기면 «207명이라며?» 로 신뢰를 잃는다. 반드시 같이 적을 것.
//
//   ⚠️ 담당 강사 칸은 지금 대부분 빈다. class_schedules ↔ teachers 로 잇는데 이 후보들에게는
//      스케줄 행이 아직 없고, students_erp.teacher_phone 은 29,398명 전원이 비어 있다(실측).
//      그래서 «대리점(학원)» 을 함께 보여 준다 — 실제 연락은 그쪽으로 한다.
//
//   전역 classic script (adm-bugreports.js·adm-waitlist.js 와 같은 방식).
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  var _rows = [];       // 마지막 응답 (CSV 내보내기가 화면과 똑같은 것을 쓰도록)
  var _meta = null;
  var _seq = 0;         // 늦게 온 옛 응답이 최신 결과를 덮지 않게
  var _timer = null;

  var _isEn = function () { return document.documentElement.lang === 'en' || window.adminLang === 'en'; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var val = function (id, dflt) { var e = document.getElementById(id); return e ? e.value : dflt; };
  var dash = function (v) { var x = esc(v); return x || '—'; };

  /* 마지막 출석일로부터 며칠 지났는지 — «얼마나 급한가» 를 한눈에 보이게 한다 */
  function daysSince(dstr, asOf) {
    if (!dstr) return null;
    var a = Date.parse(dstr + 'T00:00:00Z'), b = Date.parse((asOf || '') + 'T00:00:00Z');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  function streakColor(n) {
    if (n >= 10) return '#b91c1c';
    if (n >= 6)  return '#c2410c';
    return '#a16207';
  }

  window.laLoad = async function () {
    var box = document.getElementById('la-list');
    if (!box) return;
    var en = _isEn();
    var my = ++_seq;
    box.innerHTML = '<div style="padding:16px;color:#6b7280;text-align:center">' + (en ? 'Loading…' : '불러오는 중…') + '</div>';

    var qs = '?min=' + encodeURIComponent(val('la-min', '3')) +
             '&days=' + encodeURIComponent(val('la-days', '180')) +
             '&sort=' + encodeURIComponent(val('la-sort', 'streak')) +
             (val('la-include', '') === 'all' ? '&include=all' : '') +
             (val('la-q', '').trim() ? '&q=' + encodeURIComponent(val('la-q', '').trim()) : '');

    var d;
    try {
      var r = await fetch('/api/admin/attendance/long-absent' + qs, { cache: 'no-store', credentials: 'include' });
      d = await r.json();
    } catch (e) {
      if (my !== _seq) return;
      box.innerHTML = '<div style="padding:16px;color:#b91c1c">' + (en ? 'Failed to load.' : '불러오지 못했습니다.') + ' ' + esc(e && e.message) + '</div>';
      return;
    }
    if (my !== _seq) return;                       // 더 최신 요청이 이미 나갔다
    if (!d || !d.ok) {
      box.innerHTML = '<div style="padding:16px;color:#b91c1c">' + (en ? 'Failed to load.' : '불러오지 못했습니다.') + ' ' + esc(d && d.error) + '</div>';
      return;
    }
    _rows = d.students || [];
    _meta = d;
    renderNote(d, en);
    renderTable(_rows, d, en);
  };

  /* 왜 몇 명이 빠졌는지 — 요구사항의 «레거시는 제외하거나 별도 표기» */
  function renderNote(d, en) {
    var el = document.getElementById('la-note');
    if (!el) return;
    var ex = d.excluded || {};
    var parts = [];
    if (ex.no_roster)     parts.push((en ? 'not in roster ' : '명부에 없음 ') + ex.no_roster);
    if (ex.never_present) parts.push((en ? 'no check-in record ' : '출석 기록 없음 ') + ex.never_present);
    if (ex.ended)         parts.push((en ? 'course ended ' : '수강 종료 ') + ex.ended);
    if (ex.inactive)      parts.push((en ? 'inactive ' : '비활성 ') + ex.inactive);
    var total = (ex.no_roster || 0) + (ex.never_present || 0) + (ex.ended || 0) + (ex.inactive || 0);

    var cnt = document.getElementById('la-count');
    if (cnt) cnt.innerHTML = en
      ? ('<b>' + d.count + '</b> students')
      : ('<b>' + d.count + '</b>명');

    el.innerHTML =
      '<div style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.7;color:#101828">' +
        '<b>' + (en ? 'How this list is built' : '이 목록이 만들어진 방법') + '</b> — ' +
        (en
          ? ('counted backwards from each student\'s most recent class; a check-in resets the count. Window: since ' + esc(d.since) + '.')
          : ('학생마다 <b>최신 수업일부터 거꾸로</b> 세다가 출석을 만나면 멈춥니다(중간에 출석하면 리셋). 기간: ' + esc(d.since) + ' 이후.')) +
        (total
          ? ('<br>' + (en ? 'Excluded ' : '판단에서 제외 ') + '<b>' + total + '</b>' + (en ? '' : '명') +
             ' — ' + esc(parts.join(' · ')) +
             ' <span style="color:#92400e">(' + (en ? 'candidates ' : '전체 후보 ') + d.candidates + (en ? '' : '명') + ')</span>')
          : '') +
        (d.settle_cut
          ? ('<br><span style="color:#92400e">⏳ ' +
             (en
               ? ('Absences after ' + esc(d.settle_cut) + ' are not final yet — cafe24 only re-syncs the last 14 days. The ⏳ badge shows how many of the streak fall in that window.')
               : (esc(d.settle_cut) + ' 이후 결석은 <b>아직 확정 전</b>입니다 — 카페24 동기화가 최근 14일만 다시 가져옵니다. 연속 횟수 중 몇 건이 그 구간인지는 ⏳ 로 표시했습니다.')) +
             '</span>')
          : '') +
      '</div>';
  }

  /* 🚨 이탈 위험 배지 (2026-08-30 v4 제안서 17)
     ⚠️ «AI 가 계산한 점수» 가 아니라 **연속 결석 횟수 하나**로 정한다. 그 사실을 title 로 적어 둔다 —
        근거를 숨기면 다음 사람이 «AI 가 왜 이렇게 봤지» 로 엉뚱한 곳을 뒤진다. */
  function riskBadge(streak, en) {
    var lv, bg, fg, ko, txt;
    if (streak >= 5)      { lv='critical'; bg='#7f1d1d'; fg='#fff';    ko='심각'; txt='HIGH'; }
    else if (streak >= 3) { lv='high';     bg='#b91c1c'; fg='#fff';    ko='심각'; txt='HIGH'; }
    else if (streak >= 2) { lv='watch';    bg='#fef3c7'; fg='#92400e'; ko='주의'; txt='WATCH'; }
    else                  { lv='low';      bg='#f3f4f6'; fg='#6b7280'; ko='보통'; txt='LOW'; }
    var why = en ? ('promoted by ' + streak + ' consecutive absences')
                 : ('연속 결석 ' + streak + '회로 자동 승격 (AI 점수와 별개로 결석만으로 판정)');
    return '<span title="' + esc(why) + '" style="display:inline-block;padding:2px 9px;border-radius:99px;'
      + 'font-size:10.5px;font-weight:800;background:' + bg + ';color:' + fg + '">'
      + (en ? txt : ko) + '</span>';
  }

  /* 🎯 퀵 케어 버튼 (2026-08-30 v4 제안서 17)
     [무엇] 「목록에서 바로 연락할 수 있게」가 지시다. 여기서 **직접 발송하지 않는다** —
       버튼은 «도구를 열어 주기» 까지만 한다. 목록 화면에서 한 번의 오클릭으로 학부모에게
       문자가 나가면 되돌릴 수 없다(CLAUDE.md — 학부모 발송 경로는 이중발송 전력이 있다).
     · 💬 카톡  — 채널 홈. ⛔ 주소 뒤에 /chat 을 붙이지 말 것(비로그인 PC 가 로그인 화면으로 튕긴다).
     · 📱 SMS   — sms: 링크. 폰에서는 문자앱이 열리고, PC 에서는 번호를 보여 준다.
     · 🎁 보강·포인트 — 포인트 관리 카드로 점프(지급은 거기서 사람이 한다).
     · 📞 전화  — tel: 링크.
     ⚠️ 번호가 없으면 버튼을 «회색 안내» 로 둔다 — 눌리는데 아무 일도 안 나는 버튼이 제일 나쁘다. */
  function careButtons(s, en) {
    var out = [];
    var B = function (href, label, title, color) {
      return '<a href="' + href + '" ' + (/^https?:/.test(href) ? 'target="_blank" rel="noopener" ' : '')
        + 'title="' + esc(title) + '" style="display:inline-block;margin-right:3px;padding:3px 7px;border-radius:6px;'
        + 'font-size:11px;font-weight:700;text-decoration:none;border:1px solid ' + color + '55;color:' + color
        + ';background:' + color + '14">' + label + '</a>';
    };
    out.push(B('https://pf.kakao.com/_xlqnSxd', '💬', en ? 'Open the KakaoTalk channel' : '카카오 상담 채널 열기', '#a16207'));
    var parent = String(s.parent_phone || '').replace(/[^0-9+]/g, '');
    var stu = String(s.student_phone || '').replace(/[^0-9+]/g, '');
    var phone = parent || stu;
    if (phone) {
      out.push(B('sms:' + phone, '📱', en ? 'Send a text' : '문자 보내기 (문자앱이 열립니다)', '#0e7490'));
      out.push(B('tel:' + phone, '📞', en ? 'Call the parent' : '학부모에게 전화', '#047857'));
    } else {
      out.push('<span title="' + (en ? 'no phone on file' : '등록된 연락처가 없습니다')
        + '" style="margin-right:3px;font-size:11px;color:#9ca3af">📱📞 —</span>');
    }
    out.push('<a href="#" onclick="event.preventDefault();if(window.jumpToMenu)window.jumpToMenu(\'card-points-mgmt\');" '
      + 'title="' + (en ? 'Open points / make-up class management' : '보강·포인트 지급 화면 열기')
      + '" style="display:inline-block;padding:3px 7px;border-radius:6px;font-size:11px;font-weight:700;'
      + 'text-decoration:none;border:1px solid #7c3aed55;color:#7c3aed;background:#7c3aed14">🎁</a>');
    return out.join('');
  }

  function renderTable(rows, d, en) {
    var box = document.getElementById('la-list');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<div style="padding:28px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">' +
        (en ? 'No students match.' : '해당하는 학생이 없습니다.') + '</div>';
      return;
    }
    var H = function (ko, enTxt, extra) {
      return '<th style="text-align:left;padding:9px 10px;white-space:nowrap' + (extra || '') + '">' + (en ? enTxt : ko) + '</th>';
    };
    box.innerHTML =
      '<div style="overflow-x:auto">' +
      '<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">' +
        '<thead style="background:#f3f4f6"><tr>' +
          H('학생명', 'Student') + H('아이디', 'ID') +
          H('연속 결석', 'Streak', ';text-align:right') +
          /* 🚨 (2026-08-30 v4 제안서 17) 연속 3회 이상 = 이탈 위험 «심각». 판정은 이 줄의
             streak 하나로 하며, 관리자 대시보드의 이탈예측(/api/admin/retention/risk)도
             같은 규칙으로 등급을 올린다(api-admin.ts S11). 두 화면이 다른 말을 하면 안 된다. */
          H('이탈 위험', 'Churn risk') +
          H('마지막 출석', 'Last check-in') + H('최근 수업일', 'Last class') +
          H('담당 강사', 'Teacher') + H('대리점(학원)', 'Center') + H('지사', 'Branch') +
          H('학생 연락처', 'Student phone') + H('학부모 연락처', 'Parent phone') +
          H('퀵 케어', 'Quick care') +
        '</tr></thead><tbody>' +
        rows.map(function (s) {
          var gone = daysSince(s.last_present, d.as_of);
          var why = s.exclude_reason
            ? '<span title="' + esc(s.exclude_reason) + '" style="font-size:10.5px;color:#b45309"> ⚠</span>' : '';
          return '<tr style="border-bottom:1px solid #e5e7eb">' +
            '<td style="padding:9px 10px"><b>' + dash(s.name) + '</b>' + why + '</td>' +
            '<td style="padding:9px 10px"><code>' + dash(s.user_id) + '</code></td>' +
            '<td style="padding:9px 10px;text-align:right;white-space:nowrap">' +
              '<b style="color:' + streakColor(Number(s.streak) || 0) + ';font-size:13.5px">' + (Number(s.streak) || 0) + '</b>' +
              (en ? '' : '<span style="font-size:11px;color:#6b7280">회</span>') +
              (Number(s.recent_unsettled) > 0
                ? '<span title="' + (en ? 'not final yet (last 14 days)' : '최근 14일 — 아직 확정 전') + '" style="font-size:10.5px;color:#92400e"> ⏳' + s.recent_unsettled + '</span>'
                : '') +
            '</td>' +
            '<td style="padding:9px 10px;white-space:nowrap">' + riskBadge(Number(s.streak) || 0, en) + '</td>' +
            '<td style="padding:9px 10px;white-space:nowrap">' + dash(s.last_present) +
              (gone != null ? '<br><span style="font-size:11px;color:#6b7280">' + (en ? (gone + ' days ago') : (gone + '일 전')) + '</span>' : '') +
            '</td>' +
            '<td style="padding:9px 10px;white-space:nowrap">' + dash(s.last_class) + '</td>' +
            '<td style="padding:9px 10px">' + dash(s.teacher_name) + '</td>' +
            '<td style="padding:9px 10px">' + dash(s.shop_name) + '</td>' +
            '<td style="padding:9px 10px">' + dash(s.franchise) + '</td>' +
            '<td style="padding:9px 10px;white-space:nowrap">' + dash(s.student_phone) + '</td>' +
            '<td style="padding:9px 10px;white-space:nowrap">' + dash(s.parent_phone) + '</td>' +
            '<td style="padding:9px 10px;white-space:nowrap">' + careButtons(s, en) + '</td>' +
          '</tr>';
        }).join('') +
      '</tbody></table></div>';
  }

  /* 📥 CSV — 화면에 보이는 것과 100% 같은 줄·같은 마스킹 (학생 목록 CSV 와 같은 원칙) */
  window.laExportCsv = function () {
    var en = _isEn();
    if (!_rows.length) { alert(en ? 'Load the list first.' : '먼저 목록을 불러오세요.'); return; }
    var cols = [
      ['학생명', function (s) { return s.name; }],
      ['아이디', function (s) { return s.user_id; }],
      ['연속결석', function (s) { return Number(s.streak) || 0; }],
      ['확정전(최근14일)', function (s) { return Number(s.recent_unsettled) || 0; }],
      ['마지막출석', function (s) { return s.last_present; }],
      ['최근수업일', function (s) { return s.last_class; }],
      ['담당강사', function (s) { return s.teacher_name; }],
      ['대리점(학원)', function (s) { return s.shop_name; }],
      ['지사', function (s) { return s.franchise; }],
      ['학생연락처', function (s) { return s.student_phone; }],
      ['학부모연락처', function (s) { return s.parent_phone; }],
      ['제외사유', function (s) { return s.exclude_reason; }]
    ];
    var cell = function (v) {
      var x = (v == null ? '' : String(v));
      return /[",\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
    };
    var out = [cols.map(function (c) { return cell(c[0]); }).join(',')];
    _rows.forEach(function (s) { out.push(cols.map(function (c) { return cell(c[1](s)); }).join(',')); });
    var csv = '﻿' + out.join('\r\n');          // BOM — 엑셀에서 한글 안 깨짐
    var stamp = (_meta && _meta.as_of ? _meta.as_of : '').replace(/-/g, '');
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    var a = document.createElement('a');
    a.href = url; a.download = 'mangoi_long_absent_' + stamp + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  /* 조건이 바뀌면 다시 부른다. 검색만 디바운스(타자 중간에 요청이 줄줄이 나가지 않게). */
  function bind() {
    ['la-min', 'la-days', 'la-sort', 'la-include'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.__laBound) { el.__laBound = true; el.addEventListener('change', function () { window.laLoad(); }); }
    });
    var q = document.getElementById('la-q');
    if (q && !q.__laBound) {
      q.__laBound = true;
      q.addEventListener('input', function () {
        clearTimeout(_timer);
        _timer = setTimeout(function () { window.laLoad(); }, 400);
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
