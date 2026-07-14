// ═══════════════════════════════════════════════════════════════
// adm-r13.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  var esc = function(s){ return String(s||'').replace(/[&<>"']/g, function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); };
  var NEG = ['소리가 끊겼어요','너무 어려웠어요','말할 기회가 적었어요'];
  var GRADE = {
    excellent:{ ko:'매우 우수', en:'Excellent', color:'#10b981', desc_ko:'학생 만족도가 매우 높습니다. 지금 수업 방식을 유지하세요.', desc_en:'Students are very satisfied. Keep the current approach.' },
    good:{ ko:'우수', en:'Good', color:'#84cc16', desc_ko:'전반적으로 좋은 평가입니다.', desc_en:'Overall positive ratings.' },
    fair:{ ko:'보통', en:'Fair', color:'#f59e0b', desc_ko:'보통 수준으로, 개선 여지가 있습니다.', desc_en:'Around average, with room to improve.' },
    needs_improvement:{ ko:'개선 필요', en:'Needs work', color:'#ef4444', desc_ko:'평가가 낮습니다. 수업 방식 점검이 필요합니다.', desc_en:'Ratings are low. Please review the class approach.' }
  };
  var barColor = function(s){ return s<=2?'#ef4444':(s<=4?'#f59e0b':'#10b981'); };

  function distChart(dist, EN, dark){
    var maxC = 1; dist.forEach(function(d){ if(d.count>maxC) maxC=d.count; });
    var axis = dark ? '#8ba0c8' : '#94a3b8';
    var bars = dist.map(function(d){
      var h = Math.max(2, Math.round(d.count/maxC*84));
      return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px">'
        + '<div style="font-size:10px;color:'+axis+'">'+(d.count||'')+'</div>'
        + '<div title="'+d.score+' : '+d.count+'" style="width:78%;height:'+h+'px;background:'+barColor(d.score)+';border-radius:4px 4px 0 0;opacity:'+(d.count?1:0.25)+'"></div>'
        + '<div style="font-size:11px;font-weight:700;color:'+axis+'">'+d.score+'</div></div>';
    }).join('');
    return '<div style="margin-top:6px"><div style="font-size:11px;color:'+axis+';margin-bottom:4px">'+(EN?'Score distribution (1–7)':'점수 분포 (1~7점)')+'</div>'
      + '<div style="display:flex;align-items:flex-end;gap:5px;height:108px">'+bars+'</div></div>';
  }

  function trendSpark(trend){
    if (!trend || trend.length < 2) return '';
    var w=260, h=44, pad=4;
    var xs = trend.map(function(t,i){ return pad + i*(w-2*pad)/(trend.length-1); });
    var ys = trend.map(function(t){ return h-pad - ((t.avg-1)/6)*(h-2*pad); });
    var pts = xs.map(function(x,i){ return x.toFixed(1)+','+ys[i].toFixed(1); }).join(' ');
    var dots = xs.map(function(x,i){ return '<circle cx="'+x.toFixed(1)+'" cy="'+ys[i].toFixed(1)+'" r="2.2" fill="#fbbf24"/>'; }).join('');
    return '<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" style="width:100%;height:44px;margin-top:6px;overflow:visible">'
      + '<polyline points="'+pts+'" fill="none" stroke="#fbbf24" stroke-width="2" stroke-linejoin="round"/>'+dots+'</svg>';
  }

  function analysisText(a, EN){
    var g = GRADE[a.grade] || GRADE.fair;
    var notes = [];
    if (a.low_count>0) notes.push(EN?(a.low_count+' low score(s) (1–2)'):('저점(1~2점) '+a.low_count+'건'));
    var negTag = (a.top_tags||[]).filter(function(t){ return NEG.indexOf(t.tag)>=0; })[0];
    if (negTag) notes.push((EN?'top concern: ':'주요 지적: ')+ (window.mangoTagTr? window.mangoTagTr(negTag.tag):negTag.tag));
    if (a.trend_dir==='up') notes.push(EN?'trending up recently 📈':'최근 상승세 📈');
    else if (a.trend_dir==='down') notes.push(EN?'trending down recently 📉':'최근 하락세 📉');
    var desc = EN?g.desc_en:g.desc_ko;
    return desc + (notes.length? ' ('+notes.join(' · ')+')' : '');
  }

  // 지적 태그 → 실행 액션 / 강점
  var ACTION = {
    '소리가 끊겼어요':   { ko:'수업 전 인터넷·마이크·카메라를 점검하고 가능하면 유선(랜선)으로 연결하세요.', en:'Check internet, mic and camera before class; use a wired connection if possible.' },
    '너무 어려웠어요':   { ko:'난이도를 한 단계 낮추고, 예시를 더 들며 천천히 진행하세요.', en:'Lower the difficulty a notch and go slower with more examples.' },
    '말할 기회가 적었어요': { ko:'교사 설명을 줄이고 학생이 말하는 시간을 늘리세요. 열린 질문을 더 던지세요.', en:'Talk less, let students speak more, and ask more open-ended questions.' }
  };
  var POS = {
    '재미있었어요':      { ko:'수업을 재미있게 이끄는 강점', en:'making classes fun' },
    '설명이 쉬웠어요':    { ko:'쉽고 명확한 설명', en:'clear, easy explanations' },
    '칭찬을 많이 해줬어요': { ko:'칭찬으로 학생을 북돋는 점', en:'encouraging students with praise' }
  };
  function buildAdvice(a, EN){
    var actions=[];
    (a.top_tags||[]).forEach(function(t){ if(ACTION[t.tag] && actions.length<2) actions.push(EN?ACTION[t.tag].en:ACTION[t.tag].ko); });
    if(a.low_count>=2) actions.push(EN?'Look closely at the low-score feedback and follow up.':'낮은 점수를 준 학생들의 피드백을 특히 살펴보고 보완하세요.');
    if(a.trend_dir==='down') actions.push(EN?'Ratings dipped recently — review your latest classes.':'최근 평가가 낮아지고 있어요. 최근 수업 방식을 점검하세요.');
    var posTag=(a.top_tags||[]).filter(function(t){return POS[t.tag];})[0];
    if(posTag && actions.length<3) actions.push((EN?'Keep your strength — ':'강점 유지 — ')+(EN?POS[posTag.tag].en:POS[posTag.tag].ko)+(EN?'.':'을 계속하세요.'));
    if(!actions.length) actions.push(EN?'Keep it up — students are happy.':'지금처럼 유지하세요 — 학생들이 만족하고 있어요.');
    var c;
    if(a.grade==='excellent') c=EN?'Doing great — keep it up!':'아주 잘하고 있어요 — 지금처럼만 하세요!';
    else if(a.grade==='good') c=EN?'Solid. One small tweak makes it excellent.':'좋아요! 한 가지만 보완하면 최고가 됩니다.';
    else if(a.grade==='fair') c=EN?'A few improvements will lift satisfaction.':'몇 가지만 개선하면 만족도가 올라가요.';
    else c=EN?'Improvement needed — start below.':'개선이 필요해요. 아래부터 하나씩 바꿔 보세요.';
    return { conclusion:c, actions:actions };
  }
  function adviceCard(a, EN, dark){
    var adv = buildAdvice(a, EN);
    var conclusionColor = dark ? '#ffffff' : '#052e21';
    var itemColor = dark ? '#ffffff' : '#052e21';
    var items = adv.actions.map(function(t){
      return '<div style="display:flex;align-items:flex-start;gap:8px;margin-top:8px">'
        +'<span style="flex:none;width:17px;height:17px;border-radius:50%;background:#10b981;color:'+(dark?'#031b12':'#ffffff')+';font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;line-height:1">✓</span>'
        +'<span style="font-size:13.5px;font-weight:700;color:'+itemColor+';line-height:1.5">'+esc(t)+'</span>'
        +'</div>';
    }).join('');
    return '<div style="background:'+(dark?'linear-gradient(135deg,rgba(16,185,129,0.22),rgba(16,185,129,0.08))':'linear-gradient(135deg,#d1fae5,#a7f3d0)')+';border:2px solid #10b981;border-radius:12px;padding:13px 15px;margin-top:10px">'
      +'<div style="font-size:13.5px;font-weight:900;color:'+(dark?'#34d399':'#065f46')+';letter-spacing:-0.1px;margin-bottom:5px">🎯 '+(EN?'Conclusion — what to do next':'결론 — 이렇게 해보세요')+'</div>'
      +'<div style="font-size:15px;font-weight:900;color:'+conclusionColor+';line-height:1.4;margin-bottom:8px">'+esc(adv.conclusion)+'</div>'
      +items+'</div>';
  }

  // ── 📋 성장 플랜 — 수정·보완·발전 (평가표 맨 마지막, 필수 표시) ──
  function growthPlan(a, EN){
    var fix=[], supp=[], dev=[];
    var tagCount={}; (a.top_tags||[]).forEach(function(t){ tagCount[t.tag]=t.count; });
    if (tagCount['소리가 끊겼어요']) fix.push(EN?'Fix your connection — check Wi-Fi/mic/camera before class, use a wired connection if possible.':'접속 환경부터 고치세요 — 수업 전 와이파이·마이크·카메라를 점검하고, 가능하면 유선(랜선)으로 연결하세요.');
    if ((tagCount['너무 어려웠어요']||0) >= 2) fix.push(EN?'The pace is too fast for several students — slow down and add more examples.':'여러 학생이 어려워했어요 — 진도를 늦추고 예시를 더 넣어보세요.');
    else if (tagCount['너무 어려웠어요']) supp.push(EN?'One student found it hard — check their level individually.':'한 학생이 어려워했어요 — 그 학생의 수준을 개별로 확인해보세요.');
    if ((tagCount['말할 기회가 적었어요']||0) >= 2) fix.push(EN?'Students want more speaking time — cut teacher talk and add speaking activities.':'학생들이 말할 기회를 원해요 — 교사 설명을 줄이고 말하기 활동을 늘리세요.');
    else if (tagCount['말할 기회가 적었어요']) supp.push(EN?'Give quieter students a bit more speaking time.':'조용한 학생에게 말할 기회를 조금 더 주세요.');
    if (a.low_count>=2) fix.push(EN?'Multiple low scores (1–2) — review those classes and find the root cause.':'낮은 점수(1~2점)가 여러 건이에요 — 해당 수업들을 되짚어 원인을 찾으세요.');
    else if (a.low_count===1) supp.push(EN?'One low score — likely a one-off, but worth a quick check.':'낮은 점수가 1건 있어요 — 일시적일 수 있지만 한 번 점검해보세요.');
    if (a.trend_dir==='down') fix.push(EN?'Ratings have dropped recently — pinpoint what changed and adjust now.':'최근 평가가 하락 중이에요 — 무엇이 달라졌는지 바로 점검하세요.');
    var posTag=(a.top_tags||[]).filter(function(t){return POS[t.tag];})[0];
    if (posTag) dev.push((EN?'Build on your strength — ':'강점을 더 살려보세요 — ')+(EN?POS[posTag.tag].en:POS[posTag.tag].ko)+(EN?'; apply it to new activities too.':'을 다른 활동에도 적용해보세요.'));
    if (a.trend_dir==='up') dev.push(EN?'You’re trending up — keep refining and it’ll become excellent.':'최근 상승세예요 — 지금 방식을 더 다듬으면 최고가 됩니다.');
    dev.push(EN?'Ask 1–2 students directly what would make class even better.':'학생 1~2명에게 "무엇이 더 있으면 좋을지" 직접 물어보는 것도 좋아요.');
    if (!fix.length) fix.push(EN?'Nothing urgent to fix right now. 👍':'지금 급하게 고칠 점은 없어요. 👍');
    if (!supp.length) supp.push(EN?'No particular gaps to fill right now.':'특별히 보완할 부분은 없어요.');
    return { fix:fix.slice(0,3), supplement:supp.slice(0,3), develop:dev.slice(0,3) };
  }
  function growthPlanCard(a, EN, dark){
    var g = growthPlan(a, EN);
    var sub = dark ? '#cdd8ee' : '#374151';
    var border = dark ? 'rgba(255,255,255,0.14)' : '#e5e7eb';
    function tier(icon, label, color, items){
      var lis = items.map(function(t){ return '<li style="margin:4px 0">'+esc(t)+'</li>'; }).join('');
      return '<div style="background:'+color+'1a;border:1px solid '+color+'55;border-radius:9px;padding:9px 11px">'
        +'<div style="font-size:11.5px;font-weight:900;color:'+color+';margin-bottom:4px">'+icon+' '+label+'</div>'
        +'<ul style="margin:0;padding-left:16px;font-size:11.5px;color:'+sub+';line-height:1.5">'+lis+'</ul></div>';
    }
    return '<div style="margin-top:14px;padding-top:12px;border-top:1px dashed '+border+'">'
      +'<div style="font-size:12.5px;font-weight:900;color:'+(dark?'#e6ecff':'#111827')+';margin-bottom:8px">📋 '+(EN?'Growth plan — fix, supplement, develop':'성장 플랜 — 수정·보완·발전')+'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">'
        + tier('🔴', EN?'Fix':'수정', '#ef4444', g.fix)
        + tier('🟡', EN?'Supplement':'보완', '#f59e0b', g.supplement)
        + tier('🟢', EN?'Develop':'발전', '#10b981', g.develop)
      +'</div></div>';
  }

  window.renderRatingAnalysis = function(container, teacherName, dark){
    if (!container) return;
    var EN = (window.adminLang === 'en');
    container.style.marginTop = '12px';
    container.innerHTML = '<div style="font-size:12px;color:'+(dark?'#8ba0c8':'#94a3b8')+'">'+(EN?'Analyzing…':'분석 중…')+'</div>';
    var q = '/api/admin/ratings/analytics?days=90' + (teacherName?('&teacher_name='+encodeURIComponent(teacherName)):'');
    fetch(q).then(function(r){return r.json();}).then(function(a){
      if (!a || !a.ok || !a.count){ container.innerHTML=''; return; }
      var g = GRADE[a.grade] || GRADE.fair;
      var txtMain = dark ? '#e6ecff' : '#111827';
      var txtSub = dark ? '#a3b3d1' : '#6b7280';
      var cardBg = dark ? 'rgba(255,255,255,0.05)' : '#fff';
      var cardBd = dark ? 'rgba(255,255,255,0.08)' : '#e5e7eb';
      container.innerHTML =
        '<div style="background:'+cardBg+';border:1px solid '+cardBd+';border-radius:12px;padding:14px 16px">'
        + '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">'
          + '<span style="font-size:13px;font-weight:800;color:'+txtMain+'">📊 '+(EN?'Rating analysis':'평가 분석')+'</span>'
          + '<span style="background:'+g.color+';color:#fff;font-size:11px;font-weight:800;padding:2px 10px;border-radius:99px">'+(EN?g.en:g.ko)+'</span>'
        + '</div>'
        + '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">'
          + '<div style="font-size:30px;font-weight:900;color:'+g.color+'">'+a.trimmed_avg.toFixed(1)+'<span style="font-size:14px;color:'+txtSub+';font-weight:600">/7</span></div>'
          + '<div style="font-size:11.5px;color:'+txtSub+'">'+(EN?('Trimmed avg · excl. 1 highest &amp; 1 lowest · '+a.count+' ratings'):('절사평균 · 최고·최저 1개씩 제외 · 평가 '+a.count+'건'))+'</div>'
        + '</div>'
        + '<div style="font-size:11px;color:'+txtSub+';margin-top:2px">'+(EN?('Raw avg '+a.raw_avg.toFixed(1)+' · range '+a.min+'–'+a.max):('전체평균 '+a.raw_avg.toFixed(1)+' · 최저 '+a.min+' ~ 최고 '+a.max))+'</div>'
        + '<div style="font-size:12.5px;color:'+txtMain+';line-height:1.6;margin-top:8px;background:'+(dark?'rgba(251,191,36,0.08)':'#fffbeb')+';border-radius:8px;padding:8px 11px">💡 '+esc(analysisText(a, EN))+'</div>'
        + adviceCard(a, EN, dark)
        + distChart(a.distribution, EN, dark)
        + (a.trend && a.trend.length>=2 ? '<div style="margin-top:8px"><div style="font-size:11px;color:'+txtSub+'">'+(EN?'Daily trend':'일자별 추이')+'</div>'+trendSpark(a.trend)+'</div>' : '')
        + growthPlanCard(a, EN, dark)
        + '</div>';
    }).catch(function(){ container.innerHTML=''; });
  };
})();
