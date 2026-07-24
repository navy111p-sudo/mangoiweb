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
        var stStyle = st==='active' ? '#dcfce7;color:#15803d' : (st==='inactive' ? '#f1f5f9;color:#94a3b8' : '#fef3c7;color:#b45309');
        var stLabel = st==='active' ? (_en?'Active':'재직') : (st==='inactive' ? (_en?'Inactive':'퇴사') : (_en?'Unknown':'미확인'));
        // 매니저 배지: is_manager 코드 대신 공용 이름 명단으로 판정(Maimai·Melca 는 직원으로 등록돼 이 표에 있음)
        var mgr = isManagerName(s.name, s.nickname) ? '<span style="padding:1px 6px;background:#ede9fe;color:#6d28d9;font-size:10px;border-radius:99px;margin-left:4px;font-weight:700">'+(_en?'Manager':'매니저')+'</span>' : '';
        return '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:8px 10px"><b>'+esc(s.name)+'</b>'+(s.nickname && s.nickname!==s.name ?' <span style="color:#94a3b8">('+esc(s.nickname)+')</span>':'')+mgr+'</td>'
          +'<td style="padding:8px 10px;color:#475569">'+esc(s.email||'—')+'</td>'
          +'<td style="padding:8px 10px;color:#64748b;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+esc(s.intro)+'">'+esc(s.intro||'—')+'</td>'
          +'<td style="padding:8px 10px;text-align:center"><span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:'+stStyle+'">'+stLabel+'</span></td></tr>';
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
        return '<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:8px 10px"><b>'+esc(b.name)+'</b></td>'
          +'<td style="padding:8px 10px;color:#64748b;max-width:360px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+esc(b.memo)+'">'+esc(b.memo||'—')+'</td>'
          +'<td style="padding:8px 10px;text-align:center"><span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:'+(a?'#dcfce7;color:#15803d':'#f1f5f9;color:#94a3b8')+'">'+(a?'사용':'중지')+'</span></td></tr>';
      }).join('') : '<tr><td colspan="3" style="padding:24px;text-align:center;color:#9ca3af">교재 없음</td></tr>';
    } catch(e){ tb.innerHTML = '<tr><td colspan="3" style="padding:20px;text-align:center;color:#dc2626">불러오기 실패: '+esc(String(e&&e.message||e))+'</td></tr>'; }
  };

  window.loadTeacherRoster = async function(force) {
    if (_trLoaded && !force && !(document.getElementById('tr-q')||{}).value) { /* 이미 로드됨 */ }
    const tb = document.getElementById('tr-rows');
    const cnt = document.getElementById('tr-count');
    if (!tb) return;
    const _en = (window.adminLang==='en');
    const q = (document.getElementById('tr-q')||{}).value || '';
    const esc = s => String(s==null?'':s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
    const num = n => (Number(n)||0).toLocaleString();
    tb.innerHTML = '<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">'+(_en?'Loading…':'불러오는 중…')+'</td></tr>';
    try {
      const r = await fetch('/api/admin/teachers/graph-list?q=' + encodeURIComponent(q), { credentials:'include' });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'API error');
      const rows = d.teachers || [];
      _trLoaded = true;
      const isMgr = t => isManagerName(t.name, t.nickname);  // 매니저 판정=파일 상단 공용 헬퍼(강사·직원 명부 동일 명단)
      // 상태 3분류: active=재직 / inactive=퇴사 / 그 외(null=아직 미동기화된 신규강사)=미확인.
      //   (null 을 무조건 '퇴사'로 찍던 버그 수정 — 신규 34명이 퇴사로 오표시되던 문제)
      const stRank = s => s==='active' ? 0 : (s==='inactive' ? 2 : 1); // 재직 → 미확인 → 퇴사
      rows.sort((a,b)=>{
        const ra=stRank(a.status), rb=stRank(b.status);
        if (ra!==rb) return ra-rb;                                    // 재직자 우선
        return (Number(b.class_count)||0)-(Number(a.class_count)||0); // 그다음 담당수업 많은 순
      });
      // ⚠️ 담당수업·담당학생 수는 노드 사전계산값(2026-07-04 최초 적재)이라 현재값과 다를 수 있음 — 정직하게 기준일 표기.
      if (cnt) cnt.innerHTML = (_en ? rows.length+' teachers' : '총 '+rows.length+'명')
        + ' <span style="color:#b45309">· '
        + (_en ? 'Classes/Students as of 2026-07-04 (may differ from now)' : '담당수업·담당학생 수는 2026-07-04 집계(현재값과 다를 수 있음)')
        + '</span>';
      tb.innerHTML = rows.length ? rows.map(t => {
        const mgr = isMgr(t) ? '<span style="padding:1px 6px;background:#ede9fe;color:#6d28d9;font-size:10px;border-radius:99px;margin-left:4px;font-weight:700">'+(_en?'Manager':'매니저')+'</span>' : '';
        const hours = (t.start_hour && t.end_hour) ? (esc(t.start_hour)+'~'+esc(t.end_hour)) : '—';
        const edu = [t.edu, t.spec].filter(Boolean).map(esc).join(' · ') || '—';
        const st = t.status;
        const stStyle = st==='active' ? '#dcfce7;color:#15803d' : (st==='inactive' ? '#f1f5f9;color:#94a3b8' : '#fef3c7;color:#b45309');
        const stLabel = st==='active' ? (_en?'Active':'재직') : (st==='inactive' ? (_en?'Inactive':'퇴사') : (_en?'Unknown':'미확인'));
        return '<tr style="border-bottom:1px solid #f1f5f9">'
          + '<td style="padding:8px 10px"><b>'+esc(t.name)+'</b>'+(t.nickname && t.nickname!==t.name ?' <span style="color:#94a3b8">('+esc(t.nickname)+')</span>':'')+mgr+'</td>'
          + '<td style="padding:8px 10px;color:#475569">'+esc(t.group_name||'—')+'</td>'
          + '<td style="padding:8px 10px;text-align:right;font-weight:700;color:#1e3a8a">'+num(t.class_count)+'</td>'
          + '<td style="padding:8px 10px;text-align:right">'+num(t.student_count)+'</td>'
          + '<td style="padding:8px 10px;text-align:right">'+num(t.work_days)+'</td>'
          + '<td style="padding:8px 10px;color:#475569">'+hours+'</td>'
          + '<td style="padding:8px 10px;color:#64748b;max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+edu+'">'+edu+'</td>'
          + '<td style="padding:8px 10px;text-align:center"><span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:'+stStyle+'">'+stLabel+'</span></td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af">'+(_en?'No teachers':'강사 없음')+'</td></tr>';
    } catch(e) {
      tb.innerHTML = '<tr><td colspan="8" style="padding:20px;text-align:center;color:#dc2626">'+(_en?'Load failed: ':'불러오기 실패: ')+esc(String(e&&e.message||e))+'</td></tr>';
    }
  };

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

  window.applyMatch = function(id) {
    const c = _absentClasses.find(x => x.id === id);
    if (!c || !c.match) return;
    c.status = 'applied';
    // 실 운영: POST /api/admin/substitute/apply { class_id, teacher_id }
    fetch('/api/admin/substitute/apply', {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ class_id: id, original_teacher: c.absent_teacher.id, new_teacher: c.match.teacher.id })
    }).catch(()=>{});
    renderSubTable();
    updateSubKpis();
  };

  window.applyAllMatches = function() {
    const matched = _absentClasses.filter(c => c.match && c.status === 'pending');
    if (matched.length === 0) { alert('매칭된 수업이 없습니다.'); return; }
    if (!confirm(`${matched.length}개 수업의 대체 강사를 일괄 적용합니다.\n학생·강사에게 카카오톡 자동 알림이 발송됩니다.\n계속하시겠습니까?`)) return;
    matched.forEach(c => c.status = 'applied');
    renderSubTable();
    updateSubKpis();
    alert(`✅ ${matched.length}개 수업 대체 적용 완료!\n\n• 학생 카톡 알림: ${matched.length}건\n• 강사 카톡 알림: ${matched.length}건\n• 시간표 자동 갱신: 완료`);
  };

  window.rejectMatch = function(id) {
    const c = _absentClasses.find(x => x.id === id);
    if (!c) return;
    c.match = null;
    c.status = 'pending';
    renderSubTable();
    updateSubKpis();
  };

  function renderSubTable() {
    const tbody = document.getElementById('sub-rows');
    if (!tbody) return;
    if (_absentClasses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:30px;text-align:center;color:#9ca3af">결석 강사가 없습니다. 좋은 하루입니다! ☀️</td></tr>';
      return;
    }
    tbody.innerHTML = _absentClasses.map(c => {
      const at = c.absent_teacher;
      const m = c.match;
      const statusBadge = c.status === 'applied'
        ? '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700">✅ 적용완료</span>'
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
        <td style="padding:8px 10px;font-family:Consolas,monospace;color:#0ea5e9;font-weight:700">${c.time}</td>
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
