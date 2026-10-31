// ═══════════════════════════════════════════════════════════════
// adm-p7.js — admin.html 인라인 스크립트 추출 (2단계, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  // 🧑‍💼 매니저 판정(강사·직원 명부 공용) — 카페24 is_manager 코드(1/2/null)는 실제와 안 맞음
  //   (값2=Karl·Neha 인데 실매니저=Maimai·Melca·Karl). 회사가 이름으로 관리(adm-lang-boot.js "Manager Maimai/Melca + IT Karl").
  //   Karla·Melcah 같은 유사이름 오탐 방지 위해 토큰 단위 정확일치. 명단 변경 시 여기 한 곳만 고치면 됨.
  const MGR_NAMES = new Set(['maimai','maymai','melca','karl']);
  function isManagerName(name, nickname){
    return ((name||'')+' '+(nickname||'')).toLowerCase().replace(/[()]/g,' ').split(/[^a-z]+/).filter(Boolean).some(function(w){ return MGR_NAMES.has(w); });
  }
  // 강사 풀 (실 운영 시 /api/admin/teachers/list)
  const TEACHER_POOL = [
    { id:1, name:'Maria Santos',   levels:['A1','A2','B1'],     dow:[1,2,3,4,5], slots:['09','10','14','15','19','20'], rating:4.9, avail:true },
    { id:2, name:'James Cruz',     levels:['B1','B2','C1'],     dow:[1,3,5],     slots:['10','11','15','16','19','20','21'], rating:4.8, avail:true },
    { id:3, name:'Anna Reyes',     levels:['A1','A2'],          dow:[2,4,6],     slots:['08','09','10','14','15'], rating:5.0, avail:true },
    { id:4, name:'Carlos Lim',     levels:['A2','B1','B2'],     dow:[1,2,3,4,5], slots:['11','13','14','17','18'], rating:4.9, avail:true },
    { id:5, name:'Sofia Garcia',   levels:['B1','B2','C1','C2'], dow:[1,2,4,5],   slots:['09','10','19','20','21'], rating:4.8, avail:false }, // 결석
    { id:6, name:'Daniel Tan',     levels:['A1','A2','B1'],     dow:[2,3,5,6],   slots:['10','14','15','16','17'], rating:4.9, avail:true },
    { id:7, name:'Rachel Kim',     levels:['B2','C1'],          dow:[1,2,3,4,5], slots:['18','19','20','21'], rating:4.7, avail:true },
    { id:8, name:'Mark Park',      levels:['A1','A2','B1','B2'], dow:[3,4,5,6],   slots:['09','10','11','14','15'], rating:4.8, avail:true },
    { id:9, name:'Linda Chen',     levels:['A2','B1'],          dow:[1,2,3,4],   slots:['08','09','19','20'], rating:4.9, avail:true },
    { id:10, name:'Kevin Lee',     levels:['B1','B2'],          dow:[1,2,3,4,5,6], slots:['10','11','15','16','17','18'], rating:4.7, avail:false }, // 결석
  ];

  // 가상 시간표 — 결석 강사들이 담당했어야 할 수업
  function generateAbsentClasses(date) {
    const d = new Date(date || new Date());
    const dow = d.getDay(); // 0=일요일, 1=월…
    const todayStr = d.toISOString().slice(0,10);
    const absentTeachers = TEACHER_POOL.filter(t => !t.avail);
    const classes = [];
    let id = 1;
    absentTeachers.forEach(t => {
      // 그 강사가 오늘 가르쳐야 했던 수업들 생성 (3-5개)
      const slots = t.slots.slice(0, 3 + Math.floor(Math.random()*3));
      slots.forEach(slot => {
        classes.push({
          id: id++,
          time: slot + ':00',
          dow: dow,
          date: todayStr,
          student: rand(['홍길동','김민수','이지민','박서연','최우진','정수아','강지원','윤하린']),
          level: rand(t.levels),
          absent_teacher: t,
          status: 'pending',
          match: null,
        });
      });
    });
    return classes;
  }
  function rand(arr) { return arr[Math.floor(Math.random()*arr.length)]; }

  // 매칭 알고리즘 — 점수 계산
  function scoreCandidate(absentClass, candidate) {
    if (!candidate.avail) return 0;
    if (candidate.id === absentClass.absent_teacher.id) return 0;
    let score = 0;
    // 1. 요일 일치 (40%)
    if (candidate.dow.includes(absentClass.dow)) score += 40;
    // 2. 시간 일치 (30%)
    const hh = absentClass.time.slice(0,2);
    if (candidate.slots.includes(hh)) score += 30;
    // 3. 레벨 적합도 (20%)
    if (candidate.levels.includes(absentClass.level)) score += 20;
    // 4. 평점 (10%) — 4.5 이상 만점
    score += Math.min(10, (candidate.rating - 4.0) * 20);
    return Math.round(score);
  }

  function findBestSubstitute(absentClass) {
    const ranked = TEACHER_POOL
      .map(t => ({ teacher:t, score: scoreCandidate(absentClass, t) }))
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score);
    return ranked[0] || null;
  }

  let _absentClasses = [];

  // 📈 학생 자가평가 월별 추이 (카페24 자가진단 집계)
  window._selfscoreData = null; window._selfscoreChart = null; window._selfscoreRange = 24;
  window.loadSelfscoreTrend = async function(range){
    range = range || window._selfscoreRange || 24; window._selfscoreRange = range;
    const kpiBox = document.getElementById('selfscore-kpis');
    const cv = document.getElementById('selfscoreChart');
    const chartWrap = document.getElementById('selfscore-chartwrap');
    const fbBox = document.getElementById('selfscore-fallback');
    if (!cv) return;
    document.querySelectorAll('.ss-rbtn').forEach(function(b){ var on = Number(b.getAttribute('data-r'))===Number(range); b.style.background = on?'#3b82f6':'transparent'; b.style.color = on?'#fff':'#94a3b8'; });
    const esc = function(s){ return String(s==null?'':s).replace(/[<>&"]/g,function(c){return({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]);}); };
    try {
      const fetchLim = (range===60) ? 84 : range;
      if (!window._selfscoreData || window._selfscoreData._lim < fetchLim) {
        const d = await (await fetch('/api/admin/selfscore/trend?months='+fetchLim, { credentials:'include' })).json();
        if (!d.ok) throw new Error(d.error||d.code||'error');
        d._lim = fetchLim;
        window._selfscoreData = d;
      }
      const all = (window._selfscoreData.months||[]).slice().reverse(); // 오래된→최근
      const months = (range===60) ? all : all.slice(-range);
      if (!months.length){ if(kpiBox) kpiBox.innerHTML='<div style="color:#94a3b8;grid-column:1/-1;font-size:12px">데이터 없음</div>'; return; }
      const withCnt = months.filter(function(m){ return Number(m.cnt)>0; });
      const overallAvg = withCnt.length ? (withCnt.reduce(function(s,m){return s+Number(m.avg_score);},0)/withCnt.length) : null;
      const totalResp = months.reduce(function(s,m){return s+(Number(m.cnt)||0);},0);
      const last = withCnt[withCnt.length-1], prev = withCnt[withCnt.length-2];
      const trend = (last && prev) ? Math.round((Number(last.avg_score)-Number(prev.avg_score))*100)/100 : null;
      if (kpiBox){
        var kcard = function(lab, val, sub, color){ return '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 14px">'
          + '<div style="font-size:11px;color:#94a3b8">'+lab+'</div>'
          + '<div style="font-size:19px;font-weight:800;color:'+color+';margin-top:3px;letter-spacing:-0.3px">'+val+'</div>'
          + (sub?'<div style="font-size:10.5px;color:#64748b;margin-top:2px">'+sub+'</div>':'')+'</div>'; };
        kpiBox.innerHTML =
          kcard('평균 자가평가 점수', overallAvg!=null?overallAvg.toFixed(2):'—', range===60?'전체 기간':range+'개월 평균', '#a78bfa')
          + kcard('총 응답 수', totalResp.toLocaleString()+'건', (range===60?'전체':range+'개월'), '#60a5fa')
          + kcard('최근월 점수', last?Number(last.avg_score).toFixed(2):'—', last?last.ym:'—', '#34d399')
          + kcard('전월 대비', trend!=null?((trend>=0?'▲ +':'▼ ')+Math.abs(trend)):'—', '변화 추이', (trend!=null&&trend>=0?'#34d399':'#fb7185'));
      }
      const labels = months.map(function(m){ return m.ym.slice(2); });
      const scores = months.map(function(m){ return Number(m.avg_score)||0; });
      const counts = months.map(function(m){ return Number(m.cnt)||0; });
      const renderFallback = function(){
        if (!fbBox) return;
        var mx = Math.max.apply(null, scores.concat([1]));
        fbBox.innerHTML = months.map(function(m){
          var sc = Number(m.avg_score)||0;
          return '<div style="display:grid;grid-template-columns:52px 1fr 90px;gap:8px;align-items:center;font-size:10.5px">'
            + '<span style="color:#94a3b8;font-weight:600">'+m.ym.slice(2)+'</span>'
            + '<div style="background:rgba(167,139,250,0.15);border-radius:99px;height:9px;overflow:hidden"><div style="width:'+Math.max(1,Math.round(sc/mx*100))+'%;height:100%;background:linear-gradient(90deg,#a78bfa,#7c3aed)"></div></div>'
            + '<span style="text-align:right;font-weight:700;color:#c4b5fd">'+sc.toFixed(2)+'</span>'
            + '</div>';
        }).join('');
      };
      if (typeof Chart === 'undefined') {
        if (chartWrap) chartWrap.style.display = 'none';
        if (fbBox) fbBox.style.display = 'flex';
        renderFallback();
        if (!window._selfscoreLoadingChart) {
          window._selfscoreLoadingChart = true;
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
          s.onload = function(){ window._selfscoreLoadingChart = false; window.loadSelfscoreTrend(window._selfscoreRange); };
          s.onerror = function(){ window._selfscoreLoadingChart = false; };
          document.head.appendChild(s);
        }
        return;
      }
      if (chartWrap) chartWrap.style.display = 'block';
      if (fbBox) { fbBox.style.display = 'none'; fbBox.innerHTML = ''; }
      const ctx = cv.getContext('2d');
      const gFill = ctx.createLinearGradient(0,0,0,260); gFill.addColorStop(0,'rgba(167,139,250,0.45)'); gFill.addColorStop(1,'rgba(167,139,250,0.02)');
      if (window._selfscoreChart){ try{ window._selfscoreChart.destroy(); }catch(e){} }
      window._selfscoreChart = new Chart(ctx, {
        data: { labels: labels, datasets: [
          { type:'line', label:'평균 자가평가 점수', data:scores, borderColor:'#a78bfa', backgroundColor:gFill, borderWidth:2.5, pointRadius:2, pointHoverRadius:5, pointBackgroundColor:'#a78bfa', tension:0.35, fill:true, yAxisID:'y' },
          { type:'bar', label:'응답 수', data:counts, backgroundColor:'rgba(96,165,250,0.35)', borderRadius:4, maxBarThickness:14, yAxisID:'y1' }
        ]},
        options: {
          responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false },
          plugins:{
            legend:{ labels:{ color:'#cbd5e1', usePointStyle:true, pointStyle:'rectRounded', padding:14, font:{size:11.5} } },
            tooltip:{ backgroundColor:'#0b1220', borderColor:'#334155', borderWidth:1, padding:10, titleColor:'#f1f5f9', bodyColor:'#cbd5e1' }
          },
          scales:{
            x:{ grid:{ display:false }, ticks:{ color:'#94a3b8', font:{size:10}, maxRotation:0, autoSkip:true, maxTicksLimit:12 } },
            y:{ position:'left', grid:{ color:'rgba(148,163,184,0.12)' }, ticks:{ color:'#a78bfa', font:{size:10} }, title:{ display:true, text:'점수', color:'#a78bfa', font:{size:10} } },
            y1:{ position:'right', grid:{ display:false }, ticks:{ color:'#60a5fa', font:{size:10} }, title:{ display:true, text:'응답수', color:'#60a5fa', font:{size:10} } }
          }
        }
      });
    } catch(e){ if(kpiBox) kpiBox.innerHTML='<div style="color:#f87171;grid-column:1/-1;font-size:12px">집계 실패: '+esc(String(e&&e.message||e))+'</div>'; }
  };

  // 👩‍🏫 강사 명부 (카페24 실데이터) — Neo4j graph-list
  let _trLoaded = false;
  let _trAllRows = [];                                   // 로드된 전체 강사(필터는 서버 재조회 없이 이걸로)
  let _trFilter = { role:'all', status:'active', group:'all' }; // 구분/상태/그룹 3축 필터(AND) · 기본=재직(퇴사 다수 가림)
  // 🧑‍💼 직원 명부 (카페24 실데이터)
  // 🏅 레벨테스트 배치 현황 (카페24 레벨테스트 집계)
  window.loadLeveltestOverview = async function(){
    const kpi = document.getElementById('lt-kpis'), bars = document.getElementById('lt-bars'), rowsEl = document.getElementById('lt-rows');
    if (!rowsEl) return;
    const esc = function(s){ return String(s==null?'':s).replace(/[<>&"]/g,function(c){return({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]);}); };
    rowsEl.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af">불러오는 중…</td></tr>';
    try {
      const d = await (await fetch('/api/admin/leveltest/overview', { credentials:'include' })).json();
      if (!d.ok) throw new Error(d.error||d.code||'error');
      const T = d.totals || { total:0, pass:0, pass_rate:0 };
      if (kpi){
        var card = function(lab,val,col){ return '<div style="padding:12px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:10px"><div style="font-size:11px;color:#6b7280">'+lab+'</div><div style="font-size:18px;font-weight:800;color:'+col+';margin-top:2px">'+val+'</div></div>'; };
        kpi.innerHTML = card('총 응시', T.total.toLocaleString()+'건', '#3b82f6') + card('합격', T.pass.toLocaleString()+'건', '#10b981') + card('합격률', T.pass_rate+'%', '#f59e0b') + card('레벨 종류', (d.by_level||[]).length+'개', '#7c3aed');
      }
      if (bars){
        var lv = d.by_level||[]; var max = Math.max.apply(null, lv.map(function(x){return Number(x.total)||0;}).concat([1]));
        bars.innerHTML = lv.length ? lv.map(function(x){
          var pct = Math.max(2, Math.round((Number(x.total)/max)*100));
          return '<div style="display:grid;grid-template-columns:70px 1fr 150px;gap:8px;align-items:center;font-size:12px">'
            + '<span style="font-weight:700;color:#334155">Lv '+esc(x.level)+'</span>'
            + '<div style="background:#e2e8f0;border-radius:99px;height:14px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:linear-gradient(90deg,#6366f1,#4f46e5)"></div></div>'
            + '<span style="text-align:right;color:#475569">'+Number(x.total).toLocaleString()+'건 · 합격 '+Number(x.pass).toLocaleString()+' (<b style="color:'+(x.pass_rate>=70?'#15803d':x.pass_rate>=40?'#b45309':'#dc2626')+'">'+x.pass_rate+'%</b>)</span>'
            + '</div>';
        }).join('') : '<div style="color:#94a3b8;font-size:12px">데이터 없음</div>';
      }
      var rec = d.recent||[];
      rowsEl.innerHTML = rec.length ? rec.map(function(r){
        var dt = esc(String(r.year||''))+'-'+String(r.month||'').padStart(2,'0')+'-'+String(r.day||'').padStart(2,'0');
        var pass = Number(r.pass)? '<span style="color:#15803d;font-weight:700">합격</span>':'<span style="color:#dc2626">재응시</span>';
        return '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:7px 10px;white-space:nowrap">'+dt+'</td><td style="padding:7px 10px"><code>'+esc(r.user_id)+'</code></td><td style="padding:7px 10px;text-align:center">Lv '+esc(String(r.level||'—'))+'</td><td style="padding:7px 10px;text-align:center">'+pass+'</td><td style="padding:7px 10px;text-align:right">'+esc(String(r.score_sum||0))+'</td></tr>';
      }).join('') : '<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af">응시 기록 없음</td></tr>';
    } catch(e){ rowsEl.innerHTML = '<tr><td colspan="5" style="padding:20px;text-align:center;color:#dc2626">불러오기 실패: '+esc(String(e&&e.message||e))+'</td></tr>'; if(bars) bars.innerHTML=''; }
  };

  // ⭐ 강사 평가·품질 대시보드 (카페24 학생평가·후기 집계)
  window.loadTeacherQuality = async function(){
    const rowsEl = document.getElementById('tq-rows');
    const cardsEl = document.getElementById('tq-cards');
    const sumEl = document.getElementById('tq-summary');
    if (!rowsEl) return;
    const esc = function(s){ return String(s==null?'':s).replace(/[<>&"]/g,function(c){return({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]);}); };
    const sortKey = (document.getElementById('tq-sort')||{}).value || 'review_avg';
    const stars = function(v){ if(v==null) return '<span style="color:#cbd5e1">—</span>'; var full=Math.round(Number(v)); return '<span style="color:#fbbf24">'+'★'.repeat(full)+'</span><span style="color:#e5e7eb">'+'★'.repeat(Math.max(0,5-full))+'</span> <b>'+Number(v).toFixed(1)+'</b>'; };
    const scoreBadge = function(v){ if(v==null) return '<span style="color:#cbd5e1">—</span>'; var n=Number(v); var col=n>=8?'#15803d':n>=6?'#b45309':'#dc2626'; return '<b style="color:'+col+'">'+n.toFixed(1)+'</b>'; };
    rowsEl.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">불러오는 중…</td></tr>';
    try {
      const d = await (await fetch('/api/admin/teachers/graph-list', { credentials:'include' })).json();
      if (!d.ok) throw new Error(d.error||d.code||'error');
      // 평가/후기가 있는 강사만
      let rows = (d.teachers||[]).filter(function(t){ return (t.review_count>0) || (t.score_count>0); });
      rows.sort(function(a,b){ return (Number(b[sortKey])||0) - (Number(a[sortKey])||0); });
      // 상단 요약 카드 (전체 평균)
      if (sumEl) sumEl.textContent = '평가·후기 보유 강사 '+rows.length+'명';
      if (cardsEl){
        var revd = rows.filter(function(t){return t.review_avg!=null;});
        var avgRev = revd.length ? (revd.reduce(function(s,t){return s+Number(t.review_avg);},0)/revd.length) : null;
        var totRev = rows.reduce(function(s,t){return s+(Number(t.review_count)||0);},0);
        var scod = rows.filter(function(t){return t.score_avg!=null;});
        var avgSco = scod.length ? (scod.reduce(function(s,t){return s+Number(t.score_avg);},0)/scod.length) : null;
        var top = revd.slice().sort(function(a,b){return Number(b.review_avg)-Number(a.review_avg);})[0];
        var card = function(lab,val,col){ return '<div style="padding:12px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:10px"><div style="font-size:11px;color:#6b7280">'+lab+'</div><div style="font-size:18px;font-weight:800;color:'+col+';margin-top:2px">'+val+'</div></div>'; };
        cardsEl.innerHTML = card('평균 후기 별점', avgRev!=null?avgRev.toFixed(2)+' ★':'—', '#f59e0b')
          + card('총 후기수', totRev.toLocaleString()+'건', '#3b82f6')
          + card('평균 학생평가', avgSco!=null?avgSco.toFixed(1):'—', '#10b981')
          + card('🏆 최고 강사', top?esc(top.name.trim())+' ('+Number(top.review_avg).toFixed(1)+'★)':'—', '#7c3aed');
      }
      rowsEl.innerHTML = rows.length ? rows.map(function(t,i){
        var rank = i<3 ? ['🥇','🥈','🥉'][i] : (i+1);
        return '<tr style="border-bottom:1px solid #f1f5f9">'
          + '<td style="padding:8px 10px;font-weight:700">'+rank+'</td>'
          + '<td style="padding:8px 10px"><b>'+esc(String(t.name).trim())+'</b>'+(t.group_name?' <span style="color:#94a3b8;font-size:11px">'+esc(t.group_name)+'</span>':'')+'</td>'
          + '<td style="padding:8px 10px;text-align:center">'+stars(t.review_avg)+'</td>'
          + '<td style="padding:8px 10px;text-align:right">'+(Number(t.review_count)||0)+'</td>'
          + '<td style="padding:8px 10px;text-align:center">'+scoreBadge(t.score_avg)+'</td>'
          + '<td style="padding:8px 10px;text-align:right">'+(Number(t.score_count)||0)+'</td>'
          + '<td style="padding:8px 10px;text-align:right">'+(Number(t.class_count)||0).toLocaleString()+'</td>'
          + '<td style="padding:8px 10px;text-align:right">'+(Number(t.student_count)||0).toLocaleString()+'</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">평가·후기 데이터가 있는 강사가 없습니다</td></tr>';
    } catch(e){ rowsEl.innerHTML = '<tr><td colspan="8" style="padding:20px;text-align:center;color:#dc2626">불러오기 실패: '+esc(String(e&&e.message||e))+'</td></tr>'; }
  };

  window.loadStaffRoster = async function(){
    const tb = document.getElementById('sr-rows'); const cnt = document.getElementById('sr-count');
    if (!tb) return;
    const esc = function(s){ return String(s==null?'':s).replace(/[<>&"]/g,function(c){return({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]);}); };
    const q = (document.getElementById('sr-q')||{}).value || '';
    tb.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:#9ca3af">불러오는 중…</td></tr>';
    try {
      const d = await (await fetch('/api/admin/staff/graph-list?q='+encodeURIComponent(q), { credentials:'include' })).json();
      if (!d.ok) throw new Error(d.error||d.code||'error');
      const rows = d.staff||[];
      const _en = (window.adminLang==='en');  // 매니저(Maimai·Melca 등)는 필리핀 직원이라 영어 뷰가 많음 → 배지·상태 이중언어
      if (cnt) cnt.textContent = (_en ? rows.length+' staff' : '총 '+rows.length+'명');
      tb.innerHTML = rows.length ? rows.map(function(s){
        // 상태 3분류: active=재직 / inactive=퇴사 / 그 외(null)=미확인. (강사 명부와 동일 — null 을 퇴사로 찍던 버그 수정)
        var st = s.status;
        /* 🟢🚪❓ 강사 명부와 «같은 세 상태» 라 같은 클래스를 쓴다 — 한 카드 안 두 표가 서로 다른
           색으로 「퇴사」를 말하면 그것이 더 헷갈린다. 색은 admin-inline-c.css 맨 끝
           #card-teacher-mgmt .tr-st-badge 블록 하나가 정한다(인라인 색은 테마 규칙에 눌린다). */
        var stCls = 'tr-st-badge tr-st-' + (st==='active' ? 'active' : (st==='inactive' ? 'inactive' : 'unknown'));
        var stLabel = st==='active' ? (_en?'Active':'재직') : (st==='inactive' ? (_en?'Inactive':'퇴사') : (_en?'Unknown':'미확인'));
        // 매니저 배지: is_manager 코드 대신 공용 이름 명단으로 판정(Maimai·Melca 는 직원으로 등록돼 이 표에 있음)
        var mgr = isManagerName(s.name, s.nickname) ? '<span style="padding:1px 6px;background:#ede9fe;color:#6d28d9;font-size:10px;border-radius:99px;margin-left:4px;font-weight:700">'+(_en?'Manager':'매니저')+'</span>' : '';
        return '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:8px 10px"><b>'+esc(s.name)+'</b>'+(s.nickname && s.nickname!==s.name ?' <span style="color:#94a3b8">('+esc(s.nickname)+')</span>':'')+mgr+'</td>'
          +'<td style="padding:8px 10px;color:#475569">'+esc(s.email||'—')+'</td>'
          +'<td style="padding:8px 10px;color:#64748b;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+esc(s.intro)+'">'+esc(s.intro||'—')+'</td>'
          +'<td style="padding:8px 10px;text-align:center"><span class="'+stCls+'">'+stLabel+'</span></td></tr>';
      }).join('') : '<tr><td colspan="4" style="padding:24px;text-align:center;color:#9ca3af">'+(_en?'No staff':'직원 없음')+'</td></tr>';
    } catch(e){ tb.innerHTML = '<tr><td colspan="4" style="padding:20px;text-align:center;color:#dc2626">불러오기 실패: '+esc(String(e&&e.message||e))+'</td></tr>'; }
  };
  // 📚 교재 명부 (카페24 실데이터)
  window.loadBookRoster = async function(){
    const tb = document.getElementById('br-rows'); const cnt = document.getElementById('br-count');
    if (!tb) return;
    const esc = function(s){ return String(s==null?'':s).replace(/[<>&"]/g,function(c){return({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]);}); };
    const q = (document.getElementById('br-q')||{}).value || '';
    tb.innerHTML = '<tr><td colspan="3" style="padding:24px;text-align:center;color:#9ca3af">불러오는 중…</td></tr>';
    try {
      const d = await (await fetch('/api/admin/books/graph-list?q='+encodeURIComponent(q), { credentials:'include' })).json();
      if (!d.ok) throw new Error(d.error||d.code||'error');
      const rows = d.books||[];
      if (cnt) cnt.textContent = '총 '+rows.length+'권';
      tb.innerHTML = rows.length ? rows.map(function(b){ var a=b.status==='active';
        /* 🟢⏹ 사용/중지 — 위 두 명부와 같은 배지 틀을 쓰되 «중지» 는 회색이다.
           ⛔ 빨강(tr-st-inactive)을 쓰지 않는다 — 중지는 «문제» 가 아니라 «지금 안 쓰는 것» 이라
              빨강을 쓰면 정리해야 할 일처럼 읽힌다. */
        return '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:8px 10px"><b>'+esc(b.name)+'</b></td>'
          +'<td style="padding:8px 10px;color:#64748b;max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+esc(b.memo)+'">'+esc(b.memo||'—')+'</td>'
          +'<td style="padding:8px 10px;text-align:center"><span class="tr-st-badge '+(a?'tr-st-active':'tr-st-off')+'">'+(a?'사용':'중지')+'</span></td></tr>';
      }).join('') : '<tr><td colspan="3" style="padding:24px;text-align:center;color:#9ca3af">교재 없음</td></tr>';
    } catch(e){ tb.innerHTML = '<tr><td colspan="3" style="padding:20px;text-align:center;color:#dc2626">불러오기 실패: '+esc(String(e&&e.message||e))+'</td></tr>'; }
  };

  // 상태 정규화: active=재직 / inactive=퇴사 / 그 외(null=미동기화 신규강사)=미확인. (강사·직원 공용 개념)
  const _trStatKey = s => s==='active' ? 'active' : (s==='inactive' ? 'inactive' : 'unknown');
  const _trStatLabel = (key, en) => key==='active' ? (en?'Active':'재직') : (key==='inactive' ? (en?'Inactive':'퇴사') : (en?'Unknown':'미확인'));

  window.loadTeacherRoster = async function(force) {
    const tb = document.getElementById('tr-rows');
    if (!tb) return;
    const _en = (window.adminLang==='en');
    const q = (document.getElementById('tr-q')||{}).value || '';
    tb.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">'+(_en?'Loading…':'불러오는 중…')+'</td></tr>';
    try {
      const r = await fetch('/api/admin/teachers/graph-list?q=' + encodeURIComponent(q), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'API error');
      _trAllRows = d.teachers || [];
      _trLoaded = true;
      _trFilter = { role:'all', status:'active', group:'all' }; // 새로 불러오면 필터 초기화(기본=재직)
      renderTeacherRoster();
    } catch(e) {
      const esc = s => String(s==null?'':s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
      tb.innerHTML = '<tr><td colspan="8" style="padding:20px;text-align:center;color:#dc2626">'+(_en?'Load failed: ':'불러오기 실패: ')+esc(String(e&&e.message||e))+'</td></tr>';
      const fb = document.getElementById('tr-filters'); if (fb) fb.innerHTML = '';
    }
  };

  // 🔎 필터 설정(구분/상태/그룹) — 서버 재조회 없이 로드된 _trAllRows 를 다시 렌더
  window.trSetFilter = function(kind, val) {
    if (!(kind in _trFilter)) return;
    _trFilter[kind] = decodeURIComponent(val);
    renderTeacherRoster();
  };

  // 필터 통과 여부
  function _trPass(t) {
    const f = _trFilter;
    const mgr = isManagerName(t.name, t.nickname);
    if (f.role==='manager' && !mgr) return false;
    if (f.role==='teacher' && mgr) return false;
    if (f.status!=='all' && _trStatKey(t.status)!==f.status) return false;
    if (f.group!=='all' && (t.group_name||'—')!==f.group) return false;
    return true;
  }

  // 필터바 렌더 — 한 줄 드롭다운(구분·상태·그룹) + 적용된 필터 칩. (2026-07-25 3줄 칩→드롭다운 개선, 한/영)
  function renderTrFilterBar() {
    const bar = document.getElementById('tr-filters');
    if (!bar) return;
    const _en = (window.adminLang==='en');
    const all = _trAllRows;
    const f = _trFilter;
    const esc = s => String(s==null?'':s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
    const mgrN = all.filter(t=>isManagerName(t.name,t.nickname)).length;
    const stN = k => all.filter(t=>_trStatKey(t.status)===k).length;
    const gMap = {}; all.forEach(t=>{ const g=t.group_name||'—'; gMap[g]=(gMap[g]||0)+1; });
    const groups = Object.keys(gMap).sort((a,b)=>gMap[b]-gMap[a]);
    const gLabel = g => (g==='—' ? (_en?'Ungrouped':'미분류') : g);
    // 드롭다운 헬퍼: opts = [[val,label,count],...]
    const sel = (kind, opts) => {
      const on = f[kind] !== 'all';
      return '<select onchange="trSetFilter(\''+kind+'\',encodeURIComponent(this.value))" '
        + 'style="padding:7px 11px;font-size:12.5px;font-weight:600;border-radius:8px;cursor:pointer;border:1px solid '
        + (on?'#8b5cf6':'#d1d5db')+';background:'+(on?'#f5f3ff':'#fff')+';color:'+(on?'#6d28d9':'#334155')+'">'
        + opts.map(o=>'<option value="'+esc(o[0])+'"'+(o[0]===f[kind]?' selected':'')+'>'+esc(o[1])+(o[2]==null?'':' ('+o[2]+')')+'</option>').join('')
        + '</select>';
    };
    const roleSel = sel('role', [['all',(_en?'Type: All':'구분: 전체'),all.length],['manager',(_en?'Manager':'매니저'),mgrN],['teacher',(_en?'Teacher':'일반강사'),all.length-mgrN]]);
    const statusSel = sel('status', [['all',(_en?'Status: All':'상태: 전체'),all.length],['active',(_en?'Active':'재직'),stN('active')],['inactive',(_en?'Inactive':'퇴사'),stN('inactive')],['unknown',(_en?'Unknown':'미확인'),stN('unknown')]]);
    const groupSel = groups.length ? sel('group', [['all',(_en?'Group: All':'그룹: 전체'),all.length]].concat(groups.map(g=>[g, gLabel(g), gMap[g]]))) : '';
    // 적용된 필터 칩(활성 시만)
    const pills = [];
    if (f.role!=='all') pills.push(['role',(_en?'Type':'구분'), f.role==='manager'?(_en?'Manager':'매니저'):(_en?'Teacher':'일반강사')]);
    if (f.status!=='all') pills.push(['status',(_en?'Status':'상태'), _trStatLabel(f.status,_en)]);
    if (f.group!=='all') pills.push(['group',(_en?'Group':'그룹'), gLabel(f.group)]);
    let pillHtml = '';
    if (pills.length) {
      pillHtml = '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px">'
        + '<span style="font-size:11px;color:#9ca3af;font-weight:600">'+(_en?'Applied':'적용된 필터')+'</span>'
        + pills.map(p=>'<span style="display:inline-flex;align-items:center;gap:6px;background:#f5f3ff;border:1px solid #ddd6fe;color:#6d28d9;border-radius:99px;padding:3px 7px 3px 10px;font-size:11.5px;font-weight:600">'
            + esc(p[1])+': <b>'+esc(p[2])+'</b>'
            + '<span onclick="trSetFilter(\''+p[0]+'\',\'all\')" style="cursor:pointer;width:15px;height:15px;border-radius:50%;background:#ddd6fe;color:#6d28d9;display:inline-flex;align-items:center;justify-content:center;font-size:10px">✕</span></span>').join('')
        + '<span onclick="trClearFilters()" style="font-size:11.5px;color:#6b7280;cursor:pointer;text-decoration:underline">'+(_en?'Clear all':'모두 해제')+'</span>'
        + '</div>';
    }
    bar.style.cssText = 'margin-bottom:12px';
    bar.innerHTML = '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'+roleSel+statusSel+groupSel+'</div>'+pillHtml;
  }
  window.trClearFilters = function(){ _trFilter = { role:'all', status:'all', group:'all' }; renderTeacherRoster(); };

  // 강사 명부 렌더(필터+정렬+표) — loadTeacherRoster 와 trSetFilter 가 공용 호출
  function renderTeacherRoster() {
    const tb = document.getElementById('tr-rows');
    const cnt = document.getElementById('tr-count');
    if (!tb) return;
    const _en = (window.adminLang==='en');
    const esc = s => String(s==null?'':s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
    const num = n => (Number(n)||0).toLocaleString();
    renderTrFilterBar();
    const stRank = s => s==='active' ? 0 : (s==='inactive' ? 2 : 1); // 재직 → 미확인 → 퇴사
    const rows = _trAllRows.filter(_trPass).slice().sort((a,b)=>{
      const ra=stRank(a.status), rb=stRank(b.status);
      if (ra!==rb) return ra-rb;                                    // 재직자 우선
      return (Number(b.class_count)||0)-(Number(a.class_count)||0); // 그다음 담당수업 많은 순
    });
    // 표시 N / 전체 N + 기준일 주의(담당수업·학생 수는 2026-07-04 사전계산값)
    if (cnt) {
      const filtered = (_trFilter.role!=='all'||_trFilter.status!=='all'||_trFilter.group!=='all');
      const tip = _en ? 'Classes/Students as of 2026-07-04 (may differ from now)' : '담당수업·담당학생 수는 2026-07-04 집계값 (현재값과 다를 수 있음)';
      cnt.innerHTML = (_en ? ((filtered? rows.length+' / ':'')+_trAllRows.length+' teachers') : ((filtered? '표시 '+rows.length+'명 · ':'')+'총 '+_trAllRows.length+'명'))
        + ' <span title="'+tip+'" style="cursor:help;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#e5e7eb;color:#6b7280;font-size:10px;font-weight:700;vertical-align:middle">i</span>';
    }
    tb.innerHTML = rows.length ? rows.map(t => {
      const mgr = isManagerName(t.name, t.nickname) ? '<span style="padding:1px 6px;background:#ede9fe;color:#6d28d9;font-size:10px;border-radius:99px;margin-left:4px;font-weight:700">'+(_en?'Manager':'매니저')+'</span>' : '';
      const hours = (t.start_hour && t.end_hour) ? (esc(t.start_hour)+'~'+esc(t.end_hour)) : '—';
      const edu = [t.edu, t.spec].filter(Boolean).map(esc).join(' · ') || '—';
      const stKey = _trStatKey(t.status);
      /* 🟢🚪❓ 상태 배지 — 색이 «구분 정보» 다(초록 재직 · 빨강 퇴사 · 노랑 미확인).
         ⛔ 인라인 색으로 쓰면 안 된다: 카드 안에서는 테마 규칙
            html[data-admin-theme="ivory"][data-admin-tone="slate"] [id^="card-"] .sub-body :is(span…)
            가 color:#101828 !important 로 이겨 **세 상태가 전부 검정**이 된다(2026-09-01 브라우저 실측).
            게다가 background:#fef3c7 인라인은 [style*="background:#fef3c7"] 규칙에 걸려
            rgba(250,204,21,.12) 로 바뀌고 있었다.
         ✅ 클래스로 달고 admin-inline-c.css 맨 끝에서 조상 id(#card-teacher-mgmt)로 되살린다.
            글자색을 인라인 !important 로 덮는 페인터 셋에도 함께 등재해야 한다
            (adm-light-surfaces SKIP_SEL · adm-s12 KEEP_SEL · adm-s13 TX_KEEP) — CLAUDE.md 2장. */
      const stCls = 'tr-st-badge tr-st-' + stKey;
      // 이름: 없으면 닉네임→"(이름 미등록·#id)" 폴백 + 아바타(이니셜) + 닉네임 2단
      const _rawName = (t.name && String(t.name).trim()) || (t.nickname && String(t.nickname).trim()) || '';
      const _dispName = _rawName ? esc(_rawName) : ((_en?'(No name · #':'(이름 미등록 · #')+esc(t.teacher_id!=null?t.teacher_id:'?')+')');
      const _initial = esc((_rawName||'?').charAt(0));
      const _sub = (_rawName && t.name && t.nickname && t.nickname!==t.name) ? '<div style="font-size:11px;color:#94a3b8;margin-top:1px">'+esc(t.nickname)+'</div>' : '';
      const _av = '<span style="width:28px;height:28px;border-radius:50%;background:'+(_rawName?'#e0e7ff;color:#4338ca':'#f1f5f9;color:#9ca3af')+';display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0">'+_initial+'</span>';
      const _grp = t.group_name ? esc(t.group_name) : '<span style="color:#c4b5cd">'+(_en?'Ungrouped':'미분류')+'</span>';
      return '<tr class="tr-row" style="border-bottom:1px solid #f1f5f9">'
        + '<td style="padding:8px 10px"><div style="display:flex;align-items:center;gap:9px">'+_av+'<div style="min-width:0"><div style="font-weight:700;color:#1f2937">'+_dispName+mgr+'</div>'+_sub+'</div></div></td>'
        + '<td style="padding:8px 10px;color:#475569">'+_grp+'</td>'
        + '<td style="padding:8px 10px;text-align:right;font-weight:700;color:#1e3a8a;font-variant-numeric:tabular-nums">'+num(t.class_count)+'</td>'
        + '<td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums">'+num(t.student_count)+'</td>'
        + '<td style="padding:8px 10px;text-align:right;font-variant-numeric:tabular-nums">'+num(t.work_days)+'</td>'
        + '<td style="padding:8px 10px;color:#475569">'+hours+'</td>'
        + '<td style="padding:8px 10px;color:#64748b;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+edu+'">'+edu+'</td>'
        + '<td style="padding:8px 10px;text-align:left"><span class="'+stCls+'">'+_trStatLabel(stKey,_en)+'</span></td>'
        + '</tr>';
    }).join('') : '<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">'+(_en?'No teachers match the filter':'해당 필터에 맞는 강사 없음')+'</td></tr>';
  }

  window.loadAbsentTeachers = function() {
    const date = document.getElementById('sub-date').value || new Date().toISOString().slice(0,10);
    _absentClasses = generateAbsentClasses(date);
    renderSubTable();
    updateSubKpis();
  };

  window.autoMatchAll = function() {
    if (_absentClasses.length === 0) loadAbsentTeachers();
    _absentClasses.forEach(c => {
      const best = findBestSubstitute(c);
      c.match = best;
    });
    renderSubTable();
    updateSubKpis();
    const applyBtn = document.getElementById('apply-all-btn');
    if (applyBtn) { applyBtn.disabled = false; applyBtn.style.opacity = '1'; }
  };

  // ⚠️ (2026-08-03) 이 화면은 **전체가 시뮬레이션**이다.
  //   결석 수업은 generateAbsentClasses() 가 만들어내고, 강사는 하드코딩 TEACHER_POOL 이며,
  //   '/api/admin/substitute/apply' 는 서버에 존재하지 않는다(라이브 404 확인).
  //   그런데도 예전엔 적용을 누르면 '적용됨' 으로 바뀌고, 일괄적용은 카톡 발송·시간표 갱신까지
  //   "완료" 라고 단언했다. 실제로는 아무 일도 일어나지 않는다 — 운영 판단을 오도한다.
  //   서버가 생기기 전까지는 **화면 안에서만 바뀐다**는 사실을 분명히 밝힌다.
  window.applyMatch = async function(id) {
    const c = _absentClasses.find(x => x.id === id);
    if (!c || !c.match) return;
    let saved = false;
    try {
      const r = await fetch('/api/admin/substitute/apply', {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ class_id: id, original_teacher: c.absent_teacher.id, new_teacher: c.match.teacher.id })
      });
      saved = r.ok;
    } catch(e) { saved = false; }
    c.status = 'applied';
    c.local_only = !saved;      // 서버에 반영되지 않았음 — 표에 그렇게 표시된다
    renderSubTable();
    updateSubKpis();
    if (!saved) {
      alert('⚠️ 화면에만 반영되었습니다 (서버 미연동).\n\n'
        + '대체 배정이 저장되지 않았고, 학생·강사에게 알림도 나가지 않았습니다.\n'
        + '실제 배정은 아직 수동으로 처리해 주세요.\n\n'
        + 'Screen only — not saved to the server, and no notifications were sent.');
    }
  };

  window.applyAllMatches = async function() {
    const matched = _absentClasses.filter(c => c.match && c.status === 'pending');
    if (matched.length === 0) { alert('매칭된 수업이 없습니다.'); return; }
    // ⚠️ (2026-08-03) 예전엔 서버를 **부르지도 않고** "카톡 알림 N건 · 시간표 갱신 완료" 라고
    //   단언했다. 발송된 알림도, 갱신된 시간표도 없었다. 확인 문구부터 사실대로 바꾼다.
    if (!confirm(`${matched.length}개 수업의 대체 강사를 화면에 일괄 적용합니다.\n\n`
      + `⚠️ 서버 연동 전이라 저장되지 않으며, 학생·강사 알림도 발송되지 않습니다.\n`
      + `계속하시겠습니까?`)) return;

    let savedCount = 0;
    for (const c of matched) {
      try {
        const r = await fetch('/api/admin/substitute/apply', {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ class_id: c.id, original_teacher: c.absent_teacher.id, new_teacher: c.match.teacher.id })
        });
        if (r.ok) savedCount++; else c.local_only = true;
      } catch(e) { c.local_only = true; }
      c.status = 'applied';
    }
    renderSubTable();
    updateSubKpis();

    if (savedCount === matched.length) {
      alert(`✅ ${matched.length}개 수업 대체 적용 완료 (서버 저장됨).`);
    } else {
      alert(`⚠️ 화면에만 반영되었습니다 — ${matched.length}건 중 서버 저장 ${savedCount}건.\n\n`
        + `저장되지 않은 건은 학생·강사 알림도 나가지 않았습니다.\n`
        + `실제 배정은 아직 수동으로 처리해 주세요.\n\n`
        + `Screen only — nothing was saved and no notifications were sent.`);
    }
  };

  window.rejectMatch = function(id) {
    const c = _absentClasses.find(x => x.id === id);
    if (!c) return;
    c.match = null;
    c.status = 'pending';
    renderSubTable();
    updateSubKpis();
  };

  // 서버 미연동 경고 — 표 바로 위에 한 번만 띄운다(한/영: 강사 다수가 필리핀)
  function _subShowSimBanner() {
    const tbody = document.getElementById('sub-rows');
    const host = tbody && tbody.closest('table') ? tbody.closest('table').parentNode : null;
    if (!host || document.getElementById('sub-sim-banner')) return;
    const d = document.createElement('div');
    d.id = 'sub-sim-banner';
    d.style.cssText = 'margin:0 0 10px;padding:10px 12px;border:1px solid #f59e0b;'
      + 'background:rgba(245,158,11,0.10);border-radius:8px;color:#b45309;font-size:13px;font-weight:700';
    d.innerHTML = '⚠️ 서버 미연동 — 이 화면의 결석 수업·강사 목록은 예시(시뮬레이션)이며, '
      + '대체 적용은 저장되지 않고 알림도 발송되지 않습니다.<br>'
      + '<span style="font-weight:500">Simulation only — assignments are not saved and no notifications are sent.</span>';
    host.insertBefore(d, host.firstChild);
  }

  function renderSubTable() {
    const tbody = document.getElementById('sub-rows');
    if (!tbody) return;
    _subShowSimBanner();
    if (_absentClasses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:30px;text-align:center;color:#9ca3af">결석 강사가 없습니다. 좋은 하루입니다! ☀️</td></tr>';
      return;
    }
    tbody.innerHTML = _absentClasses.map(c => {
      const at = c.absent_teacher;
      const m = c.match;
      // 서버에 저장되지 않은 건은 '적용완료' 로 보이면 안 된다 — 화면 반영일 뿐임을 밝힌다.
      const statusBadge = c.status === 'applied'
        ? (c.local_only
            ? '<span title="서버에 저장되지 않았습니다 / not saved to the server" style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">⚠️ 화면만 반영</span>'
            : '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">✅ 적용완료</span>')
        : m
          ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">⏳ 대기</span>'
          : '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">❗ 미매칭</span>';
      const matchCell = m
        ? `<div><b>${m.teacher.name}</b><div style="font-size:10px;color:#6b7280">⭐${m.teacher.rating} · 레벨 ${m.teacher.levels.join('/')}</div></div>`
        : '<button onclick="autoMatchOne('+c.id+')" style="padding:3px 8px;font-size:11px;background:#a855f7;color:#fff;border:0;border-radius:4px;cursor:pointer">🤖 매칭</button>';
      const scoreCell = m
        ? `<span style="background:${m.score>=80?'#dcfce7':m.score>=60?'#fef3c7':'#fee2e2'};color:${m.score>=80?'#15803d':m.score>=60?'#92400e':'#991b1b'};padding:2px 10px;border-radius:99px;font-size:11px;font-weight:800">${m.score}점</span>`
        : '—';
      const actionCell = c.status === 'applied'
        ? statusBadge
        : m
          ? `<button onclick="applyMatch(${c.id})" style="padding:3px 8px;font-size:11px;background:#10b981;color:#fff;border:0;border-radius:4px;cursor:pointer;margin-right:3px">✅</button><button onclick="rejectMatch(${c.id})" style="padding:3px 8px;font-size:11px;background:#fee2e2;color:#991b1b;border:0;border-radius:4px;cursor:pointer">✕</button>`
          : statusBadge;
      return `<tr style="border-bottom:1px solid #f3f4f6">
        <td style="padding:8px 10px;font-family:MangoiHanSC,Consolas,monospace;color:#0ea5e9;font-weight:700">${c.time}</td>
        <td style="padding:8px 10px;color:#111;font-weight:600">${c.student}</td>
        <td style="padding:8px 10px;text-align:center"><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700">${c.level}</span></td>
        <td style="padding:8px 10px"><b style="color:#dc2626">${at.name}</b><div style="font-size:10px;color:#9ca3af">⚠️ 결석</div></td>
        <td style="padding:8px 10px;text-align:center;color:#a855f7;font-size:18px">→</td>
        <td style="padding:8px 10px">${matchCell}</td>
        <td style="padding:8px 10px;text-align:center">${scoreCell}</td>
        <td style="padding:8px 10px;text-align:center">${actionCell}</td>
      </tr>`;
    }).join('');
  }

  window.autoMatchOne = function(id) {
    const c = _absentClasses.find(x => x.id === id);
    if (!c) return;
    c.match = findBestSubstitute(c);
    renderSubTable();
    updateSubKpis();
    const applyBtn = document.getElementById('apply-all-btn');
    if (applyBtn && _absentClasses.some(x => x.match)) {
      applyBtn.disabled = false; applyBtn.style.opacity = '1';
    }
  };

  function updateSubKpis() {
    const absent = new Set(_absentClasses.map(c => c.absent_teacher.id)).size;
    const matched = _absentClasses.filter(c => c.match).length;
    const saved = matched * 8; // 매칭 1건당 평균 8분 절감
    const $ = (id) => document.getElementById(id);
    $('kpi-absent') && ($('kpi-absent').textContent = absent + '명');
    $('kpi-classes') && ($('kpi-classes').textContent = _absentClasses.length + '개');
    $('kpi-matched') && ($('kpi-matched').textContent = matched + '건');
    $('kpi-saved') && ($('kpi-saved').textContent = saved + '분');
  }

  // 카드 열릴 때 자동 오늘 날짜 세팅
  document.addEventListener('DOMContentLoaded', () => {
    const today = new Date().toISOString().slice(0,10);
    const dateInput = document.getElementById('sub-date');
    if (dateInput) dateInput.value = today;
    const subItem = document.getElementById('sub-auto-sub');
    if (subItem) {
      subItem.addEventListener('toggle', () => {
        if (subItem.open && _absentClasses.length === 0) {
          setTimeout(loadAbsentTeachers, 300);
        }
      });
    }
  });

  // 🐛 fix(2026-07-14): <details open ontoggle> 은 파싱 시점에 발화해 정의 전엔
  // ReferenceError 였음(태초부터). 정의가 끝난 지금, 열려 있으면 원 의도대로 1회 로드.
  try {
    var _tr = document.getElementById('sub-teacher-roster');
    if (_tr && _tr.open) loadTeacherRoster();
  } catch (e) { console.warn('[teacher-roster] init load skip:', e && e.message); }
})();
