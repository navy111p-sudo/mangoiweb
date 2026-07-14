// ═══════════════════════════════════════════════════════════════
// adm-p1.js — admin.html 인라인 스크립트 추출 (2단계, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function initRetentionCenterHub(){
  'use strict';
  // ── 허브 멤버 정의 (첫 항목 = 신규 전염 위험 탭) ─────────────────────────
  var MEMBERS = [
    { id: '__contagion',         ko: '🕸 전염 위험',  en: '🕸 Contagion' },
    { id: 'card-retention-risk', ko: '🚨 이탈 위험',  en: '🚨 At-Risk' },
    { id: 'card-referral',       ko: '🎁 추천 보상',  en: '🎁 Referrals' },
    { id: 'card-nps-monthly',    ko: '🌟 월간 NPS',   en: '🌟 NPS' },
    { id: 'card-alumni',         ko: '🏆 동문',       en: '🏆 Alumni' },
    { id: '__coaching',          ko: '💼 강사 코칭',  en: '💼 Coaching' }
  ];
  var VIRTUAL_TABS = ['__contagion', '__coaching'];
  var MEMBER_CARD_IDS = MEMBERS.map(function(m){ return m.id; }).filter(function(id){ return VIRTUAL_TABS.indexOf(id) === -1; });
  var anchor = document.getElementById('card-retention-risk');
  if (!anchor || document.getElementById('card-retention-center')) return;

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  var isEn = function(){ return typeof adminLang !== 'undefined' && adminLang === 'en'; };

  // ── 허브 카드 생성 + 멤버 카드 DOM 이동 ─────────────────────────────────
  var hub = document.createElement('details');
  hub.className = 'table-card menu-card';
  hub.id = 'card-retention-center';
  hub.setAttribute('data-menu-label-ko', '🧲 리텐션 센터');
  hub.setAttribute('data-menu-label-en', '🧲 Retention Center');
  hub.innerHTML =
    '<summary><span data-ko="🧲 리텐션 센터 — 이탈·전염·NPS·추천·동문" data-en="🧲 Retention Center — churn · contagion · NPS · referral">🧲 리텐션 센터 — 이탈·전염·NPS·추천·동문</span></summary>' +
    '<div class="menu-body"><div class="rc-tabs" id="rc-tabs"></div><div id="rc-panels"></div></div>';
  anchor.parentNode.insertBefore(hub, anchor);

  var tabsEl = hub.querySelector('#rc-tabs');
  var panelsEl = hub.querySelector('#rc-panels');
  var panels = {};

  function contagionHTML(){
    return '' +
      '<div style="background:linear-gradient(135deg,rgba(236,72,153,0.10),rgba(139,92,246,0.06));border:1px solid rgba(236,72,153,0.30);border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:12.5px;color:#fbcfe8;line-height:1.65">' +
      '🕸 <b>이탈 전염 위험</b> — 가족·동반수업·추천 <b>관계망(Neo4j 그래프)</b>에서 이탈 학생과 1~2단계로 연결된 <b>재원생</b>을 찾습니다. ' +
      '본인 행동엔 문제가 없어도 형제·단짝이 그만두면 따라 나가기 쉽습니다. 점수 = 관계 강도(가족 &gt; 추천 &gt; 동반수업) × 거리 감쇠의 합.' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
      '<button id="rc-cg-refresh" style="padding:6px 14px;font-size:12.5px;border-radius:8px;cursor:pointer">🔍 위험 목록 조회</button>' +
      '<button id="rc-cg-sync" style="padding:6px 14px;font-size:12.5px;border-radius:8px;cursor:pointer">🔄 그래프 동기화 (D1→Neo4j)</button>' +
      '<span id="rc-cg-stats" style="font-size:12px;color:#9ca3af"></span>' +
      '</div>' +
      '<div id="rc-cg-note" style="display:none;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:10px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);color:#fcd34d"></div>' +
      '<div id="rc-cg-body"></div>';
  }

  MEMBERS.forEach(function(m){
    var pan = document.createElement('div');
    pan.className = 'rc-panel';
    pan.dataset.panel = m.id;
    if (m.id === '__contagion') {
      pan.innerHTML = contagionHTML();
    } else if (m.id === '__coaching') {
      pan.innerHTML = coachingHTML();
    } else {
      var card = document.getElementById(m.id);
      if (!card) return;
      // menu-card 클래스는 유지(RBAC 가시성 정책이 계속 적용되도록). 사이드바 중복은
      // 아래 buildMenuIndex 래퍼가 인덱스에서 걸러낸다.
      card.classList.add('rc-member');
      card.open = true;
      pan.appendChild(card);
    }
    panelsEl.appendChild(pan);
    panels[m.id] = pan;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rc-tab';
    btn.dataset.tab = m.id;
    btn.textContent = isEn() ? m.en : m.ko;
    btn.addEventListener('click', function(ev){ ev.stopPropagation(); activate(m.id); });
    tabsEl.appendChild(btn);
  });

  function memberVisible(id){
    if (VIRTUAL_TABS.indexOf(id) !== -1) return true;
    var el = document.getElementById(id);
    return !!el && el.style.display !== 'none';
  }
  function activate(id){
    if (!panels[id] || !memberVisible(id)) return;
    Object.keys(panels).forEach(function(k){ panels[k].style.display = (k === id ? '' : 'none'); });
    tabsEl.querySelectorAll('.rc-tab').forEach(function(b){ b.classList.toggle('active', b.dataset.tab === id); });
    // 데이터는 허브가 실제로 열려 있을 때만 lazy 조회(페이지 로드마다 API 안 때리게)
    if (id === '__contagion' && hub.open && !panels.__contagion.dataset.loaded) loadContagion();
    if (id === '__coaching' && hub.open && !panels.__coaching.dataset.loaded) loadCoaching();
  }
  function syncTabVisibility(){
    var activeGone = false;
    tabsEl.querySelectorAll('.rc-tab').forEach(function(b){
      var vis = memberVisible(b.dataset.tab);
      b.style.display = vis ? '' : 'none';
      if (!vis && b.classList.contains('active')) activeGone = true;
    });
    if (activeGone) activate('__contagion');
    // 탭 라벨 언어 동기화
    tabsEl.querySelectorAll('.rc-tab').forEach(function(b){
      var m = MEMBERS.filter(function(x){ return x.id === b.dataset.tab; })[0];
      if (m) b.textContent = isEn() ? m.en : m.ko;
    });
  }
  activate('__contagion');
  // 허브를 처음 펼치는 순간 활성 탭이 전염 위험이면 lazy 로드
  hub.addEventListener('toggle', function(){
    if (!hub.open) return;
    var act = tabsEl.querySelector('.rc-tab.active');
    if (act && act.dataset.tab === '__contagion' && !panels.__contagion.dataset.loaded) loadContagion();
    if (act && act.dataset.tab === '__coaching' && !panels.__coaching.dataset.loaded) loadCoaching();
  });

  // ── 🕸 전염 위험 탭 로직 ────────────────────────────────────────────────
  function api(path, opts){
    return fetch('/api/admin/churn-contagion/' + path,
      Object.assign({ cache: 'no-store', credentials: 'include' }, opts || {}))
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, body: j }; }); });
  }
  function note(msg){
    var n = document.getElementById('rc-cg-note');
    if (!n) return;
    if (!msg) { n.style.display = 'none'; return; }
    n.style.display = '';
    n.innerHTML = msg;
  }
  var REL_KO = { FAMILY_OF: '가족', REFERRED: '추천', TOOK_CLASS_WITH: '동반수업' };
  var BAND_KO = { high: '높음', medium: '주의', low: '낮음' };

  function loadStats(){
    api('stats').then(function(res){
      var el = document.getElementById('rc-cg-stats');
      if (!el) return;
      if (res.status !== 200 || !res.body.ok) { el.textContent = ''; return; }
      var s = res.body.students || {}, r = res.body.relationships || {};
      el.textContent = '그래프: 재원 ' + (s.active || 0) + ' · 이탈 ' + (s.churned || 0) +
        ' | 관계: 가족 ' + (r.family || 0) + ' · 동반수업 ' + (r.coClass || 0) + ' · 추천 ' + (r.referral || 0);
    }).catch(function(){});
  }

  function renderRows(rows){
    var body = document.getElementById('rc-cg-body');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<div style="padding:18px;text-align:center;color:#9ca3af;font-size:13px">' +
        '전염 위험 학생이 없습니다. 그래프가 비어 있으면 <b>🔄 그래프 동기화</b>를 먼저 실행하세요.</div>';
      return;
    }
    var html = '<table class="rc-cg-table"><thead><tr>' +
      '<th>#</th><th>학생</th><th>위험도</th><th>점수</th><th>이탈 이웃</th><th>연결된 이탈자</th><th></th>' +
      '</tr></thead><tbody>';
    rows.forEach(function(r, i){
      var contacts = (r.contacts || []).map(function(c){
        return esc(c.name || c.uid) + (c.hops === 1 ? '' : '(2홉)');
      }).join(', ');
      html += '<tr data-uid="' + esc(r.uid) + '">' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(r.name || r.uid) + '</b><br><span style="color:#9ca3af;font-size:11px">' + esc(r.uid) + '</span></td>' +
        '<td><span class="rc-band ' + esc(r.band) + '">' + (BAND_KO[r.band] || r.band) + '</span></td>' +
        '<td>' + esc(r.score) + '</td>' +
        '<td>' + esc(r.churnedContacts) + '명</td>' +
        '<td style="max-width:300px">' + contacts + '</td>' +
        '<td><button type="button" class="rc-cg-detail" data-uid="' + esc(r.uid) + '" style="padding:3px 10px;font-size:11.5px;border-radius:6px;cursor:pointer">경로</button></td>' +
        '</tr>' +
        '<tr class="rc-cg-detail-row" data-detail="' + esc(r.uid) + '" style="display:none"><td colspan="7" id="rc-cg-detail-' + esc(r.uid) + '"></td></tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;
    body.querySelectorAll('.rc-cg-detail').forEach(function(b){
      b.addEventListener('click', function(){ toggleDetail(b.dataset.uid); });
    });
  }

  function chainHTML(p){
    // chain: [이탈자, (중간), 대상 학생] / relTypes: 각 구간 관계
    var parts = [];
    (p.chain || []).forEach(function(n, i){
      var st = n.status === 'churned' ? ' <span style="color:#f87171">(이탈)</span>' : '';
      parts.push('<b>' + esc(n.name || n.uid) + '</b>' + st);
      if (p.relTypes && p.relTypes[i]) {
        parts.push('<span class="rc-rel">' + (REL_KO[p.relTypes[i]] || p.relTypes[i]) + '</span>');
      }
    });
    return '<div class="rc-chain">' + parts.join(' ') + '</div>';
  }

  function toggleDetail(uid){
    var row = document.querySelector('.rc-cg-detail-row[data-detail="' + uid + '"]');
    var cell = document.getElementById('rc-cg-detail-' + uid);
    if (!row || !cell) return;
    if (row.style.display !== 'none') { row.style.display = 'none'; return; }
    row.style.display = '';
    if (cell.dataset.loaded) return;
    cell.innerHTML = '<span style="color:#9ca3af;font-size:12px">경로 조회 중…</span>';
    api('student?uid=' + encodeURIComponent(uid)).then(function(res){
      if (res.status !== 200 || !res.body.ok) {
        cell.innerHTML = '<span style="color:#f87171;font-size:12px">' + esc(res.body.error || '조회 실패') + '</span>';
        return;
      }
      cell.dataset.loaded = '1';
      var paths = res.body.paths || [];
      cell.innerHTML = paths.length
        ? '<div style="font-size:11.5px;color:#9ca3af;margin-bottom:4px">이탈자 → 이 학생으로 이어지는 관계 경로 (' + paths.length + '건)</div>' + paths.map(chainHTML).join('')
        : '<span style="color:#9ca3af;font-size:12px">경로 없음</span>';
    }).catch(function(e){
      cell.innerHTML = '<span style="color:#f87171;font-size:12px">' + esc(e && e.message || '네트워크 오류') + '</span>';
    });
  }

  function loadContagion(){
    var body = document.getElementById('rc-cg-body');
    if (body) body.innerHTML = '<div style="padding:18px;text-align:center;color:#9ca3af;font-size:13px">위험 목록 조회 중…</div>';
    note('');
    loadStats();
    api('risk?limit=50').then(function(res){
      panels.__contagion.dataset.loaded = '1';
      if (res.status === 503) {
        note('⚠ Neo4j 미설정 또는 연결 불가 — NEO4J_QUERY_URL/USER/PASSWORD 시크릿을 확인하세요.<br><span style="color:#9ca3af">' + esc(res.body.error || '') + '</span>');
        if (body) body.innerHTML = '';
        return;
      }
      if (res.status !== 200 || !res.body.ok) {
        note('⚠ 조회 실패: ' + esc(res.body.error || ('HTTP ' + res.status)));
        if (body) body.innerHTML = '';
        return;
      }
      renderRows(res.body.rows || []);
    }).catch(function(e){
      note('⚠ 네트워크 오류: ' + esc(e && e.message || e));
      if (body) body.innerHTML = '';
    });
  }

  document.getElementById('rc-cg-refresh').addEventListener('click', function(ev){
    ev.stopPropagation(); loadContagion();
  });
  document.getElementById('rc-cg-sync').addEventListener('click', function(ev){
    ev.stopPropagation();
    var btn = ev.currentTarget;
    btn.disabled = true; btn.textContent = '🔄 동기화 중…';
    api('sync', { method: 'POST' }).then(function(res){
      btn.disabled = false; btn.textContent = '🔄 그래프 동기화 (D1→Neo4j)';
      if (res.status !== 200 || !res.body.ok) {
        note('⚠ 동기화 실패: ' + esc(res.body.error || ('HTTP ' + res.status)));
        return;
      }
      var s = res.body.synced || {};
      note('✅ 동기화 완료 — 학생 ' + (s.students || 0) + '명(이탈 ' + (s.churned || 0) + ') · 가족쌍 ' + (s.familyPairs || 0) +
        ' · 동반수업쌍 ' + (s.classPairs || 0) + ' · 추천쌍 ' + (s.referralPairs || 0) +
        ((s.notes && s.notes.length) ? '<br><span style="color:#9ca3af">' + s.notes.map(esc).join('<br>') + '</span>' : ''));
      loadContagion();
    }).catch(function(e){
      btn.disabled = false; btn.textContent = '🔄 그래프 동기화 (D1→Neo4j)';
      note('⚠ 네트워크 오류: ' + esc(e && e.message || e));
    });
  });

  // ── 💼 강사 코칭 대시보드 탭 로직 ──────────────────────────────────────────
  //   기존 평가 API(/api/admin/ratings/*)만 사용 — 백엔드 변경 없음.
  //   강사별 평균 별점(1~7) · 평가수 · 낮은평가 · 자주받은태그 → 코칭 상태 자동 분류.
  function L(ko, en){ return isEn() ? en : ko; }
  var coachDays = 30;

  function coachingHTML(){
    return '' +
      '<div style="background:linear-gradient(135deg,rgba(139,92,246,0.10),rgba(236,72,153,0.06));border:1px solid rgba(139,92,246,0.30);border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:12.5px;color:#ddd6fe;line-height:1.65">' +
      '💼 <b>' + L('강사 코칭 대시보드', 'Teacher Coaching Dashboard') + '</b> — ' +
      L('학생이 준 <b>수업 별점(1~7)</b>·평가수·낮은평가·자주 받은 태그로 강사를 자동 분류합니다. 흥미도가 낮은 강사를 골라 <b>1:1 데이터 코칭</b>에 연결하세요. 기준: 평균 6.0↑ 우수 · 5.0↑ 안정 · 5.0↓ 집중 코칭.',
        'Auto-classifies teachers by student <b>class ratings (1–7)</b>, volume, low-scores, and frequent tags. Route low-engagement teachers into <b>1:1 data coaching</b>. Bands: avg 6.0+ Excellent · 5.0+ Solid · below 5.0 Needs coaching.') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
      '<label style="font-size:12px;color:#9ca3af">' + L('기간', 'Period') +
      ' <select id="rc-co-days" style="padding:5px 8px;font-size:12.5px;border-radius:8px">' +
      '<option value="7">' + L('최근 7일', 'Last 7d') + '</option>' +
      '<option value="30" selected>' + L('최근 30일', 'Last 30d') + '</option>' +
      '<option value="90">' + L('최근 90일', 'Last 90d') + '</option></select></label>' +
      '<button id="rc-co-refresh" style="padding:6px 14px;font-size:12.5px;border-radius:8px;cursor:pointer">🔍 ' + L('강사 평가 조회', 'Load ratings') + '</button>' +
      '<a href="/teacher-training.html" target="_blank" rel="noopener" style="padding:6px 14px;font-size:12.5px;border-radius:8px;cursor:pointer;text-decoration:none;border:1px solid rgba(148,163,184,.35);color:inherit">📘 ' + L('교육 매뉴얼', 'Training manual') + '</a>' +
      '<span id="rc-co-stats" style="font-size:12px;color:#9ca3af"></span>' +
      '</div>' +
      '<div id="rc-co-note" style="display:none;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:10px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);color:#fcd34d"></div>' +
      '<div id="rc-co-body"></div>' +
      // 🤖 수업별 AI 코칭 피드백(교사에게 자동으로 뜬 것) — 품질 검수용
      '<div style="border-top:1px solid rgba(148,163,184,.2);margin:18px 0 12px"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">' +
      '<b style="font-size:13px;color:#e9d5ff">🤖 ' + L('수업별 AI 코칭 (최근)', 'Per-class AI coaching (recent)') + '</b>' +
      '<button id="rc-aifb-refresh" style="padding:5px 12px;font-size:12px;border-radius:8px;cursor:pointer">↻ ' + L('새로고침', 'Refresh') + '</button>' +
      '<span id="rc-aifb-stats" style="font-size:12px;color:#9ca3af"></span>' +
      '</div>' +
      '<div style="font-size:11.5px;color:#9ca3af;margin-bottom:8px;line-height:1.6">' +
      L('수업이 끝나면 강사에게 자동으로 뜬 AI 코칭입니다. AI가 제대로 짚는지 여기서 검수하세요.',
        'AI coaching shown to teachers right after class. Review here whether the AI is on point.') + '</div>' +
      '<div id="rc-aifb-body"></div>';
  }

  function coachApi(qs){
    return fetch('/api/admin/ratings/' + qs,
      { cache: 'no-store', credentials: 'include' })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, body: j }; }); });
  }
  function coNote(msg){
    var n = document.getElementById('rc-co-note');
    if (!n) return;
    if (!msg) { n.style.display = 'none'; return; }
    n.style.display = ''; n.innerHTML = msg;
  }
  function coachBand(avg){
    if (avg == null || isNaN(avg)) return { b: 'medium', k: '데이터 부족', e: 'Low data' };
    if (avg >= 6.0) return { b: 'low',    k: '우수',      e: 'Excellent' };
    if (avg >= 5.0) return { b: 'medium', k: '안정',      e: 'Solid' };
    return                { b: 'high',   k: '집중 코칭',  e: 'Needs coaching' };
  }
  function starBar(avg){
    var pct = Math.max(0, Math.min(100, (Number(avg) / 7) * 100));
    var col = avg >= 6 ? '#34d399' : (avg >= 5 ? '#fbbf24' : '#f87171');
    return '<div style="display:flex;align-items:center;gap:6px">' +
      '<div style="width:60px;height:6px;border-radius:999px;background:rgba(148,163,184,.2);overflow:hidden">' +
      '<div style="width:' + pct.toFixed(0) + '%;height:100%;background:' + col + '"></div></div>' +
      '<b style="color:' + col + '">' + Number(avg).toFixed(1) + '</b><span style="color:#9ca3af;font-size:11px">/7</span></div>';
  }
  function tagChips(tags){
    if (!tags || !tags.length) return '<span style="color:#9ca3af;font-size:11px">—</span>';
    return tags.slice(0, 3).map(function(t){
      var label = (t && t.tag != null) ? t.tag : t;
      var cnt = (t && t.count != null) ? (' ' + t.count) : '';
      return '<span style="display:inline-block;margin:1px 3px 1px 0;padding:1px 8px;border-radius:6px;font-size:10.5px;background:rgba(139,92,246,.15);color:#c4b5fd;border:1px solid rgba(139,92,246,.3)">' + esc(label) + cnt + '</span>';
    }).join('');
  }

  function renderCoaching(rows){
    var body = document.getElementById('rc-co-body');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<div style="padding:18px;text-align:center;color:#9ca3af;font-size:13px">' +
        L('해당 기간에 제출된 수업 별점이 없습니다. 수업 종료 후 학생이 강사를 평가하면 여기에 집계됩니다.',
          'No class ratings submitted in this period. Once students rate teachers after class, they aggregate here.') + '</div>';
      return;
    }
    rows.sort(function(a, b){ return (b.avg_score || 0) - (a.avg_score || 0); });
    var th = ['#', L('강사','Teacher'), L('평균 별점','Avg rating'), L('평가수','Ratings'),
              L('낮은평가(≤3)','Low(≤3)'), L('자주 받은 태그','Top tags'), L('코칭 상태','Status'), ''];
    var html = '<table class="rc-cg-table"><thead><tr>' +
      th.map(function(h){ return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function(r, i){
      var name = r.teacher_name || '(unknown)';
      var st = coachBand(r.avg_score);
      var low = Number(r.low_count || 0);
      html += '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(name) + '</b></td>' +
        '<td>' + starBar(r.avg_score || 0) + '</td>' +
        '<td>' + esc(r.count || 0) + '</td>' +
        '<td>' + (low > 0 ? '<span style="color:#f87171;font-weight:700">' + low + '</span>' : '0') + '</td>' +
        '<td style="max-width:220px">' + tagChips(r.top_tags) + '</td>' +
        '<td><span class="rc-band ' + st.b + '">' + L(st.k, st.e) + '</span></td>' +
        '<td><button type="button" class="rc-co-fb" data-t="' + esc(name) + '" style="padding:3px 10px;font-size:11.5px;border-radius:6px;cursor:pointer">' + L('피드백','Feedback') + '</button></td>' +
        '</tr>' +
        '<tr class="rc-co-fb-row" data-fb="' + esc(name) + '" style="display:none"><td colspan="8" id="rc-co-fb-' + esc(name).replace(/[^a-zA-Z0-9]/g,'_') + '"></td></tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;
    body.querySelectorAll('.rc-co-fb').forEach(function(btn){
      btn.addEventListener('click', function(){ toggleFeedback(btn.dataset.t); });
    });
  }

  function toggleFeedback(teacher){
    var safe = teacher.replace(/[^a-zA-Z0-9]/g, '_');
    var row = document.querySelector('.rc-co-fb-row[data-fb="' + teacher.replace(/"/g,'\\"') + '"]');
    var cell = document.getElementById('rc-co-fb-' + safe);
    if (!row || !cell) return;
    if (row.style.display !== 'none') { row.style.display = 'none'; return; }
    row.style.display = '';
    if (cell.dataset.loaded) return;
    cell.innerHTML = '<span style="color:#9ca3af;font-size:12px">' + L('피드백 조회 중…','Loading feedback…') + '</span>';
    coachApi('list?teacher_name=' + encodeURIComponent(teacher) + '&days=' + coachDays + '&limit=20').then(function(res){
      if (res.status !== 200 || !res.body.ok) {
        cell.innerHTML = '<span style="color:#f87171;font-size:12px">' + esc((res.body && res.body.error) || (L('조회 실패','Load failed'))) + '</span>';
        return;
      }
      cell.dataset.loaded = '1';
      var list = (res.body.rows || []).filter(function(x){ return x.feedback || (x.tags && x.tags !== '[]'); });
      if (!list.length) { cell.innerHTML = '<span style="color:#9ca3af;font-size:12px">' + L('작성된 피드백/태그가 없습니다.','No written feedback or tags.') + '</span>'; return; }
      cell.innerHTML = '<div style="font-size:11.5px;color:#9ca3af;margin-bottom:4px">' + L('학생이 남긴 최근 평가','Recent student feedback') + ' (' + list.length + ')</div>' +
        list.map(function(x){
          var tg = '';
          try { var arr = JSON.parse(x.tags || '[]'); tg = (arr || []).map(function(t){ return '<span class="rc-rel">' + esc(t) + '</span>'; }).join(' '); } catch(e){}
          var sc = Number(x.score || 0);
          var scol = sc >= 6 ? '#34d399' : (sc >= 5 ? '#fbbf24' : '#f87171');
          return '<div class="rc-chain"><b style="color:' + scol + '">★' + esc(x.score) + '</b> ' +
            '<span style="color:#9ca3af">' + esc(x.rated_date || '') + ' · ' + esc(x.student_name || x.student_uid || '') + '</span> ' + tg +
            (x.feedback ? '<br><span style="color:#d1d5db">“' + esc(x.feedback) + '”</span>' : '') + '</div>';
        }).join('');
    }).catch(function(e){
      cell.innerHTML = '<span style="color:#f87171;font-size:12px">' + esc((e && e.message) || (L('네트워크 오류','Network error'))) + '</span>';
    });
  }

  // ── 🤖 수업별 AI 코칭 피드백 검수 ──────────────────────────────────────────
  function aifbApi(qs){
    return fetch('/api/ai-feedback' + qs, { cache: 'no-store', credentials: 'include' })
      .then(function(r){ return r.json().then(function(j){ return { status: r.status, body: j }; }); });
  }
  function fbChip(txt, col){
    return '<span style="display:inline-block;margin:0 4px 0 0;padding:1px 8px;border-radius:6px;font-size:10.5px;' +
      'background:rgba(148,163,184,.12);color:' + col + ';border:1px solid rgba(148,163,184,.25)">' + txt + '</span>';
  }
  function fbMetricChips(m){
    if (!m) return '';
    var out = '';
    if (m.talk_ratio != null) out += fbChip(L('발화','Talk') + ' ' + Math.round(m.talk_ratio) + '%', (m.talk_ratio > 60 ? '#fbbf24' : '#34d399'));
    if (m.praise_count != null) out += fbChip(L('칭찬','Praise') + ' ' + m.praise_count, '#93c5fd');
    if (m.engagement) out += fbChip(L('참여','Eng') + ' ' + esc(m.engagement), (m.engagement === 'low' ? '#f87171' : (m.engagement === 'fair' ? '#fbbf24' : '#34d399')));
    return out;
  }
  function fbFmtDate(ts){
    if (!ts) return '';
    var d = new Date(ts); var p = function(n){ return ('0' + n).slice(-2); };
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function renderAiFeedback(rows){
    var body = document.getElementById('rc-aifb-body'); if (!body) return;
    if (!rows.length){
      body.innerHTML = '<div style="padding:14px;text-align:center;color:#9ca3af;font-size:12.5px">' +
        L('아직 생성된 AI 코칭이 없습니다. 강사가 수업을 마치면 여기에 쌓입니다.',
          'No AI coaching yet. It accumulates as teachers finish classes.') + '</div>';
      return;
    }
    var en = isEn();
    body.innerHTML = rows.map(function(r){
      var fb = (en ? r.feedback_en : r.feedback_ko) || r.feedback_en || r.feedback_ko || {};
      var good = (fb.good || []).map(function(g){ return '<div style="color:#d1d5db;margin:1px 0">· ' + esc(g) + '</div>'; }).join('');
      var srcBadge = (r.source && r.source !== 'ai') ? '<span style="font-size:10px;color:#fca5a5;margin-left:4px">(' + esc(r.source) + ')</span>' : '';
      return '<div style="border:1px solid rgba(148,163,184,.18);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:rgba(30,41,59,.35)">' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px">' +
          '<b style="color:#e9d5ff;font-size:12.5px">' + esc(r.teacher_name || r.teacher_uid || '(unknown)') + '</b>' +
          '<span style="color:#9ca3af;font-size:11px">· ' + esc(r.student_name || '') +
            (r.duration_min ? (' · ' + r.duration_min + L('분','m')) : '') + ' · ' + esc(fbFmtDate(r.generated_at)) + '</span>' + srcBadge +
          '<span style="margin-left:auto">' + fbMetricChips(r.metrics) + '</span>' +
        '</div>' +
        '<div style="font-size:11.5px">' +
          '<div style="color:#34d399;font-weight:700;margin-bottom:2px">👍 ' + L('잘한 점','Good') + '</div>' + good +
          '<div style="color:#fbbf24;font-weight:700;margin:5px 0 2px">💡 ' + L('개선','Improve') + '</div>' +
          '<div style="color:#d1d5db">' + esc(fb.improve || '') + '</div>' +
          '<div style="color:#7dd3fc;font-weight:700;margin:5px 0 2px">🎯 ' + L('실천','Action') + '</div>' +
          '<div style="color:#e0f2fe">' + esc(fb.action || '') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  function loadAiFeedback(){
    var body = document.getElementById('rc-aifb-body'); if (!body) return;
    body.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:12.5px">' + L('AI 코칭 불러오는 중…','Loading AI coaching…') + '</div>';
    aifbApi('?recent=1&days=' + coachDays + '&limit=50').then(function(res){
      if (res.status !== 200 || !res.body.ok){
        body.innerHTML = '<div style="padding:12px;color:#f87171;font-size:12px">' + esc((res.body && res.body.error) || ('HTTP ' + res.status)) + '</div>';
        return;
      }
      var rows = res.body.rows || [];
      var st = document.getElementById('rc-aifb-stats');
      if (st) st.innerHTML = L('최근','Recent') + ' <b>' + rows.length + '</b>' + L('건','');
      renderAiFeedback(rows);
    }).catch(function(e){
      body.innerHTML = '<div style="padding:12px;color:#f87171;font-size:12px">' + esc((e && e.message) || e) + '</div>';
    });
  }

  function loadCoaching(){
    var body = document.getElementById('rc-co-body');
    var sel = document.getElementById('rc-co-days');
    if (sel) coachDays = Number(sel.value) || 30;
    if (body) body.innerHTML = '<div style="padding:18px;text-align:center;color:#9ca3af;font-size:13px">' + L('강사 평가 집계 중…','Aggregating ratings…') + '</div>';
    coNote('');
    loadAiFeedback();   // 🤖 수업별 AI 코칭 검수 섹션도 함께 로드
    coachApi('summary?days=' + coachDays).then(function(res){
      panels.__coaching.dataset.loaded = '1';
      if (res.status !== 200 || !res.body.ok) {
        coNote('⚠ ' + L('조회 실패','Load failed') + ': ' + esc((res.body && res.body.error) || ('HTTP ' + res.status)));
        if (body) body.innerHTML = '';
        return;
      }
      var rows = res.body.rows || [];
      var totalRatings = res.body.total || rows.reduce(function(s, r){ return s + (r.count || 0); }, 0);
      var withData = rows.filter(function(r){ return (r.count || 0) > 0; });
      var sumW = withData.reduce(function(s, r){ return s + (r.count || 0); }, 0) || 1;
      var overall = withData.length ? (withData.reduce(function(s, r){ return s + (r.avg_score || 0) * (r.count || 0); }, 0) / sumW) : 0;
      var coachNeed = rows.filter(function(r){ return coachBand(r.avg_score).b === 'high'; }).length;
      var st = document.getElementById('rc-co-stats');
      if (st) st.innerHTML = L('강사','Teachers') + ' <b>' + rows.length + '</b> · ' +
        L('평가','Ratings') + ' <b>' + totalRatings + '</b> · ' +
        L('전체 평균','Overall avg') + ' <b>' + overall.toFixed(1) + '/7</b> · ' +
        '<span style="color:#f87171">' + L('집중 코칭','Needs coaching') + ' ' + coachNeed + '</span>';
      renderCoaching(rows);
    }).catch(function(e){
      coNote('⚠ ' + L('네트워크 오류','Network error') + ': ' + esc((e && e.message) || e));
      if (body) body.innerHTML = '';
    });
  }

  (function bindCoaching(){
    var refresh = document.getElementById('rc-co-refresh');
    if (refresh) refresh.addEventListener('click', function(ev){ ev.stopPropagation(); loadCoaching(); });
    var sel = document.getElementById('rc-co-days');
    if (sel) sel.addEventListener('change', function(ev){ ev.stopPropagation(); coachDays = Number(sel.value) || 30; loadCoaching(); });
    var aiRefresh = document.getElementById('rc-aifb-refresh');
    if (aiRefresh) aiRefresh.addEventListener('click', function(ev){ ev.stopPropagation(); loadAiFeedback(); });
  })();

  // ── 기존 내비게이션(사이드바·검색·AI 점프)과 호환 ─────────────────────────
  // 멤버 카드 id 로 점프하면 허브를 열고 해당 탭을 활성화
  var _origJump = window.jumpToMenu;
  window.jumpToMenu = function(id, opts){
    if (panels[id]) {
      hub.open = true;
      activate(id);
      return _origJump.call(this, 'card-retention-center', opts);
    }
    return _origJump.call(this, id, opts);
  };

  // 사이드바/검색 인덱스: 멤버 카드는 걸러내고 허브 1개만 + 멤버별 검색 별칭 추가
  // (RBAC 의 _applyMenuVisibility 가 buildMenuIndex 를 다시 부르므로 래핑으로 항상 유지)
  try { if (typeof SB_ID_MAP === 'object') SB_ID_MAP['card-retention-center'] = 'dash'; } catch(e){}
  var _origBMI = window.buildMenuIndex;
  if (typeof _origBMI === 'function') {
    window.buildMenuIndex = function(){
      _origBMI.apply(this, arguments);
      try {
        var dropLabels = {};
        _menuIndex.forEach(function(m){ if (MEMBER_CARD_IDS.indexOf(m.id) !== -1) { dropLabels[m.ko] = 1; dropLabels[m.en] = 1; } });
        _menuIndex = _menuIndex.filter(function(m){ return MEMBER_CARD_IDS.indexOf(m.id) === -1; });
        _globalSearchIndex = _globalSearchIndex.filter(function(it){
          return !(it.kind === 'menu' && (dropLabels[it.label] || dropLabels[it.labelEn]));
        });
        // 멤버별 검색 별칭 — "이탈", "NPS" 등으로 검색해도 허브의 해당 탭으로 연결
        MEMBERS.forEach(function(m){
          if (VIRTUAL_TABS.indexOf(m.id) !== -1) return;
          var card = document.getElementById(m.id);
          if (!card || card.style.display === 'none') return;
          _globalSearchIndex.push({
            kind: 'menu', kindLabelKo: '📋 메뉴', kindLabelEn: '📋 Menu',
            label: m.ko + ' (리텐션 센터)', labelEn: m.en + ' (Retention Center)', sub: '',
            action: (function(id){ return function(){ window.jumpToMenu(id); }; })(m.id)
          });
        });
        _globalSearchIndex.push({
          kind: 'menu', kindLabelKo: '📋 메뉴', kindLabelEn: '📋 Menu',
          label: '🕸 이탈 전염 위험 (리텐션 센터)', labelEn: '🕸 Churn Contagion (Retention Center)', sub: '',
          action: function(){ window.jumpToMenu('__contagion'); }
        });
        _globalSearchIndex.push({
          kind: 'menu', kindLabelKo: '📋 메뉴', kindLabelEn: '📋 Menu',
          label: '💼 강사 코칭 대시보드 (리텐션 센터)', labelEn: '💼 Teacher Coaching (Retention Center)', sub: '',
          action: function(){ window.jumpToMenu('__coaching'); }
        });
        renderSidebar();
        syncTabVisibility();
      } catch(e){ /* 인덱스 필터 실패해도 메뉴 자체는 동작 */ }
    };
    window.buildMenuIndex();
  }
})();
