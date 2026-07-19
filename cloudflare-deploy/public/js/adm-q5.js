// ═══════════════════════════════════════════════════════════════
// adm-q5.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  function getSeed() {
    let s=[], b=[], a=[];
    try { s = JSON.parse(localStorage.getItem('mangoi_test_students') || '[]'); } catch{}
    try { b = JSON.parse(localStorage.getItem('mangoi_test_branches') || '[]'); } catch{}
    try { a = JSON.parse(localStorage.getItem('mangoi_test_agencies') || '[]'); } catch{}
    return { students:s, branches:b, agencies:a };
  }
  function _esc(s){return String(s||'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));}

  // ━━━ fetch 인터셉터 ━━━ admin API 호출 시 시드 데이터를 응답에 자동 합산
  // 시드 데이터 강제 보장 (페이지 로드 즉시)
  function ensureSeed() {
    try { localStorage.removeItem('mangoi_test_students'); localStorage.removeItem('mangoi_test_branches'); localStorage.removeItem('mangoi_test_agencies'); } catch{}
    return { students:[], branches:[], agencies:[] };
  }
  // 페이지 로드 즉시 시드 보장
  ensureSeed();

  // 🚫 가짜 시드 fetch 인터셉터 완전 제거 (2026-07-02)
  //    예전엔 /api/admin/students·/api/dashboard 등의 응답을 가짜 시드 데이터로
  //    바꿔치기했으나, 이제 window.fetch 를 건드리지 않고 항상 실제 서버 응답을 쓴다.

  // ━━━ DOM 직접 주입 (인터셉터로 안 잡히는 경우 안전망) ━━━
  function injectStudents() {
    const data = getSeed();
    if (!data.students.length) return;
    // 학생목록
    const sm = document.getElementById('sm-students-table');
    if (sm) {
      let tbody = sm.querySelector('tbody');
      if (!tbody) { tbody = document.createElement('tbody'); sm.appendChild(tbody); }
      // 기존 test row 정리
      Array.from(tbody.querySelectorAll('tr.seed-row')).forEach(tr => tr.remove());
      data.students.forEach(s => {
        const tr = document.createElement('tr');
        tr.className = 'seed-row';
        tr.innerHTML = `
          <td><code>${_esc(s.user_id)}</code> <span style="background:#dcfce7;color:#15803d;font-size:9px;padding:1px 6px;border-radius:99px;margin-left:4px;font-weight:700">TEST</span></td>
          <td><b>${_esc(s.name)}</b> <span class="role-badge" style="background:#dbeafe;color:#1e40af;font-size:9px;padding:1px 5px;border-radius:99px">${_esc(s.level)}</span></td>
          <td><span class="sess-count">${s.classes_used||0}</span></td>
          <td><div class="date-line"><span class="date-d">${_esc(s.grade||'-')}</span><span class="date-t">${_esc(s.franchise||'')}</span></div></td>
          <td><div class="date-line"><span class="date-d">${_esc(s.teacher||'-')}</span><span class="date-t">잔여 ${(s.classes_total - s.classes_used)||0}회</span></div></td>
          <td><a href="/admin/student?uid=${encodeURIComponent(s.user_id)}" target="_blank">🎓 상세보기</a></td>`;
        tbody.appendChild(tr);
      });
    }
    // 학생 결제 내역
    const payTb = document.getElementById('acc-pay-tbody');
    if (payTb) {
      Array.from(payTb.querySelectorAll('tr.seed-row')).forEach(tr => tr.remove());
      const empty = payTb.querySelector('tr td.empty');
      if (empty) empty.parentElement.remove();
      data.students.forEach((s, i) => {
        const date = new Date(Date.now()-86400000*Math.floor(Math.random()*30));
        const dateStr = date.toISOString().slice(0,10);
        const tr = document.createElement('tr');
        tr.className = 'seed-row';
        tr.innerHTML = `
          <td>${dateStr}</td>
          <td><b>${_esc(s.name)}</b> <span style="background:#dcfce7;color:#15803d;font-size:9px;padding:1px 5px;border-radius:99px;margin-left:3px">TEST</span></td>
          <td>${_esc(s.program)}</td>
          <td style="text-align:right;font-family:Consolas,monospace;color:#10b981;font-weight:700">₩${(s.amount||0).toLocaleString('ko-KR')}</td>
          <td>${['card','bank','kakao','toss'][i%4]}</td>
          <td><span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">paid</span></td>
          <td>${_esc(s.franchise||'-')}</td>`;
        payTb.appendChild(tr);
      });
    }
    // 미수금 (랜덤 일부 학생)
    const arTb = document.getElementById('acc-ar-tbody');
    if (arTb) {
      Array.from(arTb.querySelectorAll('tr.seed-row')).forEach(tr => tr.remove());
      const empty = arTb.querySelector('tr td.empty');
      if (empty) empty.parentElement.remove();
      data.students.slice(0, 5).forEach((s, i) => {
        const dueAmt = Math.floor(s.amount * 0.3);
        const days = randInt(7, 60);
        const tr = document.createElement('tr');
        tr.className = 'seed-row';
        tr.innerHTML = `
          <td><b>${_esc(s.name)}</b></td>
          <td>${_esc(s.program)}</td>
          <td style="text-align:right;font-family:Consolas,monospace;color:#dc2626;font-weight:700">₩${dueAmt.toLocaleString('ko-KR')}</td>
          <td>${days}일 경과</td>
          <td>${_esc(s.franchise||'-')}</td>
          <td><button style="padding:3px 8px;font-size:11px;background:#fef3c7;color:#92400e;border:0;border-radius:4px;cursor:pointer">독촉</button></td>`;
        arTb.appendChild(tr);
      });
    }
  }
  function randInt(a,b){return Math.floor(a+Math.random()*(b-a+1));}

  function injectFranchises() {
    const data = getSeed();
    if (!data.branches.length && !data.agencies.length) return;
    const ftb = document.getElementById('franchises-table');
    if (ftb) {
      Array.from(ftb.querySelectorAll('tr.seed-row')).forEach(tr => tr.remove());
      const empty = ftb.querySelector('tr td.empty');
      if (empty) empty.parentElement.remove();
      data.branches.forEach(b => {
        const tr = document.createElement('tr');
        tr.className = 'seed-row';
        tr.innerHTML = `
          <td><b>🏬 ${_esc(b.name)}</b> <span style="background:#dcfce7;color:#15803d;font-size:9px;padding:1px 5px;border-radius:99px">TEST</span></td>
          <td>${_esc(b.city)} ${_esc(b.district)}</td>
          <td>${_esc(b.manager_name||'-')} · ${_esc(b.manager_phone||'-')}</td>
          <td style="text-align:right">${b.students_count||0}명</td>
          <td style="text-align:right;color:#10b981">₩${(b.monthly_revenue||0).toLocaleString('ko-KR')}</td>
          <td><span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${b.status==='active'?'운영중':'대기'}</span></td>`;
        ftb.appendChild(tr);
      });
      data.agencies.forEach(a => {
        const tr = document.createElement('tr');
        tr.className = 'seed-row';
        tr.innerHTML = `
          <td><b>🤝 ${_esc(a.name)}</b> <span style="background:#dcfce7;color:#15803d;font-size:9px;padding:1px 5px;border-radius:99px">TEST</span></td>
          <td>${_esc(a.parent_branch||'-')}</td>
          <td>${_esc(a.owner_name||'-')} · ${_esc(a.owner_phone||'-')}</td>
          <td style="text-align:right">${a.students_count||0}명</td>
          <td style="text-align:right;color:#10b981">₩${(a.monthly_revenue||0).toLocaleString('ko-KR')}</td>
          <td><span style="background:${a.status==='active'?'#d1fae5;color:#065f46':a.status==='pending'?'#fef3c7;color:#92400e':'#fee2e2;color:#991b1b'};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${a.status}</span></td>`;
        ftb.appendChild(tr);
      });
    }
    // 가맹점 정산 (회계)
    const frTb = document.getElementById('acc-fr-tbody');
    if (frTb) {
      Array.from(frTb.querySelectorAll('tr.seed-row')).forEach(tr => tr.remove());
      const empty = frTb.querySelector('tr td.empty');
      if (empty) empty.parentElement.remove();
      data.branches.forEach(b => {
        const commission = Math.floor(b.monthly_revenue * 0.15);
        const net = b.monthly_revenue - commission;
        const tr = document.createElement('tr');
        tr.className = 'seed-row';
        tr.innerHTML = `
          <td><b>${_esc(b.name)}</b></td>
          <td style="text-align:right">${b.students_count||0}명</td>
          <td style="text-align:right;font-family:Consolas,monospace">₩${(b.monthly_revenue||0).toLocaleString('ko-KR')}</td>
          <td style="text-align:right;color:#dc2626">₩${commission.toLocaleString('ko-KR')}</td>
          <td style="text-align:right;color:#10b981;font-weight:700">₩${net.toLocaleString('ko-KR')}</td>
          <td>15%</td>`;
        frTb.appendChild(tr);
      });
    }
  }

  // ━━━ KPI 및 카운터 자동 갱신 ━━━
  function updateCounters() {
    const data = getSeed();
    // 권한 설정의 카운터
    const cntStu = document.getElementById('cnt-student');
    if (cntStu) cntStu.textContent = (512 + data.students.length) + '명';
    const cntBranch = document.getElementById('cnt-branch');
    if (cntBranch) cntBranch.textContent = (8 + data.branches.length) + '명';
    const cntAgency = document.getElementById('cnt-agency');
    if (cntAgency) cntAgency.textContent = (15 + data.agencies.length) + '명';
  }

  // ━━━ 마스터 동기화 ━━━
  function syncAll() {
    try {
      injectStudents();
      injectFranchises();
      updateCounters();
    } catch (e) { console.warn('[seed-sync]', e); }
  }

  // 다양한 트리거에서 동기화 호출
  function setupTriggers() {
    syncAll();
    // 모든 details 토글 시 (메뉴 펼침)
    document.querySelectorAll('details').forEach(d => {
      d.addEventListener('toggle', () => { if (d.open) setTimeout(syncAll, 100); });
    });
    // 모든 button 클릭 후 (불러오기 등)
    document.addEventListener('click', () => setTimeout(syncAll, 600), true);
    // 주기적 백스톱 → DOM 변화감지 스케줄러로 라우팅(유휴 시 폴링 제거). setupTriggers 이중호출 대비 1회만 등록
    if (!window.__ph_syncAllSettleBound) {
      window.__ph_syncAllSettleBound = true;
      (window.__admSettleRun ? window.__admSettleRun(syncAll) : setInterval(syncAll, 5000));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTriggers);
  } else {
    setupTriggers();
  }
  // 추가 안전망
  setTimeout(setupTriggers, 800);
  setTimeout(syncAll, 2000);
  window.__seedSyncAll = syncAll;

  // ━━━━━━━━━━ 학생관리 5개 섹션 자동 로드 (페이지 진입 즉시) ━━━━━━━━━━
  // loadExpiring / loadTodayAttend / loadStreakRanking / loadRecentConsult / loadBulkList
  // → 사용자가 [불러오기] 버튼을 누르지 않아도 시드 학생들이 자동으로 표시되도록
  function autoLoadStudentMgmt() {
    try { window._erpCache = null; } catch{}
    const fns = ['loadExpiring','loadTodayAttend','loadStreakRanking','loadRecentConsult','loadBulkList'];
    fns.forEach(fn => {
      try { if (typeof window[fn] === 'function') window[fn](); }
      catch (e) { console.warn('[seed-autoload]', fn, e); }
    });
  }
  // 첫 진입 시 1회 자동 로드 (DOM·스크립트 모두 준비된 후)
  if (document.readyState === 'complete') {
    setTimeout(autoLoadStudentMgmt, 1500);
  } else {
    window.addEventListener('load', () => setTimeout(autoLoadStudentMgmt, 1500));
  }
  // 추가 재시도 (loadExpiring 등이 늦게 정의되는 경우 대비)
  setTimeout(autoLoadStudentMgmt, 3500);
  setTimeout(autoLoadStudentMgmt, 6000);
  window.__autoLoadStudentMgmt = autoLoadStudentMgmt;

  // ━━━━━━━━━━ 💥 최후의 수단 — DOM 직접 강제 주입 ━━━━━━━━━━
  // fetch 인터셉터·load 함수가 어떤 이유로든 실패해도 시드 학생이 무조건 표시되도록
  function forceRenderStudentMgmt() {
    return; // 🚫 테스트 시드 강제렌더 영구 비활성화
    const data = ensureSeed();
    if (!data.students || !data.students.length) return;
    const today = new Date(); today.setHours(0,0,0,0);

    // 시드 학생들에게 end_date 부여 (만료 임박/정상 분포)
    const enriched = data.students.map((s, i) => {
      const endOffset = (i < 3) ? -3 + i : (i < 6) ? 5 + (i-3)*3 : 30 + (i-6)*5;
      const endDate = new Date(today.getTime() + endOffset*86400000);
      return { ...s, end_date: endDate.toISOString().slice(0,10), dDay: endOffset };
    });

    function drill(uid, tab) {
      return '<a href="/admin/student?uid='+encodeURIComponent(uid)+(tab?'&tab='+tab:'')+'" target="_blank" style="padding:4px 10px;font-size:11px;background:#f59e0b;color:#fff;border-radius:4px;text-decoration:none;font-weight:600;white-space:nowrap;">🔍 자세히</a>';
    }

    // ── 1) 만료 임박 (sm-expiring-tbody) ──
    const expTb = document.getElementById('sm-expiring-tbody');
    const expCnt = document.getElementById('sm-expiring-count');
    if (expTb) {
      const winEl = document.getElementById('sm-expiring-window');
      const days = winEl ? parseInt(winEl.value, 10) || 30 : 30;
      const filtered = enriched
        .filter(s => days === 0 ? s.dDay < 0 : (s.dDay >= 0 && s.dDay <= days))
        .sort((a,b) => a.dDay - b.dDay);
      if (filtered.length > 0) {
        expTb.innerHTML = filtered.map(s => {
          const cls = s.dDay < 0 ? 'background:rgba(239,68,68,.15);color:#dc2626;font-weight:700'
                    : s.dDay <= 7 ? 'background:rgba(245,158,11,.15);color:#d97706;font-weight:700'
                    : 'color:#666';
          const dStr = s.dDay < 0 ? 'D+' + Math.abs(s.dDay) : (s.dDay === 0 ? 'D-DAY' : 'D-' + s.dDay);
          return '<tr>'
               + '<td>'+_esc(s.name)+' <span style="background:#dcfce7;color:#15803d;font-size:9px;padding:1px 6px;border-radius:99px;font-weight:700">TEST</span></td>'
               + '<td>'+_esc(s.end_date)+'</td>'
               + '<td><span style="'+cls+';padding:2px 8px;border-radius:10px;font-size:11px">'+dStr+'</span></td>'
               + '<td>'+_esc(s.franchise||'강남점')+'</td>'
               + '<td>'+drill(s.user_id,'extension')+'</td>'
               + '</tr>';
        }).join('');
        if (expCnt) expCnt.textContent = filtered.length + '명';
      }
    }

    // ── 2) 오늘 출결 (sm-today-body) ──
    const todayBody = document.getElementById('sm-today-body');
    const todaySum = document.getElementById('sm-today-summary');
    if (todayBody && (todayBody.textContent.includes('로딩') || todayBody.children.length === 0)) {
      const rows = enriched.slice(0, 50).map(s =>
        '<tr>'
        + '<td><b>'+_esc(s.name)+'</b> <span style="background:#dcfce7;color:#15803d;font-size:9px;padding:1px 6px;border-radius:99px;font-weight:700">TEST</span></td>'
        + '<td>'+_esc(s.franchise||'강남점')+'</td>'
        + '<td>'+(2 + Math.floor(Math.random()*3))+'회</td>'
        + '<td>'+drill(s.user_id,'attend')+'</td>'
        + '</tr>'
      ).join('');
      todayBody.innerHTML = ''
        + '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:12px;color:#92400e">'
        +   '💡 시드 모드 — 가짜 테스트 학생 '+enriched.length+'명 표시중. 학생별 🔍 클릭으로 캘린더 확인.'
        + '</div>'
        + '<table>'
        +   '<thead><tr><th>이름</th><th>가맹점</th><th>주당</th><th>액션</th></tr></thead>'
        +   '<tbody>'+rows+'</tbody>'
        + '</table>';
      if (todaySum) todaySum.textContent = '오늘 총 세션: ' + Math.floor(enriched.length*0.6) + ' · 전체 학생: ' + enriched.length;
    }

    // ── 3) 연속 출석 랭킹 (sm-streak-tbody) — 출결 기준 실데이터(권위 리더보드)로 로드.
    //    예전엔 여기서 랜덤 TEST 값을 채웠으나, /api/streak/leaderboard 단일 권위로 대체.
    //    (비어 있으면 loadStreakRanking 이 "🔁 일괄 재계산 먼저" 힌트를 표시)
    const streakTb = document.getElementById('sm-streak-tbody');
    if (streakTb && (streakTb.textContent.includes('로딩') || streakTb.textContent.includes('계산') || streakTb.children.length === 0 || streakTb.children.length === 1)) {
      try { loadStreakRanking(); } catch {}
    }

    // ── 4) 최근 상담 (sm-consult-tbody) ──
    const consTb = document.getElementById('sm-consult-tbody');
    const consCnt = document.getElementById('sm-consult-count');
    if (consTb && (consTb.textContent.includes('로딩') || consTb.children.length === 0 || consTb.children.length === 1)) {
      const channels = ['phone','kakao','visit','email','online'];
      const topics = ['진도 상담','결제 문의','시간 변경 요청','강사 변경 요청','휴학 상담','만족도 피드백','수업 분량 상담'];
      const statuses = ['open','resolved','escalated'];
      const consults = [];
      enriched.slice(0, 12).forEach((s, i) => {
        if (i % 2 === 0) {
          consults.push({
            consult_at: Date.now() - Math.floor(Math.random()*7*86400000),
            _name: s.name, _uid: s.user_id,
            channel: channels[i % channels.length],
            topic: topics[i % topics.length],
            status: statuses[i % statuses.length],
          });
        }
      });
      consults.sort((a,b) => b.consult_at - a.consult_at);
      consTb.innerHTML = consults.map(c => {
        const d = new Date(c.consult_at);
        const dStr = d.toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
        const stCls = c.status === 'open' ? 'background:#fef3c7;color:#92400e' : c.status === 'resolved' ? 'background:#d1fae5;color:#065f46' : 'background:#fee2e2;color:#991b1b';
        return '<tr>'
             + '<td>'+dStr+'</td>'
             + '<td>'+_esc(c._name)+' <span style="background:#dcfce7;color:#15803d;font-size:9px;padding:1px 6px;border-radius:99px;font-weight:700">TEST</span></td>'
             + '<td>'+_esc(c.channel)+'</td>'
             + '<td>'+_esc(c.topic)+'</td>'
             + '<td><span style="'+stCls+';padding:2px 8px;border-radius:10px;font-size:11px">'+_esc(c.status)+'</span></td>'
             + '<td>'+drill(c._uid,'consult')+'</td>'
             + '</tr>';
      }).join('');
      if (consCnt) consCnt.textContent = consults.length + '건';
    }

    // ── 5) 단체 톡짹톡 (sm-bulk-tbody) ──
    const bulkTb = document.getElementById('sm-bulk-tbody');
    if (bulkTb && (bulkTb.textContent.includes('로딩') || bulkTb.children.length === 0 || bulkTb.children.length === 1)) {
      bulkTb.innerHTML = enriched.map(s =>
        '<tr>'
        + '<td><input type="checkbox" data-stuid="'+_esc(s.user_id)+'" data-name="'+_esc(s.name)+'" data-stuphone="'+_esc(s.phone||'')+'" onchange="updateBulkCount&&updateBulkCount()"></td>'
        + '<td>'+_esc(s.name)+' <span style="background:#dcfce7;color:#15803d;font-size:9px;padding:1px 6px;border-radius:99px;font-weight:700">TEST</span></td>'
        + '<td>'+_esc(s.franchise||'강남점')+'</td>'
        + '<td>—</td>'
        + '<td>—</td>'
        + '<td>'+_esc(_piiPhone(s.phone)||'-')+'</td>'
        + '</tr>'
      ).join('');
    }
  }
  window.__forceRenderStudentMgmt = forceRenderStudentMgmt;
  window.forceRenderStudentMgmt = forceRenderStudentMgmt;  // 콘솔에서 직접 호출용

  // 즉시 1번 실행 (DOM이 이미 준비되어 있으면)
  try { forceRenderStudentMgmt(); console.log('[seed] 강제 렌더 즉시 실행'); }
  catch(e){ console.error('[seed] 즉시 렌더 실패:', e); }

  // 강제 렌더 — 0.3·1·2·3·5·7·10초 + 이후 8초 간격 영구
  [300, 1000, 2000, 3000, 5000, 7000, 10000].forEach(ms => {
    setTimeout(() => {
      try { forceRenderStudentMgmt(); }
      catch(e){ console.error('[seed] '+ms+'ms 렌더 실패:', e); }
    }, ms);
  });
  setInterval(() => {
    try { forceRenderStudentMgmt(); }
    catch(e){ /* silent */ }
  }, 8000);

  // details 토글 시 즉시 강제 렌더
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (t && (t.tagName === 'SUMMARY' || (t.closest && t.closest('summary')))) {
      setTimeout(() => { try { forceRenderStudentMgmt(); } catch{} }, 50);
      setTimeout(() => { try { forceRenderStudentMgmt(); } catch{} }, 250);
    }
  }, true);
})();
