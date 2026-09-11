/* adm-bulkbook.js — 📚 학생 교재 일괄 배정 (2026-07-21)
   학생관리 > 학생 목록 툴바에 [📚 일괄 교재 배정] 버튼을 주입하고, 모달에서
   교재(카탈로그 /api/admin/textbooks) 선택 → dry 미리보기(대상 인원수) → 실행.
   서버: POST /api/admin/students/bulk-assign-textbook (스코프 격리·미배정만 기본).
   배정 결과는 화상수업 입장 시 '배정 교재 자동 로드'(students_erp.textbook)가 읽는다. */
(function(){
  'use strict';
  function $(id){ return document.getElementById(id); }
  /* 🌐 언어 판정 — 정본은 window.adminLang (adm-lang-boot.js 가 정하고, adm-core.js 의
     `var adminLang` 이 같은 바인딩이라 KO/EN 토글까지 따라온다. 저장 키는 mangoi_lang).
     ⚠️ 예전엔 localStorage 'adminLang' 을 읽었는데 그 키는 **아무도 저장하지 않는 죽은 키**라
        EN 스태프에게도 늘 한국어였다(2026-08-27 수리). ⛔ 그 키에 쓰는 방식으로 되살리지 말 것.
     ⚠️ 함께 보던 `mango_lang` 도 뺐다 — 구버전 키이고, 그걸 쓰는 화면(judgment.html)은
        같은 자리에서 mangoi_lang 도 함께 저장하므로 잃는 값이 없다. */
  function isEn(){
    if (window.adminLang === 'en' || window.adminLang === 'ko') return window.adminLang === 'en';
    try { return (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch(e){ return false; }
  }
  function T(ko, en){ return isEn() ? en : ko; }

  var lastPreview = null;   // 마지막 dry 결과 { targets, ... } — 실행 전 미리보기 강제용
  /* 🎯 (2026-09-08) 「이 학생만」 모드 — 매니저 「오늘 수업」의 교재 배지에서 열면 채워진다.
     서버가 user_ids 를 **정확일치** 로 본다(부분일치인 학생 검색어와 다른 입구다).
     ⛔ 창을 닫을 때 반드시 비운다 — 안 비우면 다음에 「일괄 배정」으로 연 창이 몰래
        그 한 명만 대상으로 돌고, 화면은 «전체» 처럼 보인다(조용한 사고). */
  var pinnedIds = null;

  function injectButton(){
    var loadBtn = $('sm-load-students');
    if (!loadBtn || $('sm-bulk-assign-textbook')) return;
    var bar = loadBtn.parentElement;
    var btn = document.createElement('button');
    btn.id = 'sm-bulk-assign-textbook'; btn.type = 'button';
    btn.setAttribute('data-ko', '📚 일괄 교재 배정'); btn.setAttribute('data-en', '📚 Bulk Assign Textbook');
    btn.textContent = T('📚 일괄 교재 배정', '📚 Bulk Assign Textbook');
    btn.style.cssText = 'padding:5px 12px;font-size:12px;border:1px solid rgba(59,130,246,.5);border-radius:8px;background:rgba(59,130,246,.12);color:#1d4ed8;font-weight:800;cursor:pointer;white-space:nowrap';
    btn.onclick = openModal;
    var csv = $('sm-export-csv');
    if (csv && csv.parentElement === bar && csv.nextSibling) bar.insertBefore(btn, csv.nextSibling);
    else bar.appendChild(btn);
  }

  function buildModal(){
    if ($('bat-overlay')) return;
    var ov = document.createElement('div');
    ov.id = 'bat-overlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99990;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:14px;max-width:460px;width:100%;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);color:#1c1917">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
          '<span style="font-size:16px;font-weight:900">📚 ' + T('교재 일괄 배정', 'Bulk Textbook Assignment') + '</span>' +
          '<button id="bat-close" type="button" style="margin-left:auto;border:none;background:none;font-size:18px;cursor:pointer;color:#6b7280">✕</button>' +
        '</div>' +
        '<label style="display:block;font-size:12px;font-weight:800;margin-bottom:4px">' + T('배정할 교재', 'Textbook') + '</label>' +
        '<select id="bat-book" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:10px"><option value="">' + T('불러오는 중…', 'Loading…') + '</option></select>' +
        '<label style="display:block;font-size:12px;font-weight:800;margin-bottom:4px">' + T('레벨 (선택 — 비우면 기존 유지 · 「Lv 3」 형식)', 'Level (optional — keep existing if empty · use "Lv 3" format)') + '</label>' +
        '<input id="bat-level" type="text" placeholder="' + T('예: Lv 1', 'e.g. Lv 1') + '" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:10px" />' +
        '<label style="display:block;font-size:12px;font-weight:800;margin-bottom:4px">' + T('학생 검색어 (선택 — 이름/아이디 일부)', 'Student filter (optional — name/ID)') + '</label>' +
        '<input id="bat-q" type="text" placeholder="' + T('비우면 권한 범위 내 전체', 'Empty = all in your scope') + '" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:10px" />' +
        '<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;margin-bottom:12px;cursor:pointer">' +
          '<input id="bat-empty" type="checkbox" checked /> ' + T('교재 미배정 학생만 (권장)', 'Only students with no textbook (recommended)') +
        '</label>' +
        '<div id="bat-pinned" style="display:none;font-size:12.5px;line-height:1.6;color:#065f46;background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.45);border-radius:8px;padding:8px 10px;margin-bottom:10px"></div>' +
        '<div id="bat-status" style="min-height:20px;font-size:12.5px;font-weight:700;color:#92400e;margin-bottom:12px"></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button id="bat-preview" type="button" style="padding:8px 14px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;font-weight:800;cursor:pointer">🔍 ' + T('대상 미리보기', 'Preview targets') + '</button>' +
          '<button id="bat-run" type="button" disabled style="padding:8px 14px;font-size:13px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:800;cursor:pointer;opacity:.5">✅ ' + T('배정 실행', 'Assign') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if (e.target === ov) closeModal(); });
    $('bat-close').onclick = closeModal;
    $('bat-preview').onclick = doPreview;
    $('bat-run').onclick = doRun;
    // 조건이 바뀌면 미리보기 무효화 (본 것과 다른 대상에 실행되는 사고 방지)
    ['bat-book', 'bat-level', 'bat-q', 'bat-empty'].forEach(function(id){
      $(id).addEventListener('change', invalidatePreview);
      $(id).addEventListener('input', invalidatePreview);
    });
    // 교재 선택 시 카탈로그의 레벨 자동 채움
    $('bat-book').addEventListener('change', function(){
      var opt = this.options[this.selectedIndex];
      if (opt && opt.dataset && opt.dataset.level) $('bat-level').value = opt.dataset.level;
    });
  }

  function invalidatePreview(){
    lastPreview = null;
    var run = $('bat-run');
    if (run) { run.disabled = true; run.style.opacity = '.5'; }
    var st = $('bat-status');
    if (st) st.textContent = '';
  }

  function closeModal(){
    var ov = $('bat-overlay'); if (ov) ov.style.display = 'none';
    /* ⛔ 닫을 때도 푼다 — 여는 쪽(openModal)과 «둘 다» 두는 이중 방어다.
       하나만 지워도 다른 하나가 받쳐 주지만, **둘 다 지우면** 다음에 연 창이 몰래
       그 한 명만 대상으로 돈다(브라우저 검사에서 실제로 5건 FAIL 로 재현했다). */
    unpin();
  }

  function unpin(){
    pinnedIds = null;
    var q = $('bat-q'), pin = $('bat-pinned');
    if (q) { q.disabled = false; q.placeholder = T('비우면 권한 범위 내 전체', 'Empty = all in your scope'); }
    if (pin) pin.style.display = 'none';
  }

  /* 🎯 「이 학생만」으로 고정 — 검색어 칸을 잠그고, 누구인지 화면에 못 박는다.
     ⚠️ 이름을 화면에 그릴 때 반드시 esc() — 학생 이름은 우리가 만든 값이 아니다. */
  function pinTo(ids, who){
    pinnedIds = ids.slice(0);
    var q = $('bat-q');
    if (q) { q.value = ''; q.disabled = true; q.placeholder = T('이 학생만 배정합니다', 'Assigning to this student only'); }
    var pin = $('bat-pinned');
    if (pin) {
      pin.style.display = 'block';
      pin.innerHTML = '🎯 ' + T('이 학생에게만 배정합니다: ', 'Assigning to this student only: ')
        + '<b>' + esc(who || ids.join(', ')) + '</b>';
    }
  }

  function openModal(){
    buildModal();
    /* ⛔ «이 학생만» 은 창을 열 때마다 푼다 — 이 자리가 정본이다(모든 입구가 지난다).
       학생관리 툴바의 「📚 일괄 배정」 버튼은 이 함수를 **직접** 부르므로(injectButton),
       닫기에만 걸어 두면 그 경로로 연 창이 몰래 «한 명» 만 대상으로 돈다 — 화면은
       «전체» 처럼 보이는 조용한 사고다(2026-09-08 변이시험에서 이 구멍을 찾았다). */
    unpin();
    invalidatePreview();
    $('bat-overlay').style.display = 'flex';
    loadBooks();
  }

  function esc(v){ return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function opt(name, level, label){
    return '<option value="' + esc(name) + '" data-level="' + esc(level || '') + '">' + esc(label) + '</option>';
  }

  /* 📚 (2026-09-02) 교재 목록을 «실제로 콘텐츠가 있는 이름» 으로 바꿨다.
     [무엇이 문제였나] 예전에는 /api/admin/textbooks 의 items(= D1 `textbooks` 표)만 그렸는데
       그 표에는 「BTS」·「다락원」 **2행뿐**이었다. 그런데 AI 학습도구가 매칭에 쓰는 이름은
       「BTS 1 001 (Welcome to school)」 같은 실제 콘텐츠 이름이라, 여기서 고른 이름으로
       배정하면 **에러 없이 아무것도 안 맞았다.** 배정은 «성공» 하고 학습만 조용히 헛돌았다
       (2026-09-02 D1 실측: 교재가 배정된 학생 29,462명 중 0명).
     [지금] 서버가 ?library=1 로 실재 이름을 함께 준다(정본 src/student-placement.ts).
       ⚠️ 「문항 N · 페이지 N」을 라벨에 함께 적는다 — 문항이 0이면 AI 가 즉석 출제하므로
          곧바로는 그 교재 문장이 안 나온다. 감추면 「배정했는데 왜 안 나오지」가 재현된다.
       ⚠️ 🈶 는 중국어 교재다. 영어 학생에게 배정하면 웜업·복습퀴즈에 병음이 섞여 나온다.
       ⛔ items(카탈로그)를 지우지 않는다 — 교재 관리 화면에서 손으로 등록한 것이라
          그쪽으로 배정해 온 이력이 있을 수 있다. 맨 아래 묶음으로 남긴다. */
  function loadBooks(){
    var sel = $('bat-book');
    if (sel.dataset.loaded === '1') return;
    fetch('/api/admin/textbooks?library=1', { credentials: 'include' })
      .then(function(r){ return r.json(); })
      .then(function(j){
        var items = (j && j.items) || [];
        var lib = (j && j.library) || [];
        var ready = [], rest = [];
        for (var i = 0; i < lib.length; i++) (lib[i].quizzes > 0 ? ready : rest).push(lib[i]);

        var html = '<option value="">' + T('— 교재 선택 —', '— Select textbook —') + '</option>';
        function group(label, arr){
          if (!arr.length) return '';
          return '<optgroup label="' + esc(label) + '">' + arr.map(function(b){
            var bits = [];
            if (b.quizzes > 0) bits.push(T('문항 ' + b.quizzes, b.quizzes + ' quizzes'));
            if (b.files > 0) bits.push(T('페이지 ' + b.files, b.files + ' pages'));
            var tag = (b.lang === 'zh' ? '🈶 ' : '') + b.name + (bits.length ? '  · ' + bits.join(' · ') : '');
            return opt(b.name, b.level, tag);
          }).join('') + '</optgroup>';
        }
        html += group(T('✅ 바로 쓸 수 있는 교재 (복습퀴즈 있음)', '✅ Ready — has review quizzes'), ready);
        html += group(T('📕 라이브러리 교재 (문항은 AI가 즉석 출제)', '📕 Library — quizzes generated by AI'), rest);
        if (items.length) {
          html += '<optgroup label="' + esc(T('📘 교재 관리에 등록된 이름', '📘 Registered in Textbook Manager')) + '">' +
            items.map(function(b){ return opt(b.title, b.level, b.title + (b.level ? ' (' + b.level + ')' : '')); }).join('') + '</optgroup>';
        }
        if (!lib.length && !items.length) {
          sel.innerHTML = '<option value="">' + T('배정할 수 있는 교재가 없습니다 — 라이브러리에 교재를 먼저 올려주세요', 'No textbooks — upload to the library first') + '</option>';
          return;
        }
        sel.innerHTML = html;
        sel.dataset.loaded = '1';
      })
      .catch(function(){ sel.innerHTML = '<option value="">' + T('교재 목록 로드 실패', 'Failed to load textbooks') + '</option>'; });
  }

  function payload(dry){
    return {
      textbook_title: $('bat-book').value,
      level: $('bat-level').value.trim(),
      q: pinnedIds ? '' : $('bat-q').value.trim(),
      only_empty: $('bat-empty').checked,
      dry: !!dry,
      /* 🎯 정확일치 목록 — 서버는 이 조건을 학생 검색어와 **AND 로 묶는다**(무시하지 않는다).
         그래서 여기서 q 를 비워 보낸다 — 두 조건이 겹치면 «이 학생» 이 조용히 0명이 된다.
         ⛔ 주석을 「서버가 q 를 무시한다」로 적지 말 것: 다음 사람이 그것을 믿고 서버에서
            q 를 빼면 그 순간 뜻이 바뀐다(CLAUDE.md 2장 「주석을 믿지 마세요」). */
      user_ids: pinnedIds || undefined
    };
  }

  /* 🗣 (2026-09-08) 실패를 «사람 말» 로 옮긴다 — 서버가 내는 것은 영문 코드다.
     [무엇이 문제였나] 강사·내부 계정이 이 창을 열어 실행하면 서버가 403 `no_scope` 로
       올바르게 막는데, 화면에는 「❌ no_scope」라는 **영문 코드만** 떴다. 쓰는 사람은
       무엇이 잘못됐는지도, 무엇을 하면 되는지도 알 수 없다
       (CLAUDE.md 2장 「상한·검증을 새로 걸 때 화면이 그 실패를 뭐라고 말하는지」).
     ⚠️ 이 코드 목록은 서버에서 «읽어» 온 것이다 — 지어내지 않았다:
       no_scope·too_many_targets (api-admin.ts) · forbidden_teacher·forbidden_scope·
       auth_required (index.ts·auth-admin.ts) · invalid_body (api-util.ts) ·
       Not Found (index.ts 종단 404 — 이 응답에는 `ok` 칸이 아예 없다).
     ⛔ 모르는 코드를 «성공» 이나 «알 수 없는 오류» 로 뭉개지 않는다 — 코드를 그대로 함께
        보여 준다(다음 사람이 그것으로 찾는다). */
  var FAIL_TEXT = {
    no_scope: ['이 계정에는 학생 명부 범위가 없어 교재를 배정할 수 없습니다 (강사·내부 계정). 본사나 지사 계정으로 로그인해 주세요.',
               'This account has no student scope, so it cannot assign textbooks (teacher/internal account). Please use an HQ or branch account.'],
    forbidden_teacher: ['강사 계정은 이 기능을 쓸 수 없습니다.',
                        'Teacher accounts cannot use this feature.'],
    forbidden_scope: ['이 계정의 권한 범위에서는 쓸 수 없는 기능입니다.',
                      'This feature is not available for your account scope.'],
    auth_required: ['로그인이 풀렸습니다. 새로고침한 뒤 다시 로그인해 주세요.',
                    'Your session expired. Please refresh and sign in again.'],
    invalid_body: ['보낸 값이 모자랍니다 — 교재를 골랐는지 확인해 주세요.',
                   'Missing required values — please check that a textbook is selected.'],
    'Not Found': ['서버가 이 기능의 주소를 모릅니다 — 배포가 아직 안 나갔을 수 있습니다.',
                  'The server does not know this endpoint — the deploy may not have gone out yet.'],
    /* 🎯 «이 학생만» 입구가 내는 코드 — 화면이 모르면 「실패 (invalid_user_ids)」로 뜬다 */
    invalid_user_ids: ['학생 지정이 잘못 전달됐습니다. 창을 닫고 배지를 다시 눌러 주세요.',
                       'The student selection was not sent correctly. Close this and click the badge again.'],
    too_many_user_ids: ['한 번에 지정할 수 있는 학생은 50명까지입니다.',
                        'You can pin at most 50 students at once.']
  };
  function failText(j, status){
    var code = (j && j.error) || '';
    /* 대상이 너무 많아 막힌 것은 «무엇을 하면 되는지» 가 다르다 — 건수를 함께 말한다 */
    if (code === 'too_many_targets') {
      var n = (j && j.targets) || 0;
      return T('대상이 ' + n + '명으로 너무 많아 막았습니다. 학생 검색어로 범위를 좁혀 주세요.',
               'Blocked: ' + n + ' targets is too many. Narrow it down with the student filter.');
    }
    /* 🪪 «지금 누구로 들어와 있는가» — 서버가 완성해 준 who_line 을 붙이기만 한다.
       ⛔ 그 문장을 이 파일에 베껴 적지 말 것(정본은 src/forbidden-teacher.ts 하나). */
    var whoLine = (j && (isEn() ? j.who_line_en : j.who_line)) || '';
    if (FAIL_TEXT[code]) return (isEn() ? FAIL_TEXT[code][1] : FAIL_TEXT[code][0]) + (whoLine ? ' ' + whoLine : '');
    if (code) return T('실패 (' + code + ')', 'Failed (' + code + ')');
    if (status) return T('서버가 ' + status + ' 로 거절했습니다.', 'The server refused with HTTP ' + status + '.');
    return T('실패', 'Failed');
  }

  /* ⚠️ 판정은 «실패라고 말했는가» 가 아니라 «성공이라고 말했는가» 로 한다 —
     종단 404 응답에는 `ok` 칸이 없어 `d.ok === false` 검사를 그냥 통과한다(CLAUDE.md 2장).
     그래서 HTTP 상태도 함께 들고 온다. 본문이 JSON 이 아니어도(로그인 HTML 등) 안 던진다. */
  function post(body){
    return fetch('/api/admin/students/bulk-assign-textbook', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function(r){
      return r.json().then(function(j){ return { j: j, status: r.status, httpOk: r.ok }; },
                           function(){ return { j: null, status: r.status, httpOk: r.ok }; });
    });
  }

  function doPreview(){
    var st = $('bat-status');
    if (!$('bat-book').value) { st.textContent = '⚠️ ' + T('교재를 먼저 선택하세요', 'Select a textbook first'); return; }
    st.textContent = T('대상 계산 중…', 'Counting…');
    post(payload(true)).then(function(res){
      var j = res.j;
      if (!res.httpOk || !j || j.ok !== true) { st.textContent = '❌ ' + failText(j, res.status); return; }
      lastPreview = j;
      /* 🎯 «이 학생만» 인데 0명이면 이유를 말한다 — 화면에는 「📚 교재 미배정 ▸」 배지가 떠 있는데
         대상이 0명이라, 그냥 «0명» 만 쓰면 «고장» 으로 읽힌다(CLAUDE.md 2장 「화면이 그 실패를
         뭐라고 말하는지」). 실측상 학생 아이디의 0.8% 는 학생 명부에서 안 찾아진다. */
      if (pinnedIds && j.targets === 0) {
        st.textContent = '🎯 ' + T('대상 0명 — 그 학생을 학생 명부에서 못 찾았거나, 그 사이 교재가 이미 배정됐습니다.',
                                   'No targets — that student is not in the roster, or a textbook was assigned in the meantime.');
        var run0 = $('bat-run'); run0.disabled = true; run0.style.opacity = '.5';
        return;
      }
      st.textContent = '🎯 ' + T('대상 학생: ', 'Targets: ') + j.targets + T('명', ' students') + ($('bat-empty').checked ? T(' (미배정만)', ' (unassigned only)') : '');
      var run = $('bat-run');
      run.disabled = j.targets === 0;
      run.style.opacity = j.targets === 0 ? '.5' : '1';
    }).catch(function(){ st.textContent = '❌ ' + T('요청 실패', 'Request failed'); });
  }

  function doRun(){
    if (!lastPreview) return;
    var st = $('bat-status');
    var n = lastPreview.targets;
    var title = $('bat-book').value;
    if (!confirm(T(n + '명에게 "' + title + '" 교재를 배정할까요?', 'Assign "' + title + '" to ' + n + ' students?'))) return;
    var body = payload(false);
    if (n > 2000) {
      if (!confirm(T('⚠️ 대상이 ' + n + '명으로 많습니다. 정말 전체에 실행할까요?', '⚠️ ' + n + ' targets is a lot. Really run for all?'))) return;
      body.force = true;
    }
    st.textContent = T('배정 실행 중…', 'Assigning…');
    post(body).then(function(res){
      var j = res.j;
      if (!res.httpOk || !j || j.ok !== true) { st.textContent = '❌ ' + failText(j, res.status); return; }
      st.textContent = '✅ ' + T('배정 완료: ', 'Assigned: ') + j.updated + T('명', ' students');
      invalidatePreviewKeepMsg(st.textContent);
      try { var reload = $('sm-load-students'); if (reload) reload.click(); } catch(e){}
    }).catch(function(){ st.textContent = '❌ ' + T('요청 실패', 'Request failed'); });
  }

  function invalidatePreviewKeepMsg(msg){
    lastPreview = null;
    var run = $('bat-run');
    if (run) { run.disabled = true; run.style.opacity = '.5'; }
    var st = $('bat-status');
    if (st && msg) st.textContent = msg;
  }

  /* 🔗 (2026-09-08) 밖에서도 이 모달을 열 수 있게 낸 문 — 매니저 「오늘 수업」의
     «교재 미배정 N건» 줄이 부른다(js/adm-today-classes.js).
     ⛔ 배정 규칙을 그쪽에 복제하지 않으려고 «여는 문» 만 낸 것이다. 미리보기 강제·
        미배정 학생만·2000명 초과 force 는 전부 이 모달과 서버에 그대로 남는다.
     ⚠️ 이름을 바꾸면 부르는 쪽이 **조용히 헛돈다** — 그쪽은 함수가 없으면 사람에게
        «못 열었다» 고 말하도록 해 두었다(아무 일도 안 일어나면 «고장» 으로 읽힌다). */
  window.mangoiOpenBulkTextbook = function (prefill) {
    openModal();
    try {
      var ids = (prefill && Array.isArray(prefill.userIds)) ? prefill.userIds.filter(Boolean) : null;
      if (ids && ids.length) { pinTo(ids, prefill.who); invalidatePreview(); }
      else {
        var q = prefill && prefill.q ? String(prefill.q) : '';
        var el = $('bat-q');
        if (q && el) { el.value = q; invalidatePreview(); }
      }
      /* 📌 여는 쪽이 «이 창의 대상» 을 한 마디 적을 수 있게 — 부르는 화면이 세는 수와
         이 창의 기본 대상이 다를 수 있다(그쪽은 «화면에 보이는 줄», 여기는 «권한 범위 전체»).
         ⚠️ invalidatePreview() 가 상태줄을 비우므로 **그 뒤에** 쓴다(순서가 뒤집히면 사라진다). */
      var note = prefill && prefill.note ? String(prefill.note) : '';
      var st = $('bat-status');
      if (note && st) st.textContent = note;
    } catch (e) { /* 무시 — 채우기 실패가 모달을 막으면 안 된다 */ }
  };

  // 학생관리 카드가 lazy 렌더될 수 있어 주기적으로 버튼 주입 시도 (있으면 no-op)
  if (document.readyState !== 'loading') injectButton();
  else document.addEventListener('DOMContentLoaded', injectButton);
  setInterval(injectButton, 2000);
})();
