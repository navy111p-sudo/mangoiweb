// idx-voice-diary.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

(function(){
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function isEn(){ try { return (document.documentElement.lang === 'en') || (window.adminLang === 'en') || (window.currentLang === 'en'); } catch{ return false; } }
  function uid(){
    try {
      return (window.sessionUid && window.sessionUid())
        || (window.currentUser && (window.currentUser.user_id || window.currentUser.uid))
        || localStorage.getItem('mangoi_uid')
        || localStorage.getItem('uid')
        || '';
    } catch { return ''; }
  }

  let vdState = { tab:'record', recorder:null, chunks:[], startMs:0, timer:null, lastBlob:null, lastDiaryId:null };

  window.openVoiceDiaryModal = function(){
    const ov = document.getElementById('vd-overlay'); if (!ov) return;
    if (ov.classList.contains('open')) { closeVoiceDiaryModal(); return; }
    const en = isEn();
    if (!uid()) { alert(en?'Please log in first.':'먼저 로그인하세요.'); return; }
    ov.classList.add('open');
    vdSwitchTab('record');
  };
  window.closeVoiceDiaryModal = function(){
    vdStopRec(true);
    const ov = document.getElementById('vd-overlay'); if (ov) ov.classList.remove('open');
  };
  window.vdSwitchTab = function(tab){
    vdState.tab = tab;
    document.getElementById('vd-tab-record').classList.toggle('active', tab==='record');
    document.getElementById('vd-tab-calendar').classList.toggle('active', tab==='calendar');
    if (tab==='record') vdRenderRecord();
    else vdRenderCalendar();
  };

  function vdRenderRecord(){
    const en = isEn();
    const body = document.getElementById('vd-body'); if (!body) return;
    body.innerHTML = `
      <div style="text-align:center;background:#fff;border:1px solid #c7d2fe;border-radius:12px;padding:18px">
        <div style="font-size:13px;color:#475569;margin-bottom:6px">${en?'Tip: 30 seconds recommended':'추천 녹음 시간: 30초'}</div>
        <div id="vd-rec-time">00:00</div>
        <div id="vd-rec-status">${en?'🎤 Ready — press record':'🎤 준비 완료 — 녹음 버튼을 누르세요'}</div>
        <div style="display:flex;justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="vd-btn rec" id="vd-rec-btn" onclick="vdStartRec()">${en?'🔴 Start':'🔴 녹음 시작'}</button>
          <button class="vd-btn ghost" id="vd-stop-btn" onclick="vdStopRec()" disabled style="opacity:0.5">${en?'⏹ Stop':'⏹ 정지'}</button>
        </div>
      </div>
      <div id="vd-rec-result" style="margin-top:12px"></div>
    `;
  }

  window.vdStartRec = async function(){
    const en = isEn();
    const status = document.getElementById('vd-rec-status');
    const recBtn = document.getElementById('vd-rec-btn');
    const stopBtn = document.getElementById('vd-stop-btn');
    try {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        status.textContent = en?'❌ MediaRecorder not supported':'❌ 브라우저가 녹음을 지원하지 않습니다';
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' });
      vdState.chunks = [];
      mr.ondataavailable = e => { if (e.data && e.data.size > 0) vdState.chunks.push(e.data); };
      mr.onstop = async () => {
        try { stream.getTracks().forEach(t => t.stop()); } catch{}
        const blob = new Blob(vdState.chunks, { type: 'audio/webm' });
        vdState.lastBlob = blob;
        await vdUpload(blob);
      };
      mr.start();
      vdState.recorder = mr;
      vdState.startMs = Date.now();
      vdState.timer = setInterval(()=>{
        const sec = Math.floor((Date.now() - vdState.startMs)/1000);
        const m = String(Math.floor(sec/60)).padStart(2,'0');
        const s = String(sec%60).padStart(2,'0');
        const el = document.getElementById('vd-rec-time'); if (el) el.textContent = m + ':' + s;
      }, 250);
      status.textContent = en?'🔴 Recording…':'🔴 녹음 중…';
      recBtn.disabled = true; recBtn.style.opacity = 0.5;
      stopBtn.disabled = false; stopBtn.style.opacity = 1;
    } catch(e){
      status.textContent = (en?'❌ Microphone error: ':'❌ 마이크 오류: ') + (e.message || 'denied');
    }
  };

  window.vdStopRec = function(silent){
    if (vdState.recorder && vdState.recorder.state !== 'inactive') {
      try { vdState.recorder.stop(); } catch{}
    }
    vdState.recorder = null;
    if (vdState.timer) { clearInterval(vdState.timer); vdState.timer = null; }
    const recBtn = document.getElementById('vd-rec-btn');
    const stopBtn = document.getElementById('vd-stop-btn');
    if (recBtn) { recBtn.disabled = false; recBtn.style.opacity = 1; }
    if (stopBtn) { stopBtn.disabled = true; stopBtn.style.opacity = 0.5; }
    if (!silent) {
      const status = document.getElementById('vd-rec-status');
      if (status) status.textContent = isEn()?'⏳ Uploading…':'⏳ 업로드 중…';
    }
  };

  async function vdUpload(blob){
    const en = isEn();
    const out = document.getElementById('vd-rec-result');
    if (!out) return;
    out.innerHTML = `<div style="color:#475569;padding:14px;text-align:center">⏳ ${en?'Uploading audio + transcribing…':'음성 업로드 + 전사 중…'}</div>`;
    try {
      const b64 = await blobToBase64(blob);
      const duration = Math.round((Date.now() - vdState.startMs)/1000);
      const r = await fetch('/api/diary/upload', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid(), token: (localStorage.getItem('mango_token')||''), audio_base64: b64, mime: 'audio/webm', duration_seconds: duration, date: new Date().toISOString().slice(0,10) })
      }).then(x=>x.json()).catch(()=>({ok:false,error:'network'}));
      if (!r.ok) throw new Error(r.error || 'upload failed');
      vdState.lastDiaryId = r.diary_id || r.id;
      out.innerHTML = `
        <div class="vd-card">
          <div style="font-size:11.5px;color:#4338ca;font-weight:700;margin-bottom:4px">📝 ${en?'Transcript':'영문 전사'}</div>
          <div style="font-size:13px;line-height:1.6">${esc(r.transcript || '-')}</div>
        </div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button class="vd-btn" onclick="vdCorrect()">${en?'🤖 Get Correction':'🤖 첨삭 받기'}</button>
          <button class="vd-btn ghost" onclick="vdRenderRecordWrap()">${en?'🔄 Again':'🔄 다시'}</button>
        </div>
        <div id="vd-correct-result" style="margin-top:10px"></div>
      `;
    } catch(e){ out.innerHTML = `<div style="color:#dc2626;padding:14px">❌ ${esc(e.message)}</div>`; }
  }

  window.vdRenderRecordWrap = function(){ vdRenderRecord(); };

  window.vdCorrect = async function(){
    const en = isEn();
    const out = document.getElementById('vd-correct-result');
    if (!out || !vdState.lastDiaryId) { alert(en?'No diary to correct.':'첨삭할 일기가 없습니다.'); return; }
    out.innerHTML = `<div style="color:#475569;padding:14px;text-align:center">🤖 ${en?'AI is correcting…':'AI 첨삭 중…'}</div>`;
    try {
      const r = await fetch('/api/diary/correct', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ diary_id: vdState.lastDiaryId, token: (localStorage.getItem('mango_token')||'') })
      }).then(x=>x.json()).catch(()=>({ok:false,error:'network'}));
      if (!r.ok) throw new Error(r.error || 'correction failed');
      out.innerHTML = `
        <div class="vd-card" style="border-color:#fcd34d">
          <div style="font-size:11.5px;color:#b45309;font-weight:700;margin-bottom:4px">🤖 ${en?'AI Correction':'AI 첨삭'}</div>
          <div style="font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(r.correction || '-')}</div>
        </div>
        <div class="vd-card" style="border-color:#86efac">
          <div style="font-size:11.5px;color:#15803d;font-weight:700;margin-bottom:4px">🌟 ${en?'Encouragement':'한국어 격려'}</div>
          <div style="font-size:13px;line-height:1.6;white-space:pre-wrap">${esc(r.encouragement_ko || r.encouragement || '-')}</div>
        </div>
        <div style="display:flex;justify-content:space-around;margin-top:10px;padding:10px;background:#fff;border:1px solid #c7d2fe;border-radius:10px">
          <span style="font-size:13px"><b>${en?'Score':'점수'}:</b> <span style="color:#16a34a;font-size:18px;font-weight:800">${r.score!=null?r.score:'-'}</span></span>
        </div>
      `;
    } catch(e){ out.innerHTML = `<div style="color:#dc2626;padding:14px">❌ ${esc(e.message)}</div>`; }
  };

  function blobToBase64(blob){
    return new Promise(function(resolve, reject){
      const fr = new FileReader();
      fr.onload = function(){ resolve(String(fr.result).split(',')[1] || ''); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  function vdRenderCalendar(){
    const en = isEn();
    const body = document.getElementById('vd-body'); if (!body) return;
    const d = new Date();
    const monthStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
    body.innerHTML = `
      <div style="background:#fff;border:1px solid #c7d2fe;border-radius:12px;padding:12px;margin-bottom:10px;display:flex;gap:8px;align-items:center">
        <span style="font-size:13px;color:#475569;font-weight:600">${en?'Month':'조회 월'}:</span>
        <input id="vd-cal-month" type="month" value="${monthStr}">
        <button class="vd-btn" style="padding:6px 12px;font-size:12px" onclick="vdLoadCalendar()">${en?'🔍 Load':'🔍 조회'}</button>
      </div>
      <div id="vd-cal-list" style="display:grid;gap:6px"></div>
    `;
    vdLoadCalendar();
  }

  window.vdLoadCalendar = async function(){
    const en = isEn();
    const list = document.getElementById('vd-cal-list'); if (!list) return;
    const month = (document.getElementById('vd-cal-month')||{}).value || '';
    list.innerHTML = `<div style="color:#475569;padding:14px;text-align:center">⏳ ${en?'Loading…':'불러오는 중…'}</div>`;
    try {
      const qs = new URLSearchParams({ user_id: uid() });
      if (month) qs.set('month', month);
      try { const _t = localStorage.getItem('mango_token'); if (_t) qs.set('token', _t); } catch(e){}  // 🔐 본인 인증
      const r = await fetch('/api/diary/list?'+qs.toString()).then(x=>x.json()).catch(()=>({ok:false}));
      if (!r.ok) throw new Error(r.error || 'failed');
      const items = r.entries || r.list || [];
      if (!items.length) { list.innerHTML = `<div style="color:#94a3b8;padding:20px;text-align:center">📭 ${en?'No entries this month':'이 달 일기가 없습니다'}</div>`; return; }
      list.innerHTML = items.map(x => `
        <div style="background:#fff;border:1px solid #c7d2fe;border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center">
          <div>
            <span style="background:#14b8a6;color:#fff;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700">${esc((x.date||'').slice(5))}</span>
            <span style="margin-left:6px;color:#0f172a;font-size:12.5px"><b>${en?'Score':'점수'}:</b> <span style="color:#16a34a;font-weight:700">${x.score!=null?x.score:'-'}</span></span>
          </div>
          <span style="color:#475569;font-size:11px">${Math.round(x.duration_seconds||0)}s</span>
        </div>
      `).join('');
    } catch(e){ list.innerHTML = `<div style="color:#dc2626">❌ ${esc(e.message)}</div>`; }
  };
})();

