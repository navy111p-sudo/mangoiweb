// ═══════════════════════════════════════════════════════════════
// adm-p6.js — admin.html 인라인 스크립트 추출 (2단계, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  // ── 데이터 소스: /api/admin/teachers + /api/admin/teacher-attendance (없으면 클라이언트 시드)
  // ── 시드 모드: localStorage 에 저장된 출근 기록을 사용 + 없으면 자동 생성 (관리자 데모용)
  let _awTeachers = []; // [{ id, name }]
  let _awRecords = [];  // [{ teacher_id, teacher_name, date, scheduled, actual, late_min }]
  let _awNoActual = true; // 실제 출근 시각을 아직 못 채운다는 뜻. 화면에 사실대로 적는다.
  let _awSkipped = { lms: 0, sample: 0 }; // «수업이 아니라» 집계에서 뺀 슬롯 수 (loadRecords 가 채움)
  // 서버 미연동 경고 배너 — 한/영 (강사 다수가 필리핀)
  /* 이 카드가 무엇을 보여주는지 «화면 위에» 적어 둔다.
     수업 스케줄은 DB(class_schedules)의 실제 값이지만, «실제 출근 시각» 은 아직 기록되지 않는다.
     강사 계정(teachers.user_id)·강사↔로그인 연결표가 비어 있어 출석 로그를 강사와 묶을 수 없다.
     그 사실을 숨기면 화면이 거짓말을 한다. */
  /* ⚠️ (2026-08-12) 예전 문구는 「수업 스케줄은 실제 데이터입니다」였다. 그게 거짓이 됐다 —
     class_schedules 의 98.7%(667행 중 658)는 학생이 안 붙은 자리표시(옛 LMS 점유·시연 시드)라
     이제 집계에서 뺀다. 뺀 사실을 안 적으면 「우리 강사가 왜 안 보이냐」가 되고,
     그 다음엔 이 필터를 되돌리게 된다. 그래서 **몇 건을 왜 뺐는지** 를 숫자로 적는다. */
  function _awSeedBanner() {
    const skipped = (_awSkipped.lms || 0) + (_awSkipped.sample || 0);
    if (!_awNoActual && !skipped) return '';
    let h = '<div style="margin:0 0 10px;padding:10px 12px;border:1px solid #fedf89;background:#fffaeb;'
      + 'border-radius:8px;color:#b45309;font-size:12.5px;line-height:1.6">';
    if (skipped) {
      h += '<b>여기 세는 것은 «망고아이 수업» 뿐입니다.</b> 이 기간의 슬롯 ' + skipped + '건은 '
        + '옛 LMS 점유·시연 시드(학생이 배정되지 않은 자리표시)라 출근 집계에서 뺐습니다. '
        + '「강사 스케줄(주간 통합 캘린더)」에서는 <b>LMS</b>·<b>시드</b> 배지로 확인하실 수 있습니다.<br>'
        + '<span style="color:#93701a">Only real Mangoi classes are counted here. '
        + skipped + ' slot(s) in this range are legacy-LMS / demo placeholders with no student assigned, '
        + 'so they are excluded from attendance.</span>';
    }
    if (_awNoActual) {
      h += (skipped ? '<hr style="border:0;border-top:1px solid #fde68a;margin:8px 0">' : '')
        + '«실제 출근 시각» 은 아직 기록되지 않습니다 — 강사 로그인 계정과 출석 기록이 '
        + '연결돼 있지 않습니다. 지각 판정은 그 연결 후에 가능합니다.<br>'
        + '<span style="color:#93701a">Actual check-in times are not recorded yet '
        + '(teacher accounts are not linked to attendance logs).</span>';
    }
    return h + '</div>';
  }

  let _awMode = 'byTeacher';
  let _awChart = null;

  function pad2(n){ return String(n).padStart(2, '0'); }
  function dateStr(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
  function parseDate(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
  function isEn(){ return (typeof adminLang !== 'undefined' && adminLang === 'en'); }

  // 기간 select 채우기
  function initDateSelects() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth()+1, d = now.getDate();
    const fillY = sel => { for (let v = y-1; v <= y+1; v++) { const o=document.createElement('option'); o.value=v; o.textContent=v + (isEn()?'':' 년'); sel.appendChild(o); } sel.value = y; };
    const fillM = sel => { for (let v = 1; v <= 12; v++) { const o=document.createElement('option'); o.value=v; o.textContent=v + (isEn()?'':' 월'); sel.appendChild(o); } sel.value = m; };
    const fillD = sel => { for (let v = 1; v <= 31; v++) { const o=document.createElement('option'); o.value=v; o.textContent=v + (isEn()?'':' 일'); sel.appendChild(o); } sel.value = d; };
    // From: 1주일 전
    fillY(document.getElementById('aw-from-y')); fillM(document.getElementById('aw-from-m')); fillD(document.getElementById('aw-from-d'));
    fillY(document.getElementById('aw-to-y'));   fillM(document.getElementById('aw-to-m'));   fillD(document.getElementById('aw-to-d'));
    const back = new Date(); back.setDate(back.getDate()-6);
    document.getElementById('aw-from-y').value = back.getFullYear();
    document.getElementById('aw-from-m').value = back.getMonth()+1;
    document.getElementById('aw-from-d').value = back.getDate();
    // 변경 시 자동 갱신
    document.querySelectorAll('.aw-date, #aw-teacher').forEach(el => el.addEventListener('change', awRender));
  }

  function getRange() {
    const fy = +document.getElementById('aw-from-y').value;
    const fm = +document.getElementById('aw-from-m').value;
    const fd = +document.getElementById('aw-from-d').value;
    const ty = +document.getElementById('aw-to-y').value;
    const tm = +document.getElementById('aw-to-m').value;
    const td = +document.getElementById('aw-to-d').value;
    return { from: new Date(fy, fm-1, fd), to: new Date(ty, tm-1, td) };
  }

  // 강사 목록 — class_schedules.teacher_id 는 «teachers.id» 를 가리킨다.
  //   예전엔 teacher-profiles(다른 id 체계)를 불러서 스케줄과 안 맞았다.
  async function loadTeachers() {
    try {
      const r = await fetch('/api/admin/teachers', { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        const rows = j.teachers || j.rows || j.items || j;
        if (Array.isArray(rows) && rows.length) {
          _awTeachers = rows
            .filter(x => x && (x.active == null || x.active) )
            .map(x => ({ id: String(x.id), name: x.name || x.english_name || x.korean_name || ('#' + x.id) }));
        }
      }
    } catch (e) {}
    const sel = document.getElementById('aw-teacher');
    if (sel) _awTeachers.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.name; sel.appendChild(o); });
  }

  // 그 주의 월요일 (로컬 기준)
  function _awMonday(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  /* 수업 스케줄 로드 — /api/admin/schedules?week= 는 «그 주»를 날짜로 펼쳐서 준다.
     선택한 기간이 여러 주에 걸치면 주 단위로 나눠 받아 합친다(보통 1~2회).
     한 강사·하루에 수업이 여러 개면 «첫 수업 시각» 을 그 날의 기준 시각으로 쓴다.
     — 사장님 지적대로 출근 기준은 강사마다 다르다. 고정 09:00 이 아니라 «그 사람의 첫 수업» 이다. */
  async function loadRecords() {
    _awSkipped = { lms: 0, sample: 0 };   // 이번 조회에서 «수업이 아니라» 뺀 건수
    const { from, to } = getRange();
    const weeks = [];
    for (let d = _awMonday(from); d <= to; d.setDate(d.getDate() + 7)) weeks.push(dateStr(d));
    const byKey = new Map();   // teacher_id|date → { times:[], durs:[] }
    for (const w of weeks.slice(0, 8)) {
      try {
        const r = await fetch('/api/admin/schedules?week=' + encodeURIComponent(w), { credentials: 'include' });
        if (!r.ok) continue;
        const j = await r.json();
        for (const it of (j.items || j.schedules || [])) {
          if (it.teacher_id == null || it.teacher_id === '') continue;
          if (it.type === 'blocked') continue;            // 휴무·휴가는 수업이 아니다
          /* 🔴 (2026-08-12) 「규정출근시간」이 **옛 LMS 점유 슬롯의 첫 시각**으로 잡히고 있었다.
             class_schedules 활성 667행 중 진짜 망고아이 수업은 9행뿐이고, 나머지는
             user_id='lms'(518) / 'type_seed'(140) — 학생이 안 붙은 자리표시다.
             그걸 세면 BELLE 은 「월요일 14:00 출근」이 되는데, 그 시간에 망고아이 수업은 없다.
             수업이 아닌 것으로 출근·지각을 판정하면 **급여·평가로 이어지는 숫자가 통째로 거짓**이 된다.
             → 서버가 주는 origin 으로 거른다(api-admin.ts). 몇 건을 걸렀는지는 화면에 밝힌다 —
               조용히 빼면 「왜 우리 강사가 안 보이지」가 되고, 그때 이 필터를 되돌리게 된다. */
          const _org = String(it.origin || 'class');
          if (_org === 'lms' || _org === 'sample') { _awSkipped[_org] = (_awSkipped[_org] || 0) + 1; continue; }
          const date = String(it.date || '').slice(0, 10);
          if (!date) continue;
          const k = String(it.teacher_id) + '|' + date;
          if (!byKey.has(k)) byKey.set(k, { teacher_id: String(it.teacher_id), date, times: [], durs: [] });
          byKey.get(k).times.push(String(it.start_time || ''));
          byKey.get(k).durs.push(Number(it.duration_min) || 0);
        }
      } catch (e) {}
    }
    const nameOf = id => { const t = _awTeachers.find(x => String(x.id) === String(id)); return t ? t.name : ('#' + id); };
    _awRecords = [];
    byKey.forEach(v => {
      const times = v.times.filter(Boolean).sort();
      if (!times.length) return;
      const last = times[times.length - 1];
      _awRecords.push({
        teacher_id: v.teacher_id,
        teacher_name: nameOf(v.teacher_id),
        date: v.date,
        scheduled: times[0],          // 그 날 «첫 수업» = 그 강사의 출근 기준
        last_time: last,
        classes: times.length,
        actual: null,                 // 실제 입장 시각 — 아직 기록 경로가 없다
        late_min: null
      });
    });
    _awRecords.sort((a, b) => a.date.localeCompare(b.date) || a.teacher_name.localeCompare(b.teacher_name));
    _awNoActual = true;               // 실제 출근 시각이 붙는 날 false 로
  }

  function filterRecords() {
    const { from, to } = getRange();
    const tid = document.getElementById('aw-teacher').value;
    let res = _awRecords.filter(r => {
      const d = parseDate(r.date);
      if (d < from || d > to) return false;
      if (tid && String(r.teacher_id) !== String(tid)) return false;
      return true;
    });
    // 🔐 RBAC: 본사 외엔 자기 강사 출근만 (강사에 agency_id 매핑 없으면 본사만 표시)
    if (typeof window.adminScopeFilter === 'function') res = window.adminScopeFilter(res, 'attendance');
    return res;
  }

  function lateColor(lateMin) {
    if (lateMin <= 0) return '#10b981';
    if (lateMin <= 5) return '#f59e0b';
    return '#ef4444';
  }
  function fmtMin(min) {
    if (!min) return '00:00';
    const h = Math.floor(min/60), m = min%60;
    return pad2(h) + ':' + pad2(m);
  }

  // 강사별 표 — 강사=행, 날짜=열 (3컬럼씩 규정/실제/경과)
  function renderByTeacher(rows) {
    const teachers = Array.from(new Set(rows.map(r => r.teacher_id))).map(id => {
      const t = _awTeachers.find(x => String(x.id) === String(id));
      return { id, name: t ? t.name : id };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
    const dates = Array.from(new Set(rows.map(r => r.date))).sort();
    if (!teachers.length || !dates.length) return '<div style="padding:30px;text-align:center;color:#9ca3af">데이터가 없습니다.</div>';

    const en = isEn();
    const L = en ? { name:'Name', start:'start work time', actual:'Actual attend time', elapsed:'elapsed time', stat:'Stats' }
                 : { name:'이름', start:'규정출근시간', actual:'실제출근시간', elapsed:'경과시간', stat:'통계' };

    let html = '<div style="display:inline-block;min-width:100%;background:#fff;border-radius:10px;overflow:hidden">';
    html += '<table style="width:max-content;font-size:11.5px;border-collapse:separate;border-spacing:0;background:#fff">';

    // 헤더 1행: 날짜 그룹 (병합)
    html += '<thead><tr>';
    html += '<th rowspan="2" style="position:sticky;left:0;z-index:3;padding:10px 14px;background:linear-gradient(135deg,#1e293b,#334155);color:#fff;font-weight:700;min-width:130px;text-align:left">' + L.name + '</th>';
    dates.forEach((date, i) => {
      const bg = (i % 2 === 0) ? 'linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'linear-gradient(135deg,#0ea5e9,#0369a1)';
      html += '<th colspan="3" style="padding:9px 14px;background:' + bg + ';color:#fff;font-weight:700;font-size:13px;text-align:center;letter-spacing:0.3px;border-left:2px solid #fff">' + date + '</th>';
    });
    html += '</tr>';

    // 헤더 2행: 서브 컬럼
    html += '<tr style="background:#f1f5f9">';
    dates.forEach((_, i) => {
      const subBg = (i % 2 === 0) ? '#dbeafe' : '#e0f2fe';
      html += '<th style="padding:7px 4px;background:' + subBg + ';font-size:9.5px;font-weight:600;color:#1e3a8a;border-left:2px solid #fff;border-bottom:1px solid #cbd5e1;text-align:center;line-height:1.4;min-width:90px;width:90px">' + L.start + '<br><span style="font-weight:400;color:#64748b;font-size:8.5px">(start work time)</span></th>';
      html += '<th style="padding:7px 4px;background:' + subBg + ';font-size:9.5px;font-weight:600;color:#1e3a8a;border-bottom:1px solid #cbd5e1;text-align:center;line-height:1.4;min-width:90px;width:90px">' + L.actual + '<br><span style="font-weight:400;color:#64748b;font-size:8.5px">(Actual attend time)</span></th>';
      html += '<th style="padding:7px 4px;background:' + subBg + ';font-size:9.5px;font-weight:600;color:#1e3a8a;border-bottom:1px solid #cbd5e1;text-align:center;line-height:1.4;min-width:75px;width:75px">' + L.elapsed + '<br><span style="font-weight:400;color:#64748b;font-size:8.5px">(elapsed time)</span></th>';
    });
    html += '</tr></thead>';

    // 본문 — 강사 = 행
    html += '<tbody>';
    teachers.forEach((t, ti) => {
      const stripe = ti % 2 === 0 ? '#ffffff' : '#fafbfc';
      html += '<tr style="background:' + stripe + '">';
      html += '<td style="position:sticky;left:0;z-index:2;padding:9px 14px;background:' + stripe + ';font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;border-right:2px solid #cbd5e1;text-align:center">' + (t.name || '') + '</td>';
      dates.forEach(date => {
        const rec = rows.find(r => String(r.teacher_id) === String(t.id) && r.date === date);
        if (rec && rec.actual) {
          const lateMin = rec.late_min || 0;
          const c = lateColor(lateMin);
          const elapsed = lateMin === 0 ? '0m' : (lateMin > 0 ? '+' + lateMin + 'm' : lateMin + 'm');
          html += '<td style="padding:8px 10px;color:#475569;text-align:center;border-bottom:1px solid #f1f5f9;font-variant-numeric:tabular-nums">' + (rec.scheduled || '-') + '</td>';
          html += '<td style="padding:8px 10px;color:' + c + ';font-weight:700;text-align:center;border-bottom:1px solid #f1f5f9;font-variant-numeric:tabular-nums">' + rec.actual + '</td>';
          html += '<td style="padding:8px 10px;color:' + c + ';text-align:center;border-bottom:1px solid #f1f5f9;font-variant-numeric:tabular-nums;font-size:11px">' + elapsed + '</td>';
        } else if (rec) {
          html += '<td style="padding:8px 10px;color:#475569;text-align:center;border-bottom:1px solid #f1f5f9">' + (rec.scheduled || '-') + '</td>';
          html += '<td colspan="2" style="padding:8px 10px;color:#cbd5e1;text-align:center;border-bottom:1px solid #f1f5f9;font-style:italic">-</td>';
        } else {
          html += '<td colspan="3" style="padding:8px 10px;color:#e2e8f0;text-align:center;border-bottom:1px solid #f1f5f9">·</td>';
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    // 통계 (강사 = 행)
    html += '<div style="height:18px"></div>';
    html += '<div style="display:inline-block;min-width:100%;background:#fff;border-radius:10px;overflow:hidden">';
    html += '<table style="width:max-content;font-size:11.5px;border-collapse:separate;border-spacing:0;background:#fff">';
    html += '<thead><tr>';
    html += '<th style="position:sticky;left:0;z-index:3;padding:10px 14px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;font-weight:700;text-align:left;min-width:130px">' + L.stat + '</th>';
    const labels = [
      { key:'lateCount', ko:'지각횟수', en:'Number of lateness', sub:'(Number of lateness)', color:'#3b82f6' },
      { key:'total',     ko:'지각누적(분)', en:'total late minutes', sub:'(total late minutes)', color:'#ec4899' },
      { key:'avg',       ko:'지각평균(분)', en:'average late minutes', sub:'(average late minutes)', color:'#f59e0b' },
    ];
    labels.forEach(L2 => {
      html += '<th style="padding:9px 12px;background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;font-weight:700;text-align:center;border-left:2px solid #fff">' + (en?L2.en:L2.ko) + '<br><span style="font-size:9.5px;font-weight:400;opacity:0.8">' + L2.sub + '</span></th>';
    });
    html += '</tr></thead><tbody>';
    teachers.forEach((t, ti) => {
      const trs = rows.filter(r => String(r.teacher_id) === String(t.id) && r.actual);
      const lateRecs = trs.filter(r => r.late_min > 0);
      const lateCount = lateRecs.length;
      const total = lateRecs.reduce((a, r) => a + (r.late_min||0), 0);
      const avg = trs.length ? Math.round(total / trs.length) : 0;
      const stripe = ti % 2 === 0 ? '#ffffff' : '#fafbfc';
      html += '<tr style="background:' + stripe + '">';
      html += '<td style="position:sticky;left:0;z-index:2;padding:9px 14px;background:' + stripe + ';font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;border-right:2px solid #cbd5e1">' + (t.name || '') + '</td>';
      html += '<td style="padding:9px 12px;text-align:center;font-weight:700;color:#3b82f6;border-bottom:1px solid #f1f5f9;font-variant-numeric:tabular-nums">' + lateCount + '</td>';
      html += '<td style="padding:9px 12px;text-align:center;font-weight:700;color:#ec4899;border-bottom:1px solid #f1f5f9;font-variant-numeric:tabular-nums">' + fmtMin(total) + '</td>';
      html += '<td style="padding:9px 12px;text-align:center;font-weight:700;color:#f59e0b;border-bottom:1px solid #f1f5f9;font-variant-numeric:tabular-nums">' + avg + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    return _awSeedBanner() + html;
  }

    // 날짜별 표 — 한 행 = 하루 / 컬럼 = 강사별 지각분
  function renderByDate(rows) {
    const teachers = Array.from(new Set(rows.map(r => r.teacher_id))).map(id => {
      const t = _awTeachers.find(x => String(x.id) === String(id));
      return { id, name: t ? t.name : id };
    });
    const dates = Array.from(new Set(rows.map(r => r.date))).sort();
    const en = isEn();
    let html = '<table style="width:max-content;font-size:12px;border-collapse:collapse;background:#fff">';
    html += '<thead><tr style="background:linear-gradient(135deg,rgba(59,130,246,0.12),rgba(99,102,241,0.08))">';
    html += '<th style="padding:8px 10px;border:1px solid #d1d5db;min-width:90px">' + (en?'date':'날짜') + '</th>';
    teachers.forEach(t => { html += '<th style="padding:8px 10px;border:1px solid #d1d5db;color:#1e3a8a">' + t.name + '</th>'; });
    html += '<th style="padding:8px 10px;border:1px solid #d1d5db;background:#fef3c7;color:#92400e">' + (en?'Total Late':'총 지각') + '</th>';
    html += '</tr></thead><tbody>';
    dates.forEach(date => {
      html += '<tr><td style="padding:7px 10px;border:1px solid #e5e7eb;font-weight:600;color:#1e3a8a;background:#f8fafc">' + date + '</td>';
      let dayTotal = 0;
      teachers.forEach(t => {
        const rec = rows.find(r => String(r.teacher_id) === String(t.id) && r.date === date);
        if (rec) {
          const c = lateColor(rec.late_min);
          html += '<td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center;color:' + c + ';font-weight:700">' + (rec.actual || '-') + (rec.late_min ? ' <span style="color:'+c+';font-weight:400">(+' + rec.late_min + ')</span>' : '') + '</td>';
          dayTotal += (rec.late_min || 0);
        } else {
          html += '<td style="padding:6px 10px;border:1px solid #e5e7eb;text-align:center;color:#cbd5e1">-</td>';
        }
      });
      html += '<td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;background:#fffbeb;color:#92400e;font-weight:700">' + dayTotal + 'm</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    return _awSeedBanner() + html;
  }

  /* ────────────────────────────────────────────────────────────────────────
     🪶 (2026-08-08) 출근현황 그래프 — Chart.js 를 걷어내고 «HTML 막대» 로 다시 씀
     사장님 요청: 최대한 가볍게 · 빠르게 · 버퍼링/레깅 없게.

     걷어낸 것
       · Chart.js CDN 로드(cdn.jsdelivr.net) — 외부 의존 0. 필리핀 회선에서 제일 느리고,
         막히면 그래프가 아예 안 뜨던 지점이다. 저장소에 로컬 사본이 있는데도 이 카드만
         CDN 을 보고 있었다.
       · 캔버스 3개(막대·도넛·랭킹) → 막대 «하나». 강사 30명 규모에서 3개는 과하고,
         도넛은 비율 하나를 원으로 그린 것이라 숫자 한 줄이면 끝난다.
         (게다가 도넛 분모가 data.length*7 «1주일 가정» 이라는 근거 없는 값이었다.)

     그림 원칙 — 숫자를 먼저, 색은 예외에만
       · 맨 위에 전체 정시 출근율을 큰 숫자로. 목표(95%) 대비 몇 %p 인지 같이 적는다.
       · 막대는 목표 달성이면 회색, 미달일 때만 주황·빨강. 전부 색칠하면 아무것도 안 보인다.
       · 목표선을 막대 위에 점선으로 얹어 «어디까지 가야 하는지» 를 눈으로 잡게 한다.

     왜 SVG 가 아니라 HTML 인가 — 가로막대는 HTML 이 더 가볍고 안전하다.
       viewBox 스케일에 글자가 같이 늘어나지 않고, 번역·복사·검색이 그대로 되며,
       리플로우도 브라우저 기본 레이아웃이 처리한다. 렌더는 즉시라 레깅이 원천적으로 없다.
     ──────────────────────────────────────────────────────────────────────── */
  function _awEsc(v) {
    return String(v == null ? '' : v).replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
  }

  const AW_H0 = 6, AW_H1 = 24;   // 그래프 시간축 06:00 ~ 24:00

  function _awMinOf(hhmm) {
    const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function _awHHMM(min) {
    return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
  }

  /* 🪶 강사별 «수업 시간대» — 사장님 지적: 출퇴근 시각이 강사마다 다르다.
     그래서 하나의 기준선을 긋는 대신, 각 강사의 첫 수업~마지막 수업을 «띠» 로 그린다.
     한 화면에서 누가 이른 시간대이고 누가 밤 시간대인지, 근무 폭이 얼마나 넓은지 바로 보인다.
     Chart.js 없이 HTML 막대 — 외부 요청 0, 렌더 즉시. */
  function renderChart(rows) {
    const wrap = document.getElementById('aw-chart-wrap');
    const tableWrap = document.getElementById('aw-table-wrap');
    if (!wrap) return;
    wrap.style.display = 'block';
    if (tableWrap) tableWrap.style.display = 'none';
    const en = isEn();

    const byT = new Map();
    rows.forEach(r => {
      const s0 = _awMinOf(r.scheduled), e0 = _awMinOf(r.last_time || r.scheduled);
      if (s0 == null) return;
      const k = String(r.teacher_id);
      if (!byT.has(k)) byT.set(k, { name: r.teacher_name, min: s0, max: e0 == null ? s0 : e0, classes: 0, days: 0 });
      const g = byT.get(k);
      g.min = Math.min(g.min, s0);
      g.max = Math.max(g.max, e0 == null ? s0 : e0);
      g.classes += (r.classes || 1);
      g.days += 1;
    });
    const data = Array.from(byT.values()).sort((a, b) => a.min - b.min || a.name.localeCompare(b.name));

    if (!data.length) {
      wrap.innerHTML = _awSeedBanner() +
        '<div style="padding:36px;text-align:center;color:#98a2b3;font-size:13px">' +
        (en ? 'No classes scheduled in this range.' : '선택 기간에 예정된 수업이 없습니다.') + '</div>';
      return;
    }

    const span = (AW_H1 - AW_H0) * 60;
    const pct = m => Math.max(0, Math.min(100, ((m - AW_H0 * 60) / span) * 100));
    const classesAll = data.reduce((a, d) => a + d.classes, 0);
    const earliest = Math.min.apply(null, data.map(d => d.min));
    const latest = Math.max.apply(null, data.map(d => d.max));

    const head =
      '<div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;padding:2px 2px 14px">' +
        '<div><div style="font-size:11.5px;font-weight:700;color:#667085;letter-spacing:.3px">' +
          (en ? 'TEACHERS ON SCHEDULE' : '수업이 잡힌 강사') + '</div>' +
          '<div style="font-size:34px;font-weight:800;color:#0f172a;line-height:1.1;font-variant-numeric:tabular-nums">' +
            data.length + '<span style="font-size:18px">' + (en ? '' : '명') + '</span></div></div>' +
        '<div style="font-size:12px;color:#667085;line-height:1.7;padding-bottom:4px">' +
          (en ? 'Classes ' : '수업 ') + '<b style="color:#0f172a">' + classesAll + (en ? '' : '건') + '</b><br>' +
          (en ? 'Earliest ' : '가장 이른 시작 ') + '<b style="color:#0f172a">' + _awHHMM(earliest) + '</b> · ' +
          (en ? 'latest end ' : '가장 늦은 종료 ') + '<b style="color:#0f172a">' + _awHHMM(latest) + '</b>' +
        '</div>' +
      '</div>';

    // 시간 눈금
    let ticks = '';
    for (let h = AW_H0; h <= AW_H1; h += 3) {
      ticks += '<div style="position:absolute;left:' + pct(h * 60) + '%;top:0;bottom:0;border-left:1px dashed #eaecf0"></div>' +
               '<div style="position:absolute;left:' + pct(h * 60) + '%;top:-15px;transform:translateX(-50%);font-size:10px;color:#98a2b3">' + pad2(h) + '</div>';
    }

    const bars = data.map(d => {
      const l = pct(d.min), w = Math.max(1.5, pct(d.max) - pct(d.min));
      return '<div style="display:grid;grid-template-columns:104px 1fr 96px;align-items:center;gap:10px;padding:3px 0">' +
        '<div title="' + _awEsc(d.name) + '" style="font-size:12.5px;font-weight:700;color:#344054;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _awEsc(d.name) + '</div>' +
        '<div style="position:relative;height:16px;background:#f7f8fa;border-radius:8px">' +
          '<div style="position:absolute;left:' + l + '%;width:' + w + '%;top:0;height:100%;background:#7ca7e8;border-radius:8px"></div>' +
        '</div>' +
        '<div style="font-size:11.5px;text-align:right;color:#475467;font-variant-numeric:tabular-nums">' +
          _awHHMM(d.min) + '–' + _awHHMM(d.max) +
        '</div>' +
      '</div>';
    }).join('');

    wrap.innerHTML = _awSeedBanner() + head +
      '<div style="border-top:1px solid #eaecf0;padding-top:22px">' +
        '<div style="font-size:11.5px;font-weight:700;color:#667085;margin-bottom:10px">' +
          (en ? 'WORKING HOURS BY TEACHER — earliest first' : '강사별 수업 시간대 — 이른 순') +
          '<span style="float:right;font-weight:400;color:#98a2b3">' +
            (en ? 'first class → last class end' : '첫 수업 → 마지막 수업 종료') + '</span></div>' +
        '<div style="position:relative">' + ticks + bars + '</div>' +
      '</div>';
  }

  function awRender() {
    const rows = filterRecords();
    const tableWrap = document.getElementById('aw-table-wrap');
    const chartWrap = document.getElementById('aw-chart-wrap');
    if (_awMode === 'chart') {
      renderChart(rows);
      return;
    }
    chartWrap.style.display = 'none';
    tableWrap.style.display = 'block';
    if (!rows.length) {
      /* 🔴 (2026-08-12) 그냥 「기록이 없습니다」로 끝내면 안 된다. 이 화면이 비는 가장 흔한 이유는
         «기록이 없어서» 가 아니라 «그 기간 슬롯이 전부 LMS 점유·시드라 걸러져서» 다.
         이유를 안 적으면 고장으로 읽히고, 그 오해가 이 필터를 되돌리게 만든다. */
      const skipped = (_awSkipped.lms || 0) + (_awSkipped.sample || 0);
      tableWrap.innerHTML = _awSeedBanner()
        + '<div style="padding:36px;text-align:center;color:#9ca3af;font-size:13px;line-height:1.7">'
        + (isEn() ? 'No Mangoi class in this range.' : '선택 기간에 <b>망고아이 수업</b>이 없습니다.')
        + (skipped
            ? '<br><span style="color:#b45309">' + (isEn()
                ? ('All ' + skipped + ' slot(s) here are legacy-LMS / demo placeholders — not classes.')
                : ('이 기간의 슬롯 ' + skipped + '건은 전부 옛 LMS 점유·시연 시드입니다 — 수업이 아닙니다.'))
              + '</span>'
            : '')
        + '</div>';
      return;
    }
    tableWrap.innerHTML = (_awMode === 'byTeacher') ? renderByTeacher(rows) : renderByDate(rows);
  }

  window.awSetMode = function(mode) {
    _awMode = mode;
    document.querySelectorAll('.aw-mode-btn').forEach(b => {
      const active = b.dataset.mode === mode;
      b.style.background = active ? '#3b82f6' : '#fff';
      b.style.color = active ? '#fff' : '#3b82f6';
      b.style.border = active ? '0' : '1px solid #3b82f6';
    });
    awRender();
  };

  window.awExportExcel = function() {
    if (typeof XLSX === 'undefined') { alert('XLSX library not loaded'); return; }
    const rows = filterRecords();
    if (!rows.length) { alert(isEn()?'No data':'데이터가 없습니다.'); return; }
    const en = isEn();

    // 헤더: 사용자 캡처 기준 7컬럼 (한국어/영어 병기)
    const headers = [
      '날짜 (date)',
      '강사명 (teacher)',
      '규정출근시간 (start work time)',
      '실제출근시간 (Actual attend time)',
      '경과시간 (elapsed time)',
      '경과시간 (elapsed time - second)',
      '상태 (States)'
    ];
    const aoa = [headers];

    // 데이터 — 같은 강사·날짜 정렬: 날짜 ASC, 규정출근 ASC, 강사명 ASC
    const sorted = rows.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.scheduled !== b.scheduled) return (a.scheduled || '').localeCompare(b.scheduled || '');
      return (a.teacher_name || '').localeCompare(b.teacher_name || '');
    });

    function fmtHMS(hhmm) {
      // '09:00' → '09:00:00'
      if (!hhmm) return '';
      const parts = hhmm.split(':');
      return (parts[0] || '00').padStart(2,'0') + ':' + (parts[1] || '00').padStart(2,'0') + ':00';
    }
    function fmtSigned(min) {
      // late_min → '+18:32' or '-17:07' (mm:ss 단위)
      if (min === null || min === undefined) return '';
      const sec = Math.round(min * 60);
      const sign = sec > 0 ? '' : (sec < 0 ? '-' : '');
      const abs = Math.abs(sec);
      const m = Math.floor(abs / 60), s = abs % 60;
      return sign + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    }

    sorted.forEach(r => {
      const sched = fmtHMS(r.scheduled);
      const actual = r.actual ? fmtHMS(r.actual) : '';
      const lateMin = r.late_min;
      const elapsed = (lateMin === undefined || lateMin === null) ? '' : fmtSigned(lateMin);
      const elapsedSec = (lateMin === undefined || lateMin === null) ? '' : Math.round(lateMin * 60);
      let state = '';
      if (!actual) state = '미출근(absent)';
      else if (lateMin > 0) state = '지각(late)';
      // 정시 또는 일찍 도착: 빈 칸 (캡처와 동일)
      aoa.push([r.date, r.teacher_name, sched, actual, elapsed, elapsedSec, state]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
      { wch: 13 },  // 날짜
      { wch: 22 },  // 강사명
      { wch: 24 },  // 규정출근
      { wch: 26 },  // 실제출근
      { wch: 18 },  // 경과시간
      { wch: 26 },  // 경과시간 (초)
      { wch: 14 },  // 상태
    ];
    // 행 높이
    ws['!rows'] = [{ hpt: 28 }];

    // ─── 헤더 (1행) — 청람색 그라디언트 톤 ───
    const headerColors = [
      '0EA5E9', // 날짜  — sky
      '3B82F6', // 강사명 — blue
      '6366F1', // 규정 — indigo
      '8B5CF6', // 실제 — violet
      'EC4899', // 경과 — pink
      'F43F5E', // 경과초 — rose
      '64748B', // 상태 — slate
    ];
    headerColors.forEach((rgb, i) => {
      const addr = String.fromCharCode(65 + i) + '1';
      if (!ws[addr]) ws[addr] = { t:'s', v: headers[i] };
      ws[addr].s = {
        font:{ bold:true, color:{ rgb:'FFFFFF' }, sz:11, name:'맑은 고딕' },
        fill:{ patternType:'solid', fgColor:{ rgb } },
        alignment:{ horizontal:'center', vertical:'center', wrapText:true },
        border:{
          top:{ style:'thin', color:{ rgb } },
          bottom:{ style:'medium', color:{ rgb:'1E293B' } },
          left:{ style:'thin', color:{ rgb } },
          right:{ style:'thin', color:{ rgb } },
        },
      };
    });

    // ─── 본문 (행 색상: 상태별 배경 + 경과시간 셀 강조) ───
    for (let i = 2; i <= aoa.length; i++) {
      const r = aoa[i-1];
      const lateMin = r[5];   // 경과시간(초)
      const state = r[6];
      const actual = r[3];
      // 행 배경 컬러 (상태별)
      let rowBg, badgeBg, badgeFont;
      if (!actual || state === '미출근(absent)') { rowBg = 'F8FAFC'; badgeBg = 'FCA5A5'; badgeFont = '7F1D1D'; }      // 미출근: 옅은 회색 행 + 빨강 배지
      else if (lateMin > 0) { rowBg = 'FFFBEB'; badgeBg = 'FBBF24'; badgeFont = '78350F'; }                              // 지각: 옅은 노랑 + 진노랑 배지
      else if (lateMin < 0) { rowBg = 'F0FDF4'; badgeBg = 'BBF7D0'; badgeFont = '14532D'; }                              // 일찍: 연초록
      else { rowBg = 'FFFFFF'; badgeBg = 'D1FAE5'; badgeFont = '065F46'; }                                                // 정시: 흰

      const cellBase = (extra) => Object.assign({
        font:{ sz:10, name:'맑은 고딕' },
        fill:{ patternType:'solid', fgColor:{ rgb: rowBg } },
        alignment:{ horizontal:'left', vertical:'center', indent:1 },
        border:{
          top:{ style:'thin', color:{ rgb:'F1F5F9' } },
          bottom:{ style:'thin', color:{ rgb:'F1F5F9' } },
          left:{ style:'thin', color:{ rgb:'F1F5F9' } },
          right:{ style:'thin', color:{ rgb:'F1F5F9' } },
        },
      }, extra || {});

      // A: 날짜 (좌측 액센트)
      const aAddr = 'A' + i;
      if (ws[aAddr]) ws[aAddr].s = cellBase({
        font:{ sz:10, bold:true, color:{ rgb:'1E293B' } },
        alignment:{ horizontal:'center', vertical:'center' },
      });
      // B: 강사명
      const bAddr = 'B' + i;
      if (ws[bAddr]) ws[bAddr].s = cellBase({
        font:{ sz:11, bold:true, color:{ rgb:'1E40AF' } },
      });
      // C: 규정출근시간
      const cAddr = 'C' + i;
      if (ws[cAddr]) ws[cAddr].s = cellBase({
        font:{ sz:10, color:{ rgb:'475569' } },
        alignment:{ horizontal:'center', vertical:'center' },
      });
      // D: 실제출근시간 — 색상 강조
      const dAddr = 'D' + i;
      if (ws[dAddr]) {
        const dColor = !actual ? '94A3B8' : (lateMin > 0 ? 'B45309' : (lateMin < 0 ? '15803D' : '047857'));
        ws[dAddr].s = cellBase({
          font:{ sz:11, bold:true, color:{ rgb: dColor } },
          alignment:{ horizontal:'center', vertical:'center' },
        });
      }
      // E: 경과시간 (mm:ss)
      const eAddr = 'E' + i;
      if (ws[eAddr]) {
        const eColor = !actual ? '94A3B8' : (lateMin > 0 ? 'DC2626' : (lateMin < 0 ? '16A34A' : '059669'));
        ws[eAddr].s = cellBase({
          font:{ sz:10, bold:true, color:{ rgb: eColor } },
          alignment:{ horizontal:'right', vertical:'center', indent:1 },
        });
      }
      // F: 경과시간 (초)
      const fAddr = 'F' + i;
      if (ws[fAddr]) {
        const fColor = !actual ? '94A3B8' : (lateMin > 0 ? 'EF4444' : (lateMin < 0 ? '22C55E' : '10B981'));
        ws[fAddr].s = cellBase({
          font:{ sz:9, color:{ rgb: fColor } },
          alignment:{ horizontal:'right', vertical:'center', indent:1 },
          numFmt: '#,##0;-#,##0',
        });
      }
      // G: 상태 — 배지 스타일
      const gAddr = 'G' + i;
      if (ws[gAddr] && state) {
        ws[gAddr].s = {
          font:{ sz:10, bold:true, color:{ rgb: badgeFont }, name:'맑은 고딕' },
          fill:{ patternType:'solid', fgColor:{ rgb: badgeBg } },
          alignment:{ horizontal:'center', vertical:'center' },
          border:{
            top:{ style:'medium', color:{ rgb: badgeBg } },
            bottom:{ style:'medium', color:{ rgb: badgeBg } },
            left:{ style:'medium', color:{ rgb: badgeBg } },
            right:{ style:'medium', color:{ rgb: badgeBg } },
          },
        };
      } else if (ws[gAddr]) {
        ws[gAddr].s = cellBase({});
      } else {
        // 빈 셀에도 행 배경 유지 (격자선 가림)
        ws[gAddr] = { t:'s', v:'', s: cellBase({}) };
      }
    }

    // ─── 격자선 제거 — 3중 안전장치 ───
    // 1) 시트 뷰
    ws['!sheetViews'] = [{ showGridLines: false, showRowColHeaders: true }];
    // 2) 빈 셀 흰 fill 마스킹 (A1:Z + lastRow+10)
    const lastRow = aoa.length + 10;
    for (let r = 0; r < lastRow; r++) {
      for (let c = 0; c < 15; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t:'s', v:'', s:{ fill:{ patternType:'solid', fgColor:{ rgb:'FFFFFF' } } } };
      }
    }
    ws['!ref'] = 'A1:O' + lastRow;
    // 첫 행 freeze (헤더 고정)
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, en?'Attendance':'출근현황');
    // 3) 워크북 레벨
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [];
    wb.Workbook.Views[0] = Object.assign({}, wb.Workbook.Views[0] || {}, { showGridLines: false });

    XLSX.writeFile(wb, 'attendance_' + dateStr(new Date()) + '.xlsx');
  };

  // 초기화 — 카드가 펼쳐질 때 한 번 로드
  let _awInited = false;
  document.getElementById('card-attendance-status')?.addEventListener('toggle', async function(e) {
    if (this.open && !_awInited) {
      _awInited = true;
      initDateSelects();
      await loadTeachers();
      await loadRecords();
      awRender();
    }
  });
})();
