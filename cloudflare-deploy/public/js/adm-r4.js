// ═══════════════════════════════════════════════════════════════
// adm-r4.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function getVal(id) { const e = document.getElementById(id); return e ? (e.value||'').trim() : ''; }
  function _en(){ return window.adminLang === 'en'; }
  function T(ko, en){ return _en() ? en : ko; }
  // ⭐ 저장된 녹화본 목록 불러오기 → 드롭다운 채우기 (업로드 불필요)
  window.alrLoadRecordings = async function(){
    const uid = getVal('alr-uid');
    const sel = document.getElementById('alr-rec-select');
    if (!uid) { alert(_en()?'Enter student UID first.':'먼저 학생 UID 를 입력하세요.'); return; }
    sel.innerHTML = '<option value="">'+(_en()?'Loading…':'불러오는 중…')+'</option>';
    try {
      const r = await fetch('/api/student/recordings?uid='+encodeURIComponent(uid)+'&limit=30', { credentials:'include' });
      const d = await r.json();
      const rows = (d.rows || d.recordings || []);
      if (!rows.length) { sel.innerHTML = '<option value="">'+(_en()?'No recordings found for this student':'이 학생의 녹화본이 없습니다')+'</option>'; return; }
      sel.innerHTML = '<option value="">'+(_en()?'— Select a recording —':'— 녹화본 선택 —')+'</option>' +
        rows.map(function(x){
          var label = (x.date||'') + ' · ' + (x.topic||'') + (x.duration?(' · '+x.duration):'');
          return '<option value="'+esc(x.url||'')+'">'+esc(label)+'</option>';
        }).join('');
    } catch(e) {
      sel.innerHTML = '<option value="">'+(_en()?'Load failed':'불러오기 실패')+'</option>';
    }
  };
  // 🤖 AI 추천 — 집중도·끊김·참여율로 점수 매겨 최고의 수업 자동 선택
  window.alrAIPick = async function(){
    const uid = getVal('alr-uid');
    const sel = document.getElementById('alr-rec-select');
    const note = document.getElementById('alr-rec-note');
    if (!uid) { alert(_en()?'Enter student UID first.':'먼저 학생 UID 를 입력하세요.'); return; }
    sel.innerHTML = '<option>'+(_en()?'🤖 AI analyzing recordings…':'🤖 AI 분석 중…')+'</option>';
    if (note) note.textContent = '';
    try {
      const r = await fetch('/api/admin/student/best-recording?uid='+encodeURIComponent(uid), { credentials:'include' });
      const d = await r.json();
      if (!d.ok || !d.items || !d.items.length) {
        sel.innerHTML = '<option value="">'+(_en()?'No scored recordings':'점수 매길 녹화본이 없습니다')+'</option>';
        if (note) note.textContent = '';
        return;
      }
      sel.innerHTML = d.items.map(function(x, idx){
        var star = idx===0 ? '⭐ ' : '';
        var bits = [(_en()?'score ':'점수 ')+x.score];
        if (x.gaze!=null) bits.push((_en()?'focus ':'집중 ')+x.gaze);
        bits.push((_en()?'drops ':'끊김 ')+x.disconnect+(_en()?'':'회'));
        if (x.active_pct!=null) bits.push((_en()?'active ':'참여 ')+x.active_pct+'%');
        var label = star+(x.date||'')+' · '+bits.join(' · ');
        return '<option value="'+esc(x.recording_key||'')+'" data-kind="key"'+(idx===0?' selected':'')+'>'+esc(label)+'</option>';
      }).join('');
      var best = d.best;
      if (best) {
        var idInput=document.getElementById('alr-recording-id'); var urlInput=document.getElementById('alr-recording-url');
        if (idInput) idInput.value = best.recording_key || '';
        if (urlInput) urlInput.value = '';
      }
      if (note) note.textContent = (_en()?'🤖 AI picked the best lesson — ':'🤖 AI가 최고의 수업 선택 — ')+(d.reason||'');
    } catch(e) {
      sel.innerHTML = '<option value="">'+(_en()?'AI pick failed':'AI 추천 실패')+'</option>';
    }
  };
  // 녹화본 선택 → R2 키(data-kind=key)면 recording_id, blob URL이면 키 추출, http면 recording_url
  window.alrPickRecording = function(){
    const sel = document.getElementById('alr-rec-select');
    const opt = sel ? sel.options[sel.selectedIndex] : null;
    const val = sel ? sel.value : '';
    const idInput = document.getElementById('alr-recording-id');
    const urlInput = document.getElementById('alr-recording-url');
    if (idInput) idInput.value = '';
    if (urlInput) urlInput.value = '';
    if (!val) return;
    if (opt && opt.getAttribute('data-kind') === 'key') { if (idInput) idInput.value = val; return; }  // R2 키 직접
    const marker = '/api/recordings/blob/';
    const i = val.indexOf(marker);
    if (i >= 0) {
      if (idInput) idInput.value = decodeURIComponent(val.slice(i + marker.length));   // 정확한 R2 키
    } else if (/^https?:\/\//.test(val)) {
      if (urlInput) urlInput.value = val;
    } else {
      if (urlInput) urlInput.value = location.origin + val;
    }
  };
  /* ═══════════════════════════════════════════════════════════════════════════
     🎙 (2026-08-08) 긴 수업 녹음을 «브라우저에서 잘라» 전사한다

     왜 이렇게 됐나 — 예전 코드는 파일을 통째로 base64 로 만들어 JSON 한 방에 보냈다.
     라이브에 직접 넣어 재보니 그 길은 세 겹으로 막혀 있었다.
       ① base64 는 ×1.37 로 부푼다 → Cloudflare 요청 본문 상한 100MB 에 걸려
          약 73MB 넘는 파일은 워커가 돌기도 전에 «413 Payload Too Large» 를 **HTML** 로 받는다.
          그걸 r.json() 이 읽다 터져서 화면엔 늘 «네트워크 오류» 만 떴다 — 진짜 이유는 한 번도 안 보였다.
          (실측: body 120MB → 413 HTML. 45분 수업 파일이면 늘 여기에 걸린다)
       ② 그 아래를 통과해도 서버 STT 가드(25MB)에 걸린다. 45분 수업은 어느 쪽이든 못 지나간다.
       ③ 올린 게 수업 mp4(영상)면 Whisper 는 «Invalid audio input» 을 돌려준다.

     그래서 브라우저에서 끝낸다.
       디코드(영상이면 오디오 트랙만 뽑힌다) → 16kHz 모노 리샘플 → 60초 조각 →
       조각마다 /api/voice/transcribe (이미 라이브에서 도는 길) → 텍스트를 이어 붙여
       /api/eval/ai-lesson-report 에는 **글자만** 보낸다. 본문이 수십 KB 로 줄어
       100MB 벽도 25MB 벽도 애초에 만나지 않고, mp4 든 webm 이든 상관없어진다.

     🪤 조각 크기를 정할 때 **사인파로 재지 말 것** — 하루를 여기서 날렸다.
        220Hz 톤 WAV 로 재면 3.66MB 부터 «3006: Request is too large» 가 떠서
        «천장이 3MB» 로 보인다. 그런데 **같은 크기의 실제 말소리는 그대로 통과한다**
        (실측: 톤 9.16MB ❌ 3회 / 말소리 9.83MB ✅ 3회, 번갈아 재현).
        톤은 Whisper 가 «you you you…» 로 무한 반복하다 안에서 터지는 것이고,
        그 오류 문구가 크기 얘기처럼 생겼을 뿐이다. 진짜 한계는 훨씬 위다
        (실제 말소리 23.05MB·12.6분 → 200 OK).
     그래서 60초는 «벽» 때문이 아니라 **속도와 복구** 때문에 고른 값이다.
        · 3개씩 병렬이라 통짜보다 빠르다 — 실측 분당 1.7초 vs 통짜 2.8초
        · 조각 하나가 실패해도 그 60초만 잃는다 (45분 전체가 죽지 않는다)
        · 진행률을 조각 단위로 보여줄 수 있다
     ═══════════════════════════════════════════════════════════════════════════ */
  const ALR_CHUNK_SEC = 60;    // 조각 길이(초)
  const ALR_PARALLEL  = 3;     // 동시 전사 개수 (Workers AI 429 를 안 부르는 선)
  const ALR_MAX_MIN   = 120;   // 이보다 긴 녹음은 받지 않는다
  const ALR_CUT_SLACK = 1.2;   // 조각 경계를 이 초수 안에서 «가장 조용한 곳» 으로 옮긴다

  /* 응답을 «정직하게» 읽는다.
     예전엔 r.json() 하나뿐이라 413·502 처럼 HTML 이 오면 전부 «네트워크 오류» 로 뭉개졌다.
     본문을 글자로 먼저 받고, 그 다음에 JSON 을 시도한다. 실패하면 원문 앞머리를 남긴다. */
  async function readJson(r){
    const text = await r.text().catch(function(){ return ''; });
    try { return { status:r.status, data: JSON.parse(text) }; }
    catch(_) {
      return { status:r.status, data:null,
               raw: text.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,180) };
    }
  }

  function alrCtx(rate){
    const C = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!C) return null;
    try { return new C(1, 1, rate); } catch(_) { return null; }
  }
  // 여러 채널을 하나로 (강사·학생이 좌우로 갈려 있어도 둘 다 살아 있어야 한다)
  function alrMixdown(ab){
    const n = ab.length, ch = ab.numberOfChannels;
    if (ch === 1) return ab.getChannelData(0);
    const out = new Float32Array(n);
    for (let c = 0; c < ch; c++){ const d = ab.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i]; }
    for (let i = 0; i < n; i++) out[i] /= ch;
    return out;
  }
  // 선형보간 리샘플 — 말소리 전사용으로 충분하다(음악 품질이 목적이 아니다)
  function alrResample(src, from, to){
    if (from === to) return src;
    const ratio = from / to, n = Math.floor(src.length / ratio), out = new Float32Array(n);
    for (let i = 0; i < n; i++){
      const p = i * ratio, i0 = Math.floor(p), i1 = Math.min(i0 + 1, src.length - 1), t = p - i0;
      out[i] = src[i0] * (1 - t) + src[i1] * t;
    }
    return out;
  }
  // 무엇이든 브라우저 디코더에 맡긴다 → mp4·webm·m4a·mp3·wav 전부 여기서 소리만 남는다
  async function alrDecodeMono16k(buf){
    let ctx = alrCtx(16000) || alrCtx(48000);
    if (!ctx) throw new Error('Web Audio unsupported');
    const decoded = await new Promise(function(res, rej){
      const p = ctx.decodeAudioData(buf, res, rej);   // 구형 Safari 는 콜백형만 지원
      if (p && p.then) p.then(res, rej);
    });
    const mono = alrMixdown(decoded);
    return alrResample(mono, decoded.sampleRate, 16000);
  }
  // 16bit PCM WAV 한 조각
  function alrWav(pcm, from, to, rate){
    const n = to - from, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const put = function(o, s){ for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    put(0,'RIFF'); v.setUint32(4, 36 + n * 2, true); put(8,'WAVEfmt ');
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,rate,true); v.setUint32(28,rate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
    put(36,'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++){
      let s = pcm[from + i]; s = s < -1 ? -1 : (s > 1 ? 1 : s);
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buf], { type:'audio/wav' });
  }
  // 조각 하나 전사. 한 번은 다시 시도하고, 그래도 안 되면 그 조각만 버린다
  // (45분 수업에서 조각 하나 때문에 전체가 죽으면 안 된다)
  async function alrSttChunk(blob, lang){
    let why = 'unknown';
    for (let attempt = 0; attempt < 2; attempt++){
      try {
        const r = await fetch('/api/voice/transcribe?lang=' + encodeURIComponent(lang),
          { method:'POST', headers:{'Content-Type':'audio/wav'}, body: blob, credentials:'include' });
        const j = await readJson(r);
        if (j.data && j.data.ok) return { text: String(j.data.text || '').trim() };
        why = (j.data && (j.data.error || j.data.message)) || j.raw || ('HTTP ' + j.status);
      } catch(e) { why = (e && e.message) || 'network'; }
    }
    return { err: why };
  }
  /* 정확히 60.000초에서 자르면 하필 낱말 가운데를 지나가 그 낱말이 양쪽에서 다 사라진다.
     경계 앞뒤 ALR_CUT_SLACK 초 안에서 «가장 조용한 20ms» 를 찾아 거기서 자른다 —
     말 사이 숨 쉬는 자리로 옮겨 붙는다. 조각 길이는 60초 ±1.2초로만 흔들린다. */
  function alrQuietCut(pcm, target){
    const slack = Math.floor(16000 * ALR_CUT_SLACK), win = 320;   // 20ms
    const lo = Math.max(0, target - slack), hi = Math.min(pcm.length - win, target + slack);
    if (hi <= lo) return target;
    let best = target, bestE = Infinity;
    for (let p = lo; p <= hi; p += 80) {                          // 5ms 씩 훑는다
      let e = 0;
      for (let i = p; i < p + win; i++) e += pcm[i] * pcm[i];
      if (e < bestE) { bestE = e; best = p; }
    }
    return best;
  }
  async function alrTranscribeAll(pcm, lang, onTick){
    const per = 16000 * ALR_CHUNK_SEC;
    const total = Math.max(1, Math.ceil(pcm.length / per));
    // 경계를 미리 다 정해 둔다(조각들이 병렬로 돌기 때문에 그때그때 계산하면 겹친다)
    const edge = [0];
    for (let i = 1; i < total; i++) edge.push(alrQuietCut(pcm, i * per));
    edge.push(pcm.length);
    const parts = new Array(total).fill('');
    const fails = [];
    let done = 0, next = 0, lastErr = '';
    async function worker(){
      for (;;){
        const i = next++; if (i >= total) return;
        const res = await alrSttChunk(alrWav(pcm, edge[i], edge[i + 1], 16000), lang);
        if (res.err) { fails.push(i + 1); lastErr = res.err; } else { parts[i] = res.text; }
        onTick(++done, total, fails.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(ALR_PARALLEL, total) }, worker));
    return { text: parts.filter(Boolean).join(' ').replace(/\s+/g,' ').trim(), total: total, fails: fails, lastErr: lastErr };
  }

  window.alrGenerate = async function(){
    const uid = getVal('alr-uid');
    if (!uid) { alert(T('학생 UID 를 입력해주세요','Enter the student UID.')); return; }
    const btn = document.getElementById('alr-go-btn');
    const out = document.getElementById('alr-result');
    const doneLabel = T('🚀 AI 리포트 자동 생성','🚀 Generate AI Report');
    btn.disabled = true;

    const step = function(msg, sub){
      out.innerHTML = '<div style="padding:18px;text-align:center;color:#a3b3d1">'
        + '<div style="font-size:34px;animation:alr-spin 1.2s linear infinite;display:inline-block">🎙</div>'
        + '<div style="margin-top:8px;font-weight:800;color:#e6ecff;font-size:14px">' + esc(msg) + '</div>'
        + (sub ? '<div style="margin-top:5px;font-size:12px">' + esc(sub) + '</div>' : '')
        + '</div><style>@keyframes alr-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}</style>';
    };
    const fail = function(title, detail){
      out.innerHTML = '<div style="padding:14px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:10px;color:#fca5a5">⚠ '
        + esc(title) + (detail ? '<br><span style="font-size:12px;color:#fde68a">' + esc(detail) + '</span>' : '') + '</div>';
    };

    const payload = {
      student_uid: uid,
      student_name: getVal('alr-name'),
      teacher_name: getVal('alr-teacher'),
      lesson_title: getVal('alr-title'),
      recording_id: getVal('alr-recording-id') || undefined,
      recording_url: getVal('alr-recording-url') || undefined,
      auto_save: true,
    };

    try {
      let transcript = getVal('alr-transcript');
      let audioSeconds = 0, chunkInfo = '';

      if (!transcript) {
        // ── 1) 소스 확보: 업로드 파일 > R2 녹음ID > 외부 URL ──
        const fileEl = document.getElementById('alr-audio-file');
        const file = fileEl && fileEl.files ? fileEl.files[0] : null;
        const recId = getVal('alr-recording-id'), recUrl = getVal('alr-recording-url');
        let srcBuf = null, srcLabel = '';
        if (file) {
          btn.innerHTML = T('⏳ 파일 읽는 중…','⏳ Reading file…');
          step(T('녹음 파일 읽는 중…','Reading the recording…'), file.name);
          srcBuf = await file.arrayBuffer(); srcLabel = file.name;
        } else if (recId || recUrl) {
          const u = recId ? ('/api/recordings/blob/' + encodeURIComponent(recId)) : recUrl;
          btn.innerHTML = T('⏳ 녹화본 받는 중…','⏳ Fetching recording…');
          step(T('저장된 녹화본 받는 중…','Fetching the saved recording…'), recId || recUrl);
          let rr;
          try { rr = await fetch(u, { credentials:'include' }); }
          catch(e){ fail(T('녹화본을 받지 못했습니다.','Could not fetch the recording.'), (e && e.message) || 'network'); return; }
          if (!rr.ok) { fail(T('녹화본을 받지 못했습니다.','Could not fetch the recording.'), 'HTTP ' + rr.status + ' · ' + (recId || recUrl)); return; }
          srcBuf = await rr.arrayBuffer(); srcLabel = recId || recUrl;
        } else {
          fail(T('녹음을 넣어주세요.','Add a recording first.'),
               T('[🤖 AI 추천] · [🔄 녹화본 직접 선택] · R2 녹음ID · 외부 URL · 파일 · STT 붙여넣기 중 하나가 필요합니다.',
                 'Use AI Pick / Browse recordings, or provide an R2 ID, URL, file, or pasted transcript.'));
          return;
        }

        // ── 2) 소리만 뽑아 16kHz 모노로 ── (영상 mp4 도 여기서 오디오 트랙만 남는다)
        btn.innerHTML = T('⏳ 소리 추출 중…','⏳ Extracting audio…');
        step(T('소리 추출 중…','Extracting audio…'), T('영상이면 오디오 트랙만 뽑아냅니다','Video files: the audio track is pulled out'));
        let pcm;
        try { pcm = await alrDecodeMono16k(srcBuf); }
        catch(e){
          fail(T('이 파일에서 소리를 읽지 못했습니다.','Could not read audio from this file.'),
               (srcLabel ? srcLabel + ' · ' : '') + T('브라우저가 열 수 없는 형식이거나 오디오 트랙이 없습니다.','Unsupported container, or no audio track.')
               + ' (' + ((e && e.message) || 'decode failed') + ')');
          return;
        }
        srcBuf = null;   // 원본 버퍼는 여기서 놓아준다 (45분짜리면 수백 MB 다)
        audioSeconds = Math.round(pcm.length / 16000);
        if (audioSeconds < 3) { fail(T('녹음이 너무 짧습니다.','Recording is too short.'), audioSeconds + T('초','s')); return; }
        if (audioSeconds > ALR_MAX_MIN * 60) {
          fail(T('녹음이 너무 깁니다.','Recording is too long.'),
               Math.round(audioSeconds / 60) + T('분 · 최대 ','min · max ') + ALR_MAX_MIN + T('분','min'));
          return;
        }

        // ── 3) 60초 조각으로 잘라 전사 ──
        const langEl = document.getElementById('alr-lang');
        const lang = (langEl && langEl.value) || 'en';
        const mmss = Math.floor(audioSeconds / 60) + T('분 ','m ') + (audioSeconds % 60) + T('초','s');
        const res = await alrTranscribeAll(pcm, lang, function(d, t, f){
          btn.innerHTML = T('⏳ 전사 ','⏳ Transcribing ') + d + '/' + t;
          step(T('전사 중 ','Transcribing ') + d + ' / ' + t + T(' 조각 (',' chunks (') + Math.round(d / t * 100) + '%)',
               mmss + (f ? T(' · 실패 ',' · failed ') + f : ''));
        });
        chunkInfo = res.total + T('조각 · ','ch · ') + mmss + (res.fails.length ? T(' · 실패 ',' · failed ') + res.fails.length : '');
        if (!res.text) {
          fail(T('전사 결과가 비었습니다.','The transcript came back empty.'),
               T('조각 ','chunks ') + res.total + T('개 전부 실패 · ',' all failed · ') + (res.lastErr || ''));
          return;
        }
        transcript = res.text;
      }

      // ── 4) 글자만 서버로 (본문 수십 KB — 100MB·3MB 벽과 무관해진다) ──
      btn.innerHTML = T('⏳ AI 분석 중…','⏳ AI analyzing…');
      step(T('AI 분석 중…','AI is analyzing…'), T('Llama 3.3 70B 가 리포트를 씁니다','Llama 3.3 70B is writing the report'));
      payload.transcript = transcript;
      if (audioSeconds) payload.speaking_seconds = audioSeconds;

      const r = await fetch('/api/eval/ai-lesson-report', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify(payload) });
      const j = await readJson(r);
      if (!j.data) {
        // 여기가 예전에 «네트워크 오류» 로 뭉개지던 자리다. 이제 HTTP 상태와 원문을 그대로 보여준다.
        fail(T('서버가 JSON 이 아닌 응답을 보냈습니다','Server replied with non-JSON') + ' (HTTP ' + j.status + ')', j.raw || '');
        return;
      }
      const d = j.data;
      if (!d.ok) {
        fail(T('분석 실패: ','Analysis failed: ') + (d.error || 'unknown'), d.message || d.detail || '');
        return;
      }
      // 결과 렌더
      const errs = (d.grammar_errors || []).map(e =>
        `<div style="padding:10px 14px;background:rgba(239,68,68,0.10);border-left:3px solid #ef4444;border-radius:6px;margin-bottom:6px"><div style="font-size:12px"><span style="text-decoration:line-through;color:#fca5a5">${esc(e.original||'')}</span> → <b style="color:#86efac">${esc(e.corrected||'')}</b></div><div style="font-size:11.5px;color:#a3b3d1;margin-top:3px">💡 ${esc(e.reason||'')}</div></div>`
      ).join('');
      const alts = (d.alternatives || []).map(a =>
        `<div style="padding:10px 14px;background:rgba(59,130,246,0.10);border-left:3px solid #3b82f6;border-radius:6px;margin-bottom:6px"><div style="font-size:12px"><span style="color:#93c5fd">${esc(a.learned||'')}</span> → <b style="color:#c4b5fd">${esc(a.better||'')}</b></div><div style="font-size:11.5px;color:#a3b3d1;margin-top:3px">💬 ${esc(a.when_to_use||'')}</div></div>`
      ).join('');
      const words = (d.word_freq || []).map(w => `<span style="display:inline-block;padding:3px 10px;background:rgba(251,191,36,0.15);color:#fde68a;border-radius:99px;font-size:11.5px;margin:2px">${esc(w.word||'')} (${w.count||0})</span>`).join('');
      const sc = d.overall_score || 0;
      const color = sc>=85?'#10b981':sc>=70?'#f59e0b':'#ef4444';

      out.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(139,92,246,0.10),rgba(99,102,241,0.06));border:1px solid rgba(139,92,246,0.30);border-radius:14px;padding:18px">
          <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;flex-wrap:wrap">
            <div style="width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#fff;background:${color};box-shadow:0 6px 18px ${color}66">${sc}</div>
            <div style="flex:1;min-width:200px">
              <div style="font-size:11px;color:#a3b3d1;font-weight:700">종합 점수 (0~100)</div>
              <div style="font-size:15px;color:#fff;font-weight:800;margin-top:3px">${esc(d.summary_ko || '')}</div>
              <div style="font-size:11.5px;color:#94a3b8;margin-top:4px">📝 ${d.total_words || 0} 단어 · ⏱ ${d.speaking_seconds || 0}초 발화${chunkInfo ? ' · 🎧 ' + esc(chunkInfo) : ''}</div>
            </div>
            <button onclick="alrViewFull(${d.report_id})" style="padding:8px 14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);color:#e6ecff;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px">📖 전체 STT 보기</button>
          </div>
          ${errs ? '<div style="font-size:12.5px;font-weight:800;color:#fca5a5;margin:14px 0 8px 0">⚠️ 문법 교정 (' + (d.grammar_errors||[]).length + '건)</div>' + errs : ''}
          ${alts ? '<div style="font-size:12.5px;font-weight:800;color:#93c5fd;margin:14px 0 8px 0">💡 더 자연스러운 표현 (' + (d.alternatives||[]).length + '건)</div>' + alts : ''}
          ${words ? '<div style="font-size:12.5px;font-weight:800;color:#fcd34d;margin:14px 0 8px 0">🔥 다빈도 단어</div><div>' + words + '</div>' : ''}
          ${(d.strengths||[]).length ? '<div style="font-size:12.5px;font-weight:800;color:#86efac;margin:14px 0 6px 0">✨ 강점</div><ul style="margin:0 0 8px 18px;color:#d1fae5;font-size:12.5px;line-height:1.7">' + (d.strengths||[]).map(s => '<li>' + esc(s) + '</li>').join('') + '</ul>' : ''}
          ${(d.weaknesses||[]).length ? '<div style="font-size:12.5px;font-weight:800;color:#fcd34d;margin:14px 0 6px 0">📌 보완할 점</div><ul style="margin:0 0 8px 18px;color:#fde68a;font-size:12.5px;line-height:1.7">' + (d.weaknesses||[]).map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : ''}
          ${(d.next_goals||[]).length ? '<div style="font-size:12.5px;font-weight:800;color:#fbbf24;margin:14px 0 6px 0">🎯 다음 목표</div><ul style="margin:0 0 8px 18px;color:#fef3c7;font-size:12.5px;line-height:1.7">' + (d.next_goals||[]).map(g => '<li>' + esc(g) + '</li>').join('') + '</ul>' : ''}
          <div style="margin-top:14px;padding:10px 12px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.30);border-radius:8px;font-size:12.5px;color:#86efac">
            ✅ 평가서 자동 저장됨 (평가서 ID: ${d.evaluation_id || '-'}, 리포트 ID: ${d.report_id || '-'})<br>
            <span style="font-size:11.5px;color:#cbd5e1">→ "📝 학생 평가서" 카드에서 검토·발송하거나, "📄 월별 보고서" 에 자동 반영됩니다.</span>
          </div>
        </div>`;
    } catch(e){
      // ⚠️ 여기서도 «네트워크 오류» 네 글자로 끝내지 말 것 — 08-08 에 그것 때문에
      //    413(파일 과대)을 «망가진 기능» 으로 오진하고 하루를 썼다. 던진 말을 그대로 남긴다.
      console.error('[alrGenerate]', e);
      fail(T('처리 중 오류가 났습니다.','Something failed while processing.'), (e && e.message) || String(e));
    }
    finally { btn.disabled = false; btn.innerHTML = doneLabel; }
  };

  window.alrViewFull = async function(id){
    try {
      const r = await fetch('/api/eval/ai-lesson-report/' + id);
      const d = await r.json();
      if (!d.ok) { alert('전체 보기 실패: ' + (d.error||'')); return; }
      const w = window.open('', '_blank', 'width=900,height=700');
      if (!w) { alert('팝업이 차단되어 리포트를 열 수 없습니다. 브라우저 팝업 차단을 해제한 뒤 다시 시도해 주세요.'); return; }
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>AI 학습 리포트 #' + id + '</title></head><body style="font-family:MangoiHanSC,-apple-system,sans-serif;padding:24px;background:#0a1530;color:#e6ecff;line-height:1.7"><h1>🎙 AI 학습 리포트 #' + id + '</h1><h2>📝 전체 STT (' + (d.item.total_words||0) + ' 단어)</h2><pre style="white-space:pre-wrap;background:#14213b;padding:14px;border-radius:10px;color:#cbd5e1">' + (d.item.transcript || '').replace(/[<>]/g,'') + '</pre></body></html>');
      } catch(e) { console.error('alrViewFull broken:', e); }
    };
})();
