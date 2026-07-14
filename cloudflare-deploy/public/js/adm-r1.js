// ═══════════════════════════════════════════════════════════════
// adm-r1.js — admin.html 인라인 추출 (2단계 33차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  function won(n){ try{ return '₩'+Math.round(n).toLocaleString('ko-KR'); }catch(e){ return '₩'+n; } }
  function num(n){ try{ return Number(n).toLocaleString('ko-KR'); }catch(e){ return n; } }
  function sess(){ try{ return JSON.parse(localStorage.getItem('mangoi_admin_session')||'null'); }catch(e){ return null; } }
  function _hash(str){ var h=2166136261>>>0; str=String(str||'a'); for(var i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
  function _rng(seed){ var x=(seed>>>0)||123456789; return function(){ x^=x<<13; x>>>=0; x^=x>>>17; x^=x<<5; x>>>=0; return x/4294967296; }; }
  function acadName(s){ var aid=((s&&s.agency_id)||'').trim(); var m={gn001:'강남점',sc002:'서초점',pj003:'판교점'}; var b=((s&&s.branch)||'').trim(); if(b) return (b.indexOf('학원')>=0||b.indexOf('대리점')>=0)?b:(b+' 학원'); if(m[aid]) return m[aid]+' 학원'; return aid?(aid+' 학원'):'우리 학원'; }
  function demoFor(aid){
    var r=_rng(_hash(aid)+97);
    var names=['김민준','이서연','박지호','최유나','정도윤','강하은','윤서준','임채원','오지후','한예린','서준우','조하린','신우진','배수아','홍지안','곽서윤','문해성','양지우','남도현','심예나'];
    var grades=['초3 · A1','초4 · A1','초5 · A2','초6 · A2','중1 · A2','중2 · B1','중3 · B1','고1 · B2','고2 · C1'];
    var total=38+Math.floor(r()*90);
    var active=Math.max(total-Math.floor(r()*6),0);
    var avgFee=140000+Math.floor(r()*60000);
    var revenue=total*avgFee;
    var rateOpts=[0.12,0.15,0.18]; var rate=rateOpts[Math.floor(r()*rateOpts.length)];
    var fee=Math.round(revenue*rate); var net=revenue-fee;
    var att=80+Math.floor(r()*18);
    var unpaid_count=Math.floor(r()*7);
    var unpaid_amount=unpaid_count*(120000+Math.floor(r()*60000));
    var pool=names.slice();
    for(var i=pool.length-1;i>0;i--){ var j=Math.floor(r()*(i+1)); var t=pool[i]; pool[i]=pool[j]; pool[j]=t; }
    var list=[];
    for(var k=0;k<8;k++){
      var pr=r(); var pay=pr<0.62?'완납':(pr<0.83?'예정':'미납');
      var day=1+Math.floor(r()*27); var mon=(pay==='완납')?7:6;
      list.push({name:pool[k]||('학생'+(k+1)), grade:grades[Math.floor(r()*grades.length)], att:70+Math.floor(r()*30), pay:pay, due:'2026-0'+mon+'-'+(day<10?('0'+day):day)});
    }
    return {students_total:total,students_active:active,revenue_month:revenue,fee_rate:rate,fee:fee,net:net,attendance_rate:att,unpaid_count:unpaid_count,unpaid_amount:unpaid_amount,students:list};
  }
  function normalize(d){
    d=d||{};
    var rev=(d.revenue_month!=null)?d.revenue_month:(d.revenue||0);
    var rate=(d.fee_rate!=null)?d.fee_rate:0.18;
    var fee=(d.fee!=null)?d.fee:Math.round(rev*rate);
    var net=(d.net!=null)?d.net:(rev-fee);
    var sts=(d.students||d.student_list||[]).map(function(x){
      return {name:x.name||x.student_name||'학생', grade:x.grade||x.level||'', att:(x.att!=null)?x.att:(x.attendance!=null?x.attendance:0), pay:x.pay||x.pay_status||x.payment||'예정', due:x.due||x.next_due||''};
    });
    return {
      students_total:(d.students_total!=null)?d.students_total:(d.total_students!=null?d.total_students:sts.length),
      students_active:(d.students_active!=null)?d.students_active:(d.active_students!=null?d.active_students:sts.length),
      revenue_month:rev, fee_rate:rate, fee:fee, net:net,
      attendance_rate:(d.attendance_rate!=null)?d.attendance_rate:(d.attendance!=null?d.attendance:0),
      unpaid_count:(d.unpaid_count!=null)?d.unpaid_count:0, unpaid_amount:(d.unpaid_amount!=null)?d.unpaid_amount:0,
      students:sts
    };
  }
  function kpi(label,val,sub,color,bg){
    return '<div style="background:'+(bg||'rgba(15,23,42,.4)')+';border:1px solid rgba(148,163,184,.22);border-radius:14px;padding:14px 16px">'
      +'<div style="font-size:12px;color:#94a3b8;margin-bottom:6px">'+label+'</div>'
      +'<div style="font-size:22px;font-weight:900;color:'+color+';line-height:1.1">'+val+'</div>'
      +(sub?('<div style="font-size:11px;color:#7c8aa0;margin-top:4px">'+sub+'</div>'):'')+'</div>';
  }
  function attBar(p){
    var c = p>=90?'#34d399':(p>=80?'#fbbf24':'#f87171');
    return '<div style="display:flex;align-items:center;gap:8px">'
      +'<div style="flex:1;height:7px;background:rgba(148,163,184,.2);border-radius:99px;overflow:hidden;min-width:60px"><div style="width:'+p+'%;height:100%;background:'+c+'"></div></div>'
      +'<span style="font-size:12px;font-weight:700;color:'+c+';min-width:34px;text-align:right">'+p+'%</span></div>';
  }
  function payChip(st){
    var m={'완납':['#065f46','#34d399','rgba(16,185,129,.15)'],'미납':['#7f1d1d','#f87171','rgba(248,113,113,.16)'],'예정':['#78350f','#fbbf24','rgba(245,158,11,.16)']};
    var c=m[st]||m['예정'];
    return '<span style="display:inline-block;padding:3px 11px;border-radius:99px;font-size:11.5px;font-weight:800;color:'+c[1]+';background:'+c[2]+';border:1px solid '+c[1]+'55">'+st+'</span>';
  }
  function render(d, academyName){
    var host=document.getElementById('agency-academy-overview'); if(!host) return;
    var rows=d.students.map(function(x){
      return '<tr style="border-bottom:1px solid rgba(148,163,184,.12)">'
        +'<td style="padding:10px 12px;color:#e2e8f0;font-weight:700">'+x.name+'</td>'
        +'<td style="padding:10px 12px;color:#94a3b8;font-size:12.5px">'+x.grade+'</td>'
        +'<td style="padding:10px 12px;min-width:130px">'+attBar(x.att)+'</td>'
        +'<td style="padding:10px 12px;text-align:center">'+payChip(x.pay)+'</td>'
        +'<td style="padding:10px 12px;color:#94a3b8;font-size:12.5px;text-align:right">'+(x.due||'-')+'</td>'
        +'</tr>';
    }).join('');
    host.innerHTML='<div style="background:linear-gradient(135deg,rgba(16,185,129,.13),rgba(16,185,129,.03));border:1px solid rgba(16,185,129,.35);border-radius:18px;padding:18px 20px;margin-bottom:18px">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px">'
      +'<h2 style="margin:0;font-size:19px;font-weight:900;color:#6ee7b7;display:flex;align-items:center;gap:8px">🤝 '+(academyName||'우리 학원')+' · 한눈에 보기</h2>'
      +'<span style="font-size:11.5px;color:#9ae6c4">내 학원 데이터만 표시</span>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px">'
      +kpi('👥 학생수', num(d.students_total)+'<span style="font-size:13px;color:#94a3b8;font-weight:700"> 명</span>', '활성 '+num(d.students_active)+'명', '#e2e8f0')
      +kpi('💰 이번 달 매출', won(d.revenue_month), '이번 달 누적', '#34d399')
      +kpi('🏦 본사 수수료', '-'+won(d.fee), '수수료율 '+(Math.round(d.fee_rate*1000)/10)+'%', '#f87171')
      +kpi('💵 실수령 정산금', won(d.net), '수수료 차감 후', '#fbbf24', 'rgba(245,158,11,.10)')
      +kpi('📊 평균 출석률', d.attendance_rate+'%', '이번 달 기준', (d.attendance_rate>=90?'#34d399':(d.attendance_rate>=80?'#fbbf24':'#f87171')))
      +kpi('💳 미결제', num(d.unpaid_count)+'<span style="font-size:13px;color:#94a3b8;font-weight:700"> 건</span>', won(d.unpaid_amount), (d.unpaid_count>0?'#f87171':'#34d399'))
      +'</div>'
      +'<div style="background:rgba(15,23,42,.45);border:1px solid rgba(148,163,184,.18);border-radius:14px;overflow:hidden">'
      +'<div style="padding:12px 14px;font-size:13.5px;font-weight:800;color:#cbd5e1;border-bottom:1px solid rgba(148,163,184,.18)">🧑‍🎓 학생 목록 · 출석/결제 현황</div>'
      +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:560px">'
      +'<thead><tr style="background:rgba(148,163,184,.08)">'
      +'<th style="padding:10px 12px;text-align:left;font-size:11.5px;color:#94a3b8;font-weight:700">학생</th>'
      +'<th style="padding:10px 12px;text-align:left;font-size:11.5px;color:#94a3b8;font-weight:700">학년·레벨</th>'
      +'<th style="padding:10px 12px;text-align:left;font-size:11.5px;color:#94a3b8;font-weight:700">출석률</th>'
      +'<th style="padding:10px 12px;text-align:center;font-size:11.5px;color:#94a3b8;font-weight:700">결제상태</th>'
      +'<th style="padding:10px 12px;text-align:right;font-size:11.5px;color:#94a3b8;font-weight:700">다음 결제일</th>'
      +'</tr></thead><tbody>'+rows+'</tbody></table></div></div>'
      +'</div>';
    host.style.display='block';
  }
  function init(){
    var s=sess();
    if(!s || s.role!=='agency') return;
    if(!document.getElementById('agency-academy-overview')) return;
    var _bo=document.getElementById('branch-agency-overview'); if(_bo){ _bo.style.display='none'; _bo.innerHTML=''; }
    var aid=s.agency_id||'';
    var academyName=acadName(s);
    var fb=function(){ render(normalize(demoFor(aid)), academyName); };
    try {
      if(typeof fetch!=='function'){ fb(); return; }
      fetch('/api/admin/agency/overview?agency_id='+encodeURIComponent(aid), {headers:{'Accept':'application/json'}})
        .then(function(r){ if(!r.ok) throw 0; return r.json(); })
        .then(function(d){ render(normalize(d), academyName); })
        .catch(fb);
    } catch(e){ fb(); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
