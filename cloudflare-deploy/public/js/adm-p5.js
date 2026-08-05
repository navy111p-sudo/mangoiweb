// ═══════════════════════════════════════════════════════════════
// adm-p5.js — admin.html 인라인 스크립트 추출 (2단계, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  // 🗒 이 PC 메모 전용 키. 출결·지각 «기록» 은 이제 전부 서버에서 온다(localStorage 아님).
  //   여기 남는 것은 서버에 저장할 곳이 없는 지각사유·관리자답변 두 칸뿐이다.
  //   ⚠️ 예전 키(mango_class_attendance_seed_v1)에는 **지어낸 시드 데이터**가 들어 있다.
  //      다시 읽지 않는다. 남아 있어도 화면에 영향 없다.
  const CA_MEMO_KEY = 'mango_class_attendance_memo_v1';
  /** 서버 기록에서 «이 PC 메모»만 뽑아낸다 — 기록 전체를 브라우저에 쌓아 두지 않는다. */
  function _caMemo(rows) {
    const out = {};
    (rows || []).forEach(r => { if (r.reason || r.answer) out[r.id] = { reason: r.reason || '', answer: r.answer || '' }; });
    return out;
  }
  let _caTeachers = [];
  let _caRecords = [];   // [{ teacher_id, teacher_name, date, class_no, scheduled, class_min, actual, late_min, penalty, reason, answer, deleted }]
  let _caSeeded = false;    // (남겨 둠) true = 서버 데이터가 아님. 이제는 항상 false 다.
  let _caLoadError = '';    // 불러오기에 실패한 이유. 비어 있으면 정상.
  // 상태 배너 — 한/영 (강사 다수가 필리핀)
  function _caSeedBanner() {
    if (_caLoadError) {
      return '<div style="margin:0 0 10px;padding:10px 12px;border:1px solid #ef4444;background:rgba(239,68,68,0.10);'
        + 'border-radius:8px;color:#b91c1c;font-size:13px;font-weight:700">'
        + '기록을 불러오지 못했습니다. 아래 표는 비어 있습니다 — <b>없는 것이지 «0건»이 아닙니다.</b><br>'
        + '<span style="font-weight:500">Could not load the records. The table below is empty — this means '
        + '<b>unknown</b>, not «zero». (' + String(_caLoadError).slice(0, 80) + ')</span></div>';
    }
    if (!_caSeeded) return '';
    return '<div style="margin:0 0 10px;padding:10px 12px;border:1px solid #f59e0b;background:rgba(245,158,11,0.10);'
      + 'border-radius:8px;color:#b45309;font-size:13px;font-weight:700">'
      + '⚠️ 서버 미연동 — 아래는 실제 출결 기록이 아니라 예시(시드) 데이터입니다. 급여·별점 판단에 사용하지 마세요.<br>'
      + '<span style="font-weight:500">Not connected to the server — the rows below are sample data, not real attendance records.</span></div>';
  }
  let _caMode = 'byTeacher';
  let _caCharts = [];

  function pad2(n){ return String(n).padStart(2, '0'); }
  function dateStr(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
  function parseDate(s){ const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); }
  function isEn(){ return (typeof adminLang !== 'undefined' && adminLang === 'en'); }

  function initDateSelects() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth()+1, d = now.getDate();
    const fillY = sel => { for (let v = y-1; v <= y+1; v++) { const o=document.createElement('option'); o.value=v; o.textContent=v + (isEn()?'':' 년'); sel.appendChild(o); } sel.value = y; };
    const fillM = sel => { for (let v = 1; v <= 12; v++) { const o=document.createElement('option'); o.value=v; o.textContent=v + (isEn()?'':' 월'); sel.appendChild(o); } sel.value = m; };
    const fillD = sel => { for (let v = 1; v <= 31; v++) { const o=document.createElement('option'); o.value=v; o.textContent=v + (isEn()?'':' 일'); sel.appendChild(o); } sel.value = d; };
    fillY(document.getElementById('ca-from-y')); fillM(document.getElementById('ca-from-m')); fillD(document.getElementById('ca-from-d'));
    fillY(document.getElementById('ca-to-y'));   fillM(document.getElementById('ca-to-m'));   fillD(document.getElementById('ca-to-d'));
    const back = new Date(); back.setDate(back.getDate()-6);
    document.getElementById('ca-from-y').value = back.getFullYear();
    document.getElementById('ca-from-m').value = back.getMonth()+1;
    document.getElementById('ca-from-d').value = back.getDate();
    document.querySelectorAll('.ca-date, #ca-teacher').forEach(el => el.addEventListener('change', caRender));
  }

  function getRange() {
    return {
      from: new Date(+document.getElementById('ca-from-y').value, +document.getElementById('ca-from-m').value - 1, +document.getElementById('ca-from-d').value),
      to:   new Date(+document.getElementById('ca-to-y').value,   +document.getElementById('ca-to-m').value - 1,   +document.getElementById('ca-to-d').value),
    };
  }

  async function loadTeachers() {
    try {
      const r = await fetch('/api/admin/teacher-profiles?limit=200', { credentials:'include' });
      if (r.ok) {
        const j = await r.json();
        const rows = j.rows || j.items || j;
        if (Array.isArray(rows) && rows.length) {
          _caTeachers = rows.map(x => ({ id: x.id || x.korean_name, name: x.english_name || x.korean_name }));
        }
      }
    } catch(e) {}
    if (!_caTeachers.length) {
      _caTeachers = ['Karl','Melca','Mo','Teacher Ana','Teacher Belle','Teacher Chaine'].map((n,i)=>({ id:'t'+i, name:n }));
    }
    const sel = document.getElementById('ca-teacher');
    _caTeachers.forEach(t => { const o=document.createElement('option'); o.value=t.id; o.textContent=t.name; sel.appendChild(o); });
  }

  // ── 실제 출결·지각 기록 (2026-08-05 서버 연동) ─────────────────────────────
  //   🔴 이전 동작: 서버 엔드포인트가 없어서 **실제 강사 이름으로 지각·결강·별점을 지어냈다.**
  //      («Karl 3분 지각», «Melca 결강» 같은 것이 전부 계산식으로 만들어진 값이었다.)
  //      화면에는 경고 배너가 있었지만 **엑셀로 내보내면 배너가 사라져** 실기록처럼 보였다.
  //      이 카드는 급여 공제 판단에 쓰인다 → 지어낸 값이 급여로 갈 수 있는 경로였다.
  //   ✅ 지금: 급여 자동정산과 **같은 계산**(/api/admin/payroll/lessons?all=1)을 읽는다.
  //      같은 원천이라 «출석현황에서 본 지각»과 «급여에서 깎인 지각»이 어긋날 수 없다.
  //   ⚠️ 못 불러오면 **아무것도 지어내지 않는다.** 빈 표 + 이유를 적는다.
  //      틀린 숫자를 보여주는 것보다 «없다»고 말하는 편이 언제나 안전하다.
  async function loadRecords() {
    _caRecords = [];
    _caSeeded = false;
    _caLoadError = '';
    const { from, to } = getRange();
    // 급여 계산이 월 단위라 조회 범위가 걸친 달을 모두 불러 합친다(보통 1~2개월).
    const months = [];
    const cur = parseDate(from); cur.setDate(1);
    const end = parseDate(to);
    while (cur <= end && months.length < 6) {
      months.push({ y: cur.getFullYear(), m: cur.getMonth() + 1 });
      cur.setMonth(cur.getMonth() + 1);
    }
    try {
      const parts = await Promise.all(months.map(async ({ y, m }) => {
        const r = await fetch('/api/admin/payroll/lessons?all=1&year=' + y + '&month=' + m,
                              { credentials:'include', cache:'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (!j || !j.ok) throw new Error((j && j.error) || 'failed');
        return j.lessons || [];
      }));
      _caRecords = parts.flat().map(mapLessonToRecord).filter(Boolean);
      // 이 PC 에 적어 둔 지각사유·답변을 서버 기록 위에 다시 얹는다(기록 자체는 서버가 진실).
      try {
        const memo = JSON.parse(localStorage.getItem(CA_MEMO_KEY) || '{}');
        _caRecords.forEach(r => { const m = memo[r.id]; if (m) { r.reason = m.reason || ''; r.answer = m.answer || ''; } });
      } catch (e) { /* 메모가 깨져도 기록 표시는 막지 않는다 */ }
    } catch (e) {
      // 화면을 지어낸 값으로 채우지 않는다. 왜 비었는지만 정확히 말한다.
      _caRecords = [];
      _caLoadError = String((e && e.message) || e || 'unknown');
    }
  }

  /** 급여 계산의 수업 1건 → 이 표의 한 줄. 없는 값은 **추정하지 않고 비운다.** */
  function mapLessonToRecord(l) {
    if (!l || l.status === 'upcoming') return null;   // 아직 안 한 수업은 출결이 없다
    const lateMin = Number(l.late_minutes) || 0;
    const noShow  = (l.status === 'teacher_no_show');
    // 실제 입장 시각은 급여 계산이 내려주지 않는다 → **지어내지 않고**, 규정시각+지각분으로만
    //   표시한다. 지각분이 0이고 노쇼도 아니면 규정시각에 들어온 것으로 본다.
    let actual = '';
    if (!noShow) {
      const hm = String(l.start_time || '').slice(0, 5).split(':').map(Number);
      if (hm.length === 2 && !isNaN(hm[0])) {
        const t = hm[0] * 60 + hm[1] + lateMin;
        actual = pad2(Math.floor(t / 60) % 24) + ':' + pad2(t % 60);
      }
    }
    // 별점 = 급여에서 실제로 깎인 근거 그대로. 노쇼는 -10, 지각은 분당 -1(최대 -10).
    const penalty = noShow ? -10 : -Math.min(10, lateMin);
    return {
      id: String(l.schedule_id) + '_' + l.date,
      teacher_id: l.teacher_id, teacher_name: l.teacher_name || '',
      date: l.date, class_no: '', scheduled: String(l.start_time || '').slice(0, 5),
      class_min: Number(l.duration_minutes) || 0, actual,
      late_min: lateMin, penalty,
      // 지각사유·관리자답변은 서버에 저장할 곳이 아직 없다. 이 PC 메모로만 남는다.
      reason: '', answer: '', deleted: false,
    };
  }

  function filterRecords() {
    const { from, to } = getRange();
    const tid = document.getElementById('ca-teacher').value;
    return _caRecords.filter(r => {
      if (r.deleted) return false;
      const d = parseDate(r.date);
      if (d < from || d > to) return false;
      if (tid && String(r.teacher_id) !== String(tid)) return false;
      return true;
    });
  }

  function rowColor(r) {
    if (!r.actual) return '#9ca3af';
    if (r.penalty === 0) return '#10b981';
    if (r.penalty >= -3) return '#f59e0b';
    return '#ef4444';
  }
  function fmtMin(min) { if (!min) return '00:00'; const h=Math.floor(min/60), m=min%60; return pad2(h)+':'+pad2(m); }

  // 강사별 모드 — 컬럼 8개 (날짜·규정·수업·실제·경과·별점·사유·답변·삭제)
  function renderClassTable(rows, groupBy) {
    if (!rows.length) return _caSeedBanner() + '<div style="padding:30px;text-align:center;color:#9ca3af">데이터가 없습니다.</div>';
    const en = isEn();
    const L = en
      ? { date:'date', start:'start work time', clsmin:'Class minute', actual:'Actual enter time', elapsed:'elapsed time', penaltyTime:'penalty time', penalty:'Penalty', reason:'Reason', answer:'Answer', delete:'Delete' }
      : { date:'날짜', start:'규정출석시간', clsmin:'수업시간', actual:'실제출석시간', elapsed:'경과시간', penaltyTime:'별점시간', penalty:'별점', reason:'지각사유', answer:'관리자답변', delete:'별점삭제' };

    let groups; // [{ key, label, items, statTitle, totalDays }]
    if (groupBy === 'byTeacher') {
      const teachers = Array.from(new Set(rows.map(r => r.teacher_id))).map(id => {
        const t = _caTeachers.find(x => String(x.id) === String(id));
        return { id, name: t ? t.name : id };
      }).sort((a,b)=>a.name.localeCompare(b.name,'ko-KR'));
      groups = teachers.map(t => ({
        key: t.id, label: t.name,
        items: rows.filter(r => String(r.teacher_id) === String(t.id)).sort((a,b)=>a.date.localeCompare(b.date) || (a.scheduled||'').localeCompare(b.scheduled||'')),
      }));
    } else if (groupBy === 'byDate') {
      const dates = Array.from(new Set(rows.map(r => r.date))).sort();
      groups = dates.map(date => ({
        key: date, label: date,
        items: rows.filter(r => r.date === date).sort((a,b)=>(a.teacher_name||'').localeCompare(b.teacher_name||'','ko-KR')),
      }));
    } else { // byTeacherDate
      const map = new Map();
      rows.forEach(r => {
        const k = r.teacher_id + '|' + r.date;
        if (!map.has(k)) map.set(k, { key: k, label: (r.teacher_name||'') + ' · ' + r.date, items: [] });
        map.get(k).items.push(r);
      });
      groups = Array.from(map.values()).sort((a,b)=>a.label.localeCompare(b.label,'ko-KR'));
    }

    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(700px,1fr));gap:14px;padding:14px">';
    groups.forEach(g => {
      // 그룹 통계
      const items = g.items;
      const lateRecs = items.filter(r => r.actual && r.late_min > 0);
      const absentRecs = items.filter(r => !r.actual);
      const lateCount = lateRecs.length;
      const totalDays = items.length;
      const avgLatePerDay = totalDays ? (lateCount / totalDays).toFixed(2) : 0;
      const totalLateMin = lateRecs.reduce((a, r) => a + (r.late_min||0), 0);
      const avgLateMin = items.length ? Math.round(totalLateMin / items.length) : 0;
      const totalPenalty = items.reduce((a, r) => a + (r.penalty||0), 0);

      html += '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;display:flex;flex-direction:column">';
      // 그룹 헤더
      html += '<div style="background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff;padding:10px 14px;font-weight:700;font-size:14px;text-align:center">' + g.label + '</div>';

      // 메인 테이블
      html += '<div style="overflow-x:auto;flex:1"><table style="width:100%;font-size:11px;border-collapse:separate;border-spacing:0">';
      html += '<thead><tr style="background:#f8fafc">';
      // ✅ 일괄 선택용 체크박스 컬럼(맨 왼쪽) — 그룹(표) 단위 전체 선택
      html += '<th style="padding:7px 4px;width:30px;min-width:30px;border-bottom:1px solid #e5e7eb;text-align:center"><input type="checkbox" onchange="caToggleGroup(this)" title="이 표 전체 선택" style="cursor:pointer;width:14px;height:14px"></th>';
      ['date','start','clsmin','actual','elapsed','penaltyTime','penalty','reason','answer','delete'].forEach((k, i) => {
        const w = ['76px','76px','60px','76px','60px','60px','46px','110px','110px','60px'][i];
        html += '<th style="padding:7px 4px;font-size:9.5px;font-weight:700;color:#475569;border-bottom:1px solid #e5e7eb;text-align:center;line-height:1.4;min-width:' + w + ';width:' + w + '">' + L[k] + '<br><span style="font-weight:400;color:#94a3b8;font-size:8.5px">(' + ({date:'date',start:'start work time',clsmin:'Class minute',actual:'Actual enter time',elapsed:'elapsed time',penaltyTime:'penalty time',penalty:'Penalty',reason:'Reason',answer:'Answer',delete:'Delete'}[k]) + ')</span></th>';
      });
      html += '</tr></thead><tbody>';

      items.forEach((r, i) => {
        const c = rowColor(r);
        const stripe = i % 2 === 0 ? '#ffffff' : '#fafbfc';
        // ── [별점→행 배경] 0점=기본 / -1~-3=연노랑 / -4이하·결강=연빨강 ──
        const rowBg = (!r.actual || r.penalty <= -4) ? '#fef2f2'      // red-50 (중대/결강)
                    : (r.penalty <= -1)              ? '#fefce8'      // yellow-50 (경미 지각)
                    : stripe;                                         // 정상: 기본 줄무늬 유지
        const elapsed = !r.actual ? '결강' : (r.late_min === 0 ? '0m' : (r.late_min > 0 ? '+' + r.late_min + 'm' : r.late_min + 'm'));
        const penaltyTime = r.penalty < 0 ? Math.abs(r.penalty) + 'm' : '0m';
        const penaltyStars = r.penalty <= -10 ? '🚫' : (r.penalty < 0 ? '⭐'.repeat(Math.min(Math.abs(r.penalty), 5)) + (r.penalty < -5 ? '+' : '') : '');
        html += '<tr style="background:' + rowBg + '">';
        // ✅ 행 선택 체크박스(data-id로 일괄 처리 시 레코드 식별)
        html += '<td style="padding:6px 4px;text-align:center;border-bottom:1px solid #f1f5f9"><input type="checkbox" class="ca-rowcheck" data-id="' + r.id + '" onchange="caSyncBulk()" style="cursor:pointer;width:14px;height:14px"></td>';
        html += '<td style="padding:6px 4px;text-align:center;color:#1e293b;font-weight:600;border-bottom:1px solid #f1f5f9;font-size:11px">' + r.date + '</td>';
        html += '<td style="padding:6px 4px;text-align:center;color:#475569;border-bottom:1px solid #f1f5f9;font-variant-numeric:tabular-nums">' + (r.scheduled || '-') + '</td>';
        html += '<td style="padding:6px 4px;text-align:center;color:#475569;border-bottom:1px solid #f1f5f9">' + (r.class_min || 20) + 'm</td>';
        html += '<td style="padding:6px 4px;text-align:center;color:' + c + ';font-weight:700;border-bottom:1px solid #f1f5f9;font-variant-numeric:tabular-nums">' + (r.actual || '결강') + '</td>';
        html += '<td style="padding:6px 4px;text-align:center;color:' + c + ';border-bottom:1px solid #f1f5f9;font-size:10.5px">' + elapsed + '</td>';
        html += '<td style="padding:6px 4px;text-align:center;color:' + c + ';border-bottom:1px solid #f1f5f9;font-size:10.5px">' + penaltyTime + '</td>';
        html += '<td style="padding:6px 4px;text-align:center;border-bottom:1px solid #f1f5f9;color:' + c + ';font-weight:700">' + (r.penalty || 0) + '</td>';
        html += '<td style="padding:6px 4px;border-bottom:1px solid #f1f5f9;position:relative"><input type="text" data-id="' + r.id + '" data-field="reason" oninput="caUpdateField(this)" onfocus="caShowReasonTips(this)" value="' + (r.reason||'').replace(/"/g,'&quot;') + '" placeholder="-" style="width:100%;border:1px solid #e5e7eb;border-radius:4px;padding:3px 5px;font-size:10.5px;background:#fff" /></td>';
        html += '<td style="padding:6px 4px;border-bottom:1px solid #f1f5f9"><input type="text" data-id="' + r.id + '" data-field="answer" oninput="caUpdateField(this)" value="' + (r.answer||'').replace(/"/g,'&quot;') + '" placeholder="-" style="width:100%;border:1px solid #e5e7eb;border-radius:4px;padding:3px 5px;font-size:10.5px;background:#fff" /></td>';
        html += '<td style="padding:6px 4px;text-align:center;border-bottom:1px solid #f1f5f9"><button onclick="caResetPenalty(\'' + r.id + '\')" style="padding:2px 6px;font-size:10px;background:#fee2e2;border:1px solid #fca5a5;color:#b91c1c;border-radius:4px;cursor:pointer">' + (r.penalty === 0 ? '✓' : '↺') + '</button></td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';

      // 통계 표 (각 그룹 하단)
      html += '<div style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:10px 14px">';
      html += '<table style="width:100%;font-size:11px;border-collapse:separate;border-spacing:0">';
      html += '<tbody>';
      const statRow = (label, sub, val, color) => '<tr><td style="padding:5px 6px;font-weight:600;color:#475569">' + label + '<br><span style="font-size:9.5px;font-weight:400;color:#94a3b8">' + sub + '</span></td><td style="padding:5px 6px;text-align:right;font-weight:700;color:' + color + ';font-variant-numeric:tabular-nums">' + val + '</td></tr>';
      html += statRow('지각횟수', '(Number of lateness)', lateCount, '#3b82f6');
      html += statRow('지각평균', '(average of lateness, Number/Day)', avgLatePerDay, '#6366f1');
      html += statRow('지각누적(분)', '(total late minutes)', fmtMin(totalLateMin), '#ec4899');
      html += statRow('지각평균(분)', '(average late minutes)', avgLateMin, '#f59e0b');
      html += statRow('별점합계', '(total penalty)', totalPenalty, totalPenalty < 0 ? '#dc2626' : '#16a34a');
      html += '</tbody></table></div>';

      html += '</div>'; // 그룹 카드 끝
    });
    html += '</div>';
    return _caSeedBanner() + html;
  }

  function renderChart(rows) {
    const wrap = document.getElementById('ca-chart-wrap');
    document.getElementById('ca-table-wrap').style.display = 'none';
    wrap.style.display = 'block';
    const teachers = Array.from(new Set(rows.map(r => r.teacher_id))).map(id => {
      const t = _caTeachers.find(x => String(x.id) === String(id));
      return { id, name: t ? t.name : id };
    }).sort((a,b)=>a.name.localeCompare(b.name,'ko-KR'));

    if (typeof Chart === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
      s.onload = () => renderChart(rows);
      document.head.appendChild(s);
      return;
    }

    _caCharts.forEach(c => { try { c.destroy(); } catch(e){} }); _caCharts = [];

    const data = teachers.map(t => {
      const trs = rows.filter(r => String(r.teacher_id) === String(t.id));
      const onTime = trs.filter(r => r.actual && r.penalty === 0).length;
      const late = trs.filter(r => r.actual && r.penalty < 0).length;
      const absent = trs.filter(r => !r.actual).length;
      const totalPenalty = trs.reduce((a, r) => a + (r.penalty||0), 0);
      const total = trs.length;
      return { name: t.name, total, onTime, late, absent, totalPenalty };
    });

    wrap.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px"><div style="background:linear-gradient(180deg,#ffffff,#f8fafc);border-radius:14px;padding:16px;min-height:380px;position:relative;box-shadow:0 4px 16px -6px rgba(0,0,0,0.10),0 1px 3px rgba(0,0,0,0.04),inset 0 1px 0 rgba(255,255,255,0.9)"><canvas id="ca-chart-1"></canvas></div><div style="background:linear-gradient(180deg,#ffffff,#f8fafc);border-radius:14px;padding:16px;min-height:380px;position:relative;box-shadow:0 4px 16px -6px rgba(0,0,0,0.10),0 1px 3px rgba(0,0,0,0.04),inset 0 1px 0 rgba(255,255,255,0.9)"><canvas id="ca-chart-2"></canvas></div></div><div style="background:linear-gradient(180deg,#ffffff,#f8fafc);border-radius:14px;padding:16px;min-height:300px;margin-top:14px;position:relative;box-shadow:0 4px 16px -6px rgba(0,0,0,0.10),0 1px 3px rgba(0,0,0,0.04),inset 0 1px 0 rgba(255,255,255,0.9)"><canvas id="ca-chart-3"></canvas></div>';

    // ── 입체 효과 헬퍼: 막대용 세로 그라디언트 fill ──
    function makeBarGrad(ctx, area, top, bottom) {
      if (!area) return top;
      const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      return g;
    }
    // ── 입체 효과: 도넛 그림자 + 외곽 글로우 (chart 영역에 drawShadow plugin 등록) ──
    const shadowPlugin = {
      id: 'shadowPlugin',
      beforeDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.shadowColor = 'rgba(15,23,42,0.18)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;
      },
      afterDatasetsDraw(chart) { chart.ctx.restore(); }
    };
    const en = isEn();

    // ━━━ 1) 누적 막대: 강사별 정시·지각·결강 ━━━
    _caCharts.push(new Chart(document.getElementById('ca-chart-1').getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.map(d => d.name),
        datasets: [
          {
            label: en ? 'On time' : '정시',
            data: data.map(d => d.onTime),
            backgroundColor: ctx => makeBarGrad(ctx.chart.ctx, ctx.chart.chartArea, '#34d399', '#059669'),
            borderColor: '#047857', borderWidth: 1.5, borderRadius: 8,
            borderSkipped: false,
          },
          {
            label: en ? 'Late' : '지각',
            data: data.map(d => d.late),
            backgroundColor: ctx => makeBarGrad(ctx.chart.ctx, ctx.chart.chartArea, '#fcd34d', '#d97706'),
            borderColor: '#b45309', borderWidth: 1.5, borderRadius: 8,
            borderSkipped: false,
          },
          {
            label: en ? 'Absent' : '결강',
            data: data.map(d => d.absent),
            backgroundColor: ctx => makeBarGrad(ctx.chart.ctx, ctx.chart.chartArea, '#fca5a5', '#b91c1c'),
            borderColor: '#991b1b', borderWidth: 1.5, borderRadius: 8,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 1100, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'top', labels: { font: { size: 12, weight: 600 }, padding: 14, boxWidth: 14, boxHeight: 14, usePointStyle: false, color: '#1e293b' } },
          title: { display: true, text: en ? 'Class Attendance by Teacher (per class)' : '강사별 출석 분포 (수업 단위)', font: { size: 14, weight: 800 }, color: '#0f172a', padding: { top: 4, bottom: 14 } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', titleFont:{size:13,weight:700}, bodyFont:{size:12}, cornerRadius: 10, padding: 12, displayColors: true, borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: 600 }, color: '#475569' } },
          y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 }, color: '#64748b' } },
        }
      }
    }));

    // ━━━ 2) 도넛: 전체 출석 비율 ━━━
    const allTotal = data.reduce((a,d)=>a+d.total,0);
    const allOnTime = data.reduce((a,d)=>a+d.onTime,0);
    const allLate = data.reduce((a,d)=>a+d.late,0);
    const allAbsent = data.reduce((a,d)=>a+d.absent,0);
    // 도넛 그라디언트 (반경 방향)
    function makeRadialGrad(ctx, cx, cy, r, inner, outer) {
      const g = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
      g.addColorStop(0, inner);
      g.addColorStop(1, outer);
      return g;
    }
    _caCharts.push(new Chart(document.getElementById('ca-chart-2').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: en ? ['On time','Late','Absent'] : ['정시','지각','결강'],
        datasets: [{
          data: [allOnTime, allLate, allAbsent],
          backgroundColor: ctx => {
            const chart = ctx.chart;
            const area = chart.chartArea;
            if (!area) return ['#10b981','#f59e0b','#ef4444'][ctx.dataIndex];
            const cx = (area.left + area.right) / 2;
            const cy = (area.top + area.bottom) / 2;
            const r = Math.min(area.right - area.left, area.bottom - area.top) / 2;
            const palettes = [['#6ee7b7','#047857'], ['#fde68a','#b45309'], ['#fca5a5','#991b1b']];
            const [inner, outer] = palettes[ctx.dataIndex] || ['#94a3b8','#475569'];
            return makeRadialGrad(chart.ctx, cx, cy, r, inner, outer);
          },
          borderColor: '#fff', borderWidth: 4,
          hoverOffset: 14,
          hoverBorderColor: '#fff', hoverBorderWidth: 5,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '62%',
        animation: { animateRotate: true, animateScale: true, duration: 1200, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 12, weight: 600 }, padding: 14, boxWidth: 14, color: '#1e293b' } },
          title: {
            display: true,
            text: en ? ('Total Attendance Ratio (' + allTotal + ' classes)') : ('전체 출석 비율 (총 ' + allTotal + '건)'),
            font: { size: 14, weight: 800 }, color: '#0f172a', padding: { top: 4, bottom: 14 }
          },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', titleFont:{size:13,weight:700}, bodyFont:{size:12}, cornerRadius: 10, padding: 12,
            callbacks: {
              label: ctx => {
                const v = ctx.parsed;
                const pct = allTotal ? Math.round(v / allTotal * 100) : 0;
                return ' ' + ctx.label + ': ' + v + (en ? ' classes' : '건') + ' (' + pct + '%)';
              }
            }
          }
        }
      },
      plugins: [shadowPlugin]
    }));

    // ━━━ 3) 가로 막대: 강사별 누적 별점 (낮은 순) ━━━
    const sortedByPenalty = [...data].sort((a,b)=>a.totalPenalty - b.totalPenalty);
    _caCharts.push(new Chart(document.getElementById('ca-chart-3').getContext('2d'), {
      type: 'bar',
      data: {
        labels: sortedByPenalty.map(d => d.name),
        datasets: [{
          label: en ? 'Total Penalty' : '별점 합계',
          data: sortedByPenalty.map(d => d.totalPenalty),
          backgroundColor: ctx => {
            const v = ctx.parsed?.x ?? 0;
            const area = ctx.chart.chartArea;
            const cv = ctx.chart.ctx;
            if (!area) return v <= -20 ? '#b91c1c' : (v < 0 ? '#d97706' : '#059669');
            const g = cv.createLinearGradient(area.left, 0, area.right, 0);
            if (v <= -20) { g.addColorStop(0, '#fca5a5'); g.addColorStop(1, '#991b1b'); }
            else if (v < 0) { g.addColorStop(0, '#fcd34d'); g.addColorStop(1, '#b45309'); }
            else { g.addColorStop(0, '#6ee7b7'); g.addColorStop(1, '#047857'); }
            return g;
          },
          borderColor: sortedByPenalty.map(d => d.totalPenalty <= -20 ? '#7f1d1d' : (d.totalPenalty < 0 ? '#92400e' : '#065f46')),
          borderWidth: 2, borderRadius: 10, borderSkipped: false,
        }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        animation: { duration: 1100, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          title: { display: true, text: en ? 'Cumulative Penalty by Teacher (lowest first)' : '강사별 누적 별점 (낮은 순)', font: { size: 14, weight: 800 }, color: '#0f172a', padding: { top: 4, bottom: 14 } },
          tooltip: { backgroundColor: 'rgba(15,23,42,0.95)', titleFont:{size:13,weight:700}, bodyFont:{size:12}, cornerRadius: 10, padding: 12 }
        },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11 }, color: '#64748b' } },
          y: { grid: { display: false }, ticks: { font: { size: 11, weight: 600 }, color: '#1e293b' } }
        }
      }
    }));
  }

  function caRender() {
    const rows = filterRecords();
    const tableWrap = document.getElementById('ca-table-wrap');
    const chartWrap = document.getElementById('ca-chart-wrap');
    if (_caMode === 'chart') { renderChart(rows); return; }
    chartWrap.style.display = 'none';
    tableWrap.style.display = 'block';
    if (!rows.length) {
      tableWrap.innerHTML = '<div style="padding:36px;text-align:center;color:#9ca3af;font-size:13px">' + (isEn()?'No records.':'기록이 없습니다.') + '</div>';
      return;
    }
    tableWrap.innerHTML = renderClassTable(rows, _caMode);
    if (typeof caSyncBulk === 'function') caSyncBulk();   // 재렌더 후 선택 카운트/버튼 초기화
  }

  window.caSetMode = function(mode) {
    _caMode = mode;
    document.querySelectorAll('.ca-mode-btn').forEach(b => {
      const active = b.dataset.mode === mode;
      b.style.background = active ? '#a855f7' : '#fff';
      b.style.color = active ? '#fff' : '#a855f7';
      b.style.border = active ? '0' : '1px solid #a855f7';
    });
    caRender();
  };

  // 지각사유·관리자답변은 서버에 저장할 곳이 아직 없다 → **이 PC 메모**로만 남는다.
  //   그래도 저장은 해 둔다(입력 중 새로고침에 날아가지 않게). 다만 «회사 기록»이 아니다.
  window.caUpdateField = function(input) {
    const id = input.dataset.id, field = input.dataset.field, val = input.value;
    const r = _caRecords.find(x => x.id === id);
    if (r) { r[field] = val; try { localStorage.setItem(CA_MEMO_KEY, JSON.stringify(_caMemo(_caRecords))); } catch(e){} }
  };

  // 🔴 별점 초기화는 «화면에서만» 0으로 만들면 안 된다 — 급여는 그대로 깎인 채로 남아
  //   화면과 급여가 조용히 어긋난다(예전 동작이 그랬다: localStorage 에만 반영).
  //   별점의 근거는 «지각분»이고, 그것을 고치는 **진짜 입구가 이미 서버에 있다**
  //   (POST /api/admin/payroll/late-minutes — 급여 상세 화면이 쓰는 그 엔드포인트).
  //   그래서 여기서도 같은 곳에 쓴다. 돈이 실제로 바뀌므로 확인 문구에 그 사실을 적는다.
  window.caResetPenalty = async function(id) {
    const r = _caRecords.find(x => x.id === id); if (!r) return;
    const en = isEn();
    if (r.penalty === 0) return;
    if (!confirm(en
        ? 'Set the late minutes of this lesson to 0?\nThis removes the deduction from the teacher\'s pay as well.'
        : '이 수업의 지각분을 0으로 만들까요?\n급여에서 깎인 공제도 함께 사라집니다.')) return;
    const schedId = String(id).split('_')[0];
    try {
      const res = await fetch('/api/admin/payroll/late-minutes', {
        method:'POST', credentials:'include', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ schedule_id: Number(schedId), lesson_date: r.date, minutes: 0 })
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.ok) throw new Error((j && j.error) || ('HTTP ' + res.status));
      await loadRecords();            // 서버가 진실 — 다시 읽어서 그린다
      caRender();
    } catch (e) {
      alert((en ? 'Could not save: ' : '저장하지 못했습니다: ') + String((e && e.message) || e));
    }
  };

  // ───────────────────────────────────────────────────────────────
  // [기능 2] 지각사유 자주 쓰는 사유 팝업 팁
  //   입력칸 포커스 시 칩 목록을 띄우고, 칩을 누르면 자동 입력된다.
  // ───────────────────────────────────────────────────────────────
  const CA_QUICK_REASONS = ['네트워크 지연', '개인 사정', '이전 수업 연장', '기기 문제', '학생 요청'];
  function caCloseReasonTips() { document.querySelectorAll('.ca-reason-tips').forEach(el => el.remove()); }
  window.caShowReasonTips = function(input) {
    caCloseReasonTips();                                  // 다른 셀에 열린 팝업 정리
    const td = input.closest('td'); if (!td) return;
    const box = document.createElement('div');
    box.className = 'ca-reason-tips';
    box.style.cssText = 'position:absolute;z-index:60;left:4px;top:100%;margin-top:2px;display:flex;flex-wrap:wrap;gap:3px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:5px;box-shadow:0 6px 18px -6px rgba(0,0,0,.28);max-width:230px';
    CA_QUICK_REASONS.forEach(text => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = text;
      chip.style.cssText = 'font-size:10px;border:0;border-radius:999px;background:#ede9fe;color:#6b21a8;padding:2px 8px;cursor:pointer;white-space:nowrap';
      // mousedown: input의 blur보다 먼저 실행돼야 팝업이 닫히기 전에 값이 입력됨
      chip.addEventListener('mousedown', e => {
        e.preventDefault();
        input.value = text;
        caUpdateField(input);                             // 변경 즉시 저장
        caCloseReasonTips();
      });
      box.appendChild(chip);
    });
    td.appendChild(box);
    input.addEventListener('blur', () => setTimeout(caCloseReasonTips, 150), { once:true });
  };

  // ───────────────────────────────────────────────────────────────
  // [기능 3] 일괄 처리 — 체크박스 선택 + 선택 항목 별점 일괄 복구
  // ───────────────────────────────────────────────────────────────
  // (3-a) 표 헤더 전체선택 → 해당 표의 모든 행 체크박스 동기화
  window.caToggleGroup = function(master) {
    const table = master.closest('table'); if (!table) return;
    table.querySelectorAll('.ca-rowcheck').forEach(cb => { cb.checked = master.checked; });
    caSyncBulk();
  };
  // (3-b) 선택 개수에 따라 일괄 버튼 라벨/활성 상태 갱신
  window.caSyncBulk = function() {
    const n = document.querySelectorAll('.ca-rowcheck:checked').length;
    const btn = document.getElementById('ca-bulk-btn');
    if (!btn) return;
    btn.disabled = (n === 0);
    btn.style.opacity = (n === 0) ? '0.45' : '1';
    const cnt = btn.querySelector('.ca-bulk-count');
    if (cnt) cnt.textContent = '(' + n + ')';
  };
  // (3-c) 선택 항목 일괄 정상 처리 — 지각분을 0으로. **서버(급여)에 실제로 반영된다.**
  //   예전에는 localStorage 에만 써서, 화면은 «정상»인데 급여는 계속 깎이고 있었다.
  window.caBulkReset = async function() {
    const checked = Array.from(document.querySelectorAll('.ca-rowcheck:checked'));
    if (!checked.length) return;
    const en = isEn();
    const targets = checked.map(cb => _caRecords.find(x => x.id === cb.dataset.id))
                           .filter(r => r && r.penalty !== 0);
    if (!targets.length) { alert(en ? 'Nothing to reset.' : '되돌릴 것이 없습니다.'); return; }
    if (!confirm(en
        ? ('Set the late minutes of ' + targets.length + ' lesson(s) to 0?\nThis removes those deductions from pay as well.')
        : ('선택한 ' + targets.length + '건의 지각분을 0으로 만들까요?\n급여에서 깎인 공제도 함께 사라집니다.'))) return;
    let fail = 0;
    // 한 건씩 순서대로 — 한꺼번에 던지면 실패가 섞였을 때 무엇이 반영됐는지 알 수 없다.
    for (const r of targets) {
      try {
        const res = await fetch('/api/admin/payroll/late-minutes', {
          method:'POST', credentials:'include', headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({ schedule_id: Number(String(r.id).split('_')[0]), lesson_date: r.date, minutes: 0 })
        });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j || !j.ok) fail++;
      } catch (e) { fail++; }
    }
    await loadRecords();
    caRender();
    if (fail) alert(en ? (fail + ' of them could not be saved.') : (fail + '건은 저장하지 못했습니다.'));
  };

  window.caExportExcel = function() {
    if (typeof XLSX === 'undefined') { alert('XLSX library not loaded'); return; }
    const rows = filterRecords();
    if (!rows.length) { alert('데이터가 없습니다.'); return; }
    const en = isEn();
    // 🔴 화면의 경고 배너는 **엑셀로 따라가지 않는다.** 파일만 보면 실기록과 구분이 안 된다.
    //   실제로 이 경로로 지어낸 지각·결강이 실기록처럼 빠져나갈 수 있었다(급여 사고 직전).
    //   → 서버 데이터가 아니면 아예 내보내지 않는다. 조건부 표시로는 부족하다.
    if (_caSeeded) {
      alert(en ? 'This table is sample data, not real records. Export is blocked.'
               : '이 표는 실제 기록이 아니라 예시 데이터입니다. 내보내기를 막았습니다.');
      return;
    }
    if (_caLoadError) {
      alert(en ? 'Records could not be loaded, so there is nothing to export.'
               : '기록을 불러오지 못해 내보낼 것이 없습니다.');
      return;
    }
    const headers = ['날짜 (date)','강사명 (teacher)','수업번호 (class no.)','규정출석시간 (start work time)','수업시간(분) (Class minute)','실제출석시간 (Actual enter time)','경과시간 (elapsed time)','별점시간(분) (penalty time)','별점 (Penalty)','지각사유 (Reason)','관리자답변 (Answer)'];
    const aoa = [headers];
    const sorted = rows.slice().sort((a,b) => a.date.localeCompare(b.date) || (a.teacher_name||'').localeCompare(b.teacher_name||'','ko-KR') || (a.scheduled||'').localeCompare(b.scheduled||''));
    sorted.forEach(r => {
      const elapsed = !r.actual ? '결강' : (r.late_min > 0 ? '+' + r.late_min + 'm' : (r.late_min < 0 ? r.late_min + 'm' : '0m'));
      aoa.push([r.date, r.teacher_name, r.class_no, r.scheduled, r.class_min, r.actual || '', elapsed, Math.abs(r.penalty||0), r.penalty || 0, r.reason || '', r.answer || '']);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:13},{wch:18},{wch:10},{wch:24},{wch:18},{wch:24},{wch:14},{wch:18},{wch:12},{wch:30},{wch:30}];
    ws['!rows'] = [{ hpt: 30 }];
    const headerColors = ['0EA5E9','3B82F6','06B6D4','6366F1','8B5CF6','A855F7','EC4899','F43F5E','EF4444','64748B','64748B'];
    headerColors.forEach((rgb, i) => {
      const addr = (i < 26 ? String.fromCharCode(65+i) : 'A'+String.fromCharCode(65+i-26)) + '1';
      if (!ws[addr]) ws[addr] = { t:'s', v: headers[i] };
      ws[addr].s = { font:{ bold:true, color:{ rgb:'FFFFFF' }, sz:11 }, fill:{ patternType:'solid', fgColor:{ rgb } }, alignment:{ horizontal:'center', vertical:'center', wrapText:true } };
    });
    for (let i = 2; i <= aoa.length; i++) {
      const r = sorted[i-2];
      const rowBg = !r.actual ? 'FEE2E2' : (r.penalty < -3 ? 'FEF3C7' : (r.penalty < 0 ? 'FFFBEB' : 'F0FDF4'));
      for (let c = 0; c < headers.length; c++) {
        const addr = (c < 26 ? String.fromCharCode(65+c) : 'A'+String.fromCharCode(65+c-26)) + i;
        if (!ws[addr]) ws[addr] = { t:'s', v:'' };
        ws[addr].s = { font:{ sz:10 }, fill:{ patternType:'solid', fgColor:{ rgb: rowBg } }, alignment:{ horizontal:'center', vertical:'center' } };
      }
    }
    ws['!sheetViews'] = [{ showGridLines: false }];
    const lastRow = aoa.length + 5;
    for (let r = 0; r < lastRow; r++) for (let c = 0; c < 15; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t:'s', v:'', s:{ fill:{ patternType:'solid', fgColor:{ rgb:'FFFFFF' } } } };
    }
    ws['!ref'] = 'A1:O' + lastRow;
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, en?'ClassAttendance':'출석현황');
    if (!wb.Workbook) wb.Workbook = {};
    if (!wb.Workbook.Views) wb.Workbook.Views = [];
    wb.Workbook.Views[0] = { showGridLines: false };
    XLSX.writeFile(wb, 'class_attendance_' + dateStr(new Date()) + '.xlsx');
  };

  let _caInited = false;
  async function caEnsureInit() {
    if (_caInited) return;
    _caInited = true;
    initDateSelects();
    await loadTeachers();
    await loadRecords();
    caRender();
  }
  document.getElementById('card-class-attendance')?.addEventListener('toggle', async function(e) {
    if (this.open && !_caInited) { await caEnsureInit(); }
  });

  // 🔎 AI 운영비서 딥링크 — 질문에서 강사명·모드를 읽어 출석현황(수업당 출결) 카드를
  //    열고 + 해당 강사 자동선택 + 알맞은 보기(강사별/날짜별/강사·날짜별/그래프)로 전환한다.
  //    반환: {teacher, mode, modeLabel, modeLabelEn, found}
  window.caAttendanceFromQuery = async function(q) {
    q = String(q || '');
    const card = document.getElementById('card-class-attendance');
    if (card && card.tagName === 'DETAILS' && !card.open) { card.open = true; }
    await caEnsureInit();

    // 1) 보기 모드 판정 (그래프/날짜별/강사·날짜별/강사별)
    let mode = 'byTeacher', modeLabel = '강사별', modeLabelEn = 'By Teacher';
    if (/그래프|차트|chart|graph/i.test(q)) { mode = 'chart'; modeLabel = '그래프'; modeLabelEn = 'Chart'; }
    else if (/강사[\s·\-]*날짜|날짜[\s·\-]*강사|teacher[\s·\-]*date/i.test(q)) { mode = 'byTeacherDate'; modeLabel = '강사·날짜별'; modeLabelEn = 'By Teacher·Date'; }
    else if (/날짜별|일자별|by\s*date|daily/i.test(q)) { mode = 'byDate'; modeLabel = '날짜별'; modeLabelEn = 'By Date'; }

    // 2) 강사명 매칭 (로드된 강사 목록과 대조, 대소문자 무시·부분일치)
    const sel = document.getElementById('ca-teacher');
    const lc = q.toLowerCase();
    let found = null;
    for (let i = 0; i < _caTeachers.length; i++) {
      const nm = String(_caTeachers[i].name || '').trim();
      if (nm && lc.indexOf(nm.toLowerCase()) >= 0) { found = _caTeachers[i]; break; }
    }
    if (found) {
      if (sel) sel.value = found.id;
      if (mode === 'byDate') { mode = 'byTeacher'; modeLabel = '강사별'; modeLabelEn = 'By Teacher'; }
    } else if (sel) {
      sel.value = '';
    }

    // 3) 렌더 + 카드로 스크롤 + 하이라이트
    if (typeof window.caSetMode === 'function') { window.caSetMode(mode); }
    else { _caMode = mode; caRender(); }
    try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    try {
      const prev = card.style.boxShadow;
      card.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.6)';
      setTimeout(function(){ card.style.boxShadow = prev; }, 1800);
    } catch (e) {}

    return { teacher: found ? found.name : null, mode: mode, modeLabel: modeLabel, modeLabelEn: modeLabelEn, found: !!found };
  };
})();
