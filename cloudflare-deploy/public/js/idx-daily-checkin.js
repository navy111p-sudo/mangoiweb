// idx-daily-checkin.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

(function(){
  const L = () => (window.getLang ? window.getLang() : 'ko') === 'ko';
  function getModal(){
    let ov = document.getElementById('feat-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'feat-overlay'; ov.className = 'feat-overlay';
      ov.onclick = (e) => { if (e.target === ov && (window.mgBackdropClosable ? window.mgBackdropClosable(ov) : true)) closeFeat(); };   /* QA#4 */
      document.body.appendChild(ov);
    }
    return ov;
  }
  window.closeFeat = function(){
    const ov = document.getElementById('feat-overlay');
    if (ov) ov.classList.remove('show');
    document.body.style.overflow = '';
  };

  // ════════════════ 🔥 출석 체크 ════════════════
  window.openDailyCheckin = async function(){
    const ov = getModal();
    if (ov.classList.contains('show') && ov.dataset.feat === 'checkin') { closeFeat(); return; }
    ov.dataset.feat = 'checkin';
    await renderDailyCheckin();
  };
  async function renderDailyCheckin(){
    const ov = getModal();
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    const isKo = L();
    if (!u) {
      if (typeof openLoginModal === 'function') { openLoginModal(); return; }
      alert(isKo?'로그인이 필요합니다':'Login required'); return;
    }
    // 최근 30일 출석 기록 — localStorage 기반 (서버 attendance와 별개로 표시용)
    const todayStr = new Date().toISOString().slice(0,10);
    const key = 'mangoi_checkin_' + u.uid;
    let log = {};
    try { log = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
    const alreadyToday = !!log[todayStr];
    // 연속 출석 일수 계산
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const s = d.toISOString().slice(0,10);
      if (log[s]) { streak++; d.setDate(d.getDate() - 1); }
      else { if (i === 0 && !alreadyToday) { d.setDate(d.getDate() - 1); continue; } break; }
    }
    // 7주 캘린더 (오늘 기준 -6주 ~ 이번주)
    const today = new Date(); today.setHours(0,0,0,0);
    const startDay = new Date(today); startDay.setDate(today.getDate() - today.getDay() - 42); // 7주 전 일요일
    let calHtml = '';
    const dn = ['일','월','화','수','목','금','토'];
    calHtml += '<div class="cal-streak-row">'+dn.map(d=>`<div style="text-align:center;font-size:11px;color:#94a3b8;font-weight:700">${d}</div>`).join('')+'</div>';
    for (let w = 0; w < 7; w++) {
      calHtml += '<div class="cal-streak-row">';
      for (let i = 0; i < 7; i++) {
        const cur = new Date(startDay); cur.setDate(startDay.getDate() + w*7 + i);
        const sStr = cur.toISOString().slice(0,10);
        const isFuture = cur.getTime() > today.getTime();
        const isToday = sStr === todayStr;
        const done = !!log[sStr];
        const cls = ['cal-streak-day', done?'done':'', isToday?'today':'', isFuture?'future':''].filter(Boolean).join(' ');
        const lbl = done ? '🔥' : String(cur.getDate());
        calHtml += `<div class="${cls}" title="${sStr}">${lbl}</div>`;
      }
      calHtml += '</div>';
    }
    const monthDone = Object.keys(log).filter(k => k.startsWith(new Date().toISOString().slice(0,7))).length;
    ov.innerHTML = `<div class="feat-modal">
      <div class="feat-head">
        <span style="font-size:28px">🔥</span>
        <h2>${isKo?'출석 체크':'Daily Check-in'}</h2>
        <button class="feat-close" onclick="closeFeat()">✕</button>
      </div>
      <div class="feat-body">
        <div style="display:flex;gap:10px;margin-bottom:18px">
          <div style="flex:1;background:linear-gradient(135deg,#f59e0b,#ef4444);padding:14px 16px;border-radius:12px;text-align:center">
            <div style="font-size:11px;color:rgba(255,255,255,.85);text-transform:uppercase;letter-spacing:.5px">${isKo?'연속':'Streak'}</div>
            <div style="font-size:28px;font-weight:900;color:#fff">🔥 ${streak}${isKo?'일':' days'}</div>
          </div>
          <div style="flex:1;background:rgba(255,255,255,.05);padding:14px 16px;border-radius:12px;text-align:center;border:1px solid rgba(255,255,255,.08)">
            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">${isKo?'이번 달':'This Month'}</div>
            <div style="font-size:28px;font-weight:900;color:#fde68a">${monthDone}${isKo?'일':' days'}</div>
          </div>
        </div>
        <div style="margin-bottom:14px">${calHtml}</div>
        <button id="checkin-btn" ${alreadyToday?'disabled':''} onclick="doDailyCheckin('${u.uid}','${escapeAttr(u.name||'')}','${todayStr}')"
                style="width:100%;padding:14px;background:${alreadyToday?'rgba(255,255,255,.08)':'linear-gradient(135deg,#fbbf24,#f59e0b)'};color:${alreadyToday?'#94a3b8':'#1a1a1a'};border:0;border-radius:12px;font-size:15px;font-weight:800;cursor:${alreadyToday?'default':'pointer'};box-shadow:${alreadyToday?'none':'0 6px 20px -4px rgba(245,158,11,.5)'}">
          ${alreadyToday ? (isKo?'✅ 오늘 출석 완료':'✅ Checked in today') : (isKo?'🔥 오늘 출석하기 +10P':'🔥 Check in +10P')}
        </button>
        <div style="margin-top:12px;font-size:11.5px;color:#94a3b8;text-align:center;line-height:1.6">
          ${isKo?'7일 연속 +20P · 30일 연속 +100P 보너스':'7-day streak +20P · 30-day streak +100P bonus'}
        </div>
      </div>
    </div>`;
    ov.classList.add('show');

  };
  window.doDailyCheckin = async function(uid, name, todayStr){
    // 1) localStorage 기록
    const key = 'mangoi_checkin_' + uid;
    let log = {};
    try { log = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
    log[todayStr] = Date.now();
    localStorage.setItem(key, JSON.stringify(log));
    // 2) 서버 적립
    try {
      const r = await fetch('/api/points/earn-by-rule', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ user_id: uid, token: (function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })(), student_name: name, rule_code: 'attendance', meta:{source:'daily_checkin'}})
      });
      const d = await r.json();
      if (d.ok) {
        alert((L()?'🔥 출석 +':'🔥 Check-in +') + (d.rule?.amount||10) + 'P');
        if (typeof refreshPointsChip === 'function') refreshPointsChip(true);
      } else if (d.error === 'cooldown' || d.error === 'daily_cap_reached') {
        alert(L()?'✅ 이미 오늘 출석했어요':'✅ Already checked in today');
      }
    } catch(e) {}
    renderDailyCheckin(); // 다시 그리기
  };

  // ════════════════ 🏆 학원 랭킹 ════════════════
  window.openLeaderboard = async function(){
    const ov = getModal();
    if (ov.classList.contains('show') && ov.dataset.feat === 'leaderboard') { closeFeat(); return; }
    ov.dataset.feat = 'leaderboard';
    const isKo = L();
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    ov.innerHTML = `<div class="feat-modal">
      <div class="feat-head">
        <span style="font-size:28px">🏆</span>
        <h2>${isKo?'학원 랭킹 — 이번 달':'Leaderboard — This Month'}</h2>
        <button class="feat-close" onclick="closeFeat()">✕</button>
      </div>
      <div class="feat-body" id="lb-body">${isKo?'불러오는 중…':'Loading…'}</div>
    </div>`;
    ov.classList.add('show');

    // 학원 랭킹 fetch (전용 공개 엔드포인트 — top-N + 이름·누적포인트만)
    try {
      /* 🔐 (2026-08-28) 서버가 더는 user_id 를 내려주지 않는다 — 학생은 비밀번호가 없어
         «아이디를 아는 것 = 로그인» 이라, 공개 랭킹에 아이디를 실으면 계정을 나눠 주는 셈이었다.
         「(나)」 표시는 서버가 판정해 주는 row.me 로 받는다(uid 는 보내기만 한다). */
      const r = await fetch('/api/points/leaderboard?limit=10' + (u && u.uid ? '&uid=' + encodeURIComponent(u.uid) : ''));
      const d = await r.json();
      const all = (d.rows || []).slice().sort((a,b) => (b.lifetime_earned||0) - (a.lifetime_earned||0)).slice(0, 10);
      const meIdx = all.findIndex(x => x.me);
      const rowsHtml = all.length === 0
        ? `<div style="padding:40px;text-align:center;color:#94a3b8">${isKo?'아직 활동 데이터가 없습니다.':'No activity yet.'}</div>`
        : all.map((s, i) => {
            const rankCls = i===0?'g1':(i===1?'g2':(i===2?'g3':''));
            const rankIcon = i===0?'🥇':(i===1?'🥈':(i===2?'🥉':(i+1)));
            const isMe = !!s.me;
            const name = s.student_name || (isKo ? '이름 없음' : 'No name');
            return `<div class="lb-row ${isMe?'me':''}">
              <div class="lb-rank ${rankCls}">${rankIcon}</div>
              <div class="lb-name">${escapeText(name)}${isMe?(isKo?' <span style="font-size:11px;color:#fde68a;font-weight:600">(나)</span>':' <span style="font-size:11px;color:#fde68a;font-weight:600">(me)</span>'):''}</div>
              <div class="lb-pts">${(s.lifetime_earned||0).toLocaleString('ko-KR')} P</div>
            </div>`;
          }).join('');
      const myStat = (u && meIdx < 0)
        ? `<div style="margin-top:16px;padding:14px;background:rgba(251,191,36,.08);border:1px dashed rgba(251,191,36,.35);border-radius:12px;text-align:center;font-size:13px;color:#fde68a">${isKo?'TOP 10 진입까지 분발하세요! 🔥':'Keep going to enter TOP 10! 🔥'}</div>`
        : '';
      document.getElementById('lb-body').innerHTML = rowsHtml + myStat;
    } catch(e) {
      document.getElementById('lb-body').innerHTML = `<div style="padding:30px;text-align:center;color:#ef4444">${isKo?'로드 실패':'Load failed'}</div>`;
    }
  };

  // ════════════════ 🎯 학습 목표 / 30일 챌린지 ════════════════
  window.openLearningGoals = function(){
    const ov = getModal();
    if (ov.classList.contains('show') && ov.dataset.feat === 'goals') { closeFeat(); return; }
    ov.dataset.feat = 'goals';
    const isKo = L();
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    // 메인 로그인 한 번이면 자동 사용 — 비로그인이면 guest 로 작동
    const uid = u ? u.uid : 'guest';
    // 챌린지 진행 — localStorage
    const key = 'mangoi_goals_' + uid;
    let goals = [];
    try { goals = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    if (!goals.length) {
      // 기본 챌린지 4개
      const now = Date.now();
      goals = [
        { id:'attend30', label:isKo?'30일 출석':'30-day Attendance', target:30, current:0, reward:500, created:now },
        { id:'study50', label:isKo?'수업 50회 듣기':'50 Classes', target:50, current:0, reward:1000, created:now },
        { id:'words100', label:isKo?'단어 100개 학습':'100 Words Learned', target:100, current:0, reward:300, created:now },
        { id:'speak10', label:isKo?'발음연습 10회':'Speech Practice ×10', target:10, current:0, reward:200, created:now },
      ];
      localStorage.setItem(key, JSON.stringify(goals));
    }
    const cards = goals.map(g => {
      const pct = Math.min(100, Math.round((g.current/g.target)*100));
      const done = g.current >= g.target;
      return `<div class="gl-card" style="${done?'border-color:#fbbf24;background:rgba(251,191,36,.10)':''}">
        <div class="gl-title">${done?'🏆':'🎯'} ${escapeText(g.label)}</div>
        <div class="gl-progress-wrap"><div class="gl-progress-bar" style="width:${pct}%"></div></div>
        <div class="gl-meta">
          <span>${g.current} / ${g.target} (${pct}%)</span>
          <span style="color:#fde68a">${done?(isKo?'✅ 보상 수령 가능':'✅ Claim reward'):''} 🎁 ${g.reward}P</span>
        </div>
      </div>`;
    }).join('');
    ov.innerHTML = `<div class="feat-modal">
      <div class="feat-head">
        <span style="font-size:28px">🎯</span>
        <h2>${isKo?'학습 목표 · 30일 챌린지':'Learning Goals · 30-day Challenge'}</h2>
        <button class="feat-close" onclick="closeFeat()">✕</button>
      </div>
      <div class="feat-body">
        <div style="background:rgba(96,165,250,.07);border:1px solid rgba(96,165,250,.25);border-left:4px solid #60a5fa;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:12.5px;line-height:1.6;color:#bfdbfe">
          🎯 ${isKo?'목표를 달성하면 자동으로 포인트가 적립됩니다. 매일 조금씩 꾸준히!':'Complete goals to earn points automatically. Small daily steps!'}
        </div>
        ${cards}
      </div>
    </div>`;
    ov.classList.add('show');

  };

  function escapeText(s) { return String(s||'').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'})[c]); }
  function escapeAttr(s) { return escapeText(s); }
})();

