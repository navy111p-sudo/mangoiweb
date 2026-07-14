// ═══════════════════════════════════════════════════════════════
// adm-r5.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR',{dateStyle:'short',timeStyle:'short'}) : '-';
  const STAR_LABELS = ['','매우 별로','별로','좀 별로','보통','좋음','아주 좋음','매우 좋음'];

  // 🧠 MBTI
  window.mbtiSave = async function() {
    const uid = document.getElementById('mbti-uid').value.trim();
    const name = document.getElementById('mbti-name').value.trim();
    const mbti = document.getElementById('mbti-type').value.trim().toUpperCase();
    if (!uid) return alert('강사 UID 입력');
    if (mbti && !/^[IE][NS][TF][JP]$/.test(mbti)) return alert('MBTI 형식 오류 (예: INTJ, ENFP)');
    const out = document.getElementById('mbti-result');
    out.innerHTML = '<div style="color:#a3b3d1">저장 중…</div>';
    try {
      const r = await fetch('/api/admin/teacher/mbti', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          teacher_uid: uid, teacher_name: name, mbti,
          hobby: document.getElementById('mbti-hobby').value.trim(),
          teaching_style: document.getElementById('mbti-style').value.trim(),
          intro: document.getElementById('mbti-intro').value.trim(),
        })
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      out.innerHTML = '<div style="color:#34d399">✅ 등록 완료</div>';
      mbtiLoadList();
    } catch(e) { out.innerHTML = '<div style="color:#f87171">❌ '+esc(e.message)+'</div>'; }
  };
  window.mbtiSeedDemo = async function() {
    if (!confirm('테스트용 데모 강사 10명(Karen, James, Sophie, Maria, Alex, Emily, David, Anna, Daniel, Lisa) 을 일괄 등록할까요?\n\n이미 있는 강사는 업데이트됩니다.')) return;
    try {
      const r = await fetch('/api/admin/teacher/mbti/seed-demo', { method:'POST' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      alert(`✅ 데모 강사 ${d.total}명 처리 완료\n신규: ${d.inserted}, 업데이트: ${d.updated}\n\n학생 페이지 /mbti.html 에서 매칭 테스트 가능합니다!`);
      mbtiLoadList();
    } catch(e) { alert('❌ ' + (e.message || '시드 실패')); }
  };

  // 🌐 데모 시드 데이터 한↔영 매핑 — DB 에 한국어로 저장된 시드 텍스트를 EN 모드에서 변환
  const MBTI_HOBBY_MAP = {
    'K-POP/뮤지컬/게임': 'K-POP / Musicals / Games',
    'K-POP/뮤지컬/즉흥 게임': 'K-POP / Musicals / Improv games',
    '댄스/파티/SNS': 'Dance / Parties / Social media',
    '자전거/만들기/기계 분해': 'Cycling / Crafting / Mechanics',
    '글쓰기/명상/시 감상': 'Writing / Meditation / Poetry',
    '독서/달리기/계획표 짜기': 'Reading / Running / Planning',
    '독서/체스/논리퍼즐': 'Reading / Chess / Logic puzzles',
    '드라마/요리/여행': 'Dramas / Cooking / Travel',
    '그림/일러스트/카페투어': 'Drawing / Illustration / Cafe tours',
    '베이킹/봉사': 'Baking / Volunteering',
    '베이킹/식물 가꾸기/봉사': 'Baking / Gardening / Volunteering',
    '토론/팟캐스트': 'Debate / Podcasts',
    '토론/팟캐스트/스타트업': 'Debate / Podcasts / Startups',
  };
  const MBTI_STYLE_MAP = {
    '에너지 폭발 — 게임·노래·역할극': 'Energy burst — games, songs, roleplay',
    '에너지 폭발 — 게임·노래·역할극 활용 자유 회화': 'Energy burst — free conversation with games/songs/roleplay',
    '재미 최우선 — 게임·이벤트·실생활 대화 위주': 'Fun-first — games, events, real-life conversation',
    '실용적·짧은 설명 — 여행 영어·실생활 표현': 'Practical & concise — travel & real-life English',
    '깊이 있는 대화 — 문학·문법·작문 중심': 'Deep talks — literature, grammar, writing',
    '꼼꼼하고 체계적 — 시험 영어 (수능·토익·토플) 전문': 'Detailed & systematic — test English (CSAT/TOEIC/TOEFL)',
    '체계적·논리적 — 문법·구조·발음 정확도': 'Systematic & logical — grammar, structure, pronunciation',
    '체계적·논리적 — 문법·구조 분석, 발음 정확도 중심': 'Systematic & logical — grammar/structure analysis, pronunciation focus',
    '친절하고 활기차게 — 일상 회화 + 격려': 'Warm & energetic — daily conversation + encouragement',
    '친절하고 활기차게 — 일상 회화 위주, 격려 많음': 'Warm & energetic — daily conversation, lots of encouragement',
    '창의적 — 감정 표현·자기 소개·자유 글쓰기': 'Creative — feelings, self-intro, free writing',
    '인내심 — 초보·아동 케어, 반복학습': 'Patient — beginners/kids care, repetition',
    '조용하고 인내심 — 초보 / 아동 케어, 반복학습': 'Quiet & patient — beginners/kids care, repetition',
    '활발한 토론 — 비즈니스·시사 영어': 'Lively debate — business & current affairs English',
    '활발한 토론 — 비즈니스/시사 영어, 도전적 질문': 'Lively debate — business/current affairs English, challenging questions',
  };
  // 일반 텍스트 한↔영 변환 — 매핑이 없으면 원문 반환
  function tr(text, map) {
    if (!text) return '-';
    const isEn = (window.adminLang === 'en');
    if (!isEn) return text;
    return map[text] || text;     // 매핑 없으면 한국어 원문 그대로
  }

  window.mbtiLoadList = async function() {
    const el = document.getElementById('mbti-list');
    const isEn = (window.adminLang === 'en');
    try {
      const r = await fetch('/api/teachers/mbti-list');
      const d = await r.json();
      if (!d.ok || !d.teachers?.length) {
        el.innerHTML = `<div style="color:#a3b3d1">${isEn ? 'No teachers registered yet' : '등록된 강사가 없습니다'}</div>`;
        return;
      }
      // 컬럼 헤더 i18n
      const hCol = {
        teacher: isEn ? 'Teacher' : '강사',
        mbti:    'MBTI',
        hobby:   isEn ? 'Hobbies / Interests' : '취미',
        style:   isEn ? 'Teaching Style' : '스타일',
      };
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>
        <th style="text-align:left;padding:8px">${hCol.teacher}</th>
        <th style="text-align:left;padding:8px">${hCol.mbti}</th>
        <th style="text-align:left;padding:8px">${hCol.hobby}</th>
        <th style="text-align:left;padding:8px">${hCol.style}</th>
      </tr></thead><tbody>${d.teachers.map(t => `<tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
        <td style="padding:8px"><b>${esc(t.teacher_name)}</b> <span style="font-size:10px;color:#a3b3d1">${esc(t.teacher_uid)}</span></td>
        <td style="padding:8px;font-weight:800;color:#4f7cff">${esc(t.mbti||'-')}</td>
        <td style="padding:8px;color:#cbd5e1">${esc(tr(t.hobby, MBTI_HOBBY_MAP))}</td>
        <td style="padding:8px;color:#cbd5e1">${esc(tr(t.teaching_style, MBTI_STYLE_MAP))}</td>
      </tr>`).join('')}</tbody></table>`;
    } catch(e) {
      el.innerHTML = `<div style="color:#f87171">${isEn ? 'Failed to load' : '로드 실패'}</div>`;
    }
  };
  // 카드 열림 시 — 목록은 사용자가 토글 펼칠 때만 로드 (자동 호출 제거)
  document.getElementById('card-mbti-mgmt')?.addEventListener('toggle', function(){
    if (this.open) {
      const det = document.getElementById('mbti-list-details');
      if (det && det.open) mbtiLoadList();   // 목록이 이미 펼쳐져 있을 때만
    }
  });

  // 🌐 EN/KO 토글 시 리스트가 이미 열려 있으면 자동 재렌더
  document.addEventListener('mangoi:lang-changed', function(){
    const card = document.getElementById('card-mbti-mgmt');
    if (card && card.open && document.getElementById('mbti-list')?.children.length) {
      mbtiLoadList();
    }
  });

  // 🌟 칭찬 통계
  window.prLoadStats = async function() {
    const el = document.getElementById('pr-stats');
    el.innerHTML = '<div style="color:#a3b3d1">로딩…</div>';
    try {
      const r = await fetch('/api/admin/teacher/praise/stats');
      const d = await r.json();
      if (!d.ok || !d.rows?.length) { const _en = (document.documentElement.lang === 'en' || window.adminLang === 'en'); el.innerHTML = '<div style="color:#a3b3d1;padding:20px;text-align:center">'+(_en?'No praise yet':'아직 칭찬이 없어요')+'</div>'; return; }
      el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>
        <th style="text-align:left;padding:8px">강사</th><th style="text-align:right;padding:8px">받은 칭찬</th>
        <th style="text-align:right;padding:8px">평균 별점</th><th style="text-align:left;padding:8px">최근</th>
      </tr></thead><tbody>${d.rows.map(r => {
        const tier = r.avg_star >= 6 ? '#34d399' : r.avg_star >= 4 ? '#fbbf24' : '#f87171';
        return `<tr style="border-bottom:1px solid rgba(255,255,255,0.06)">
          <td style="padding:8px"><b>${esc(r.teacher_name||r.teacher_uid)}</b></td>
          <td style="padding:8px;text-align:right;font-weight:800">${r.count}</td>
          <td style="padding:8px;text-align:right;font-weight:800;color:${tier}">${r.avg_star}/7</td>
          <td style="padding:8px;color:#a3b3d1;font-size:11px">${fmtDate(r.last_at)}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
    } catch(e) { el.innerHTML = '<div style="color:#f87171">로드 실패</div>'; }
  };
  window.prLoadList = async function() {
    const el = document.getElementById('pr-list');
    el.innerHTML = '<div style="color:#a3b3d1">로딩…</div>';
    try {
      const r = await fetch('/api/admin/teacher/praise/list');
      const d = await r.json();
      if (!d.ok || !d.rows?.length) { const _en = (document.documentElement.lang === 'en' || window.adminLang === 'en'); el.innerHTML = '<div style="color:#a3b3d1;padding:20px;text-align:center">'+(_en?'No praise received yet':'아직 받은 칭찬이 없어요')+'</div>'; return; }
      el.innerHTML = d.rows.map(r => `<div style="padding:12px 14px;background:rgba(255,255,255,0.04);border:1px solid rgba(99,102,241,0.18);border-left:3px solid #fbbf24;border-radius:8px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
          <span style="font-weight:800;color:#fbbf24">${esc(r.teacher_name||r.teacher_uid)}</span>
          <span style="background:rgba(251,191,36,0.18);color:#fbbf24;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:800">${r.star_rating}/7 ${STAR_LABELS[r.star_rating]||''}</span>
        </div>
        ${r.praise_text?`<div style="color:#e6ecff;font-size:13px;line-height:1.6;margin-bottom:5px">"${esc(r.praise_text)}"</div>`:''}
        <div style="font-size:10.5px;color:#6b7a99">🔒 익명 · ${fmtDate(r.created_at)}</div>
      </div>`).join('');
    } catch(e) { el.innerHTML = '<div style="color:#f87171">로드 실패</div>'; }
  };
  document.getElementById('card-praise-stats')?.addEventListener('toggle', function(){ if (this.open) { prLoadStats(); prLoadList(); } });
})();
