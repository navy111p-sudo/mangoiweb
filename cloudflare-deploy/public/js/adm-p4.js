// ═══════════════════════════════════════════════════════════════
// adm-p4.js — admin.html 인라인 스크립트 추출 (2단계, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const fmt = (n) => (Number(n)||0).toLocaleString('ko-KR');
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR', { dateStyle:'short', timeStyle:'short' }) : '-';
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  // ━━━━━━━━ 학생 잔액 ━━━━━━━━
  let _ptBalances = [];
  window.ptLoadBalances = async function(){
    const el = document.getElementById('pt-balances-table');
    if (!el) return;
    el.innerHTML = '<div style="padding:20px;color:#6b7280;text-align:center">불러오는 중…</div>';
    try {
      const r = await fetch('/api/admin/points/list');
      const d = await r.json();
      _ptBalances = d.rows || [];
      ptRenderBalances(_ptBalances);
      // 통계
      const totalBal = _ptBalances.reduce((s,x)=>s+(x.balance||0),0);
      const totalEarned = _ptBalances.reduce((s,x)=>s+(x.lifetime_earned||0),0);
      const totalSpent = _ptBalances.reduce((s,x)=>s+(x.lifetime_spent||0),0);
      document.getElementById('pt-stats').innerHTML =
        `학생 ${_ptBalances.length}명 · 잔액합 <b style="color:#d97706">${fmt(totalBal)}P</b> · 누적적립 ${fmt(totalEarned)}P · 누적사용 ${fmt(totalSpent)}P`;
    } catch(e) {
      el.innerHTML = '<div style="padding:20px;color:#ef4444">로드 실패: '+esc(e.message)+'</div>';
    }
  };
  function ptRenderBalances(rows) {
    const el = document.getElementById('pt-balances-table');
    if (!rows.length) {
      el.innerHTML = '<div style="padding:24px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">아직 포인트가 적립된 학생이 없습니다.<br><span style="font-size:11.5px;margin-top:6px;display:inline-block">아래에서 학생 ID를 입력해 첫 포인트를 지급해보세요.</span><div style="margin-top:14px">'+ptQuickGrantHtml()+'</div></div>';
      return;
    }
    const rowsHtml = rows.map(x => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:10px 12px;font-weight:700;color:#374151">${esc(x.student_name||'-')}</td>
        <td style="padding:10px 12px;color:#6b7280;font-family:monospace;font-size:11.5px">${esc(x.user_id)}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:800;color:#d97706;font-size:14px">${fmt(x.balance)} P</td>
        <td style="padding:10px 12px;text-align:right;color:#10b981;font-size:11.5px">+${fmt(x.lifetime_earned)}</td>
        <td style="padding:10px 12px;text-align:right;color:#ef4444;font-size:11.5px">-${fmt(x.lifetime_spent)}</td>
        <td style="padding:10px 12px;color:#9ca3af;font-size:11px">${fmtDate(x.updated_at)}</td>
        <td style="padding:8px 10px;text-align:center;white-space:nowrap">
          <button onclick="ptQuickEarn('${esc(x.user_id)}','${esc(x.student_name||'')}','homework')" title="📝 숙제 완료 자동 적립" style="padding:5px 7px;font-size:11px;background:#3b82f6;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-right:2px">📝</button>
          <button onclick="ptQuickEarn('${esc(x.user_id)}','${esc(x.student_name||'')}','level_up')" title="🎖 레벨업 자동 적립" style="padding:5px 7px;font-size:11px;background:#a855f7;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-right:2px">🎖</button>
          <button onclick="ptQuickEarn('${esc(x.user_id)}','${esc(x.student_name||'')}','birthday')" title="🎂 생일 보너스" style="padding:5px 7px;font-size:11px;background:#ec4899;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-right:6px">🎂</button>
          <button onclick="ptOpenAdjustModal('${esc(x.user_id)}','${esc(x.student_name||'')}','grant')" style="padding:5px 10px;font-size:11px;background:#10b981;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-right:3px">+ 충전</button>
          <button onclick="ptOpenAdjustModal('${esc(x.user_id)}','${esc(x.student_name||'')}','deduct')" style="padding:5px 10px;font-size:11px;background:#ef4444;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-right:3px">− 차감</button>
          <button onclick="aiOpenAnalysis('${esc(x.user_id)}','${esc(x.student_name||'')}')" title="🤖 AI 학습 분석 (Llama 3.3 70B)" style="padding:5px 10px;font-size:11px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:0;border-radius:5px;cursor:pointer;font-weight:700">🤖 AI</button>
        </td>
      </tr>`).join('');
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.05)">
        <thead style="background:#f3f4f6">
          <tr>
            <th style="text-align:left;padding:10px 12px;font-weight:700;color:#374151">학생</th>
            <th style="text-align:left;padding:10px 12px;font-weight:700;color:#374151">ID</th>
            <th style="text-align:right;padding:10px 12px;font-weight:700;color:#374151">잔액</th>
            <th style="text-align:right;padding:10px 12px;font-weight:700;color:#374151">누적적립</th>
            <th style="text-align:right;padding:10px 12px;font-weight:700;color:#374151">누적사용</th>
            <th style="text-align:left;padding:10px 12px;font-weight:700;color:#374151">최근업데이트</th>
            <th style="text-align:center;padding:10px 12px;font-weight:700;color:#374151">조작 / 🤖 AI</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div style="margin-top:12px">${ptQuickGrantHtml()}</div>`;
  }
  function ptQuickGrantHtml(){
    return `<div style="background:#fff;border:1px dashed #d1d5db;border-radius:8px;padding:12px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="font-size:12px;font-weight:700;color:#374151">🆕 빠른 지급:</span>
      <input id="pt-quick-uid" type="text" placeholder="학생 user_id (예: hong_gd)" style="padding:6px 10px;font-size:12px;border-radius:5px;border:1px solid #d1d5db;flex:1;min-width:140px" />
      <input id="pt-quick-name" type="text" placeholder="이름 (옵션)" style="padding:6px 10px;font-size:12px;border-radius:5px;border:1px solid #d1d5db;width:120px" />
      <input id="pt-quick-amount" type="number" placeholder="포인트" style="padding:6px 10px;font-size:12px;border-radius:5px;border:1px solid #d1d5db;width:100px" />
      <input id="pt-quick-reason" type="text" placeholder="사유 (예: 첫 가입 보너스)" style="padding:6px 10px;font-size:12px;border-radius:5px;border:1px solid #d1d5db;flex:1;min-width:140px" />
      <button onclick="ptQuickGrant()" style="padding:6px 16px;font-size:12px;background:#10b981;color:#fff;border:0;border-radius:5px;cursor:pointer;font-weight:700">지급</button>
    </div>`;
  }
  window.ptQuickGrant = async function(){
    const uid = document.getElementById('pt-quick-uid').value.trim();
    const name = document.getElementById('pt-quick-name').value.trim();
    const amt = parseInt(document.getElementById('pt-quick-amount').value, 10);
    const reason = document.getElementById('pt-quick-reason').value.trim() || '관리자 지급';
    if (!uid || !amt) { alert('user_id와 포인트는 필수입니다.'); return; }
    try {
      const r = await fetch('/api/admin/points/adjust', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid, student_name: name, amount: amt, type:'admin_grant', reason })
      });
      const d = await r.json();
      if (!d.ok) { alert('❌ ' + (d.error || '실패')); return; }
      alert(`✅ ${name||uid}에게 ${fmt(amt)}P 지급 완료\n새 잔액: ${fmt(d.newBalance)} P`);
      document.getElementById('pt-quick-uid').value = '';
      document.getElementById('pt-quick-name').value = '';
      document.getElementById('pt-quick-amount').value = '';
      document.getElementById('pt-quick-reason').value = '';
      ptLoadBalances();
    } catch(e) { alert('❌ ' + e.message); }
  };
  window.ptOpenAdjustModal = async function(uid, name, type){
    const isGrant = type === 'grant';
    const verb = isGrant ? '지급' : '차감';
    const apiType = isGrant ? 'admin_grant' : 'admin_deduct';
    const amount = prompt(`${name||uid} 에게 ${verb}할 포인트를 입력하세요`, '100');
    if (!amount) return;
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0) { alert('올바른 숫자를 입력하세요'); return; }
    const reason = prompt(`사유 (옵션):`, isGrant?'관리자 지급':'관리자 차감') || (isGrant?'관리자 지급':'관리자 차감');
    try {
      const r = await fetch('/api/admin/points/adjust', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid, student_name: name, amount: amt, type: apiType, reason })
      });
      const d = await r.json();
      if (!d.ok) { alert('❌ ' + (d.error || '실패')); return; }
      alert(`✅ ${verb} 완료\n새 잔액: ${fmt(d.newBalance)} P`);
      ptLoadBalances();
    } catch(e) { alert('❌ ' + e.message); }
  };
  window.ptFilterBalances = function(q){
    q = (q||'').toLowerCase().trim();
    if (!q) { ptRenderBalances(_ptBalances); return; }
    const filtered = _ptBalances.filter(x =>
      (x.student_name||'').toLowerCase().includes(q) ||
      (x.user_id||'').toLowerCase().includes(q)
    );
    ptRenderBalances(filtered);
  };
  // AI 운영비서가 보낸 질문 원문에서 실제 학생명/아이디를 찾아 반환(없으면 '')
  window.ptGuessStudentFromText = function(text){
    text = (text||'').toLowerCase();
    if (!text) return '';
    for (let i=0; i<_ptBalances.length; i++){
      const nm  = (_ptBalances[i].student_name||'').toLowerCase();
      const uid = (_ptBalances[i].user_id||'').toLowerCase();
      if (nm  && nm.length  >= 2 && text.indexOf(nm)  >= 0) return _ptBalances[i].student_name;
      if (uid && uid.length >= 2 && text.indexOf(uid) >= 0) return _ptBalances[i].user_id;
    }
    return '';
  };
  window.ptSeedRules = async function(){
    if (!confirm('기본 적립 규칙 6개(출석/숙제/제시간/레벨업/월간우수/생일)를 시드하시겠습니까?\n이미 있으면 건너뜁니다.')) return;
    try {
      const r = await fetch('/api/admin/points/seed-rules', { method:'POST' });
      const d = await r.json();
      alert(`✅ 시드 완료: ${d.items?.length||0}개\n` + (d.items||[]).map(x=>`• ${x.label} (+${x.amount}P)`).join('\n'));
      ptLoadRules();
    } catch(e) { alert('❌ ' + e.message); }
  };

  // ━━━━━━━━ 카탈로그 ━━━━━━━━
  let _ptCatalog = [];
  window.ptLoadCatalog = async function(){
    const el = document.getElementById('pt-catalog-table');
    if (!el) return;
    el.innerHTML = '<div style="padding:20px;color:#6b7280;text-align:center">불러오는 중…</div>';
    try {
      const r = await fetch('/api/admin/gifts/catalog');
      const d = await r.json();
      _ptCatalog = d.rows || [];
      if (!_ptCatalog.length) {
        el.innerHTML = '<div style="padding:24px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">카탈로그가 비어있습니다.<br><span style="font-size:11.5px">위 「🌱 기본 6개 시드」 버튼을 누르거나 새 상품을 추가하세요.</span></div>';
        return;
      }
      const rowsHtml = _ptCatalog.map(g => `
        <tr style="border-bottom:1px solid #e5e7eb;${g.enabled?'':'opacity:.45'}">
          <td style="padding:9px 12px;font-size:12.5px"><b style="color:#374151">${esc(g.brand||'-')}</b></td>
          <td style="padding:9px 12px;font-size:12.5px">${esc(g.name)}</td>
          <td style="padding:9px 12px;font-size:11.5px;color:#6b7280">${esc(g.category||'-')}</td>
          <td style="padding:9px 12px;text-align:right;color:#6b7280">${fmt(g.face_value)}원</td>
          <td style="padding:9px 12px;text-align:right;font-weight:800;color:#d97706">${fmt(g.point_price)} P</td>
          <td style="padding:9px 12px;text-align:right;font-size:11.5px;color:${g.stock!=null && g.stock<5?'#ef4444':'#6b7280'}">${g.stock==null?'무제한':g.stock}</td>
          <td style="padding:9px 12px;text-align:center">
            <span style="padding:2px 8px;border-radius:99px;font-size:10.5px;font-weight:700;background:${g.enabled?'#dcfce7':'#fee2e2'};color:${g.enabled?'#166534':'#991b1b'}">${g.enabled?'활성':'비활성'}</span>
          </td>
          <td style="padding:8px 10px;text-align:center;white-space:nowrap">
            <button onclick='ptOpenCatalogModal(${JSON.stringify(g)})' style="padding:5px 10px;font-size:11px;background:#6366f1;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-right:3px">편집</button>
            <button onclick="ptToggleCatalog(${g.id},${g.enabled?0:1})" style="padding:5px 10px;font-size:11px;background:${g.enabled?'#9ca3af':'#10b981'};color:#fff;border:0;border-radius:5px;cursor:pointer">${g.enabled?'끄기':'켜기'}</button>
          </td>
        </tr>`).join('');
      el.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
          <thead style="background:#f3f4f6">
            <tr>
              <th style="text-align:left;padding:9px 12px">브랜드</th>
              <th style="text-align:left;padding:9px 12px">상품명</th>
              <th style="text-align:left;padding:9px 12px">카테고리</th>
              <th style="text-align:right;padding:9px 12px">정가</th>
              <th style="text-align:right;padding:9px 12px">포인트</th>
              <th style="text-align:right;padding:9px 12px">재고</th>
              <th style="text-align:center;padding:9px 12px">상태</th>
              <th style="text-align:center;padding:9px 12px">조작</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    } catch(e) {
      el.innerHTML = '<div style="padding:20px;color:#ef4444">로드 실패: '+esc(e.message)+'</div>';
    }
  };
  window.ptSeedCatalog = async function(){
    if (!confirm('기본 6개 상품(메가커피/배스킨/교촌/CGV/교보/GS25)을 시드하시겠습니까?')) return;
    try {
      const r = await fetch('/api/admin/gifts/seed-catalog', { method:'POST' });
      const d = await r.json();
      alert(`✅ 시드 완료: ${d.seeded||0}개`);
      ptLoadCatalog();
    } catch(e) { alert('❌ ' + e.message); }
  };
  window.ptOpenCatalogModal = function(existing){
    const g = (typeof existing === 'object' && existing) ? existing : {};
    const isEdit = !!g.id;
    const data = {
      id: g.id || null,
      brand: g.brand || '',
      name: g.name || '',
      category: g.category || 'cafe',
      face_value: g.face_value || 0,
      point_price: g.point_price || 0,
      stock: g.stock != null ? g.stock : '',
      thumbnail_url: g.thumbnail_url || '',
      description: g.description || '',
      external_id: g.external_id || '',
      sort_order: g.sort_order || 0,
      enabled: g.enabled !== 0,
    };
    const brand = prompt('브랜드 (예: 메가커피)', data.brand); if (brand === null) return;
    const name = prompt('상품명 (예: 아메리카노 (ICE))', data.name); if (name === null) return;
    const fv = parseInt(prompt('정가 (원)', String(data.face_value)), 10); if (!fv) return;
    const pp = parseInt(prompt('포인트 가격', String(data.point_price || fv)), 10); if (!pp) return;
    const cat = prompt('카테고리 (cafe/food/movie/book/voucher/etc)', data.category) || 'cafe';
    const stockStr = prompt('재고 (비워두면 무제한)', String(data.stock));
    const stock = stockStr === '' || stockStr === null ? null : parseInt(stockStr, 10);
    const desc = prompt('설명 (옵션)', data.description) || '';
    const extId = prompt('기프티쇼 비즈 상품 코드 (있을 때만)', data.external_id) || '';
    const body = {
      id: data.id, brand, name, category: cat,
      face_value: fv, point_price: pp,
      stock, thumbnail_url: data.thumbnail_url, description: desc,
      external_id: extId, sort_order: data.sort_order, enabled: data.enabled,
    };
    fetch('/api/admin/gifts/catalog', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
    }).then(r=>r.json()).then(d => {
      if (d.ok) { alert(`✅ ${isEdit?'수정':'추가'} 완료`); ptLoadCatalog(); }
      else alert('❌ ' + (d.error||'실패'));
    });
  };
  window.ptToggleCatalog = async function(id, enabled){
    const g = _ptCatalog.find(x=>x.id===id);
    if (!g) return;
    try {
      const r = await fetch('/api/admin/gifts/catalog', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ...g, enabled: !!enabled })
      });
      await r.json();
      ptLoadCatalog();
    } catch(e) { alert('❌ ' + e.message); }
  };

  // ━━━━━━━━ 교환내역 ━━━━━━━━
  window.ptLoadRedemptions = async function(){
    const el = document.getElementById('pt-red-table');
    if (!el) return;
    el.innerHTML = '<div style="padding:20px;color:#6b7280;text-align:center">불러오는 중…</div>';
    const status = document.getElementById('pt-red-filter').value;
    try {
      const r = await fetch('/api/admin/gifts/redemptions' + (status?`?status=${status}`:''));
      const d = await r.json();
      const rows = d.rows || [];
      document.getElementById('pt-red-stats').textContent = `총 ${rows.length}건`;
      if (!rows.length) { el.innerHTML = '<div style="padding:24px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">조건에 맞는 교환 내역이 없습니다.</div>'; return; }
      const COLOR = { pending:'#fbbf24', sent:'#60a5fa', delivered:'#10b981', failed:'#ef4444', refunded:'#94a3b8' };
      const LABEL = { pending:'⏳ 발송대기', sent:'📤 발송됨', delivered:'✅ 수령완료', failed:'❌ 실패', refunded:'↩️ 환불' };
      const rowsHtml = rows.map(x => `
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:9px 12px;font-size:11.5px;color:#9ca3af">#${x.id}</td>
          <td style="padding:9px 12px"><b>${esc(x.student_name||'-')}</b><br><span style="font-size:11px;color:#9ca3af">${esc(x.user_id)}</span></td>
          <td style="padding:9px 12px;font-size:12px">${esc(x.gift_brand||'')} · ${esc(x.gift_name||'')}</td>
          <td style="padding:9px 12px;font-size:12px;color:#6b7280">${esc(x.recipient_phone||'-')}</td>
          <td style="padding:9px 12px;text-align:right;font-weight:700;color:#d97706">${fmt(x.point_price)} P</td>
          <td style="padding:9px 12px;text-align:center"><span style="color:${COLOR[x.status]||'#6b7280'};font-weight:700;font-size:11.5px">${LABEL[x.status]||x.status}</span></td>
          <td style="padding:9px 12px;font-size:11px;color:#9ca3af">${fmtDate(x.requested_at)}</td>
          <td style="padding:8px 10px;text-align:center;white-space:nowrap">
            ${x.status==='pending'?`<button onclick="ptMarkRedemption(${x.id},'sent')" style="padding:4px 8px;font-size:10.5px;background:#60a5fa;color:#fff;border:0;border-radius:4px;cursor:pointer;margin-right:2px">발송완료</button>`:''}
            ${(x.status==='pending'||x.status==='sent')?`<button onclick="ptMarkRedemption(${x.id},'delivered')" style="padding:4px 8px;font-size:10.5px;background:#10b981;color:#fff;border:0;border-radius:4px;cursor:pointer;margin-right:2px">수령확인</button>`:''}
            ${(x.status!=='delivered'&&x.status!=='refunded')?`<button onclick="ptMarkRedemption(${x.id},'failed')" style="padding:4px 8px;font-size:10.5px;background:#ef4444;color:#fff;border:0;border-radius:4px;cursor:pointer;margin-right:2px">실패</button>`:''}
            ${x.status!=='refunded'?`<button onclick="ptMarkRedemption(${x.id},'refunded')" style="padding:4px 8px;font-size:10.5px;background:#94a3b8;color:#fff;border:0;border-radius:4px;cursor:pointer">환불</button>`:''}
          </td>
        </tr>`).join('');
      el.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
          <thead style="background:#f3f4f6">
            <tr>
              <th style="text-align:left;padding:9px 12px">ID</th>
              <th style="text-align:left;padding:9px 12px">학생</th>
              <th style="text-align:left;padding:9px 12px">상품</th>
              <th style="text-align:left;padding:9px 12px">받는번호</th>
              <th style="text-align:right;padding:9px 12px">차감 P</th>
              <th style="text-align:center;padding:9px 12px">상태</th>
              <th style="text-align:left;padding:9px 12px">신청시각</th>
              <th style="text-align:center;padding:9px 12px">조작</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    } catch(e) {
      el.innerHTML = '<div style="padding:20px;color:#ef4444">로드 실패: '+esc(e.message)+'</div>';
    }
  };
  window.ptMarkRedemption = async function(id, status){
    let body = { status };
    if (status === 'sent') {
      const code = prompt('발송한 기프티콘 쿠폰 번호를 입력하세요 (옵션, 학생 교환내역에 표시됨)', '');
      if (code) body.coupon_code = code;
    }
    if (status === 'failed') {
      const msg = prompt('실패 사유 (학생이 볼 메시지)', '발송 실패');
      body.error_message = msg || '발송 실패';
    }
    if (status === 'refunded') {
      if (!confirm('환불하시겠습니까? 학생에게 포인트가 자동 환불됩니다.')) return;
    }
    try {
      const r = await fetch(`/api/admin/gifts/redemptions/${id}/mark`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
      const d = await r.json();
      if (!d.ok) { alert('❌ ' + (d.error||'실패')); return; }
      alert(`✅ ${status} 처리 완료` + (d.refund?`\n포인트 환불: +${fmt(d.refund.signed)}P`:''));
      ptLoadRedemptions();
    } catch(e) { alert('❌ ' + e.message); }
  };

  // ━━━━━━━━ 적립 규칙 ━━━━━━━━
  window.ptLoadRules = async function(){
    const el = document.getElementById('pt-rules-table');
    if (!el) return;
    el.innerHTML = '<div style="padding:20px;color:#6b7280;text-align:center">불러오는 중…</div>';
    try {
      const r = await fetch('/api/admin/points/rules');
      const d = await r.json();
      const rules = d.rows || [];
      if (!rules.length) {
        el.innerHTML = '<div style="padding:24px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">적립 규칙이 없습니다.<br>위 「⚙ 기본 규칙 시드」 버튼을 누르세요.</div>';
        return;
      }
      const rowsHtml = rules.map(x => `
        <tr style="border-bottom:1px solid #e5e7eb;${x.enabled?'':'opacity:.5'}">
          <td style="padding:10px 12px"><b>${esc(x.label)}</b><br><span style="font-size:11px;color:#9ca3af;font-family:monospace">${esc(x.code)}</span></td>
          <td style="padding:10px 12px;text-align:right;font-weight:800;color:#d97706">+${fmt(x.amount)} P</td>
          <td style="padding:10px 12px;text-align:center;font-size:11.5px;color:#6b7280">${x.cooldown_sec?Math.round(x.cooldown_sec/60)+'분':'-'}</td>
          <td style="padding:10px 12px;text-align:center;font-size:11.5px;color:#6b7280">${x.daily_cap?x.daily_cap+'회':'무제한'}</td>
          <td style="padding:10px 12px;font-size:11.5px;color:#6b7280">${esc(x.description||'-')}</td>
          <td style="padding:10px 12px;text-align:center">
            <span style="padding:2px 8px;border-radius:99px;font-size:10.5px;font-weight:700;background:${x.enabled?'#dcfce7':'#fee2e2'};color:${x.enabled?'#166534':'#991b1b'}">${x.enabled?'활성':'비활성'}</span>
          </td>
          <td style="padding:8px 10px;text-align:center;white-space:nowrap">
            <button onclick='ptEditRule(${JSON.stringify(x)})' style="padding:5px 10px;font-size:11px;background:#6366f1;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-right:3px">편집</button>
            <button onclick="ptToggleRule('${esc(x.code)}',${x.enabled?0:1})" style="padding:5px 10px;font-size:11px;background:${x.enabled?'#9ca3af':'#10b981'};color:#fff;border:0;border-radius:5px;cursor:pointer">${x.enabled?'끄기':'켜기'}</button>
          </td>
        </tr>`).join('');
      el.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
          <thead style="background:#f3f4f6">
            <tr>
              <th style="text-align:left;padding:10px 12px">규칙</th>
              <th style="text-align:right;padding:10px 12px">포인트</th>
              <th style="text-align:center;padding:10px 12px">쿨다운</th>
              <th style="text-align:center;padding:10px 12px">일일 한도</th>
              <th style="text-align:left;padding:10px 12px">설명</th>
              <th style="text-align:center;padding:10px 12px">상태</th>
              <th style="text-align:center;padding:10px 12px">조작</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>`;
    } catch(e) {
      el.innerHTML = '<div style="padding:20px;color:#ef4444">로드 실패: '+esc(e.message)+'</div>';
    }
  };
  window.ptEditRule = function(r){
    const label = prompt('규칙 표시명', r.label); if (label === null) return;
    const amount = parseInt(prompt('적립 포인트', String(r.amount)), 10); if (!amount) return;
    const cd = parseInt(prompt('쿨다운 (초, 0=없음)', String(r.cooldown_sec||0)), 10) || 0;
    const capStr = prompt('일일 한도 (비워두면 무제한)', r.daily_cap?String(r.daily_cap):'');
    const cap = capStr === '' || capStr === null ? null : parseInt(capStr, 10);
    const desc = prompt('설명', r.description||'') || '';
    fetch('/api/admin/points/rules', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ code: r.code, label, amount, cooldown_sec: cd, daily_cap: cap, enabled: !!r.enabled, description: desc })
    }).then(r=>r.json()).then(d=>{
      if (d.ok) { alert('✅ 저장 완료'); ptLoadRules(); }
      else alert('❌ ' + (d.error||'실패'));
    });
  };
  window.ptToggleRule = async function(code, enabled){
    const rule = (await (await fetch('/api/admin/points/rules')).json()).rows.find(r=>r.code===code);
    if (!rule) return;
    await fetch('/api/admin/points/rules', {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...rule, enabled: !!enabled })
    });
    ptLoadRules();
  };

  // ━━━━━━━━ 🎁 Phase P5: 빠른 적립 (자동 규칙 트리거) ━━━━━━━━
  // 관리자가 학생 행에서 📝/🎖/🎂 누르면 해당 규칙으로 자동 적립
  // (쿨다운/일일한도는 서버가 자동 차단)
  const PT_QUICK_LABELS = {
    homework: '📝 숙제 완료',
    level_up: '🎖 레벨업',
    birthday: '🎂 생일 보너스',
    on_time:  '⏱ 제시간 입장',
    attendance: '📍 출석',
  };
  window.ptQuickEarn = async function(uid, name, ruleCode){
    if (!uid || !ruleCode) return;
    const label = PT_QUICK_LABELS[ruleCode] || ruleCode;
    if (!confirm(`${name||uid} 에게 「${label}」 규칙 적립을 트리거하시겠습니까?\n(쿨다운/일일 한도는 자동 체크됩니다)`)) return;
    try {
      const r = await fetch('/api/points/earn-by-rule', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ user_id: uid, student_name: name, rule_code: ruleCode, meta: { source: 'admin_quick' } })
      });
      const d = await r.json();
      if (d.ok) {
        alert(`✅ ${label} +${d.rule?.amount || 0}P 적립 완료\n새 잔액: ${fmt(d.newBalance)} P`);
        ptLoadBalances();
      } else if (d.error === 'cooldown') {
        alert(`⏳ 쿨다운 중 — ${d.remaining_sec}초 후 다시 시도 가능`);
      } else if (d.error === 'daily_cap_reached') {
        alert(`📅 일일 한도(${d.cap}회) 도달 — 내일 다시 시도하세요`);
      } else if (d.error === 'rule_not_found_or_disabled') {
        if (confirm(`「${ruleCode}」 규칙이 등록되어 있지 않습니다.\n기본 규칙 6개를 시드하시겠습니까?`)) {
          await ptSeedRules();
        }
      } else {
        alert('❌ ' + (d.error || '실패'));
      }
    } catch(e) { alert('❌ ' + e.message); }
  };

  // ━━━━━━━━ 🎁 Phase P5: 월간 우수학생 자동 산정 + 일괄 지급 ━━━━━━━━
  window.ptComputeMonthlyTop = async function(){
    // 이번 달 1일~말일 사이의 적립 횟수 + 누적금액 기준 TOP N
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    const start = new Date(y, m, 1).getTime();
    const end = new Date(y, m+1, 1).getTime();
    if (!confirm(`이번 달(${y}년 ${m+1}월) 학생 활동 통계를 산정합니다.\n• 적립 횟수 + 누적금액 기준 TOP 3\n• 산정 후 일괄 지급 여부를 선택할 수 있습니다.`)) return;
    try {
      // 모든 학생 잔액 조회
      const r = await fetch('/api/admin/points/list');
      const d = await r.json();
      const students = d.rows || [];
      if (!students.length) { alert('학생 데이터가 없습니다.'); return; }
      // 각 학생의 이번 달 적립 거래 조회 → 통계 산정
      const stats = [];
      for (const s of students) {
        const tr = await fetch('/api/points/balance?uid=' + encodeURIComponent(s.user_id));
        const td = await tr.json();
        const monthEarns = (td.recent || []).filter(x =>
          x.type === 'earn' && x.created_at >= start && x.created_at < end
        );
        const earnCount = monthEarns.length;
        const earnSum = monthEarns.reduce((sum, x) => sum + x.amount, 0);
        stats.push({ uid: s.user_id, name: s.student_name || s.user_id, count: earnCount, sum: earnSum });
      }
      // 정렬 (적립횟수 우선, 동률시 누적합)
      stats.sort((a, b) => (b.count - a.count) || (b.sum - a.sum));
      const top3 = stats.slice(0, 3).filter(x => x.count > 0);
      if (!top3.length) {
        alert('이번 달 적립 활동이 있는 학생이 없습니다.');
        return;
      }
      const rankLabels = ['🥇 1위', '🥈 2위', '🥉 3위'];
      const summary = top3.map((s,i) => `${rankLabels[i]} ${s.name}: ${s.count}회 적립, ${fmt(s.sum)}P`).join('\n');
      if (!confirm(`📊 이번 달 우수 학생 (${y}년 ${m+1}월)\n\n${summary}\n\n위 3명에게 monthly_top 규칙(+500P)을 일괄 지급하시겠습니까?`)) return;
      // 일괄 지급
      const results = [];
      for (const s of top3) {
        try {
          const r2 = await fetch('/api/points/earn-by-rule', {
            method: 'POST', headers: { 'Content-Type':'application/json' },
            body: JSON.stringify({ user_id: s.uid, student_name: s.name, rule_code: 'monthly_top', meta: { month: `${y}-${String(m+1).padStart(2,'0')}`, rank: results.length+1, source: 'admin_monthly_top' } })
          });
          const rd = await r2.json();
          results.push({ ...s, ok: rd.ok, msg: rd.ok ? `+${rd.rule?.amount || 500}P` : (rd.error || '실패') });
        } catch(e) {
          results.push({ ...s, ok: false, msg: e.message });
        }
      }
      const resultMsg = results.map((r,i) => `${rankLabels[i]} ${r.name}: ${r.ok ? '✅ ' : '❌ '}${r.msg}`).join('\n');
      alert(`📊 월간 우수학생 일괄 지급 완료\n\n${resultMsg}`);
      ptLoadBalances();
    } catch(e) { alert('❌ ' + e.message); }
  };

  // ━━━━━━━━ 🎁 Phase P4: API 상태 표시 ━━━━━━━━
  window.ptLoadApiStatus = async function(){
    const el = document.getElementById('pt-api-status');
    if (!el) return;
    el.innerHTML = '<div style="padding:14px;text-align:center;color:#6b7280">상태 확인 중…</div>';
    try {
      const r = await fetch('/api/admin/gifts/status');
      const d = await r.json();
      const m = d.mode;
      const MODE_INFO = {
        disabled: { color:'#9ca3af', bg:'#f3f4f6', icon:'⏸', label:'미연동', desc:'API 키 없음 — 학생 신청이 들어오면 관리자가 직접 카톡으로 발송해야 합니다' },
        mock:     { color:'#a855f7', bg:'#faf5ff', icon:'🧪', label:'테스트 모드', desc:'실제 발송 안 됨 — 모든 신청이 mock 응답으로 처리됩니다 (개발 검증용)' },
        real:     { color:'#10b981', bg:'#ecfdf5', icon:'✅', label:'실제 발송', desc:'학생 신청 즉시 KT alpha 가 카카오톡으로 자동 발송합니다' },
      };
      const info = MODE_INFO[m] || MODE_INFO.disabled;
      const balLine = d.balance != null
        ? `<div style="font-size:13px;color:#374151;margin-top:8px"><b>가맹점 잔액:</b> <span style="font-weight:800;color:#d97706">${fmt(d.balance)} 원</span></div>`
        : (d.balance_error ? `<div style="font-size:11.5px;color:#ef4444;margin-top:8px">잔액 조회 실패: ${esc(d.balance_error)}</div>` : '');
      const catLine = d.catalog_total
        ? `<div style="font-size:11.5px;color:#6b7280;margin-top:6px">카탈로그: <b>${d.catalog_with_external_id}/${d.catalog_total}</b>개 상품에 KT alpha 코드 등록됨${d.catalog_with_external_id < d.catalog_total ? ' <span style="color:#f59e0b">⚠ 나머지는 수동 발송됩니다</span>' : ''}</div>`
        : '';
      el.innerHTML = `
        <div style="background:${info.bg};border:1px solid ${info.color};border-left:5px solid ${info.color};border-radius:10px;padding:14px 16px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:24px">${info.icon}</div>
            <div style="flex:1">
              <div style="font-size:14.5px;font-weight:800;color:${info.color}">${info.label}</div>
              <div style="font-size:12px;color:#4b5563;margin-top:2px">${info.desc}</div>
            </div>
            <button onclick="ptLoadApiStatus()" style="padding:6px 12px;font-size:11.5px;background:#fff;border:1px solid #d1d5db;border-radius:6px;cursor:pointer">🔄</button>
          </div>
          ${balLine}
          ${catLine}
          <div style="margin-top:10px;padding-top:10px;border-top:1px dashed ${info.color};font-size:11px;color:#6b7280;font-family:monospace">
            api_key=${d.api_key_set?'✓':'✗'} · user_id=${d.user_id_set?'✓':'✗'} · callback=${d.callback_url_set?'✓':'✗'} · test_mode=${d.test_mode?'on':'off'}<br>
            base: ${esc(d.api_base)}
          </div>
        </div>`;
    } catch(e) {
      el.innerHTML = '<div style="padding:14px;color:#ef4444">상태 로드 실패: '+esc(e.message)+'</div>';
    }
  };

  // ━━━━━━━━ 카드 열림 감지 → 자동 로드 ━━━━━━━━
  function ptAttachOnOpen() {
    const map = {
      'sub-points-api':         'ptLoadApiStatus',
      'sub-points-balances':    'ptLoadBalances',
      'sub-points-catalog':     'ptLoadCatalog',
      'sub-points-redemptions': 'ptLoadRedemptions',
      'sub-points-rules':       'ptLoadRules',
    };
    Object.entries(map).forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (!el || el.__ptBound) return;
      el.__ptBound = true;
      el.addEventListener('toggle', () => { if (el.open && window[fn]) window[fn](); });
    });
    // 부모 카드 열림에도 API 상태 + 잔액 자동 로드
    const parent = document.getElementById('card-points-mgmt');
    if (parent && !parent.__ptBound) {
      parent.__ptBound = true;
      parent.addEventListener('toggle', () => {
        if (parent.open) {
          if (window.ptLoadApiStatus) window.ptLoadApiStatus();
          if (window.ptLoadBalances) window.ptLoadBalances();
        }
      });
    }
  }

  // Initial setup once DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ptAttachOnOpen);
  } else {
    ptAttachOnOpen();
  }
})();
