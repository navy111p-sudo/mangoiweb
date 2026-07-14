// ═══════════════════════════════════════════════════════════════
// adm-r14.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  const esc = (s) => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const stars7 = (avg) => { var f=Math.round(avg||0),h=''; for(var i=1;i<=7;i++)h+='<span style="color:'+(i<=f?'#f59e0b':'#4b5563')+'">★</span>'; return h; };
  const sc = (a) => a>=5.5?'#10b981':(a>=4?'#f59e0b':'#ef4444');

  function roleOf(){
    try{
      var sim = localStorage.getItem('mangoi_user_role');
      if (sim){ var M={hq_exec:'exec',hq_mgr:'mgr',hq_teacher:'teacher',branch:'branch',agency:'agency',parent:'parent',student:'student'}; return M[sim]||sim; }
      var u = JSON.parse(localStorage.getItem('admin_session')||'null');
      if (!u) return 'exec';
      var U={hq_t_001:'teacher',hq_teacher:'teacher',hq_exec:'exec',hq_mgr:'mgr',admin:'exec',cfo01:'mgr',ops_lead:'mgr',branch_busan:'branch',branch_daegu:'branch',agency_gn001:'agency',agency_sc002:'agency',parent_001:'parent',student_001:'student'};
      return U[u.uid]||'exec';
    }catch(e){ return 'exec'; }
  }
  function userOf(){ try{ return JSON.parse(localStorage.getItem('admin_session')||'null'); }catch(e){ return null; } }

  function anchor(){
    var host = document.getElementById('rating-role-panel');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'rating-role-panel';
    host.style.cssText = 'margin:0 0 18px';
    var legacy = document.getElementById('legacy-cards') || document.getElementById('kpi');
    if (legacy && legacy.parentNode) legacy.parentNode.insertBefore(host, legacy);
    else { var al = document.querySelector('.admin-layout'); if (al) al.prepend(host); else document.body.prepend(host); }
    return host;
  }

  // ── 강사: 내 수업 평가 ──
  async function renderTeacher(){
    var EN = (window.adminLang === 'en');
    var u = userOf(); var name = (u && u.name) || '';
    var host = anchor();
    host.innerHTML = '<div style="background:linear-gradient(135deg,#13234a,#0c1733);border:1px solid rgba(251,191,36,0.35);border-radius:16px;padding:18px 20px;color:#e6ecff"><div style="font-size:13px;color:#a3b3d1">'+(EN?'Loading…':'불러오는 중…')+'</div></div>';
    if (!name){ host.querySelector('div>div').textContent = EN?'Could not load ratings — no login info.':'로그인 정보를 찾을 수 없어 평가를 불러오지 못했습니다.'; return; }
    try{
      var r = await fetch('/api/teacher/my-ratings?days=90&limit=100&teacher_name=' + encodeURIComponent(name));  // 무기명 (학생 이름 미포함)
      var d = await r.json();
      var rows = (d && d.rows) || [];
      var cnt = rows.length;
      var avg = cnt ? Math.round(rows.reduce(function(s,x){return s+x.score;},0)/cnt*100)/100 : 0;
      var low = rows.filter(function(x){return x.score<=2;}).length;
      var fmtDt = function(ms){ return new Date(ms).toLocaleDateString(EN?'en-US':'ko-KR',{month:'short',day:'numeric'}); };
      var recent = rows.slice(0,6).map(function(x){
        var tags=[]; try{ tags=JSON.parse(x.tags||'[]'); }catch(e){}
        return '<div style="background:rgba(255,255,255,0.05);border-radius:10px;padding:9px 12px;margin-top:7px">'
          + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:13px">'+stars7(x.score)+'</span>'
          + '<b style="color:'+sc(x.score)+';font-size:12.5px">'+x.score+'/7</b>'
          + '<span style="font-size:10.5px;color:#8ba0c8;background:rgba(255,255,255,0.06);border-radius:99px;padding:1px 7px">'+(EN?'Anonymous':'익명')+'</span>'
          + '<span style="font-size:11px;color:#8ba0c8;margin-left:auto">'+fmtDt(x.created_at)+'</span></div>'
          + (tags.length?'<div style="margin-top:4px">'+tags.map(function(t){return '<span data-tr-tag="'+esc(t)+'" style="display:inline-block;background:rgba(251,191,36,0.15);color:#fcd34d;border-radius:99px;padding:1px 8px;font-size:10.5px;margin:1px 2px">'+esc(t)+'</span>';}).join('')+'</div>':'')
          + (x.feedback?'<div style="margin-top:5px;font-size:12px;color:#cdd8ee;line-height:1.55">💬 <span data-tr="'+esc(x.feedback)+'">'+esc(x.feedback)+'</span></div>':'')
          + '</div>';
      }).join('');
      host.innerHTML =
        '<div style="background:linear-gradient(135deg,#13234a,#0c1733);border:1px solid rgba(251,191,36,0.4);border-radius:16px;padding:18px 20px;color:#e6ecff">'
        + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
        + '<div style="font-size:15px;font-weight:800;color:#fbbf24">⭐ '+(EN?(esc(name)+'’s class ratings'):(esc(name)+' 선생님의 수업 평가'))+'</div>'
        + '<span style="font-size:11.5px;color:#8ba0c8">'+(EN?'Last 90 days · from students':'최근 90일 · 학생이 남긴 평가')+'</span></div>'
        + (cnt
            ? '<div style="display:flex;align-items:baseline;gap:12px;margin-top:12px;flex-wrap:wrap">'
              + '<div style="font-size:34px;font-weight:900;color:'+sc(avg)+'">'+avg.toFixed(1)+'<span style="font-size:16px;color:#8ba0c8;font-weight:600">/7</span></div>'
              + '<div style="font-size:16px">'+stars7(avg)+'</div>'
              + '<div style="font-size:12.5px;color:#a3b3d1">'+(EN?('<b style="color:#e6ecff">'+cnt+'</b> responses'):('응답 <b style="color:#e6ecff">'+cnt+'</b>개'))+(low?(EN?' · <span style="color:#fca5a5">'+low+' low</span>':' · <span style="color:#fca5a5">낮은 점수 '+low+'개</span>'):'')+'</div></div>'
              + '<div style="margin-top:10px">'+recent+'</div>'
              + (rows.length>6?'<div style="font-size:11px;color:#8ba0c8;margin-top:8px">'+(EN?('Showing 6 of '+rows.length):('최근 6개만 표시 · 전체 '+rows.length+'개'))+'</div>':'')
            : '<div style="margin-top:12px;font-size:13px;color:#a3b3d1">'+(EN?'No ratings yet. They’ll appear here after your classes. 😊':'아직 받은 평가가 없어요. 수업이 끝나면 학생들이 남긴 평가가 여기에 쌓입니다. 😊')+'</div>')
        + (cnt ? '<div id="rating-analysis-teacher"></div>' : '')
        + '</div>';
      if (typeof window.applyRatingTr === 'function') window.applyRatingTr(host);
      if (cnt && typeof window.renderRatingAnalysis === 'function') window.renderRatingAnalysis(document.getElementById('rating-analysis-teacher'), name, true);
    }catch(e){
      host.innerHTML = '<div style="background:#13234a;border-radius:16px;padding:16px 20px;color:#fca5a5">'+(EN?'Failed to load ratings: ':'평가를 불러오지 못했습니다: ')+esc(e.message)+'</div>';
    }
  }

  // ── 관리자: 강사 평가 알람 ──
  async function renderAdmin(){
    var EN = (window.adminLang === 'en');
    var host = anchor();
    try{
      var r = await fetch('/api/admin/ratings/summary?days=30');
      var d = await r.json();
      var rows = (d && d.rows) || [];
      if (!rows.length){ host.remove(); return; }   // 평가 없으면 알람 안 띄움
      var dismissed = false;
      try{ dismissed = sessionStorage.getItem('mangoi_rating_alarm_dismiss')==='1'; }catch(e){}
      if (dismissed) { host.remove(); return; }
      var warn = rows.filter(function(x){ return x.avg_score < 4 || x.low_count > 0; })
                     .sort(function(a,b){ return a.avg_score - b.avg_score; });
      var top = rows.filter(function(x){ return x.avg_score >= 5; })   // 평균 5점 이상만 '우수'
                    .sort(function(a,b){ return b.avg_score - a.avg_score; }).slice(0,3);

      var warnHtml = warn.length
        ? '<div style="margin-top:10px"><div style="font-size:12.5px;font-weight:800;color:#fca5a5;margin-bottom:6px">'+(EN?('⚠️ '+warn.length+' teacher(s) need attention'):('⚠️ 평가 주의 강사 '+warn.length+'명'))+'</div>'
          + warn.slice(0,5).map(function(x){
              return '<div style="display:flex;align-items:center;gap:10px;background:rgba(239,68,68,0.10);border:1px solid rgba(239,68,68,0.3);border-radius:9px;padding:7px 11px;margin-top:5px;flex-wrap:wrap">'
                + '<b style="font-size:13px;color:#fecaca">'+esc(x.teacher_name)+'</b>'
                + '<span style="font-size:12.5px">'+stars7(x.avg_score)+'</span>'
                + '<b style="color:'+sc(x.avg_score)+';font-size:13px">'+x.avg_score.toFixed(1)+'</b>'
                + '<span style="font-size:11px;color:#cbd5e1">'+(EN?(x.count+' resp.'):('응답 '+x.count+'개'))+(x.low_count?(EN?' · '+x.low_count+' low':' · 낮은점수 '+x.low_count):'')+'</span>'
                + (x.top_tags&&x.top_tags.length?'<span data-tr-tag="'+esc((x.top_tags[0]||{}).tag||'')+'" style="font-size:10.5px;color:#94a3b8;margin-left:auto">'+esc((x.top_tags[0]||{}).tag||'')+'</span>':'')
                + '</div>';
            }).join('')
          + (warn.length>5?'<div style="font-size:11px;color:#94a3b8;margin-top:5px">'+(EN?('+'+(warn.length-5)+' more'):('외 '+(warn.length-5)+'명'))+'</div>':'')
          + '</div>'
        : '<div style="margin-top:10px;font-size:12.5px;color:#86efac">'+(EN?'✅ No teachers need attention. All good.':'✅ 평가 주의 강사가 없습니다. 모두 양호해요.')+'</div>';

      var topHtml = top.length
        ? '<div style="margin-top:12px"><div style="font-size:12.5px;font-weight:800;color:#fcd34d;margin-bottom:6px">'+(EN?'🏆 Top teachers':'🏆 우수 강사')+'</div>'
          + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
          + top.map(function(x,i){
              return '<div style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.35);border-radius:9px;padding:7px 12px">'
                + '<b style="font-size:13px;color:#fde68a">'+['🥇','🥈','🥉'][i]+' '+esc(x.teacher_name)+'</b> '
                + '<b style="color:#10b981;font-size:13px">'+x.avg_score.toFixed(1)+'</b>'
                + '<span style="font-size:11px;color:#a3b3d1"> ('+x.count+')</span></div>';
            }).join('')
          + '</div></div>'
        : '';

      host.innerHTML =
        '<div style="background:linear-gradient(135deg,#1a1330,#0f0c22);border:1px solid rgba(251,191,36,0.4);border-radius:16px;padding:16px 20px;color:#e6ecff;position:relative">'
        + '<button id="rating-alarm-x" title="'+(EN?'Close':'닫기')+'" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,0.08);border:0;color:#cbd5e1;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:13px">✕</button>'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
        + '<div style="font-size:15px;font-weight:800;color:#fbbf24">'+(EN?'🔔 Teacher rating alerts':'🔔 강사 평가 알람')+'</div>'
        + '<span style="font-size:11.5px;color:#a3b3d1">'+(EN?'Last 30 days · student class ratings':'최근 30일 학생 수업 평가 요약')+'</span></div>'
        + warnHtml + topHtml
        + '<div style="margin-top:12px"><button id="rating-alarm-more" style="background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;border:0;border-radius:8px;padding:8px 16px;font-size:12.5px;font-weight:800;cursor:pointer">'+(EN?'View details →':'자세히 보기 →')+'</button></div>'
        + '</div>';
      if (typeof window.applyRatingTr === 'function') window.applyRatingTr(host);

      var xb = document.getElementById('rating-alarm-x');
      if (xb) xb.addEventListener('click', function(){ try{ sessionStorage.setItem('mangoi_rating_alarm_dismiss','1'); }catch(e){} host.remove(); });
      var more = document.getElementById('rating-alarm-more');
      if (more) more.addEventListener('click', function(){
        var card = document.getElementById('card-class-ratings');
        if (card){ try{ card.open = true; }catch(e){} card.scrollIntoView({behavior:'smooth',block:'start'}); if (typeof crLoadSummary==='function') crLoadSummary(); }
      });
    }catch(e){ host.remove(); }
  }

  function run(){
    var role = roleOf();
    if (role === 'parent' || role === 'student') return;         // 표시 안 함
    var render = (role === 'teacher') ? renderTeacher : renderAdmin;  // 그 외 전부 관리자
    render();
    // 🛡 가디언 — admin.html 대시보드 초기 재빌드로 패널이 지워지면 다시 붙임 (약 20초)
    var ticks = 0;
    var iv = setInterval(function(){
      if (++ticks > 20) { clearInterval(iv); return; }
      var dismissed = false;
      try { dismissed = sessionStorage.getItem('mangoi_rating_alarm_dismiss')==='1'; } catch(e){}
      if (dismissed) { clearInterval(iv); return; }
      if (!document.getElementById('rating-role-panel')) render();
    }, 1000);
  }
  function boot(){ if (window.__mangoRatingBooted) return; window.__mangoRatingBooted = true; run(); }
  // 🌐 언어 스위치 → 패널 라벨/콘텐츠 즉시 재번역
  document.addEventListener('mangoi:lang-changed', function(){
    var role = roleOf();
    if (role === 'parent' || role === 'student') return;
    if (!document.getElementById('rating-role-panel') && role !== 'teacher') { /* 알람 닫힘 상태면 유지 */ }
    (role === 'teacher' ? renderTeacher : renderAdmin)();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('load', boot);
  setTimeout(boot, 1500);
})();
