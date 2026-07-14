// ═══════════════════════════════════════════════════════════════
// adm-q3.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const fmt = (n) => (Number(n)||0).toLocaleString('ko-KR');
  const fmtP = (n) => '₱ ' + fmt(n);   // 강사 수업료 단위: 필리핀 페소
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleDateString('ko-KR') : '-';
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  let _prRows = [];
  let _prY = 0, _prM = 0;
  let _prRules = [];

  function initYearSelect() {
    const sel = document.getElementById('pr-year');
    if (!sel || sel.options.length > 0) return;
    const now = new Date();
    const y = now.getFullYear();
    for (let i = y; i >= y - 3; i--) sel.appendChild(new Option(i+'년', i));
    sel.value = y;
    // 🐛 월 옵션이 템플릿 문자열로 잘못 들어가 실제로는 비어 있던 버그 수정 — JS로 채운다
    const mSel = document.getElementById('pr-month');
    if (mSel && mSel.options.length === 0) {
      for (let m = 1; m <= 12; m++) mSel.appendChild(new Option(m + '월', m));
    }
    if (mSel) mSel.value = now.getMonth() + 1;
  }

  // ── 상태 배지 (수업별 상세용 — 누구나 알아보게 큰 글씨 + 색) ──
  function stBadge(st, isEn) {
    const M = {
      finish:          ['✅ 수업 완료', '✅ Finished',   '#dcfce7', '#166534'],
      student_absent:  ['🙅 학생 결석', '🙅 Absent',     '#fee2e2', '#991b1b'],
      teacher_no_show: ['⚠️ 강사 미입장', '⚠️ No-show',  '#ffedd5', '#9a3412'],
      upcoming:        ['⏳ 예정', '⏳ Upcoming',        '#f1f5f9', '#475569'],
    };
    const m = M[st] || M.finish;
    return `<span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11.5px;font-weight:800;background:${m[2]};color:${m[3]}">${isEn?m[1]:m[0]}</span>`;
  }

  // ── ⚙️ 공제 규칙 편집기 ──
  window.prToggleRules = async function(){
    const box = document.getElementById('pr-rules');
    if (box.style.display !== 'none') { box.style.display = 'none'; return; }
    box.style.display = '';
    await prLoadRules();
  };

  async function prLoadRules(){
    const isEn = (window.adminLang === 'en');
    const box = document.getElementById('pr-rules');
    box.innerHTML = `<div style="padding:14px;color:#6b7280">${isEn?'Loading rules…':'규칙 불러오는 중…'}</div>`;
    try {
      const r = await fetch('/api/admin/payroll/deduction-rules');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'load failed');
      _prRules = d.rules || [];
      const help = isEn
        ? 'Turn each rule on/off and set the amount. Changes apply the next time you click 🔍 Calculate.'
        : '규칙마다 켜기/끄기와 금액을 정할 수 있어요. 저장 후 「🔍 계산」을 다시 누르면 바로 반영됩니다.';
      box.innerHTML = `
        <div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:12px;padding:14px 16px">
          <div style="font-weight:800;font-size:13.5px;color:#92400e;margin-bottom:4px">⚙️ ${isEn?'Deduction Rules':'공제 규칙'}</div>
          <div style="font-size:12px;color:#a16207;margin-bottom:12px">${help}</div>
          ${_prRules.map((r,i)=>{
            const isPct = r.rule_type === 'policy_percent';
            const unit = isPct ? '%' : '₱';
            const desc = isPct
              ? (isEn?'0% = no pay when student is absent, 100% = full pay':'0%면 학생 결석 시 지급 없음, 100%면 전액 지급')
              : (isEn?'Deducted per lesson':'수업 1건당 차감되는 금액');
            return `
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 12px;background:#fff;border:1px solid #fde68a;border-radius:10px;margin-bottom:8px">
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;min-width:40px">
                <input type="checkbox" data-rule-en="${i}" ${r.enabled?'checked':''} style="width:18px;height:18px;accent-color:#f59e0b;cursor:pointer">
                <span style="font-size:11px;font-weight:700;color:${r.enabled?'#16a34a':'#9ca3af'}">${r.enabled?(isEn?'ON':'켜짐'):(isEn?'OFF':'꺼짐')}</span>
              </label>
              <div style="flex:1;min-width:180px">
                <div style="font-weight:800;font-size:13px;color:#1f2937">${esc(isEn?(r.label_en||r.label_ko):(r.label_ko||r.code))}</div>
                <div style="font-size:11px;color:#6b7280">${desc}</div>
              </div>
              <div style="display:flex;align-items:center;gap:4px">
                <span style="font-size:13px;font-weight:800;color:#b45309">${unit==='₱'?'− ₱':''}</span>
                <input type="number" min="0" data-rule-amt="${i}" value="${Number(r.amount)||0}"
                       style="width:90px;padding:7px 10px;font-size:14px;font-weight:800;border:1.5px solid #d1d5db;border-radius:8px;text-align:right">
                <span style="font-size:13px;font-weight:800;color:#b45309">${unit==='%'?'%':''}</span>
              </div>
            </div>`;
          }).join('')}
          <button onclick="prSaveRules()" style="padding:9px 18px;font-size:13px;font-weight:800;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:0;border-radius:8px;cursor:pointer">💾 ${isEn?'Save Rules':'규칙 저장'}</button>
        </div>`;
    } catch(e) {
      box.innerHTML = `<div style="padding:14px;color:#ef4444">${isEn?'Failed to load rules: ':'규칙 로드 실패: '}${esc(e.message)}</div>`;
    }
  }

  window.prSaveRules = async function(){
    const isEn = (window.adminLang === 'en');
    const box = document.getElementById('pr-rules');
    const rules = _prRules.map((r,i)=>{
      const en = box.querySelector(`[data-rule-en="${i}"]`);
      const amt = box.querySelector(`[data-rule-amt="${i}"]`);
      return { code: r.code, enabled: en ? en.checked : !!r.enabled, amount: amt ? Number(amt.value)||0 : r.amount };
    });
    try {
      const r = await fetch('/api/admin/payroll/deduction-rules', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ rules })
      });
      const d = await r.json();
      if (d.ok) { alert(isEn?'✅ Rules saved. Click 🔍 Calculate to apply.':'✅ 규칙 저장 완료. 「🔍 계산」을 다시 누르면 반영돼요.'); prLoadRules(); }
      else alert('❌ ' + (d.error||(isEn?'failed':'실패')));
    } catch(e) { alert('❌ '+e.message); }
  };

  // ── 📋 강사별 수업 상세 (Lesson Fee Summary) ──
  window.prShowDetail = async function(teacherId, teacherName){
    const isEn = (window.adminLang === 'en');
    const box = document.getElementById('pr-detail');
    box.innerHTML = `<div style="padding:16px;color:#6b7280;text-align:center">${isEn?'Loading lessons…':'수업 내역 불러오는 중…'}</div>`;
    box.scrollIntoView({ behavior:'smooth', block:'nearest' });
    try {
      const r = await fetch(`/api/admin/payroll/lessons?year=${_prY}&month=${_prM}&teacher_id=${teacherId}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error||'load failed');
      const s = d.summary || {};
      const past = (d.lessons||[]).filter(l=>l.status!=='upcoming');
      const upcoming = (d.lessons||[]).filter(l=>l.status==='upcoming');
      const T = isEn ? {
        title:'Lesson Fee Summary', close:'✕ Close', time:'Lesson Time', student:'Student', status:'Status',
        mins:'Min', rate:'Rate/10m', fee:'Fee', fb:'Feedback', ded:'Deduction', none:'No lessons this month.',
        fbOk:'✅ Done', fbNo:'❌ Missing', sum:'Summary', lessons:'Lessons', absent:'Absent', noShow:'No-show',
        noFb:'No feedback', lessonFee:'Lesson fee', dedTotal:'Deductions', final:'Final pay', upc:'upcoming lessons not included yet',
      } : {
        title:'수업별 정산 내역', close:'✕ 닫기', time:'수업 시간', student:'학생', status:'상태',
        mins:'분', rate:'10분 단가', fee:'수업료', fb:'당일 피드백', ded:'공제', none:'이 달에 수업이 없습니다.',
        fbOk:'✅ 작성', fbNo:'❌ 미작성', sum:'요약', lessons:'수업', absent:'학생 결석', noShow:'강사 미입장',
        noFb:'피드백 미작성', lessonFee:'수업료 합계', dedTotal:'공제 합계', final:'실지급액', upc:'회는 아직 하지 않은 수업이라 계산에 포함되지 않아요',
      };
      const tile = (label, value, bg, color) =>
        `<div style="padding:10px 14px;background:${bg};border-radius:10px;min-width:110px">
           <div style="font-size:11px;font-weight:700;color:${color};opacity:.8">${label}</div>
           <div style="font-size:17px;font-weight:900;color:${color}">${value}</div></div>`;
      const rows = past.map(l=>{
        const fbCell = l.status==='finish'
          ? (l.feedback_ok ? `<span style="color:#16a34a;font-weight:700">${T.fbOk}</span>` : `<span style="color:#dc2626;font-weight:700">${T.fbNo}</span>`)
          : '<span style="color:#9ca3af">—</span>';
        const dedCell = l.deduction_total > 0
          ? `<b style="color:#dc2626">− ${fmtP(l.deduction_total)}</b>`
          : '<span style="color:#9ca3af">—</span>';
        return `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:9px 12px;white-space:nowrap"><b>${esc(l.date)}</b> ${esc(l.start_time||'')}</td>
          <td style="padding:9px 12px">${esc(l.student_name || l.user_id || '-')}</td>
          <td style="padding:9px 12px;text-align:center">${stBadge(l.status, isEn)}</td>
          <td style="padding:9px 12px;text-align:right;color:#6b7280">${fmt(l.duration_minutes)}${T.mins}</td>
          <td style="padding:9px 12px;text-align:right;color:#6b7280">${fmtP(l.fee_per_10min)}</td>
          <td style="padding:9px 12px;text-align:right;font-weight:800;color:${l.amount>0?'#d97706':'#9ca3af'}">${fmtP(l.amount)}</td>
          <td style="padding:9px 12px;text-align:center">${fbCell}</td>
          <td style="padding:9px 12px;text-align:right">${dedCell}</td>
        </tr>`;
      }).join('');
      box.innerHTML = `
        <div style="background:#fff;border:1.5px solid #3b82f6;border-radius:14px;overflow:hidden">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;background:linear-gradient(135deg,#dbeafe,#eff6ff)">
            <div style="font-weight:900;font-size:14.5px;color:#1e3a8a">📋 ${esc(teacherName)} — ${_prY}.${String(_prM).padStart(2,'0')} ${T.title}</div>
            <button onclick="document.getElementById('pr-detail').innerHTML=''" style="padding:5px 12px;font-size:12px;background:#fff;border:1px solid #93c5fd;border-radius:99px;cursor:pointer;color:#1e40af;font-weight:700">${T.close}</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;background:#f8fafc">
            ${tile('📚 '+T.lessons, fmt(s.lesson_count)+(isEn?'':'회'), '#e0f2fe', '#075985')}
            ${tile('🙅 '+T.absent, fmt(s.absent_count)+(isEn?'':'회'), '#fee2e2', '#991b1b')}
            ${tile('⚠️ '+T.noShow, fmt(s.teacher_no_show_count)+(isEn?'':'회'), '#ffedd5', '#9a3412')}
            ${tile('📝 '+T.noFb, fmt(s.no_feedback_count)+(isEn?'':'회'), '#fef9c3', '#854d0e')}
            ${tile('💵 '+T.lessonFee, fmtP(s.pay_amount), '#dcfce7', '#166534')}
            ${tile('➖ '+T.dedTotal, '− '+fmtP(s.deduction_total), '#fee2e2', '#991b1b')}
            ${tile('💰 '+T.final, fmtP(s.final_amount), '#1e40af', '#ffffff')}
          </div>
          ${upcoming.length ? `<div style="padding:0 16px 8px;font-size:11.5px;color:#6b7280">⏳ ${isEn?upcoming.length+' '+T.upc:('예정 수업 '+upcoming.length+T.upc)}</div>` : ''}
          <div style="overflow-x:auto">
          ${past.length ? `<table style="width:100%;border-collapse:collapse;font-size:12.5px">
            <thead style="background:#f1f5f9"><tr>
              <th style="text-align:left;padding:9px 12px;color:#334155">${T.time}</th>
              <th style="text-align:left;padding:9px 12px;color:#334155">${T.student}</th>
              <th style="text-align:center;padding:9px 12px;color:#334155">${T.status}</th>
              <th style="text-align:right;padding:9px 12px;color:#334155">${T.mins}</th>
              <th style="text-align:right;padding:9px 12px;color:#334155">${T.rate}</th>
              <th style="text-align:right;padding:9px 12px;color:#334155">${T.fee}</th>
              <th style="text-align:center;padding:9px 12px;color:#334155">${T.fb}</th>
              <th style="text-align:right;padding:9px 12px;color:#334155">${T.ded}</th>
            </tr></thead><tbody>${rows}</tbody></table>`
          : `<div style="padding:26px;text-align:center;color:#6b7280">${T.none}</div>`}
          </div>
        </div>`;
    } catch(e) {
      box.innerHTML = `<div style="padding:16px;color:#ef4444">${isEn?'Failed: ':'상세 로드 실패: '}${esc(e.message)}</div>`;
    }
  };

  window.prCalculate = async function(){
    const isEn = (window.adminLang === 'en');
    const year = parseInt(document.getElementById('pr-year').value, 10);
    const month = parseInt(document.getElementById('pr-month').value, 10);
    _prY = year; _prM = month;
    const tbody = document.getElementById('pr-table');
    tbody.innerHTML = `<div style="padding:20px;color:#6b7280;text-align:center">${isEn?'Calculating…':'계산 중…'}</div>`;
    try {
      const r = await fetch(`/api/admin/payroll/calculate?year=${year}&month=${month}`);
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || (isEn?'Calculation failed':'계산 실패'));
      _prRows = d.rows || [];
      // 🎭🔐 유효 역할(실제 로그인 또는 미리보기) 반영 — 강사=본인 급여만, 지사/대리점/학부모/학생=차단.
      //   서버도 강사 로그인 시 본인 행만 내려주지만(2중 방어), 관리자의 '강사 모드 미리보기'에선
      //   서버 쿠키가 관리자라 전체가 오므로 여기서 유효 역할 기준으로 정직하게 걸러준다.
      const _prEffRole = (typeof window._effectiveRole === 'function') ? window._effectiveRole() : null;
      const _prPreview = (typeof window._isRolePreview === 'function') && window._isRolePreview();
      const _prSaveBtn0 = document.getElementById('pr-save-btn');
      if (_prEffRole === 'branch' || _prEffRole === 'agency' || _prEffRole === 'parent' || _prEffRole === 'student') {
        document.getElementById('pr-summary').innerHTML = isEn ? 'Payroll is visible only to HQ managers/executives and each teacher (own payslip).' : '급여는 본사 관리자·경영진(전체)과 교사 본인(본인 급여)만 볼 수 있습니다.';
        if (_prSaveBtn0){ _prSaveBtn0.disabled = true; _prSaveBtn0.style.opacity = '.5'; }
        tbody.innerHTML = `<div style="padding:30px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">${isEn?'Access restricted.':'열람 권한이 없습니다.'}</div>`;
        _prRows = [];
        return;
      }
      const _prTeacherView = _prEffRole === 'hq_teacher';
      if (_prTeacherView) {
        const _prOwnNm = (typeof window._effectiveOwnName === 'function') ? window._effectiveOwnName() : '';
        _prRows = _prRows.filter(r => window._payrollIsOwnRow(r, { name: _prOwnNm }));
      }
      const s = d.summary;
      const sFinal = s.total_final ?? s.total_amount;
      let summaryHtml = isEn
        ? `${year}-${String(month).padStart(2,'0')} · Teachers <b>${fmt(s.teacher_count)}</b> · Classes <b>${fmt(s.total_lessons)}</b> · Deductions <b style="color:#dc2626">− ${fmtP(s.total_deduction||0)}</b> · Final <b style="color:#d97706">${fmtP(sFinal)}</b> · Paid ${fmt(s.paid_count)}/${fmt(s.teacher_count)}`
        : `${year}년 ${month}월 · 강사 <b>${fmt(s.teacher_count)}</b>명 · 총 수업 <b>${fmt(s.total_lessons)}</b>회 · 공제 <b style="color:#dc2626">− ${fmtP(s.total_deduction||0)}</b> · 실지급 <b style="color:#d97706">${fmtP(sFinal)}</b> · 지급 ${fmt(s.paid_count)}/${fmt(s.teacher_count)}`;
      if (_prTeacherView) {
        // 강사 본인 뷰: 합계도 본인 것만 (전체 강사 수/총액 노출 방지)
        const _tf = _prRows.reduce((a,r)=>a+((r.final_amount ?? r.calculated_amount)||0),0);
        const _td = _prRows.reduce((a,r)=>a+((r.deduction_total||0)),0);
        const _tl = _prRows.reduce((a,r)=>a+((r.lesson_count||0)),0);
        summaryHtml = (isEn
          ? `👨‍🏫 Teacher Mode — your payslip only · ${year}-${String(month).padStart(2,'0')} · Classes <b>${fmt(_tl)}</b> · Deduction <b style="color:#dc2626">− ${fmtP(_td)}</b> · Final <b style="color:#d97706">${fmtP(_tf)}</b>`
          : `👨‍🏫 강사 모드 — 본인 급여만 · ${year}년 ${month}월 · 수업 <b>${fmt(_tl)}</b>회 · 공제 <b style="color:#dc2626">− ${fmtP(_td)}</b> · 실지급 <b style="color:#d97706">${fmtP(_tf)}</b>`);
      }
      document.getElementById('pr-summary').innerHTML = summaryHtml;
      const saveBtn = document.getElementById('pr-save-btn');
      // 강사는 저장(정산 확정) 불가 — 미리보기·실제 모두
      const _saveDisabled = (_prRows.length === 0) || _prTeacherView;
      saveBtn.disabled = _saveDisabled;
      saveBtn.style.opacity = _saveDisabled ? '.5' : '1';
      if (!_prRows.length) {
        const _emptyNote = _prTeacherView
          ? (_prPreview
              ? (isEn ? '👨‍🏫 Teacher Mode preview: a teacher sees ONLY their own payslip — other teachers are hidden.'
                      : '👨‍🏫 강사 모드 미리보기: 강사는 <b>본인 급여만</b> 보이고 다른 강사 급여는 가려집니다.')
              : (isEn ? 'No payslip found for your account this month.' : '이번 달 본인 급여명세서를 찾을 수 없습니다.'))
          : (isEn ? 'No teachers, or no classes this month.' : '강사가 없거나 해당 월에 수업이 없습니다.');
        tbody.innerHTML = `<div style="padding:30px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px;line-height:1.7">${_emptyNote}</div>`;
        return;
      }
      // 컬럼 헤더 + 셀 라벨 i18n
      const H = isEn ? {
        teacher:'Teacher', classes:'Classes', mins:'Total Min', rate:'Rate/10m',
        calc:'Lesson Fee', ded:'Deduction', fin:'Final Pay', adj:'Adjusted', status:'Status', actions:'Actions',
        paid:'Paid', pending:'Pending', cancel:'Cancel', markPaid:'✅ Mark Paid', detail:'📋 Detail',
        saveFirst:'Save first', minutes:' min', absent:' absent'
      } : {
        teacher:'강사', classes:'수업', mins:'총 분', rate:'10분 단가',
        calc:'수업료', ded:'공제', fin:'실지급액', adj:'조정 금액', status:'상태', actions:'조작',
        paid:'지급', pending:'대기', cancel:'취소', markPaid:'✅ 지급 완료', detail:'📋 상세',
        saveFirst:'먼저 저장', minutes:'분', absent:'결석'
      };
      tbody.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:linear-gradient(135deg,#fef3c7,#fde68a)"><tr>
          <th style="text-align:left;padding:10px 12px;color:#78350f">${H.teacher}</th>
          <th style="text-align:center;padding:10px 12px;color:#78350f">${H.classes}</th>
          <th style="text-align:right;padding:10px 12px;color:#78350f">${H.mins}</th>
          <th style="text-align:right;padding:10px 12px;color:#78350f">${H.rate}</th>
          <th style="text-align:right;padding:10px 12px;color:#78350f">${H.calc}</th>
          <th style="text-align:right;padding:10px 12px;color:#78350f">${H.ded}</th>
          <th style="text-align:right;padding:10px 12px;color:#78350f">${H.fin}</th>
          <th style="text-align:right;padding:10px 12px;color:#78350f">${H.adj}</th>
          <th style="text-align:center;padding:10px 12px;color:#78350f">${H.status}</th>
          <th style="text-align:center;padding:10px 12px;color:#78350f">${H.actions}</th>
        </tr></thead>
        <tbody>${_prRows.map((r, i) => {
          const fin = r.final_amount ?? r.calculated_amount;
          const subCnt = [];
          if (r.absent_count) subCnt.push(`🙅 ${r.absent_count}`);
          if (r.no_feedback_count) subCnt.push(`📝 ${r.no_feedback_count}`);
          return `
          <tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:9px 12px"><b>${esc(r.korean_name||'-')}</b>${r.english_name?'<br><span style="font-size:11px;color:#9ca3af">'+esc(r.english_name)+'</span>':''}</td>
            <td style="padding:9px 12px;text-align:center;font-weight:700">${fmt(r.lesson_count)}${subCnt.length?'<br><span style="font-size:10px;color:#dc2626">'+subCnt.join(' ')+'</span>':''}</td>
            <td style="padding:9px 12px;text-align:right;color:#6b7280">${fmt(r.total_minutes)}${H.minutes}</td>
            <td style="padding:9px 12px;text-align:right;color:#6b7280">${fmtP(r.fee_per_10min)}</td>
            <td style="padding:9px 12px;text-align:right;color:#6b7280">${fmtP(r.calculated_amount)}</td>
            <td style="padding:9px 12px;text-align:right;font-weight:700;color:${(r.deduction_total||0)>0?'#dc2626':'#9ca3af'}">${(r.deduction_total||0)>0?'− '+fmtP(r.deduction_total):'—'}</td>
            <td style="padding:9px 12px;text-align:right;font-weight:800;color:#d97706">${fmtP(fin)}</td>
            <td style="padding:8px 10px;text-align:right">
              <input type="number" value="${r.adjusted_amount ?? ''}" placeholder="${fmt(fin)}"
                     onchange="prRowAdjust(${i}, this.value)"
                     style="width:100px;padding:5px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:5px;text-align:right;font-family:'Inter',monospace" />
            </td>
            <td style="padding:9px 12px;text-align:center">
              ${r.status === 'paid'
                ? `<span style="color:#10b981;font-weight:700">✅ ${H.paid}</span><br><span style="font-size:10px;color:#9ca3af">${fmtDate(r.paid_at)}</span>`
                : `<span style="color:#9ca3af">${H.pending}</span>`}
            </td>
            <td style="padding:8px 10px;text-align:center;white-space:nowrap">
              <button onclick="prShowDetail(${r.teacher_id}, '${esc(r.korean_name||'')}')" style="padding:5px 10px;font-size:11px;background:linear-gradient(135deg,#3b82f6,#1e40af);color:#fff;border:0;border-radius:5px;cursor:pointer;font-weight:700">${H.detail}</button>
              ${r.payroll_id
                ? (r.status === 'paid'
                    ? `<button onclick="prMarkUnpaid(${r.payroll_id})" style="padding:5px 10px;font-size:11px;background:#9ca3af;color:#fff;border:0;border-radius:5px;cursor:pointer">${H.cancel}</button>`
                    : `<button onclick="prMarkPaid(${r.payroll_id},${fin})" style="padding:5px 10px;font-size:11px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;border-radius:5px;cursor:pointer;font-weight:700">${H.markPaid}</button>`)
                : `<span style="font-size:10.5px;color:#9ca3af">${H.saveFirst}</span>`}
            </td>
          </tr>`;}).join('')}</tbody>
      </table>`;
    } catch(e) {
      tbody.innerHTML = '<div style="padding:20px;color:#ef4444">계산 실패: '+esc(e.message)+'</div>';
    }
  };

  window.prRowAdjust = function(idx, val){
    if (_prRows[idx]) _prRows[idx].adjusted_amount = val === '' ? null : parseInt(val, 10);
  };

  window.prSaveAll = async function(){
    if (!_prRows.length) { alert('먼저 「🔍 계산」을 실행하세요.'); return; }
    if (!confirm(`${_prY}년 ${_prM}월 정산 ${_prRows.length}명을 저장하시겠습니까?`)) return;
    try {
      const r = await fetch('/api/admin/payroll/save', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ year: _prY, month: _prM, rows: _prRows })
      });
      const d = await r.json();
      if (d.ok) { alert(`✅ ${d.saved}건 저장 완료`); prCalculate(); }
      else alert('❌ ' + (d.error||'실패'));
    } catch(e) { alert('❌ '+e.message); }
  };

  window.prMarkPaid = async function(payrollId, defaultAmount){
    const amt = prompt('지급 금액 (조정 가능):', String(defaultAmount));
    if (amt === null) return;
    const memo = prompt('지급 메모 (옵션):', '');
    try {
      const r = await fetch('/api/admin/payroll/mark-paid', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ payroll_id: payrollId, paid_amount: parseInt(amt,10), memo })
      });
      const d = await r.json();
      if (d.ok) { alert('✅ 지급 완료 처리'); prCalculate(); }
      else alert('❌ ' + (d.error||'실패'));
    } catch(e) { alert('❌ '+e.message); }
  };

  window.prMarkUnpaid = async function(payrollId){
    if (!confirm('지급 완료를 취소(미지급으로 되돌리기)할까요?')) return;
    try {
      const r = await fetch('/api/admin/payroll/save', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ year: _prY, month: _prM, rows: _prRows.map(x => x.payroll_id === payrollId ? {...x, status:'pending'} : x) })
      });
      // 간단 처리: 다시 저장하면 status=pending 으로 리셋됨
      prCalculate();
    } catch(e) { alert('❌ '+e.message); }
  };

  window.prDownloadCsv = function(){
    const year = parseInt(document.getElementById('pr-year').value, 10);
    const month = parseInt(document.getElementById('pr-month').value, 10);
    location.href = `/api/admin/payroll/csv?year=${year}&month=${month}`;
  };

  function bindPayrollOpen() {
    const parent = document.getElementById('card-payroll-auto');
    if (parent && !parent.__prBound) {
      parent.__prBound = true;
      initYearSelect();
      parent.addEventListener('toggle', () => { if (parent.open) { initYearSelect(); prCalculate(); } });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindPayrollOpen);
  else bindPayrollOpen();
  // 🌐 언어 변경 시 테이블이 그려져 있으면 자동 재렌더
  document.addEventListener('mangoi:lang-changed', function(){
    const parent = document.getElementById('card-payroll-auto');
    if (parent && parent.open && (_prRows && _prRows.length)) prCalculate();
  });
})();
