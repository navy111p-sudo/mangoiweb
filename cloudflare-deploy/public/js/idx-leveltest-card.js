// idx-leveltest-card.js — index.html 의 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//   · 본문은 한 글자도 바꾸지 않았다.
//   · classic script 를 «같은 자리» 에 두므로 실행 순서와 전역 스코프가 그대로다.
//     defer 를 붙이면 안 된다 — index.html 의 뒤쪽 코드가 여기 전역을 쓴다.
//   · 고칠 때는 이 파일을 고친다. 내용을 바꾸면 태그의 ?v= 를 반드시 올린다.

      /* 🎟️ 내 레벨테스트 카드 채우기.
         저장된 티켓 주소(신청할 때 남긴 것)로 서버에 상태를 물어 «언제·어떤 상태» 를 보여준다.
         ⚠️ 신청한 적 없으면 아무 요청도 하지 않는다(키가 없으면 바로 반환) — 홈 첫 화면 비용 0.
         ⚠️ 링크가 만료·무효면 키를 지운다. 죽은 카드가 홈에 영영 남아 있으면 안 된다. */
      (function(){
        var KEY = 'mangoi_lt_ticket';
        var url = ''; try { url = localStorage.getItem(KEY) || ''; } catch(e){}
        var k = ''; try { if (/^https?:\/\//.test(url)) k = new URL(url).searchParams.get('k') || ''; } catch(e){}

        /* 🔑 (2026-08-07) 로그인 회원도 홈에서 보이게 — 티켓은 «신청한 그 브라우저» 에만 남는다.
           폰으로 신청하고 PC 로 오면 티켓이 없어 카드가 통째로 안 떴다(사장님 지적).
           회원은 서버에 본인 신청을 물어볼 수 있으므로(uid 서명토큰) 그 길로 대신 채운다.
           ⚠️ 키도 없고 로그인도 아니면 **아무 요청도 하지 않는다** — 홈 첫 화면 비용 0 유지.
           ⚠️ 키 목록은 leveltest 신청서(ltSession)·level-test-ai 와 같아야 한다. */
        var myUid = '', myToken = '';
        try {
          ['mangoi_uid','mango_uid','student_uid','uid','mangoi_parent_uid'].some(function(key){
            var v = localStorage.getItem(key); if (v) { myUid = v; return true; } return false;
          });
          if (!myUid) { var _lu = JSON.parse(localStorage.getItem('mangoi_logged_user') || 'null'); if (_lu && _lu.uid) myUid = _lu.uid; }
          myToken = localStorage.getItem('mango_token') || localStorage.getItem('mangoi_parent_token') || '';
        } catch(e){}
        var canAskServer = !!(myUid && myToken);
        if (!k && !canAskServer) return;

        var el = document.getElementById('hero-lt');
        var whenEl = document.getElementById('hero-lt-when');
        var subEl = document.getElementById('hero-lt-sub');
        if (!el || !whenEl || !subEl) return;
        var EN = function(){ try { return (localStorage.getItem('mangoi_lang')||'') === 'en'; } catch(e){ return false; } };
        var T = function(ko, en){ return EN() ? en : ko; };

        /* 두 언어를 한 번에 만든다 — 화면의 applyLang 이 data-ko/data-en 을 보고 바꿔 주므로
           언어 전환 배선을 내가 따로 할 필요가 없다.
           ⚠️ 직접 배선했다가 «요일만 Fri, 나머지는 한국어» 로 반쪽이 됐다(2026-08-07 실측).
              이 화면의 규칙을 따르는 것이 언제나 더 안전하다. */
        function label(d, t, en){
          if (!d) return t || (en ? 'To be arranged' : '일정 협의 중');
          var p = String(d).split('-'); if (p.length !== 3) return d + (t ? ' ' + t : '');
          var dt = new Date(Date.UTC(+p[0], +p[1]-1, +p[2]));
          var wk = (en ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] : ['일','월','화','수','목','금','토'])[dt.getUTCDay()];
          var head = en ? ((+p[1]) + '/' + (+p[2]) + ' (' + wk + ')') : ((+p[1]) + '월 ' + (+p[2]) + '일(' + wk + ')');
          return head + (t ? ' ' + t : '');
        }
        var ST = {
          pending:   ['접수 완료 — 담당 선생님을 찾고 있어요','Received — finding a teacher'],
          proposed:  ['담당 선생님 배정 중','Assigning a teacher'],
          confirmed: ['확정 — 예정대로 진행됩니다','Confirmed — all set'],
          done:      ['테스트 완료 — 결과 보기','Test completed — see result'],
          cancelled: ['취소됨','Cancelled']
        };
        function put(node, ko, en){
          node.setAttribute('data-ko', ko);
          node.setAttribute('data-en', en);
          var isEn = false; try { isEn = (localStorage.getItem('mangoi_lang')||'') === 'en'; } catch(e){}
          node.textContent = isEn ? en : ko;
        }

        /* 🪜 (2026-09-14, 사장님 B안) «AI 진단 완료 · C2» 의 C2 를 사람이 읽게 — 6칸 게이지.
           [왜] 약어만 내보내서 「C2 가 도대체 뭐야」(사장님). 이름·칸 수·눈금 글자는 전부
                서버 정본(/api/leveltest/my 의 level_display ← cefrDisplay)이 내려주고 여기서는
                **그리기만** 한다. ⛔ 이 파일에 CEFR 이름표·글자 배열을 적지 말 것(두 벌이 되면 어긋난다).
           ⚠️ load() 가 60초마다 다시 돈다 — 매 렌더 첫머리에서 setGauge(null) 로 지우고 그 갈래에서만 다시 그린다.
              안 지우면 «AI 진단» 카드가 «예약 카드» 로 바뀐 뒤에도 게이지가 남는다.
           ⚠️ 게이지는 data-ko/data-en 이 «없는» 형제 요소다 — i18n 엔진이 textContent 를 갈아끼우는 것은
              [data-ko] 요소뿐이라 여기엔 안 닿는다(자식이 있는 요소에 data-ko 를 달면 자식이 사라진다). */
        var GAUGE_ID = 'hero-lt-gauge';
        var GAUGE_CSS = '#hero-lt .lt-gauge{display:block;max-width:320px;margin:8px auto 4px}'
          + '#hero-lt .lt-gauge-bars{display:flex;gap:4px}'
          + '#hero-lt .lt-gauge-bars i{flex:1;height:8px;border-radius:99px;background:rgba(255,255,255,.14);display:block}'
          + '#hero-lt .lt-gauge-bars i.on{background:linear-gradient(90deg,#fde68a,#f59e0b)}'
          + '#hero-lt .lt-gauge-lbl{display:flex;justify-content:space-between;margin-top:3px;font-size:10.5px;font-weight:700;color:rgba(255,255,255,.55);font-variant-numeric:tabular-nums}'
          + '#hero-lt .lt-gauge-lbl span.on{color:#fde68a}';
        function setGauge(disp){
          var old = document.getElementById(GAUGE_ID);
          if (old && old.parentNode) old.parentNode.removeChild(old);
          if (!disp || !disp.ladder || !disp.ladder.length) return;
          if (!document.getElementById('hero-lt-gauge-css')) {
            var st = document.createElement('style'); st.id = 'hero-lt-gauge-css'; st.textContent = GAUGE_CSS;
            document.head.appendChild(st);
          }
          var g = document.createElement('div'); g.id = GAUGE_ID; g.className = 'lt-gauge';
          var bars = document.createElement('div'); bars.className = 'lt-gauge-bars';
          var lbl = document.createElement('div'); lbl.className = 'lt-gauge-lbl';
          for (var i = 0; i < disp.ladder.length; i++) {
            var b = document.createElement('i'); if (i < disp.step) b.className = 'on'; bars.appendChild(b);
            var sp = document.createElement('span'); sp.textContent = disp.ladder[i]; if (i + 1 === disp.step) sp.className = 'on'; lbl.appendChild(sp);
          }
          g.appendChild(bars); g.appendChild(lbl);
          el.insertBefore(g, subEl);
        }

        /* 🙋 회원 경로 — 티켓이 없을 때만 쓴다(티켓 쪽이 «지금 입장하기» 까지 알려주므로 더 낫다).
           ⚠️ 여기서는 join_open 을 모른다. 모르는 것을 아는 척해 초록 입장 카드를 만들면
              눌렀을 때 들어갈 곳이 없다 — 상태와 «마이페이지에서 보기» 만 말한다.
           ⚠️ 취소된 건은 건너뛴다. 지난 신청만 남았으면 «완료» 로만 보인다. */
        function loadMine(){
          if (!canAskServer) { el.hidden = true; return; }
          fetch('/api/leveltest/my?uid=' + encodeURIComponent(myUid) + '&token=' + encodeURIComponent(myToken), { cache:'no-store' })
            .then(function(r){ return r.json(); })
            .then(function(d){
              setGauge(null);
              var items = (d && d.ok && d.items) ? d.items : [];
              items = items.filter(function(a){ return a && a.status !== 'cancelled'; });
              if (!items.length) { el.hidden = true; return; }
              /* 가장 «지금 신경 쓰이는» 한 건: 아직 안 끝난 것 중 가장 가까운 시각.
                 🕒 (2026-08-07) 예전엔 «날짜만» 비교해서(setHours(0,0,0,0)) 오늘 18시 수업이
                    오늘 자정까지 «다가올 수업» 이었다. 그래서 끝난 수업이 홈에 계속 앉아
                    「담당 선생님 배정 중」 이라고 말했다 — 실제로 사장님이 보신 화면이다.
                    desired_time 까지 봐서 «끝난 것» 은 다가올 목록에서 뺀다. */
              var GRACE_MS = 60 * 60000;            // 종료 판정 유예 — 20분 수업 + 지각/연장 여유
              var nowMs = Date.now();
              function startMs(a){
                if (!a.desired_date) return NaN;
                var p = String(a.desired_date).split('-'); if (p.length !== 3) return NaN;
                var hm = String(a.desired_time || '').split(':');
                return new Date(+p[0], +p[1]-1, +p[2], +hm[0] || 0, +hm[1] || 0, 0).getTime();
              }
              var upcoming = items.filter(function(a){
                var s = startMs(a); return !isNaN(s) && (s + GRACE_MS) >= nowMs;
              }).sort(function(a,b){ return startMs(a) - startMs(b); });
              var it = upcoming[0];
              /* 남은 일정이 없다 — 홈은 «지금 신경 쓸 것» 자리다. 결과가 나왔으면 그것만 남기고,
                 아니면 카드를 내린다. 지난 신청은 마이페이지·사이드바에서 언제든 볼 수 있다. */
              if (!it) {
                var withResult = items.filter(function(a){ return a && a.final_level; })[0];
                if (!withResult) { el.hidden = true; return; }
                el.classList.remove('is-open');
                el.href = '/parent.html?uid=' + encodeURIComponent(myUid);
                /* 🤖 (2026-09-14) «AI 자가 진단» 만 돌린 행 — 신청서가 아니다.
                   /api/leveltest/diagnose 는 pending 신청이 없으면 source='ai-diagnosis' 로
                   날짜 없는 행을 새로 만든다. 그 행을 신청처럼 그리면 「일정 협의 중 /
                   테스트 완료」 가 되어 «신청한 적 없는데 협의 중» 이라는 거짓말이 된다
                   (2026-09-14 사장님 화면, D1 id 24). 사실대로 «AI 진단 완료 · 레벨» 로 적는다.
                   ⚠️ 판정은 서버가 준 source 로 — 날짜가 없다는 것만으로 짐작하지 않는다. */
                if (withResult.source === 'ai-diagnosis' && !withResult.desired_date) {
                  var lv = String(withResult.final_level || '');
                  /* 🪜 (2026-09-14) 서버가 이름·게이지 재료를 주면 그것으로, 없으면(옛 서버·모르는 값) 원문 그대로.
                     ⛔ 여기서 이름을 지어내지 않는다 — «최상급» 같은 이름은 BAND_SPECS 의 것이고 서버가 고른다. */
                  var disp = withResult.level_display;
                  if (disp && disp.ko && disp.en && disp.ladder && disp.ladder.length) {
                    put(whenEl, 'AI 진단 완료 · ' + disp.ko, 'AI diagnosis done · ' + disp.en);
                    setGauge(disp);
                    var stepKo = disp.step > 0 ? disp.cefr + ' · ' + disp.of + '단계 중 ' + disp.step + '단계' : disp.ladder[0] + ' 미만';
                    var stepEn = disp.step > 0 ? disp.cefr + ' · step ' + disp.step + ' of ' + disp.of : 'Below ' + disp.ladder[0];
                    put(subEl, stepKo + ' · 결과 보기 →', stepEn + ' · See result →');
                  } else {
                    put(whenEl, 'AI 진단 완료 · ' + lv, 'AI diagnosis done · ' + lv);
                    put(subEl, '결과 보기 →', 'See result →');
                  }
                  el.hidden = false;
                  return;
                }
                put(whenEl, label(withResult.desired_date, withResult.desired_time, false),
                            label(withResult.desired_date, withResult.desired_time, true));
                put(subEl, '테스트 완료 — 결과 보기 →', 'Test completed — see result →');
                el.hidden = false;
                return;
              }
              el.classList.remove('is-open');
              el.href = '/parent.html?uid=' + encodeURIComponent(myUid);
              put(whenEl, label(it.desired_date, it.desired_time, false), label(it.desired_date, it.desired_time, true));
              var st = ST[it.status] || ['진행 중', 'In progress'];
              put(subEl, st[0] + ' · 마이페이지에서 보기 →', st[1] + ' · View in My Page →');
              el.hidden = false;
            })
            .catch(function(e){ try { console.warn('[hero-lt:my]', e); } catch(_){} });
        }

        /* 🔗 (2026-08-11) 티켓 + 로그인 = 이 신청을 «내 계정» 으로 잇는다.
           [왜] 티켓은 «신청한 그 브라우저» 에만 남는다. PC 로 신청하면 폰에서는 통째로 안 보였다.
                한 번 이어 두면 그 뒤로는 로그인만 하면 어느 기기에서나 보인다.
           ⚠️ 한 번만 보낸다 — load() 는 60초마다·탭 복귀마다 돈다. 매번 보내면 쓰기가 쌓인다.
           ⚠️ 응답을 기다리지 않는다. 잇기는 «다음 기기» 를 위한 것이고, 이 화면은 티켓으로
              이미 제대로 그려진다. 실패해도 지금 보이는 것이 나빠지지 않아야 한다. */
        var claimed = false;
        function claimOnce(){
          if (claimed || !k || !canAskServer) return;
          claimed = true;
          try {
            fetch('/api/leveltest/my?uid=' + encodeURIComponent(myUid)
                  + '&token=' + encodeURIComponent(myToken)
                  + '&k=' + encodeURIComponent(k), { cache:'no-store' })
              .catch(function(){});
          } catch(e){}
        }

        function load(){
          claimOnce();
          if (!k) { loadMine(); return; }
          fetch('/api/leveltest/ticket?k=' + encodeURIComponent(k), { cache:'no-store' })
            .then(function(r){ return r.json(); })
            .then(function(d){
              setGauge(null);
              if (!d || !d.ok || !d.ticket) {
                // 만료·무효 — 죽은 카드를 홈에 남기지 않는다.
                // 단 회원이면 서버에 본인 신청을 다시 물어본다(티켓만 죽었을 뿐 신청은 살아 있다).
                try { localStorage.removeItem(KEY); } catch(e){}
                k = '';
                el.hidden = true;
                loadMine();
                return;
              }
              var t = d.ticket;
              /* 🕒 (2026-08-07) 끝난 수업을 홈에 붙들지 않는다.
                 서버는 close_at_ts(종료 + 지각허용 15분) 를 내려주는데 여기서 «쓰지 않아서»,
                 티켓이 살아 있는 동안 지난 수업이 계속 「담당 선생님 배정 중」 으로 앉아 있었다.
                 결과가 나온 뒤라면 그 한 줄은 홈에 남길 값어치가 있다 — 그때만 남긴다. */
              if (t.close_at_ts && t.now > t.close_at_ts) {
                if (!t.has_result) { el.hidden = true; return; }
                el.classList.remove('is-open');
                el.href = url;
                put(whenEl, label(t.desired_date, t.desired_time, false), label(t.desired_date, t.desired_time, true));
                put(subEl, '테스트 완료 — 결과 보기 →', 'Test completed — see result →');
                el.hidden = false;
                return;
              }
              el.href = url;
              put(whenEl, label(t.desired_date, t.desired_time, false), label(t.desired_date, t.desired_time, true));
              if (t.join_open) {
                el.classList.add('is-open');
                put(subEl, '▶ 지금 입장하기 — 선생님이 기다리고 있어요', '▶ Join now — your teacher is waiting');
              } else {
                el.classList.remove('is-open');
                var st = ST[t.status] || ['', ''];
                var mins = t.start_ts ? Math.round((t.start_ts - t.now) / 60000) : 0;
                var soonKo = (t.start_ts && mins > 0 && mins <= 180) ? ' · ' + mins + '분 뒤' : '';
                var soonEn = (t.start_ts && mins > 0 && mins <= 180) ? ' · in ' + mins + ' min' : '';
                put(subEl, st[0] + soonKo + ' · 자세히 보기 →', st[1] + soonEn + ' · View details →');
              }
              el.hidden = false;
            })
            .catch(function(e){ try { console.warn('[hero-lt]', e); } catch(_){} });
        }

        load();
        /* 시간이 되면 «저절로» 초록 입장 카드로 바뀌어야 한다 — 새로고침을 시키면 그 순간 이탈한다. */
        setInterval(load, 60000);
        document.addEventListener('visibilitychange', function(){ if (!document.hidden) load(); });
        /* 🌐 언어 전환은 화면의 applyLang 이 data-ko/data-en 을 보고 처리한다 — 여기서 배선하지 않는다. */
      })();
      
