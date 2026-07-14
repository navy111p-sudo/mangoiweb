// ═══════════════════════════════════════════════════════════════
// adm-s6.js — admin.html 인라인 추출 (2단계 34차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  window.loadKakaoStatus = async function(){
    const el = document.getElementById('kakao-status-panel');
    if (!el) return;
    const isEn = (document.documentElement.lang === 'en' || window.adminLang === 'en');
    el.innerHTML = '<div style="padding:14px;text-align:center;color:#6b7280">'+(isEn?'Checking status…':'상태 확인 중…')+'</div>';
    try {
      const r = await fetch('/api/admin/kakao/status');
      const d = await r.json();
      const m = d.mode;
      const INFO = isEn ? {
        disabled: { color:'#9ca3af', bg:'#f8fafc', icon:'⏸', label:'Not Connected', desc:'Not connected yet — AlimTalk messages are not being sent' },
        mock:     { color:'#a855f7', bg:'#faf5ff', icon:'🧪', label:'Test Mode', desc:'No real KakaoTalk is sent (mock)' },
        real:     { color:'#10b981', bg:'#ecfdf5', icon:'✅', label:'Live Sending', desc:'Auto-sent on student entry/exit/chat' },
      } : {
        disabled: { color:'#9ca3af', bg:'#f8fafc', icon:'⏸', label:'미연동', desc:'아직 연동 전이라 알림톡이 발송되지 않아요' },
        mock:     { color:'#a855f7', bg:'#faf5ff', icon:'🧪', label:'테스트 모드', desc:'실제 카톡은 발송되지 않아요 (mock)' },
        real:     { color:'#10b981', bg:'#ecfdf5', icon:'✅', label:'실제 발송 중', desc:'학생 입장·종료·채팅 시 자동 발송돼요' },
      };
      const info = INFO[m] || INFO.disabled;
      const t = d.templates || {};
      const tCount = (t.lesson_start?1:0)+(t.lesson_end?1:0)+(t.chat_summary?1:0)+(t.mention?1:0);
      // 가로 배지 (✓ 초록 / ✗ 회색) — 줄바꿈 자동
      const chip = (label, ok) => `<span style="display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;background:${ok?'#ecfdf5':'#f3f4f6'};color:${ok?'#059669':'#9ca3af'};border:1px solid ${ok?'#a7f3d0':'#e5e7eb'}">${ok?'✓':'✗'} ${label}</span>`;
      const balChip = d.balance != null
        ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;background:#fffbeb;color:#d97706;border:1px solid #fde68a">💰 ${(d.balance||0).toLocaleString('ko-KR')}원</span>`
        : '';
      el.innerHTML = `
        <div style="background:${info.bg};border:1px solid ${info.color};border-left:5px solid ${info.color};border-radius:12px;padding:14px 16px;width:100%;box-sizing:border-box">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="font-size:26px;line-height:1;flex-shrink:0">${info.icon}</div>
            <div style="flex:1;min-width:140px">
              <div style="font-size:16px;font-weight:800;color:${info.color};word-break:keep-all">${info.label}</div>
              <div style="font-size:12.5px;color:#4b5563;margin-top:2px;word-break:keep-all">${info.desc}</div>
            </div>
            <button onclick="loadKakaoStatus()" title="${isEn?'Refresh':'새로고침'}" style="flex-shrink:0;padding:8px 13px;font-size:13px;background:#fff;border:1px solid #d1d5db;border-radius:8px;cursor:pointer">🔄</button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:12px">
            ${chip(isEn?'API Key':'API키', d.api_key_set)}
            ${chip(isEn?'Secret':'시크릿', d.api_secret_set)}
            ${chip(isEn?'Sender Profile':'발신프로필', d.pfid_set)}
            ${chip((isEn?'Templates ':'템플릿 ')+tCount+'/4', tCount===4)}
            ${d.test_mode ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:5px 11px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;background:#faf5ff;color:#a855f7;border:1px solid #e9d5ff">🧪 ${isEn?'Test Mode':'테스트모드'}</span>` : ''}
            ${balChip}
          </div>
        </div>`;
    } catch(e) {
      const isEn = (document.documentElement.lang === 'en' || window.adminLang === 'en');
      el.innerHTML = '<div style="padding:14px;color:#ef4444">'+(isEn?'Status load failed: ':'상태 로드 실패: ')+e.message+'</div>';
    }
  };
  function bindKakaoOpen(){
    const card = document.getElementById('card-kakao-mgmt');
    if (card && !card.__kakaoBound) {
      card.__kakaoBound = true;
      card.addEventListener('toggle', () => { if (card.open && window.loadKakaoStatus) window.loadKakaoStatus(); });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindKakaoOpen);
  else bindKakaoOpen();

  // 🌐 언어 전환 시 카카오 상태 패널 재렌더 (이미 로드된 경우만)
  document.addEventListener('mangoi:lang-changed', function(){
    var card = document.getElementById('card-kakao-mgmt');
    var p = document.getElementById('kakao-status-panel');
    if (card && card.open && p && p.children.length && window.loadKakaoStatus) window.loadKakaoStatus();
  });

  // K5: 학부모 답장 inbound 로그
  window.kiLoadInbound = async function(){
    const el = document.getElementById('ki-inbound-table');
    if (!el) return;
    el.innerHTML = '<div style="color:#6b7280;padding:14px">불러오는 중…</div>';
    try {
      const r = await fetch('/api/admin/kakao/inbound?limit=50');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const rows = d.rows || [];
      if (!rows.length) {
        el.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:8px">아직 학부모 답장이 없습니다.<br><span style="font-size:11px">카카오 i 오픈빌더에 webhook URL 등록 후 학부모가 답장하면 여기 표시됩니다.</span></div>';
        return;
      }
      const fmtKDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR', { dateStyle:'short', timeStyle:'short' }) : '-';
      const escFn = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:8px;overflow:hidden">
        <thead style="background:#f3f4f6"><tr>
          <th style="padding:8px;text-align:left">시각</th>
          <th style="padding:8px;text-align:left">발신자</th>
          <th style="padding:8px;text-align:left">매핑 학생</th>
          <th style="padding:8px;text-align:left">메시지</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:8px;color:#6b7280;font-size:11px">${fmtKDate(r.received_at)}</td>
          <td style="padding:8px"><b>${escFn(r.sender_name||'-')}</b><br><span style="color:#9ca3af;font-size:11px">${escFn(r.sender_phone||'')}</span></td>
          <td style="padding:8px;font-family:monospace;color:#3b82f6">${escFn(r.mapped_user_id||'미매핑')}</td>
          <td style="padding:8px;color:#1f2937">${escFn(r.message||'')}</td>
        </tr>`).join('')}</tbody></table>`;
    } catch(e) {
      el.innerHTML = '<div style="color:#ef4444;padding:14px">로드 실패: '+e.message+'</div>';
    }
  };
  document.getElementById('sub-kakao-inbound')?.addEventListener('toggle', function(){
    if (this.open) window.kiLoadInbound();
  });
})();
