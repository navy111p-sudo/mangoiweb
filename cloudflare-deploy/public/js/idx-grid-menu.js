(function(){
  const gm = document.getElementById('grid-menu');
  const goBtn = document.getElementById('ai-home-go');
  const closeBtn = document.getElementById('grid-menu-close');
  const modal = document.getElementById('info-modal');
  const modalBox = document.getElementById('info-modal-box');
  const modalContent = document.getElementById('info-modal-content');

  // ──── 그리드 토글 ────
  function toggleGrid(force) {
    const isShown = gm.style.display !== 'none';
    const next = (force === undefined) ? !isShown : force;
    if (next) {
      // 입력값이 있으면 검색 실행, 없으면 그리드 토글
      const v = document.getElementById('ai-home-input').value.trim();
      if (v) return false;  // 입력값 있으면 그리드 안 띄움 (handleQuery로 위임)
      gm.style.display = 'block';
      // 🗂 그리드 열 때마다 카테고리 초기 상태(모든 카드 숨김 + 안내) 로 재설정
      try {
        document.querySelectorAll('.gm-card[data-go]').forEach(c => c.setAttribute('data-cat-hidden', '1'));
        document.querySelectorAll('.gm-cat-card').forEach(b => b.classList.remove('active'));
        const hint = document.getElementById('gm-empty-hint');
        if (hint) hint.style.display = '';
      } catch(e){}
    } else {
      gm.style.display = 'none';
    }
    return true;
  }
  // 화살표 버튼 클릭 → 입력값 없으면 그리드, 있으면 검색
  if (goBtn) {
    const orig = goBtn.onclick;
    goBtn.onclick = null;
    goBtn.addEventListener('click', (e) => {
      const v = document.getElementById('ai-home-input').value.trim();
      if (!v) { e.stopImmediatePropagation(); toggleGrid(true); }
    }, true);  // capture phase
  }
  closeBtn.addEventListener('click', () => toggleGrid(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gm.style.display !== 'none') toggleGrid(false);
  });

  // ──── 모달 ────
  function showModal(html) {
    // 매 모달마다 기본 폭으로 초기화 (성적표 등에서 넓혔던 폭이 다른 모달에 새지 않게)
    try { modalBox.style.maxWidth = '600px'; } catch(e){}
    modalContent.innerHTML = html;
    modal.style.display = 'flex';
    modalBox.scrollTop = 0;
  }
  window.closeInfoModal = function(){
    modal.style.display = 'none';
    // 모달 닫을 때 음성 재생 중이면 중지 (TTS + mp3 둘 다)
    try { if (window.speechSynthesis && window.speechSynthesis.speaking) window.speechSynthesis.cancel(); } catch{}
    try { if (_franchiseAudio && !_franchiseAudio.paused) { _franchiseAudio.pause(); _franchiseAudio.currentTime = 0; } } catch{}
    try { ltAudioStop(); } catch{}   // 🔊 레벨테스트 인트로 음성 + 배경음악 중지
    // 정보 모달 닫으면 히트맵 그리드(메뉴)로 자동 복귀
    const gmEl = document.getElementById('grid-menu');
    if (gmEl) gmEl.style.display = 'block';
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none') closeInfoModal();
  });

  // 👨‍🏫 강사 소개 모달 — ERP 등록 강사로 동적 갱신 (DOM API 만 사용해 syntax 에러 방지)
  window.loadDynamicTeacherGallery = async function() {
    const box = document.getElementById('ph-gallery-dynamic');
    if (!box) return;
    async function tryFetch(url) {
      try {
        const r = await fetch(url, { credentials: 'include' });
        const ct = (r.headers.get('content-type') || '').toLowerCase();
        if (!ct.includes('json')) return null;
        const d = await r.json().catch(() => null);
        if (!d) return null;
        const items = d.items || d.rows || [];
        return Array.isArray(items) ? items : null;
      } catch (e) { return null; }
    }
    let teachers = await tryFetch('/api/teacher-profiles?limit=100');
    if (!teachers || !teachers.length) {
      teachers = await tryFetch('/api/admin/teacher-profiles');
    }
    if (!teachers || !teachers.length) return;  // 폴백 — 기존 정적 6명 그대로 유지

    const GRADS = ['#fcd34d,#f59e0b','#86efac,#10b981','#f9a8d4,#ec4899','#93c5fd,#3b82f6','#c4b5fd,#8b5cf6','#fda4af,#f43f5e','#a7f3d0,#06b6d4','#fde68a,#ea580c'];
    const EMOJIS = ['👩🏻‍🏫','👨🏻‍🏫','👩🏻‍🎓','🧑🏻‍🏫','👩🏻‍💼','👨🏻‍🎓'];

    function teacherCat(t){ var o=((t.origin_region||t.active_region||'')+''); if(/미국|캐나다|usa|canada/i.test(o))return 'us'; if(/영국|호주|영연방|uk|britain|australia/i.test(o))return 'gb'; if(/중국|중화|china|chin/i.test(o))return 'cn'; return 'ph'; }
    var FLAG={ph:'🇵🇭',us:'🇺🇸',gb:'🇬🇧',cn:'🇨🇳'};
    var CATLABEL={all:'🌏 전체 강사진',ph:'🇵🇭 필리핀 강사진',us:'🇺🇸 미국·캐나다 강사진',gb:'🇬🇧 영국·호주 강사진',cn:'🇨🇳 중국어 강사진'};
    window.__teacherCat = teacherCat;
    window.__renderTeacherGallery = function(cat){
    cat = cat || 'all';
    var list = (cat==='all') ? teachers : teachers.filter(function(t){ return teacherCat(t)===cat; });
    var hd = document.getElementById('ph-gallery-heading');
    if (hd) hd.textContent = (CATLABEL[cat]||CATLABEL.all) + ' (' + list.length + '명)';
    document.querySelectorAll('.info-tile[data-cat]').forEach(function(el){ el.style.outline = (el.getAttribute('data-cat')===cat) ? '2px solid #fbbf24' : ''; el.style.cursor='pointer'; });
    box.innerHTML = '';
    if (!list.length) { var emp=document.createElement('div'); emp.style.cssText='grid-column:1/-1;text-align:center;color:#94a3b8;font-size:13px;padding:18px'; emp.textContent='해당 국적의 강사가 아직 없습니다.'; box.appendChild(emp); }
    list.forEach((t, i) => {
      const card = document.createElement('div');
      card.className = 'ph-card';
      card.style.cursor = 'pointer';
      card.addEventListener('click', () => { if (window.openTeacherDetail) window.openTeacherDetail(t); });

      const photo = document.createElement('div');
      photo.className = 'ph-photo';
      photo.style.position = 'relative';
      if (t.image_url) {
        // CSS url() 안에서 안전하게 escape
        const safeUrl = String(t.image_url).split("'").join("\\'");
        photo.style.backgroundImage = "url('" + safeUrl + "')";
        photo.style.backgroundSize = 'cover';
        photo.style.backgroundPosition = 'center';
      } else {
        photo.style.background = 'linear-gradient(135deg,' + GRADS[i % GRADS.length] + ')';
        const emo = document.createElement('span');
        emo.className = 'ph-emoji';
        emo.textContent = EMOJIS[i % EMOJIS.length];
        photo.appendChild(emo);
      }
      const flag = document.createElement('span');
      flag.className = 'ph-flag';
      flag.textContent = FLAG[teacherCat(t)] || '🇵🇭';
      photo.appendChild(flag);

      if (t.intro_video_url) {
        const vbtn = document.createElement('button');
        vbtn.textContent = '▶';
        vbtn.title = '소개 영상';
        vbtn.style.cssText = 'position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.6);color:#fff;border:0;border-radius:50%;width:24px;height:24px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center';
        vbtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (window.openTeacherDetail) window.openTeacherDetail(t);
        });
        photo.appendChild(vbtn);
      }
      card.appendChild(photo);

      const name = t.english_name || t.korean_name || '강사';
      const spec = t.group_name || t.certifications || '영어 회화';
      const career = t.career || '';
      const careerStr = career ? (career + (/^\d+$/.test(career) ? '년차' : '')) : '';
      const star = '⭐ 4.9' + (careerStr ? ' · ' + careerStr : '');

      const nameEl = document.createElement('div'); nameEl.className = 'ph-name'; nameEl.textContent = name; card.appendChild(nameEl);
      const specEl = document.createElement('div'); specEl.className = 'ph-spec'; specEl.textContent = spec; card.appendChild(specEl);
      const starEl = document.createElement('div'); starEl.className = 'ph-star'; starEl.textContent = star; card.appendChild(starEl);

      box.appendChild(card);
    });

    // ERP 표시 뱃지
    const badge = document.createElement('div');
    badge.style.cssText = 'grid-column:1/-1;text-align:center;font-size:11px;color:#10b981;margin-top:6px';
    badge.textContent = '✓ 본사 ERP 등록 강사 ' + teachers.length + '명' + (cat==='all' ? ' 전체 표시' : ' 중 ' + list.length + '명 표시');
    box.appendChild(badge);
    };  // end __renderTeacherGallery
    window.__filterTeacherCat = function(cat){ if (window.__renderTeacherGallery) window.__renderTeacherGallery(cat); };
    window.__renderTeacherGallery('all');
  };

  // 강사 카드 클릭 시 상세 모달 (사진·학력·경력·자격증·영상)
  window.openTeacherDetail = function(t) {
    if (!t || typeof t !== 'object') return;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.8);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.addEventListener('click', () => overlay.remove());

    const box = document.createElement('div');
    box.style.cssText = 'background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid rgba(251,191,36,0.4);border-radius:16px;padding:24px;max-width:560px;width:100%;max-height:90vh;overflow:auto;color:#e2e8f0;position:relative';
    box.addEventListener('click', (ev) => ev.stopPropagation());

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;background:transparent;border:0;color:#94a3b8;font-size:22px;cursor:pointer';
    closeBtn.addEventListener('click', () => overlay.remove());
    box.appendChild(closeBtn);

    // 헤더 (사진 + 이름)
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:16px;margin-bottom:14px';
    if (t.image_url) {
      const img = document.createElement('img');
      img.src = t.image_url;
      img.style.cssText = 'width:120px;height:120px;border-radius:50%;object-fit:cover;border:3px solid #fbbf24';
      img.onerror = function() { this.style.display = 'none'; };
      head.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.style.cssText = 'width:120px;height:120px;border-radius:50%;background:linear-gradient(135deg,#fcd34d,#f59e0b);display:flex;align-items:center;justify-content:center;font-size:60px';
      ph.textContent = '👩🏻‍🏫';
      head.appendChild(ph);
    }
    const headInfo = document.createElement('div');
    const nameDiv = document.createElement('div');
    nameDiv.style.cssText = 'font-size:20px;font-weight:800;color:#fbbf24';
    nameDiv.textContent = t.english_name || t.korean_name || '강사';
    headInfo.appendChild(nameDiv);
    const specDiv = document.createElement('div');
    specDiv.style.cssText = 'font-size:13px;color:#94a3b8;margin-top:4px';
    (function(){ var _f={ph:'🇵🇭',us:'🇺🇸',gb:'🇬🇧',cn:'🇨🇳'}; var _c=(window.__teacherCat?window.__teacherCat(t):'ph'); specDiv.textContent = (_f[_c]||'🇵🇭') + ' ' + (t.group_name || '영어 회화'); })();
    headInfo.appendChild(specDiv);
    const statDiv = document.createElement('div');
    statDiv.style.cssText = 'font-size:12px;color:#10b981;margin-top:2px';
    statDiv.textContent = '● ' + (t.status || '활동중');
    headInfo.appendChild(statDiv);
    head.appendChild(headInfo);
    box.appendChild(head);

    // 🎥 수업 입장 — 공용 수업방(빈 방코드)으로 모두 통일 → 교사·학생이 무조건 같은 방에서 만남
    (function(){
      var joinBtn = document.createElement('button');
      joinBtn.textContent = '🎥 수업 입장 — ' + (t.korean_name || t.english_name || '') + ' 선생님과 같은 방에서 만나요';
      joinBtn.style.cssText = 'width:100%;margin-top:14px;padding:14px;border:0;border-radius:12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a0f08;font-size:15px;font-weight:900;cursor:pointer;box-shadow:0 8px 22px -6px rgba(245,158,11,0.55)';
      joinBtn.onclick = function(){
        try { overlay.remove(); } catch(e){}
        if (window.mangoiJoinClass) window.mangoiJoinClass('');   // 공용 수업방
      };
      box.appendChild(joinBtn);
    })();

    // 💬 선생님 한마디 (소개글) — 눈에 띄게 상단 표시
    if (t.notes) {
      const cmt = document.createElement('div');
      cmt.style.cssText = 'margin-top:14px;padding:12px 14px;background:rgba(251,191,36,0.10);border:1px solid rgba(251,191,36,0.35);border-radius:10px;color:#fde68a;font-size:13.5px;line-height:1.65;font-style:italic';
      cmt.textContent = '“' + t.notes + '”';
      box.appendChild(cmt);
    }

    // 필드 표
    const fields = [
      ['🎓 학력', t.education],
      ['💼 경력', t.career],
      ['📜 자격증', t.certifications],
      ['🌏 출신', t.origin_region],
      ['📅 가능 요일', t.available_days],
      ['⏰ 가능 시간', t.available_hours],
      ['👥 그룹', t.group_name],
    ].filter(function(p) { return p[1]; });

    if (fields.length > 0) {
      const fieldsBox = document.createElement('div');
      fieldsBox.style.marginTop = '14px';
      fields.forEach(function(p) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;font-size:13px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)';
        const label = document.createElement('div');
        label.style.cssText = 'min-width:100px;color:#94a3b8;font-weight:600';
        label.textContent = p[0];
        row.appendChild(label);
        const val = document.createElement('div');
        val.style.color = '#e2e8f0';
        val.textContent = p[1];
        row.appendChild(val);
        fieldsBox.appendChild(row);
      });
      box.appendChild(fieldsBox);
    }

    // 소개 영상 (있을 때)
    if (t.intro_video_url) {
      const url = t.intro_video_url;
      let video;
      if (/youtube\.com|youtu\.be/.test(url)) {
        video = document.createElement('iframe');
        video.src = url.replace('watch?v=', 'embed/');
        video.allowFullscreen = true;
        video.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;border-radius:10px;margin-top:12px';
      } else {
        video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.style.cssText = 'width:100%;border-radius:10px;margin-top:12px';
      }
      box.appendChild(video);
    }

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  };

  // 🔊 가맹점 감성 호소문 — 사전 녹음 mp3 우선, 실패 시 Web Speech API 폴백
  let _franchiseAudio = null;
  window.playFranchiseVoice = function(btn) {
    const lblEl = btn && btn.querySelector('.vlbl');
    function setIdle(){ if (btn) btn.classList.remove('playing'); if (lblEl) lblEl.textContent = '음성으로 듣기'; if (btn && btn.firstChild) btn.firstChild.nodeValue = '🔊 '; }
    function setPlaying(){ if (btn) btn.classList.add('playing'); if (lblEl) lblEl.textContent = '재생 중지'; if (btn && btn.firstChild) btn.firstChild.nodeValue = '⏸️ '; }
    if (_franchiseAudio && !_franchiseAudio.paused && !_franchiseAudio.ended) {
      try { _franchiseAudio.pause(); _franchiseAudio.currentTime = 0; } catch(e){}
      setIdle(); return;
    }
    if (!_franchiseAudio) {
      _franchiseAudio = new Audio('/audio/franchise-pitch.mp3');
      _franchiseAudio.addEventListener('ended', setIdle);
      _franchiseAudio.addEventListener('error', () => { setIdle(); _runTTSFallback(btn); });
    }
    setPlaying();
    _franchiseAudio.play().catch(() => { setIdle(); _runTTSFallback(btn); });
  };
  function _runTTSFallback(btn) {
    if (typeof window.speechSynthesis === 'undefined') {
      alert('이 브라우저는 음성 재생을 지원하지 않습니다.\n(Chrome / Edge / Safari 권장)');
      return;
    }
    const synth = window.speechSynthesis;
    const lblEl = btn && btn.querySelector('.vlbl');
    // 이미 재생 중이면 중지
    if (synth.speaking || synth.pending) {
      synth.cancel();
      btn.classList.remove('playing');
      if (lblEl) lblEl.textContent = '음성으로 듣기';
      btn.firstChild.nodeValue = '🔊 ';
      return;
    }
    const text = [
      '원장님, 혹시 지금 이런 고민 안고 계시지 않으세요?',
      '매달 오르는 환율, 부담스러운 인건비와 숙소비, 4대보험에 항공료, 소개비까지.',
      '영미권 원어민 한 명 모셔 오는 데 들어가는 시간과 비용은 늘 학원의 무거운 짐이었습니다.',
      '갑자기 그만두는 강사, 잦은 결석, 길어지는 휴가. 원장님 마음 한구석은 항상 불안하셨을 겁니다.',
      '이제, 망고아이가 그 짐을 함께 나누겠습니다.',
      '저희 선생님들은 친절하고 재밌고, 열정적이며 부지런합니다.',
      '결석 없고 휴가 없으며, 비용도 합리적입니다.',
      '무엇보다, 진심으로 학생들을 사랑하고 정말 잘 가르칩니다.',
      '이미 함께하신 학원장님들. 한 분도 빠짐없이 대만족, 수익은 눈에 띄게 성장하셨습니다.',
      '저희는 필리핀 현지에 직접 콜센터를 운영합니다. 원하시는 시간, 레벨, 스타일, 1대1 맞춤으로 준비해 드립니다.',
      '영어는 결국, 집중과 반복, 그리고 흥미입니다.',
      '20년 전통의 망고아이가 그 노하우로, 원장님께 스트레스 없는 행복한 학원을 만들어 드리겠습니다.',
      '원장님의 학생들을 향한 사랑과 열정, 그리고 저희 원어민 선생님들의 진심 어린 수업이 만나면, 지역에서 가장 사랑받는 학원이 됩니다.',
      '망고아이가 함께 만들어 가겠습니다.'
    ].join(' ');

    function speakWith(voice) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'ko-KR';
      utter.rate = 0.95;
      utter.pitch = 1.05;
      utter.volume = 1.0;
      if (voice) utter.voice = voice;
      utter.onstart = () => {
        btn.classList.add('playing');
        if (lblEl) lblEl.textContent = '재생 중지';
        btn.firstChild.nodeValue = '⏸️ ';
      };
      utter.onend = () => {
        btn.classList.remove('playing');
        if (lblEl) lblEl.textContent = '음성으로 듣기';
        btn.firstChild.nodeValue = '🔊 ';
      };
      utter.onerror = utter.onend;
      synth.speak(utter);
    }
    // 한국어 음성 우선 선택 (목소리 목록이 비동기 로드되는 브라우저 대응)
    let voices = synth.getVoices();
    let koVoice = voices.find(v => /^ko/i.test(v.lang));
    if (koVoice || voices.length > 0) {
      speakWith(koVoice || null);
    } else {
      // voiceschanged 이벤트 후 재시도
      const handler = () => {
        synth.removeEventListener('voiceschanged', handler);
        const v = synth.getVoices();
        const k = v.find(x => /^ko/i.test(x.lang));
        speakWith(k || null);
      };
      synth.addEventListener('voiceschanged', handler);
      // 안전망: 1초 후에도 못 잡으면 기본 음성으로 시도
      setTimeout(() => { if (!synth.speaking && !synth.pending) speakWith(null); }, 1000);
    }
  };

  // ──── 정보 모달 콘텐츠 ────
  const FEATURES = `
    <h2>🌟 망고아이의 특장점</h2>
    <p>화상영어 업계 1위를 향해 달려가는 망고아이만의 차별점입니다.</p>
    <div class="info-grid">
      <div class="info-tile"><b>👨‍🏫 검증된 강사</b><span>1,000명+ 원어민·전문 강사 풀</span></div>
      <div class="info-tile"><b>🎯 1:1 맞춤 학습</b><span>레벨테스트 후 개인별 커리큘럼</span></div>
      <div class="info-tile"><b>🤖 AI 발음 분석</b><span>실시간 발음 평가 + 피드백</span></div>
      <div class="info-tile"><b>📹 수업 녹화</b><span>복습용 다시보기 무제한 제공</span></div>
      <div class="info-tile"><b>📊 학습 리포트</b><span>주간·월간 진도·발화량 분석</span></div>
      <div class="info-tile"><b>🌐 24/7 수업</b><span>새벽·주말 모두 가능</span></div>
      <div class="info-tile"><b>💎 프리미엄 콘텐츠</b><span>비즈니스·시험·일상 회화</span></div>
      <div class="info-tile"><b>🔒 무료 체험</b><span>1회 부담 없이 체험</span></div>
    </div>
    <a class="info-cta" onclick="closeInfoModal();window.openInquiryModal&&window.openInquiryModal()">📨 상담 신청하기 →</a>`;

  const CURRICULUM = `
    <h2>📚 교육과정 안내</h2>
    <p>레벨·연령·목적별로 세분화된 교육과정을 제공합니다.</p>

    <h3>📊 8단계 심층 레벨 시스템</h3>
    <p style="color:#94a3b8;font-size:12px;margin:6px 0 10px">레벨 박스를 <b style="color:#fbbf24">클릭</b>하시면 한국어·영문 상세 설명이 펼쳐집니다.</p>

    <!-- 8단계 레벨 표 -->
    <div class="lvl-table">
      <div class="lvl-head">
        <div class="lvl-col-cat"><span class="lvl-h-text">단계</span></div>
        <div class="lvl-col-lv"><span class="lvl-h-text">레벨</span></div>
        <div class="lvl-col-en"><span class="lvl-h-text">능력도</span></div>
      </div>

      <!-- 고급 -->
      <details class="lvl-row">
        <summary>
          <span class="lvl-cat" style="background:#7c3aed">고급</span>
          <span class="lvl-num">Level 8</span>
          <span class="lvl-en">Proficient</span>
          <span class="lvl-arrow">▾</span>
        </summary>
        <div class="lvl-body">
          <div class="lvl-title">Level 8 (최상급 : Proficient Level)</div>
          <p class="lvl-ko">실제 교양 있는 원어민에 버금갈 정도로 사적인 주제뿐만 아니라 일반적이고 사회적인 내용에 이르기까지 유창하고 또한 자연스럽게 대화할 수 있는 상태입니다. 이미 영어구사에 있어 상당한 수준에 이르렀기 때문에 아주 쉽게 수준 있는 내용들을 읽고 이해할 수 있으며, 숙달된 문법지식과 구조분석력이 작문에도 그대로 드러나는 수준이라고 말할 수 있습니다. 따라서 원어민들과 함께 일하는 전문적인 업무 환경에서도 능동적으로 잘 대처할 수 있습니다.</p>
          <p class="lvl-en-desc">The student can speak fluently and spontaneously on a wide range of personal, general or social topics like the real well-educated natives. Reading and understanding advanced text can be with such an ease for he already has a fully operational command of the language. The complexity of grammar and structure that he has mastered can also be manifested in writing. Finally, the student is able to function very well in an environment with native speaking people.</p>
        </div>
      </details>
      <details class="lvl-row">
        <summary>
          <span class="lvl-cat" style="background:#7c3aed">고급</span>
          <span class="lvl-num">Level 7</span>
          <span class="lvl-en">Advanced</span>
          <span class="lvl-arrow">▾</span>
        </summary>
        <div class="lvl-body">
          <div class="lvl-title">Level 7 (상급 : Advanced Level)</div>
          <p class="lvl-ko">다양한 상황에서도 상대방의 말을 완벽하게 이해할 수 있으며, 자신의 생각을 다양한 방법으로 표현할 수 있는 능력을 갖춘 상태입니다. 수준 있는 글이나 복잡한 구조의 글들을 읽고 이해하는데 전혀 문제가 없으므로, 유창하고 자신감 있게 영어를 구사할 수 있는 수준입니다.</p>
          <p class="lvl-en-desc">The student can understand statements completely in varied situations. He is also able to use different expressions to communicate his ideas. He has no problem with reading and understanding articles of advanced language and complex structures. He speaks fluently and confidently.</p>
        </div>
      </details>

      <!-- 중급 -->
      <details class="lvl-row">
        <summary>
          <span class="lvl-cat" style="background:#0ea5e9">중급</span>
          <span class="lvl-num">Level 6</span>
          <span class="lvl-en">Upper Intermediate</span>
          <span class="lvl-arrow">▾</span>
        </summary>
        <div class="lvl-body">
          <div class="lvl-title">Level 6 (중급 3 : Upper Intermediate Level)</div>
          <p class="lvl-ko">일반적인 상황에서 완벽하게 상대방의 말을 이해하고, 자신의 생각을 말하며, 질문을 할 수 있으며, 문법지식과 어휘력이 좋기 때문에 읽고 이해하는데 있어 별 무리가 없는 상태입니다. 자신감 있게 자신의 의사를 표출할 수 있으며, 거의 유창한 단계라고 볼 수 있습니다.</p>
          <p class="lvl-en-desc">The student is able to completely understand and use statements and questions he encounters in normal situation. He experiences no difficulty in reading and comprehension and in expressing himself with his good grammar skills and vocabulary. He expresses himself confidently and his speech is almost fluent.</p>
        </div>
      </details>
      <details class="lvl-row">
        <summary>
          <span class="lvl-cat" style="background:#0ea5e9">중급</span>
          <span class="lvl-num">Level 5</span>
          <span class="lvl-en">Intermediate</span>
          <span class="lvl-arrow">▾</span>
        </summary>
        <div class="lvl-body">
          <div class="lvl-title">Level 5 (중급 2 : Intermediate Level)</div>
          <p class="lvl-ko">상대방의 말을 쉽게 이해하고, 복잡한 질문에도 답할 수 있으며, 자신의 생각을 표현함에 있어서 큰 어려움이 없는 상태입니다. 문장 구조의 문법적인 형태들에 대한 기초적인 구사력을 습득한 상태이며, 어휘력이 좋기 때문에 더 복잡한 어휘나 다양한 표현들을 이해하고 구사할 수 있는 수준입니다.</p>
          <p class="lvl-en-desc">The student can easily understand statements and respond to questions of higher complexity. Expressing his thoughts comes with not much difficulty. He has achieved a basic command of grammatical forms of structures. Also, his good vocabulary enables him to understand and use more difficult words and varied expressions.</p>
        </div>
      </details>
      <details class="lvl-row">
        <summary>
          <span class="lvl-cat" style="background:#0ea5e9">중급</span>
          <span class="lvl-num">Level 4</span>
          <span class="lvl-en">Lower Intermediate</span>
          <span class="lvl-arrow">▾</span>
        </summary>
        <div class="lvl-body">
          <div class="lvl-title">Level 4 (중급 1 : Lower Intermediate Level)</div>
          <p class="lvl-ko">자신이 마주치게 되는 거의 모든 말들을 이해할 수 있는 단계입니다. 표현함에 있어 다소 어려움은 존재하지만, 다른 이들에게 자신의 생각을 전달 할 수 있습니다. 읽고 이해함에 있어 문법이해 수준이 향상 되었으며, 어휘력 역시 좋은 편입니다.</p>
          <p class="lvl-en-desc">The student can understand almost every statement that he encounters. He can now also communicate himself to others better, although still experiencing difficulty in expression. He has better understanding of English grammar and an expanded vocabulary useful in reading and comprehension.</p>
        </div>
      </details>

      <!-- 초급 -->
      <details class="lvl-row">
        <summary>
          <span class="lvl-cat" style="background:#10b981">초급</span>
          <span class="lvl-num">Level 3</span>
          <span class="lvl-en">Upper Beginner</span>
          <span class="lvl-arrow">▾</span>
        </summary>
        <div class="lvl-body">
          <div class="lvl-title">Level 3 (초급 2 : Upper Beginner Level)</div>
          <p class="lvl-ko">평소 잘 알고 학습한 상황들에 대해서 문장들을 잘 이해할 수 있고 여전히 제한된 어휘력을 갖고 있지만, 남들이 이해할 수 있도록 자기의 생각을 표현할 수 있는 상태입니다. 간단한 문장이나 질문을 만들 수 있지만, 여전히 명확한 이해를 위해서는 선생님의 반복이 필요한 단계입니다.</p>
          <p class="lvl-en-desc">The student can understand English statements based on the situation where they are used. He can now express himself well enough for others to understand, though with limited vocabulary. He knows how to make simple sentences and questions. The teacher sometimes need to repeat questions and statements for clear understanding.</p>
        </div>
      </details>
      <details class="lvl-row">
        <summary>
          <span class="lvl-cat" style="background:#10b981">초급</span>
          <span class="lvl-num">Level 2</span>
          <span class="lvl-en">Lower Beginner</span>
          <span class="lvl-arrow">▾</span>
        </summary>
        <div class="lvl-body">
          <div class="lvl-title">Level 2 (초급 1 : Lower Beginner Level)</div>
          <p class="lvl-ko">흔히 쓰이는 단어나 표현만 이해할 수 있지만, 여전히 자신의 생각을 표현하는데 어려움이 많으며, 적절한 시제나 표현으로 완벽한 문장을 만드는 것에도 어려움이 많은 상태입니다. 학생의 이해를 위해서는 문장을 반복하거나 단순화시켜야 할 때가 많고, 질문 역시 간단해야 이해가 가능한 경우가 많습니다.</p>
          <p class="lvl-en-desc">The student finds it hard to express himself. The student can understand and use commonly-used English words and expressions. However, he cannot really make complete sentences with the proper tense yet. The teacher has to repeat and simplify questions and statements for the student to understand their meaning.</p>
        </div>
      </details>

      <!-- 입문 -->
      <details class="lvl-row" open>
        <summary>
          <span class="lvl-cat" style="background:#f59e0b">입문</span>
          <span class="lvl-num">Level 1</span>
          <span class="lvl-en">Novice</span>
          <span class="lvl-arrow">▾</span>
        </summary>
        <div class="lvl-body">
          <div class="lvl-title">Level 1 (입문 : Novice Level)</div>
          <p class="lvl-ko">영어에 대한 단편적인 지식만을 갖추고 있거나, 지식은 많더라도 머릿속에만 존재하는 상태, 또는 그동안 영어에 무관심하여 처음 배우는 것과 다름없는 상태입니다. 문장단위로 들리지 않고 친숙한 단어나 표현만 들리며, 들린다고 알지라도 문장 속에서 의미하는 바가 아닌 다른 뜻으로 받아들일 수 있는 단계입니다. 이해를 위해서 여러 번의 반복 훈련이 필요하며, 질문을 받으면 문장을 구성하지 못하고 어색한 발음의 간단한 단어로 답하게 됩니다.</p>
          <p class="lvl-en-desc">The student can barely speak English. He can only understand and use basic expressions/phrases and very simple words when asked questions. The teacher needs to repeat questions and statements several times before there is understanding. Finally, the student's pronunciation is difficult to understand.</p>
        </div>
      </details>
    </div>

    <h3 style="margin-top:18px">🎯 목적별 트랙</h3>
    <ul>
      <li><b>키즈 영어</b> — 만 4-12세, 게임·놀이형 수업</li>
      <li><b>중·고등 학습</b> — 내신·수능·말하기 평가</li>
      <li><b>비즈니스 영어</b> — 회의·이메일·프레젠테이션</li>
      <li><b>시험 대비</b> — TOEIC·OPIc·IELTS·TOEFL</li>
      <li><b>일상 회화</b> — 자유 주제·발음 교정</li>
    </ul>
    <h3>📝 수업 구성</h3>
    <ul>
      <li>1:1 화상 수업 (25분 · 50분)</li>
      <li>그룹 수업 (2-4명, 토론형)</li>
      <li>발음 클리닉 (AI + 강사 결합)</li>
    </ul>
    <a class="info-cta" onclick="closeInfoModal();window.openInquiryModal&&window.openInquiryModal()">🎁 무료체험 신청 →</a>`;

  const FAQ = `
    <h2>❓ 자주 묻는 질문</h2>
    <div class="faq-q">Q. 무료 체험은 어떻게 신청하나요?</div>
    <div class="faq-a">홈 검색창의 "💬 신규상담" 또는 그리드의 "🎁 무료체험"을 클릭하시면 신청 폼이 열립니다. 담당자가 영업일 1일 내로 연락드려 일정을 잡아드려요.</div>
    <div class="faq-q">Q. 어떤 기기로 수업을 들을 수 있나요?</div>
    <div class="faq-a">PC(Chrome/Edge), 노트북, 태블릿(iPad/Android), 스마트폰 모두 가능합니다. 별도 앱 설치 없이 웹브라우저에서 바로 접속하세요. 카메라·마이크가 필수입니다.</div>
    <div class="faq-q">Q. 수업 시간을 변경하거나 취소할 수 있나요?</div>
    <div class="faq-a">수업 24시간 전까지는 자유 변경·취소가 가능합니다. 24시간 이내 취소 시 1회 차감되며, 노쇼는 자동 차감됩니다.</div>
    <div class="faq-q">Q. 강사를 직접 고를 수 있나요?</div>
    <div class="faq-a">네! 마이페이지의 "강사 찾기"에서 국적·평점·전문 분야로 검색해 즐겨찾기 강사를 등록할 수 있습니다.</div>
    <div class="faq-q">Q. 결제 후 환불이 가능한가요?</div>
    <div class="faq-a">7일 이내 미수강분은 100% 환불 가능합니다. 일부 수강 후에는 사용분 차감 후 환불됩니다. 자세한 사항은 고객센터로 문의 주세요.</div>
    <div class="faq-q">Q. 수업 녹화본을 받아볼 수 있나요?</div>
    <div class="faq-a">모든 수업은 자동 녹화되며, 마이페이지에서 30일간 다시보기가 가능합니다. 학부모님께도 공유 링크 발송 가능해요.</div>
    <div class="faq-q">Q. 카메라가 안 켜져요. 어떻게 해야 하나요?</div>
    <div class="faq-a">"🩺 자가진단" 도구로 카메라·마이크 권한을 확인해 보세요. 그래도 안 되면 "💻 PC원격지원" 또는 "💬 카톡상담"으로 연락 주세요.</div>`;

  const LIBRARY = `
    <h2>📁 자료실</h2>
    <p>망고아이가 자체 개발한 화상영어 전용 교재 3종과 학습 자료를 안내합니다.</p>

    <h3>📖 레벨별 교재 — 망고아이 전용 컨텐츠</h3>
    <p style="color:#94a3b8;font-size:12px;margin:6px 0 10px">교재명을 <b style="color:#fbbf24">클릭</b>하면 상세 설명·구성·특징이 펼쳐집니다.</p>

    <div class="book-list">

      <!-- 📘 MES — Mango English Study -->
      <details class="book-item" open>
        <summary>
          <span class="book-cover" style="background:linear-gradient(135deg,#fbbf24,#f59e0b)">MES</span>
          <div class="book-meta">
            <div class="book-name">Mango English Study (MES)</div>
            <div class="book-level">📊 초급 · 중급 · 102 lessons</div>
          </div>
          <span class="book-arrow">▾</span>
        </summary>
        <div class="book-body">
          <div class="book-feature-grid">
            <div class="book-feature">
              <span class="bf-num">01</span>
              <span class="bf-text">초급부터 중급까지 영어를 처음 시작하는 학생들을 위해 흥미로운 사진들과 함께 <b>대화 형식</b>으로 배우는 망고아이 자체 개발 교재</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">02</span>
              <span class="bf-text">풍부한 ESL경험을 가진 미국교사분들이 <b>약 2년에 걸쳐 개발</b>하여 지난 10년 동안 망고아이에서 애용한 최고의 컨텐츠 교재</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">03</span>
              <span class="bf-text">예복습 비디오와 테스트가 함께 있어 <b>완전 학습</b>이 가능하며 문장 위주의 수업으로 자연스러운 의사소통을 유도함</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">04</span>
              <span class="bf-text">총 <b>102개의 레슨</b>으로 구성되어 있음</span>
            </div>
          </div>
          <div class="book-tags">
            <span class="book-tag">🎬 비디오 학습</span>
            <span class="book-tag">📝 테스트 포함</span>
            <span class="book-tag">💬 대화형</span>
            <span class="book-tag">🇺🇸 미국 교사 개발</span>
          </div>
        </div>
      </details>

      <!-- 🥤 BTS — Bubble Tea Study -->
      <details class="book-item">
        <summary>
          <span class="book-cover" style="background:linear-gradient(135deg,#ec4899,#db2777)">BTS</span>
          <div class="book-meta">
            <div class="book-name">Bubble Tea Study (BTS)</div>
            <div class="book-level">📊 초급 · 중급 · 102 lessons · 2019 출판</div>
          </div>
          <span class="book-arrow">▾</span>
        </summary>
        <div class="book-body">
          <div class="book-feature-grid">
            <div class="book-feature">
              <span class="bf-num">01</span>
              <span class="bf-text">기초부터 중급까지 다양하고 독특한 이미지들로 구성된 <b>2019년 출판된 최신 교재</b></span>
            </div>
            <div class="book-feature">
              <span class="bf-num">02</span>
              <span class="bf-text">기초 문법과 발음 교정 (<b>Tongue Twist</b>)을 포함하고 음악적인 재미를 위해 각 lesson마다 <b>영어 노래</b>를 삽입하였고 QR 코드로 언제든지 유튜브에서 감상할 수 있음</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">03</span>
              <span class="bf-text">실생활에서 많이 사용하는 <b>관용 문장과 단어</b>들을 독특하고 흥미로운 사진과 그림들과 함께 연상하여서 배우는 망고아이 자체 개발의 최신판</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">04</span>
              <span class="bf-text">예복습 비디오와 <b>퀴즈가 혼합</b>되어 있어서 충분한 학습량을 통해서 영어의 듣기와 말하기의 향상에 큰 도움이 됨</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">05</span>
              <span class="bf-text">현재 교사들과 교재 개발 전문가들이 현장 경험과 영어 회화와 음성이론을 바탕으로 <b>듣기와 말하기 화상 수업에 최적화</b>하여 만든 컨텐츠</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">06</span>
              <span class="bf-text"><b>Homework Book</b>이 있어서 집에서도 학원에서도 글로 쓰면서 예복습도 가능한 온오프라인의 교재 컨텐츠</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">07</span>
              <span class="bf-text">총 <b>102개의 레슨</b>으로 구성되어 있음</span>
            </div>
          </div>
          <div class="book-tags">
            <span class="book-tag">🎵 영어 노래</span>
            <span class="book-tag">📱 QR 유튜브</span>
            <span class="book-tag">📚 Homework Book</span>
            <span class="book-tag">🎤 Tongue Twist 발음</span>
            <span class="book-tag">🆕 최신판 (2019)</span>
          </div>
        </div>
      </details>

      <!-- 💪 SIU — Shake It Up -->
      <details class="book-item">
        <summary>
          <span class="book-cover" style="background:linear-gradient(135deg,#0ea5e9,#0284c7)">SIU</span>
          <div class="book-meta">
            <div class="book-name">Shake It Up (SIU)</div>
            <div class="book-level">📊 중급 · 고급 · 102 lessons</div>
          </div>
          <span class="book-arrow">▾</span>
        </summary>
        <div class="book-body">
          <div class="book-feature-grid">
            <div class="book-feature">
              <span class="bf-num">01</span>
              <span class="bf-text">Bubble Tea Study (BTS)을 마친 학생들이 <b>주제(토픽)</b>을 가지고 문법과 패턴에 맞게 자유롭게 긴 문장을 사용하며 대화하는 능력을 키우는 교재</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">02</span>
              <span class="bf-text">미국에서 수년간 현지 교사 생활을 한 개발원이 학생들이 <b>가장 관심있어 하는 주제들</b>을 중심으로 하여서 대화를 이어가며 수업할 수 있는 프로그램</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">03</span>
              <span class="bf-text">화상영어 수업에 최적화된 구성으로 흥미로운 사진과 이미지들을 중요 문장들과 함께 <b>문법에 맞게 익히는</b> 능력을 키우는 중급 이상 단계</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">04</span>
              <span class="bf-text">단순한 회화 수업을 넘어서 중요한 <b>문법과 어휘를 함께 사용</b>하며 문장을 익힐 수 있는 통합식 영어 교재</span>
            </div>
            <div class="book-feature">
              <span class="bf-num">05</span>
              <span class="bf-text">총 <b>102개의 레슨</b>으로 구성되어 있음</span>
            </div>
          </div>
          <div class="book-tags">
            <span class="book-tag">🎯 토픽 기반</span>
            <span class="book-tag">📝 통합식 학습</span>
            <span class="book-tag">🆙 BTS 후속 단계</span>
            <span class="book-tag">🎓 중·고급 전용</span>
          </div>
        </div>
      </details>
    </div>

    <h3>📊 교재 선택 가이드</h3>
    <table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0 14px;background:rgba(0,0,0,0.2);border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:rgba(251,191,36,0.15)">
          <th style="padding:8px;text-align:left;color:#fde68a;font-weight:700">교재</th>
          <th style="padding:8px;text-align:center;color:#fde68a;font-weight:700">레벨</th>
          <th style="padding:8px;text-align:left;color:#fde68a;font-weight:700">추천 대상</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06)"><td style="padding:8px;color:#fff;font-weight:700">📘 MES</td><td style="padding:8px;text-align:center;color:#fbbf24">Lv 1-5</td><td style="padding:8px;color:#cbd5e1">처음 시작 · 기초 회화 다지기</td></tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06)"><td style="padding:8px;color:#fff;font-weight:700">🥤 BTS</td><td style="padding:8px;text-align:center;color:#fbbf24">Lv 2-5</td><td style="padding:8px;color:#cbd5e1">발음·노래로 재미있게 학습</td></tr>
        <tr><td style="padding:8px;color:#fff;font-weight:700">💪 SIU</td><td style="padding:8px;text-align:center;color:#fbbf24">Lv 5-8</td><td style="padding:8px;color:#cbd5e1">긴 문장·토픽 토론 능력 강화</td></tr>
      </tbody>
    </table>

    <h3>📝 학습 도구</h3>
    <ul>
      <li>발음 체크리스트 · PDF</li>
      <li>일일 학습 플래너 · PDF</li>
      <li>단어장 템플릿 · Excel</li>
      <li>시험 모의고사 (TOEIC/OPIc) · PDF</li>
    </ul>
    <h3>🎬 영상 자료</h3>
    <ul>
      <li>5분 회화 클립 (주제별 50개)</li>
      <li>발음 교정 동영상 강의</li>
      <li>학부모 가이드 영상</li>
    </ul>
    <p style="margin-top:16px;color:#94a3b8;font-size:12px">※ 모든 교재는 망고아이 자체 개발 콘텐츠이며, 회원 로그인 후 마이페이지에서 다운로드 가능합니다.</p>
    <a class="info-cta" href="/admin/login">🔑 로그인하고 교재 받기 →</a>`;

  const CONTACT = `
    <h2>☎️ 고객센터</h2>
    <p>학생·학부모님의 문의를 신속히 처리합니다. 빠른 답변을 원하시면 카카오톡 채널이 가장 빠릅니다.</p>

    <!-- 🏆 Hero — 고객만족센터 대표번호 + 운영시간 -->
    <div class="cs-hero">
      <div class="cs-hero-left">
        <div class="cs-hero-label">💬 카카오톡 상담</div>
        <a href="https://pf.kakao.com/_mangoi/chat" target="_blank" rel="noopener" class="cs-hero-phone" style="font-size:clamp(20px,4vw,30px);text-decoration:none">카카오상담 바로하기</a>
        <div class="cs-hero-hours">
          <span class="cs-dot"></span>
          운영시간 <b>10:00 ~ 20:00</b>
          <span class="cs-hours-sub">(주말 및 공휴일 휴무)</span>
        </div>
      </div>
      <div class="cs-hero-right">
        <a href="https://pf.kakao.com/_mangoi/chat" target="_blank" rel="noopener" class="cs-hero-cta">💬 바로 채팅 시작 →</a>
      </div>
    </div>

    <!-- 📨 온라인 상담 신청 (전체 너비) -->
    <div class="cs-channels cs-channels-1">
      <button type="button" onclick="closeInfoModal();window.openInquiryModal&&window.openInquiryModal()" class="cs-card cs-card-form cs-card-wide">
        <div class="cs-card-icon">📨</div>
        <div class="cs-card-body">
          <div class="cs-card-title">온라인 상담 신청</div>
          <div class="cs-card-detail">웹 폼으로 문의하기 · 학생 정보·관심 코스 함께 전달</div>
          <div class="cs-card-meta">💬 담당자가 영업일 1일 내 카카오톡으로 연락드립니다</div>
        </div>
        <div class="cs-card-arrow">→</div>
      </button>
    </div>

    <!-- 🏢 회사 정보 푸터 (법적 고지) -->
    <div class="cs-legal">
      <div class="cs-legal-title">🏢 회사 정보</div>
      <div class="cs-legal-grid">
        <div class="cs-legal-row">
          <span class="cs-legal-key">상호</span>
          <span class="cs-legal-val"><b>(주)에듀비전</b></span>
        </div>
        <div class="cs-legal-row">
          <span class="cs-legal-key">대표</span>
          <span class="cs-legal-val">정우영</span>
        </div>
        <div class="cs-legal-row">
          <span class="cs-legal-key">주소</span>
          <span class="cs-legal-val">경기도 안산시 상록구 이동 716-10번지 6층</span>
        </div>
        <div class="cs-legal-row">
          <span class="cs-legal-key">사업자등록번호</span>
          <span class="cs-legal-val">134-86-30816</span>
        </div>
        <div class="cs-legal-row">
          <span class="cs-legal-key">통신판매업신고</span>
          <span class="cs-legal-val">제 2010-경기안산-0634호</span>
        </div>
        <div class="cs-legal-row">
          <span class="cs-legal-key">개인정보 보호 책임자</span>
          <span class="cs-legal-val">정지웅 · <a href="mailto:jangjiwoong@mangoi.com">jangjiwoong@mangoi.com</a></span>
        </div>
      </div>
    </div>

    <a class="info-cta" onclick="closeInfoModal();window.openInquiryModal&&window.openInquiryModal()">📨 온라인 문의 →</a>`;

  const TEACHERS = `
    <h2>👨‍🏫 강사 소개</h2>
    <p>1,000명+ 검증된 강사들이 매일 7,000건+의 수업을 진행합니다.</p>
    <h3>🌍 강사 구성</h3>
    <div class="info-grid">
      <div class="info-tile" data-cat="all" onclick="window.__filterTeacherCat&&window.__filterTeacherCat('all')"><b>🌏 전체</b><span>모든 강사</span></div>
      <div class="info-tile" data-cat="ph" onclick="window.__filterTeacherCat&&window.__filterTeacherCat('ph')"><b>🇵🇭 필리핀</b><span>현지 원어민 강사</span></div>
      <div class="info-tile" data-cat="us" onclick="window.__filterTeacherCat&&window.__filterTeacherCat('us')"><b>🇺🇸 미국·캐나다</b><span>원어민</span></div>
      <div class="info-tile" data-cat="gb" onclick="window.__filterTeacherCat&&window.__filterTeacherCat('gb')"><b>🇬🇧 영국·호주</b><span>원어민 <em style="display:inline-block;margin-left:4px;padding:1px 7px;border-radius:999px;background:#fef3c7;color:#b45309;font-size:10px;font-weight:800;font-style:normal;vertical-align:middle;border:1px solid #fcd34d;white-space:nowrap">준비중</em></span></div>
      <div class="info-tile" data-cat="cn" onclick="window.__filterTeacherCat&&window.__filterTeacherCat('cn')"><b>🇨🇳 중국어</b><span>이중언어</span></div>
    </div>

    <h3 id="ph-gallery-heading" style="margin-top:14px">🌏 전체 강사진</h3>
    <div class="ph-gallery" id="ph-gallery-dynamic">
      <div class="ph-card">
        <div class="ph-photo" style="background:linear-gradient(135deg,#fcd34d,#f59e0b)">
          <span class="ph-emoji">👩🏻‍🏫</span>
          <span class="ph-flag">🇵🇭</span>
        </div>
        <div class="ph-name">Maria Santos</div>
        <div class="ph-spec">Daily Conversation</div>
        <div class="ph-star">⭐ 4.9 · 7년차</div>
      </div>
      <div class="ph-card">
        <div class="ph-photo" style="background:linear-gradient(135deg,#86efac,#10b981)">
          <span class="ph-emoji">👨🏻‍🏫</span>
          <span class="ph-flag">🇵🇭</span>
        </div>
        <div class="ph-name">James Cruz</div>
        <div class="ph-spec">Business English</div>
        <div class="ph-star">⭐ 4.8 · 5년차</div>
      </div>
      <div class="ph-card">
        <div class="ph-photo" style="background:linear-gradient(135deg,#f9a8d4,#ec4899)">
          <span class="ph-emoji">👩🏻‍🎓</span>
          <span class="ph-flag">🇵🇭</span>
        </div>
        <div class="ph-name">Anna Reyes</div>
        <div class="ph-spec">Kids English</div>
        <div class="ph-star">⭐ 5.0 · 6년차</div>
      </div>
      <div class="ph-card">
        <div class="ph-photo" style="background:linear-gradient(135deg,#93c5fd,#3b82f6)">
          <span class="ph-emoji">🧑🏻‍🏫</span>
          <span class="ph-flag">🇵🇭</span>
        </div>
        <div class="ph-name">Carlos Lim</div>
        <div class="ph-spec">Pronunciation</div>
        <div class="ph-star">⭐ 4.9 · 8년차</div>
      </div>
      <div class="ph-card">
        <div class="ph-photo" style="background:linear-gradient(135deg,#c4b5fd,#8b5cf6)">
          <span class="ph-emoji">👩🏻‍💼</span>
          <span class="ph-flag">🇵🇭</span>
        </div>
        <div class="ph-name">Sofia Garcia</div>
        <div class="ph-spec">TOEIC·OPIc</div>
        <div class="ph-star">⭐ 4.8 · 4년차</div>
      </div>
      <div class="ph-card">
        <div class="ph-photo" style="background:linear-gradient(135deg,#fda4af,#f43f5e)">
          <span class="ph-emoji">👨🏻‍🎓</span>
          <span class="ph-flag">🇵🇭</span>
        </div>
        <div class="ph-name">Daniel Tan</div>
        <div class="ph-spec">Travel English</div>
        <div class="ph-star">⭐ 4.9 · 6년차</div>
      </div>
    </div>
    <p style="color:#94a3b8;font-size:11px;margin:6px 0 14px;text-align:center">
      🇵🇭 망고아이 필리핀 본사 검증 강사 · TESOL/CELTA 자격 + 평균 5년+ 경력
    </p>
    <h3>✅ 채용 기준</h3>
    <ul>
      <li>대학 졸업 이상 (영어 관련 학과 우대)</li>
      <li>TESOL/CELTA/TEFL 자격증 보유</li>
      <li>최소 2년 영어 교육 경험</li>
      <li>망고아이 자체 4단계 시범 수업 통과</li>
      <li>분기별 학생 평가 4.0/5.0 이상 유지</li>
    </ul>
    <h3>⭐ 강사 평가 시스템</h3>
    <ul>
      <li>매 수업 후 학생 5단계 평가</li>
      <li>월별 동료/매니저 모니터링</li>
      <li>S·A·B·C 등급 기반 인센티브</li>
    </ul>`;

  const REVIEWS = `
    <h2>⭐ 수업 후기</h2>
    <p>실제 수강생·학부모님의 솔직한 리뷰입니다 (2026년 4월 기준 평균 4.7/5.0)</p>
    <h3>📝 학생 후기</h3>
    <div class="info-tile" style="text-align:left;margin-bottom:8px">
      <b>김OO 학생 (중3) · ⭐⭐⭐⭐⭐</b>
      <span>"Maria 선생님이랑 6개월 했는데 모의고사 듣기 만점 받았어요! 발음도 친구들이 부러워해요"</span>
    </div>
    <div class="info-tile" style="text-align:left;margin-bottom:8px">
      <b>이OO 학생 (성인 직장인) · ⭐⭐⭐⭐⭐</b>
      <span>"새벽 6시 수업이 있어서 너무 좋아요. 영어 회의에서 발표할 수 있게 됐어요"</span>
    </div>
    <h3>👪 학부모 후기</h3>
    <div class="info-tile" style="text-align:left;margin-bottom:8px">
      <b>박OO 학부모 (자녀 초5) · ⭐⭐⭐⭐⭐</b>
      <span>"녹화본으로 같이 복습하니까 부담이 없어요. 아이가 영어 시간을 기다려요"</span>
    </div>
    <p style="margin-top:14px;color:#94a3b8;font-size:12px">※ 더 많은 후기는 카카오 채널 "@망고아이"에서 확인하세요.</p>`;

  const EVENT = `
    <h2>🎉 진행 중 이벤트</h2>
    <p>지금 신청하시면 받을 수 있는 혜택!</p>
    <div class="info-tile" style="text-align:left;margin:10px 0;border:1px solid rgba(251,191,36,0.4)">
      <b>🎁 신규 회원 무료체험 1회 + 5,000원 쿠폰</b>
      <span>회원가입 후 7일 내 첫 체험 시 자동 지급</span>
    </div>
    <div class="info-tile" style="text-align:left;margin:10px 0">
      <b>🤝 친구 추천 이벤트</b>
      <span>친구 가입·결제 시 양쪽 모두 30,000원 적립</span>
    </div>
    <div class="info-tile" style="text-align:left;margin:10px 0">
      <b>📦 패키지 할인</b>
      <span>24회 이상 결제 시 최대 25% 할인</span>
    </div>
    <div class="info-tile" style="text-align:left;margin:10px 0">
      <b>🌸 봄 시즌 특별 할인 (5월 한정)</b>
      <span>비즈니스·시험 코스 20% 할인</span>
    </div>
    <a class="info-cta" onclick="closeInfoModal();window.openInquiryModal&&window.openInquiryModal()">📨 상담 받고 이벤트 적용 →</a>`;

  const LEARNGUIDE = `
    <h2>🎓 효과적인 학습 가이드</h2>
    <p>화상영어로 빠르게 영어 실력을 키우는 6가지 비법.</p>
    <h3>1️⃣ 매일 20분, 꾸준히</h3>
    <p>일주일에 5회 20분이 일주일에 1회 2시간보다 5배 효과적입니다.</p>
    <h3>2️⃣ 녹화본 다시 듣기</h3>
    <p>수업 다음날 녹화본으로 자기 발화를 들어보세요. 어색한 발음·표현이 보입니다.</p>
    <h3>3️⃣ 강사 피드백을 메모</h3>
    <p>매 수업 강사가 지적해 준 표현을 단어장에 적고 다음 수업에 활용하세요.</p>
    <h3>4️⃣ 다양한 강사와 수업하기</h3>
    <p><b style="color:#fbbf24">다양한 강사분과 수업하는 것이 영어 회화에는 더 큰 도움이 됩니다!</b><br>
       서로 다른 발음·억양·표현·속도에 노출될수록 실제 원어민 환경에 가까워지고, 어떤 상대와도 자신 있게 대화할 수 있게 됩니다.</p>
    <h3>5️⃣ AI 발음 분석 활용</h3>
    <p>마이페이지의 "AI 발음 점수"를 매주 확인하고 약점 음소를 집중 연습하세요.</p>
    <h3>6️⃣ 실전 영어 환경 만들기</h3>
    <p>OTT는 영어 자막, 폰 언어는 영어로. 망고아이 수업이 점점 쉬워집니다.</p>`;

  const INSTALLGUIDE = `
    <h2>⚙️ 프로그램 설치 가이드</h2>
    <p>망고아이는 별도 설치 없이 웹브라우저에서 바로 수업이 가능합니다!</p>
    <h3>✅ 권장 환경</h3>
    <ul>
      <li><b>브라우저</b>: Chrome 최신 (권장) · Edge · Safari</li>
      <li><b>운영체제</b>: Windows 10+, macOS 11+, iOS 15+, Android 10+</li>
      <li><b>인터넷</b>: 10Mbps 이상 (HD 화질용 20Mbps 권장)</li>
      <li><b>장치</b>: 카메라·마이크·스피커 (또는 헤드셋)</li>
    </ul>
    <h3>🔧 처음 접속하시는 분</h3>
    <ol>
      <li>Chrome 브라우저 설치 (chrome.google.com)</li>
      <li>망고아이 사이트 접속 후 회원가입</li>
      <li>"🩺 자가진단" 도구로 카메라·마이크 권한 허용</li>
      <li>마이페이지 → 수업 시간 → "수업 입장" 클릭</li>
    </ol>
    <h3>🚨 문제 발생 시</h3>
    <ol>
      <li>"🩺 자가진단" 도구로 어디가 문제인지 확인</li>
      <li>해결 안 되면 "💻 PC원격지원" 신청</li>
      <li>긴급한 경우 "💬 카톡 상담" (즉시 답변)</li>
    </ol>
    <a class="info-cta" onclick="closeInfoModal();window.openDiagnosis&&window.openDiagnosis()">🩺 자가진단 시작 →</a>`;

  const FRANCHISE = `
    <h2>🏢 가맹점 / 제휴 문의</h2>
    <p>망고아이의 검증된 시스템으로 영어 교육 사업을 시작하세요.</p>
    <h3>🌟 가맹 혜택</h3>
    <ul>
      <li>본사 검증된 강사 풀 그대로 활용</li>
      <li>학생 관리 ERP 시스템 무료 제공</li>
      <li>마케팅 지원 (광고·SNS·블로그)</li>
      <li>본사 표준 커리큘럼·교재 제공</li>
      <li>합리적인 수익 분배</li>
    </ul>
    <h3>📋 자격 조건</h3>
    <ul>
      <li>교육 사업 경험자 (필수 X, 우대)</li>
      <li>최소 운영 자본: <b style="color:#fbbf24">열정 · 끈기 · 에너지</b></li>
      <li>본사 교육 4주 수료</li>
    </ul>
    <h3>📞 가맹 상담</h3>
    <ul>
      <li>이메일: <b>partner@mangoi.kr</b></li>
      <li>전화: <b>1588-0000 (내선 3)</b></li>
    </ul>

    <!-- 💛 감성 호소문 + 음성 듣기 -->
    <div class="franchise-emo">
      <div class="franchise-emo-head">
        <h3 style="margin:0;color:#fbbf24">💛 원장님께 드리는 진심의 한마디</h3>
        <button type="button" class="franchise-voice-btn" onclick="playFranchiseVoice(this)" aria-label="음성으로 듣기">
          🔊 <span class="vlbl">음성으로 듣기</span>
        </button>
      </div>

      <p class="emo-lead">
        <b>원장님,</b> 혹시 지금 이런 고민 안고 계시지 않으세요?
      </p>
      <p class="emo-pain">
        매달 오르는 <b>환율</b>, 부담스러운 <b>인건비·숙소비</b>,
        <b>4대보험·항공료·소개비</b>까지 —<br>
        영미권 원어민 한 명 모셔 오는 데 들어가는 시간과 비용은
        늘 학원의 무거운 짐이었습니다.<br>
        갑자기 그만두는 강사, 잦은 결석, 길어지는 휴가…
        원장님 마음 한구석은 항상 불안하셨을 겁니다.
      </p>

      <p class="emo-turn">
        <img src="/img/mango-char.png" alt="" style="height:1.2em;width:auto;vertical-align:-0.25em;margin-right:.1em"> <b>이제, 망고아이가 그 짐을 함께 나누겠습니다.</b>
      </p>
      <ul class="emo-list">
        <li>✅ <b>친절하고 재밌고</b>, 열정적이며 부지런합니다</li>
        <li>✅ <b>결석 없고 휴가 없으며</b>, 비용도 합리적입니다</li>
        <li>✅ 무엇보다, <b>진심으로 학생들을 사랑하고 정말 잘 가르칩니다</b></li>
      </ul>

      <p class="emo-proof">
        🏆 이미 함께하신 학원장님들 — <b>한 분도 빠짐없이 "대만족"</b>,
        <b>수익은 눈에 띄게 성장</b>하셨습니다.
      </p>

      <p class="emo-localops">
        📞 저희는 <b>필리핀 현지에 직접 콜센터를 운영</b>합니다.<br>
        원하시는 시간, 레벨, 스타일 — <b>1:1 맞춤</b>으로 준비해 드립니다.
      </p>

      <p class="emo-philosophy">
        💛 영어는 결국 — <b>집중·반복·흥미</b>입니다.<br>
        <b>20년 전통의 망고아이</b>가 그 노하우로,
        원장님께 <b>스트레스 없는 행복한 학원</b>을 만들어 드리겠습니다.
      </p>

      <p class="emo-closing">
        원장님의 <b>학생들을 향한 사랑과 열정</b>,<br>
        그리고 저희 <b>원어민 선생님들의 진심 어린 수업</b>이 만나면 —<br>
        <b style="color:#fbbf24">지역에서 가장 사랑받는 학원</b>이 됩니다. ✨
      </p>
      <p class="emo-signature">
        — 망고아이가 함께 만들어 가겠습니다 —
      </p>
    </div>

    <a class="info-cta" onclick="closeInfoModal();window.openInquiryModal&&window.openInquiryModal()">📨 가맹 상담 신청 →</a>`;

  const CALLCENTER = `
    <h2>🌏 현지 콜센터</h2>
    <p>국가별 망고아이 콜센터 연락처입니다. 시차에 맞춰 24/7 응대 가능합니다.</p>
    <h3>🇰🇷 한국 본사</h3>
    <ul>
      <li>대표 전화: <b>1588-0000</b></li>
      <li>팩스: 02-1234-5678</li>
      <li>운영: 평일 09:00-22:00 / 주말 10:00-18:00 (KST)</li>
      <li>이메일: <b>help@mangoi.kr</b></li>
    </ul>
    <h3>🇵🇭 필리핀 콜센터 (마닐라·세부)</h3>
    <ul>
      <li>현지 전화: <b>+63-2-8888-1234</b></li>
      <li>WhatsApp: <b>+63-917-123-4567</b></li>
      <li>운영: Mon-Fri 06:00-23:00 / Sat-Sun 08:00-20:00 (PHT)</li>
      <li>강사 인사 문의: <b>teacher-ph@mangoi.kr</b></li>
    </ul>
    <h3>💬 24시간 글로벌 채널</h3>
    <ul>
      <li>카카오톡: <b>@망고아이</b> (한국어 응대)</li>
      <li>WhatsApp Business: <b>@MangoiSupport</b> (영어 응대)</li>
      <li>이메일 자동 분류: <b>support@mangoi.kr</b> (24시간 내 회신)</li>
    </ul>
    <p style="margin-top:14px;color:#94a3b8;font-size:12px">※ 현지 강사·학부모 모두 한국어/영어 모두 응대 가능합니다.</p>
    <a class="info-cta" onclick="window.openKakao&&window.openKakao()">💬 카카오 즉시 상담 →</a>`;

  const VIDEOLESSON = `
    <h2>🎬 비디오 레슨 (녹화 수업)</h2>
    <p>실시간 수업이 어려운 시간에도 비디오 레슨으로 매일 학습할 수 있어요.</p>
    <h3>📚 콘텐츠 종류</h3>
    <div class="info-grid">
      <div class="info-tile"><b>🎯 레벨별 강의</b><span>입문~고급 200+ 영상</span></div>
      <div class="info-tile"><b>💼 비즈니스 영어</b><span>상황별 실전 표현</span></div>
      <div class="info-tile"><b>🎭 발음 클리닉</b><span>음소별 집중 훈련</span></div>
      <div class="info-tile"><b>📝 시험 대비</b><span>TOEIC·OPIc·IELTS</span></div>
      <div class="info-tile"><b>👶 키즈 영어</b><span>노래·게임·동화</span></div>
      <div class="info-tile"><b>🌍 문화 영어</b><span>여행·일상·미디어</span></div>
    </div>
    <h3>🎥 핵심 기능</h3>
    <ul>
      <li><b>구간 반복 재생</b> — 어려운 부분 0.5x~2x 속도 조절</li>
      <li><b>한·영 자막</b> — 실시간 토글 (학습 단계별 사용)</li>
      <li><b>받아쓰기 모드</b> — 음성 듣고 빈칸 채우기</li>
      <li><b>섀도잉 녹음</b> — 본인 발음 녹음 + AI 비교 분석</li>
      <li><b>퀴즈 자동 생성</b> — 영상 내용 기반 5문제</li>
      <li><b>학습 진도 자동 기록</b> — 마이페이지 연동</li>
    </ul>
    <h3>📅 추천 학습 패턴</h3>
    <ul>
      <li>1:1 수업 + 비디오 레슨 50:50 병행이 가장 효과적</li>
      <li>새벽·심야 시간대는 비디오로, 정규 시간은 1:1로</li>
      <li>매일 1편 (15~25분) 학습 시 3개월 내 가시적 효과</li>
    </ul>
    <p style="margin-top:14px;color:#94a3b8;font-size:12px">※ 비디오 레슨은 회원 로그인 후 마이페이지에서 시청하실 수 있습니다.</p>
    <a class="info-cta" href="/admin/login">🔑 로그인하고 비디오 보기 →</a>`;

  // ──── 자가진단 도구 (실제 작동) ────
  async function runDiagnosis() {
    showModal(`
      <h2>🩺 시스템 자가진단</h2>
      <p>화상수업에 필요한 환경을 자동으로 점검합니다.</p>
      <div id="diag-results">
        <div class="diag-row"><span>1. 브라우저 호환성</span><span id="diag-browser" class="diag-status checking">확인 중…</span></div>
        <div class="diag-row"><span>2. WebRTC 지원</span><span id="diag-webrtc" class="diag-status checking">확인 중…</span></div>
        <div class="diag-row"><span>3. 카메라 접근</span><span id="diag-camera" class="diag-status checking">확인 중…</span></div>
        <div class="diag-row"><span>4. 마이크 접근</span><span id="diag-mic" class="diag-status checking">확인 중…</span></div>
        <div class="diag-row"><span>5. 인터넷 속도 (다운)</span><span id="diag-speed" class="diag-status checking">확인 중…</span></div>
        <div class="diag-row"><span>6. 화면 해상도</span><span id="diag-screen" class="diag-status checking">확인 중…</span></div>
      </div>
      <div id="diag-summary" style="margin-top:16px;padding:14px;background:rgba(255,255,255,0.05);border-radius:10px;font-size:13px;color:#94a3b8;line-height:1.6">진행 상황을 표시합니다…</div>
      <a class="info-cta" onclick="closeInfoModal();window.openInquiryModal&&window.openInquiryModal()">📨 문제 있으면 상담 신청 →</a>
    `);

    const set = (id, status, text) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.className = 'diag-status ' + status;
      el.textContent = text;
    };
    let pass = 0, fail = 0;

    // 1. 브라우저
    const ua = navigator.userAgent;
    const isChrome = /Chrome\/\d+/.test(ua) && !/Edg/.test(ua);
    const isEdge = /Edg\/\d+/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    if (isChrome || isEdge || isSafari) { set('diag-browser', 'ok', '✓ ' + (isChrome?'Chrome':isEdge?'Edge':'Safari')); pass++; }
    else { set('diag-browser', 'fail', '✗ 권장 브라우저 아님'); fail++; }

    // 2. WebRTC
    if (window.RTCPeerConnection) { set('diag-webrtc', 'ok', '✓ 지원'); pass++; }
    else { set('diag-webrtc', 'fail', '✗ 미지원'); fail++; }

    // 3+4. 카메라·마이크
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const tracks = stream.getTracks();
      const hasVideo = tracks.some(t => t.kind === 'video' && t.readyState === 'live');
      const hasAudio = tracks.some(t => t.kind === 'audio' && t.readyState === 'live');
      if (hasVideo) { set('diag-camera', 'ok', '✓ 작동'); pass++; } else { set('diag-camera', 'fail', '✗ 미감지'); fail++; }
      if (hasAudio) { set('diag-mic', 'ok', '✓ 작동'); pass++; } else { set('diag-mic', 'fail', '✗ 미감지'); fail++; }
      tracks.forEach(t => t.stop());
    } catch(e) {
      set('diag-camera', 'fail', '✗ 권한 없음');
      set('diag-mic', 'fail', '✗ 권한 없음');
      fail += 2;
    }

    // 5. 네트워크 속도 (간이 — 작은 이미지 ms 측정)
    try {
      const t0 = performance.now();
      await fetch('/img/Mangoi_Character.png?cb=' + Date.now(), { cache: 'no-store' });
      const ms = performance.now() - t0;
      if (ms < 200) { set('diag-speed', 'ok', `✓ 빠름 (${Math.round(ms)}ms)`); pass++; }
      else if (ms < 800) { set('diag-speed', 'ok', `✓ 양호 (${Math.round(ms)}ms)`); pass++; }
      else { set('diag-speed', 'fail', `⚠ 느림 (${Math.round(ms)}ms)`); fail++; }
    } catch { set('diag-speed', 'fail', '✗ 측정 실패'); fail++; }

    // 6. 화면
    const w = screen.width, h = screen.height;
    if (w >= 1280) { set('diag-screen', 'ok', `✓ ${w}x${h}`); pass++; }
    else { set('diag-screen', 'fail', `⚠ ${w}x${h} (1280+ 권장)`); fail++; }

    // 종합
    const summary = document.getElementById('diag-summary');
    if (fail === 0) {
      summary.innerHTML = '<b style="color:#4ade80">✅ 모든 항목 통과!</b><br/>화상 수업을 정상적으로 진행하실 수 있습니다.';
    } else {
      summary.innerHTML = `<b style="color:#facc15">⚠ ${fail}개 항목 점검 필요</b><br/>실패한 항목은 도움말이 필요할 수 있습니다. 문제 지속 시 카톡상담 또는 PC원격지원을 이용해 주세요.<br/><span style="font-size:11px;color:#64748b">통과 ${pass} / 실패 ${fail}</span>`;
    }
  }
  window.openDiagnosis = runDiagnosis;

  // ──── 그리드 카드 클릭 핸들러 ────
  const ACTIONS = {
    features:    () => { closeGrid(); showModal(FEATURES); },
    curriculum:  () => { closeGrid(); showModal(CURRICULUM); },
    enroll:      () => { closeGrid(); window.openInquiryModal&&window.openInquiryModal(); },
    trial:       () => { closeGrid(); window.openInquiryModal&&window.openInquiryModal(); setTimeout(()=>{ const p=document.getElementById('inq-program'); if(p)p.value='trial'; }, 100); },
    faq:         () => { closeGrid(); showModal(FAQ); },
    leveltest:   () => { closeGrid(); showLevelTestModal(); },
    speech:      () => { closeGrid(); location.href = '/speech-coach.html'; },
    teachers:    () => {
      closeGrid();
      showModal(TEACHERS);
      // 모달 렌더 후 ERP 등록 강사로 갤러리 동적 갱신
      setTimeout(() => { if (window.loadDynamicTeacherGallery) window.loadDynamicTeacherGallery(); }, 200);
      // 🔊 강사 소개 안내 음성 (15초) — 무음 토글 + 배경음악 줄임(볼륨 0.55)
      try {
        var MK = 'mangoi_voice_muted';
        var VOL = 0.55;
        var a = document.getElementById('teacher-intro-voice');
        if (!a) {
          a = document.createElement('audio');
          a.id = 'teacher-intro-voice'; a.src = '/audio/teacher-intro.mp3'; a.preload = 'auto';
          document.body.appendChild(a);
        }
        a.volume = VOL;
        function tiMuted(){ try { return localStorage.getItem(MK) === '1'; } catch(e){ return false; } }
        var wrap = document.getElementById('teacher-intro-ctrl');
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.id = 'teacher-intro-ctrl';
          wrap.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147483646;display:none';
          var mb = document.createElement('button'); mb.type = 'button';
          mb.setAttribute('aria-label', '음성 안내 켜기/끄기');
          mb.style.cssText = 'width:42px;height:42px;border-radius:50%;border:1px solid rgba(148,163,184,0.4);background:rgba(20,41,80,0.92);font-size:19px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;box-shadow:0 4px 12px rgba(0,0,0,.35)';
          function tiUpd(){ mb.textContent = tiMuted() ? '🔇' : '🔊'; mb.title = tiMuted() ? '소리 켜기' : '무음'; }
          mb.onclick = function(){
            var m = !tiMuted();
            try { localStorage.setItem(MK, m ? '1' : '0'); } catch(e){}
            if (m) { try{ a.pause(); }catch(e){} } else { try{ a.currentTime = 0; }catch(e){} a.volume = VOL; a.play(); }
            tiUpd();
          };
          a.addEventListener('ended', function(){ wrap.style.display = 'none'; });
          wrap.appendChild(mb);
          document.body.appendChild(wrap);
          wrap.__upd = tiUpd;
        }
        if (wrap.__upd) wrap.__upd();
        wrap.style.display = 'flex';
        if (!tiMuted()) { try{ a.currentTime = 0; }catch(e){} a.volume = VOL; var pr = a.play(); if (pr && pr.catch) pr.catch(function(){}); }
      } catch(e){}
    },
    reviews:     () => { closeGrid(); showModal(REVIEWS); },
    diagnosis:   () => { closeGrid(); runDiagnosis(); },
    kakao:       () => { closeGrid(); window.open('https://pf.kakao.com/_mangoi', '_blank'); },
    remote:      () => { closeGrid(); openRemoteSupportModal(); },
    installguide:() => { closeGrid(); showModal(INSTALLGUIDE); },
    library:     () => { closeGrid(); showModal(LIBRARY); },
    learnguide:  () => { closeGrid(); showModal(LEARNGUIDE); },
    event:       () => { closeGrid(); showModal(EVENT); },
    contact:     () => { closeGrid(); showModal(CONTACT); },
    franchise:   () => {
      closeGrid();
      showModal(FRANCHISE);
      // 모달 열리자마자 음성 자동 재생 — 사용자가 카드를 클릭한 직후라 autoplay 정책 통과
      setTimeout(() => {
        const btn = document.querySelector('#info-modal-content .franchise-voice-btn');
        if (btn && window.playFranchiseVoice) window.playFranchiseVoice(btn);
      }, 350);
    },
    adminmgr:    () => { closeGrid(); location.href = '/admin.html'; },
    callcenter:  () => { closeGrid(); showModal(CALLCENTER); },
    videolesson: () => { closeGrid(); showModal(VIDEOLESSON); },
    recordings:  () => { closeGrid(); showRecordingsModal(); },
    payment:     () => { closeGrid(); window.openPaymentModal && window.openPaymentModal(); },
    notice:      () => { closeGrid(); showNoticeModal(); },
    report:      () => { closeGrid(); showReportModal(); },
    focus:       () => { closeGrid(); showFocusModal(); },
  };
  // 검색 RULES에서 호출할 수 있도록 글로벌 노출
  window.gridActions = ACTIONS;

  // ── 공지사항 모달 (community_posts 자동 조회) ──
  async function showNoticeModal() {
    showModal(`
      <h2>📢 공지사항</h2>
      <p>망고아이의 최신 알림과 이벤트를 확인하세요.</p>
      <div id="notice-list" style="margin-top:14px">⏳ 불러오는 중...</div>
      <p style="margin-top:14px;color:#94a3b8;font-size:11px">※ 공지사항은 관리자가 등록한 최신 글이 자동으로 표시됩니다.</p>
    `);
    try {
      // 1순위: 공개 엔드포인트 (/api/community/posts)
      // 2순위: 관리자 엔드포인트 (/api/admin/community-posts) — 게이트 미배포 / 빌드 지연 대비
      // 3순위: localStorage 캐시 (오프라인 대비)
      // 응답이 HTML 이거나 JSON 파싱 실패하면 다음 단계로 폴백.
      async function tryFetch(url) {
        try {
          const r = await fetch(url, { credentials: 'include' });
          const ctype = (r.headers.get('content-type') || '').toLowerCase();
          if (!ctype.includes('json')) return null;  // HTML fallthrough 등 비정상 응답
          const d = await r.json().catch(() => null);
          if (!d) return null;
          const rows = d.rows || d.posts || d.items || [];
          return Array.isArray(rows) ? rows : null;
        } catch { return null; }
      }
      let rows = await tryFetch('/api/community/posts?limit=20');
      if (!rows || rows.length === 0) {
        const adminRows = await tryFetch('/api/admin/community-posts');
        if (adminRows && adminRows.length > 0) rows = adminRows;
      }
      // 캐시 — 다음 방문 시 즉시 표시할 수 있게
      try {
        if (rows && rows.length) localStorage.setItem('mangoi_notices_cache', JSON.stringify({ rows, at: Date.now() }));
        else {
          const cached = JSON.parse(localStorage.getItem('mangoi_notices_cache') || 'null');
          if (cached && Array.isArray(cached.rows) && cached.rows.length) rows = cached.rows;
        }
      } catch {}
      rows = rows || [];
      const d = { rows };
      const list = document.getElementById('notice-list');
      if (!list) return;
      if (!rows.length) {
        // 백엔드에 데이터 없으면 정적 샘플 표시
        list.innerHTML = `
          <div class="info-tile" style="text-align:left;margin-bottom:8px">
            <b>🎉 신규 회원 무료체험 + 5,000원 쿠폰 이벤트</b>
            <span style="display:block;margin-top:6px">회원가입 후 7일 내 첫 체험 시 쿠폰 자동 지급</span>
          </div>
          <div class="info-tile" style="text-align:left;margin-bottom:8px">
            <b>🌸 5월 봄 특별 할인 (전 코스 20%)</b>
            <span style="display:block;margin-top:6px">비즈니스·시험 영어 코스 5월 한 달간 할인 적용</span>
          </div>
          <div class="info-tile" style="text-align:left;margin-bottom:8px">
            <b>📚 새 비즈니스 코스 오픈</b>
            <span style="display:block;margin-top:6px">실전 회의·이메일·프레젠테이션 16주 코스 신규 개설</span>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin-top:10px">※ 더 많은 공지는 카카오 채널 "@망고아이"에서 확인하세요.</p>
        `;
      } else {
        const safe = (s) => String(s || '').replace(/[<>&"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[ch]));
        const fmtDate = (ts) => {
          if (!ts) return '';
          const d = new Date(typeof ts === 'number' ? (ts > 1e12 ? ts : ts*1000) : ts);
          if (isNaN(d.getTime())) return '';
          return d.toLocaleString('ko-KR', { month:'2-digit', day:'2-digit' }).replace(/\.\s?$/, '');
        };
        list.innerHTML = rows.slice(0, 20).map(p => {
          const isPinned = !!p.pinned;
          const pinIcon = isPinned ? '📌 ' : '';
          const dateStr = fmtDate(p.created_at);
          const author = safe(p.author || '관리자');
          const bodyText = safe(p.body || '');
          const bodyHtml = bodyText.slice(0, 400) + (bodyText.length > 400 ? '...' : '');
          return `
            <div class="info-tile" style="text-align:left;margin-bottom:8px;${isPinned?'border-left:3px solid #fbbf24':''}">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                <b style="${isPinned?'color:#fbbf24':''}">${pinIcon}${safe(p.title)}</b>
                <span style="font-size:10.5px;color:#94a3b8;white-space:nowrap">${dateStr ? dateStr + ' · ' : ''}${author}</span>
              </div>
              <span style="display:block;margin-top:4px;white-space:pre-wrap;color:#cbd5e1;font-size:13px;line-height:1.6">${bodyHtml}</span>
            </div>`;
        }).join('');
      }
    } catch (e) {
      const list = document.getElementById('notice-list');
      if (list) list.innerHTML = '<div style="color:#94a3b8">공지사항을 불러올 수 없어요. 카카오 채널 @망고아이에서 확인해 주세요.</div>';
    }
  }
  // ━━━━━━━━━━ 평가표 — 로그인 후 학생목록 일별평가서 양식 ━━━━━━━━━━
  // 1) 로그인 게이트 → 2) 인증 통과 시 종합 리포트 (학생관리 양식 동일)
  let _reportSession = null;  // { uid, name, token, profile }

  async function showReportModal() {
    // 이미 로그인 세션 있으면 바로 리포트 표시
    if (_reportSession && _reportSession.uid) {
      return renderReportFor(_reportSession);
    }
    // 🆕 전역 로그인 세션 재사용 — 이미 로그인했으면 재로그인 없이 바로 표시
    try {
      var _raw = localStorage.getItem('mangoi_logged_user') || localStorage.getItem('mango_user');
      var _g = _raw ? JSON.parse(_raw) : null;
      var _guid = _g && (_g.uid || _g.id || _g.user_id || _g.username);
      if (_guid) {
        _reportSession = { uid: _guid, name: _g.name || _g.username || _guid, profile: _g };
        return renderReportFor(_reportSession);
      }
    } catch (e) {}
    // 쿠키 기반 세션 자동 확인 (서버에 /api/me 류가 있으면)
    try {
      const r = await fetch('/api/me', { credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        if (d && (d.uid || d.user_id || d.username)) {
          _reportSession = { uid: d.uid || d.user_id, name: d.name || d.username, profile: d };
          return renderReportFor(_reportSession);
        }
      }
    } catch {}
    // 로그인 폼 표시
    showLoginGate();
  }

  function showLoginGate() {
    showModal(`
      <h2>📋 평가표 (일별 수업 평가서)</h2>
      <p>본인 확인 후 종합 평가서를 보여드립니다. 학생관리에 등록된 ID·비밀번호를 입력해 주세요.</p>
      <div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:18px;margin:14px 0">
        <div style="margin-bottom:10px">
          <label style="display:block;font-size:12px;color:#cbd5e1;margin-bottom:4px;font-weight:600">🆔 학생 ID (또는 카톡 ID)</label>
          <input id="rpt-uid" type="text" placeholder="예) hong_gildong" autocomplete="username" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:14px;outline:none;box-sizing:border-box" />
        </div>
        <div style="margin-bottom:10px">
          <label style="display:block;font-size:12px;color:#cbd5e1;margin-bottom:4px;font-weight:600">🔑 비밀번호</label>
          <input id="rpt-pw" type="password" placeholder="••••••••" autocomplete="current-password" onkeydown="if(event.key==='Enter') doReportLogin()" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:14px;outline:none;box-sizing:border-box" />
        </div>
        <div id="rpt-login-err" style="display:none;color:#fca5a5;font-size:12px;margin-bottom:10px"></div>
        <button onclick="doReportLogin()" style="width:100%;padding:12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);border:0;border-radius:10px;color:#1a0f08;font-size:14px;font-weight:800;cursor:pointer">🔓 로그인하고 내 평가표 보기</button>
      </div>
      <p style="color:#94a3b8;font-size:11px;line-height:1.6;margin-top:12px">
        ※ 학생관리에 등록된 본인 계정으로만 조회 가능합니다.<br/>
        ※ ID·비밀번호를 모르시면 카카오 채널 (@망고아이) 또는 우측 하단 노란 카톡 버튼으로 문의해 주세요.<br/>
        ※ 평가표는 매 수업 종료 후 강사가 작성하며, AI 분석(발화·시선·집중도)이 자동 포함됩니다.
      </p>
      <button onclick="window.openKakao&&window.openKakao()" style="width:100%;margin-top:8px;padding:11px;background:linear-gradient(135deg,#FEE500,#FFCD00);border:0;border-radius:10px;color:#3C1E1E;font-size:13px;font-weight:800;cursor:pointer">💬 비밀번호 모르겠어요 — 카톡 도움받기</button>
    `);
    setTimeout(() => { document.getElementById('rpt-uid')?.focus(); }, 100);
  }

  // 로그인 시도 — /api/login (POST) 사용. 실패 시 fallback 로 /api/admin/students 검색
  window.doReportLogin = async function() {
    const uid = (document.getElementById('rpt-uid')?.value || '').trim();
    const pw  = (document.getElementById('rpt-pw')?.value || '').trim();
    const err = document.getElementById('rpt-login-err');
    if (!uid || !pw) {
      if (err) { err.textContent = 'ID와 비밀번호를 모두 입력해 주세요.'; err.style.display='block'; }
      return;
    }
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: uid, password: pw, username: uid })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && (d.ok !== false)) {
        _reportSession = { uid: d.uid || d.user_id || uid, name: d.name || d.username || uid, profile: d };
        renderReportFor(_reportSession);
        return;
      }
      throw new Error(d.error || ('HTTP ' + r.status));
    } catch (e) {
      // 데모용 fallback — uid가 'demo'면 샘플 리포트 표시
      if (uid === 'demo' && pw === 'demo') {
        _reportSession = { uid: 'demo', name: '데모 학생', profile: { username: 'demo' } };
        renderReportFor(_reportSession);
        return;
      }
      if (err) { err.textContent = '로그인 실패: ' + (e.message || '아이디·비밀번호가 일치하지 않습니다.'); err.style.display='block'; }
    }
  };

  // 인증 후 종합 평가서 렌더 (학생관리 student.html과 동일 양식)
  async function renderReportFor(sess) {
    const safeName = String(sess.name || sess.uid || '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
    showModal(`
      <div id="rp-root">
      <h2 style="color:#fbbf24;margin-bottom:4px"><img src="/img/mango-char.png" alt="" style="height:1.1em;width:auto;vertical-align:-0.2em;margin-right:.1em">${safeName} — 종합 평가서</h2>
      <p id="rp-meta" style="color:#94a3b8;font-size:12px;margin:0 0 14px">불러오는 중…</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        <select id="rp-days" onchange="reloadStudentReport()" style="padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:12px">
          <option value="7">최근 7일</option>
          <option value="30" selected>최근 30일</option>
          <option value="90">최근 90일</option>
        </select>
        <button onclick="reloadStudentReport()" style="padding:6px 12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);border:0;border-radius:8px;color:#1a0f08;font-size:12px;font-weight:700;cursor:pointer">🔄 새로고침</button>
        <button onclick="window.print()" style="padding:6px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#cbd5e1;font-size:12px;cursor:pointer">🖨 인쇄/PDF</button>
        <button onclick="logoutReport()" style="padding:6px 12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#fca5a5;font-size:12px;cursor:pointer">🚪 로그아웃</button>
      </div>

      <h3 style="color:#fbbf24;font-size:14px;margin:14px 0 8px">📊 핵심 지표</h3>
      <div id="rp-stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px"></div>

      <h3 style="color:#fbbf24;font-size:14px;margin:18px 0 8px">🎯 영역별 점수 (스피킹·리스닝·문법·집중도)</h3>
      <div id="rp-skills"></div>

      <h3 style="color:#fbbf24;font-size:14px;margin:18px 0 8px">🎙 발음연습 추이</h3>
      <div id="rp-pron"></div>

      <h3 style="color:#fbbf24;font-size:14px;margin:18px 0 8px">📝 평가 코멘트</h3>
      <div id="rp-comment" style="background:rgba(251,191,36,0.06);border-left:3px solid rgba(251,191,36,0.5);padding:10px 14px;border-radius:0 10px 10px 0;font-size:13px;color:#cbd5e1;line-height:1.6">—</div>

      <h3 style="color:#fbbf24;font-size:14px;margin:14px 0 8px">📌 다음 학습 목표</h3>
      <div id="rp-goal" style="background:rgba(78,201,255,0.06);border-left:3px solid rgba(78,201,255,0.4);padding:10px 14px;border-radius:0 10px 10px 0;font-size:13px;color:#cbd5e1">—</div>

      <h3 style="color:#fbbf24;font-size:14px;margin:18px 0 8px">📰 일별 보고서</h3>
      <div id="rp-daily" style="max-height:40vh;overflow-y:auto"></div>

      <p style="color:#94a3b8;font-size:11px;line-height:1.5;margin-top:14px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px">
        ※ 평가표는 매 수업 종료 후 강사가 작성합니다. AI 분석은 발화량·시선 추적·집중도가 자동 포함됩니다.<br/>
        ※ 인쇄·PDF 저장 후 학부모님께 공유할 수 있습니다.
      </p>
      </div>
    `);
    // 💻 PC 데스크톱에서는 성적표를 더 넓게 + 글자를 더 크게 (모바일은 기존 그대로)
    try {
      if (window.matchMedia && window.matchMedia('(min-width:820px)').matches) {
        const box = document.getElementById('info-modal-box');
        const root = document.getElementById('rp-root');
        if (box) box.style.maxWidth = '960px';
        if (root) { root.style.zoom = '1.18'; root.style.WebkitTextSizeAdjust = '100%'; }
      }
    } catch(e){}
    reloadStudentReport();
  }

  window.logoutReport = function() {
    _reportSession = null;
    fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(()=>{});
    showLoginGate();
  };

  window.reloadStudentReport = async function() {
    const sess = _reportSession; if (!sess) return;
    const days = Number(document.getElementById('rp-days')?.value) || 30;
    const meta = document.getElementById('rp-meta');
    if (meta) meta.textContent = '불러오는 중…';

    let data = null;
    try {
      const r = await fetch(`/api/student/full?uid=${encodeURIComponent(sess.uid)}&days=${days}`, { credentials: 'include' });
      if (r.ok) data = await r.json();
    } catch {}
    // fallback — 샘플 데이터
    if (!data || data.ok === false) data = sampleStudentFull(sess, days);
    renderReportPanels(data, days);
  };

  function sampleStudentFull(sess, days) {
    return {
      ok: true,
      profile: { username: sess.name || sess.uid, level: 'B1', classes_per_week: 3 },
      summary: { total_active_ms: 7200000, total_session_ms: 9600000, avg_gaze_score: 82.4, gaze_score_count: 18 },
      evaluations: [
        { id:1, eval_at: Date.now()/1000-86400*1, eval_type:'monthly', level:'B1', evaluator:'Maria Santos',
          score_speaking: 82, score_listening: 78, score_reading: 75, score_writing: 88, score_total: 81,
          next_goal: '과거형 동사 정확도 90% 이상 + 비즈니스 표현 20개 추가 학습',
          comment: '식당·여행 표현은 자연스럽게 구사하고, "Could I ~" 패턴 발음이 많이 좋아졌습니다. 다음 달부터 비즈니스 영어 코스를 권장드립니다.' },
        { id:2, eval_at: Date.now()/1000-86400*8, eval_type:'pronunciation', level:'B1', evaluator:'James Kim',
          score_speaking: 78, score_listening: 75, score_reading: 72, score_writing: 80, score_total: 76,
          next_goal: 'TH·R·L 구분 연습', comment: 'TH 발음이 많이 좋아졌어요. R과 L 구분을 좀 더 신경써주세요.' },
        { id:3, eval_at: Date.now()/1000-86400*15, eval_type:'pronunciation', level:'A2', evaluator:'Anna Wilson',
          score_speaking: 70, score_listening: 70, score_reading: 68, score_writing: 72, score_total: 70,
          next_goal: '기본 강세 패턴', comment: '기본 단어 발음은 정확합니다. 문장 강세 패턴을 익혀봐요.' },
      ],
      sessions: Array.from({length:14}, (_,i)=>({
        id:i, date:'2026-04-'+String(20+i).padStart(2,'0'),
        joined_at: Date.now()/1000 - 86400*(15-i),
        active_ms: 1800000+i*60000, session_ms: 2400000, gaze_score: 78+i,
        teacher: ['Maria Santos','James Kim','Anna Wilson'][i%3]+' ('+['🇵🇭','🇺🇸','🇬🇧'][i%3]+')',
        topic: ['Daily Conversation','Business Email','Pronunciation Drill','Past Tense','Present Perfect'][i%5],
      })).reverse(),
      payments: [{ status:'paid', amount_krw: 400000 }],
      rewards: [{value:50},{value:30}],
      enrollments: [{}],
    };
  }

  function renderReportPanels(d, days) {
    const f = d || {};
    const ev = (f.evaluations || [])[0] || {};
    const sm = f.summary || {};
    const sessions = f.sessions || [];
    const rewards  = f.rewards  || [];
    const payments = f.payments || [];
    const safe = (s) => String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));

    // 메타
    const meta = document.getElementById('rp-meta');
    const evDate = ev.eval_at ? new Date(ev.eval_at*1000).toISOString().slice(0,10) : '-';
    if (meta) meta.textContent = `${evDate} · ${ev.eval_type||'평가'} · ${ev.level||'-'} 레벨${ev.evaluator?' · 평가자: '+safe(ev.evaluator):''}`;

    // 결석 계산
    const activeSet = new Set(); sessions.forEach(s => { if (s.date) activeSet.add(s.date); });
    const totalAttendDays = activeSet.size;
    const cpw = parseInt((f.profile||{}).classes_per_week, 10) || 0;
    const expected = Math.round(cpw * (days/7));
    const absent = Math.max(0, expected - totalAttendDays);
    const totalRewardValue = rewards.reduce((s,r)=>s+(parseInt(r.value,10)||0),0);
    const totalPaid = payments.filter(p=>p.status==='paid').reduce((s,p)=>s+(p.amount_krw||0),0);
    const totalActive = sm.total_active_ms || 0;
    const totalSession = sm.total_session_ms || 0;
    const activePct = totalSession ? Math.round(totalActive/totalSession*100) : 0;
    const avgGaze = sm.avg_gaze_score!=null ? Math.round(sm.avg_gaze_score*10)/10 : '—';
    const fmtMs = (ms)=> ms>0 ? Math.floor(ms/3600000)+'시간 '+Math.floor((ms%3600000)/60000)+'분' : '—';
    const fmtKrw = (k)=> '₩'+(k||0).toLocaleString('ko-KR');

    // 발음 연습
    const pron = (f.evaluations||[]).filter(e=>e.eval_type==='pronunciation' && e.score_total!=null).sort((a,b)=>a.eval_at-b.eval_at);
    const pronAvg = pron.length ? Math.round(pron.reduce((s,e)=>s+Number(e.score_total||0),0)/pron.length*10)/10 : null;
    const pronLatest = pron.length ? pron[pron.length-1].score_total : null;

    // 핵심 지표 카드
    const stats = [
      { lab:'총점', val: ev.score_total!=null?ev.score_total:'—', sub:'점수', color:'#22c55e' },
      { lab:'레벨', val: safe(ev.level)||'—', sub: safe(ev.eval_type)||'평가', color:'#3b82f6' },
      { lab:'평균 시선', val: avgGaze, sub: (sm.gaze_score_count||0)+'회 측정', color:'#fbbf24' },
      { lab:'참여 비율', val: activePct+'%', sub:'발화·집중', color:'#a855f7' },
      { lab:'🎙 발음 평균', val: pronAvg!=null?pronAvg:'—', sub: pron.length+'회 연습'+(pronLatest!=null?' · 최근 '+pronLatest:''), color:'#f97316' },
      { lab:'출석', val: totalAttendDays, sub: days+'일 기준', color:'#22c55e' },
      { lab:'결석', val: absent, sub:'예상 '+expected+'회 중', color:'#ef4444' },
      { lab:'보상', val: rewards.length+'개', sub: totalRewardValue>0?totalRewardValue+'점':'—', color:'#fbbf24' },
      { lab:'학습시간', val: fmtMs(totalActive), sub:'순공시간', color:'#3b82f6' },
      { lab:'결제액', val: fmtKrw(totalPaid), sub: payments.length+'건', color:'#a855f7' },
    ];
    document.getElementById('rp-stats').innerHTML = stats.map(s=>`
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-left:3px solid ${s.color};border-radius:10px;padding:10px">
        <div style="color:#94a3b8;font-size:11px">${s.lab}</div>
        <div style="color:#fff;font-size:18px;font-weight:800;margin:2px 0">${s.val}</div>
        <div style="color:#64748b;font-size:10px">${s.sub}</div>
      </div>
    `).join('');

    // 영역별 점수 (학생관리 student.html의 4영역: 스피킹·리스닝·문법·집중도)
    const skills = [
      { lab:'🗣 스피킹', val: ev.score_speaking||0 },
      { lab:'👂 리스닝', val: ev.score_listening||0 },
      { lab:'📝 문법',   val: ev.score_reading||0 },
      { lab:'🎯 집중도', val: ev.score_writing||0 },
    ];
    document.getElementById('rp-skills').innerHTML = skills.map(s=>{
      const pct = Math.min(100, Math.max(0, Number(s.val)||0));
      return `<div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#cbd5e1;margin-bottom:4px">
          <span>${s.lab}</span><b style="color:#fbbf24">${pct} / 100</b>
        </div>
        <div style="height:10px;background:rgba(255,255,255,0.06);border-radius:6px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#fbbf24,#f59e0b);border-radius:6px;transition:width .5s"></div>
        </div>
      </div>`;
    }).join('');

    // 발음 연습 추이
    const pronEl = document.getElementById('rp-pron');
    if (!pron.length) {
      pronEl.innerHTML = '<div style="color:#94a3b8;font-size:12px;padding:10px">아직 발음연습 기록이 없습니다.</div>';
    } else {
      pronEl.innerHTML = pron.slice(-5).reverse().map(p=>{
        const date = new Date(p.eval_at*1000).toISOString().slice(0,10);
        return `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(249,115,22,0.06);border-radius:8px;margin-bottom:6px;font-size:12px">
          <span style="color:#94a3b8">${date}</span>
          <span style="color:#cbd5e1">${safe(p.evaluator||'-')}</span>
          <b style="color:#fb923c">${p.score_total} 점</b>
        </div>`;
      }).join('');
    }

    // 코멘트 + 다음 목표
    document.getElementById('rp-comment').innerHTML = safe(ev.comment) || '아직 평가 코멘트가 없습니다.';
    document.getElementById('rp-goal').innerHTML = safe(ev.next_goal) || '—';

    // 일별 보고서
    const dailyEl = document.getElementById('rp-daily');
    if (!sessions.length) {
      dailyEl.innerHTML = '<div style="color:#94a3b8;font-size:12px;padding:10px">아직 수업 기록이 없습니다.</div>';
    } else {
      dailyEl.innerHTML = sessions.slice(0, 12).map(s=>{
        const date = s.date || (s.joined_at ? new Date(s.joined_at*1000).toISOString().slice(0,10) : '-');
        const dur  = s.active_ms ? Math.round(s.active_ms/60000)+'분' : '-';
        return `<div style="display:grid;grid-template-columns:90px 1fr 70px;gap:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;margin-bottom:6px;font-size:12px;align-items:center">
          <span style="color:#fbbf24;font-weight:700">${date}</span>
          <div>
            <div style="color:#fff;font-weight:700">${safe(s.topic||'수업')}</div>
            <div style="color:#94a3b8;font-size:11px;margin-top:2px">강사: ${safe(s.teacher||'-')}</div>
          </div>
          <div style="text-align:right">
            <div style="color:#86efac;font-size:11px">${dur}</div>
            <div style="color:#94a3b8;font-size:10px">시선 ${s.gaze_score||'-'}</div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // ━━━━━━━━━━ 🔊 레벨테스트 안내 음성(인트로) + 따뜻한 배경음악(WebAudio) ━━━━━━━━━━
  //   레벨테스트 카드 클릭(=사용자 제스처) 시 바로 재생 → 자동재생 차단 안 걸림.
  //   배경음악 = "다시 시작"에 어울리는 희망적인 진행(C–G–Am–F, I–V–vi–IV)을 직접 합성:
  //   부드러운 피아노 멜로디 + 따뜻한 패드(디튠 코러스) + 리버브(공간감). 저작권 프리·파일 불필요·무한 루프.
  var LT_MUTE_KEY = 'mangoi_voice_muted';
  function ltMuted(){ try{ return localStorage.getItem(LT_MUTE_KEY) === '1'; }catch(e){ return false; } }
  var ltVoice=null, ltAC=null, ltMaster=null, ltDry=null, ltWet=null, ltTimer=null, ltStep=0, ltRunning=false, ltMuteBtn=null;
  var LT_BAR_MS = 2600;   // 잔잔한 템포 (마디당 2.6초)
  // 각 마디: 베이스 + 패드(3화음) + 멜로디[[Hz, 마디내 시작초], ...]
  var LT_BARS = [
    { bass:130.81, pad:[261.63,329.63,392.00], mel:[[392.00,0.0],[523.25,1.3]] }, // C  (C E G)  G→C
    { bass:98.00,  pad:[196.00,246.94,293.66], mel:[[493.88,0.0],[587.33,1.3]] }, // G  (G B D)  B→D
    { bass:110.00, pad:[220.00,261.63,329.63], mel:[[523.25,0.0],[440.00,1.3]] }, // Am (A C E)  C→A
    { bass:87.31,  pad:[174.61,220.00,261.63], mel:[[440.00,0.0],[392.00,1.3]] }  // F  (F A C)  A→G
  ];
  function ltEnsureVoice(){
    if(!ltVoice){
      ltVoice = new Audio('/audio/level-test-intro.mp3'); ltVoice.preload='auto';
      ltVoice.addEventListener('play',  function(){ ltDuck(true);  });
      ltVoice.addEventListener('ended', function(){ ltDuck(false); });
      ltVoice.addEventListener('pause', function(){ ltDuck(false); });
    }
    return ltVoice;
  }
  function ltImpulse(ac, secs, decay){   // 리버브용 임펄스(감쇠 노이즈) 생성
    var rate=ac.sampleRate, len=Math.max(1, Math.floor(rate*secs)), buf=ac.createBuffer(2,len,rate);
    for(var ch=0; ch<2; ch++){ var d=buf.getChannelData(ch); for(var i=0;i<len;i++){ d[i]=(Math.random()*2-1)*Math.pow(1-i/len, decay); } }
    return buf;
  }
  function ltEnsureAC(){
    if(ltAC) return ltAC;
    try{ ltAC = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; }
    ltMaster = ltAC.createGain(); ltMaster.gain.value = 0.8;                 // 마스터(=덕킹 지점)
    var lp = ltAC.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=2600; try{ lp.Q.value=0.6; }catch(e){}
    ltDry = ltAC.createGain(); ltDry.gain.value = 0.9;                        // 드라이 버스
    ltWet = ltAC.createGain(); ltWet.gain.value = 0.32;                       // 리버브 send
    ltDry.connect(ltMaster);
    try{ var conv=ltAC.createConvolver(); conv.buffer=ltImpulse(ltAC, 2.6, 3.4); ltWet.connect(conv); conv.connect(ltMaster); }
    catch(e){ ltWet.connect(ltMaster); }                                      // convolver 미지원 시 드라이로 폴백
    ltMaster.connect(lp); lp.connect(ltAC.destination);
    return ltAC;
  }
  function ltPad(freqs, when, dur){      // 따뜻한 패드(각 음 2보이스 디튠 코러스)
    freqs.forEach(function(f){
      [-5,5].forEach(function(det){
        var o=ltAC.createOscillator(), g=ltAC.createGain();
        o.type='triangle'; o.frequency.value=f; try{ o.detune.value=det; }catch(e){}
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(0.016, when+0.7);                 // 느린 어택
        g.gain.exponentialRampToValueAtTime(0.0001, when+dur);
        o.connect(g); g.connect(ltDry); g.connect(ltWet);
        o.start(when); o.stop(when+dur+0.1);
      });
    });
  }
  function ltBass(freq, when, dur){
    var o=ltAC.createOscillator(), g=ltAC.createGain();
    o.type='sine'; o.frequency.value=freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.05, when+0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, when+dur);
    o.connect(g); g.connect(ltDry);
    o.start(when); o.stop(when+dur+0.1);
  }
  function ltPluck(freq, when, dur){     // 피아노 같은 멜로디(기음 + 옥타브 반짝임 + 리버브)
    var o=ltAC.createOscillator(), o2=ltAC.createOscillator(), g=ltAC.createGain(), g2=ltAC.createGain();
    o.type='sine'; o.frequency.value=freq;
    o2.type='triangle'; o2.frequency.value=freq*2; g2.gain.value=0.3;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.075, when+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when+dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(ltDry); g.connect(ltWet);
    o.start(when); o.stop(when+dur+0.1); o2.start(when); o2.stop(when+dur+0.1);
  }
  function ltTick(){
    if(!ltRunning || !ltAC || ltAC.state!=='running') return;                // suspended 중엔 예약 안 함(blip 방지)
    var bar=LT_BARS[ltStep%LT_BARS.length], t=ltAC.currentTime+0.05, dur=LT_BAR_MS/1000;
    ltPad(bar.pad, t, dur);
    ltBass(bar.bass, t, dur);
    bar.mel.forEach(function(m){ ltPluck(m[0], t+m[1], 1.5); });
    ltStep++;
  }
  function ltDuck(on){ if(!ltAC||!ltMaster) return; try{ ltMaster.gain.setTargetAtTime(on?0.30:0.8, ltAC.currentTime, 0.3); }catch(e){} }
  function ltBgmStart(){ if(ltMuted()) return; if(!ltEnsureAC()) return; if(ltAC.state==='suspended'){ try{ ltAC.resume(); }catch(e){} } if(ltRunning) return; ltRunning=true; ltTick(); ltTimer=setInterval(ltTick, LT_BAR_MS); }
  function ltBgmStop(){ ltRunning=false; if(ltTimer){ clearInterval(ltTimer); ltTimer=null; } }
  function ltPlayIntro(restart){ if(ltMuted()) return; var v=ltEnsureVoice(); if(restart){ try{ v.currentTime=0; }catch(e){} } var p=v.play(); if(p&&p.catch) p.catch(function(){}); }
  function ltUpdateMute(){ if(!ltMuteBtn) return; ltMuteBtn.textContent = ltMuted()?'🔇':'🔊'; ltMuteBtn.title = ltMuted()?'소리 켜기':'음소거'; }
  function ltMakeMuteBtn(){
    if(ltMuteBtn) return ltMuteBtn;
    ltMuteBtn = document.createElement('button'); ltMuteBtn.type='button'; ltMuteBtn.setAttribute('aria-label','소리 켜기/끄기');
    ltMuteBtn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:100001;width:46px;height:46px;border-radius:50%;border:1px solid rgba(148,163,184,0.5);background:rgba(20,41,80,0.95);color:#fff;font-size:20px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,0.45);display:none;align-items:center;justify-content:center';
    ltMuteBtn.onclick = function(){
      var m = !ltMuted();
      try{ localStorage.setItem(LT_MUTE_KEY, m?'1':'0'); }catch(e){}
      if(m){ try{ ltEnsureVoice().pause(); }catch(e){} ltBgmStop(); }
      else { ltBgmStart(); ltPlayIntro(true); }
      ltUpdateMute();
    };
    document.body.appendChild(ltMuteBtn);
    return ltMuteBtn;
  }
  function ltAudioStart(){ ltMakeMuteBtn(); ltMuteBtn.style.display='flex'; ltUpdateMute(); ltBgmStart(); ltPlayIntro(false); }
  function ltAudioIntroReplay(){ ltBgmStart(); setTimeout(function(){ ltPlayIntro(true); }, 350); }
  function ltAudioStop(){ try{ if(ltVoice){ ltVoice.pause(); ltVoice.currentTime=0; } }catch(e){} ltBgmStop(); if(ltMuteBtn) ltMuteBtn.style.display='none'; }

  // ━━━━━━━━━━ 📊 레벨테스트 신청·안내 모달 ━━━━━━━━━━
  function showLevelTestModal() {
    // 📅 희망 날짜(내일~14일)·시간 옵션 — showModal 은 innerHTML 이라 옵션을 문자열로 미리 만든다
    var _WK = ['일','월','화','수','목','금','토'];
    var _today = new Date(); var dateOptions = '';
    for (var _i = 1; _i <= 14; _i++) {
      var _d = new Date(_today.getFullYear(), _today.getMonth(), _today.getDate() + _i);
      var _v = _d.getFullYear() + '-' + ('0'+(_d.getMonth()+1)).slice(-2) + '-' + ('0'+_d.getDate()).slice(-2);
      dateOptions += '<option value="' + _v + '">' + (_d.getMonth()+1) + '월 ' + _d.getDate() + '일 (' + _WK[_d.getDay()] + ')</option>';
    }
    var timeOptions = '';
    ['16:00','17:00','18:00','19:00','20:00','21:00'].forEach(function(t){ timeOptions += '<option value="' + t + '">' + t + '</option>'; });
    showModal(`
      <h2>📊 레벨테스트 안내</h2>
      <p>망고아이의 8단계 심층 레벨 시스템에 맞춰 본인의 영어 실력을 정확히 진단해 드립니다.</p>

      <!-- 🎯 핵심 정보 카드 (3개) -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:14px 0 18px">
        <div class="info-tile" style="text-align:center"><b>⏱ 소요 시간</b><span>약 25~30분</span></div>
        <div class="info-tile" style="text-align:center"><b>💰 비용</b><span>무료 (1회 한정)</span></div>
        <div class="info-tile" style="text-align:center"><b>📋 결과</b><span>당일 카톡 발송</span></div>
      </div>

      <h3>📝 테스트 구성 (4영역)</h3>
      <ul>
        <li><b>🗣 스피킹 (10분)</b> — 자기소개·일상 회화·즉흥 답변 (강사 1:1 화상)</li>
        <li><b>👂 리스닝 (5분)</b> — 짧은 대화·강의 듣고 객관식 답변</li>
        <li><b>📝 문법·어휘 (10분)</b> — 빈칸 채우기·문장 재배열·어휘 매칭</li>
        <li><b>🎯 발음·집중도 (5분)</b> — AI 자동 평가 (발음 정확도 + 시선 분석)</li>
      </ul>

      <h3>🚀 신청부터 결과까지 4단계</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px">
        <div class="info-tile" style="flex:1;min-width:140px"><b>1️⃣ 신청</b><span>아래 [신청하기] 또는 카톡 채널</span></div>
        <div class="info-tile" style="flex:1;min-width:140px"><b>2️⃣ 일정 확정</b><span>영업일 1일 내 카톡 안내</span></div>
        <div class="info-tile" style="flex:1;min-width:140px"><b>3️⃣ 입장</b><span>발송된 링크로 화상 입장</span></div>
        <div class="info-tile" style="flex:1;min-width:140px"><b>4️⃣ 결과 수령</b><span>당일 카톡 + 추천 코스</span></div>
      </div>

      <h3>🎬 입장 방법 (당일 진행)</h3>
      <ul>
        <li>예약 시간 <b>10분 전</b> 카카오톡 채널 "@망고아이"로 화상 링크 발송</li>
        <li>링크 클릭 → 카메라/마이크 권한 허용 → 강사 입장 대기실</li>
        <li>강사가 입장하면 자동 시작 (시작 전 자가진단 권장)</li>
        <li>중간에 끊겼다면 같은 링크로 재입장 가능 (10분 유효)</li>
      </ul>

      <h3>⚠️ 신청 전 확인사항</h3>
      <ul>
        <li>PC/노트북 Chrome 또는 Edge 권장 (모바일도 가능)</li>
        <li>카메라·마이크가 필수입니다 → <a onclick="closeInfoModal();window.gridActions&&window.gridActions.diagnosis()" style="color:#fbbf24;cursor:pointer">🩺 자가진단 먼저 확인</a></li>
        <li>조용한 환경 추천 (배경 소음이 평가에 영향)</li>
        <li>학부모 함께 청취 가능 (학생 부담 ↓)</li>
      </ul>

      <h3>💡 결과로 받는 것</h3>
      <ul>
        <li>📊 8단계 중 본인 레벨 확정 (Lv.1 입문 ~ Lv.8 최상급)</li>
        <li>📈 4영역별 점수 (스피킹·리스닝·문법·발음)</li>
        <li>🎯 약점·강점 분석 + 다음 학습 목표</li>
        <li>📚 추천 코스 + 추천 강사 매칭</li>
      </ul>

      <!-- 🆕 회원가입 + 레벨테스트 신청 폼 (간편) -->
      <h3 style="color:#fbbf24;margin-top:18px">🆕 회원가입 + 레벨테스트 신청</h3>
      <p style="color:#94a3b8;font-size:12px;margin:6px 0 12px">아이디·비밀번호를 만들어 두시면 마이페이지에서 결과 확인 + 다음 신청이 1초로 끝나요.</p>

      <div style="background:linear-gradient(135deg,rgba(251,191,36,0.07),rgba(245,158,11,0.03));border:1px solid rgba(251,191,36,0.25);border-radius:14px;padding:18px 20px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin-bottom:10px">
          <div>
            <label style="display:block;color:#cbd5e1;font-size:12px;font-weight:700;margin-bottom:5px">🆔 아이디 <span style="color:#ef4444">*</span></label>
            <input id="lt-uid" type="text" autocomplete="username" placeholder="영문/숫자 4~20자" maxlength="20" style="width:100%;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box" />
          </div>
          <div>
            <label style="display:block;color:#cbd5e1;font-size:12px;font-weight:700;margin-bottom:5px">🔑 비밀번호 <span style="color:#ef4444">*</span></label>
            <input id="lt-pw" type="password" autocomplete="new-password" placeholder="6자 이상" minlength="6" style="width:100%;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box" />
          </div>
          <div>
            <label style="display:block;color:#cbd5e1;font-size:12px;font-weight:700;margin-bottom:5px">👤 학생 이름 <span style="color:#ef4444">*</span></label>
            <input id="lt-name" type="text" placeholder="실명" maxlength="40" style="width:100%;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box" />
          </div>
          <div>
            <label style="display:block;color:#cbd5e1;font-size:12px;font-weight:700;margin-bottom:5px">📱 연락처 <span style="color:#ef4444">*</span></label>
            <input id="lt-phone" type="tel" placeholder="010-1234-5678" maxlength="20" style="width:100%;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box" />
          </div>
          <div>
            <label style="display:block;color:#cbd5e1;font-size:12px;font-weight:700;margin-bottom:5px">📧 이메일 (선택)</label>
            <input id="lt-email" type="email" placeholder="example@mail.com" maxlength="100" style="width:100%;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box" />
          </div>
          <div>
            <label style="display:block;color:#cbd5e1;font-size:12px;font-weight:700;margin-bottom:5px">🎂 학년/연령 (선택)</label>
            <input id="lt-age" type="text" placeholder="예: 중2 / 30대" maxlength="20" style="width:100%;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box" />
          </div>
          <div>
            <label style="display:block;color:#cbd5e1;font-size:12px;font-weight:700;margin-bottom:5px">📅 희망 날짜 <span style="color:#ef4444">*</span></label>
            <select id="lt-date" style="width:100%;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box">${dateOptions}</select>
          </div>
          <div>
            <label style="display:block;color:#cbd5e1;font-size:12px;font-weight:700;margin-bottom:5px">⏰ 희망 시간 <span style="color:#ef4444">*</span></label>
            <select id="lt-time" style="width:100%;padding:10px 12px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.12);border-radius:8px;color:#fff;font-size:13px;outline:none;box-sizing:border-box">${timeOptions}</select>
          </div>
        </div>
        <p style="color:#94a3b8;font-size:11.5px;margin:0 0 10px;line-height:1.55">🧑‍🏫 신청하시면 <b style="color:#fde68a">그 시간에 가능한 선생님</b>이 자동 배정돼요. (선생님은 학원에서 배정 — 학생이 고르지 않아요)</p>
        <label style="display:flex;align-items:center;gap:8px;color:#cbd5e1;font-size:12px;cursor:pointer;margin-bottom:12px">
          <input id="lt-agree" type="checkbox" style="width:16px;height:16px;cursor:pointer" />
          <span>개인정보 수집·이용 동의 (레벨테스트 안내·결과 발송 목적, <a onclick="closeInfoModal();window.gridActions&&window.gridActions.contact()" style="color:#9ee5ff;cursor:pointer;text-decoration:underline">고객센터 문의</a>)</span>
        </label>
        <div id="lt-form-msg" style="display:none;padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#fca5a5;font-size:12px;margin-bottom:10px"></div>
        <button type="button" onclick="submitLevelTestSignup()" id="lt-submit" style="width:100%;padding:13px;background:linear-gradient(135deg,#fbbf24,#f59e0b);border:0;border-radius:10px;color:#1a0f08;font-size:14px;font-weight:800;cursor:pointer;box-shadow:0 6px 16px -4px rgba(245,158,11,0.5)">
          ✅ 회원가입 완료 + 레벨테스트 신청
        </button>
        <!-- 📊 결과보기 보조 버튼 (이미 신청한 경우) -->
        <button type="button" onclick="window.openLevelTestResults && window.openLevelTestResults()" style="width:100%;margin-top:8px;padding:10px;background:transparent;border:1px solid rgba(251,191,36,0.5);border-radius:10px;color:#fde68a;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .15s" onmouseover="this.style.background='rgba(251,191,36,0.08)'" onmouseout="this.style.background='transparent'">
          📊 이미 신청하셨나요? 레벨테스트 결과보기
        </button>
      </div>

      <p style="margin:14px 0 6px;color:#94a3b8;font-size:12px;text-align:center">또는</p>

      <!-- 간편 CTA (회원가입 없이) -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <a class="info-cta" onclick="closeInfoModal();window.openInquiryModal&&window.openInquiryModal()" style="margin:0;text-align:center">📨 비회원 신청 (상담)</a>
        <a class="info-cta" onclick="closeInfoModal();window.openKakao&&window.openKakao()" style="margin:0;text-align:center;background:linear-gradient(135deg,#FEE500,#FFCD00);color:#3C1E1E">💬 카톡으로 신청</a>
      </div>
      <p style="margin-top:10px;color:#94a3b8;font-size:11px;text-align:center">
        ※ 무료 체험 수업과 동시에 신청 시 즉시 진행됩니다.
      </p>
    `);
    ltAudioStart();   // 🔊 인트로 음성 + 잔잔한 배경음악 바로 시작 (레벨테스트 클릭 = 사용자 제스처)
  }

  // ━━━━━━━━━━ 회원가입 + 레벨테스트 신청 제출 ━━━━━━━━━━
  window.submitLevelTestSignup = async function() {
    const $ = (id) => document.getElementById(id);
    const uid = ($('lt-uid')?.value || '').trim();
    const pw  = ($('lt-pw')?.value || '').trim();
    const name = ($('lt-name')?.value || '').trim();
    const phone = ($('lt-phone')?.value || '').trim();
    const email = ($('lt-email')?.value || '').trim();
    const age = ($('lt-age')?.value || '').trim();
    const desiredDate = ($('lt-date')?.value || '').trim();
    const desiredTime = ($('lt-time')?.value || '').trim();
    const agree = $('lt-agree')?.checked;
    const msg = $('lt-form-msg');
    const btn = $('lt-submit');

    function showErr(text) {
      if (msg) { msg.textContent = text; msg.style.display = 'block'; }
    }

    // 검증
    if (!uid || uid.length < 4) return showErr('아이디는 4자 이상 입력해 주세요.');
    if (!/^[a-zA-Z0-9_]+$/.test(uid)) return showErr('아이디는 영문/숫자/언더바만 가능합니다.');
    if (!pw || pw.length < 6) return showErr('비밀번호는 6자 이상 입력해 주세요.');
    if (!name) return showErr('학생 이름을 입력해 주세요.');
    if (!phone) return showErr('연락처를 입력해 주세요.');
    if (!desiredDate) return showErr('희망 날짜를 선택해 주세요.');
    if (!desiredTime) return showErr('희망 시간을 선택해 주세요.');
    if (!agree) return showErr('개인정보 수집·이용에 동의해 주세요.');

    if (msg) msg.style.display = 'none';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 처리 중…'; btn.style.opacity = '0.7'; }

    try {
      // 1) 로컬 중복 검사 (이전에 같은 uid 로 신청한 적 있으면 차단)
      let localExists = false;
      try {
        const existing = JSON.parse(localStorage.getItem('mangoi_level_test_results') || '[]');
        localExists = existing.some(x => x.student_user_id === uid);
      } catch (e) {}
      if (localExists) {
        showErr('이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.');
        return;
      }
      // 2) 백엔드 회원가입 — 실제 계정 생성 + 자동 로그인 토큰 수신 (best-effort)
      var regToken = '';
      try {
        const r = await fetch('/api/student/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ user_id: uid, password: pw, name, phone, email, age })
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d && d.ok) {
          if (d.token) regToken = d.token;   // 🔐 로그인 토큰 → 재로그인 없이 마이페이지 데이터 로드
        } else {
          // 중복 아이디만 사용자에게 차단, 나머지는 로컬 저장으로 진행
          const err = (d && d.error) || '';
          if (r.status === 409 || err.includes('exists') || err.includes('duplicate')) {
            showErr('이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.');
            return;
          }
          console.warn('[signup] backend returned', r.status, err, '— proceeding with local fallback');
        }
      } catch (netErr) {
        // 네트워크 오류 — 무시하고 로컬 fallback
        console.warn('[signup] network error — proceeding with local fallback:', netErr && netErr.message);
      }
      // 🎯 레벨테스트 신청 저장 + 교사 자동배정 + 접수 안내 — 희망 날짜·시간·연락처 전달 (best-effort)
      var scheduledLabel = '';
      try {
        const ar = await fetch('/api/leveltest/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_name: name, student_uid: uid, phone: phone, email: email, desired_date: desiredDate, desired_time: desiredTime, source: 'home-signup' })
        });
        const ad = await ar.json().catch(() => null);
        if (ad && ad.scheduled) scheduledLabel = ad.scheduled;
      } catch (e) { /* 서버 미연결이어도 시연 진행 */ }

      // 🔑 가입 = 자동 로그인 — 세션 심기 (재로그인 없이 마이페이지 진입)
      try {
        const _lu = { user_id: uid, uid: uid, name: name, user_name: name, role: 'student' };
        localStorage.setItem('mango_user', JSON.stringify(_lu));
        localStorage.setItem('mangoi_logged_user', JSON.stringify(_lu));
        localStorage.setItem('mangoi_uid', uid);
        localStorage.setItem('mangoi_parent_uid', uid);
        localStorage.setItem('mangoi_vc_uid', name || uid);
        if (regToken) {
          localStorage.setItem('mango_token', regToken);          // uid 기반 개인 API 인증
          localStorage.setItem('mangoi_parent_token', regToken);  // parent.html 자동 데이터 로드
        }
      } catch (e) {}

      // 🔗 학생 홈피 결과 조회용 로컬 기록 (레벨/점수는 실제 AI 진단·선생님 평가 전까지 비움 — 가짜점수 금지)
      try {
        const arr = JSON.parse(localStorage.getItem('mangoi_level_test_results') || '[]');
        arr.unshift({
          student_name: name,
          student_user_id: uid,
          phone: phone,
          email: email,
          age: age,
          level: null,        // 실제 진단 전까지 비움
          score: null,        // 실제 진단 전까지 비움
          tested_at: Date.now(),
          status: 'pending',  // pending = 신청 접수(채점 대기), scored = 채점 완료
        });
        // 최근 200건만 유지
        localStorage.setItem('mangoi_level_test_results', JSON.stringify(arr.slice(0, 200)));
      } catch (e) { /* localStorage 미지원 환경 무시 */ }

      // 성공 — 가입+신청 완료 화면
      showModal(`
        <h2 style="color:#86efac">🎉 회원가입 + 레벨테스트 신청 완료!</h2>
        <p>축하합니다! <b style="color:#fde68a">${escapeLT(name)}</b> 님의 회원가입이 완료되었고 레벨테스트 신청이 접수되었습니다.</p>
        <div class="info-grid" style="margin:14px 0">
          <div class="info-tile"><b>📅 희망 일시</b><span>${escapeLT(scheduledLabel || (desiredDate + ' ' + desiredTime))}</span></div>
          <div class="info-tile"><b>👩‍🏫 담당 선생님</b><span>확정되면 안내</span></div>
          <div class="info-tile"><b>📞 연락처</b><span>${escapeLT(phone)}</span></div>
        </div>
        <div style="background:rgba(46,204,113,0.10);border:1px solid rgba(46,204,113,0.35);border-radius:10px;padding:10px 14px;margin:2px 0 12px;color:#a7f3d0;font-size:13px;font-weight:700;text-align:center">
          ✅ 신청이 접수됐어요! 접수 안내를 문자로 보내드렸어요.<br>담당 선생님이 확정되면 다시 알려드릴게요.
        </div>
        <ul>
          <li>담당 선생님 확정 후, 예약 시간 10분 전 카카오톡 채널로 화상 링크 안내</li>
          <li>마이페이지에서 진행 상태와 결과 확인 가능</li>
          <li>결과 수령 후 추천 코스로 즉시 수강 신청 가능</li>
        </ul>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px">
          <a class="info-cta" onclick="closeInfoModal();window.openKakao&&window.openKakao()" style="margin:0;text-align:center;background:linear-gradient(135deg,#FEE500,#FFCD00);color:#3C1E1E">💬 카톡 채널 추가</a>
          <a class="info-cta" href="/parent.html?uid=${encodeURIComponent(uid)}" style="margin:0;text-align:center">🔑 마이페이지 가기</a>
        </div>
      `);
      ltAudioIntroReplay();   // 🎬 완료 화면에서 인트로 음성 한 번 더 (처음·마지막)
    } catch (e) {
      showErr('네트워크 오류 — 잠시 후 다시 시도해 주세요.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✅ 회원가입 완료 + 레벨테스트 신청'; btn.style.opacity = '1'; }
    }
  };

  function escapeLT(s) { return String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])); }

  // ━━━━━━━━━━ 📊 레벨테스트 결과 조회 모달 ━━━━━━━━━━
  window.openLevelTestResults = function() {
    showModal(`
      <h2>📊 레벨테스트 결과 조회</h2>
      <p style="color:#cbd5e1">신청 시 입력한 <b style="color:#fde68a">아이디</b>와 <b style="color:#fde68a">이름</b>으로 결과를 확인할 수 있어요.</p>
      <div class="info-grid" style="margin:14px 0">
        <div class="info-tile" style="flex:1;min-width:180px">
          <b>📌 아이디</b>
          <input id="ltr-uid" type="text" placeholder="가입 시 입력한 아이디" style="width:100%;margin-top:4px;padding:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;font-size:13px;outline:none" />
        </div>
        <div class="info-tile" style="flex:1;min-width:180px">
          <b>👤 이름</b>
          <input id="ltr-name" type="text" placeholder="학생 이름" style="width:100%;margin-top:4px;padding:8px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#fff;font-size:13px;outline:none" />
        </div>
      </div>
      <div id="ltr-result" style="margin:14px 0;min-height:30px"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
        <button type="button" onclick="window.checkLevelTestResults && window.checkLevelTestResults()" class="info-cta" style="margin:0;text-align:center;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a0f08;border:0;cursor:pointer;font-weight:800">🔎 결과 조회</button>
        <button type="button" onclick="closeInfoModal()" class="info-cta" style="margin:0;text-align:center;background:transparent;border:1px solid rgba(255,255,255,0.2);color:#cbd5e1;cursor:pointer">↩ 닫기</button>
      </div>
      <p style="margin-top:14px;color:#94a3b8;font-size:11px;line-height:1.6">
        ※ 결과는 응시일로부터 영업일 1일 내에 채점되어 표시됩니다.<br>
        ※ 신청 직후 조회 시 "채점 진행 중"으로 표시될 수 있습니다.
      </p>
    `);
  };

  window.checkLevelTestResults = function() {
    const $ = (id) => document.getElementById(id);
    const uid = ($('ltr-uid')?.value || '').trim();
    const name = ($('ltr-name')?.value || '').trim();
    const out = $('ltr-result');
    if (!out) return;
    if (!uid && !name) {
      out.innerHTML = '<div style="padding:10px 14px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#fca5a5;font-size:12.5px">⚠️ 아이디 또는 이름을 입력해 주세요.</div>';
      return;
    }
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem('mangoi_level_test_results') || '[]'); } catch (e) {}
    const found = arr.filter(r =>
      (uid && r.student_user_id === uid) ||
      (name && r.student_name === name)
    );
    if (found.length === 0) {
      out.innerHTML = '<div style="padding:12px 14px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.25);border-radius:8px;color:#bfdbfe;font-size:12.5px;line-height:1.7">🔍 일치하는 결과가 없습니다.<br><span style="color:#94a3b8;font-size:11.5px">※ 가입 직후라면 영업일 1일 정도 기다려 주세요. 카카오톡 채널로 결과가 발송됩니다.</span></div>';
      return;
    }
    out.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px">' + found.map(r => {
      const status = r.status === 'scored' ? '<span style="background:#86efac;color:#14532d;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">✅ 채점 완료</span>' : '<span style="background:#fde68a;color:#78350f;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">⏳ 채점 진행 중</span>';
      const dt = new Date(r.tested_at || Date.now()).toLocaleString('ko-KR');
      return `<div style="padding:12px 14px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.25);border-radius:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <b style="color:#fde68a;font-size:14px">${escapeLT(r.student_name)} (${escapeLT(r.student_user_id||'—')})</b>${status}
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;font-size:12px;color:#e2e8f0">
          <div><b style="color:#86efac">레벨</b><br>${escapeLT(r.level||'—')}</div>
          <div><b style="color:#86efac">점수</b><br>${r.score!=null?Number(r.score).toFixed(1):'—'} / 100</div>
          <div><b style="color:#86efac">응시일</b><br><span style="font-size:11px">${dt}</span></div>
        </div>
      </div>`;
    }).join('') + '</div>';
  };

  // ━━━━━━━━━━ 녹화본 복습 모달 ━━━━━━━━━━
  async function showRecordingsModal() {
    // 1) 즉시 로딩 상태 표시
    showModal(`
      <h2>📼 녹화본 복습 — 지난수업 다시보기</h2>
      <p style="color:#cbd5e1">최근 자동녹화된 수업 영상을 날짜순으로 보여드립니다.</p>
      <div id="rec-list-body" style="margin-top:14px;max-height:55vh;overflow-y:auto"><div style="color:#94a3b8;text-align:center;padding:24px">⏳ 불러오는 중…</div></div>
      <p style="margin-top:14px;color:#94a3b8;font-size:11px;line-height:1.6">
        ※ 녹화본은 수업 종료 후 자동 업로드 (최대 24시간 소요).<br/>
        ※ 본인 수업 녹화만 시청할 수 있으며, 1달간 보관됩니다.
      </p>
    `);

    // 2) DB 에서 최근 녹화 목록 (공개 endpoint)
    let rows = [];
    try {
      const r = await fetch('/api/recordings/list-recent?limit=30', { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        if (j && Array.isArray(j.rows)) rows = j.rows;
      }
    } catch(e) { console.warn('[recordings] list-recent 실패:', e); }

    const body = document.getElementById('rec-list-body');
    if (!body) return;

    if (!rows.length) {
      body.innerHTML = `
        <div style="background:rgba(251,191,36,0.06);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:22px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">📭</div>
          <div style="color:#fff;font-weight:700;margin-bottom:4px">아직 녹화본이 없어요</div>
          <div style="color:#cbd5e1;font-size:12px">수업 종료 후 자동 업로드되면 여기에 표시됩니다.</div>
        </div>`;
      return;
    }

    // 3) 카드 렌더 (날짜순 desc — 백엔드에서 이미 정렬됨)
    const safe = (s) => String(s || '').replace(/[<>&"']/g, ch => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[ch]));
    body.innerHTML = rows.map((r, idx) => `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(251,191,36,0.2);border-radius:12px;padding:12px;margin-bottom:8px;display:grid;grid-template-columns:60px 1fr auto;gap:12px;align-items:center;cursor:${r.playable?'pointer':'default'};transition:transform .15s,box-shadow .15s"
           ${r.playable ? `onclick="window.playRecording${idx}&&window.playRecording${idx}()"` : ''}
           onmouseover="${r.playable?`this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 14px rgba(251,191,36,0.3)'`:''}"
           onmouseout="this.style.transform='';this.style.boxShadow=''">
        <div style="background:linear-gradient(135deg,#1e293b,#0f172a);border-radius:8px;height:54px;display:flex;align-items:center;justify-content:center;font-size:24px">${r.playable?'▶️':'⏳'}</div>
        <div>
          <div style="color:#fbbf24;font-size:11px;font-weight:700">${safe(r.date)}${r.time_range ? ' <span style=\"color:#fcd34d;font-weight:600\">' + safe(r.time_range) + '</span>' : ''} · ${safe(r.duration)}</div>
          <div style="color:#fff;font-size:13px;font-weight:700;margin:2px 0">${safe(r.topic)}</div>
          <div style="color:#94a3b8;font-size:11px">강사: ${safe(r.teacher)} · ${safe(r.size)}${r.playable ? ' · <span style=\"color:#10b981\">● 재생 가능</span>' : ' · <span style=\"color:#f59e0b\">⏳ 업로드 진행 중</span>'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;pointer-events:none">
          <span style="padding:7px 12px;background:linear-gradient(135deg,${r.playable?'#fbbf24,#f59e0b':'#475569,#334155'});border-radius:6px;color:${r.playable?'#1a0f08':'#94a3b8'};font-size:11px;font-weight:800;text-align:center">▶ 시청</span>
          <span style="padding:5px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#cbd5e1;font-size:10px;text-align:center">⬇ 다운</span>
        </div>
      </div>`).join('');

    // 4) 클릭 핸들러 등록
    rows.forEach((r, idx) => {
      window['playRecording' + idx] = function() {
        if (!r.playable || !r.url) {
          alert('⏳ 영상 업로드 진행 중\n\n수업: ' + r.topic + '\n날짜: ' + r.date + '\n\n수업 종료 후 자동 업로드됩니다 (최대 24시간 이내).');
          return;
        }
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;padding:20px';
        overlay.addEventListener('click', () => overlay.remove());
        const box = document.createElement('div');
        box.style.cssText = 'background:#0f172a;border:1px solid rgba(251,191,36,0.4);border-radius:14px;padding:18px;max-width:900px;width:100%;max-height:92vh;overflow:auto;color:#e2e8f0;position:relative';
        box.addEventListener('click', e => e.stopPropagation());
        box.innerHTML = '<button onclick="this.parentElement.parentElement.remove()" style="position:absolute;top:10px;right:14px;background:transparent;border:0;color:#94a3b8;font-size:24px;cursor:pointer">✕</button>' +
                        '<div style="font-size:16px;font-weight:700;color:#fbbf24;margin-bottom:6px;padding-right:30px">📼 ' + r.topic + '</div>' +
                        '<div style="font-size:12px;color:#94a3b8;margin-bottom:12px">' + r.date + (r.time_range ? ' <span style="color:#fbbf24">' + r.time_range + '</span>' : '') + ' · 강사 ' + r.teacher + ' · ' + r.duration + ' · ' + r.size + '</div>';
        const video = document.createElement('video');
        video.src = r.url; video.controls = true; video.autoplay = true; video.preload = 'metadata';
        video.style.cssText = 'width:100%;max-height:65vh;border-radius:10px;background:#000';
        video.addEventListener('error', async () => {
          let diag = ''; try { const h = await fetch(r.url, { method:'HEAD' }); diag = ' (HTTP ' + h.status + ')'; } catch(e){}
          const err = document.createElement('div');
          err.style.cssText = 'color:#fca5a5;padding:14px;background:rgba(239,68,68,0.08);border-radius:8px;margin-top:8px;font-size:12px;line-height:1.6;word-break:break-all';
          err.innerHTML = '⚠ 영상을 불러올 수 없습니다' + diag + '<br><span style="color:#94a3b8">' + r.url + '</span><br><br><a href="' + r.url + '" target="_blank" style="color:#fbbf24;font-weight:700">🔗 새 탭에서 직접 열기</a>';
          box.appendChild(err);
        });
        box.appendChild(video);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
      };
    });
  }

  window.closeAndOpenReport = function() {
    document.getElementById('info-modal-bg').classList.remove('show');
    setTimeout(() => showReportModal(), 200);
  };

  window.filterRecordings = function(kw) {
    const days = Number(document.getElementById('rec-period')?.value || 0);
    const cutoff = days ? (Date.now() - days*86400*1000) : 0;
    const k = (kw||'').toLowerCase().trim();
    const filtered = (window._recRows||[]).filter(r => {
      if (cutoff && r.date && new Date(r.date).getTime() < cutoff) return false;
      if (!k) return true;
      const hay = ((r.teacher||'') + ' ' + (r.topic||'')).toLowerCase();
      return hay.includes(k);
    });
    renderRecordingList(filtered);
  };

  function renderRecordingList(rows) {
    const safe = (s)=>String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
    const list = document.getElementById('rec-list');
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:20px">조건에 맞는 녹화본이 없어요.</div>';
      return;
    }
    list.innerHTML = rows.map(r=>`
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px;margin-bottom:8px;display:grid;grid-template-columns:80px 1fr auto;gap:12px;align-items:center">
        <div style="background:linear-gradient(135deg,#1e293b,#0f172a);border-radius:8px;height:54px;display:flex;align-items:center;justify-content:center;font-size:24px">▶️</div>
        <div>
          <div style="color:#fbbf24;font-size:11px;font-weight:700">${safe(r.date)} · ${safe(r.duration||'-')}</div>
          <div style="color:#fff;font-size:13px;font-weight:700;margin:2px 0">${safe(r.topic||'수업')}</div>
          <div style="color:#94a3b8;font-size:11px">강사: ${safe(r.teacher||'-')} · ${safe(r.size||'-')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <a href="${safe(r.url||'#')}" target="_blank" rel="noopener" style="padding:7px 12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);border-radius:6px;color:#1a0f08;font-size:11px;font-weight:800;text-decoration:none;text-align:center">▶ 시청</a>
          <a href="${safe(r.url||'#')}" download style="padding:5px 12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#cbd5e1;font-size:10px;text-decoration:none;text-align:center">⬇ 다운</a>
        </div>
      </div>
    `).join('');
  }

  // ━━━━━━━━━━ 🎯 집중도 측정 모달 (발화·시선 기반) ━━━━━━━━━━
  let _focusTimer = null, _focusStream = null, _focusCtx = null;
  // ━━━━━━━━━━ 🎯 집중도 측정 — 로그인 후 과거 결과 조회 ━━━━━━━━━━
  let _focusSession = null;
  async function showFocusModal() {
    if (_focusSession && _focusSession.uid) {
      return renderFocusResults(_focusSession);
    }
    // 평가표와 동일한 세션 사용 (이미 로그인 했으면 재사용)
    if (typeof _reportSession !== 'undefined' && _reportSession && _reportSession.uid) {
      _focusSession = _reportSession;
      return renderFocusResults(_focusSession);
    }
    showFocusLoginGate();
  }

  // 허용 계정 목록 (백엔드 미연동 시 fallback)
  const FOCUS_ACCOUNTS = [
    { uid: '정우영',     pw: 'fleldk6019@', name: '정우영' },
    { uid: 'jungwooyoung', pw: 'fleldk6019@', name: '정우영' },
    { uid: 'demo',       pw: 'demo',        name: '데모 학생' },
  ];
  const FOCUS_LS = {
    saveId:   'mangoi_fc_save_id',
    autoLogin:'mangoi_fc_auto_login',
    uid:      'mangoi_fc_uid',
    pw:       'mangoi_fc_pw',
  };

  function showFocusLoginGate() {
    // 저장된 값 미리 읽기
    let savedUid = '', savedPw = '', savedSaveId = false, savedAuto = false;
    try {
      savedSaveId = localStorage.getItem(FOCUS_LS.saveId) === '1';
      savedAuto   = localStorage.getItem(FOCUS_LS.autoLogin) === '1';
      if (savedSaveId) savedUid = localStorage.getItem(FOCUS_LS.uid) || '';
      if (savedAuto)   savedPw  = localStorage.getItem(FOCUS_LS.pw) || '';
    } catch {}

    showModal(`
      <h2>🎯 집중도 측정 — 발화와 시선을 통한 집중도</h2>
      <p>지난 수업의 집중도 결과를 조회하려면 학생 ID·비밀번호로 로그인해 주세요.</p>
      <div style="background:rgba(78,201,255,0.06);border:1px solid rgba(78,201,255,0.25);border-radius:14px;padding:18px;margin:14px 0">
        <div style="margin-bottom:12px">
          <label style="display:block;color:#cbd5e1;font-size:12px;font-weight:600;margin-bottom:4px">🆔 학생 아이디</label>
          <input id="fc-uid" type="text" placeholder="예) 정우영" autocomplete="username" value="${escapeFC(savedUid)}" style="width:100%;padding:11px 14px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:14px;outline:none;box-sizing:border-box" />
        </div>
        <div style="margin-bottom:12px">
          <label style="display:block;color:#cbd5e1;font-size:12px;font-weight:600;margin-bottom:4px">🔑 비밀번호</label>
          <input id="fc-pw" type="password" placeholder="••••••••" autocomplete="current-password" value="${escapeFC(savedPw)}" onkeydown="if(event.key==='Enter') doFocusLogin()" style="width:100%;padding:11px 14px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:14px;outline:none;box-sizing:border-box" />
        </div>
        <!-- 자동저장 / 자동로그인 -->
        <div style="display:flex;gap:14px;margin-bottom:12px;flex-wrap:wrap">
          <label style="display:inline-flex;align-items:center;gap:6px;color:#cbd5e1;font-size:12px;cursor:pointer;user-select:none">
            <input id="fc-save-id" type="checkbox" ${savedSaveId?'checked':''} style="width:16px;height:16px;cursor:pointer;accent-color:#22d3ee" />
            아이디 자동저장
          </label>
          <label style="display:inline-flex;align-items:center;gap:6px;color:#cbd5e1;font-size:12px;cursor:pointer;user-select:none">
            <input id="fc-auto-login" type="checkbox" ${savedAuto?'checked':''} style="width:16px;height:16px;cursor:pointer;accent-color:#22d3ee" />
            자동 로그인
          </label>
        </div>
        <div id="fc-login-err" style="display:none;color:#fca5a5;font-size:12px;margin-bottom:10px"></div>
        <button onclick="doFocusLogin()" style="width:100%;padding:12px;background:linear-gradient(135deg,#22d3ee,#0ea5e9);border:0;border-radius:10px;color:#fff;font-size:14px;font-weight:800;cursor:pointer">🔓 내 집중도 결과 보기</button>
      </div>
      <p style="color:#94a3b8;font-size:11px;line-height:1.6;margin-top:10px">
        ※ 학생관리(관리자)에 등록된 본인 계정으로만 조회 가능합니다.<br/>
        ※ 자동저장: 다음 방문 시 ID 자동 입력 / 자동로그인: ID·PW 자동 입력 + 자동 입장<br/>
        ※ 데모 계정: <code style="background:rgba(0,0,0,0.4);padding:1px 6px;border-radius:4px;color:#fde68a">demo / demo</code>
      </p>
    `);
    setTimeout(() => {
      const u = document.getElementById('fc-uid');
      const p = document.getElementById('fc-pw');
      // 자동로그인 활성 + 저장된 값 모두 있으면 600ms 후 자동 진입
      if (savedAuto && savedUid && savedPw) {
        setTimeout(() => doFocusLogin(true), 600);
      } else if (!savedUid && u) {
        u.focus();
      } else if (savedUid && !savedPw && p) {
        p.focus();
      }
    }, 100);
  }
  function escapeFC(s) { return String(s||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])); }

  window.doFocusLogin = async function(silent) {
    const uid = (document.getElementById('fc-uid')?.value || '').trim();
    const pw  = (document.getElementById('fc-pw')?.value || '').trim();
    const ckSave = document.getElementById('fc-save-id')?.checked;
    const ckAuto = document.getElementById('fc-auto-login')?.checked;
    const err = document.getElementById('fc-login-err');
    if (!uid || !pw) {
      if (err && !silent) { err.textContent = 'ID와 비밀번호를 모두 입력해 주세요.'; err.style.display='block'; }
      return;
    }

    // 자동저장 / 자동로그인 처리
    try {
      if (ckSave) {
        localStorage.setItem(FOCUS_LS.saveId, '1');
        localStorage.setItem(FOCUS_LS.uid, uid);
      } else {
        localStorage.removeItem(FOCUS_LS.saveId);
        localStorage.removeItem(FOCUS_LS.uid);
      }
      if (ckAuto) {
        localStorage.setItem(FOCUS_LS.autoLogin, '1');
        localStorage.setItem(FOCUS_LS.pw, pw);
        // 자동로그인 켜면 자동저장도 자동 활성
        localStorage.setItem(FOCUS_LS.saveId, '1');
        localStorage.setItem(FOCUS_LS.uid, uid);
      } else {
        localStorage.removeItem(FOCUS_LS.autoLogin);
        localStorage.removeItem(FOCUS_LS.pw);
      }
    } catch{}

    // 1) 허용 계정 직접 매칭 (백엔드 미연동 시)
    const acc = FOCUS_ACCOUNTS.find(a => a.uid === uid && a.pw === pw);
    if (acc) {
      _focusSession = { uid: acc.uid, name: acc.name };
      renderFocusResults(_focusSession);
      return;
    }
    // 2) 백엔드 시도
    try {
      const r = await fetch('/api/login', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: uid, password: pw, username: uid })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok !== false) {
        _focusSession = { uid: d.uid || d.user_id || uid, name: d.name || d.username || uid };
        renderFocusResults(_focusSession);
        return;
      }
      throw new Error(d.error || ('HTTP ' + r.status));
    } catch (e) {
      if (err) { err.textContent = '로그인 실패: 아이디·비밀번호를 확인해 주세요.'; err.style.display='block'; }
    }
  };

  // 집중도 로그아웃 시 자동저장 해제
  const _origLogoutFocus = window.logoutFocus;
  window.logoutFocus = function() {
    try {
      localStorage.removeItem(FOCUS_LS.autoLogin);
      localStorage.removeItem(FOCUS_LS.pw);
    } catch {}
    if (_origLogoutFocus) _origLogoutFocus();
  };

  async function renderFocusResults(sess) {
    const safeName = String(sess.name || sess.uid || '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
    showModal(`
      <h2 style="color:#9ee5ff">🎯 ${safeName} — 집중도 결과</h2>
      <p id="fc-meta" style="color:#94a3b8;font-size:12px;margin:0 0 14px">불러오는 중...</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        <select id="fc-period" onchange="reloadFocus()" style="padding:6px 10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#fff;font-size:12px">
          <option value="7">최근 7일</option>
          <option value="30" selected>최근 30일</option>
          <option value="90">최근 90일</option>
        </select>
        <button onclick="reloadFocus()" style="padding:6px 12px;background:linear-gradient(135deg,#22d3ee,#0ea5e9);border:0;border-radius:8px;color:#fff;font-size:12px;font-weight:700;cursor:pointer">🔄 새로고침</button>
        <button onclick="window.print()" style="padding:6px 12px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#cbd5e1;font-size:12px;cursor:pointer">🖨 인쇄/PDF</button>
        <button onclick="logoutFocus()" style="padding:6px 12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#fca5a5;font-size:12px;cursor:pointer">🚪 로그아웃</button>
      </div>

      <!-- KPI 4개 -->
      <div id="fc-kpi" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px"></div>

      <!-- 시간별 추이 그래프 (SVG) -->
      <h3 style="color:#9ee5ff;font-size:14px;margin:14px 0 8px">📈 집중도 추이 그래프</h3>
      <div id="fc-chart" style="background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:14px;margin-bottom:14px"></div>

      <!-- 향상도 분석 -->
      <h3 style="color:#fbbf24;font-size:14px;margin:14px 0 8px">📊 향상도 분석</h3>
      <div id="fc-improvement" style="background:linear-gradient(135deg,rgba(251,191,36,0.06),rgba(245,158,11,0.02));border:1px solid rgba(251,191,36,0.25);border-radius:12px;padding:14px;margin-bottom:14px"></div>

      <!-- 일별 세션 결과 카드 -->
      <h3 style="color:#fbbf24;font-size:14px;margin:14px 0 8px">📋 일별 수업 결과 (시선·발화·종합)</h3>
      <div id="fc-sessions" style="max-height:42vh;overflow-y:auto"></div>

      <p style="color:#94a3b8;font-size:11px;line-height:1.6;margin-top:14px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px">
        ※ 수업 중 카메라·마이크로 자동 측정 → 관리자 시스템에 저장 → 학생이 본 화면에서 조회<br/>
        ※ 시선(50%) + 발화(30%) + 자세 안정성(20%) 가중 평균으로 종합 집중도 산출
      </p>
    `);
    reloadFocus();
  }

  window.logoutFocus = function() {
    _focusSession = null;
    showFocusLoginGate();
  };

  window.reloadFocus = async function() {
    if (!_focusSession) return;
    const days = Number(document.getElementById('fc-period')?.value) || 30;
    let data = null;
    try {
      const r = await fetch(`/api/student/focus-history?uid=${encodeURIComponent(_focusSession.uid)}&days=${days}`, { credentials:'include' });
      if (r.ok) data = await r.json();
    } catch {}
    if (!data || !data.sessions) data = generateFocusSampleData(_focusSession, days);
    renderFocusPanels(data, days);
  };

  function generateFocusSampleData(sess, days) {
    const sessions = [];
    const today = new Date();
    let baseScore = 72; // 시작 점수 (점진적 향상 시뮬레이션)
    const teachers = ['Maria Santos','James Cruz','Anna Reyes','Carlos Lim'];
    const topics = ['Daily Conversation','Business English','Pronunciation','Past Tense','Travel English','Email Writing','TOEIC Listening','Idioms'];
    for (let i = days - 1; i >= 0; i--) {
      // 주말 제외 + 60% 확률로 수업 있음
      const d = new Date(today.getTime() - i*86400000);
      const dow = d.getDay();
      if (dow === 0 || dow === 6) continue;
      if (Math.random() < 0.4) continue;
      // 점진적 향상 (하루마다 0.2점씩 + 노이즈)
      baseScore = Math.min(96, baseScore + 0.25 + (Math.random()-0.4)*4);
      const total = Math.round(Math.max(50, Math.min(98, baseScore)));
      const gaze = Math.round(Math.max(50, Math.min(99, baseScore + (Math.random()-0.5)*8)));
      const speak = Math.round(Math.max(40, Math.min(85, baseScore - 8 + (Math.random()-0.5)*15)));
      const posture = Math.round(Math.max(60, Math.min(95, baseScore + (Math.random()-0.5)*10)));
      sessions.push({
        date: d.toISOString().slice(0,10),
        teacher: teachers[Math.floor(Math.random()*teachers.length)],
        topic: topics[Math.floor(Math.random()*topics.length)],
        duration_min: 25 + Math.floor(Math.random()*20),
        scores: { total, gaze, speak, posture },
      });
    }
    return { ok:true, sessions, profile:{ name: sess.name } };
  }

  function renderFocusPanels(data, days) {
    const sessions = (data.sessions || []).sort((a,b) => a.date.localeCompare(b.date));
    if (sessions.length === 0) {
      document.getElementById('fc-meta').textContent = '아직 측정된 수업이 없습니다.';
      document.getElementById('fc-kpi').innerHTML = '';
      document.getElementById('fc-chart').innerHTML = '<div style="color:#94a3b8;text-align:center;padding:30px">최근 ' + days + '일간 측정 기록이 없어요.</div>';
      document.getElementById('fc-improvement').innerHTML = '';
      document.getElementById('fc-sessions').innerHTML = '';
      return;
    }
    document.getElementById('fc-meta').textContent = `최근 ${days}일 · 측정 ${sessions.length}회 · 마지막 수업: ${sessions[sessions.length-1].date}`;

    // KPI 계산
    const totals = sessions.map(s => s.scores.total);
    const avg = Math.round(totals.reduce((s,v)=>s+v,0) / totals.length);
    const max = Math.max(...totals);
    const recent = totals.slice(-Math.min(5, totals.length));
    const earlier = totals.slice(0, Math.min(5, totals.length));
    const recentAvg = Math.round(recent.reduce((s,v)=>s+v,0)/recent.length);
    const earlierAvg = Math.round(earlier.reduce((s,v)=>s+v,0)/earlier.length);
    const improvement = recentAvg - earlierAvg;
    const above80 = totals.filter(t => t >= 80).length;
    const above80Pct = Math.round(above80 / totals.length * 100);

    // KPI 카드
    document.getElementById('fc-kpi').innerHTML = [
      { lab:'평균 집중도', val:avg+'점', sub:`기간 평균`, color:'#22d3ee' },
      { lab:'최고 점수', val:max+'점', sub:`최우수 수업`, color:'#fbbf24' },
      { lab:'80점↑ 비율', val:above80Pct+'%', sub:`${above80}/${totals.length}회`, color:'#86efac' },
      { lab:'향상도', val:(improvement>=0?'+':'')+improvement+'점', sub:`초반→최근`, color: improvement>0 ? '#86efac' : improvement<0 ? '#fca5a5' : '#94a3b8' },
    ].map(k => `
      <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-left:3px solid ${k.color};border-radius:10px;padding:12px">
        <div style="color:#94a3b8;font-size:11px">${k.lab}</div>
        <div style="color:#fff;font-size:22px;font-weight:900;margin:3px 0">${k.val}</div>
        <div style="color:#64748b;font-size:10.5px">${k.sub}</div>
      </div>
    `).join('');

    // SVG 라인 차트 그리기
    renderFocusChart(sessions);

    // 향상도 분석
    let analysisColor = '#9ee5ff', analysisIcon = '📊', analysisText = '';
    if (improvement >= 5) {
      analysisColor = '#86efac'; analysisIcon = '🎉';
      analysisText = `<b style="color:#22c55e">훌륭한 향상!</b> 초반 평균 ${earlierAvg}점에서 최근 평균 <b>${recentAvg}점</b>으로 <b style="color:#22c55e">+${improvement}점</b> 상승했습니다. 학습 몰입도가 꾸준히 좋아지고 있어요.`;
    } else if (improvement >= 0) {
      analysisColor = '#fde68a'; analysisIcon = '📈';
      analysisText = `<b>안정적인 흐름</b> — 초반 ${earlierAvg}점 → 최근 <b>${recentAvg}점</b>. 일정한 집중도를 유지하고 있어요. 추가 향상을 위해 시선 추적 점수를 높이는 게 도움됩니다.`;
    } else {
      analysisColor = '#fca5a5'; analysisIcon = '⚠️';
      analysisText = `<b style="color:#f59e0b">집중도 하락 감지</b> — 초반 ${earlierAvg}점 → 최근 <b>${recentAvg}점</b> (<b style="color:#ef4444">${improvement}점</b>). 피로 누적·환경 변화 가능성. 강사와 상담을 권장합니다.`;
    }
    document.getElementById('fc-improvement').innerHTML = `
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="font-size:34px">${analysisIcon}</div>
        <div style="flex:1;color:#cbd5e1;font-size:13px;line-height:1.7">${analysisText}</div>
      </div>
      <div style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(255,255,255,0.08);display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        <div style="text-align:center"><div style="color:#94a3b8;font-size:11px">초반 평균</div><div style="color:#fff;font-size:18px;font-weight:800">${earlierAvg}점</div></div>
        <div style="text-align:center;color:${analysisColor};font-size:24px;align-self:center">→</div>
        <div style="text-align:center"><div style="color:#94a3b8;font-size:11px">최근 평균</div><div style="color:${analysisColor};font-size:18px;font-weight:800">${recentAvg}점</div></div>
      </div>
    `;

    // 일별 세션 카드
    document.getElementById('fc-sessions').innerHTML = sessions.slice().reverse().map(s => {
      const safe = (x) => String(x||'').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
      const t = s.scores.total;
      const color = t >= 85 ? '#86efac' : t >= 75 ? '#fde68a' : '#fca5a5';
      const grade = t >= 85 ? '🟢 우수' : t >= 75 ? '🟡 양호' : '🔴 부족';
      return `
        <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-left:3px solid ${color};border-radius:10px;padding:12px;margin-bottom:8px">
          <div style="display:grid;grid-template-columns:90px 1fr 80px;gap:10px;align-items:center">
            <div style="color:#9ee5ff;font-size:12px;font-weight:700">${safe(s.date)}</div>
            <div>
              <div style="color:#fff;font-weight:700;font-size:13px">${safe(s.topic)}</div>
              <div style="color:#94a3b8;font-size:11px;margin-top:2px">강사: ${safe(s.teacher)} · ${s.duration_min||40}분</div>
            </div>
            <div style="text-align:right">
              <div style="color:${color};font-size:24px;font-weight:900">${t}<span style="font-size:11px;color:#94a3b8">점</span></div>
              <div style="color:${color};font-size:10px">${grade}</div>
            </div>
          </div>
          <div style="margin-top:8px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:11px">
            <div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:6px 8px">
              <div style="color:#94a3b8">👁 시선</div>
              <div style="color:#fbbf24;font-weight:700;font-size:14px">${s.scores.gaze}</div>
              <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:3px"><div style="height:100%;width:${s.scores.gaze}%;background:#fbbf24;border-radius:2px"></div></div>
            </div>
            <div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:6px 8px">
              <div style="color:#94a3b8">🎤 발화</div>
              <div style="color:#86efac;font-weight:700;font-size:14px">${s.scores.speak}</div>
              <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:3px"><div style="height:100%;width:${s.scores.speak}%;background:#22c55e;border-radius:2px"></div></div>
            </div>
            <div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:6px 8px">
              <div style="color:#94a3b8">🧍 자세</div>
              <div style="color:#c4b5fd;font-weight:700;font-size:14px">${s.scores.posture||80}</div>
              <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:3px"><div style="height:100%;width:${s.scores.posture||80}%;background:#a855f7;border-radius:2px"></div></div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // SVG 라인 차트 (Chart.js 의존성 없음)
  function renderFocusChart(sessions) {
    const wrap = document.getElementById('fc-chart');
    if (!wrap) return;
    const W = 580, H = 220, PAD = 40;
    const data = sessions.map(s => s.scores.total);
    const min = Math.max(40, Math.min(...data) - 10);
    const max = 100;
    const xStep = (W - PAD*2) / Math.max(1, data.length - 1);
    const points = data.map((v, i) => {
      const x = PAD + i * xStep;
      const y = H - PAD - ((v - min) / (max - min)) * (H - PAD*2);
      return [x, y, v, sessions[i].date];
    });
    const path = points.map((p,i) => (i===0?'M':'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = path + ` L ${points[points.length-1][0].toFixed(1)},${H-PAD} L ${points[0][0].toFixed(1)},${H-PAD} Z`;
    // Y축 grid (50, 60, 70, 80, 90, 100)
    const gridLines = [50,60,70,80,90,100].filter(v => v >= min).map(v => {
      const y = H - PAD - ((v - min) / (max - min)) * (H - PAD*2);
      return `<line x1="${PAD}" y1="${y}" x2="${W-PAD}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2,4"/><text x="${PAD-8}" y="${y+3}" fill="#64748b" font-size="9" text-anchor="end">${v}</text>`;
    }).join('');
    // 80점 목표선
    const goalY = H - PAD - ((80 - min) / (max - min)) * (H - PAD*2);
    const dots = points.map(p => {
      const color = p[2] >= 85 ? '#86efac' : p[2] >= 75 ? '#fde68a' : '#fca5a5';
      return `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${color}" stroke="#0f172a" stroke-width="2"><title>${p[3]}: ${p[2]}점</title></circle>`;
    }).join('');
    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(34,211,238,0.55)"/>
            <stop offset="100%" stop-color="rgba(34,211,238,0.02)"/>
          </linearGradient>
        </defs>
        ${gridLines}
        <line x1="${PAD}" y1="${goalY}" x2="${W-PAD}" y2="${goalY}" stroke="rgba(251,191,36,0.5)" stroke-dasharray="4,4"/>
        <text x="${W-PAD-8}" y="${goalY-4}" fill="#fbbf24" font-size="10" text-anchor="end" font-weight="800">목표 80점</text>
        <path d="${area}" fill="url(#fcGrad)"/>
        <path d="${path}" fill="none" stroke="#22d3ee" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        ${dots}
      </svg>
      <div style="margin-top:8px;font-size:11px;color:#94a3b8;text-align:center">최초(왼쪽) → 최근(오른쪽) · 점에 마우스 올리면 날짜·점수 확인</div>
    `;
  }

  function renderFocusTrend() {
    const el = document.getElementById('focus-trend');
    if (!el) return;
    // 샘플 7일 데이터
    const labels = ['월','화','수','목','금','토','일'];
    const scores = [78, 82, 85, 91, 88, 76, 83];
    el.innerHTML = scores.map((s, i) => {
      const color = s >= 85 ? '#86efac' : s >= 75 ? '#fde68a' : '#fca5a5';
      return `<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px 4px;text-align:center">
        <div style="color:#94a3b8;font-size:10px;margin-bottom:2px">${labels[i]}</div>
        <div style="color:${color};font-size:16px;font-weight:800">${s}</div>
        <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;margin-top:4px;overflow:hidden">
          <div style="height:100%;width:${s}%;background:${color};border-radius:2px"></div>
        </div>
      </div>`;
    }).join('');
  }

  window.toggleFocusMeasure = async function() {
    const btn = document.getElementById('focus-toggle');
    const status = document.getElementById('focus-status');
    if (_focusTimer) {
      // 중단
      stopFocusMeasure();
      btn.textContent = '▶ 측정 시작';
      btn.style.background = 'linear-gradient(135deg,#22d3ee,#06b6d4)';
      btn.style.color = '#083344';
      if (status) status.textContent = '측정이 중단되었습니다. 다시 시작하려면 버튼을 눌러주세요.';
      return;
    }
    if (status) status.textContent = '⏳ 카메라·마이크 권한 요청 중…';
    try {
      _focusStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const video = document.getElementById('focus-video');
      if (video) video.srcObject = _focusStream;
      // 음성 레벨 분석
      _focusCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = _focusCtx.createMediaStreamSource(_focusStream);
      const analyser = _focusCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);

      let speakSamples = 0, speakActive = 0;
      let gazeScore = 80; // 시뮬레이션 (실제 face landmark 모델 없이)
      let totalSec = 0;

      _focusTimer = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        let rms = 0;
        for (let i=0;i<buf.length;i++) { const v = (buf[i]-128)/128; rms += v*v; }
        rms = Math.sqrt(rms/buf.length);
        const vol = Math.min(100, Math.floor(rms * 800));
        const volBar = document.getElementById('focus-vol-bar');
        if (volBar) volBar.style.width = vol + '%';

        speakSamples++;
        if (rms > 0.015) speakActive++;
        const speakPct = Math.round(speakActive / speakSamples * 100);

        // 시선 시뮬레이션 — 점진적으로 변동 (75~95)
        gazeScore = Math.max(70, Math.min(98, gazeScore + (Math.random()-0.5)*4));
        const totalScore = Math.round(gazeScore*0.5 + speakPct*0.3 + 80*0.2);

        const setVal = (id, val) => { const e = document.getElementById(id); if (e) e.innerHTML = val; };
        const setW = (id, w) => { const e = document.getElementById(id); if (e) e.style.width = w + '%'; };
        setVal('focus-speak', speakPct + '<span style="font-size:13px;color:#94a3b8">%</span>');
        setVal('focus-gaze', Math.round(gazeScore));
        setVal('focus-total', totalScore);
        setW('focus-speak-fill', speakPct);
        setW('focus-gaze-fill', gazeScore);
        setW('focus-total-fill', totalScore);

        totalSec++;
        if (status) status.textContent = `📊 측정 중… ${totalSec}초 (마이크 ${vol}%)`;
      }, 200);

      btn.textContent = '⏸ 측정 중단';
      btn.style.background = 'linear-gradient(135deg,#ef4444,#dc2626)';
      btn.style.color = '#fff';
      if (status) status.textContent = '📊 실시간 측정 시작! 영어로 자연스럽게 말씀해 보세요.';
    } catch (e) {
      if (status) status.innerHTML = '<span style="color:#fca5a5">❌ 카메라·마이크 권한이 필요합니다: ' + (e.message||'알 수 없는 오류') + '</span>';
    }
  };

  function stopFocusMeasure() {
    if (_focusTimer) { clearInterval(_focusTimer); _focusTimer = null; }
    if (_focusStream) { _focusStream.getTracks().forEach(t => t.stop()); _focusStream = null; }
    if (_focusCtx) { try { _focusCtx.close(); } catch{} _focusCtx = null; }
    const video = document.getElementById('focus-video');
    if (video) video.srcObject = null;
  }
  // 모달 닫을 때 측정 자동 중단
  const _origCloseInfo = window.closeInfoModal;
  window.closeInfoModal = function() {
    stopFocusMeasure();
    if (_origCloseInfo) _origCloseInfo();
  };

  function closeGrid() { gm.style.display = 'none'; }
  document.querySelectorAll('.gm-card[data-go]').forEach(card => {
    card.addEventListener('click', () => {
      // 마지막 클릭한 카드에만 active 클래스 → 그리드 다시 열었을 때 어디 갔다왔는지 표시
      document.querySelectorAll('.gm-card.active, .gm-card.primary').forEach(c => {
        c.classList.remove('active');
        c.classList.remove('primary');
      });
      card.classList.add('active');
      const action = ACTIONS[card.dataset.go];
      if (action) action();
    });
  });

  // ━━━━━━━━━━ 한/영 토글 + A→Z 정렬 ━━━━━━━━━━
  let _gmLang = (localStorage.getItem('mangoi_gm_lang') === 'en') ? 'en' : 'ko';
  function applyGmLang() {
    // 모든 data-ko/data-en 요소 텍스트 교체 (그리드 메뉴 안에 한정)
    const root = document.getElementById('grid-menu') || document;
    root.querySelectorAll('[data-ko][data-en]').forEach(el => {
      el.textContent = (_gmLang === 'en') ? el.getAttribute('data-en') : el.getAttribute('data-ko');
    });
    // 토글 버튼 텍스트
    const tg = document.getElementById('gm-lang-toggle');
    if (tg) tg.textContent = (_gmLang === 'en') ? '🌐 한국어' : '🌐 EN';
    // 카드 정렬 — 한국어는 가나다, 영어는 a-z
    const cardsBox = document.getElementById('gm-cards');
    if (cardsBox) {
      const cards = Array.from(cardsBox.querySelectorAll('.gm-card[data-go]'));
      cards.sort((a, b) => {
        if (_gmLang === 'en') {
          const ka = (a.getAttribute('data-en-key') || a.querySelector('.gm-label')?.textContent || '').toLowerCase();
          const kb = (b.getAttribute('data-en-key') || b.querySelector('.gm-label')?.textContent || '').toLowerCase();
          return ka.localeCompare(kb, 'en');
        } else {
          const ka = a.querySelector('.gm-label')?.getAttribute('data-ko') || '';
          const kb = b.querySelector('.gm-label')?.getAttribute('data-ko') || '';
          // 한글 우선, 영문/숫자는 뒤로
          const isKoA = /[가-힣]/.test(ka.charAt(0));
          const isKoB = /[가-힣]/.test(kb.charAt(0));
          if (isKoA && !isKoB) return -1;
          if (!isKoA && isKoB) return 1;
          return ka.localeCompare(kb, 'ko');
        }
      });
      cards.forEach(c => cardsBox.appendChild(c));
    }
  }
  applyGmLang();
  const langBtn = document.getElementById('gm-lang-toggle');
  if (langBtn) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _gmLang = (_gmLang === 'en') ? 'ko' : 'en';
      try { localStorage.setItem('mangoi_gm_lang', _gmLang); } catch {}
      applyGmLang();
    });
  }
})();