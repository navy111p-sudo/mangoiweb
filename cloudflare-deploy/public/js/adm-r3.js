// ═══════════════════════════════════════════════════════════════
// adm-r3.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const fmtDate = (ms) => ms ? new Date(ms).toLocaleString('ko-KR', { dateStyle:'short', timeStyle:'short' }) : '-';

  // ━━━━ 🎮 BG: 배지 통계 ━━━━
  //  🌐 (2026-07-24) 이 카드는 서버 JSON 을 그대로 찍는 자리라 data-ko/data-en 이 없다.
  //     그래서 EN 토글에도 배지 이름·설명이 한국어로 남아 있었다(매니저 제보).
  //     서버 BADGE_CATALOG 는 name_en/desc_en 을 이미 내려주므로 여기서 골라 쓰면 된다.
  //     i18n-sweep 의 AI 자동번역에 맡기면 한 박자 늦고 정식 명칭과도 어긋난다
  //     ('발음 마스터' → "Master of pronunciation" ≠ 카탈로그의 "Pronunciation Master").
  let _bgLoaded = false;
  window.bgLoadStats = async function(){
    const el = document.getElementById('bg-stats-grid');
    if (!el) return;
    const isEn = (typeof adminLang !== 'undefined' && adminLang === 'en');
    el.innerHTML = '<div style="padding:14px;color:#6b7280">'+(isEn ? 'Loading…' : '불러오는 중…')+'</div>';
    try {
      const r = await fetch('/api/admin/badges/stats');
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      el.innerHTML = `
        <div style="margin-bottom:10px;font-size:12px;color:#6b7280">${isEn ? 'Total awards' : '전체 부여 횟수'}: <b style="color:#1f2937">${d.total_awards.toLocaleString(isEn ? 'en-US' : 'ko-KR')}</b></div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
          ${d.badges.map(b => `
            <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px;text-align:center">
              <div style="font-size:32px;line-height:1">${b.icon}</div>
              <div style="font-weight:800;font-size:13px;color:#1f2937;margin-top:6px">${esc((isEn && b.name_en) || b.name)}</div>
              <div style="font-size:10px;color:#9ca3af;margin-top:2px">${esc((isEn && b.desc_en) || b.desc)}</div>
              <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280">${isEn
                ? `Earned by <b style="color:#fbbf24;font-size:14px">${b.earned_by}</b>`
                : `획득 <b style="color:#fbbf24;font-size:14px">${b.earned_by}</b> 명`}</div>
            </div>`).join('')}
        </div>`;
    } catch(e) { el.innerHTML = '<div style="color:#ef4444">'+(isEn ? 'Failed to load: ' : '로드 실패: ')+esc(e.message)+'</div>'; }
    _bgLoaded = true;
  };
  // 🌐 이미 그려 둔 배지 카드는 언어 토글에 맞춰 다시 그린다(안 부르면 EN 을 눌러도 그대로 한국어).
  //    아직 안 연 카드까지 불러오면 쓸데없는 API 왕복이라 로드된 적 있을 때만.
  document.addEventListener('mangoi:lang-changed', function(){
    if (_bgLoaded && document.getElementById('bg-stats-grid')) { try { window.bgLoadStats(); } catch(e){} }
  });
  window.bgCheckUser = async function(){
    const uid = document.getElementById('bg-check-uid').value.trim();
    if (!uid) return alert('학생 user_id 입력');
    const out = document.getElementById('bg-check-result');
    out.innerHTML = '검사 중…';
    try {
      const r = await fetch('/api/badges/check', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ uid }) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      if (!d.earned_count) {
        out.innerHTML = '<div style="padding:10px;background:#f9fafb;border-radius:6px;font-size:12px;color:#6b7280">새로 받은 배지 없음. (이미 받은 배지는 중복 부여 안 됨)</div>';
      } else {
        const newBadges = d.catalog.filter(c => d.earned.includes(c.code));
        out.innerHTML = `<div style="padding:12px;background:#ecfdf5;border:1px solid #34d399;border-radius:8px"><b style="color:#059669">✅ ${d.earned_count}개 배지 부여!</b><div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">${newBadges.map(b => `<span style="padding:6px 10px;background:#fff;border:1px solid #d1d5db;border-radius:99px;font-size:12px">${b.icon} ${esc(b.name)}</span>`).join('')}</div></div>`;
      }
    } catch(e) { out.innerHTML = '<div style="color:#ef4444">❌ '+esc(e.message)+'</div>'; }
  };
  document.getElementById('card-badges-mgmt')?.addEventListener('toggle', function(){ if (this.open) bgLoadStats(); });

  // ━━━━ 🎙 TVS: 음성 코칭 admin 통계 ━━━━
  // ── 리팩토링 헬퍼 (직관적 분석용) ──────────────────────────────
  // 이 페이지는 Tailwind 미사용이라, 요청된 Tailwind 색상을 동일한 HEX로 환산해 인라인 적용.
  //   bg-green-50=#f0fdf4 / bg-red-50=#fef2f2 / bg-red-100=#fee2e2 / text-red-700=#b91c1c
  //   bg-blue-500=#3b82f6 / emerald-500=#10b981 / violet-500=#8b5cf6

  // [1] 종합 점수 → 행 배경색: 85↑ 우수(연초록), 70↓ 집중케어(연빨강), 그 외 흰색
  const tvsRowBg = (total) => total >= 85 ? '#f0fdf4' : (total < 70 ? '#fef2f2' : '#fff');

  // [2] 마지막 연습 시각 → '며칠 경과'를 정수로 계산 (현재-마지막, 하루=86,400,000ms 내림)
  const tvsDaysSince = (ms) => ms ? Math.floor((Date.now() - ms) / 86400000) : Infinity;

  // [3] 역량 점수 → 숫자 + 100% 기준 미니 가로 막대그래프 셀(<td>) HTML 생성
  const tvsBar = (score, color) => {
    const pct = Math.max(0, Math.min(100, Number(score) || 0)); // 0~100 범위 보정
    return `<td style="padding:8px;min-width:120px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="width:26px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${score}</span>
        <div style="flex:1;height:8px;border-radius:999px;background:#e5e7eb;overflow:hidden">
          <div style="height:100%;width:${pct}%;border-radius:999px;background:${color};transition:width .4s ease"></div>
        </div>
      </div></td>`;
  };

  // [4] '마지막' 셀: 항상 시각 표시 + 7일↑ 미참여면 붉은 굵은 글씨 + 경고 배지
  const tvsLastCell = (ms) => {
    const days = tvsDaysSince(ms);
    if (isFinite(days) && days >= 7) {
      return `<td style="padding:8px;font-size:11px">
        <span style="color:#b91c1c;font-weight:800">${fmtDate(ms)}</span><br>
        <span style="display:inline-block;margin-top:3px;padding:2px 7px;border-radius:6px;background:#fee2e2;color:#b91c1c;font-weight:800;font-size:10.5px">⚠️ 7일+ 미참여 (${days}일)</span>
      </td>`;
    }
    return `<td style="padding:8px;color:#6b7280;font-size:11px">${fmtDate(ms)}</td>`;
  };

  window.tvsLoad = async function(){
    const el = document.getElementById('tvs-table');
    const sum = document.getElementById('tvs-summary');
    const days = document.getElementById('tvs-days').value || '30';
    el.innerHTML = '<div style="padding:14px;color:#6b7280">불러오는 중…</div>';
    try {
      const r = await fetch('/api/admin/voice/all-stats?days=' + encodeURIComponent(days));
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      sum.textContent = `학생 ${d.total_students}명 · 세션 ${d.total_sessions}회 · 평균 ${d.avg_overall}점`;
      if (!d.rows.length) {
        el.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;background:#f9fafb;border-radius:8px">최근 ' + days + '일 동안 음성 코칭 기록이 없습니다.</div>';
        return;
      }
      el.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;border-radius:8px;overflow:hidden">
          <thead style="background:#f3f4f6"><tr>
            <th style="padding:8px;text-align:left">학생</th>
            <th style="padding:8px;text-align:right">연습</th>
            <th style="padding:8px;text-align:right">종합</th>
            <th style="padding:8px;text-align:left">정확도</th>
            <th style="padding:8px;text-align:left">발음</th>
            <th style="padding:8px;text-align:left">유창성</th>
            <th style="padding:8px;text-align:right">최고</th>
            <th style="padding:8px;text-align:left">마지막</th>
          </tr></thead>
          <tbody>${d.rows.map(r => {
            // 종합 점수 텍스트 색(기존 tier 유지) + 행 배경(신규 하이라이트)
            const tier = r.avg_overall >= 80 ? '#34d399' : r.avg_overall >= 60 ? '#fbbf24' : '#f87171';
            const rowBg = tvsRowBg(r.avg_overall);
            return `<tr style="border-bottom:1px solid #e5e7eb;background:${rowBg}">
              <td style="padding:8px"><b>${esc(r.student_name)}</b><br><span style="color:#9ca3af;font-size:10.5px;font-family:monospace">${esc(r.student_uid)}</span></td>
              <td style="padding:8px;text-align:right;font-weight:700">${r.sessions}</td>
              <td style="padding:8px;text-align:right;font-weight:800;color:${tier}">${r.avg_overall}</td>
              ${tvsBar(r.avg_accuracy, '#3b82f6')}
              ${tvsBar(r.avg_pronunciation, '#10b981')}
              ${tvsBar(r.avg_fluency, '#8b5cf6')}
              <td style="padding:8px;text-align:right;color:#fbbf24;font-weight:700">${r.best_accuracy}</td>
              ${tvsLastCell(r.last_session_at)}
            </tr>`;
          }).join('')}</tbody>
        </table>`;
    } catch(e) { el.innerHTML = '<div style="color:#ef4444">로드 실패: '+esc(e.message)+'</div>'; }
  };
  document.getElementById('card-voice-stats')?.addEventListener('toggle', function(){ if (this.open) tvsLoad(); });

  // ━━━━ 📚 BE: 일괄 평가서 ━━━━
  let _beStudents = [];
  window.beAddStudent = function(){
    _beStudents.push({ uid:'', name:'', scores:{} });
    beRender();
  };
  function beRender(){
    const el = document.getElementById('be-students');
    if (!el) return;
    const isEn = (typeof adminLang !== 'undefined' && adminLang === 'en');
    const L_NAME = isEn ? 'Name' : '이름';
    const L_NAME_PH = isEn ? 'e.g. John Smith' : '홍길동';
    const L_DEL = isEn ? 'Delete' : '삭제';
    const L_SCORES = isEn
      ? {participation:'Participation', comprehension:'Comprehension', homework:'Homework', attitude:'Attitude', speaking:'Speaking'}
      : {participation:'참여', comprehension:'이해', homework:'숙제', attitude:'태도', speaking:'스피킹'};
    el.innerHTML = _beStudents.map((s, i) => `
      <div style="border:1px solid #d1d5db;border-radius:8px;padding:10px;background:#fff">
        <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
          <label style="font-size:11px;font-weight:700;color:#374151">user_id<input value="${esc(s.uid)}" oninput="_beUpd(${i},'uid',this.value)" placeholder="hong_gd" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px" /></label>
          <label style="font-size:11px;font-weight:700;color:#374151">${L_NAME}<input value="${esc(s.name)}" oninput="_beUpd(${i},'name',this.value)" placeholder="${L_NAME_PH}" style="width:100%;padding:6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px" /></label>
          <button onclick="_beDel(${i})" style="padding:6px 10px;background:#ef4444;color:#fff;border:0;border-radius:4px;cursor:pointer;font-size:11px">${L_DEL}</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:8px">
          ${['participation','comprehension','homework','attitude','speaking'].map(k => {
            const label = L_SCORES[k];
            return `<label style="font-size:10.5px;font-weight:700;color:#374151;text-align:center">${label}<input type="number" min="0" max="10" value="${s.scores[k]||''}" oninput="_beUpdScore(${i},'${k}',this.value)" style="width:100%;padding:4px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;margin-top:2px;text-align:center" /></label>`;
          }).join('')}
        </div>
      </div>`).join('');
  }
  // 언어 토글 시 학생 행도 다시 그리기
  //  🐛 (2026-07-24) 원래 window 에서 듣고 있었는데, adm-core.js 의 toggleAdminLang 은
  //     document 에 bubbles:false 로 쏜다 → window 까지 올라오지 않아 이 리스너는 죽어 있었다.
  //     (adm-p2.js 만 document/window 둘 다 걸어 두어 멀쩡했다.) document 로 교체.
  document.addEventListener('mangoi:lang-changed', () => { if (_beStudents.length) beRender(); });
  window._beUpd = (i, k, v) => { _beStudents[i][k] = v; };
  window._beUpdScore = (i, k, v) => { _beStudents[i].scores[k] = v?Number(v):null; };
  window._beDel = (i) => { _beStudents.splice(i,1); beRender(); };
  window.beBulkSubmit = async function(){
    if (!_beStudents.length) return alert('학생을 추가하세요');
    const valid = _beStudents.filter(s => s.uid);
    if (!valid.length) return alert('user_id 없는 학생은 저장 안 됩니다');
    const payload = {
      teacher_uid: document.getElementById('be-teacher-uid').value.trim(),
      teacher_name: document.getElementById('be-teacher-name').value.trim(),
      lesson_title: document.getElementById('be-lesson-title').value.trim(),
      lesson_date: document.getElementById('be-lesson-date').value.trim(),
      common: {
        strengths: document.getElementById('be-common-strengths').value.trim(),
        improvements: document.getElementById('be-common-improvements').value.trim(),
        next_goals: document.getElementById('be-common-goals').value.trim(),
      },
      students: valid.map(s => ({
        student_uid: s.uid, student_name: s.name, scores: s.scores,
      })),
    };
    const out = document.getElementById('be-result');
    out.innerHTML = '<div style="color:#6b7280">저장 중…</div>';
    try {
      const r = await fetch('/api/eval/bulk-create', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error);
      out.innerHTML = `<div style="padding:12px;background:#ecfdf5;border:1px solid #34d399;border-radius:8px"><b style="color:#059669">✅ ${d.created}/${d.total} 평가서 생성 완료</b>${d.failed?`<br><span style="color:#ef4444">실패 ${d.failed}건</span>`:''}</div>`;
      _beStudents = []; beRender();
    } catch(e) { out.innerHTML = '<div style="color:#ef4444">❌ '+esc(e.message)+'</div>'; }
  };
})();
