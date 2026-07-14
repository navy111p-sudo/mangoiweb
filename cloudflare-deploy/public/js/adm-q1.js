// ═══════════════════════════════════════════════════════════════
// adm-q1.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR', { dateStyle:'short', timeStyle:'short' }) : '-';

  // 🤖 AI 평가서 자동 작성
  window.aedGenerate = async function(){
    const out = document.getElementById('aed-result');
    out.innerHTML = '<div style="color:#a3b3d1">🤖 AI 가 작성 중… (10~15초)</div>';
    const payload = {
      student_name: document.getElementById('aed-student-name').value.trim(),
      teacher_name: document.getElementById('aed-teacher-name').value.trim(),
      lesson_title: document.getElementById('aed-lesson-title').value.trim(),
      scores: {
        participation: parseInt(document.getElementById('aed-sc-part').value) || null,
        comprehension: parseInt(document.getElementById('aed-sc-comp').value) || null,
        homework: parseInt(document.getElementById('aed-sc-hw').value) || null,
        attitude: parseInt(document.getElementById('aed-sc-att').value) || null,
        speaking: parseInt(document.getElementById('aed-sc-sp').value) || null,
      },
      keywords: document.getElementById('aed-keywords').value.split(',').map(s=>s.trim()).filter(Boolean),
    };
    try {
      const r = await fetch('/api/eval/ai-draft', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const draft = d.draft;
      out.innerHTML = `
        <div style="padding:18px;background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.05));border:1px solid rgba(99,102,241,0.3);border-radius:12px">
          <div style="font-weight:800;color:#c4b5fd;margin-bottom:10px">✨ AI 초안 — 검토 후 수정 가능</div>
          ${['strengths','improvements','next_goals','teacher_comment'].map((k,i)=>{
            const label = ['💪 잘한 점','⚠️ 보완할 점','🎯 다음 목표','💬 강사 코멘트'][i];
            return `<div style="margin-bottom:12px">
              <label style="font-size:11.5px;font-weight:700;color:#a3b3d1;display:block;margin-bottom:4px">${label}</label>
              <textarea id="aed-out-${k}" rows="3" style="width:100%;padding:8px;font-size:12.5px">${esc(draft[k]||'')}</textarea>
            </div>`;
          }).join('')}
          <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <button onclick="aedSaveDirect()" style="padding:10px 20px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;border-radius:6px;font-weight:800;cursor:pointer;font-size:13.5px">📤 이 텍스트로 바로 저장</button>
            <button onclick="navigator.clipboard.writeText(['💪 잘한 점:',document.getElementById('aed-out-strengths').value,'','⚠️ 보완할 점:',document.getElementById('aed-out-improvements').value,'','🎯 다음 목표:',document.getElementById('aed-out-next_goals').value,'','💬 강사 코멘트:',document.getElementById('aed-out-teacher_comment').value].join('\\n'));this.textContent='✅ 복사됨'" style="padding:8px 16px;background:rgba(59,130,246,0.2);color:#93c5fd;border:1px solid rgba(59,130,246,0.4);border-radius:6px;font-weight:700;cursor:pointer">📋 텍스트만 복사</button>
            <button onclick="aedGenerate()" style="padding:8px 16px;background:rgba(99,102,241,0.2);color:#c4b5fd;border:1px solid rgba(99,102,241,0.4);border-radius:6px;font-weight:700;cursor:pointer">🔄 다시 생성</button>
          </div>
          <div id="aed-save-result" style="margin-top:10px"></div>
        </div>`;
    } catch(e) { out.innerHTML = '<div style="color:#f87171">❌ '+esc(e.message)+'</div>'; }
  };

  // 📤 AI 초안을 바로 평가서로 저장
  window.aedSaveDirect = async function(){
    const sUid = document.getElementById('aed-student-uid')?.value.trim();
    if (!sUid) {
      alert('"📤 바로 저장하려면" 영역을 펼치고 학생 UID 를 입력하세요');
      return;
    }
    const out = document.getElementById('aed-save-result');
    out.innerHTML = '<div style="color:#a3b3d1;font-size:12px">저장 중…</div>';
    const payload = {
      student_uid: sUid,
      parent_uid: document.getElementById('aed-parent-uid')?.value.trim() || null,
      student_name: document.getElementById('aed-student-name').value.trim(),
      teacher_name: document.getElementById('aed-teacher-name').value.trim(),
      lesson_title: document.getElementById('aed-lesson-title').value.trim(),
      lesson_date: new Date().toISOString().slice(0,10),
      score_participation: parseInt(document.getElementById('aed-sc-part').value) || null,
      score_comprehension: parseInt(document.getElementById('aed-sc-comp').value) || null,
      score_homework: parseInt(document.getElementById('aed-sc-hw').value) || null,
      score_attitude: parseInt(document.getElementById('aed-sc-att').value) || null,
      score_speaking: parseInt(document.getElementById('aed-sc-sp').value) || null,
      strengths: document.getElementById('aed-out-strengths').value.trim(),
      improvements: document.getElementById('aed-out-improvements').value.trim(),
      next_goals: document.getElementById('aed-out-next_goals').value.trim(),
      teacher_comment: document.getElementById('aed-out-teacher_comment').value.trim(),
    };
    try {
      const r = await fetch('/api/eval/create', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      let extra = '';
      if (d.notify && d.notify.sent && d.notify.sent.length) extra += ` · 카톡 ${d.notify.sent.length}건`;
      if (d.push && Array.isArray(d.push)) {
        const sent = d.push.filter(p => p.sent > 0).length;
        if (sent) extra += ` · 푸시 ${sent}건`;
      }
      out.innerHTML = `<div style="padding:12px 16px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);border-radius:8px;font-size:13px"><b style="color:#34d399">✅ 평가서 #${d.id} 저장 완료</b><br><span style="color:#a3b3d1;font-size:11.5px">종합 점수: <b style="color:#fbbf24">${d.overall}</b>점${extra}</span><br><a href="/eval.html?id=${d.id}" target="_blank" style="color:#93c5fd;font-size:12px;text-decoration:underline">📄 평가서 페이지 열기</a></div>`;
    } catch(e) { out.innerHTML = '<div style="color:#f87171">❌ '+esc(e.message)+'</div>'; }
  };

  // 🚨 이탈 위험 학생 스캔 + 자동 케어 액션
  window.arrLoad = async function(){
    const out = document.getElementById('arr-result');
    const isEn = (window.adminLang === 'en');
    out.innerHTML = `<div style="color:#a3b3d1">${isEn?'Scanning…':'스캔 중…'}</div>`;
    try {
      const r = await fetch('/api/admin/retention/risk');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      if (!d.count) {
        out.innerHTML = `<div style="padding:24px;text-align:center;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px"><b style="color:#34d399">✅ ${isEn?'No at-risk students!':'위험 학생이 없습니다!'}</b><br><span style="font-size:11.5px;color:#a3b3d1;margin-top:6px;display:inline-block">${isEn?'All students are attending normally.':'모든 학생이 정상 출석/학습 중입니다.'}</span></div>`;
        return;
      }
      // 위험도 분포 요약
      const highN = d.at_risk.filter(x=>x.risk_level==='high').length;
      const medN = d.at_risk.filter(x=>x.risk_level==='medium').length;
      const lowN = d.at_risk.filter(x=>x.risk_level==='low').length;

      out.innerHTML = `
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <div style="background:rgba(239,68,68,0.15);border:1px solid #ef4444;border-radius:8px;padding:8px 14px;font-size:12px">
            🚨 ${isEn?'High':'심각'}: <b style="color:#fca5a5;font-size:14px">${highN}</b>
          </div>
          <div style="background:rgba(245,158,11,0.15);border:1px solid #f59e0b;border-radius:8px;padding:8px 14px;font-size:12px">
            ⚠️ ${isEn?'Medium':'주의'}: <b style="color:#fbbf24;font-size:14px">${medN}</b>
          </div>
          <div style="background:rgba(148,163,184,0.15);border:1px solid #94a3b8;border-radius:8px;padding:8px 14px;font-size:12px">
            🟡 ${isEn?'Low':'관찰'}: <b style="color:#cbd5e1;font-size:14px">${lowN}</b>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px">
            <button onclick="arrBulkAction('comeback_bundle')" style="padding:7px 14px;font-size:11.5px;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer">🎁 ${isEn?'Comeback Bundle (All High)':'전체 심각 → 컴백 번들'}</button>
            <button onclick="arrShowLogs()" style="padding:7px 14px;font-size:11.5px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#e6ecff;border-radius:6px;font-weight:700;cursor:pointer">📜 ${isEn?'Care Log':'발송 기록'}</button>
          </div>
        </div>
        ${d.at_risk.map((r,i) => {
          const color = r.risk_level === 'high' ? '#ef4444' : r.risk_level === 'medium' ? '#f59e0b' : '#94a3b8';
          const bg = r.risk_level === 'high' ? 'rgba(239,68,68,0.08)' : r.risk_level === 'medium' ? 'rgba(245,158,11,0.08)' : 'rgba(148,163,184,0.06)';
          const actions = (r.recommended_actions||[r.recommended_action]).map(a => esc(a)).join(' · ');
          const metrics = `
            <span title="최근 30일 출석">📅 ${r.attendance_30d}회</span>
            <span title="평가 평균">⭐ ${r.eval_avg||'-'}</span>
            ${r.eval_trend ? `<span title="평가 추세">${r.eval_trend>0?'📈':'📉'} ${r.eval_trend>0?'+':''}${r.eval_trend}</span>` : ''}
            ${r.overdue_days>0 ? `<span style="color:#fbbf24" title="미납일">💰 ${r.overdue_days}일</span>` : ''}
            ${r.hw_missed_30d>0 ? `<span title="숙제 미제출">📚 ${r.hw_missed_30d}회</span>` : ''}
          `;
          return `<div style="background:${bg};border:1px solid ${color};border-radius:12px;padding:14px 16px;margin-bottom:10px" id="arr-card-${i}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <span style="font-weight:800;font-size:15px">${esc(r.student_name)}</span>
                  <span style="font-family:monospace;font-size:11px;color:#a3b3d1">${esc(r.user_id)}</span>
                  ${r.parent_name ? `<span style="font-size:11px;color:#94a3b8">👪 ${esc(r.parent_name)}${r.parent_phone?' · '+esc(r.parent_phone):''}</span>` : ''}
                </div>
                <div style="margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:#cbd5e1">${metrics}</div>
                <div style="margin-top:8px;font-size:11.5px;color:#cbd5e1;line-height:1.55">${r.reasons.map(x => `<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;background:rgba(255,255,255,0.05);border-radius:6px">${esc(x)}</span>`).join('')}</div>
                <div style="margin-top:8px;font-size:12px;color:#fbbf24"><b>💡 ${isEn?'Recommended':'추천'}:</b> ${actions}</div>
                <!-- 케어 액션 버튼들 -->
                <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
                  <button onclick="arrCare('${esc(r.user_id)}','kakao','${esc(r.student_name)}')" style="padding:6px 12px;font-size:11.5px;background:#fee500;color:#191919;border:0;border-radius:6px;font-weight:700;cursor:pointer">💬 ${isEn?'KakaoTalk':'카톡'}</button>
                  <button onclick="arrCare('${esc(r.user_id)}','sms','${esc(r.student_name)}')" style="padding:6px 12px;font-size:11.5px;background:#3b82f6;color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer">📱 ${isEn?'SMS':'문자'}</button>
                  <button onclick="arrCare('${esc(r.user_id)}','gift','${esc(r.student_name)}')" style="padding:6px 12px;font-size:11.5px;background:linear-gradient(135deg,#ec4899,#f43f5e);color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer">🎁 ${isEn?'Gift Points':'기프트 포인트'}</button>
                  <button onclick="arrCare('${esc(r.user_id)}','event','${esc(r.student_name)}')" style="padding:6px 12px;font-size:11.5px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer">🎉 ${isEn?'Event Invite':'이벤트 초대'}</button>
                  <button onclick="arrCare('${esc(r.user_id)}','comeback_bundle','${esc(r.student_name)}')" style="padding:6px 12px;font-size:11.5px;background:linear-gradient(135deg,#8b5cf6,#6366f1);color:#fff;border:0;border-radius:6px;font-weight:700;cursor:pointer">🚀 ${isEn?'Comeback Bundle':'컴백 번들'}</button>
                </div>
                <div id="arr-status-${i}" style="margin-top:6px;font-size:11px;color:#94a3b8;min-height:14px"></div>
              </div>
              <div style="text-align:center;flex-shrink:0">
                <div style="font-size:32px;font-weight:900;color:${color};line-height:1">${r.risk_score}</div>
                <div style="font-size:10px;color:#a3b3d1;letter-spacing:1px;margin-top:2px">RISK</div>
                <div style="margin-top:4px;font-size:10px;color:${color};font-weight:800">${r.risk_level.toUpperCase()}</div>
              </div>
            </div>
          </div>`;
        }).join('')}`;
      // 카드 인덱스 -> user_id 매핑 저장 (벌크 액션용)
      window._arrAtRisk = d.at_risk;
    } catch(e) { out.innerHTML = '<div style="color:#f87171">❌ '+esc(e.message)+'</div>'; }
  };

  // 📵 Phase RM — 노쇼(수업 미입장) 리포트 로드
  window.noShowsLoad = async function(){
    const out = document.getElementById('no-shows-result');
    if (!out) return;
    out.innerHTML = '<div style="color:#a3b3d1">불러오는 중…</div>';
    const _esc = window.esc || function(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; }); };
    try {
      const r = await fetch('/api/admin/no-shows', { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'load_failed');
      if (!d.count) {
        out.innerHTML = '<div style="padding:24px;text-align:center;color:#86efac;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:10px">✅ 노쇼 기록이 없습니다!</div>';
        return;
      }
      const chip = function(label, val, col){ return '<div style="background:rgba('+col+',0.15);border:1px solid rgba('+col+',0.35);border-radius:9px;padding:8px 14px;font-size:12.5px;color:#fff"><span style="opacity:.8">'+label+'</span> <b style="font-size:15px">'+val+'</b></div>'; };
      const fmtDate = function(ms){ try { return new Date(ms).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); } catch(e){ return ''; } };
      out.innerHTML =
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'
        + chip('오늘', d.today||0, '239,68,68')
        + chip('이번 주', d.this_week||0, '245,158,11')
        + chip('전체', d.count||0, '99,102,241')
        + chip('학생 노쇼', (d.by_missing&&d.by_missing.student)||0, '239,68,68')
        + chip('강사 노쇼', (d.by_missing&&d.by_missing.teacher)||0, '168,85,247')
        + '</div>'
        + d.no_shows.map(function(row){
            var who = row.missing_role === 'teacher' ? '<span style="color:#c4b5fd;font-weight:800">강사 미입장</span>' : '<span style="color:#fca5a5;font-weight:800">학생 미입장</span>';
            var push = row.notified_push ? '📲 푸시✓' : '📲 푸시—';
            var kakao = row.notified_kakao ? '💬 알림톡✓' : '💬 알림톡—';
            return '<div style="border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.06);border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;flex-wrap:wrap;align-items:center;gap:10px">'
              + '<div style="min-width:130px"><b>'+_esc(row.student_name||'학생')+'</b> <span style="color:#94a3b8;font-size:11px">/ '+_esc(row.teacher_name||'강사미배정')+'</span></div>'
              + '<div style="flex:1;min-width:150px;font-size:12px;color:#cbd5e1">'+who+' · <span style="color:#94a3b8">'+_esc(row.lesson_title||'영어 수업')+'</span></div>'
              + '<div style="font-size:11.5px;color:#94a3b8">🕒 '+fmtDate(row.created_at)+' · '+(row.waited_min||5)+'분 대기</div>'
              + '<div style="font-size:11px;color:#a3b3d1">'+push+' · '+kakao+'</div>'
              + '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:auto">'
              +   (row.student_phone ? '<a href="tel:'+_esc(row.student_phone)+'" style="font-size:11.5px;color:#7dd3fc;text-decoration:none;background:rgba(125,211,252,.12);padding:5px 9px;border-radius:8px">📞 학생 '+_esc(row.student_phone)+'</a>' : '')
              +   (row.parent_phone ? '<a href="tel:'+_esc(row.parent_phone)+'" style="font-size:11.5px;color:#86efac;text-decoration:none;background:rgba(134,239,172,.12);padding:5px 9px;border-radius:8px">📞 학부모 '+_esc(row.parent_phone)+'</a>' : '')
              +   ((!row.student_phone && !row.parent_phone) ? '<span style="font-size:11px;color:#64748b">번호 없음</span>' : '')
              +   '<button onclick="noShowContact('+row.id+')" style="font-size:11.5px;background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.35);color:#fbbf24;border-radius:8px;padding:5px 10px;cursor:pointer;font-weight:700">📲 다시 알림</button>'
              + '</div>'
              + '</div>';
          }).join('');
    } catch(e) {
      out.innerHTML = '<div style="color:#f87171">❌ '+_esc(e.message)+'</div>';
    }
  };

  // 📲 Phase RM — 노쇼 대상에게 재알림(웹푸시) 발송 + 위 전화번호로 직접 연락 유도
  window.noShowContact = async function(id){
    if (!confirm('안 온 상대에게 다시 입장 알림(웹푸시)을 보낼까요?')) return;
    try {
      const r = await fetch('/api/admin/no-shows/contact', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ id: id }) });
      const d = await r.json();
      if (d.ok) {
        const sent = d.push && d.push.ok;
        alert(sent ? '📲 재알림(웹푸시)을 보냈어요.' : '기록했어요. 상대가 푸시 미구독이면 알림이 안 갈 수 있으니, 위 전화번호로 직접 연락을 권장해요.');
        if (typeof noShowsLoad === 'function') noShowsLoad();
      } else { alert('❌ ' + (d.error || '실패')); }
    } catch(e){ alert('❌ ' + e.message); }
  };

  // 🎁 케어 액션 — 단일 학생
  window.arrCare = async function(uid, actionType, studentName) {
    const isEn = (window.adminLang === 'en');
    const labels = {
      kakao: isEn ? 'KakaoTalk message' : '카톡 메시지',
      sms: isEn ? 'SMS' : '문자',
      gift: isEn ? 'Gift points' : '기프트 포인트',
      event: isEn ? 'Event invitation' : '이벤트 초대',
      comeback_bundle: isEn ? 'Comeback bundle (500P + free lesson)' : '컴백 번들 (500P + 무료 보강)',
    };
    let message = '', giftType = '', eventId = '';
    if (actionType === 'kakao' || actionType === 'sms') {
      const defaultMsg = isEn
        ? `Hi ${studentName}, we miss you at Mangoi! 🌟 Come back for a fresh lesson — your teacher is waiting.`
        : `${studentName} 학생, 망고아이가 그리워해요! 🌟 다시 신나는 수업으로 만나요. 강사 선생님이 기다리고 있어요.`;
      message = prompt(isEn ? `Message to send (${labels[actionType]}):` : `${labels[actionType]} 내용:`, defaultMsg);
      if (message === null) return;
    } else if (actionType === 'gift') {
      giftType = prompt(isEn ? 'Gift type (comeback / bonus / regular):' : '기프트 종류 (comeback / bonus / regular):', 'comeback');
      if (giftType === null) return;
    } else if (actionType === 'event') {
      eventId = prompt(isEn ? 'Event ID or name:' : '이벤트 ID 또는 이름:', 'monthly-winter-2026');
      if (eventId === null) return;
    } else if (actionType === 'comeback_bundle') {
      if (!confirm(isEn ? `Send Comeback Bundle to ${studentName}?\n• 500P bonus\n• Free supplementary lesson\n• KakaoTalk message to parent` : `${studentName} 학생에게 컴백 번들을 보낼까요?\n• 500P 보너스\n• 무료 보강 수업 1회\n• 학부모 카톡 안내`)) return;
    }
    try {
      const r = await fetch('/api/admin/retention/care', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid, action_type: actionType, message, gift_type: giftType, event_id: eventId })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      // 카드에 결과 표시
      const idx = (window._arrAtRisk||[]).findIndex(x => x.user_id === uid);
      const el = document.getElementById('arr-status-' + idx);
      if (el) el.innerHTML = `<span style="color:#34d399">✅ ${esc(labels[actionType] || actionType)} — ${esc(d.detail || d.status)}</span>`;
      else alert((isEn?'✅ Sent: ':'✅ 발송됨: ') + (d.detail || d.status));
    } catch (e) {
      alert((isEn?'❌ Failed: ':'❌ 실패: ') + e.message);
    }
  };

  // 🚀 벌크 — 모든 high 위험 학생에게 컴백 번들 발송
  window.arrBulkAction = async function(actionType) {
    const isEn = (window.adminLang === 'en');
    const highs = (window._arrAtRisk || []).filter(x => x.risk_level === 'high');
    if (!highs.length) return alert(isEn ? 'No high-risk students.' : '심각 위험 학생이 없습니다.');
    if (!confirm(isEn ? `Send ${actionType} to ${highs.length} high-risk students?` : `${highs.length}명의 심각 위험 학생 모두에게 ${actionType} 발송할까요?`)) return;
    let ok = 0, fail = 0;
    for (const s of highs) {
      try {
        const r = await fetch('/api/admin/retention/care', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: s.user_id, action_type: actionType })
        });
        const d = await r.json();
        if (d.ok) ok++; else fail++;
      } catch { fail++; }
    }
    alert((isEn?`✅ Sent: ${ok}, ❌ Failed: ${fail}`:`✅ 발송: ${ok}건, ❌ 실패: ${fail}건`));
    arrLoad();  // 새로고침
  };

  // 📜 케어 발송 기록 표시
  window.arrShowLogs = async function() {
    const isEn = (window.adminLang === 'en');
    try {
      const r = await fetch('/api/admin/retention/care/logs?limit=50');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const html = d.items.length
        ? `<table style="width:100%;border-collapse:collapse;font-size:11.5px"><thead><tr style="background:rgba(255,255,255,0.05)">
            <th style="padding:8px;text-align:left">${isEn?'When':'시각'}</th>
            <th style="padding:8px;text-align:left">${isEn?'Student':'학생'}</th>
            <th style="padding:8px;text-align:left">${isEn?'Action':'액션'}</th>
            <th style="padding:8px;text-align:left">${isEn?'Status':'상태'}</th>
          </tr></thead><tbody>${d.items.map(x => `<tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
            <td style="padding:7px">${new Date(x.created_at).toLocaleString(isEn?'en-US':'ko-KR',{dateStyle:'short',timeStyle:'short'})}</td>
            <td style="padding:7px"><code style="font-size:10.5px">${esc(x.user_id)}</code></td>
            <td style="padding:7px">${esc(x.action_type)}${x.gift_type?` · ${esc(x.gift_type)}`:''}</td>
            <td style="padding:7px;color:${x.status==='sent'?'#34d399':x.status==='failed'?'#f87171':'#fbbf24'}">${esc(x.status)}</td>
          </tr>`).join('')}</tbody></table>`
        : `<div style="color:#94a3b8;padding:16px;text-align:center">${isEn?'No care actions logged yet.':'아직 발송 기록이 없습니다.'}</div>`;
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px)';
      ov.onclick = (e) => { if (e.target === ov) ov.remove(); };
      ov.innerHTML = `<div style="background:#0f172a;border-radius:14px;padding:22px;max-width:700px;width:100%;max-height:80vh;overflow:auto;color:#e2e8f0;border:1px solid #334155">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="margin:0;font-size:16px;color:#fbbf24">📜 ${isEn?'Care Action Log':'케어 액션 발송 기록'}</h3>
          <button onclick="this.closest('[style*=fixed]').remove()" style="width:32px;height:32px;background:rgba(239,68,68,0.2);color:#fca5a5;border:0;border-radius:50%;cursor:pointer;font-weight:800">✕</button>
        </div>
        ${html}
      </div>`;
      document.body.appendChild(ov);
    } catch(e) { alert('❌ ' + e.message); }
  };

  // 📄 월별 보고서 열기
  window.mrOpen = function(){
    const uid = document.getElementById('mr-uid').value.trim();
    const ym = document.getElementById('mr-ym').value.trim() || (new Date()).toISOString().slice(0, 7);
    if (!uid) return alert('학생 user_id 입력');
    window.open(`/report.html?uid=${encodeURIComponent(uid)}&ym=${encodeURIComponent(ym)}`, '_blank');
  };

  document.getElementById('card-retention-risk')?.addEventListener('toggle', function(){ if (this.open) arrLoad(); });
})();
