// ═══════════════════════════════════════════════════════════════════════════════
// idx-tb-preview.js — 교재 「페이지 창」 (라이브러리 미리보기)
//   2026-08-20 · Melca 8/13 제보 ② 「고르면 창이 바로 닫힌다 / 크기 조절 / 쪽 번호」
//
// ⚠️ 왜 idx-x3.js 가 아니라 별도 파일인가
//   idx-x3.js 는 index.html 이 **blocking** 으로 부른다. 그 예산(first_paint_budget_harness)은
//   여유가 0KB 이고, 학생 29,000명 전원이 첫 화면에서 받는다. 이 창은 **강사만** 쓴다.
//   → 별도 파일 + defer. 학생 첫 화면은 1바이트도 안 무거워진다.
//   (같은 판단의 선례: /js/idx-whisper.js — CLAUDE.md 2장 「첫 화면 무게」 함정)
//
// ⚠️ 헬퍼는 여기에 복사하지 말 것. idx-x3.js 의 IIFE 가 window.__tbfLibHelpers 로
//   한 벌 넘겨준다. 특히 buildBookSequence 는 **정본이 저쪽 하나**여야 한다 —
//   목록의 쪽 번호와 ◀▶ 시퀀스 자리가 어긋나면 「3번을 눌렀는데 4번이 뜬다」가 된다.
//
// ⚠️ 고치면 index.html 의 <script defer src="/js/idx-tb-preview.js?v=N"> 의 N 을 올릴 것
//   (asset_version_harness 가 막는다 — immutable 캐시에 옛 파일이 1년 남는 사고 방지).
// ═══════════════════════════════════════════════════════════════════════════════
(function(){
  "use strict";

  window.__tbfPreviewBook = async function(book){
    var H = window.__tbfLibHelpers;
    if (!H) { console.warn('[tb-preview] __tbfLibHelpers 없음 — idx-x3.js 가 먼저 실행돼야 한다'); return; }

    // 서버 교재면 파일을 먼저 lazy 로드
    if (book && book._serverBook && !(book.lessons && book.lessons.length)) {
      try { if (typeof window.showToast === 'function') window.showToast('📥 교재 불러오는 중…'); } catch(_){}
      try { await H.ensureServerBookFiles(book); } catch(e) { alert('교재 파일 로드 실패: ' + (e.message || e)); return; }
    }
    var EN = false;
    try { EN = (typeof getLang === 'function' && getLang() === 'en'); } catch(_){}
    var T = function(ko, en){ return EN ? en : ko; };

    // 같은 창이 두 벌 쌓이지 않게 (CLAUDE.md 「떠 있는 안내 상자가 닫아도 안 사라짐」 함정)
    var old = document.getElementById('tbf-preview-modal');
    if (old) old.remove();

    var lessons = (book.lessons || []).slice().sort(function(a,b){ return H.naturalCmp(a.name, b.name); });
    var lessonsHtml = '';
    var seqNo = 0;   // ◀▶ 시퀀스에서 몇 번째인가 (buildBookSequence 와 같은 셈법)
    if (lessons.length === 0) {
      lessonsHtml = '<div style="color:#94a3b8;text-align:center;padding:26px;font-size:12.5px">'
                  + T('레슨 정보가 없습니다.', 'No lesson information.') + '</div>';
    } else {
      lessons.forEach(function(l){
        lessonsHtml += '<div style="margin-bottom:9px"><div style="font-weight:800;color:#1e40af;font-size:12px;margin-bottom:4px;position:sticky;top:0;background:#fff;padding:2px 0">📑 ' + H.esc(l.name) + '</div>';
        var sortedIds = (l.fileIds || []).slice().sort(function(a, b){
          var fa = window._libFileMap[a] || {};
          var fb = window._libFileMap[b] || {};
          return H.naturalCmp(fa.name || '', fb.name || '');
        });
        sortedIds.forEach(function(fid){
          var f = window._libFileMap[fid];
          if (!f) {
            lessonsHtml += '<div style="color:#94a3b8;padding:4px 8px;font-size:11.5px">❓ ' + T('파일 없음','file missing') + '</div>';
            return;
          }
          // buildBookSequence 와 같은 필터 — 여기 통과한 것만 번호를 받는다
          var inSeq = (f.kind === 'image' || f.kind === 'pdf') && (f.blob || f.url);
          if (!inSeq) {
            lessonsHtml += '<div style="color:#94a3b8;padding:4px 8px;font-size:11.5px">' + H.fileEmoji(f.kind) + ' ' + H.esc(f.name) + '</div>';
            return;
          }
          seqNo++;
          lessonsHtml += '<div class="tbf-pv-file" data-fid="' + H.esc(fid) + '" data-no="' + seqNo + '" data-kind="' + H.esc(f.kind) + '" data-name="' + H.esc(f.name) + '" style="display:flex;align-items:center;gap:6px;padding:6px 9px;background:#f8fafc;border-radius:6px;margin:3px 0;font-size:12px;cursor:pointer;border:1px solid #e2e8f0">' +
            '<span style="flex:0 0 auto;min-width:26px;text-align:right;color:#94a3b8;font-weight:800;font-variant-numeric:tabular-nums">' + seqNo + '.</span>' +
            '<span>' + H.fileEmoji(f.kind) + '</span>' +
            '<span style="flex:1;min-width:0;color:#334155;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + H.esc(f.name) + '</span>' +
            '<span class="tbf-pv-go" style="flex:0 0 auto;padding:3px 9px;background:#3b82f6;color:#fff;border-radius:99px;font-size:10.5px;font-weight:700">▶</span>' +
          '</div>';
        });
        lessonsHtml += '</div>';
      });
    }

    /* 📐 지난번 크기·자리를 되살린다. 없으면 오른쪽에 세로로 긴 창.
       ⚠️ 화면 밖으로 나간 좌표는 되살리지 않는다 — 노트북에서 옮겨 둔 자리가
          작은 화면에서는 «창이 사라진 것» 이 된다. */
    /* ⚠️ 변수 이름을 W/H/L/T 로 쓰지 말 것 — 이 함수 맨 위의 헬퍼 `H`(=__tbfLibHelpers)를
       `var` 가 같은 칸에 덮어써서, 그 줄 «뒤쪽» 의 H.courseIcon 만 조용히 죽는다.
       (2026-08-20 실제로 밟음: H.naturalCmp 는 되는데 H.courseIcon 만 «함수가 아님») */
    var BOXK = 'mangoi_tbpv_box';
    var narrow = (window.innerWidth || 1024) < 700;
    var BW = Math.min(420, (window.innerWidth || 1024) - 24);
    var BH = Math.min(620, Math.round((window.innerHeight || 768) * 0.72));
    var BL = (window.innerWidth || 1024) - BW - 16;
    var BT = Math.max(12, Math.round(((window.innerHeight || 768) - BH) / 2));
    try {
      var sv = JSON.parse(localStorage.getItem(BOXK) || 'null');
      if (sv && sv.w > 200 && sv.h > 160) {
        BW = Math.min(sv.w, (window.innerWidth || 1024) - 16);
        BH = Math.min(sv.h, (window.innerHeight || 768) - 16);
        BL = Math.min(Math.max(0, sv.l), (window.innerWidth || 1024) - BW);
        BT = Math.min(Math.max(0, sv.t), (window.innerHeight || 768) - 60);
      }
    } catch(_){}
    if (narrow) { BW = (window.innerWidth || 360) - 12; BL = 6; BH = Math.round((window.innerHeight || 640) * 0.6); BT = (window.innerHeight || 640) - BH - 6; }

    var modal = document.createElement('div');
    modal.id = 'tbf-preview-modal';
    /* 배경 막(backdrop)이 없다 — 뒤 화면(수업·교재)이 보이고 클릭도 그대로 간다.
       그래서 이 창은 «자기 상자» 만 차지한다.
       ⚠️ z-index 가 왜 이렇게 큰가 — 홈 화면 오른아래의 「A.i 상담사」 위젯이
          #mangoi-widget / #mangoi-toggle 로 **2147483000** 을 쓴다. 10001 로 두면
          이 창이 «보이기는 하는데» 그 위젯과 겹친 줄은 클릭이 위젯에게 간다
          (2026-08-20 실측: 수업 밖에서 11·12·13번 줄이 그랬다. 수업 중에는 위젯이
           숨으므로 안 걸려서 «수업에서만 확인» 하면 못 본다).
          → 그 위젯 «바로 한 칸 위» 로만 올린다. 더 올리지 말 것 —
            #mg-fab-wrap(2147483200)·#vc-reconnect-banner(2147483646)는 이 창보다
            위에 있어야 한다(재연결 안내가 가려지면 수업이 끊긴 걸 모른다).
       ⚠️ 「열렸다」와 「보인다」와 「눌린다」는 다르다 — 고칠 때는 classList 말고
          document.elementsFromPoint 로 «맨 위에 무엇이 있나» 를 재라. */
    modal.style.cssText = 'position:fixed;z-index:2147483001;left:' + BL + 'px;top:' + BT + 'px;'
      + 'width:' + BW + 'px;height:' + BH + 'px;min-width:230px;min-height:170px;'
      + 'max-width:100vw;max-height:100vh;resize:both;overflow:hidden;'
      + 'background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,0.42);'
      + 'display:flex;flex-direction:column;'
      + 'font-family:MangoiHanSC,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';
    modal.innerHTML =
        '<div id="tbf-pv-head" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:8px;background:linear-gradient(135deg,#f8fafc,#eff6ff);cursor:move;user-select:none;touch-action:none;border-radius:14px 14px 0 0">' +
          '<div style="font-size:19px">' + H.courseIcon(book.publisher) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:900;color:#0f172a;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + H.esc(book.textbook) + '</div>' +
            '<div style="font-size:10.5px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + H.esc(book.publisher) + ' · ' + H.esc(book.level || '') + ' · ' + seqNo + T('쪽',' pages') + '</div>' +
          '</div>' +
          '<button id="tbf-pv-close" title="' + T('닫기','Close') + '" style="flex:0 0 auto;background:#fff;border:1px solid #cbd5e1;padding:5px 10px;border-radius:8px;cursor:pointer;font-weight:800;color:#475569">✕</button>' +
        '</div>' +
        '<div style="padding:5px 12px;font-size:10.5px;color:#64748b;border-bottom:1px solid #f1f5f9;background:#fafbfc">' +
          T('제목줄을 끌어 옮기고, 오른아래 모서리로 크기를 조절하세요. 페이지를 골라도 닫히지 않습니다.',
            'Drag the title bar to move, drag the bottom-right corner to resize. Picking a page keeps this open.') +
        '</div>' +
        '<div id="tbf-pv-body" style="padding:10px 12px;overflow-y:auto;flex:1;min-height:0">' + lessonsHtml + '</div>' +
        /* ↘ 크기조절 손잡이 자리 — 브라우저가 그리는 손잡이는 상자 «오른아래 모서리» 에
           찍히는데, 스크롤되는 목록이 거기까지 차지하면 손잡이를 못 잡는다.
           빈 띠를 한 줄 깔아 모서리를 비워 둔다. */
        '<div style="flex:0 0 auto;height:14px;background:linear-gradient(135deg,#f8fafc,#eff6ff);border-top:1px solid #f1f5f9;border-radius:0 0 14px 14px"></div>';

    document.body.appendChild(modal);

    var saveBox = function(){
      try {
        var r = modal.getBoundingClientRect();
        localStorage.setItem(BOXK, JSON.stringify({ l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }));
      } catch(_){}
    };
    document.getElementById('tbf-pv-close').addEventListener('click', function(){ saveBox(); modal.remove(); });

    /* 🖐 제목줄 끌어 옮기기 — pointer 이벤트 하나로 마우스·터치를 함께 받는다.
       ⚠️ setPointerCapture 를 쓴다. 안 쓰면 빠르게 끌 때 포인터가 창 밖으로 나가 «놓친다». */
    (function(){
      var head = document.getElementById('tbf-pv-head');
      if (!head) return;
      var dx = 0, dy = 0, on = false;
      head.addEventListener('pointerdown', function(e){
        if (e.target && e.target.id === 'tbf-pv-close') return;
        var r = modal.getBoundingClientRect();
        dx = e.clientX - r.left; dy = e.clientY - r.top; on = true;
        try { head.setPointerCapture(e.pointerId); } catch(_){}
        e.preventDefault();
      });
      head.addEventListener('pointermove', function(e){
        if (!on) return;
        var w = modal.offsetWidth, h = modal.offsetHeight;
        var l = Math.min(Math.max(0, e.clientX - dx), (window.innerWidth || 1024) - Math.min(w, window.innerWidth || 1024));
        var t = Math.min(Math.max(0, e.clientY - dy), (window.innerHeight || 768) - 44);   // 제목줄은 항상 잡을 수 있게
        modal.style.left = l + 'px'; modal.style.top = t + 'px';
      });
      var end = function(){ if (!on) return; on = false; saveBox(); };
      head.addEventListener('pointerup', end);
      head.addEventListener('pointercancel', end);
    })();

    // 크기 조절(resize:both)은 이벤트가 없다 → 창을 벗어난 첫 클릭·이동에서 저장한다
    modal.addEventListener('mouseleave', saveBox);

    /* ▶ 페이지 고르기 — **닫지 않는다.** 시퀀스는 한 번만 만들고 재사용한다
       (5,000장짜리 교재에서 매번 다시 만들면 클릭이 눈에 띄게 늦다). */
    var seqCache = null;
    var body = document.getElementById('tbf-pv-body');
    body.addEventListener('click', function(ev){
      var el = ev.target && ev.target.closest ? ev.target.closest('.tbf-pv-file') : null;
      if (!el) return;
      var fid = el.getAttribute('data-fid');
      if (!seqCache) seqCache = H.buildBookSequence(book);
      var seq = seqCache;
      if (!seq.length) { alert(T('파일을 찾을 수 없습니다.','No files found.')); return; }
      var idx = 0;
      for (var i = 0; i < seq.length; i++) { if (seq[i].id === fid) { idx = i; break; } }
      window._libSequence = seq;
      window._libSeqIdx = idx;
      // 지금 보고 있는 줄 표시 — 「어디까지 했더라」 를 창이 대신 기억해 준다
      body.querySelectorAll('.tbf-pv-file').forEach(function(n){
        n.style.background = '#f8fafc'; n.style.borderColor = '#e2e8f0'; n.style.fontWeight = '';
      });
      el.style.background = '#dbeafe'; el.style.borderColor = '#3b82f6'; el.style.fontWeight = '800';
      // 뒤 화면을 통째로 덮는 라이브러리 격자는 닫는다 — 그래야 고른 교재가 보인다
      H.closeLibrary();
      var f = seq[idx];
      if (window.selectFromTextbookLibrary) window.selectFromTextbookLibrary(f.id, f.url, f.kind, f.name);
    });
  
  };
})();
