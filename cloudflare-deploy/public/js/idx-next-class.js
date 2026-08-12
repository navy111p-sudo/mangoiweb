// idx-next-class.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

      (function nextClassCountdown(){
        var CARD_ID='next-class-countdown';
        var state={ session:null, list:[], skew:0, fetching:false, lastFetch:0, lastKey:'' };
        /* 강사 이름은 DB 값이다. 문자열을 그대로 innerHTML 에 붙이므로 반드시 막고 쓴다. */
        function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){
          return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
        function L(){ try{ return (window.getLang?window.getLang():'ko')!=='en'; }catch(e){ return true; } }
        function el(){ return document.getElementById(CARD_ID); }
        function homeActive(){ var v=document.getElementById('view-home'); return !!(v&&v.classList.contains('active')); }
        // HH:MM:SS (1시간 미만이면 MM:SS)
        function fmt(ms){ ms=Math.max(0,ms); var s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60); s=s%60; m=m%60; return (h>0?(h+':'):'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
        function timeLabel(ts){ try{ return new Date(ts).toLocaleTimeString(L()?'ko-KR':'en-US',{hour:'2-digit',minute:'2-digit'}); }catch(e){ return ''; } }

        async function refresh(){
          if(state.fetching) return;
          var u=(window.getCurrentUser?window.getCurrentUser():null);
          if(!u||!u.uid){ state.session=null; return; }   // 게스트/미로그인 → 표시 안 함
          state.fetching=true;
          try{
            var role=u.role||'student';
            var qs='role='+encodeURIComponent(role)+'&user_id='+encodeURIComponent(u.uid);
            if(u.name) qs+='&student_name='+encodeURIComponent(u.name);
            var r=await fetch('/api/class/sessions/today?'+qs,{credentials:'include'});
            var d=await r.json();
            if(d&&typeof d.now==='number') state.skew=d.now-Date.now();   // 서버시각 기준 보정
            var cur=(d&&d.current)||null;
            if(!cur){ // current 가 없으면 오늘 남은 세션 중 가장 가까운 것
              var list=((d&&d.sessions)||[]).filter(function(s){return s.status!=='ended';});
              list.sort(function(a,b){return (a.start_ts||0)-(b.start_ts||0);});
              cur=list[0]||null;
            }
            /* 📋 (2026-08-12) 오늘 수업이 둘 이상이면 목록으로도 보여준다 — 전체를 들고 있는다.
               ⚠️ current 하나만 들고 있으면 «앞 수업이 끝났는데 다음 수업이 아직 안 뜨는»
                  공백이 생긴다(지각 입장 15분 동안 서버는 끝난 수업을 계속 current 로 준다). */
            state.list=((d&&d.sessions)||[]);
            state.session=cur; state.lastFetch=Date.now();
          }catch(e){ /* 네트워크 오류는 조용히 무시(다음 주기 재시도) */ }
          finally{ state.fetching=false; }
        }

        function hide(){ var c=el(); if(c){ c.style.display='none'; } state.lastKey=''; }

        // ── 🔔 수업 알림 벨 (WebAudio 종소리 — 오디오 파일 없이 즉시 재생) ──────────
        // 브라우저 자동재생 정책상 최초 사용자 조작 전에는 소리가 막힌다. 조작 1회로 해제.
        var ax=null, axReady=false;
        function ac(){
          try{
            if(!ax){ var C=window.AudioContext||window.webkitAudioContext; if(!C) return null; ax=new C(); }
            if(ax.state==='suspended') ax.resume();
            return ax;
          }catch(e){ return null; }
        }
        function unlockAudio(){ if(axReady) return; axReady=true; ac(); }
        ['pointerdown','keydown','touchstart'].forEach(function(ev){
          document.addEventListener(ev, unlockAudio, {once:true, passive:true});
        });
        function tone(c,t0,freq,dur,vol){
          try{
            var o=c.createOscillator(), g=c.createGain();
            o.type='sine'; o.frequency.setValueAtTime(freq,t0);
            g.gain.setValueAtTime(0.0001,t0);
            g.gain.exponentialRampToValueAtTime(vol,t0+0.012);
            g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
            o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0+dur+0.05);
          }catch(e){}
        }
        function bell(times){
          var c=ac(); if(!c) return;
          var t0=c.currentTime+0.02, n=times||2;
          for(var i=0;i<n;i++){
            var b=t0+i*0.45;
            tone(c,b, 987.77,0.95,0.24);   // B5 (종의 기음)
            tone(c,b,1318.51,0.75,0.13);   // E6 (배음)
            tone(c,b, 659.25,1.15,0.07);   // E5 (여운)
          }
        }
        function sid(s){ return (s.room_id||'')+'@'+(s.start_ts||0); }
        // 세션당 1회만 (새로고침해도 다시 안 울리게 sessionStorage)
        function onceOnly(k){
          try{ if(sessionStorage.getItem('ncc_bell_'+k)) return false; sessionStorage.setItem('ncc_bell_'+k,'1'); return true; }
          catch(e){ if(onceOnly._m&&onceOnly._m[k]) return false; (onceOnly._m=onceOnly._m||{})[k]=1; return true; }
        }
        // 정시 알림: 시작 후 10분 안에서만, 60초 간격 최대 10회 (입장하면 홈을 벗어나므로 멎음)
        var liveRing={key:'',count:0,last:0};
        function ringLive(s,sinceStart){
          if(sinceStart>10*60*1000) return;
          var k=sid(s);
          if(liveRing.key!==k){ liveRing.key=k; liveRing.count=0; liveRing.last=0; }
          if(liveRing.count>=10) return;
          var now=Date.now();
          if(liveRing.last && now-liveRing.last<60000) return;
          liveRing.last=now; liveRing.count++;
          bell(3);
        }

        /* 오늘 «아직 안 끝난» 수업을 시각 순으로. 진행 중인 수업은 시작시각이 가장 이르므로
           자연히 맨 앞에 온다 — 서버의 current 선택(입장가능 우선)과 결과가 같다. */
        function remaining(now){
          var src=(state.list && state.list.length) ? state.list : (state.session?[state.session]:[]);
          var seen={}, out=[];
          for(var i=0;i<src.length;i++){
            var x=src[i]; if(!x) continue;
            if(x.end_ts && now>x.end_ts) continue;          // 이미 끝난 수업
            if(seen[x.schedule_id]) continue; seen[x.schedule_id]=1;
            out.push(x);
          }
          return out.sort(function(a,b){ return (a.start_ts||0)-(b.start_ts||0); });
        }

        /* 📋 오늘 남은 수업이 2개 이상일 때만 붙인다. 1개면 카드 하나로 충분하고,
           줄을 더하면 홈만 길어진다(수업 3~4개인 학생 화면에서 특히). */
        function moreHtml(rest){
          if(!rest.length) return '';
          return '<div class="ncc-more"><div class="ncc-more-top">'
            +(L()?'오늘 남은 수업':'Later today')+'</div>'
            +rest.map(function(x){
              return '<div class="ncc-more-row"><b>'+timeLabel(x.start_ts)+'</b>'
                +(x.teacher_name?('<span>'+esc(x.teacher_name)+'</span>'):'')+'</div>';
            }).join('')+'</div>';
        }

        function render(){
          var c=el(); if(!c) return;
          if(!homeActive()){ hide(); return; }
          var now=Date.now()+state.skew;
          // 표시 대상 = 오늘 남은 것 중 가장 가까운 것. 끝난 수업은 여기서 걸러지므로
          // «앞 수업이 끝나면» 다음 수업으로 저절로 넘어간다(예전엔 카드가 사라졌다).
          var all=remaining(now);
          var s=all[0];
          if(!s){ hide(); return; }
          var rest=all.slice(1);
          var toStart=(s.start_ts||0)-now;
          var joinable=(s.status==='open'||s.status==='live')||toStart<=0;
          var soon=(!joinable && toStart>0 && toStart<=5*60*1000);   // 수업 5분 전
          var teacher=s.teacher_name?( (L()?'강사 ':'Teacher ')+esc(s.teacher_name) ):'';
          // 🔔 알림: 5분 전 1회 / 정시부터 60초 간격 반복
          if(soon && onceOnly(sid(s)+':soon')) bell(2);
          if(joinable) ringLive(s, now-(s.start_ts||now));
          /* ⚠️ 남은 수업 목록도 키에 넣는다 — 안 넣으면 «입장 가능» 상태(키가 고정)에서
             뒤 수업이 끝나도 목록이 옛날 것으로 남는다. 목록은 자주 안 바뀌므로
             입장 버튼을 지우는 재렌더도 사실상 안 일어난다. */
          var restKey=rest.map(function(x){ return x.schedule_id; }).join(',');
          var key=(joinable?('live:'+(s.room_id||'')):('cd:'+(soon?'soon:':'')+fmt(toStart)))+'|'+restKey;
          if(key===state.lastKey && c.style.display==='block') return;   // 불필요한 재렌더 방지(입장버튼 클릭 보호)
          state.lastKey=key; c.style.display='block';
          if(joinable){
            c.innerHTML='<div class="ncc-card ncc-live">'
              +'<div class="ncc-bubble">🔔 수업 들어오세요!<span class="en">Please, enter!</span></div>'
              +'<div class="ncc-top">🔴 '+(L()?'지금 입장할 수 있어요':'You can join now')+'</div>'
              +'<button class="ncc-join" onclick="if(typeof vcJoinMyClass===\'function\')vcJoinMyClass()">▶ '+(L()?'수업 입장':'Join class')+'</button>'
              +(teacher?'<div class="ncc-sub">'+timeLabel(s.start_ts)+' · '+teacher+'</div>':'')
              +'</div>'+moreHtml(rest);
          }else{
            c.innerHTML='<div class="ncc-card'+(soon?' ncc-soon':'')+'">'
              +(soon?'<div class="ncc-bubble ncc-bubble-soon">🔔 곧 수업이 시작돼요<span class="en">Class starts soon!</span></div>':'')
              +'<div class="ncc-top">⏰ '+(L()?'다음 수업까지':'Next class in')+'</div>'
              +'<div class="ncc-time">'+fmt(toStart)+'</div>'
              +'<div class="ncc-sub">'+timeLabel(s.start_ts)+(teacher?' · '+teacher:'')+'</div>'
              +'</div>'+moreHtml(rest);
          }
        }

        function start(){
          if(!document.getElementById('ncc-style')){
            var st=document.createElement('style'); st.id='ncc-style';
            st.textContent='#next-class-countdown{width:fit-content;margin:14px auto 0}'
              +'.ncc-card{background:rgba(0,0,0,.5);border:1px solid rgba(251,191,36,.35);border-radius:16px;padding:12px 22px;text-align:center;color:#e2e8f0;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 8px 24px rgba(0,0,0,.35)}'
              +'.ncc-card.ncc-live{border-color:rgba(239,68,68,.9);animation:nccBlinkLive .8s infinite}'
              +'@keyframes nccBlinkLive{0%,100%{background:rgba(0,0,0,.5);box-shadow:0 8px 24px rgba(239,68,68,.25)}50%{background:rgba(220,38,38,.34);box-shadow:0 0 0 8px rgba(239,68,68,.16),0 8px 30px rgba(239,68,68,.65)}}'
              +'.ncc-card.ncc-soon{border-color:rgba(251,191,36,.85);animation:nccBlinkSoon 1.1s infinite}'
              +'@keyframes nccBlinkSoon{0%,100%{background:rgba(0,0,0,.5);box-shadow:0 8px 24px rgba(251,191,36,.15)}50%{background:rgba(251,191,36,.22);box-shadow:0 0 0 6px rgba(251,191,36,.13),0 8px 30px rgba(251,191,36,.5)}}'
              +'.ncc-bubble{position:relative;display:inline-block;background:#fff;color:#b91c1c;font-weight:900;font-size:15px;line-height:1.3;padding:9px 18px;border-radius:14px;margin:0 0 12px;box-shadow:0 6px 18px rgba(0,0,0,.35);animation:nccBubbleBob 1s infinite}'
              +'.ncc-bubble .en{display:block;margin-top:2px;font-size:12.5px;font-weight:800;color:#334155}'
              +'.ncc-bubble:after{content:"";position:absolute;left:50%;bottom:-8px;margin-left:-8px;border:8px solid transparent;border-bottom:0;border-top-color:#fff}'
              +'.ncc-bubble-soon{color:#b45309}'
              +'@keyframes nccBubbleBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}'
              +'.ncc-top{font-size:12px;color:#fcd34d;font-weight:700;margin-bottom:4px}'
              +'.ncc-card.ncc-live .ncc-top{color:#fca5a5}'
              +'.ncc-time{font-size:30px;font-weight:900;letter-spacing:-1px;color:#7dd3fc;font-variant-numeric:tabular-nums;line-height:1.1}'
              +'.ncc-sub{font-size:11.5px;color:#94a3b8;margin-top:5px}'
              +'.ncc-join{margin-top:2px;background:#f59e0b;color:#1a1a1a;border:none;border-radius:10px;padding:9px 22px;font-size:14px;font-weight:800;cursor:pointer}'
              +'.ncc-join:hover{background:#fbbf24}'
              /* 📋 오늘 남은 수업 목록 — 위 카드보다 한 단 조용하게(글씨·투명도).
                 ⚠️ hover 확대(scale/translate) 금지 — 「정신없다」고 걷어낸 규칙(CLAUDE.md 1-3). */
              +'.ncc-more{margin:8px auto 0;background:rgba(0,0,0,.34);border:1px solid rgba(148,163,184,.28);border-radius:13px;padding:8px 16px;text-align:center;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}'
              +'.ncc-more-top{font-size:10.5px;color:#94a3b8;font-weight:700;letter-spacing:.2px;margin-bottom:4px}'
              +'.ncc-more-row{font-size:12.5px;color:#cbd5e1;line-height:1.7;white-space:nowrap}'
              +'.ncc-more-row b{color:#e2e8f0;font-weight:800;font-variant-numeric:tabular-nums}'
              +'.ncc-more-row span{color:#94a3b8;margin-left:7px}';
            document.head.appendChild(st);
          }
          refresh().then(render);
          // 홈이 보일 때만, 마지막 조회 60초 경과 시 갱신(불필요한 fetch 억제)
          setInterval(function(){ if(homeActive() && (!state.session || Date.now()-state.lastFetch>60000)) refresh(); }, 15000);
          setInterval(render, 1000);
        }
        if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start);
        else start();
      })();
      
