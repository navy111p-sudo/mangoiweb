// ═══════════════════════════════════════════════════════════════
// adm-r8.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
//
// 🔁 (2026-08-18 사장님 지시) B2C 는 «미납» 이 아니라 «미연장» 이다.
//    B2C(개인 결제)는 선불이라 결제한 만큼만 수업이 나가고 끝난다. 못 받은 돈이 없으니
//    «미납» 이라고 쓰면 사실이 아니고, 학부모에게 빚 독촉처럼 읽힌다.
//    ⛔ 라벨을 화면에서 다시 판정하지 말 것 — 서버가 주는 term_label/channel 을 그대로 쓴다.
//       화면이 따로 판정하면 문자 내용과 표의 말이 갈린다.
//    ⛔ 수업 종료 후 1개월(연장 안내 기간)이 지난 학생은 서버가 명단에서 빼고 not_renewable
//       로 따로 세어 준다. 화면은 그 수만 각주로 보여 준다(문자는 안 나간다).
// ═══════════════════════════════════════════════════════════════
(function(){
  const fmt = (n) => (Number(n)||0).toLocaleString('ko-KR');
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'}) : '-';
  const fmtDateShort = (ms) => ms ? new Date(ms).toLocaleDateString('ko-KR') : '미납부';
  // 마지막 수업일 칸은 «미납부» 라고 쓰면 뜻이 안 맞는다(결제 얘기가 아니다)
  const fmtDay = (ms) => ms ? new Date(ms).toLocaleDateString('ko-KR') : '-';
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  let _ovOverdue = [];

  const isRenewal = (s) => String(s && s.channel || '').toUpperCase() === 'B2C';
  const termLabel = (s) => s && s.term_label ? s.term_label : (isRenewal(s) ? '미연장' : '미납');
  // 미연장은 «받을 돈이 없는» 상태라 빨강을 안 쓴다. 미납(B2B)만 빨강.
  const termColor = (s) => isRenewal(s) ? '#7c3aed' : '#ef4444';

  const _num = (id, dflt) => {
    const el = document.getElementById(id);
    const v = el ? parseInt(el.value, 10) : NaN;
    return Number.isFinite(v) && v > 0 ? v : dflt;
  };
  const ovParams = () => ({
    grace: _num('ov-grace', 35),
    fee: _num('ov-fee', 200000),
    renew: _num('ov-renew', 30),
  });

  window.ovScan = async function(){
    const el = document.getElementById('ov-list');
    el.innerHTML = '<div style="padding:20px;color:#6b7280;text-align:center">스캔 중…</div>';
    const p = ovParams();
    try {
      const r = await fetch(`/api/admin/payments/overdue?grace_days=${p.grace}&monthly_fee=${p.fee}&renew_days=${p.renew}`, { credentials:'include' });
      const d = await r.json();
      _ovOverdue = [...(d.overdue || []), ...(d.never_paid || [])];
      const sum = d.summary || {};
      const excluded = Number(sum.total_not_renewable) || 0;
      document.getElementById('ov-summary').innerHTML =
        `🔔 안내 대상 <b style="color:#7c3aed">${fmt(sum.total_overdue)}</b>` +
        ` · 🚫 연장 가능성 낮음(수업 종료 ${p.renew}일 초과) <b style="color:#9ca3af">${fmt(excluded)}</b>` +
        ` · 🟢 정상 <b style="color:#10b981">${fmt(sum.total_up_to_date)}</b>`;
      const btn = document.getElementById('ov-notify-all-btn');
      if (_ovOverdue.length > 0) { btn.disabled = false; btn.style.opacity = '1'; }
      else { btn.disabled = true; btn.style.opacity = '.5'; }

      const foot = excluded > 0
        ? `<div style="margin-top:10px;padding:10px 14px;background:#f3f4f6;border-radius:8px;font-size:11.5px;color:#4b5563;line-height:1.6">
             🚫 마지막 수업일이 <b>${p.renew}일</b>을 넘긴 <b>${fmt(excluded)}명</b>은 연장 가능성이 낮다고 보고 명단에서 제외했습니다 — 문자가 나가지 않습니다.
           </div>` : '';

      if (!_ovOverdue.length) {
        el.innerHTML = '<div style="padding:30px;text-align:center;color:#10b981;background:#ecfdf5;border-radius:10px;border:1px dashed #10b981">🎉 지금 안내할 미연장·미납 학생이 없습니다.</div>' + foot;
        return;
      }
      const rows = _ovOverdue.map(s => {
        const phone = s.parent_phone || s.student_phone || '';
        const renewal = isRenewal(s);
        const label = termLabel(s);
        const days = (s.lapse_days != null ? s.lapse_days : s.days_overdue);
        const payload = esc(JSON.stringify({
          user_id: s.user_id || '', student_name: s.student_name || '', phone: phone,
          days_overdue: s.days_overdue || 0, amount_krw: renewal ? 0 : (s.amount_krw || 0),
          channel: s.channel || '', last_class_at: s.last_class_at || 0,
        }));
        return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:9px 12px"><b>${esc(s.student_name||'-')}</b><br><span style="font-size:11px;color:#9ca3af">${esc(s.user_id||'')}</span></td>
          <td style="padding:9px 12px;text-align:center"><span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;color:#fff;background:${renewal?'#7c3aed':'#dc2626'}">${esc(label)}</span></td>
          <td style="padding:9px 12px;font-size:11.5px;color:#6b7280">${fmtDateShort(s.last_paid_at)}</td>
          <td style="padding:9px 12px;font-size:11.5px;color:#6b7280">${fmtDay(s.last_class_at)}</td>
          <td style="padding:9px 12px;text-align:center"><span style="color:${termColor(s)};font-weight:800;font-size:14px">${days != null ? days+'일' : '-'}</span></td>
          <td style="padding:9px 12px;text-align:right;color:${renewal?'#9ca3af':'#d97706'};font-weight:800">${renewal ? '—' : fmt(s.amount_krw)+'원'}</td>
          <td style="padding:9px 12px;font-size:11.5px;color:#6b7280">${esc(phone||'❌ 번호없음')}</td>
          <td style="padding:8px 10px;text-align:center;white-space:nowrap">
            <button data-ov='${payload}' onclick="ovNotifyOne(this)"
                    ${phone?'':'disabled'}
                    style="padding:6px 14px;font-size:11.5px;background:${phone?(renewal?'#7c3aed':'#dc2626'):'#9ca3af'};color:#fff;border:0;border-radius:6px;cursor:${phone?'pointer':'not-allowed'};font-weight:700">📲 ${renewal?'연장 안내':'미납 알림'}</button>
          </td>
        </tr>`;
      }).join('');
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:linear-gradient(135deg,#f5f3ff,#ede9fe)"><tr>
          <th style="text-align:left;padding:10px 12px;color:#4c1d95">학생</th>
          <th style="text-align:center;padding:10px 12px;color:#4c1d95">구분</th>
          <th style="text-align:left;padding:10px 12px;color:#4c1d95">최근 결제일</th>
          <th style="text-align:left;padding:10px 12px;color:#4c1d95">마지막 수업일</th>
          <th style="text-align:center;padding:10px 12px;color:#4c1d95">경과일</th>
          <th style="text-align:right;padding:10px 12px;color:#4c1d95">금액</th>
          <th style="text-align:left;padding:10px 12px;color:#4c1d95">학부모 번호</th>
          <th style="text-align:center;padding:10px 12px;color:#4c1d95">조작</th>
        </tr></thead><tbody>${rows}</tbody></table>` + foot;
    } catch(e) {
      el.innerHTML = '<div style="padding:20px;color:#ef4444">스캔 실패: '+esc(e.message)+'</div>';
    }
  };

  /* 1명 발송. 예전엔 인자 5개를 onclick 문자열에 박아 넣었는데, 이름에 따옴표가
     들어가면 그 자리에서 깨졌다. data-ov 에 JSON 한 덩어리로 실어 보낸다. */
  window.ovNotifyOne = async function(btnOrUid, name, phone, days, amount){
    let s;
    if (btnOrUid && btnOrUid.getAttribute) {
      try { s = JSON.parse(btnOrUid.getAttribute('data-ov')); } catch { s = null; }
    } else {
      // 옛 호출 방식(인자 5개)도 그대로 받는다
      s = { user_id: btnOrUid, student_name: name, phone: phone, days_overdue: days, amount_krw: amount, channel: '', last_class_at: 0 };
    }
    if (!s) { alert('대상 정보를 읽지 못했습니다. 다시 스캔해 주세요.'); return; }
    if (!s.phone) { alert('전화번호가 없습니다. students_erp에서 학부모 번호를 등록해주세요.'); return; }
    const renewal = String(s.channel||'').toUpperCase() === 'B2C';
    const who = `${s.student_name||s.user_id}님 학부모(${s.phone})`;
    const msg = renewal
      ? `${who}에게 수강 연장 안내 문자를 보낼까요?\n— 수업 종료 ${s.last_class_at ? new Date(s.last_class_at).toLocaleDateString('ko-KR') : '-'} · 발신 1644-0561`
      : `${who}에게 미납 알림톡을 발송할까요?\n— ${s.days_overdue}일 미납 · ${fmt(s.amount_krw)}원`;
    if (!confirm(msg)) return;
    try {
      const r = await fetch('/api/admin/payments/notify-overdue', {
        method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
        body: JSON.stringify({ user_id: s.user_id, student_name: s.student_name, parent_phone: s.phone,
                               days_overdue: s.days_overdue, amount_krw: s.amount_krw,
                               channel: s.channel, last_class_at: s.last_class_at })
      });
      const d = await r.json();
      if (d.ok) alert(`✅ ${d.mode === 'mock' ? '[TEST MODE] mock 발송' : (d.term_label||'') + ' 안내 발송 완료'}`);
      else alert('❌ ' + (d.message || d.error || '실패'));
    } catch(e) { alert('❌ ' + e.message); }
  };

  /* 전체 일괄 — 서버가 «기본 미리보기» 라, 두 걸음으로 나눈다.
       1걸음: dry_run(기본) → 누구에게 무슨 문구가 갈지 받아 온다
       2걸음: 사람이 확인하면 dry_run:false + confirm_send_over 로 실제 발송
     ⛔ 1걸음을 건너뛰지 말 것 — 실제 학부모에게 나가는 돈 얘기 문자다. */
  window.ovNotifyAll = async function(){
    if (!_ovOverdue.length) { alert('먼저 「🔍 명단 스캔」을 실행해주세요.'); return; }
    const p = ovParams();
    const body = { grace_days: p.grace, default_fee: p.fee, renew_days: p.renew };
    let pre;
    try {
      const r = await fetch('/api/admin/payments/notify-all-overdue', {
        method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
        body: JSON.stringify(body)
      });
      pre = await r.json();
    } catch(e) { alert('❌ ' + e.message); return; }
    if (!pre || !pre.ok) { alert('❌ ' + ((pre && (pre.message || pre.error)) || '미리보기 실패')); return; }

    const n = Number(pre.summary && pre.summary.would_send) || 0;
    if (!n) { alert('보낼 대상이 없습니다.\n(번호 없음·결제 이력 없음·연장 기간 초과는 자동으로 제외됩니다)'); return; }
    const ch = pre.by_channel || {};
    const sample = (pre.would_send_to || []).find(x => x.text);
    if (!confirm(
      `📲 전체 발송 미리보기\n\n` +
      `  대상 ${n}명 (🔁 미연장 ${ch.B2C||0}명 · 💸 미납 ${ch.B2B||0}명)\n` +
      `  ⏭ 건너뜀 ${Number(pre.summary && pre.summary.skipped)||0}명\n\n` +
      (sample ? `보낼 문구(예시)\n  ${sample.text}\n\n` : '') +
      `발신번호 1644-0561 로 실제 발송합니다. 진행할까요?`
    )) return;

    try {
      const r2 = await fetch('/api/admin/payments/notify-all-overdue', {
        method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
        body: JSON.stringify({ ...body, dry_run: false, confirm_send_over: n })
      });
      const d = await r2.json();
      if (!d.ok) { alert('❌ ' + (d.message || d.error || '실패')); return; }
      const s = d.summary || {};
      alert(`📊 발송 결과\n\n✅ 성공: ${s.sent}건\n❌ 실패: ${s.failed}건\n⏭ 건너뜀: ${s.skipped}건`);
      ovLoadLog();
    } catch(e) { alert('❌ ' + e.message); }
  };

  window.ovLoadLog = async function(){
    const box = document.getElementById('ov-log-box');
    const el = document.getElementById('ov-log');
    box.style.display = 'block';
    el.innerHTML = '<div style="padding:14px;color:#6b7280;text-align:center">로딩 중…</div>';
    try {
      const r = await fetch('/api/admin/payments/overdue-log', { credentials:'include' });
      const d = await r.json();
      const rows = d.rows || [];
      if (!rows.length) { el.innerHTML = '<div style="padding:14px;color:#6b7280;background:#f9fafb;border-radius:8px;text-align:center">아직 발송 이력이 없습니다.</div>'; return; }
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:11.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:#f3f4f6"><tr>
          <th style="text-align:left;padding:8px 10px">시각</th>
          <th style="text-align:left;padding:8px 10px">학생</th>
          <th style="text-align:center;padding:8px 10px">구분</th>
          <th style="text-align:center;padding:8px 10px">경과</th>
          <th style="text-align:right;padding:8px 10px">금액</th>
          <th style="text-align:left;padding:8px 10px">번호</th>
          <th style="text-align:center;padding:8px 10px">결과</th>
        </tr></thead>
        <tbody>${rows.map(l => {
          const renewal = String(l.channel||'').toUpperCase() === 'B2C';
          const label = renewal ? '미연장' : '미납';
          return `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:7px 10px;color:#9ca3af">${fmtDate(l.sent_at)}</td>
          <td style="padding:7px 10px"><b>${esc(l.student_name||l.user_id||'-')}</b></td>
          <td style="padding:7px 10px;text-align:center"><span style="display:inline-block;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:800;color:#fff;background:${renewal?'#7c3aed':'#dc2626'}">${label}</span></td>
          <td style="padding:7px 10px;text-align:center;color:${renewal?'#7c3aed':'#ef4444'}">${l.days_overdue}일</td>
          <td style="padding:7px 10px;text-align:right;color:#d97706">${renewal ? '—' : fmt(l.amount_krw)+'원'}</td>
          <td style="padding:7px 10px;color:#6b7280">${esc(l.parent_phone||'-')}</td>
          <td style="padding:7px 10px;text-align:center"><span style="color:${l.status==='sent'?'#10b981':'#ef4444'};font-weight:700">${l.status==='sent'?'✅ 성공':'❌ 실패'}</span>${l.error_message?'<br><span style="font-size:10px;color:#9ca3af">'+esc(l.error_message.slice(0,40))+'</span>':''}</td>
        </tr>`; }).join('')}</tbody>
      </table>`;
    } catch(e) {
      el.innerHTML = '<div style="padding:14px;color:#ef4444">로드 실패: '+esc(e.message)+'</div>';
    }
  };
})();
