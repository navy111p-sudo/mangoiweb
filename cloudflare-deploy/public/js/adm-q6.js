// ═══════════════════════════════════════════════════════════════
// adm-q6.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var ph54State = {
    weekOffset: 0,         // 0 = 이번 주, -1 = 지난 주, +1 = 다음 주
    teacherFilter: '',     // '' = 전체, 또는 강사 id
    teachers: [],          // [{id, name, korean_name, english_name}]
    records: [],           // [{teacher_id, teacher_name, date, scheduled, actual, late_min}]
    /* 🪞 (2026-08-31) 카페24에만 있는 수업을 이 캘린더에 «겹쳐» 보여주기 위한 자리.
       class_schedules 와 섞지 않는다 — 드래그·삭제·차단이 전부 records 의 인덱스로 도는데
       여기에 섞으면 «카페24 카드를 끌었더니 엉뚱한 수업에 PATCH 가 나가는» 사고가 난다. */
    c24: [],               // [{teacher_id, date, start_time, duration_min, student_name, verdict}]
    c24On: true,           // 「카페24 수업 함께 보기」 체크박스
    c24Msg: '',            // 못 읽었을 때 이유(빈 화면을 «수업 없음» 으로 오해하지 않게)
    c24Cache: {},          // 주(월요일) → { t, rows, msg }
    /* 🗂 (2026-09-02 사장님 선택 B-1) 전체 보기에서 «펼친 요일»(0=월 … 6=일).
       null 이면 렌더 때 오늘(이번 주가 아니면 수업이 있는 첫 요일)로 정한다. 주를 옮기면 null 로 되돌린다. */
    openDay: null
  };
  try { ph54State.c24On = (localStorage.getItem('ph54_c24_overlay') !== '0'); } catch(e){}

  /* 🌐 (2026-08-07) 이 캘린더를 하루 종일 쓰는 사람은 **필리핀 매니저**다.
     그런데 차단/삭제 안내문이 전부 한국어였다 — 「매주 반복할까요?」 를 못 읽고 확인을 누르면
     그날 하루만 막으려던 것이 매주 반복이 된다. 확인 문구는 영어를 함께 적는다. */
  function ph54En(){
    try { return (document.documentElement.lang === 'en') || (window.adminLang === 'en') || (window.currentLang === 'en'); }
    catch(e){ return false; }
  }
  function ph54T(ko, en){ return ph54En() ? en : ko; }

  /* 🕐 차단(휴식시간) 입력 창 — 시작·종료를 직접 고른다(요청 ⑮).
     ⚠️ 저장은 하지 않는다. 고른 값만 콜백으로 넘긴다 — 저장 경로는 한 곳(호출부)에만 둔다.
        여기서도 fetch 를 하면 «두 번째 저장 경로» 가 생겨 나중에 반드시 갈라진다. */
  function ph54BlockDialog(opt, onOk){
    var old = document.getElementById('ph54-blk-dlg'); if (old) old.remove();
    var en = ph54En();
    var wrap = document.createElement('div');
    wrap.id = 'ph54-blk-dlg';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;'
      + 'background:rgba(15,23,42,.55);padding:16px';
    var inp = 'width:100%;padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;font-family:inherit;box-sizing:border-box';
    wrap.innerHTML =
      '<div role="dialog" aria-modal="true" style="width:min(380px,100%);background:#fff;color:#0f172a;border-radius:14px;'
      + 'box-shadow:0 20px 50px rgba(0,0,0,.35);padding:18px 20px;font-size:14px;line-height:1.6">'
      + '<div style="font-size:16px;font-weight:900;margin-bottom:2px">🚫 ' + ph54Esc(opt.teacher || '')
      +   ' — ' + ph54T('시간 차단', 'Block time') + '</div>'
      + '<div style="font-size:12.5px;color:#64748b;margin-bottom:14px">' + ph54Esc(opt.dateStr || '')
      +   ' (' + ph54Esc(opt.dayLabel || '') + ')</div>'
      + '<div style="display:flex;gap:8px;margin-bottom:12px">'
      +   '<div style="flex:1"><label style="font-size:12px;font-weight:700;color:#475569">' + ph54T('시작', 'From') + '</label>'
      +     '<input type="time" id="ph54-blk-from" step="600" value="' + ph54Esc(opt.from) + '" style="' + inp + '"></div>'
      +   '<div style="flex:1"><label style="font-size:12px;font-weight:700;color:#475569">' + ph54T('종료', 'To') + '</label>'
      +     '<input type="time" id="ph54-blk-to" step="600" value="' + ph54Esc(opt.to) + '" style="' + inp + '"></div>'
      + '</div>'
      + '<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:#475569">'
      +   ph54T('사유', 'Reason') + '</label>'
      +   '<input type="text" id="ph54-blk-reason" value="' + ph54Esc(ph54T('언더타임', 'undertime')) + '" style="' + inp + '"></div>'
      + '<div style="margin-bottom:6px;font-size:12px;font-weight:700;color:#475569">' + ph54T('반복', 'Repeat') + '</div>'
      + '<label style="display:block;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:6px;cursor:pointer">'
      +   '<input type="radio" name="ph54-blk-rep" value="once" checked> '
      +   ph54T('이 날짜만 (' + (opt.dateStr || '') + ')', 'Only this date (' + (opt.dateStr || '') + ')') + '</label>'
      + '<label style="display:block;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;margin-bottom:10px;cursor:pointer">'
      +   '<input type="radio" name="ph54-blk-rep" value="weekly"> '
      +   ph54T('매주 ' + (opt.dayLabel || '') + '요일 반복', 'Every ' + (opt.dayLabel || '')) + '</label>'
      + '<div style="font-size:11.5px;color:#64748b;background:#f1f5f9;border-radius:8px;padding:8px 10px;margin-bottom:14px">ℹ️ '
      +   ph54T('지울 때는 캘린더에서 그 차단 카드를 누르면 됩니다. 매주 반복은 지울 때까지 계속됩니다.',
                'To remove it, click the block card on the calendar. A weekly block repeats until you delete it.') + '</div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
      +   '<button type="button" id="ph54-blk-x" style="padding:9px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-weight:700;cursor:pointer">'
      +     ph54T('취소', 'Cancel') + '</button>'
      +   '<button type="button" id="ph54-blk-ok" style="padding:9px 16px;border:0;background:#dc2626;color:#fff;border-radius:8px;font-weight:800;cursor:pointer">'
      +     ph54T('차단하기', 'Block') + '</button>'
      + '</div></div>';
    document.body.appendChild(wrap);
    function close(){ wrap.remove(); }
    wrap.querySelector('#ph54-blk-x').addEventListener('click', close);
    // 바깥 클릭으로 닫기 — 입력 중 실수로 사라지지 않게 «배경 정확히» 눌렀을 때만
    wrap.addEventListener('click', function(e){ if (e.target === wrap) close(); });
    wrap.querySelector('#ph54-blk-ok').addEventListener('click', function(){
      var f = (wrap.querySelector('#ph54-blk-from').value || '').slice(0,5);
      var t = (wrap.querySelector('#ph54-blk-to').value || '').slice(0,5);
      if (!/^\d{2}:\d{2}$/.test(f) || !/^\d{2}:\d{2}$/.test(t)){
        alert(ph54T('시작·종료 시간을 모두 골라 주세요.', 'Please choose both start and end time.')); return;
      }
      if (t <= f){   // 문자열 비교로 충분하다(둘 다 HH:MM 24시간 표기)
        alert(ph54T('종료 시간이 시작보다 빠릅니다.', 'End time must be after the start time.')); return;
      }
      var rp = wrap.querySelector('input[name="ph54-blk-rep"]:checked');
      var reason = (wrap.querySelector('#ph54-blk-reason').value || '').trim() || ph54T('차단', 'blocked');
      close();
      onOk({ from: f, to: t, weekly: !!(rp && rp.value === 'weekly'), reason: reason });
    });
  }

  function ph54Pad(n){ return n < 10 ? '0'+n : ''+n; }
  function ph54FmtDate(d){ return d.getFullYear()+'-'+ph54Pad(d.getMonth()+1)+'-'+ph54Pad(d.getDate()); }
  function ph54StartOfWeek(d){
    var x = new Date(d); var dow = x.getDay();
    var diff = (dow === 0 ? -6 : 1 - dow);  // 월요일 시작
    x.setDate(x.getDate() + diff);
    x.setHours(0,0,0,0);
    return x;
  }

  function ph54GetWeekDays(){
    var base = ph54StartOfWeek(new Date());
    base.setDate(base.getDate() + ph54State.weekOffset * 7);
    return Array.from({length:7}, function(_,i){
      var d = new Date(base);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  /* 🔴 (2026-08-06) 강사 필터가 «다른 번호 체계» 를 보고 있었다.
     이 캘린더가 그리는 것은 class_schedules 이고, 그 teacher_id 는 **teachers.id** 다(운영 664건 전부 일치).
     그런데 필터 목록은 teacher_profiles 에서 가져와 **teacher_profiles.id** 를 값으로 썼다.
     두 표는 번호가 완전히 다른 체계라, 숫자가 우연히 겹치면서 **엉뚱한 사람의 수업이 나왔다**:
       · 마이마이  = profiles #25 / teachers #27  → 「Teacher Maimai」 로 거르면 teacher_id='25' 를 찾는데
                                                   그건 KARL 이라 **0건**(실제 마이마이 수업은 27번에 있다)
       · 「Teacher Len」(profiles #8) 으로 거르면 teachers #8 = **KAYE 의 수업 50건**이 나왔다
     운영 예약 664건 중 611건이 profiles 에도 «존재하는 번호» 라 조용히 틀린 사람을 보여주고 있었다.
     → 캘린더가 쓰는 표(teachers)에서 그대로 가져와 번호 체계를 하나로 맞춘다. */
  async function ph54LoadTeachers(){
    try {
      var r = await fetch('/api/admin/teachers', { credentials:'include', cache:'no-store' });
      var j = await r.json();
      if (j && j.ok && Array.isArray(j.items) && j.items.length) {
        ph54State.teachers = j.items.map(function(t){
          return { id: t.id, name: t.name || t.korean_name || t.english_name || ('강사 '+t.id) };
        });
        return;
      }
    } catch(e){ console.warn('[ph54] teacher load', e); }
    // fallback — 클라이언트 시드
    ph54State.teachers = ['Karl','Melca','Mo','Penny','Chaine'].map(function(n,i){
      return { id: 't'+i, name: n };
    });
  }

  async function ph54LoadSchedules(){
    // 🗓 강사 '수업 스케줄'(class_schedules)을 로드한다.
    //    - /api/admin/schedules?week=<해당 주 월요일> 가 그 주(월~일)로 펼친 슬롯 배열을 돌려줌.
    //    - ⚠️ 각 슬롯의 teacher_id 는 **teachers.id** 다. (예전 주석은 teacher_profiles.id 라고
    //      적혀 있었는데 그게 틀렸고, 그 오해가 위의 필터 버그를 만들었다.)
    //    - 표시 중인 주(weekOffset)에 맞춰 매번 다시 불러온다.
    var monday = ph54FmtDate(ph54GetWeekDays()[0]);   // 현재 보고 있는 주의 월요일
    try {
      // no-store 제거 → adm-perf 클라이언트 캐시(주별 60초) 적용. 드래그 이동(PATCH) 시 캐시 자동 무효화됨.
      var r = await fetch('/api/admin/schedules?week=' + monday, { credentials:'include' });
      if (r.ok) {
        var j = await r.json();
        var arr = (j && (j.schedules || j.items)) || [];
        ph54State.records = Array.isArray(arr) ? arr : [];
        return;
      }
    } catch(e){ console.warn('[ph54] schedules load', e); }
    ph54State.records = [];   // 실패 시 빈 상태(가짜 데이터로 채우지 않음)
  }

  /* 🪞 (2026-08-31 사장님) 「카페24에 있는 수업이 mangoi.ai 에도 잡히도록. 바로 잡는 게
     어렵다면 잡힌 것처럼 보이게라도」 — 그래서 **보기 전용 겹쳐 그리기**로 먼저 넣는다.
     ⛔ class_schedules 에 행을 만들지 않는다. 만드는 순간 «실제로 열리는 수업» 이 되는데,
        카페24에 «없는 수업»(취소·강사변경 잔재)이 섞여 있는 것이 8/31 에 확인됐다
        (허윤아 17:00 에 Kes·Sid 두 건이 있는데 실제로는 Zee 한 명뿐이었다).
        그것을 그대로 만들면 학생·강사가 «있지도 않은 수업» 을 기다린다.
     ✅ 그래서 지금 단계는 «카페24에는 이렇게 잡혀 있습니다» 를 그대로 비춰 주기만 한다.
     ℹ️ 자료는 그림자 성적표(/api/admin/reports/c24-mirror)를 그대로 쓴다 —
        판정(강사 잇기·학생 확인·중복)이 이미 그 한 곳에 있고, 화면이 규칙을 또 만들면 갈라진다. */
  var PH54_C24_TTL = 120000;   // 같은 주를 다시 그릴 때 2분은 다시 안 묻는다(Neo4j 왕복)
  /* 그릴 것 = «망고아이 시간표에 아직 그 행이 없는» 것뿐.
     already·update·manual_locked·diverged·conflict 는 이미 진짜 카드로 그려지므로 겹치면 두 번 보인다. */
  /* 🔴 (2026-09-01) conflict 를 «안 그리던» 것을 되살렸다.
     안 그린 이유는 「이미 진짜 카드로 그려지므로 두 번 보인다」였는데, **강사 필터를 걸면
     그 진짜 카드는 «다른 강사» 것이라 이 화면에 없다** — 결과적으로 아무 데도 안 보였다.
     실측: Mariane 30건 중 화면에 28건만 떴다(Ana 로 이미 만든 9/1 17:00·21:40 이 사라짐).
     하필 사장님이 「이 강사 수업이 진짜인가」를 카페24와 대조하려던 바로 그 건들이었다.
     ✅ 그리되 «겹친다» 고 말한다 — 두 번 보이는 것보다 안 보이는 것이 나쁘다. */
  var PH54_C24_SHOW = { ok:1, not_whitelisted:1, no_student:1, conflict:1 };
  var PH54_C24_WHY = {
    ok:              { ko:'✅ 미러를 켜면 이 수업이 망고아이에도 만들어집니다.', en:'✅ Will be created in Mangoi once the mirror is on.' },
    not_whitelisted: { ko:'⏸ 아직 미러를 켜지 않은 강사입니다 (그림자 단계).',   en:'⏸ Mirror is not enabled for this instructor yet (shadow stage).' },
    no_student:      { ko:'⚠️ 이 학생 계정이 망고아이에 없습니다 — 그대로는 만들 수 없습니다.', en:'⚠️ This student account does not exist in Mangoi.' },
    conflict:        { ko:'⚠️ 그 학생은 같은 시각에 다른 수업이 이미 있습니다 — 둘 중 하나는 잘못된 예약입니다. 카페24에서 확인이 필요합니다.',
                       en:'⚠️ That student already has another class at the same time — one of the two is wrong. Check Cafe24.' }
  };
  /* 🔴 (2026-09-01 사장님 화면 확인) 지난 주를 열면 「수업 0개 · 카페24 58개」 가 뜨고
     카드마다 「미러를 켜면 만들어집니다」 라고 적혀 있었다. **거짓말이다** —
     미러 창은 «오늘부터» 라서 지난 수업은 영영 안 만들어진다.
     매니저에게는 「58건이 빠졌다」 로 읽힌다.
     ⛔ 그렇다고 지난 카드를 «감추면» 안 된다 — 그러면 「지난주에 수업이 하나도 없었다」 는
        반대쪽 거짓말이 된다(카페24에는 실제로 58건이 있었다).
     ✅ 그래서 «지우지 말고 다른 말을 하게» 한다 — 지난 것은 «기록», 앞으로 것만 «대기». */
  function ph54TodayKst(){
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }

  async function ph54LoadC24(){
    if (!ph54State.c24On){ ph54State.c24 = []; ph54State.c24Msg = ''; return; }
    var days  = ph54GetWeekDays();
    var since = ph54FmtDate(days[0]), until = ph54FmtDate(days[6]);
    var hit = ph54State.c24Cache[since];
    if (hit && (Date.now() - hit.t) < PH54_C24_TTL){ ph54State.c24 = hit.rows; ph54State.c24Msg = hit.msg; return; }
    var rows = [], msg = '';
    try {
      var r = await fetch('/api/admin/reports/c24-mirror?since='+since+'&until='+until, { credentials:'include' });
      var j = await r.json().catch(function(){ return null; });
      /* 🔴 «성공이라고 말했는가» 로 판정한다. 404 본문에는 ok 칸이 아예 없어서
         `if (d.ok === false)` 는 그냥 통과하고 빈 배열이 «오늘은 없나 보다» 로 읽힌다(CLAUDE.md 2장). */
      if (r.status === 403 || r.status === 401){
        /* 권한이 없는 계정(강사·지사)은 «고장» 이 아니다. 경고를 띄우면 매니저가 장애로 신고한다. */
        msg = '';
      } else if (!r.ok || !j || j.ok !== true){
        msg = ph54T('카페24 수업을 읽지 못했습니다', 'Could not read Cafe24 classes')
            + ' (' + ((j && (j.error || j.message)) || ('HTTP ' + r.status)) + ')';
      } else {
        /* 🔴 (2026-09-01) 그리는 것과 «세는 것» 을 갈랐다.
             예전에는 여기서 PH54_C24_SHOW 가 아닌 판정을 통째로 버렸다. 그래서 아래 범례의
             「강사 못 이음 N개」가 **영원히 0** 인 죽은 코드였다 — 세려는 행이 이미 없었다.
             사장님이 Mariane 을 퇴사 처리하자 그 사람의 카페24 잔재 30건이 화면에서
             «말없이» 사라진 것이 그 때문이다(카드도 없고 숫자도 없고 경고도 없었다).
           ✅ 그리지 않는 판단은 그대로 둔다(누구 칸에 놓을지 모르는 것을 아무 데나 놓지 않는다).
              대신 «몇 건이 왜 안 그려졌는지» 는 남겨서 범례가 말하게 한다. */
        rows = (Array.isArray(j.rows) ? j.rows : []);
      }
    } catch(e){
      msg = ph54T('카페24 수업을 읽지 못했습니다 (네트워크)', 'Could not read Cafe24 classes (network)');
    }
    ph54State.c24 = rows; ph54State.c24Msg = msg;
    ph54State.c24Cache[since] = { t: Date.now(), rows: rows, msg: msg };
  }

  /* 두 가지를 함께 읽는다 — 호출부(주 이동·저장 후 새로고침)가 여러 곳이라 여기서 묶는다.
     ⚠️ 카페24 쪽이 느리거나 죽어도 스케줄은 그려져야 하므로 Promise.all 이되 ph54LoadC24 는
        스스로 예외를 삼키고 이유만 남긴다. */
  async function ph54LoadRecords(){
    await Promise.all([ ph54LoadSchedules(), ph54LoadC24() ]);
  }

  // HTML 이스케이프 (학생 이름 등 안전 출력)
  function ph54Esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  /* 🎨 (2026-08-11 사장님 지시) 「다른 캘린더 스케줄의 박스색들과 동일하게」
     스케줄 캘린더가 두 개인데 색이 서로 달랐다 — 같은 1:1 수업이 여기서는 진보라(#7c3aed),
     admin/weekly-schedule.html 에서는 라벤더(#bcaef0) 였다. 두 화면을 오가는 매니저에게는
     «다른 것» 으로 보인다. 정본은 **admin/weekly-schedule.html** 쪽 파스텔로 맞춘다
     (그쪽은 ivory 테마 변수 --cell-1on1/group/temp 까지 갖춘 완성된 팔레트라 옮기기 쉽다).
       · 1:1   #bcaef0 라벤더      (weekly-schedule .slot-1on1)
       · 그룹  #f4abce 소프트핑크  (weekly-schedule .slot-group)
       · 대체  #8cc3f0 스카이블루  (weekly-schedule .slot-temp)
       · 휴무  회색 사선          (weekly-schedule .slot-blocked 와 같은 패턴)
       · 레벨테스트 #a7ddd4 — 저쪽엔 없는 유형이라 같은 명도대(파스텔)로 새로 뽑았다
     ⚠️ 배경이 밝아졌으므로 카드 글자는 흰색이면 안 읽힌다.
        admin-inline-c.css 의 `.ph54-ev { color }` 를 #1e293b 로 함께 바꿨다(둘은 한 몸). */
  var PH54_BLOCK_HATCH = 'repeating-linear-gradient(45deg,#cbd5e1,#cbd5e1 5px,#aab6c6 5px,#aab6c6 10px)';
  var PH54_TYPE_COLOR = { '1on1':'#bcaef0', 'group':'#f4abce', 'temp':'#8cc3f0', 'blocked':PH54_BLOCK_HATCH, 'leveltest':'#a7ddd4' };
  var PH54_TYPE_LABEL = { '1on1':'1:1', 'group':'그룹', 'temp':'대체', 'blocked':'휴무', 'leveltest':'레벨테스트' };

  /* 🏷 (2026-08-11) 「이 칸은 무엇인가」 — 카드에 정체를 적는다.
     활성 667행 중 진짜 망고아이 수업은 9행뿐이고, BELLE 처럼 24칸이 꽉 찬 강사도
     사실은 전부 «옛 LMS 에서 수업 중이라 못 쓰는 시간» 이다(user_id='lms').
     학생이 안 붙어 있어 카드에 이름 대신 유형만 나오는데, 그게 「1:1 수업」 으로 읽혔다.
     → 지우지 않고(운영 판단 영역) 정체만 밝힌다. api-teacher.ts 가 [수업 입장] 버튼을
       빼는 것과 같은 처리 — 그쪽과 판정 기준(origin)이 하나여야 한다. */
  var PH54_ORIGIN = {
    lms:    { badge:'LMS',  ko:'LMS 점유 (망고아이 수업 아님)', en:'LMS busy (not a Mangoi class)' },
    sample: { badge:'시드', ko:'시연용 샘플 데이터',            en:'Demo seed data' }
  };
  function ph54OriginOf(s){ return PH54_ORIGIN[String(s && s.origin || '')] || null; }

  /* 강사 원부(teachers)와 강사관리 표(teacher_profiles)는 «이름 표기» 도 다르다:
       'Teacher Maimai'(profiles) vs 'MAIMAI'(teachers)
     강사 목록 행의 📅 버튼은 profiles 쪽 id 를 갖고 있으므로, 이름으로 teachers.id 를 되찾는다.
     ⚠️ 부분일치를 먼저 하면 안 된다 — 'FAR' 가 'HT FARRAH' 에 걸려 남의 일정이 뜬다(실제 사고 사례).
        ① 접두사 떼고 완전일치 → ② 「HT NESS」처럼 접두어가 붙은 경우만 **단어 단위**로 비교. */
  function ph54NormName(s){
    return String(s||'').replace(/^\s*(?:teacher|tutor|강사|선생님)\s+/i, '').trim().toUpperCase();
  }
  function ph54ResolveTeacherId(name){
    var want = ph54NormName(name);
    if (!want) return '';
    var list = ph54State.teachers || [];
    for (var i = 0; i < list.length; i++) if (ph54NormName(list[i].name) === want) return String(list[i].id);
    for (var j = 0; j < list.length; j++) {
      if (ph54NormName(list[j].name).split(/\s+/).indexOf(want) !== -1) return String(list[j].id);
    }
    return '';
  }

  // 한 개 수업 슬롯 → 캘린더 블록 HTML (시간 · 인원 + 학생 이름)
  function ph54ClassBlock(s){
    var c   = PH54_TYPE_COLOR[s.type] || '#7c3aed';
    var stu = (s.students || []).map(function(x){ return x && x.name; }).filter(Boolean).join(', ');
    var lbl = stu || PH54_TYPE_LABEL[s.type] || '수업';
    var time= s.start_time || (s.hour != null ? (ph54Pad(s.hour)+':00') : '');
    var dur = s.duration_min ? (' · ' + s.duration_min + '분') : '';
    return '<span class="ph54-slot ph54-class ph54-t-'+(s.type||'')+'" style="background:'+c+'" title="'
        + ph54Esc(time+' '+(PH54_TYPE_LABEL[s.type]||'')+(stu?(' · '+stu):'')) + '">'
      + '<b>'+ph54Esc(time)+'</b><span class="ph54-dur">'+ph54Esc(dur)+'</span>'
      + '<span class="ph54-stu">'+ph54Esc(lbl)+'</span>'
      + '</span>';
  }

  // ───────────────────────────────────────────────────────────────
  // 🗓 구글 캘린더 스타일 '주간 타임라인' 렌더
  //   · 세로축 = 06:00~24:00 (30분 스냅), 가로축 = 월~일
  //   · 수업(이벤트) 카드는 시작시간/지속시간에 따라 절대위치(top/height)로 배치
  //   · 카드 내부 = [시간·지속] + [학생 이름(말줄임)] + [수업유형]
  //   · HTML5 Drag&Drop 으로 다른 요일/시간으로 이동 → 토스트+콘솔로 변경 알림
  // ───────────────────────────────────────────────────────────────
  var PH54_START_H = 6, PH54_END_H = 24, PH54_HOUR_PX = 50, PH54_SNAP = 30; // 1시간=50px, 30분=25px

  // 'HH:MM' → 자정 기준 분. start_time 없으면 hour 사용.
  function ph54MinOf(s){
    var m = String(s.start_time||'').match(/(\d{1,2}):(\d{2})/);
    if (m) return (+m[1])*60 + (+m[2]);
    return (s.hour!=null ? s.hour : PH54_START_H) * 60;
  }
  // 분 → 'HH:MM'
  function ph54FmtMin(mins){ return ph54Pad(Math.floor(mins/60))+':'+ph54Pad(mins%60); }

  /* ═══ 🗂 겹침 없는 배치 (2026-09-02 사장님 선택 — 샘플 B-1 «요일 접기 + 강사별 열» + B-3 «빈 시간») ═══
     [왜] «전체 강사» 보기에서 카드가 전부 left:3px;right:3px 로 요일 칸 «전체 폭» 에 절대배치돼,
          20:00 에 강사 6명의 수업이 정확히 같은 자리에 쌓이고 맨 위 한 장만 보였다(사장님 화면 캡처).
     [어떻게] 전체 보기 = 펼친 요일 하나만 «그날 수업이 있는 강사» 수만큼 세로 열로 쪼개고(강사 한 사람의
          수업은 자기 열에만 놓이므로 구조적으로 못 겹친다), 나머지 요일은 40px 띠로 접되 시간대별 수업
          밀도를 그라데이션 한 장으로 남긴다. 띠·머리글을 누르면 그 요일이 펼쳐진다.
          강사 필터 = 예전처럼 7열 주간(한 강사라 겹칠 것이 없다).
     [열 안에서] 같은 강사에게 같은 시각 수업이 둘이면(이중배정·카페24 conflict) — 그것만 «군집» 단위로
          폭을 나눠 둘 다 보이게 하고 빨간 테두리(.ph54-dup)를 친다. 겹치지 않는 카드는 폭을 다 쓴다.
          수업 사이 30분 이상 빈 자리는 점선 칸(.ph54-gap)으로 그린다 — 대체 배정 자리가 바로 보이게.
     [속도] 한 번 그리고 끝 — 스크롤·호버에 JS 없음. 군집 계산은 «같은 열 안» 에서만 하므로 O(n) 에 가깝다.
     샘플·비교: docs/강사캘린더_강사별열_B안_세갈래_2026-09-02.html · 감시: test-harness/teacher_calendar_lanes_harness.mjs */
  var PH54_GAP_MIN = 30;   // 이보다 짧은 빈틈은 «빈 자리» 로 안 그린다(20분 수업 사이 10분은 쉬는 시간)

  /* 한 열(=한 강사·하루)의 카드 배치. items: [{st, du, ...}] (분 단위)
     → 같은 배열 요소에 lane/lanes/dup 를 써 넣고, 빈 자리 목록을 함께 돌려준다. */
  function ph54LayoutItems(items){
    var list = items.slice().sort(function(a,b){ return a.st - b.st || b.du - a.du; });
    var cluster = [], maxEnd = -1;
    var flush = function(){
      var laneEnd = [];
      cluster.forEach(function(it){
        var l = 0; while (l < laneEnd.length && laneEnd[l] > it.st) l++;
        laneEnd[l] = it.st + it.du; it.lane = l;
      });
      cluster.forEach(function(it){ it.lanes = laneEnd.length; });
      cluster = []; maxEnd = -1;
    };
    list.forEach(function(it){
      it.dup = false;
      if (cluster.length && it.st >= maxEnd) flush();
      cluster.push(it); maxEnd = Math.max(maxEnd, it.st + it.du);
    });
    if (cluster.length) flush();
    // 겹침 표시 — 실제로 시간이 겹치는 짝만(군집이 같아도 안 겹칠 수 있다)
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++){
      if (list[i].st < list[j].st + list[j].du && list[j].st < list[i].st + list[i].du){ list[i].dup = true; list[j].dup = true; }
    }
    // 빈 자리 — 연속 점유 사이 PH54_GAP_MIN 분 이상(차단 카드도 «점유» 로 본다)
    var gaps = [], end = -1;
    list.forEach(function(it){
      if (end >= 0 && it.st - end >= PH54_GAP_MIN) gaps.push({ st: end, du: it.st - end });
      end = Math.max(end, it.st + it.du);
    });
    return { items: list, gaps: gaps };
  }
  // 군집 안 자리 → 인라인 style 조각 (혼자면 빈 문자열 = CSS 기본 left:3px;right:3px)
  function ph54LaneStyle(it){
    if (!it || !(it.lanes > 1)) return '';
    var w = 100 / it.lanes, l = it.lane * w;
    return 'left:calc(' + l.toFixed(3) + '% + 2px);width:calc(' + w.toFixed(3) + '% - 4px);right:auto;';
  }
  // 빈 자리 점선 칸 HTML
  function ph54GapHtml(g){
    var top = (g.st - PH54_START_H*60) / 60 * PH54_HOUR_PX, h = g.du / 60 * PH54_HOUR_PX;
    return '<div class="ph54-gap" style="top:' + (top + 2) + 'px;height:' + Math.max(h - 4, 10) + 'px">'
      + ph54T('빈 ' + g.du + '분', g.du + 'm free') + '</div>';
  }
  /* 접힌 요일의 밀도 — 20분 칸마다 «그 시간에 걸친 카드 수» 를 보라 농도로. div 수십 개가 아니라
     그라데이션 «한 장» 이다(요소 수를 늘리지 않는다). 모든 칸에 stop 을 두어야 사이가 번지지 않는다. */
  function ph54FoldGradient(items){
    var stops = [], slot = 20, px = slot / 60 * PH54_HOUR_PX;
    for (var m = PH54_START_H*60; m < PH54_END_H*60; m += slot){
      var n = 0;
      for (var i = 0; i < items.length; i++){ if (items[i].st < m + slot && items[i].st + items[i].du > m) n++; }
      var y0 = (m - PH54_START_H*60) / 60 * PH54_HOUR_PX, y1 = y0 + px;
      var a = n ? Math.min(0.14 + n * 0.12, 0.9) : 0;
      stops.push('rgba(124,58,237,' + a.toFixed(2) + ') ' + y0 + 'px ' + (y1 - 1) + 'px, transparent ' + (y1 - 1) + 'px ' + y1 + 'px');
    }
    return 'background-image:linear-gradient(to bottom,' + stops.join(',') + ');';
  }
  // 강사 번호 → 이름 (원부에 없으면 기록에 적힌 이름, 그것도 없으면 번호)
  function ph54TeacherName(tid, fallback){
    var k = String(tid == null ? '' : tid);
    for (var i = 0; i < ph54State.teachers.length; i++){ if (String(ph54State.teachers[i].id) === k) return ph54State.teachers[i].name || fallback || k; }
    return fallback || (k ? ('#' + k) : '');
  }

  // 우하단 토스트(드래그 이동 결과 안내)
  function ph54Toast(msg){
    var t = document.getElementById('ph54-toast');
    if (!t){ t = document.createElement('div'); t.id = 'ph54-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(ph54Toast._t); ph54Toast._t = setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }

  // 수업 슬롯 1개 → 캘린더 이벤트 카드 HTML (시작시간/지속에 따른 절대위치 top/height)
  //   item 예시: { teacher_id:5, date:'2026-06-24', start_time:'15:00', duration_min:60,
  //               type:'1on1', students:[{name:'홍길동'}] }
  function ph54EventCard(idx, s, lay){
    var c        = PH54_TYPE_COLOR[s.type] || '#7c3aed';
    var startMin = ph54MinOf(s);
    var dur      = s.duration_min || 20;   // 기본 수업 20분(영어·중국어 공통, 2026-07-23)
    var top      = Math.max(0, (startMin - PH54_START_H*60) / 60 * PH54_HOUR_PX);   // 절대 y
    var height   = Math.max(dur / 60 * PH54_HOUR_PX, 22);                            // 지속시간 높이
    var timeTxt  = ph54FmtMin(startMin) + ' · ' + dur + '분';
    // 학생 이름: students[].name 우선, 없으면 유형 라벨로 폴백
    var student  = (s.students || []).map(function(x){ return x && x.name; }).filter(Boolean).join(', ');
    /* 🚫 (2026-08-08) 휴식시간(teacher_unavailability)은 수업이 아니다.
       · 드래그 금지 — id 체계가 class_schedules 와 겹쳐서, 끌면 **엉뚱한 수업**에 PATCH 가 나간다.
       · 사유를 카드에 보여 준다. 「왜 막혔는지」를 모르면 매니저가 그냥 지워 버린다. */
    var isBlock  = (s.source === 'unavailability') || s.type === 'blocked';
    /* 🏷 LMS 점유·시연 시드는 «수업» 이 아니다. 이름 자리에 정체를 그대로 적는다 —
       예전엔 학생이 없어서 유형 라벨('1:1')로 폴백했고, 그게 수업처럼 읽혔다. */
    var org      = isBlock ? null : ph54OriginOf(s);
    var nameTxt  = isBlock ? (s.reason || ph54T('휴식/근무불가', 'Break / unavailable'))
                 : org    ? ph54T(org.ko, org.en)
                           : (student || (PH54_TYPE_LABEL[s.type] || ph54T('수업', 'Class')));
    // ⑭ 「매주 반복인가 하루짜리인가」 를 카드에서 바로 읽히게 — 질문의 절반은 이걸 몰라서 나왔다.
    var typeTxt  = isBlock ? (s.recurring ? ph54T('매주 반복 차단', 'Every week') : ph54T('이 날짜만 차단', 'This date only'))
                           : (PH54_TYPE_LABEL[s.type] || '');
    var canDrag  = (s.source !== 'unavailability');
    return '<div class="ph54-ev ph54-t-'+(s.type||'')+(canDrag?'':' ph54-locked')+(org?' ph54-nonclass':'')+(lay && lay.dup ? ' ph54-dup' : '')+'"'
      + (canDrag ? ' draggable="true"' : '')
      + ' data-idx="'+idx+'"'
      + (s.block_id != null ? ' data-block="'+s.block_id+'"' : '')
      /* 차단 카드는 «누를 수 있는 것» 이다(누르면 지운다) → 손가락 커서. 예전 default 커서는
         «아무 일도 안 일어나는 칸» 처럼 보여서 지우는 길이 있다는 걸 아무도 몰랐다. */
      + ' style="top:'+top+'px;height:'+height+'px;'+ph54LaneStyle(lay)+'background:'+c+(canDrag?'':';cursor:pointer;opacity:.92')+'" '
      + 'title="'+ph54Esc((lay && lay.dup ? ph54T('⚠ 같은 시각에 수업이 둘 · ', '⚠ Two classes at the same time · ') : '')+timeTxt+' · '+typeTxt+(isBlock?(s.reason?(' · '+s.reason):''):(org?(' · '+ph54T(org.ko,org.en)):(student?(' · '+student):''))))
      + (canDrag ? '' : ph54T(' (드래그 불가 — 누르면 이 차단을 지웁니다)',
                              ' (cannot drag — click to delete this block)'))+'">'
      +   '<div class="ph54-ev-time">'+ph54Esc(timeTxt)
      +     (org ? '<span class="ph54-ev-tag">'+ph54Esc(org.badge)+'</span>' : '')+'</div>'
      +   '<div class="ph54-ev-name">'+ph54Esc(nameTxt)+'</div>'   /* ← 학생 이름 (말줄임 처리) */
      +   '<div class="ph54-ev-type">'+ph54Esc(typeTxt)+'</div>'
      + '</div>';
  }

  /* 🪞 카페24 수업 카드 — **보기 전용**.
     · 드래그 불가: draggable 을 안 달았으므로 dragstart 자체가 안 난다.
     · 클릭해도 아무 일 없음: 차단 삭제는 data-block 이 있을 때만 돈다.
     · data-idx 를 «안 단다» — records 의 인덱스와 섞이면 엉뚱한 수업에 PATCH 가 나간다.
     ⚠️ 글자를 «수업» 이라고만 쓰면 매니저가 진짜 잡힌 수업으로 읽는다. 배지와 아랫줄에
        «카페24에만 있음» 을 적어 화면이 사실을 말하게 한다(CLAUDE.md — 지어내지 말 것). */
  function ph54C24Card(s){
    var startMin = ph54MinOf(s);
    var dur      = s.duration_min || 20;
    var top      = Math.max(0, (startMin - PH54_START_H*60) / 60 * PH54_HOUR_PX);
    var height   = Math.max(dur / 60 * PH54_HOUR_PX, 22);
    var timeTxt  = ph54FmtMin(startMin) + ' · ' + dur + ph54T('분', 'm');
    var who      = s.student_name || s.student_uid || ph54T('학생 미확인', 'unknown student');
    // 🔴 지난 날짜는 미러 대상이 아니다 — «만들어집니다» 라고 말하면 거짓이 된다
    var isPast   = String(s.date || '') < ph54TodayKst();
    var why      = isPast ? null : PH54_C24_WHY[s.verdict];
    var tip = timeTxt + ' · ' + ph54T('카페24 수업', 'Cafe24 class') + ' · ' + who + '\n'
      + (isPast
          ? ph54T('카페24에 남아 있는 «지난» 수업 기록입니다. 미러는 오늘부터만 만들므로 이 수업은 망고아이에 생기지 않습니다 (보기 전용).',
                  'A past class recorded in Cafe24. The mirror only creates from today onward, so this one will not appear in Mangoi (view only).')
          : ph54T('카페24에 잡혀 있는 수업입니다. 망고아이 시간표에는 아직 만들어지지 않았습니다 (보기 전용 — 옮기거나 지울 수 없습니다).',
                  'This class is scheduled in Cafe24. It has not been created in the Mangoi timetable yet (view only — cannot be moved or deleted).'))
      + (why ? ('\n' + ph54T(why.ko, why.en)) : '');
    /* 인라인 색은 background-color 로 쓴다 — `background:linear-gradient(135deg` 를 노리는
       admin-inline-c.css 의 옛 규칙과 adm-s13 페인터에 안 걸리는 형태다(CLAUDE.md 2장). */
    /* 자리(lane)는 렌더가 s.__lay 에 적어 준다 — 인자를 늘리지 않는 이유: c24_mirror_harness I절이
       `function ph54C24Card(s){` 모양을 오려 내 «끌 수 없고 records 인덱스가 없는가» 를 검사한다
       (그 두 낱말을 이 주석에 적으면 부정 검사가 자기 주석을 잡는다 — CLAUDE.md 2장). */
    var lay      = s.__lay || null;
    return '<div class="ph54-ev ph54-c24 ph54-locked'+(lay && lay.dup ? ' ph54-dup' : '')+'"'
      + ' style="top:'+top+'px;height:'+height+'px;'+ph54LaneStyle(lay)+'cursor:default;box-shadow:none;'
      +   'background-color:#dbeafe;background-image:repeating-linear-gradient(45deg,transparent,transparent 6px,rgba(15,23,42,.07) 6px,rgba(15,23,42,.07) 12px);'
      +   'border:1.5px dashed #2563eb"'
      + ' title="'+ph54Esc(tip)+'">'
      +   '<div class="ph54-ev-time">'+ph54Esc(timeTxt)
      +     '<span class="ph54-ev-tag" style="background:#1d4ed8">'+ph54T('카페24','C24')+'</span></div>'
      +   '<div class="ph54-ev-name">'+ph54Esc(who)+'</div>'
      +   '<div class="ph54-ev-type">'+ph54Esc(
              isPast                    ? ph54T('지난 수업 (카페24 기록)','Past class (Cafe24 record)')
            : s.verdict === 'conflict'  ? ph54T('⚠️ 같은 시각 다른 수업','⚠️ Clashes with another class')
                                        : ph54T('카페24에만 있음','Cafe24 only'))+'</div>'
      + '</div>';
  }

  function ph54Render(){
    var wrap = document.getElementById('ph54-sched-wrap');
    if (!wrap) return;
    var days = ph54GetWeekDays();
    var todayStr = ph54FmtDate(new Date());
    var dayLabel = ['월','화','수','목','금','토','일'];
    var dowKeyByIdx = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    var filterId = ph54State.teacherFilter;
    var bodyH = (PH54_END_H - PH54_START_H) * PH54_HOUR_PX;
    var weekLabel = ph54FmtDate(days[0]) + ' ~ ' + ph54FmtDate(days[6]);

    // 날짜 → 요일 컬럼 인덱스
    var dateToCol = {};
    days.forEach(function(d,i){ dateToCol[ph54FmtDate(d)] = i; });

    // 표시할 이벤트(현재 필터 강사 + 이번 주). 원본 배열 인덱스를 카드에 심어 드래그 후 갱신.
    var events = [];
    ph54State.records.forEach(function(r, idx){
      if (filterId && String(r.teacher_id) !== String(filterId)) return;
      if (!(r.date in dateToCol)) return;
      events.push({ idx: idx, rec: r, col: dateToCol[r.date] });
    });

    /* 🪞 카페24 수업(보기 전용) — 강사가 이어진 것만 그린다.
       강사를 못 이은 것(no_teacher)은 «누구 칸에» 놓아야 할지 모르므로 그리지 않고 아래에서 건수만 알린다.
       ⛔ 모르는 것을 아무 칸에나 놓지 않는다 — 모르는 것보다 틀린 것이 나쁘다. */
    var c24Events = [], c24NoTeacher = 0, c24Left = 0, c24Hidden = 0, c24Past = 0, c24Ahead = 0, c24Clash = 0;
    var c24Today = ph54TodayKst();
    (ph54State.c24 || []).forEach(function(r){
      if (!r || !(r.date in dateToCol)) return;
      /* 🚪 퇴사 강사의 잔재 — 할 일이 «없다». 회색으로 건수만 알린다.
         ⛔ 이것을 아래 «원부에 없는 강사» 와 한 숫자로 합치지 말 것. 둘은 해야 할 일이 정반대다
            (하나는 그냥 두면 되고, 하나는 사람이 원부에 등록해야 한다). 합치면 늘 켜져 있는
            경고가 되어 정작 손봐야 할 것이 파묻힌다 — 녹화 목록에서 실제로 그랬다. */
      if (r.verdict === 'no_teacher_left'){ c24Left++; return; }
      /* 🙈 명부에서 숨긴 계정(시험용 등) — «일부러» 뺀 것이라 경고색을 쓰지 않는다.
         ⛔ 「원부에 없는 강사」와 한 숫자로 합치지 말 것: 저쪽은 사람이 등록해야 하고
            이쪽은 할 일이 없다. 합치면 늘 켜져 있는 경고가 되어 진짜가 파묻힌다. */
      if (r.verdict === 'student_hidden'){ c24Hidden++; return; }
      if (!r.teacher_id){ c24NoTeacher++; return; }
      if (!PH54_C24_SHOW[r.verdict]) return;
      if (filterId && String(r.teacher_id) !== String(filterId)) return;
      c24Events.push({ rec: r, col: dateToCol[r.date] });
      /* 🔴 «지난 것» 과 «앞으로 것» 을 한 숫자로 합치면 안 된다 — 지난 주를 열었을 때
         「카페24 58개」가 «망고아이에 58건이 빠졌다» 로 읽힌다(2026-09-01 실제 화면). */
      if (String(r.date) < c24Today) c24Past++;
      else if (r.verdict === 'conflict') c24Clash++;
      else c24Ahead++;
    });

    // ── 컨트롤 바
    var html = ''
      + '<div id="ph54-sched-controls">'
      +   '<button id="ph54-prev-week">◀ 이전 주</button>'
      +   '<button id="ph54-this-week" class="primary">📅 이번 주</button>'
      +   '<button id="ph54-next-week">다음 주 ▶</button>'
      +   '<span class="ph54-week-label" id="ph54-week-label">'+weekLabel+'</span>'
      +   '<span style="flex:1"></span>'
      +   '<label>강사 필터: '
      +     '<select id="ph54-teacher-filter" style="min-width:140px;margin-left:4px">'
      +       '<option value="">전체 강사 ('+ph54State.teachers.length+'명)</option>'
      +       ph54State.teachers.map(function(t){
                return '<option value="'+t.id+'"'+(String(filterId)===String(t.id)?' selected':'')+'>'+ph54Esc(t.name)+'</option>';
              }).join('')
      +     '</select>'
      +   '</label>'
      +   '<label style="margin-left:8px;white-space:nowrap" title="'
      +     ph54Esc(ph54T('카페24에 잡혀 있는 수업을 이 표에 겹쳐 보여줍니다 (보기 전용).',
                          'Overlays classes scheduled in Cafe24 (view only).'))+'">'
      +     '<input type="checkbox" id="ph54-c24-toggle"'+(ph54State.c24On?' checked':'')
      +       ' style="vertical-align:middle;margin-right:4px">'
      +     ph54T('카페24 수업 함께 보기','Show Cafe24 classes')
      +   '</label>'
      +   '<button id="ph54-clear-filter">전체 보기</button>'
      + '</div>';

    if (!filterId) {
      html += '<div class="ph54-hint">'+ph54T(
        '💡 요일 머리글이나 접힌 띠를 누르면 그 요일이 <b>강사별 열</b>로 펼쳐져요. 강사 이름을 누르면 그 강사만 주간으로 봅니다. (강사 목록의 📅 버튼으로도 열립니다)',
        '💡 Click a day header or a folded strip to open that day as <b>one column per instructor</b>. Click an instructor name to see only that instructor for the whole week. (The 📅 button in the instructor list opens it too.)')+'</div>';
    } else {
      /* 🚫 (2026-08-08 마이마이 요청) 「강사가 언더타임이면 매니저가 그 시간을 막을 수 있게」
         강사를 고른 뒤에만 안내한다 — 전체 보기에서는 «누구를 막을지» 를 알 수 없다. */
      html += '<div class="ph54-hint">🚫 빈 칸을 <b>클릭</b>하면 그 시간을 <b>차단</b>할 수 있어요 (언더타임·회의 등). 차단된 시간엔 수업을 넣을 수 없습니다.</div>';
    }

    /* ⚠️ 못 읽었으면 «없다» 가 아니라 «못 읽었다» 고 말한다 — 빈 화면이 «오늘은 수업이 없나 보다» 로 읽힌다. */
    if (ph54State.c24On && ph54State.c24Msg){
      html += '<div class="ph54-hint">⚠️ '+ph54Esc(ph54State.c24Msg)+'</div>';
    }

    // ── 타임라인: 헤더(요일) + 시간 거터 + 컬럼 (🗂 전체 보기 = 요일 접기 + 강사별 열, 강사 필터 = 7열 주간)
    var accordion = !filterId;

    // 요일 → 강사 → 카드 묶음. 강사 순서는 원부(ph54State.teachers) 순, 원부에 없는 번호는 뒤.
    var rosterIdx = {};
    ph54State.teachers.forEach(function(t, i){ rosterIdx[String(t.id)] = i; });
    var byDay = [];
    for (var ci = 0; ci < 7; ci++){
      var map = {}, order = [];
      var bucket = function(tid, name){
        var k = String(tid == null ? '' : tid);
        if (!map[k]){ map[k] = { tid: k, name: name || '', items: [], n: 0, mins: 0, c24n: 0, dup: false }; order.push(k); }
        return map[k];
      };
      events.forEach(function(e){
        if (e.col !== ci) return;
        var r = e.rec, b = bucket(r.teacher_id, ph54TeacherName(r.teacher_id, r.teacher_name));
        var isBlk = (r.source === 'unavailability') || r.type === 'blocked';
        b.items.push({ kind: 'rec', idx: e.idx, rec: r, st: ph54MinOf(r), du: r.duration_min || 20 });
        if (!isBlk){ b.n++; b.mins += (r.duration_min || 20); }
      });
      c24Events.forEach(function(e){
        if (e.col !== ci) return;
        var r = e.rec, b = bucket(r.teacher_id, ph54TeacherName(r.teacher_id, r.teacher_name));
        b.items.push({ kind: 'c24', rec: r, st: ph54MinOf(r), du: r.duration_min || 20 });
        b.c24n++;
      });
      order.sort(function(a, b){
        var ia = (a in rosterIdx) ? rosterIdx[a] : 9999, ib = (b in rosterIdx) ? rosterIdx[b] : 9999;
        return ia - ib || (a < b ? -1 : a > b ? 1 : 0);
      });
      var tlist = order.map(function(k){
        var t = map[k]; t.lay = ph54LayoutItems(t.items);
        t.dup = t.lay.items.some(function(it){ return it.dup; });
        return t;
      });
      byDay.push({ teachers: tlist,
                   n: tlist.reduce(function(a, t){ return a + t.n; }, 0),
                   total: tlist.reduce(function(a, t){ return a + t.items.length; }, 0) });
    }

    // 펼친 요일 — 오늘(이번 주), 아니면 수업이 있는 첫 요일, 그것도 없으면 월
    var openDay = -1;
    if (accordion){
      openDay = (ph54State.openDay == null) ? -1 : (parseInt(ph54State.openDay, 10) || 0);
      if (openDay < 0 || openDay > 6){
        openDay = -1;
        days.forEach(function(d, i){ if (ph54FmtDate(d) === todayStr) openDay = i; });
        if (openDay < 0){ for (var k = 0; k < 7; k++){ if (byDay[k].total){ openDay = k; break; } } }
        if (openDay < 0) openDay = 0;
        ph54State.openDay = openDay;
      }
    }

    // 열 폭 — 머리글과 본문이 «같은 문자열» 을 써야 칸이 맞는다
    var colDefs = ['56px'];
    for (var cd = 0; cd < 7; cd++){
      if (!accordion) colDefs.push('minmax(96px,1fr)');
      else if (cd !== openDay) colDefs.push('40px');
      else colDefs.push(byDay[cd].teachers.length ? ('repeat(' + byDay[cd].teachers.length + ',minmax(58px,1fr))') : 'minmax(160px,1fr)');
    }
    var gridCols = 'grid-template-columns:' + colDefs.join(' ');
    var dateTxt = function(i){ return ph54Pad(days[i].getMonth()+1) + '/' + ph54Pad(days[i].getDate()); };

    var headCells = '<div class="ph54-cal-corner"' + (accordion ? ' style="grid-row:1/3"' : '') + '></div>';
    days.forEach(function(d, i){
      var isToday = ph54FmtDate(d) === todayStr;
      if (!accordion){
        headCells += '<div class="ph54-cal-dayhead' + (isToday ? ' today' : '') + '">' + dayLabel[i]
          + '<br><span class="ph54-cal-date">' + dateTxt(i) + '</span></div>';
        return;
      }
      var bd = byDay[i];
      if (i === openDay){
        headCells += '<div class="ph54-cal-dayhead ph54-open' + (isToday ? ' today' : '') + '" style="grid-column:span ' + Math.max(1, bd.teachers.length) + '">'
          + dayLabel[i] + ' <span class="ph54-cal-date">' + dateTxt(i) + '</span>'
          + ' <span class="ph54-cal-cnt">· ' + ph54T('수업 ', 'classes ') + bd.n + ph54T('개', '') + ' · ' + ph54T('강사 ', 'instructors ') + bd.teachers.length + ph54T('명', '') + '</span></div>';
      } else {
        headCells += '<div class="ph54-cal-dayhead ph54-cal-fold-head' + (isToday ? ' today' : '') + '" data-day="' + i + '" role="button" tabindex="0" title="'
          + ph54Esc(dayLabel[i] + ' ' + dateTxt(i) + ' · ' + ph54T('수업 ' + bd.n + '개 — 누르면 펼칩니다', bd.n + ' classes — click to open')) + '">'
          + dayLabel[i] + '<br><span class="ph54-cal-date">' + dateTxt(i) + '</span></div>';
      }
    });
    if (accordion){
      // 2행: 펼친 요일은 강사 머리글(이름 · N회·M분 · 부하 막대 — 샘플 B-3), 접힌 요일은 건수
      var maxMins = Math.max.apply(null, byDay[openDay].teachers.map(function(t){ return t.mins; }).concat([1]));
      days.forEach(function(d, i){
        var bd = byDay[i];
        if (i !== openDay){
          headCells += '<div class="ph54-cal-subhead ph54-cal-fold-head" data-day="' + i + '" role="button" tabindex="0">' + (bd.n || '—') + '</div>';
          return;
        }
        if (!bd.teachers.length){ headCells += '<div class="ph54-cal-subhead ph54-daysep">' + ph54T('수업 없음', 'No classes') + '</div>'; return; }
        bd.teachers.forEach(function(t, j){
          var its = t.lay.items, first = its.length ? its[0].st : 0, last = 0;
          its.forEach(function(it){ last = Math.max(last, it.st + it.du); });
          var tipTxt = (t.name || ph54T('강사 미정', 'No instructor')) + ' · ' + t.n + ph54T('회 ', ' classes ') + t.mins + ph54T('분', 'm')
            + (its.length ? ' · ' + ph54FmtMin(first) + '~' + ph54FmtMin(last) : '')
            + (t.c24n ? ' · ' + ph54T('카페24 ', 'Cafe24 ') + t.c24n : '')
            + (t.dup ? ph54T(' · ⚠ 같은 시각에 수업이 둘', ' · ⚠ two classes at the same time') : '')
            + (t.tid && (t.tid in rosterIdx) ? ph54T(' — 누르면 이 강사만 봅니다', ' — click to show only this instructor') : '');
          headCells += '<div class="ph54-cal-subhead' + (j === 0 ? ' ph54-daysep' : '') + (t.dup ? ' ph54-dup-head' : '') + '"'
            + (t.tid && (t.tid in rosterIdx) ? ' data-teacher="' + ph54Esc(t.tid) + '" role="button" tabindex="0"' : '')
            + ' title="' + ph54Esc(tipTxt) + '">'
            + '<b>' + ph54Esc(t.name || ph54T('강사 미정', 'No instructor')) + (t.dup ? ' ⚠' : '') + '</b>'
            + '<small>' + t.n + ph54T('회', 'x') + ' · ' + t.mins + ph54T('분', 'm') + (t.c24n ? ' · C24 ' + t.c24n : '') + '</small>'
            + '<span class="ph54-load"><span style="width:' + Math.round(t.mins / maxMins * 100) + '%"></span></span>'
            + '</div>';
        });
      });
    }

    var gutter = '<div class="ph54-cal-gutter" style="height:'+bodyH+'px">';
    for (var h=PH54_START_H; h<PH54_END_H; h++){
      gutter += '<div class="ph54-cal-hourlabel" style="height:'+PH54_HOUR_PX+'px">'+ph54Pad(h)+':00</div>';
    }
    gutter += '</div>';

    // 한 열의 카드 + 빈 자리 HTML (자리는 ph54LayoutItems 가 정했다)
    var colCards = function(lay){
      var out = lay.gaps.map(ph54GapHtml).join('');
      lay.items.forEach(function(it){
        if (it.kind === 'rec') out += ph54EventCard(it.idx, it.rec, it);
        else { it.rec.__lay = it; out += ph54C24Card(it.rec); it.rec.__lay = null; }
      });
      return out;
    };
    var colStyle = 'style="height:'+bodyH+'px;background-size:100% '+PH54_HOUR_PX+'px"';
    var cols = '';
    for (var ci2 = 0; ci2 < 7; ci2++){
      var isToday2 = ph54FmtDate(days[ci2]) === todayStr, bd2 = byDay[ci2], tcls = isToday2 ? ' today' : '';
      if (accordion && ci2 !== openDay){
        var allItems = [];
        bd2.teachers.forEach(function(t){ allItems = allItems.concat(t.items); });
        cols += '<div class="ph54-cal-fold' + tcls + '" data-day="' + ci2 + '" role="button" tabindex="0" style="height:' + bodyH + 'px;' + ph54FoldGradient(allItems) + '" title="'
          + ph54Esc(dayLabel[ci2] + ' ' + dateTxt(ci2) + ' · ' + ph54T('수업 ' + bd2.n + '개 — 누르면 펼칩니다 (카드를 끌어다 놓으면 이 요일로 옮깁니다)', bd2.n + ' classes — click to open (drop a card here to move it to this day)')) + '"></div>';
        continue;
      }
      if (!accordion){
        // 강사 필터: 요일 한 열(한 강사) — 열 안에서만 겹침을 나누고 빈 자리를 그린다
        var flat = [];
        bd2.teachers.forEach(function(t){ flat = flat.concat(t.items); });
        cols += '<div class="ph54-cal-col' + tcls + '" data-day="' + ci2 + '" ' + colStyle + '>' + colCards(ph54LayoutItems(flat)) + '</div>';
        continue;
      }
      if (!bd2.teachers.length){
        cols += '<div class="ph54-cal-col ph54-daysep' + tcls + '" data-day="' + ci2 + '" ' + colStyle + '></div>';
        continue;
      }
      bd2.teachers.forEach(function(t, j){
        cols += '<div class="ph54-cal-col' + (j === 0 ? ' ph54-daysep' : '') + tcls + '" data-day="' + ci2 + '" data-teacher="' + ph54Esc(t.tid) + '" ' + colStyle + '>'
          + colCards(t.lay) + '</div>';
      });
    }

    html += '<div id="ph54-cal"><div id="ph54-cal-body"><div id="ph54-cal-inner">'
      + '<div id="ph54-cal-head" style="' + gridCols + '">' + headCells + '</div>'
      + '<div id="ph54-cal-track" style="' + gridCols + '">' + gutter + cols + '</div>'
      + '</div></div></div>';

    /* ── 범례 + 카운트
       🔢 (2026-08-11) 예전엔 「총 24개 수업」 하나만 찍었다. 그런데 그 24개가 전부
          LMS 점유라 **진짜 수업은 0개**였다 — 숫자가 매니저를 정확히 반대로 속였다.
          → 「수업 N개」와 「점유·시드 N개」를 갈라서 찍는다. 색은 위 PH54_TYPE_COLOR 를
            그대로 쓴다(범례와 카드가 갈라지면 범례가 거짓말을 한다). */
    var evClass = events.filter(function(e){ return e.rec.type !== 'blocked'; });
    var nReal   = evClass.filter(function(e){ return !ph54OriginOf(e.rec); }).length;
    var nOther  = evClass.length - nReal;
    html += '<div class="ph54-legend">'
      +   '<span><i style="background:'+PH54_TYPE_COLOR['1on1']+'"></i>'+ph54T('1:1 수업','1:1')+'</span>'
      +   '<span><i style="background:'+PH54_TYPE_COLOR['group']+'"></i>'+ph54T('그룹 수업','Group')+'</span>'
      +   '<span><i style="background:'+PH54_TYPE_COLOR['temp']+'"></i>'+ph54T('대체','Substitute')+'</span>'
      +   '<span><i style="background:'+PH54_TYPE_COLOR['leveltest']+'"></i>'+ph54T('레벨테스트','Level test')+'</span>'
      +   '<span><i style="background:'+PH54_TYPE_COLOR['blocked']+'"></i>'+ph54T('휴무','Off')+'</span>'
      +   '<span><i class="ph54-legend-nonclass"></i>'+ph54T('LMS 점유·시드 (수업 아님)','LMS busy / seed (not a class)')+'</span>'
      +   '<span><i class="ph54-legend-gap"></i>'+ph54T('수업 사이 빈 30분 이상','30+ min free between classes')+'</span>'
      +   '<span><i class="ph54-legend-dup"></i>'+ph54T('같은 강사 · 같은 시각 겹침','Same instructor, same time')+'</span>'
      +   (ph54State.c24On
            ? '<span><i style="background-color:#dbeafe;background-image:repeating-linear-gradient(45deg,transparent,transparent 3px,rgba(15,23,42,.2) 3px,rgba(15,23,42,.2) 6px);border:1px dashed #2563eb;box-sizing:border-box"></i>'
              + ph54T('카페24 수업 (지난 것은 기록, 앞으로 것만 대기)','Cafe24 class (past = record, upcoming = pending)')+'</span>'
            : '')
      +   '<span class="ph54-legend-count">'
      +     ph54T('수업 ','Classes ')+nReal+ph54T('개','')
      +     (nOther ? '<b class="ph54-count-warn"> · '+ph54T('LMS 점유·시드 ','LMS busy / seed ')+nOther+ph54T('개','')+'</b>' : '')
      +     (ph54State.c24On && c24Ahead
              ? ' · '+ph54T('카페24 대기 ','Cafe24 pending ')+c24Ahead+ph54T('개','') : '')
      +     (ph54State.c24On && c24Clash
              ? '<b class="ph54-count-warn"> · '+ph54T('겹침 확인필요 ','Clashes to check ')+c24Clash+ph54T('개','')+'</b>' : '')
      +     (ph54State.c24On && c24Past
              ? ' · '+ph54T('지난 카페24 기록 ','Past Cafe24 records ')+c24Past+ph54T('개','') : '')
      +     (ph54State.c24On && c24Left
              ? ' · '+ph54T('퇴사 강사 잔재 ','Departed instructors ')+c24Left+ph54T('개 (안 그림)',' (not drawn)') : '')
      +     (ph54State.c24On && c24Hidden
              ? ' · '+ph54T('숨긴 계정 ','Hidden accounts ')+c24Hidden+ph54T('개 (안 그림)',' (not drawn)') : '')
      +     (ph54State.c24On && c24NoTeacher
              ? '<b class="ph54-count-warn"> · '+ph54T('⚠️ 원부에 없는 강사 ','⚠️ Not in the roster ')+c24NoTeacher+ph54T('개','')+'</b>' : '')
      +     ph54T(' · 카드를 드래그해 이동',' · drag a card to move it')
      +   '</span>'
      + '</div>';

    // 다시 그려도 보던 자리를 잃지 않게 — 처음이면 펼친 요일의 첫 수업 한 시간 위로
    var prevBody = document.getElementById('ph54-cal-body');
    var keepTop = prevBody ? prevBody.scrollTop : -1;
    wrap.innerHTML = html;
    var calBody = document.getElementById('ph54-cal-body');
    if (calBody){
      if (keepTop >= 0) calBody.scrollTop = keepTop;
      else {
        var firstSt = -1, src = accordion ? byDay[openDay].teachers : byDay.reduce(function(a, b){ return a.concat(b.teachers); }, []);
        src.forEach(function(t){ t.items.forEach(function(it){ if (firstSt < 0 || it.st < firstSt) firstSt = it.st; }); });
        if (firstSt >= 0) calBody.scrollTop = Math.max(0, (firstSt - 60 - PH54_START_H*60) / 60 * PH54_HOUR_PX);
      }
    }
    // 🗂 접힌 요일(띠·머리글) → 펼치기 / 강사 머리글 → 그 강사만 보기
    Array.prototype.forEach.call(wrap.querySelectorAll('.ph54-cal-fold, .ph54-cal-fold-head'), function(el){
      var go = function(){ ph54State.openDay = parseInt(el.getAttribute('data-day'), 10); ph54Render(); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
    });
    Array.prototype.forEach.call(wrap.querySelectorAll('.ph54-cal-subhead[data-teacher]'), function(el){
      var go = function(){ ph54State.teacherFilter = el.getAttribute('data-teacher'); ph54Render(); };
      el.addEventListener('click', go);
      el.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(); } });
    });

    // ── 컨트롤 바인딩
    document.getElementById('ph54-prev-week').addEventListener('click', async function(){ ph54State.weekOffset--; ph54State.openDay = null; await ph54LoadRecords(); ph54Render(); });
    document.getElementById('ph54-this-week').addEventListener('click', async function(){ ph54State.weekOffset = 0; ph54State.openDay = null; await ph54LoadRecords(); ph54Render(); });
    document.getElementById('ph54-next-week').addEventListener('click', async function(){ ph54State.weekOffset++; ph54State.openDay = null; await ph54LoadRecords(); ph54Render(); });
    document.getElementById('ph54-teacher-filter').addEventListener('change', function(e){ ph54State.teacherFilter = e.target.value; ph54Render(); });
    document.getElementById('ph54-clear-filter').addEventListener('click', function(){ ph54State.teacherFilter = ''; ph54Render(); });
    var ph54C24Tg = document.getElementById('ph54-c24-toggle');
    if (ph54C24Tg) ph54C24Tg.addEventListener('change', async function(e){
      ph54State.c24On = !!e.target.checked;
      try { localStorage.setItem('ph54_c24_overlay', ph54State.c24On ? '1' : '0'); } catch(err){}
      await ph54LoadC24();
      ph54Render();
    });

    /* ── 🚫 빈 칸 클릭 → 그 시간 차단 (teacher_unavailability) ──────────────────
       마이마이 요청: 「강사가 언더타임이라 수업을 못 하면 매니저가 그 시간을 막게 해 달라」
       막는 기능은 원래 있었지만 «강사 이름을 타자로 치는 별도 폼» 뿐이었다 — 캘린더를 보다가
       거기까지 가서 이름·요일·시간을 다시 입력해야 했고, 캘린더에는 결과가 안 보였다.
       여기서는 **보고 있는 그 칸**을 그대로 막는다. 강사·요일·시간이 클릭으로 이미 정해진다.
       ⚠️ 되돌릴 수 있는 일이지만 남의 스케줄을 바꾸는 일이라 confirm 을 반드시 거친다. */
    var calTrack0 = document.getElementById('ph54-cal-track');
    /* 🗑 (2026-08-07 마이마이 ⑭ 「추가한 휴식시간을 어떻게 지우나? 월요일에 영원히 남나?」)
       그 질문이 나온 이유는 **지우는 길이 캘린더에 없었기 때문**이다(별도 목록까지 가야 했다).
       차단 카드를 누르면 «무엇인지 + 어떻게 지우는지» 를 그 자리에서 알려 주고 지운다.
       ⚠️ 수업 카드는 여기서 건드리지 않는다 — 지우는 것은 되돌릴 수 없고, 수업 삭제는 다른 일이다. */
    if (calTrack0 && !calTrack0._blkDelBound){
      calTrack0._blkDelBound = true;
      calTrack0.addEventListener('click', function(ev){
        var card = ev.target.closest && ev.target.closest('.ph54-ev');
        if (!card) return;
        var bid = card.getAttribute('data-block');
        if (!bid) return;                       // 수업 카드 — 여기서는 아무것도 하지 않는다
        var idx = parseInt(card.dataset.idx, 10);
        var rec = ph54State.records[idx] || {};
        var isWeekly = !!rec.recurring;
        var whenTxt = isWeekly
          ? ph54T('매주 반복되는 차단입니다', 'This block repeats every week')
          : ph54T('이 날짜에만 있는 차단입니다', 'This block is for this date only');
        var ok = window.confirm(
          '🚫 ' + (rec.reason || ph54T('휴식/근무불가', 'Break / unavailable')) + '\n'
          + (rec.date || '') + ' ' + (rec.start_time || '') + '\n\n'
          + whenTxt + '.\n'
          + ph54T('· 확인 → 이 차단을 지웁니다(수업은 그대로).',
                  '· OK  → delete this block (classes are not touched).') + '\n'
          + ph54T('· 취소 → 그대로 둡니다.', '· Cancel → keep it.'));
        if (!ok) return;
        ph54Toast(ph54T('🗑 차단 삭제 중…', '🗑 Deleting the block…'));
        fetch('/api/admin/teacher-unavailability/' + encodeURIComponent(bid), { method:'DELETE', credentials:'include' })
          .then(function(r){ return r.json().catch(function(){ return {}; }); })
          .then(async function(res){
            if (res && res.ok){
              ph54Toast(ph54T('✅ 차단을 지웠습니다', '✅ Block removed'));
              await ph54LoadRecords();
              ph54Render();
            } else {
              ph54Toast(ph54T('⚠️ 삭제 실패', '⚠️ Could not delete') + ': ' + ((res && (res.message || res.error)) || ''));
            }
          })
          .catch(function(){ ph54Toast(ph54T('⚠️ 삭제 실패(네트워크)', '⚠️ Delete failed (network)')); });
      });
    }
    /* 🚫 빈 칸 클릭 → 그 시간 차단. 강사를 고르지 않으면 «누구를 막을지» 를 알 수 없다 —
       예전엔 이때 클릭이 조용히 무시돼서 «안 되는 기능» 처럼 보였다. 이유를 말해 준다. */
    if (calTrack0 && !filterId && !calTrack0._blkHintBound){
      calTrack0._blkHintBound = true;
      calTrack0.addEventListener('click', function(ev){
        if (ev.target.closest && ev.target.closest('.ph54-ev')) return;
        if (!(ev.target.closest && ev.target.closest('.ph54-cal-col'))) return;
        ph54Toast(ph54T('💡 먼저 위에서 강사를 선택하면 빈 칸을 눌러 그 시간을 막을 수 있어요.',
                        '💡 Pick an instructor above first — then click an empty slot to block that time.'));
      });
    }
    if (calTrack0 && filterId){
      calTrack0.addEventListener('click', function(ev){
        if (ev.target.closest && ev.target.closest('.ph54-ev')) return;   // 카드 위 클릭은 무시
        var col = ev.target.closest && ev.target.closest('.ph54-cal-col');
        if (!col) return;
        var rect = col.getBoundingClientRect();
        // 클릭 Y → 30분 칸으로 스냅 (드래그 이동과 같은 계산)
        var rowIdx = Math.floor((ev.clientY - rect.top) / (PH54_HOUR_PX * PH54_SNAP / 60));
        var startMin = Math.max(PH54_START_H*60, Math.min(PH54_START_H*60 + rowIdx*PH54_SNAP, PH54_END_H*60 - PH54_SNAP));
        var colIdx = parseInt(col.dataset.day, 10);
        var from = ph54FmtMin(startMin), to = ph54FmtMin(Math.min(startMin + 60, PH54_END_H*60));
        var tName = (ph54State.teachers.filter(function(t){ return String(t.id)===String(filterId); })[0]||{}).name || '';
        var dLabel = dayLabel[colIdx], dDate = ph54FmtDate(days[colIdx]);

        /* 🕐 (2026-08-07 마이마이 ⑮ 「지금 시스템처럼 휴식시간을 **직접 골라서** 넣고 싶다」)
           예전 흐름은 prompt → confirm 두 개였고, 시간은 **무조건 1시간 고정**이라
           「15분만」·「2시간」 같은 실제 필요를 넣을 방법이 없었다(옛 시스템은 10분 칸 격자였다).
           → 시작·종료를 직접 고르는 작은 창으로 바꾼다. 반복 여부·사유·지우는 법이 한 화면에 있다. */
        ph54BlockDialog({
          teacher: tName, dateStr: dDate, dayLabel: dLabel, from: from, to: to
        }, function(sel){
          var payload = sel.weekly
            ? { teacher_id: String(filterId), teacher_name: tName, kind: 'weekly',
                day_of_week: (colIdx + 1) % 7,   // 캘린더 0=월 → DB 0=일 기준으로 환산
                start_time: sel.from, end_time: sel.to, reason: sel.reason }
            : { teacher_id: String(filterId), teacher_name: tName, kind: 'date_range',
                start_date: dDate, end_date: dDate, start_time: sel.from, end_time: sel.to, reason: sel.reason };

          ph54Toast(ph54T('💾 차단 저장 중… ', '💾 Saving the block… ') + dLabel + ' ' + sel.from);
          fetch('/api/admin/teacher-unavailability', {
            method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
          })
          .then(function(r){ return r.json().catch(function(){ return {}; }); })
          .then(async function(res){
            if (res && res.ok){
              ph54Toast(ph54T('✅ 차단됨: ', '✅ Blocked: ')
                + (sel.weekly ? ph54T('매주 '+dLabel, 'every ' + dLabel) : dDate) + ' ' + sel.from + '~' + sel.to);
              await ph54LoadRecords();   // 서버에서 다시 읽어 캘린더에 실제로 반영
              ph54Render();
            } else {
              ph54Toast(ph54T('⚠️ 차단 실패: ', '⚠️ Block failed: ')
                + ((res && (res.message || res.error)) || ph54T('서버 오류', 'server error')));
            }
          })
          .catch(function(){ ph54Toast(ph54T('⚠️ 차단 실패(네트워크)', '⚠️ Block failed (network)')); });
        });
      });
    }

    // ── HTML5 Drag & Drop: 카드를 다른 요일/시간으로 이동 ──
    var track = document.getElementById('ph54-cal-track');
    if (track){
      // (1) 드래그 시작 — 어떤 레코드를 잡았는지 ph54State._drag 에 기억
      track.addEventListener('dragstart', function(ev){
        var card = ev.target.closest && ev.target.closest('.ph54-ev'); if(!card) return;
        ph54State._drag = { idx: parseInt(card.dataset.idx, 10) };
        card.classList.add('dragging');
        try { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', card.dataset.idx); } catch(e){}
      });
      track.addEventListener('dragend', function(ev){
        var card = ev.target.closest && ev.target.closest('.ph54-ev'); if(card) card.classList.remove('dragging');
        Array.prototype.forEach.call(track.querySelectorAll('.ph54-col-over'), function(c){ c.classList.remove('ph54-col-over'); });
      });
      /* (2) 컬럼 위로 드래그 — preventDefault 해야 drop 이 발생, 하이라이트 표시
         🗂 접힌 요일 띠(.ph54-cal-fold)도 놓을 자리다 — 놓으면 그 요일로 옮기고 그 요일을 펼친다.
            강사별 열에 놓아도 «강사는 바뀌지 않는다»(PATCH 는 요일·시각만 보낸다). */
      var PH54_DROP_SEL = '.ph54-cal-col, .ph54-cal-fold';
      track.addEventListener('dragover', function(ev){
        var col = ev.target.closest && ev.target.closest(PH54_DROP_SEL); if(!col) return;
        ev.preventDefault(); try { ev.dataTransfer.dropEffect = 'move'; } catch(e){}
      });
      track.addEventListener('dragenter', function(ev){
        var col = ev.target.closest && ev.target.closest(PH54_DROP_SEL); if(col) col.classList.add('ph54-col-over');
      });
      track.addEventListener('dragleave', function(ev){
        var col = ev.target.closest && ev.target.closest(PH54_DROP_SEL); if(!col) return;
        if (!col.contains(ev.relatedTarget)) col.classList.remove('ph54-col-over');
      });
      // (3) 드롭 — 드롭한 컬럼(요일) + Y좌표(시간, 30분 스냅)로 레코드 갱신 → 재렌더 + 알림
      track.addEventListener('drop', function(ev){
        var col = ev.target.closest && ev.target.closest(PH54_DROP_SEL);
        if (!col || !ph54State._drag) return;
        ev.preventDefault();
        var idx = ph54State._drag.idx; ph54State._drag = null;
        var rec = ph54State.records[idx]; if(!rec) return;
        var newCol = parseInt(col.dataset.day, 10);
        // 드롭 Y → 30분 칸 인덱스 → 분
        var rect = col.getBoundingClientRect();
        var rowIdx = Math.round((ev.clientY - rect.top) / (PH54_HOUR_PX * PH54_SNAP / 60));
        var dur = rec.duration_min || 20;   // 기본 수업 20분(영어·중국어 공통, 2026-07-23)
        var newMin = PH54_START_H*60 + rowIdx*PH54_SNAP;
        newMin = Math.max(PH54_START_H*60, Math.min(newMin, PH54_END_H*60 - dur));  // 06:00~24:00 범위 클램프
        // 레코드 갱신(요일/날짜/시간/시)
        var newDate = ph54FmtDate(days[newCol]);
        var newTime = ph54FmtMin(newMin);
        rec.date = newDate; rec.start_time = newTime; rec.hour = Math.floor(newMin/60); rec.day_of_week = dowKeyByIdx[newCol];
        if (col.classList.contains('ph54-cal-fold')) ph54State.openDay = newCol;   // 접힌 요일에 놓았으면 그 요일을 펼쳐 결과를 보여 준다
        var otherTeacher = col.dataset.teacher && String(rec.teacher_id) !== String(col.dataset.teacher);
        ph54Render();   // 즉시 다시 그리기(낙관적 업데이트)
        if (otherTeacher) ph54Toast(ph54T('ℹ️ 강사는 바뀌지 않습니다 — 다른 강사 열에 놓아도 요일·시각만 옮깁니다', 'ℹ️ The instructor stays the same — dropping on another column only moves the day/time'));
        console.log('[ph54] 일정 이동 →', { id: rec.id, day: dowKeyByIdx[newCol], date: newDate, start_time: newTime, duration_min: dur });
        // 🔒 서버에 영구 저장(PATCH /api/admin/class-schedules/:id). id 없으면 화면 이동만.
        if (rec.id != null) {
          ph54Toast('💾 저장 중… ' + dayLabel[newCol] + '요일 ' + newTime);
          fetch('/api/admin/class-schedules/' + rec.id, {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ day_of_week: dowKeyByIdx[newCol], start_time: newTime })
          })
          .then(function(r){ return r.json().catch(function(){ return {}; }); })
          .then(function(res){
            if (res && res.ok) ph54Toast('✅ 저장됨: ' + dayLabel[newCol] + '요일 ' + newTime + ' (' + dur + '분)');
            else ph54Toast('⚠️ 저장 실패(화면만 이동): ' + ((res && res.error) || '서버 오류'));
          })
          .catch(function(){ ph54Toast('⚠️ 저장 실패(네트워크). 화면만 이동됨'); });
        } else {
          ph54Toast('📌 이동(임시): ' + dayLabel[newCol] + '요일 ' + newTime + ' — 저장 불가(id 없음)');
        }
      });
    }
  }

  async function ph54Init(){
    // 1) 카드 추가 — card-class-attendance 다음에
    var mgmt = document.getElementById('card-teacher-mgmt');
    if (!mgmt) return;
    if (document.getElementById('card-teacher-schedule')) return;

    var sched = document.createElement('details');
    sched.id = 'card-teacher-schedule';
    sched.innerHTML =
      '<summary>📅 <span data-ko="강사 스케줄 (주간 통합 캘린더)" data-en="Teacher Schedule (Weekly Calendar)">강사 스케줄 (주간 통합 캘린더)</span></summary>'
      + '<div id="ph54-sched-wrap"><div style="padding:14px;color:#6b7280">로딩 중…</div></div>';

    // class-attendance 카드 다음, 없으면 attendance-status 다음, 없으면 mgmt 맨 끝
    var anchor = document.getElementById('card-class-attendance')
              || document.getElementById('card-attendance-status');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(sched, anchor.nextSibling);
    } else {
      mgmt.appendChild(sched);
    }

    // 펼침 시 1회 로드
    sched.addEventListener('toggle', async function(){
      if (!sched.open) return;
      // 강사 목록(1회)+수업기록을 병렬 로드 → 첫 열람 지연 절반
      await Promise.all([
        ph54State.teachers.length ? null : ph54LoadTeachers(),
        ph54LoadRecords()
      ]);
      ph54Render();
    });
  }

  /* 강사 목록 테이블 각 행 액션 컬럼에 📅 버튼 추가 */
  function ph54AddRowButtons(){
    var rows = document.querySelectorAll('#tp-list-body tr');
    rows.forEach(function(tr){
      if (tr.dataset.ph54Bound === '1') return;
      var actionCell = tr.children[tr.children.length - 1];
      if (!actionCell) return;
      // teacherProfile id 찾기 — viewTeacherProfile(ID) 패턴에서 추출
      var viewBtn = actionCell.querySelector('button[onclick*="viewTeacherProfile"]');
      if (!viewBtn) return;
      var m = (viewBtn.getAttribute('onclick') || '').match(/viewTeacherProfile\((\d+)\)/);
      if (!m) return;
      var tid = m[1];

      // 강사 이름 (두 번째 셀의 <b>)
      var nameCell = tr.children[1];
      var nameEl = nameCell && nameCell.querySelector('b');
      var tname = nameEl ? nameEl.textContent.trim() : '';

      var btn = document.createElement('button');
      btn.className = 'ph54-row-cal-btn tp-act-btn tp-act--cal';
      btn.title = tname + ' 스케줄 캘린더';
      btn.setAttribute('aria-label', '스케줄 캘린더');
      // Win10 이모지 깨짐 방지 — adm-core 의 인라인 SVG 아이콘/버튼 스타일 재사용 (없으면 텍스트 폴백)
      if (window._TP_IC && window._TP_ACT_BTN) {
        btn.style.cssText = window._TP_ACT_BTN;
        btn.innerHTML = window._TP_IC.calendar;
      } else {
        btn.textContent = '일정';
        btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;height:28px;padding:0 8px;margin:0 2px;border:0;border-radius:6px;cursor:pointer;color:#fff;background:#8b5cf6;font-size:11px;font-weight:700;vertical-align:middle';
      }
      btn.onclick = function(e){
        e.preventDefault(); e.stopPropagation();
        // 1) 카드 펼치기
        var sched = document.getElementById('card-teacher-schedule');
        if (!sched) return;
        sched.open = true;
        // 2) 이번 주로 + 이 강사만 필터 + 수업 데이터 로드 후 렌더
        (async function(){
          ph54State.weekOffset = 0;                  // 이번 주
          // 강사 목록(1회)+수업기록 병렬 로드 — 필터를 «정하기 전에» 원부가 있어야 이름을 되찾는다
          await Promise.all([
            ph54State.teachers.length ? null : ph54LoadTeachers(),
            ph54LoadRecords()
          ]);
          /* ⚠️ 이 버튼이 가진 tid 는 teacher_profiles.id 라, 캘린더가 쓰는 teachers.id 와 다르다.
             예전엔 그대로 필터에 넣어 «남의 수업» 또는 0건이 나왔다 → 이름으로 원부 id 를 되찾는다. */
          var rid = ph54ResolveTeacherId(tname);
          ph54State.teacherFilter = rid;
          // 못 찾으면 조용히 0건을 보여주지 않는다 — 왜 전체가 뜨는지 말해 준다
          if (!rid) ph54Toast((tname || '이 강사') + ' — 강사 원부와 이름이 연결되지 않아 전체 일정을 표시합니다');
          ph54Render();
          // 3) 카드로 스크롤
          setTimeout(function(){ sched.scrollIntoView({ behavior:'smooth', block:'start' }); }, 100);
        })();
      };
      actionCell.appendChild(document.createTextNode(' '));
      actionCell.appendChild(btn);
      tr.dataset.ph54Bound = '1';
    });
  }

  // 초기화 + 동적 행 감지
  function ph54Boot(){
    ph54Init();
    ph54AddRowButtons();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ph54Boot);
  } else {
    ph54Boot();
  }
  [500, 1500, 3000, 6000].forEach(function(d){ setTimeout(ph54Boot, d); });

  if (typeof MutationObserver !== 'undefined') {
    var tbody = document.getElementById('tp-list-body');
    if (tbody) {
      new MutationObserver(ph54AddRowButtons).observe(tbody, { childList: true, subtree: true });
    } else {
      // tbody 아직 없음 — body 전체 감시
      new MutationObserver(function(){
        var tb = document.getElementById('tp-list-body');
        if (tb && !tb.dataset.ph54Mo) {
          tb.dataset.ph54Mo = '1';
          new MutationObserver(ph54AddRowButtons).observe(tb, { childList: true, subtree: true });
        }
        ph54AddRowButtons();
      }).observe(document.body, { childList: true, subtree: true });
    }
  }
})();
