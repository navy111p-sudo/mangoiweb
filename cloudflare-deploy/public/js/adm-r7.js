// ═══════════════════════════════════════════════════════════════
// adm-r7.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const fmt = (n) => (Number(n)||0).toLocaleString('ko-KR');
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'}) : '-';
  const fmtDateShort = (ms) => ms ? new Date(ms).toLocaleDateString('ko-KR') : '-';
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const _STATUS_LABEL_KO = { new:'🆕 신규', contacted:'📞 연락중', registered:'✅ 등록', rejected:'❌ 미등록' };
  const _STATUS_LABEL_EN = { new:'🆕 New', contacted:'📞 Contacting', registered:'✅ Enrolled', rejected:'❌ Not Enrolled' };
  const STATUS_LABEL = new Proxy({}, { get: (_,k) => ((document.documentElement.lang === 'en' || window.adminLang === 'en') ? _STATUS_LABEL_EN : _STATUS_LABEL_KO)[k] });
  const STATUS_COLOR = { new:'#3b82f6', contacted:'#f59e0b', registered:'#10b981', rejected:'#9ca3af' };

  window.iqLoadStats = async function(){
    const grid = document.getElementById('iq-stats-grid');
    const bars = document.getElementById('iq-status-bars');
    try {
      const r = await fetch('/api/admin/inquiry/stats');
      const d = await r.json();
      const _isEn = (document.documentElement.lang === 'en' || window.adminLang === 'en');
      const tiles = [
        { ico:'💌', label: _isEn?'Inquiries This Month':'이번 달 상담', value:fmt(d.total_this_month), trend:d.total_trend, color:'#3b82f6' },
        { ico:'✅', label: _isEn?'Enrollments This Month':'이번 달 등록', value:fmt(d.registered_this_month), trend:null, color:'#10b981' },
        { ico:'📈', label: _isEn?'Conversion Rate':'전환률', value:d.conversion_rate+'%', trend:null, color:'#f59e0b' },
        { ico:'⏱', label: _isEn?'Avg Days to Enroll':'평균 등록까지', value:d.avg_days_to_register+(_isEn?'d':'일'), trend:null, color:'#a855f7' },
      ];
      grid.innerHTML = tiles.map(t => {
        const trendStr = t.trend != null
          ? (t.trend > 0 ? `<span style="color:#10b981;font-size:11px;font-weight:700">▲ +${t.trend}%</span>`
            : t.trend < 0 ? `<span style="color:#ef4444;font-size:11px;font-weight:700">▼ ${t.trend}%</span>`
            : `<span style="color:#475569;font-size:11px">→</span>`) : '';
        // 🎨 외부 진한 파랑 + 내부 연한 파랑 — JS 인라인으로 강제
        return `<div style="background:linear-gradient(180deg,#f8fafc,#eef2ff);border:1px solid rgba(99,102,241,0.30);border-left:4px solid ${t.color};border-radius:10px;padding:12px 14px;box-shadow:0 2px 6px rgba(0,0,0,0.15)">
          <div style="font-size:18px;line-height:1">${t.ico}</div>
          <div style="font-size:11px;color:#1e3a8a;font-weight:800;text-transform:uppercase;margin-top:4px">${t.label}</div>
          <div style="font-size:22px;font-weight:900;color:#0f172a;margin-top:2px">${t.value}</div>
          ${trendStr ? '<div style="margin-top:4px">'+trendStr+'</div>' : ''}
        </div>`;
      }).join('');

      // 상태별 막대 — 연한 파랑 톤
      const by = d.by_status || {};
      const total = Object.values(by).reduce((a,b)=>a+(b||0), 0) || 1;
      const order = ['new','contacted','registered','rejected'];
      bars.style.display = 'block';
      bars.style.cssText = 'background:linear-gradient(180deg,#f8fafc,#eef2ff);border:1px solid rgba(99,102,241,0.30);border-radius:10px;padding:14px 18px;box-shadow:0 2px 6px rgba(0,0,0,0.15)';
      bars.innerHTML = '<div style="font-size:12px;font-weight:800;color:#1e3a8a;margin-bottom:10px">'+(_isEn?'📊 Status Distribution (All)':'📊 상태별 분포 (전체)')+'</div>'
        + order.map(st => {
          const n = by[st] || 0;
          const pct = Math.round((n/total)*100);
          return `<div style="margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#0f172a;margin-bottom:3px;font-weight:600">
              <span><span style="color:${STATUS_COLOR[st]};font-weight:800">${STATUS_LABEL[st]}</span></span>
              <span><b>${fmt(n)}건</b> · ${pct}%</span>
            </div>
            <div style="height:8px;background:#e0e7ff;border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${STATUS_COLOR[st]};transition:width .6s"></div>
            </div>
          </div>`;
        }).join('');
    } catch(e) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:14px;color:#ef4444;text-align:center">로드 실패: '+esc(e.message)+'</div>';
    }
  };

  window.iqLoad = async function(){
    const el = document.getElementById('iq-list');
    el.innerHTML = '<div style="padding:14px;color:#6b7280;text-align:center">불러오는 중…</div>';
    const filter = document.getElementById('iq-filter').value;
    try {
      const r = await fetch('/api/admin/inquiry/list' + (filter?'?status='+filter:''));
      const d = await r.json();
      const rows = d.rows || [];
      const _isEnC = (document.documentElement.lang === 'en' || window.adminLang === 'en');
      document.getElementById('iq-count').innerHTML = _isEnC ? `Total <b>${fmt(rows.length)}</b>` : `총 <b>${fmt(rows.length)}</b>건`;
      const _isEn2 = (document.documentElement.lang === 'en' || window.adminLang === 'en');
      if (!rows.length) { el.innerHTML = '<div style="padding:30px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:10px">'+(_isEn2?'No inquiries match.':'조건에 맞는 상담이 없습니다.')+'</div>'; return; }
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12.5px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:#f3f4f6"><tr>
          <th style="text-align:left;padding:9px 12px">상태</th>
          <th style="text-align:left;padding:9px 12px">이름·전화</th>
          <th style="text-align:left;padding:9px 12px">메시지</th>
          <th style="text-align:left;padding:9px 12px">상담일</th>
          <th style="text-align:left;padding:9px 12px">메모</th>
          <th style="text-align:center;padding:9px 12px">상태 변경</th>
        </tr></thead>
        <tbody>${rows.map(iq => {
          const st = iq.status || 'new';
          const c = STATUS_COLOR[st] || '#6b7280';
          return `<tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:9px 12px;white-space:nowrap"><span style="color:${c};font-weight:700;font-size:11.5px">${STATUS_LABEL[st]||st}</span></td>
            <td style="padding:9px 12px"><b>${esc(iq.name||'-')}</b><br><span style="font-size:11px;color:#6b7280">${esc(iq.phone||'')}</span></td>
            <td style="padding:9px 12px;font-size:12px;color:#4b5563;max-width:280px">${esc((iq.message||'').slice(0,80))}</td>
            <td style="padding:9px 12px;font-size:11.5px;color:#9ca3af">${fmtDateShort(iq.created_at)}${iq.registered_at?'<br><span style="font-size:10.5px;color:#10b981">등록: '+fmtDateShort(iq.registered_at)+'</span>':''}</td>
            <td style="padding:9px 12px;font-size:11.5px;color:#6b7280;max-width:160px">${esc((iq.notes||'').slice(0,40))}</td>
            <td style="padding:8px 10px;text-align:center;white-space:nowrap">
              <select onchange="iqUpdateStatus(${iq.id}, this.value)" style="padding:5px 8px;font-size:11.5px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">
                <option value="">변경 →</option>
                <option value="contacted">📞 연락중</option>
                <option value="registered">✅ 등록</option>
                <option value="rejected">❌ 미등록</option>
              </select>
              <button onclick="iqEditNotes(${iq.id})" style="padding:5px 8px;font-size:11px;background:#6366f1;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-left:3px">📝</button>
              <button onclick="iqDelete(${iq.id})" style="padding:5px 8px;font-size:11px;background:#ef4444;color:#fff;border:0;border-radius:5px;cursor:pointer;margin-left:3px">🗑</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
    } catch(e) {
      el.innerHTML = '<div style="padding:14px;color:#ef4444">로드 실패: '+esc(e.message)+'</div>';
    }
  };

  window.iqUpdateStatus = async function(id, status){
    if (!status) return;
    const labelMap = { contacted:'연락중', registered:'등록', rejected:'미등록' };
    if (!confirm(`상담 #${id}를 「${labelMap[status]||status}」로 변경할까요?`)) return;
    try {
      const r = await fetch('/api/admin/inquiry/'+id, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status })
      });
      const d = await r.json();
      if (d.ok) { iqLoad(); iqLoadStats(); }
      else alert('❌ ' + (d.error||'실패'));
    } catch(e) { alert('❌ '+e.message); }
  };
  window.iqEditNotes = async function(id){
    const notes = prompt('상담 메모 (영업 진행 상황 등):', '');
    if (notes === null) return;
    try {
      const r = await fetch('/api/admin/inquiry/'+id, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ notes })
      });
      const d = await r.json();
      if (d.ok) iqLoad();
      else alert('❌ ' + (d.error||'실패'));
    } catch(e) { alert('❌ '+e.message); }
  };
  window.iqDelete = async function(id){
    if (!confirm('상담 #'+id+'를 삭제하시겠습니까?')) return;
    await fetch('/api/admin/inquiry/'+id, { method:'DELETE' });
    iqLoad(); iqLoadStats();
  };
  function bindInquiryOpen(){
    const parent = document.getElementById('card-inquiry-mgmt');
    if (parent && !parent.__iqBound) {
      parent.__iqBound = true;
      parent.addEventListener('toggle', () => { if (parent.open) { iqLoadStats(); iqLoad(); } });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindInquiryOpen);
  else bindInquiryOpen();
})();
