// ═══════════════════════════════════════════════════════════════
// adm-r8.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const fmt = (n) => (Number(n)||0).toLocaleString('ko-KR');
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'}) : '-';
  const fmtDateShort = (ms) => ms ? new Date(ms).toLocaleDateString('ko-KR') : '미납부';
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  let _ovOverdue = [];

  window.ovScan = async function(){
    const el = document.getElementById('ov-list');
    el.innerHTML = '<div style="padding:20px;color:#6b7280;text-align:center">스캔 중…</div>';
    const grace = parseInt(document.getElementById('ov-grace').value, 10) || 35;
    const fee = parseInt(document.getElementById('ov-fee').value, 10) || 200000;
    try {
      const r = await fetch(`/api/admin/payments/overdue?grace_days=${grace}&monthly_fee=${fee}`);
      const d = await r.json();
      _ovOverdue = [...(d.overdue || []), ...(d.never_paid || [])];
      const sum = d.summary || {};
      document.getElementById('ov-summary').innerHTML =
        `🔴 미납 <b style="color:#ef4444">${fmt(sum.total_overdue)}</b> · ⚪ 미납부 <b style="color:#9ca3af">${fmt(sum.total_never_paid)}</b> · 🟢 정상 <b style="color:#10b981">${fmt(sum.total_up_to_date)}</b>`;
      const btn = document.getElementById('ov-notify-all-btn');
      if (_ovOverdue.length > 0) { btn.disabled = false; btn.style.opacity = '1'; }
      else { btn.disabled = true; btn.style.opacity = '.5'; }
      if (!_ovOverdue.length) {
        el.innerHTML = '<div style="padding:30px;text-align:center;color:#10b981;background:#ecfdf5;border-radius:10px;border:1px dashed #10b981">🎉 모든 학생 수강료 정상 납부 상태입니다!</div>';
        return;
      }
      const rows = _ovOverdue.map(s => {
        const phone = s.parent_phone || s.student_phone || '';
        const isNever = s.days_overdue == null;
        return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:9px 12px"><b>${esc(s.student_name||'-')}</b><br><span style="font-size:11px;color:#9ca3af">${esc(s.user_id||'')}</span></td>
          <td style="padding:9px 12px;font-size:11.5px;color:#6b7280">${fmtDateShort(s.last_paid_at)}</td>
          <td style="padding:9px 12px;text-align:center"><span style="color:${isNever?'#9ca3af':'#ef4444'};font-weight:800;font-size:14px">${isNever?'미납부':s.days_overdue+'일'}</span></td>
          <td style="padding:9px 12px;text-align:right;color:#d97706;font-weight:800">${fmt(s.amount_krw)}원</td>
          <td style="padding:9px 12px;font-size:11.5px;color:#6b7280">${esc(phone||'❌ 번호없음')}</td>
          <td style="padding:8px 10px;text-align:center;white-space:nowrap">
            <button onclick="ovNotifyOne('${esc(s.user_id||'')}','${esc(s.student_name||'')}','${esc(phone)}',${s.days_overdue||0},${s.amount_krw||0})"
                    ${phone?'':'disabled'}
                    style="padding:6px 14px;font-size:11.5px;background:${phone?'linear-gradient(135deg,#ef4444,#dc2626)':'#9ca3af'};color:#fff;border:0;border-radius:6px;cursor:${phone?'pointer':'not-allowed'};font-weight:700">📲 알림 발송</button>
          </td>
        </tr>`;
      }).join('');
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:linear-gradient(135deg,#fef2f2,#fee2e2)"><tr>
          <th style="text-align:left;padding:10px 12px;color:#991b1b">학생</th>
          <th style="text-align:left;padding:10px 12px;color:#991b1b">최근 결제일</th>
          <th style="text-align:center;padding:10px 12px;color:#991b1b">미납</th>
          <th style="text-align:right;padding:10px 12px;color:#991b1b">금액</th>
          <th style="text-align:left;padding:10px 12px;color:#991b1b">학부모 번호</th>
          <th style="text-align:center;padding:10px 12px;color:#991b1b">조작</th>
        </tr></thead><tbody>${rows}</tbody></table>`;
    } catch(e) {
      el.innerHTML = '<div style="padding:20px;color:#ef4444">스캔 실패: '+esc(e.message)+'</div>';
    }
  };

  window.ovNotifyOne = async function(uid, name, phone, days, amount){
    if (!phone) { alert('전화번호가 없습니다. students_erp에서 학부모 번호를 등록해주세요.'); return; }
    if (!confirm(`${name||uid}님 학부모(${phone})에게 미납 알림톡을 발송할까요?\n— ${days}일 미납 · ${fmt(amount)}원`)) return;
    try {
      const r = await fetch('/api/admin/payments/notify-overdue', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid, student_name: name, parent_phone: phone, days_overdue: days, amount_krw: amount })
      });
      const d = await r.json();
      if (d.ok) alert(`✅ ${d.mode === 'mock' ? '[TEST MODE] mock 발송' : '✅ 알림톡 발송 완료'}`);
      else alert('❌ ' + (d.message || d.error || '실패'));
    } catch(e) { alert('❌ ' + e.message); }
  };

  window.ovNotifyAll = async function(){
    if (!_ovOverdue.length) { alert('먼저 「🔍 미납 학생 스캔」을 실행해주세요.'); return; }
    const withPhone = _ovOverdue.filter(s => s.parent_phone || s.student_phone).length;
    const noPhone = _ovOverdue.length - withPhone;
    if (!confirm(`미납 학생 ${_ovOverdue.length}명 전체 알림 발송\n  📲 발송 가능: ${withPhone}명\n  ❌ 번호 없음(건너뜀): ${noPhone}명\n\n진행하시겠습니까?`)) return;
    const grace = parseInt(document.getElementById('ov-grace').value, 10) || 35;
    const fee = parseInt(document.getElementById('ov-fee').value, 10) || 200000;
    try {
      const r = await fetch('/api/admin/payments/notify-all-overdue', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ grace_days: grace, default_fee: fee })
      });
      const d = await r.json();
      const s = d.summary || {};
      alert(`📊 발송 결과\n\n✅ 성공: ${s.sent}건\n❌ 실패: ${s.failed}건\n⏭ 건너뜀(번호없음): ${s.skipped}건`);
      ovLoadLog();
    } catch(e) { alert('❌ ' + e.message); }
  };

  window.ovLoadLog = async function(){
    const box = document.getElementById('ov-log-box');
    const el = document.getElementById('ov-log');
    box.style.display = 'block';
    el.innerHTML = '<div style="padding:14px;color:#6b7280;text-align:center">로딩 중…</div>';
    try {
      const r = await fetch('/api/admin/payments/overdue-log');
      const d = await r.json();
      const rows = d.rows || [];
      if (!rows.length) { el.innerHTML = '<div style="padding:14px;color:#6b7280;background:#f9fafb;border-radius:8px;text-align:center">아직 발송 이력이 없습니다.</div>'; return; }
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:11.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:#f3f4f6"><tr>
          <th style="text-align:left;padding:8px 10px">시각</th>
          <th style="text-align:left;padding:8px 10px">학생</th>
          <th style="text-align:center;padding:8px 10px">미납</th>
          <th style="text-align:right;padding:8px 10px">금액</th>
          <th style="text-align:left;padding:8px 10px">번호</th>
          <th style="text-align:center;padding:8px 10px">결과</th>
        </tr></thead>
        <tbody>${rows.map(l => `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:7px 10px;color:#9ca3af">${fmtDate(l.sent_at)}</td>
          <td style="padding:7px 10px"><b>${esc(l.student_name||l.user_id||'-')}</b></td>
          <td style="padding:7px 10px;text-align:center;color:#ef4444">${l.days_overdue}일</td>
          <td style="padding:7px 10px;text-align:right;color:#d97706">${fmt(l.amount_krw)}원</td>
          <td style="padding:7px 10px;color:#6b7280">${esc(l.parent_phone||'-')}</td>
          <td style="padding:7px 10px;text-align:center"><span style="color:${l.status==='sent'?'#10b981':'#ef4444'};font-weight:700">${l.status==='sent'?'✅ 성공':'❌ 실패'}</span>${l.error_message?'<br><span style="font-size:10px;color:#9ca3af">'+esc(l.error_message.slice(0,40))+'</span>':''}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    } catch(e) {
      el.innerHTML = '<div style="padding:14px;color:#ef4444">로드 실패: '+esc(e.message)+'</div>';
    }
  };
})();
