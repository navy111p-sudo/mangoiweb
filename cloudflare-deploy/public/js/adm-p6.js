// ═══════════════════════════════════════════════════════════════
// adm-p6.js — admin.html 인라인 스크립트 추출 (2단계, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  // ── 데이터 소스: /api/admin/teachers + /api/admin/teacher-attendance (없으면 클라이언트 시드)
  // ── 시드 모드: localStorage 에 저장된 출근 기록을 사용 + 없으면 자동 생성 (관리자 데모용)
  const AW_LS_KEY = 'mango_attendance_seed_v1';
  let _awTeachers = []; // [{ id, name }]
  let _awRecords = [];  // [{ teacher_id, teacher_name, date, scheduled, actual, late_min }]
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

  // 강사 목록 로드 — 기존 ERP teacher_profiles 사용
  async function loadTeachers() {
    try {
      const r = await fetch('/api/admin/teacher-profiles?limit=200', { credentials:'include' });
      if (r.ok) {
        const j = await r.json();
        const rows = j.rows || j.items || j;
        if (Array.isArray(rows) && rows.length) {
          _awTeachers = rows.map(x => ({ id: x.id || x.korean_name, name: x.english_name || x.korean_name }));
        }
      }
    } catch(e) {}
    // fallback: 캡처에 보였던 강사들 사용
    if (!_awTeachers.length) {
      _awTeachers = ['Karl','Melca','Mo','Teacher Ana','Teacher Belle','Teacher Chaine','Teacher Diana','Teacher Eric'].map((n,i)=>({ id:'t'+i, name:n }));
    }
    // select 옵션
    const sel = document.getElementById('aw-teacher');
    _awTeachers.forEach(t => { const o=document.createElement('option'); o.value=t.id; o.textContent=t.name; sel.appendChild(o); });
  }

  // 출근 기록 로드 — DB endpoint 가 있으면 그걸 사용, 없으면 시드 생성
  async function loadRecords() {
    try {
      const r = await fetch('/api/admin/teacher-attendance?limit=500', { credentials:'include' });
      if (r.ok) {
        const j = await r.json();
        const rows = j.rows || j.items || j;
        if (Array.isArray(rows) && rows.length) { _awRecords = rows; return; }
      }
    } catch(e) {}
    // 시드: localStorage 에 있으면 사용, 없으면 자동 생성 (최근 14일)
    try {
      const saved = JSON.parse(localStorage.getItem(AW_LS_KEY) || 'null');
      if (Array.isArray(saved) && saved.length) { _awRecords = saved; return; }
    } catch(e){}
    // 자동 시드 — 결정적 (강사 ID + 날짜 해시 → 일관된 결과)
    _awRecords = [];
    for (let day = 13; day >= 0; day--) {
      const d = new Date(); d.setDate(d.getDate() - day);
      const dStr = dateStr(d);
      // 주말 제외
      const dow = d.getDay(); if (dow === 0 || dow === 6) continue;
      _awTeachers.forEach(t => {
        const seed = (String(t.id) + dStr).split('').reduce((a,c)=>a+c.charCodeAt(0), 0);
        const lateMin = (seed % 7 === 0) ? 0 : (seed % 5 === 0 ? Math.floor((seed%30)) : (seed % 3 === 0 ? (seed%6) : 0));
        const sched = '09:00';
        const [sh, sm] = sched.split(':').map(Number);
        const actMs = new Date(d).setHours(sh, sm + lateMin, 0, 0);
        const actDate = new Date(actMs);
        const actual = pad2(actDate.getHours()) + ':' + pad2(actDate.getMinutes());
        _awRecords.push({ teacher_id: t.id, teacher_name: t.name, date: dStr, scheduled: sched, actual, late_min: lateMin });
      });
    }
    localStorage.setItem(AW_LS_KEY, JSON.stringify(_awRecords));
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
    return html;
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
    return html;
  }

  function renderChart(rows) {
    const wrap = document.getElementById('aw-chart-wrap');
    wrap.style.display = 'block';
    document.getElementById('aw-table-wrap').style.display = 'none';
    const teachers = Array.from(new Set(rows.map(r => r.teacher_id))).map(id => {
      const t = _awTeachers.find(x => String(x.id) === String(id));
      return { id, name: t ? t.name : id };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));

    if (typeof Chart === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.onload = () => renderChart(rows);
      document.head.appendChild(s);
      return;
    }
    const en = isEn();
    if (_awChart) { _awChart.destroy(); _awChart = null; }

    // 강사별 통계 계산
    const data = teachers.map(t => {
      const trs = rows.filter(r => String(r.teacher_id) === String(t.id) && r.actual);
      const lateRecs = trs.filter(r => r.late_min > 0);
      const totalLate = lateRecs.reduce((a, r) => a + (r.late_min||0), 0);
      const totalDays = trs.length;
      const onTimePct = totalDays ? Math.round(((totalDays - lateRecs.length) / totalDays) * 100) : 0;
      return { name: t.name, totalLate, lateCount: lateRecs.length, onTimePct, totalDays };
    });
    // 정렬: 지각 누적이 많은 순서
    data.sort((a, b) => b.totalLate - a.totalLate);

    // 색상: 지각이 많을수록 빨강
    const maxLate = Math.max(...data.map(d => d.totalLate), 1);
    const barColors = data.map(d => {
      const ratio = d.totalLate / maxLate;
      if (ratio > 0.66) return { bg: 'rgba(239,68,68,0.85)', border: '#b91c1c' };
      if (ratio > 0.33) return { bg: 'rgba(245,158,11,0.85)', border: '#d97706' };
      if (ratio > 0)    return { bg: 'rgba(59,130,246,0.85)', border: '#1d4ed8' };
      return { bg: 'rgba(34,197,94,0.85)', border: '#15803d' };
    });

    // wrap inner — 듀얼 차트
    wrap.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:6px 0">' +
      '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;min-height:380px;position:relative"><canvas id="aw-chart-2"></canvas></div>' +
      '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;min-height:380px;position:relative"><canvas id="aw-chart2"></canvas></div>' +
    '</div>' +
    '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;min-height:280px;margin-top:14px;position:relative"><canvas id="aw-chart3"></canvas></div>';

    // 1) 막대: 강사별 지각 누적·횟수
    _awChart = new Chart(document.getElementById('aw-chart').getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.map(d => d.name),
        datasets: [
          {
            label: en?'Total late (min)':'지각 누적(분)',
            data: data.map(d => d.totalLate),
            backgroundColor: barColors.map(c => c.bg),
            borderColor: barColors.map(c => c.border),
            borderWidth: 1.5,
            borderRadius: 6,
            yAxisID: 'y'
          },
          {
            label: en?'Late count':'지각 횟수',
            data: data.map(d => d.lateCount),
            type: 'line',
            borderColor: '#7c3aed',
            backgroundColor: 'rgba(124,58,237,0.1)',
            borderWidth: 2.5,
            pointRadius: 4,
            pointBackgroundColor: '#7c3aed',
            tension: 0.3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12, weight: 600 }, padding: 12 } },
          title: { display: true, text: en?'Teacher Attendance — Late Minutes & Count':'강사별 지각 누적·횟수', font: { size: 14, weight: 700 }, padding: { top: 4, bottom: 14 } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', titleFont: { size: 12, weight: 700 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 8, borderColor: '#3b82f6', borderWidth: 1 }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45 } },
          y: { beginAtZero: true, position: 'left', title: { display: true, text: en?'Minutes':'분', color: '#dc2626' }, ticks: { color: '#dc2626' }, grid: { color: 'rgba(0,0,0,0.04)' } },
          y1: { beginAtZero: true, position: 'right', title: { display: true, text: en?'Count':'횟수', color: '#7c3aed' }, ticks: { color: '#7c3aed', stepSize: 1 }, grid: { display: false } }
        }
      }
    });

    // 2) 도넛: 정시 vs 지각 비율 (전체 합)
    const totalDaysAll = data.reduce((a, d) => a + d.totalDays, 0);
    const totalLateCnt = data.reduce((a, d) => a + d.lateCount, 0);
    const onTimeCnt = totalDaysAll - totalLateCnt;
    new Chart(document.getElementById('aw-chart2').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: [en?'On time':'정시 출근', en?'Late':'지각', en?'Absent':'미출근'],
        datasets: [{
          data: [onTimeCnt, totalLateCnt, Math.max(0, data.length * 7 - totalDaysAll)],  // 가정: 1주일 기준
          backgroundColor: ['#10b981','#f59e0b','#94a3b8'],
          borderColor: '#fff', borderWidth: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 12, weight: 600 }, padding: 14, boxWidth: 14 } },
          title: { display: true, text: en?'Overall On-time Rate':'전체 정시 출근율', font: { size: 14, weight: 700 }, padding: { top: 4, bottom: 14 } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', titleFont:{size:12,weight:700}, bodyFont:{size:12}, padding:10, cornerRadius:8 }
        },
        cutout: '60%'
      }
    });

    // 3) 가로 막대: 정시 출근율 % 랭킹 (모든 강사)
    const sortedByOnTime = [...data].sort((a,b) => b.onTimePct - a.onTimePct);
    new Chart(document.getElementById('aw-chart3').getContext('2d'), {
      type: 'bar',
      data: {
        labels: sortedByOnTime.map(d => d.name),
        datasets: [{
          label: en?'On-time rate (%)':'정시 출근율 (%)',
          data: sortedByOnTime.map(d => d.onTimePct),
          backgroundColor: sortedByOnTime.map(d => {
            if (d.onTimePct >= 95) return 'rgba(34,197,94,0.85)';
            if (d.onTimePct >= 80) return 'rgba(59,130,246,0.85)';
            if (d.onTimePct >= 60) return 'rgba(245,158,11,0.85)';
            return 'rgba(239,68,68,0.85)';
          }),
          borderColor: sortedByOnTime.map(d => {
            if (d.onTimePct >= 95) return '#15803d';
            if (d.onTimePct >= 80) return '#1d4ed8';
            if (d.onTimePct >= 60) return '#d97706';
            return '#b91c1c';
          }),
          borderWidth: 1.5,
          borderRadius: 4,
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: en?'On-time Rate Ranking':'강사별 정시 출근율 랭킹', font: { size: 14, weight: 700 }, padding: { top: 4, bottom: 14 } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', titleFont:{size:12,weight:700}, bodyFont:{size:12}, padding:10, cornerRadius:8,
            callbacks: { label: ctx => ' ' + ctx.parsed.x + '%' } }
        },
        scales: {
          x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
          y: { grid: { display: false }, ticks: { font: { size: 11, weight: 600 } } }
        }
      }
    });
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
      tableWrap.innerHTML = '<div style="padding:36px;text-align:center;color:#9ca3af;font-size:13px">' + (isEn()?'No attendance records in this range.':'선택 기간에 출근 기록이 없습니다.') + '</div>';
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
