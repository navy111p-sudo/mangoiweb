// ═══════════════════════════════════════════════════════════════
// adm-r9.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const fmt = (n) => (Number(n)||0).toLocaleString('ko-KR');
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR', { dateStyle:'short', timeStyle:'short' }) : '-';
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  window.wpLoadStatus = async function(){
    const el = document.getElementById('wp-status-box');
    if (!el) return;
    const isEn = (window.adminLang === 'en');
    el.innerHTML = `<div style="color:#6b7280">${isEn?'Loading…':'불러오는 중…'}</div>`;
    try {
      const r = await fetch('/api/admin/push/status');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const m = d.mode;
      const MODES = isEn ? {
        disabled: { icon:'⏸', label:'Not Connected', desc:'VAPID key not registered. Click "🔐 Generate New VAPID Keys" below, then register via wrangler secret.', color:'#9ca3af', bg:'#f3f4f6' },
        mock:     { icon:'🧪', label:'Test Mode',     desc:'No real push is sent — only console logs.', color:'#a855f7', bg:'#faf5ff' },
        real:     { icon:'✅', label:'Live',          desc:'VAPID-authenticated pushes are sent directly to browsers.', color:'#10b981', bg:'#ecfdf5' },
      } : {
        disabled: { icon:'⏸', label:'미연동', desc:'VAPID 키가 등록되지 않았습니다. 아래 "🔐 새 VAPID 키 생성" 버튼으로 발급 후, wrangler secret 으로 등록하세요.', color:'#9ca3af', bg:'#f3f4f6' },
        mock:     { icon:'🧪', label:'테스트 모드', desc:'실제 푸시는 안 보내고 콘솔에만 로그를 남깁니다.', color:'#a855f7', bg:'#faf5ff' },
        real:     { icon:'✅', label:'실제 발송', desc:'VAPID 인증된 푸시를 브라우저로 직접 발송합니다.', color:'#10b981', bg:'#ecfdf5' },
      };
      const info = MODES[m] || MODES.disabled;
      el.innerHTML = `
        <div style="background:${info.bg};border-left:4px solid ${info.color};padding:14px;border-radius:8px">
          <div style="font-size:16px;font-weight:800;color:${info.color}">${info.icon} ${info.label}</div>
          <div style="font-size:12.5px;color:#374151;margin-top:6px">${esc(info.desc)}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:8px">
            <b>${isEn?'Active subscribers:':'활성 구독자:'}</b> ${fmt(d.active_subs)}${isEn?'':' 명'} · <b>${isEn?'Sent (7d):':'최근 7일 발송:'}</b> ${fmt(d.queued_7d)}${isEn?'':' 건'} · <b>${isEn?'VAPID public key:':'VAPID 공개키:'}</b> ${d.has_pub_key?'✅':'❌'}
          </div>
        </div>`;
    } catch(e) {
      el.innerHTML = '<div style="color:#ef4444">'+(isEn?'Load failed: ':'로드 실패: ')+esc(e.message)+'</div>';
    }
  };

  window.wpGenerateVapid = async function(){
    if (!confirm('새 VAPID 키 페어를 생성합니다. (기존 구독자는 만료되므로 한 번만 발급하세요)')) return;
    try {
      const r = await fetch('/api/admin/push/generate-vapid');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const msg = `✅ VAPID 키 페어 생성 완료\n\n=== PUBLIC KEY (공개) ===\n${d.publicKey}\n\n=== PRIVATE KEY (절대 노출 금지!) ===\n${d.privateKey}\n\n다음을 PowerShell에서 실행하세요:\n\nnpx wrangler secret put VAPID_PUBLIC_KEY --env production\n(붙여넣기: ${d.publicKey})\n\nnpx wrangler secret put VAPID_PRIVATE_KEY --env production\n(붙여넣기: ${d.privateKey})\n\nnpx wrangler secret put VAPID_SUBJECT --env production\n(붙여넣기: mailto:admin@mangoi.io)`;
      prompt('아래 키를 안전한 곳에 복사해두세요. 한 번만 표시됩니다!', d.publicKey + '\n\nPRIVATE: ' + d.privateKey);
      alert(msg);
    } catch(e) { alert('❌ ' + e.message); }
  };

  window.wpLoadSubs = async function(){
    const el = document.getElementById('wp-subs-table');
    el.innerHTML = '<div style="color:#6b7280">불러오는 중…</div>';
    try {
      const r = await fetch('/api/admin/push/list');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const rows = d.rows || [];
      if (!rows.length) {
        el.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:8px">아직 구독자가 없습니다.<br><span style="font-size:11px">학생/학부모가 메인 페이지에서 "🔔 알림 허용" 해야 등록됩니다.</span></div>';
        return;
      }
      el.innerHTML = `
        <div style="margin-bottom:8px;font-size:11.5px;color:#6b7280">전체 ${d.total} 명 · 활성 ${d.active} 명</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff">
          <thead style="background:#f3f4f6"><tr>
            <th style="padding:8px;text-align:left">user_id</th>
            <th style="padding:8px;text-align:left">상태</th>
            <th style="padding:8px;text-align:left">브라우저</th>
            <th style="padding:8px;text-align:left">등록일</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `<tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:8px;font-family:monospace">${esc(r.user_id||'-')}</td>
              <td style="padding:8px">${r.enabled?'<span style="color:#10b981;font-weight:700">✓ 활성</span>':'<span style="color:#9ca3af">○ 비활성</span>'}</td>
              <td style="padding:8px;color:#6b7280;font-size:10.5px">${esc((r.ua||'').slice(0,60))}</td>
              <td style="padding:8px;color:#6b7280">${fmtDate(r.created_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    } catch(e) {
      el.innerHTML = '<div style="color:#ef4444">로드 실패: '+esc(e.message)+'</div>';
    }
  };

  window.wpSendNow = async function(){
    const uid = document.getElementById('wp-target-uid').value.trim();
    const title = document.getElementById('wp-title').value.trim() || '망고아이 알림';
    const body = document.getElementById('wp-body').value.trim();
    const targetUrl = document.getElementById('wp-url').value.trim() || '/';
    if (!body) { alert('본문을 입력하세요'); return; }
    const out = document.getElementById('wp-send-result');
    out.innerHTML = '<div style="color:#6b7280;font-size:12px">발송 중…</div>';
    try {
      const r = await fetch('/api/admin/push/send', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid || null, title, body, url: targetUrl })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      out.innerHTML = `<div style="padding:12px;background:#ecfdf5;border:1px solid #34d399;border-radius:8px;font-size:13px"><b style="color:#059669">✅ 발송 완료</b><br>총 ${d.total} 명 중 성공 <b>${d.sent}</b>, 실패 ${d.fail}${d.expired?', 만료 '+d.expired:''}건 · 모드: ${d.mode}</div>`;
    } catch(e) {
      out.innerHTML = '<div style="color:#ef4444;font-size:13px">❌ ' + esc(e.message) + '</div>';
    }
  };

  // 🆕 admin 자신의 브라우저를 푸시 구독
  window.wpSubscribeMe = async function(){
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('이 브라우저는 푸시 알림 미지원');
      return;
    }
    try {
      const keyResp = await fetch('/api/push/vapid-public-key');
      const keyD = await keyResp.json();
      if (!keyD.ok || !keyD.key) {
        alert('VAPID 공개키가 등록되지 않았습니다. 먼저 🔐 새 VAPID 키 생성 후 wrangler secret put 으로 등록하세요.');
        return;
      }
      // base64url → Uint8Array
      function b64uTo(b64){const pad='='.repeat((4-b64.length%4)%4);const base64=(b64+pad).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { alert('알림 권한 거부됨'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uTo(keyD.key) });
      const user = (function(){try{return JSON.parse(localStorage.getItem('mango_user')||'null');}catch(e){return null;}})();
      await fetch('/api/push/subscribe', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ subscription: sub.toJSON(), user_id: user?.user_id || 'admin', ua: navigator.userAgent.slice(0,200) })
      });
      alert('🔔 admin 브라우저 구독 완료!\n이제 🧪 나에게 테스트 버튼으로 알림 검증 가능합니다.');
      window.wpLoadSubs && window.wpLoadSubs();
    } catch(e) { alert('❌ ' + e.message); }
  };

  // 🆕 admin 본인에게 테스트 푸시 발송
  window.wpSendTestToSelf = async function(){
    const user = (function(){try{return JSON.parse(localStorage.getItem('mango_user')||'null');}catch(e){return null;}})();
    const uid = user?.user_id || 'admin';
    const out = document.getElementById('wp-send-result');
    out.innerHTML = '<div style="color:#6b7280;font-size:12px">테스트 푸시 발송 중…</div>';
    try {
      const r = await fetch('/api/admin/push/send', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          user_id: uid,
          title: '🧪 망고아이 테스트 푸시',
          body: '관리자 본인 브라우저로 알림이 정상 도착했어요!',
          url: '/admin.html'
        })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const isSubscribed = d.total > 0;
      if (!isSubscribed) {
        out.innerHTML = `<div style="padding:12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;font-size:13px"><b style="color:#92400e">⚠ 먼저 "🔔 내 브라우저 구독" 을 눌러주세요</b><br>uid=${esc(uid)} 의 활성 구독이 없습니다.</div>`;
      } else {
        out.innerHTML = `<div style="padding:12px;background:#dbeafe;border:1px solid #3b82f6;border-radius:8px;font-size:13px"><b style="color:#1e40af">🧪 테스트 발송 완료</b><br>${d.sent}/${d.total} 성공. 잠시 후 브라우저 알림이 뜨면 정상!</div>`;
      }
    } catch(e) { out.innerHTML = '<div style="color:#ef4444">❌ '+esc(e.message)+'</div>'; }
  };

  // 🆕 발송 이력 로드
  window.wpLoadHistory = async function(){
    const el = document.getElementById('wp-history-table');
    if (!el) return;
    el.innerHTML = '<div style="color:#6b7280;padding:14px">불러오는 중…</div>';
    try {
      const r = await fetch('/api/admin/push/history?limit=50');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      const rows = d.rows || [];
      if (!rows.length) {
        el.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:8px">아직 발송 이력이 없습니다.</div>';
        return;
      }
      el.innerHTML = `
        <div style="margin-bottom:8px;font-size:11.5px;color:#6b7280">최근 ${rows.length} 건</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:8px;overflow:hidden">
          <thead style="background:#f3f4f6"><tr>
            <th style="padding:8px;text-align:left">시각</th>
            <th style="padding:8px;text-align:left">수신자</th>
            <th style="padding:8px;text-align:left">제목</th>
            <th style="padding:8px;text-align:left">본문</th>
            <th style="padding:8px;text-align:center">전달</th>
          </tr></thead>
          <tbody>${rows.map(r => `<tr style="border-bottom:1px solid #e5e7eb">
            <td style="padding:8px;color:#6b7280;font-size:11px;white-space:nowrap">${fmtDate(r.queued_at)}</td>
            <td style="padding:8px;font-family:monospace">${esc(r.user_id||'-')}</td>
            <td style="padding:8px;font-weight:700">${esc(r.title||'')}</td>
            <td style="padding:8px;color:#374151;font-size:11.5px">${esc((r.body||'').slice(0,60))}</td>
            <td style="padding:8px;text-align:center">${r.fetched_at?'<span style="color:#10b981">✓</span>':'<span style="color:#9ca3af">○</span>'}</td>
          </tr>`).join('')}</tbody>
        </table>`;
    } catch(e) { el.innerHTML = '<div style="color:#ef4444;padding:14px">로드 실패: '+esc(e.message)+'</div>'; }
  };

  document.getElementById('card-webpush-mgmt')?.addEventListener('toggle', function(){
    if (this.open) wpLoadStatus();
  });
})();
