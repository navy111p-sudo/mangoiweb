// ═══════════════════════════════════════════════════════════════
// idx-x3.js — index.html 인라인 추출 (3단계 36차, 2026-07-14)
//   외부 classic script, 전역 스코프 공유. VC·부팅 코드 아님(분류 후 추출).
//   원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  "use strict";
  var COURSE_ORDER = ['Phonics','MES','BTS','SIU','마스터3','마스터','Master'];
  var CATEGORY_ORDER = ['영어','중국어','일본어','기타'];
  var CATEGORY_ICON = { '영어':'🇬🇧', '중국어':'🇨🇳', '일본어':'🇯🇵', '기타':'📚' };
  function courseIcon(name){
    var n = (name || '').toLowerCase();
    if (n.indexOf('phonics') >= 0) return '🔤';
    if (n.indexOf('mes') >= 0) return '🎯';
    if (n.indexOf('bts') >= 0) return '🌟';
    if (n.indexOf('siu') >= 0) return '🦁';
    if (n.indexOf('마스터') >= 0 || n.indexOf('master') >= 0) return '🏆';
    return '📂';
  }
  function courseOrder(name){
    var n = (name || '').toLowerCase();
    for (var i = 0; i < COURSE_ORDER.length; i++) {
      if (n.indexOf(COURSE_ORDER[i].toLowerCase()) >= 0) return i;
    }
    return 99;
  }
  function catOrder(cat){
    var i = CATEGORY_ORDER.indexOf(cat);
    return i < 0 ? 99 : i;
  }
  function esc(s){
    return String(s || '').replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }
  function fileEmoji(kind){
    if (kind === 'pdf') return '📕';
    if (kind === 'image') return '🖼️';
    if (kind === 'video') return '🎬';
    if (kind === 'audio') return '🎵';
    return '📄';
  }

  window._libAllBooks = [];
  window._libFileMap = {};
  window._libCurrentCourse = null;
  window._libCurrentCategory = null;
  window._tbfUrlCache = window._tbfUrlCache || {};

  function _loadAllIDB(){
    return new Promise(function(resolve){
      var done = false;
      var to = setTimeout(function(){
        if (done) return; done = true;
        resolve({textbooks:[], files:{}, err:'timeout'});
      }, 5000);
      try {
        var req = indexedDB.open('mangoi-textbooks', 3);
        req.onupgradeneeded = function(e){
          var d = e.target.result;
          if (!d.objectStoreNames.contains('textbooks')) {
            var s = d.createObjectStore('textbooks', {keyPath:'id'});
            try { s.createIndex('publisher','publisher'); } catch(_){}
          }
          if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', {keyPath:'id'});
        };
        req.onsuccess = function(){
          var db = req.result;
          if (!db.objectStoreNames.contains('textbooks') || !db.objectStoreNames.contains('files')) {
            db.close();
            if (done) return; done = true; clearTimeout(to);
            resolve({textbooks:[], files:{}, err:'store_missing'}); return;
          }
          var tx = db.transaction(['textbooks','files'], 'readonly');
          var tbR = tx.objectStore('textbooks').getAll();
          var flR = tx.objectStore('files').getAll();
          var tbs = null, fls = null;
          function chk(){
            if (tbs === null || fls === null) return;
            var fm = {};
            fls.forEach(function(f){ fm[f.id] = f; });
            db.close();
            if (done) return; done = true; clearTimeout(to);
  window.selectFromTextbookLibrary = async function(id, url, kind, name) {
    console.log('[ph247] selectFromTextbookLibrary:', id, kind, name);
    // 🎬 교재(책)가 바뀔 때 1회만 예습/복습 동영상 자동 매칭·재생 (페이지 넘김엔 반복 안함)
    try {
      var _bm = String(name || '').match(/\[([^\]]+)\]/);   // 파일명 앞 "[교재명]" 추출
      var _bk = _bm ? _bm[1] : '';
      if (_bk && _bk !== window.__mangoiLastVideoBook) {
        window.__mangoiLastVideoBook = _bk;
        window.__mangoiCurrentBookId = _bk;
        if (window.mangoiPlayLessonVideo) window.mangoiPlayLessonVideo(_bk);
      }
    } catch(_) {}
    try {
      if (typeof window.vcSwitchTab === 'function') {
        try { window.vcSwitchTab('pdf'); } catch(_){}
      }
      if (typeof window.pdfLoad === 'function') {
        window.pdfCurrentId = 'lib_' + id;
        // ph258: 새 파일 띄울 때 zoom 100% reset (자동 fit)
        if (typeof window.pdfZoom !== 'undefined') window.pdfZoom = 1.0;
        await window.pdfLoad(url, kind);
        console.log('[ph247] pdfLoad OK');
      } else {
        console.warn('[ph247] pdfLoad missing, fallback');
        window.open(url, '_blank');
        return;
      }
      try {
        // fix (2026-06-01 v3) — 학생도 교재가 보이게:
        //   blob(로컬 IDB) 교재는 상대가 못 엶 → 즉석에서 서버(R2)에 업로드해 '서버 URL' 로 공유.
        var shareUrl = url;
        if (/^blob:/i.test(shareUrl)) {
          try {
            if (typeof window.showToast === 'function') window.showToast('📤 교재를 서버에 올리는 중…');
            var blob = await (await fetch(url)).blob();
            var ext = (kind === 'pdf' || (blob.type && blob.type.indexOf('pdf') >= 0)) ? 'pdf'
                      : ((blob.type && blob.type.indexOf('png') >= 0) ? 'png' : 'jpg');
            var fname = (name || 'textbook').replace(/[^\w가-힣.-]+/g, '_') + '.' + ext;
            var fd = new FormData();
            fd.append('pdf', blob, fname);
            var up = await fetch('/api/video-call/upload-pdf', { method: 'POST', body: fd });
            var uj = await up.json().catch(function(){ return {}; });
            if (up.ok && uj && uj.url) { shareUrl = uj.url; console.log('[ph247] blob→서버(공개) 업로드 OK:', shareUrl); }
            else { console.warn('[ph247] blob→서버 업로드 실패(' + up.status + ')', uj); }
          } catch(e) { console.warn('[ph247] blob 업로드 예외', e); }
        }
        // ★ 전용 전송 함수 — 지역 vcConn 을 직접 써서 확실히 전송 (window.vcConn 타이밍 무관)
        if (typeof window.vcShareTextbook === 'function') {
          window.vcShareTextbook('lib_' + id, shareUrl, kind, name);
        } else if (window.vcConn && typeof window.vcConn.send === 'function') {
          if (shareUrl && shareUrl.charAt(0) === '/') shareUrl = location.origin + shareUrl;
          window.vcConn.send({type:'pdf-share', data:{pdfId:'lib_'+id, url:shareUrl, currentPage:1, kind:kind, name:name}});
        }
      } catch(e) { console.warn('[ph247] 교재 공유 전송 실패', e); }
      if (typeof window.showToast === 'function') {
        try { window.showToast('📚 ' + (name || '교재 적용')); } catch(_){}
      }
    } catch(e) {
      console.error('[ph247] 교재 로딩 실패', e);
      alert('❌ 교재 로딩 실패: ' + (e.message || e));
    }
  };

            console.log('[ph245] IDB 교재', tbs.length, '· 파일', fls.length);
            resolve({textbooks:tbs, files:fm, err:null});
          }
          tbR.onsuccess = function(){ tbs = tbR.result || []; chk(); };
          tbR.onerror = function(){ tbs = []; chk(); };
          flR.onsuccess = function(){ fls = flR.result || []; chk(); };
          flR.onerror = function(){ fls = []; chk(); };
        };
        req.onerror = function(){
          if (done) return; done = true; clearTimeout(to);
          resolve({textbooks:[], files:{}, err:'open_failed'});
        };
        req.onblocked = function(){
          if (done) return; done = true; clearTimeout(to);
          resolve({textbooks:[], files:{}, err:'blocked'});
        };
      } catch(e){
        if (done) return; done = true; clearTimeout(to);
        resolve({textbooks:[], files:{}, err:'exception:' + e.message});
      }
    });
  }

  // fix (2026-06-01) — 서버(R2/D1) 저장 교재를 모든 기기(휴대폰 포함)에서 보이게.
  //   /api/textbook-files 의 name 은 "[교재] 레슨 / 파일" 형식 → 파싱해서 교재·레슨별로 묶음.
  //   (예전엔 파일 하나하나가 별도 카드로 떠서 정리가 안 됐음 + 사이드바 필터에 안 잡힘)
  function _srvGuessCategory(book){
    var b = (book || '').toLowerCase();
    if (/phonics|파닉스/.test(b)) return 'Phonics';
    if (/siu/.test(b)) return 'SIU';
    if (/bts/.test(b)) return 'BTS';
    if (/mes/.test(b)) return 'MES';
    if (/다락원|master|마스터/.test(b)) return '중국어';
    return '서버 교재';
  }
  function _serverFilesToBooks(items){
    var groups = {}; // book → { lessons: { lessonName: [fid,...] } }
    var files = {};
    (items || []).forEach(function(it){
      var fid = 'srv_' + it.id;
      var nm = it.name || ('교재 ' + it.id);
      var book = '서버 교재', lesson = '미분류', fileName = nm;
      var m = nm.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (m) {
        book = m[1].trim() || '서버 교재';
        var rest = m[2] || '';
        var slash = rest.indexOf('/');
        if (slash >= 0) { lesson = (rest.slice(0, slash).trim() || '미분류'); fileName = rest.slice(slash + 1).trim() || nm; }
        else { fileName = rest.trim() || nm; }
      }
      files[fid] = { id: fid, name: fileName, kind: it.kind || 'pdf', url: it.url, _remote: true };
      if (!groups[book]) groups[book] = {};
      if (!groups[book][lesson]) groups[book][lesson] = [];
      groups[book][lesson].push(fid);
    });
    var books = [];
    Object.keys(groups).forEach(function(book){
      var lessonsArr = Object.keys(groups[book]).map(function(ln){ return { name: ln, fileIds: groups[book][ln] }; });
      var total = 0; lessonsArr.forEach(function(l){ total += l.fileIds.length; });
      books.push({
        id: 'srvbook_' + book.replace(/[^a-zA-Z0-9가-힣]+/g, '_'),
        publisher: book,
        textbook: book,
        level: '',
        category: _srvGuessCategory(book),
        lessons: lessonsArr,
        totalFiles: total,
        createdAt: 0,
        _remote: true
      });
    });
    return { books: books, files: files };
  }

  function loadAll(){
    var idbP = _loadAllIDB();
    // fix (2026-06-02 v2) — 서버 교재는 '그룹 집계(?group=1)'로 전체 목록을 받음(38,000+ 파일이어도 모든 교재 표시).
    //   파일은 교재를 '열 때' 그 교재 것만 lazy 로드(?book=) → 빠르고 누락 없음.
    var srvP = fetch('/api/textbook-files?group=1', { cache: 'no-store' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .catch(function(){ return null; });
    return Promise.all([idbP, srvP]).then(function(arr){
      var idb = arr[0] || { textbooks: [], files: {}, err: null };
      var srv = arr[1];
      if (srv && srv.ok && srv.groups && srv.groups.length) {
        var books = srv.groups.map(function(g){
          var name = (g.book || '서버 교재').trim();
          return {
            id: 'srvbook_' + name.replace(/[^a-zA-Z0-9가-힣]+/g, '_'),
            publisher: name,
            textbook: name,
            level: g.level || '',
            category: _srvGuessCategory(name),
            lessons: [],            // 파일은 열 때 lazy 로드
            totalFiles: g.files || 0,
            createdAt: 0,
            _remote: true,
            _serverBook: name       // ← lazy 로드 키
          };
        });
        console.log('[srvmerge] 서버 교재(그룹)', books.length, '+ IDB 교재', (idb.textbooks||[]).length);
        return { textbooks: (idb.textbooks || []).concat(books), files: (idb.files || {}), err: idb.err };
      }
      return idb;
    });
  }

  // fix (2026-06-02) — 서버 교재의 파일을 '열 때' 그 교재 것만 불러와 lessons/_libFileMap 채움
  async function _ensureServerBookFiles(book){
    if (!book || !book._serverBook) return;
    if (book.lessons && book.lessons.length) return;  // 이미 로드됨
    var r = await fetch('/api/textbook-files?book=' + encodeURIComponent(book._serverBook) + '&limit=20000', { cache: 'no-store' });
    var d = await r.json().catch(function(){ return {}; });
    var items = (d && d.items) || [];
    var conv = _serverFilesToBooks(items);
    Object.keys(conv.files).forEach(function(k){ window._libFileMap[k] = conv.files[k]; });
    var matched = null;
    for (var i = 0; i < conv.books.length; i++) {
      if (conv.books[i].textbook === book._serverBook) { matched = conv.books[i]; break; }
    }
    if (!matched && conv.books.length) matched = conv.books[0];
    book.lessons = matched ? matched.lessons : [];
    console.log('[lazy] 서버 교재 파일 로드:', book._serverBook, '파일', items.length, '개');
    // 🎬 교재 열 때 예습/복습 동영상 자동 매칭·재생 (등록된 망고아이 비디오에서 교재명으로 매칭)
    try {
      window.__mangoiCurrentBookId = book._serverBook;
      if (window.mangoiPlayLessonVideo) window.mangoiPlayLessonVideo(book._serverBook);
    } catch(_) {}
  }

  window.openTextbookLibrary = function(){
    var m = document.getElementById('tbf-lib-modal');
    if (!m) { alert('교재 라이브러리 모달이 없습니다.'); return; }
    m.style.display = 'flex';
    window.loadTextbookLibrary();
  };
  window.closeTextbookLibrary = function(){
    var m = document.getElementById('tbf-lib-modal');
    if (m) m.style.display = 'none';
  };

  window.loadTextbookLibrary = async function(){
    var tree = document.getElementById('tbf-lib-tree');
    var grid = document.getElementById('tbf-lib-grid');
    if (!tree || !grid) return;
    tree.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:12px">📥 로딩 중…</div>';
    grid.innerHTML = '<div class="tbf-empty"><div class="tbf-empty-ico">📥</div><div class="tbf-empty-title">로딩 중…</div></div>';

    var res = await loadAll();
    window._libAllBooks = res.textbooks || [];
    window._libFileMap = res.files || {};

    if (window._libAllBooks.length === 0) {
      // ph252 + ph253: 시크릿 모드 자동 감지 + 명확한 안내
      var fileCount = Object.keys(window._libFileMap || {}).length;
      // ph253: 시크릿 모드 감지 — quota < 200MB 면 거의 확실히 private browsing
      var isPrivate = false;
      try {
        if (navigator.storage && navigator.storage.estimate) {
          var est = await navigator.storage.estimate();
          if (est.quota && est.quota < 200 * 1024 * 1024) isPrivate = true;
        }
      } catch(_){}
      var privateBanner = isPrivate
        ? '<div style="margin-bottom:14px;padding:14px 18px;background:linear-gradient(135deg,#fee2e2,#fecaca);border:1.5px solid #dc2626;border-radius:10px;color:#7f1d1d;font-size:13.5px;font-weight:700;line-height:1.6;text-align:left;max-width:520px;margin-left:auto;margin-right:auto">' +
            '<div style="font-size:15px;font-weight:900;margin-bottom:6px">🕶️ 시크릿/InPrivate 모드 감지됨</div>' +
            '시크릿 모드의 브라우저 저장소는 <b>일반 모드와 완전히 격리</b>됩니다.<br>' +
            '교재 업로더에서 저장한 교재가 여기서 안 보이는 이유입니다.<br><br>' +
            '<b>해결:</b> 일반 모드 (시크릿 X) 에서 양쪽 페이지를 모두 여세요.' +
          '</div>'
        : '';
      tree.innerHTML = '<div style="padding:18px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.6">📭 등록된 교재가 없습니다.<br><br><a href=\"/textbook-uploader.html\" target=\"_blank\" style=\"display:inline-block;padding:8px 16px;background:#3b82f6;color:#fff;border-radius:99px;text-decoration:none;font-size:11.5px;font-weight:800\">📚 업로더 열기</a></div>';
      grid.innerHTML = privateBanner +
        '<div class=\"tbf-empty\" style=\"padding:40px 24px\">' +
          '<div class=\"tbf-empty-ico\">📭</div>' +
          '<div class=\"tbf-empty-title\" style=\"font-size:16px;color:#0f172a\">아직 이 브라우저에 등록된 교재가 없습니다</div>' +
          '<div style=\"margin-top:14px;color:#64748b;font-size:13px;line-height:1.7;max-width:520px;margin-left:auto;margin-right:auto;text-align:left;padding:14px 18px;background:#fff;border:1px solid #e2e8f0;border-radius:10px\">' +
            '<div style=\"font-weight:700;color:#0f172a;margin-bottom:6px\">💡 교재가 보이지 않는 이유</div>' +
            '교재는 <b>이 브라우저의 로컬 저장소</b>에 보관됩니다.<br>다른 PC/브라우저에서 업로드한 교재는 보이지 않습니다.<br><br>' +
            '<b>해결 방법:</b><br>1. 아래 [업로더 열기] 클릭<br>2. 폴더 통째 드래그 → AI 자동 분류 → 2초 후 자동 저장<br>3. 이 모달에서 [새로고침] 클릭<br><br>' +
            '<div style=\"display:flex;gap:8px;margin-top:8px\">' +
              '<a href=\"/textbook-uploader.html\" target=\"_blank\" style=\"padding:10px 18px;background:linear-gradient(135deg,#3b82f6,#1d4ed8);color:#fff;border-radius:99px;text-decoration:none;font-size:13px;font-weight:800\">📚 업로더 열기</a>' +
              '<button onclick=\"loadTextbookLibrary()\" style=\"padding:10px 18px;background:#fff;color:#0f172a;border:1.5px solid #cbd5e1;border-radius:99px;cursor:pointer;font-size:13px;font-weight:800\">🔄 새로고침</button>' +
              '<button onclick=\"tbfDiagnostic()\" style=\"padding:10px 18px;background:#fef3c7;color:#78350f;border:1.5px solid #fbbf24;border-radius:99px;cursor:pointer;font-size:13px;font-weight:800\">🔬 진단</button>' +
            '</div>' +
          '</div>' +
          '<div style=\"margin-top:14px;font-size:10.5px;color:#94a3b8;font-family:monospace\">🔍 진단: textbooks=0, files=' + fileCount + ', 상태=' + (res.err || 'ok') + ' · DB=mangoi-textbooks v3</div>' +
        '</div>';
      return;
    }
    renderTree();
    if (!window._libCurrentCourse) renderCards(null, null);
    else renderCards(window._libCurrentCategory, window._libCurrentCourse);
  };

  function renderTree(){
    var tree = document.getElementById('tbf-lib-tree');
    var books = window._libAllBooks;
    var lvFilter = (document.getElementById('tbf-lib-level') || {}).value || '';
    var qFilter = ((document.getElementById('tbf-lib-search') || {}).value || '').trim().toLowerCase();

    var grouped = {};
    books.forEach(function(b){
      // ph264: lvFilter 가 교재(publisher) 필터로 동작
      if (lvFilter) {
        var pubHay = ((b.publisher || '') + ' ' + (b.textbook || '')).toLowerCase();
        if (pubHay.indexOf(lvFilter.toLowerCase()) < 0) return;
      }
      if (qFilter && ((b.textbook || '') + ' ' + (b.publisher || '')).toLowerCase().indexOf(qFilter) < 0) return;
      var cat = b.category || '기타';
      var pub = b.publisher || '미분류';
      if (!grouped[cat]) grouped[cat] = {};
      if (!grouped[cat][pub]) grouped[cat][pub] = 0;
      grouped[cat][pub]++;
    });

    var catKeys = Object.keys(grouped).sort(function(a, b){ return catOrder(a) - catOrder(b); });
    if (catKeys.length === 0) {
      tree.innerHTML = '<div style="padding:18px;text-align:center;color:#94a3b8;font-size:12px">🔍 검색 결과 없음</div>';
      return;
    }
    var html = '';
    var totalCount = 0;
    catKeys.forEach(function(c){ Object.keys(grouped[c]).forEach(function(p){ totalCount += grouped[c][p]; }); });
    var allActive = !window._libCurrentCourse;
    html += '<div class="tbf-course ' + (allActive ? 'active' : '') + '" data-cat="" data-course="" style="margin-bottom:10px;font-weight:800">';
    html += '<span class="tbf-course-icon">🏠</span><span>전체 교재</span><span class="tbf-course-count">' + totalCount + '</span></div>';

    catKeys.forEach(function(cat){
      var courses = grouped[cat];
      var courseKeys = Object.keys(courses).sort(function(a, b){
        var oa = courseOrder(a), ob = courseOrder(b);
        if (oa !== ob) return oa - ob;
        return a.localeCompare(b, 'ko');
      });
      var catTotal = 0; courseKeys.forEach(function(p){ catTotal += courses[p]; });
      html += '<div class="tbf-cat open" data-cat="' + esc(cat) + '">';
      html += '<div class="tbf-cat-head"><span class="tbf-cat-chev">▶</span>';
      html += '<span class="tbf-cat-icon">' + (CATEGORY_ICON[cat] || '📁') + '</span>';
      html += '<span>' + esc(cat) + '</span>';
      html += '<span class="tbf-cat-count">' + catTotal + '</span></div>';
      html += '<div class="tbf-courses">';
      courseKeys.forEach(function(pub){
        var active = (window._libCurrentCourse === pub && window._libCurrentCategory === cat);
        html += '<div class="tbf-course ' + (active ? 'active' : '') + '" data-cat="' + esc(cat) + '" data-course="' + esc(pub) + '">';
        html += '<span class="tbf-course-icon">' + courseIcon(pub) + '</span>';
        html += '<span>' + esc(pub) + '</span>';
        html += '<span class="tbf-course-count">' + courses[pub] + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    });
    tree.innerHTML = html;

    tree.querySelectorAll('.tbf-cat-head').forEach(function(h){
      h.addEventListener('click', function(){ h.parentNode.classList.toggle('open'); });
    });
    tree.querySelectorAll('.tbf-course').forEach(function(c){
      c.addEventListener('click', function(e){
        e.stopPropagation();
        var cat = c.getAttribute('data-cat') || null;
        var crs = c.getAttribute('data-course') || null;
        window._libCurrentCategory = cat;
        window._libCurrentCourse = crs;
        tree.querySelectorAll('.tbf-course').forEach(function(x){ x.classList.remove('active'); });
        c.classList.add('active');
        renderCards(cat, crs);
      });
    });
  }

  function renderCards(cat, course){
    var grid = document.getElementById('tbf-lib-grid');
    var titleEl = document.getElementById('tbf-main-title');
    var subEl = document.getElementById('tbf-main-sub');
    var books = window._libAllBooks.slice();
    var lvFilter = (document.getElementById('tbf-lib-level') || {}).value || '';
    var qFilter = ((document.getElementById('tbf-lib-search') || {}).value || '').trim().toLowerCase();

    // ph264: lvFilter 가 교재(publisher) 필터로 동작
    if (lvFilter) books = books.filter(function(b){
      var hay = ((b.publisher || '') + ' ' + (b.textbook || '')).toLowerCase();
      return hay.indexOf(lvFilter.toLowerCase()) >= 0;
    });
    if (qFilter) books = books.filter(function(b){ return ((b.textbook || '') + ' ' + (b.publisher || '')).toLowerCase().indexOf(qFilter) >= 0; });
    if (course) books = books.filter(function(b){ return b.publisher === course; });
    if (cat && !course) books = books.filter(function(b){ return (b.category || '기타') === cat; });

    if (course) {
      titleEl.textContent = courseIcon(course) + ' ' + course;
      subEl.textContent = (cat || '') + ' · ' + books.length + '개 교재';
    } else if (cat) {
      titleEl.textContent = (CATEGORY_ICON[cat] || '📁') + ' ' + cat;
      subEl.textContent = books.length + '개 교재';
    } else {
      titleEl.textContent = '🏠 전체 교재';
      subEl.textContent = '전체 ' + books.length + '개 교재';
    }

    if (books.length === 0) {
      grid.innerHTML = '<div class="tbf-empty" style="grid-column:1/-1"><div class="tbf-empty-ico">🔍</div><div class="tbf-empty-title">표시할 교재가 없습니다</div></div>';
      return;
    }

    var html = '';
    books.forEach(function(b){
      var totalFiles = b.totalFiles || 0;
      var lessonCount = (b.lessons || []).length;
      var firstFile = null;
      for (var li = 0; li < (b.lessons || []).length && !firstFile; li++) {
        var l = b.lessons[li];
        for (var fi = 0; fi < (l.fileIds || []).length; fi++) {
          var f = window._libFileMap[l.fileIds[fi]];
          if (f && (f.blob || f.url)) { firstFile = f; break; }
        }
      }
      var thumbHtml;
      if (firstFile && firstFile.kind === 'image') {
        var url = window._tbfUrlCache[firstFile.id] || (firstFile.blob ? URL.createObjectURL(firstFile.blob) : firstFile.url);
        window._tbfUrlCache[firstFile.id] = url;
        thumbHtml = '<div class="tbf-card-thumb"><img src="' + url + '" alt="' + esc(b.textbook) + '" /></div>';
      } else if (firstFile && firstFile.kind === 'pdf') {
        thumbHtml = '<div class="tbf-card-thumb" style="background:linear-gradient(135deg,#fee2e2,#fecaca)"><div class="tbf-card-emoji">📕</div></div>';
      } else {
        thumbHtml = '<div class="tbf-card-thumb"><div class="tbf-card-emoji">' + courseIcon(b.publisher) + '</div></div>';
      }
      var lvlChip = b.level ? '<span class="tbf-card-chip tbf-chip-lvl">' + esc(b.level) + '</span>' : '';
      var cntChip = '<span class="tbf-card-chip tbf-chip-cnt">📑 ' + lessonCount + '과 · 📄 ' + totalFiles + '</span>';
      html += '<div class="tbf-card" data-tb-id="' + esc(b.id) + '">';
      html += thumbHtml;
      html += '<div class="tbf-card-body">';
      html += '<div class="tbf-card-title">' + esc(b.textbook || '제목 없음') + '</div>';
      html += '<div class="tbf-card-meta">' + lvlChip + cntChip + '</div>';
      html += '</div>';
      html += '<div class="tbf-card-actions">';
      html += '<button class="tbf-act-apply" data-act="apply">📺 바로 수업 적용</button>';
      html += '<button class="tbf-act-preview" data-act="preview">👀 미리보기</button>';
      html += '</div>';
      html += '</div>';
    });
    grid.innerHTML = html;

    grid.querySelectorAll('.tbf-card').forEach(function(card){
      var tbId = card.getAttribute('data-tb-id');
      var book = window._libAllBooks.find(function(x){ return x.id === tbId; });
      if (!book) return;
      card.querySelectorAll('button').forEach(function(btn){
        btn.addEventListener('click', function(e){
          e.stopPropagation();
          var act = btn.getAttribute('data-act');
          if (act === 'apply') applyBookToClass(book);
          else if (act === 'preview') previewBook(book);
        });
      });
      card.addEventListener('click', function(){ applyBookToClass(book); });
    });
  }

  // ph250: 자연 정렬 (Slide1 < Slide2 < Slide10)
  function naturalCmp(a, b){
    return String(a||'').localeCompare(String(b||''), undefined, { numeric:true, sensitivity:'base' });
  }
  // 같은 book 의 모든 파일을 자연 정렬된 시퀀스로 (레슨 순서 → 파일 자연 정렬)
  function buildBookSequence(book){
    var seq = [];
    (book.lessons || []).slice().sort(function(a, b){ return naturalCmp(a.name, b.name); }).forEach(function(l){
      var lessonFiles = (l.fileIds || []).map(function(fid){
        var f = window._libFileMap[fid];
        if (!f || !(f.blob || f.url)) return null;
        return { id: fid, name: f.name || '', kind: f.kind, blob: f.blob, url: f.url, lessonName: l.name };
      }).filter(function(x){ return x && (x.kind === 'image' || x.kind === 'pdf'); });
      lessonFiles.sort(function(a, b){ return naturalCmp(a.name, b.name); });
      lessonFiles.forEach(function(x){
        var url = window._tbfUrlCache[x.id] || (x.blob ? URL.createObjectURL(x.blob) : x.url);
        window._tbfUrlCache[x.id] = url;
        seq.push({ id: x.id, url: url, kind: x.kind, name: '[' + book.textbook + '] ' + (x.lessonName || '') + ' / ' + x.name });
      });
    });
    return seq;
  }
  async function applyBookToClass(book){
    try {
      if (book && book._serverBook && !(book.lessons && book.lessons.length)) {
        try { if (typeof window.showToast === 'function') window.showToast('📥 교재 불러오는 중…'); } catch(_){}
        await _ensureServerBookFiles(book);
      }
    } catch(e) { alert('교재 파일 로드 실패: ' + (e.message || e)); return; }
    var seq = buildBookSequence(book);
    if (seq.length === 0) { alert('이 교재에 표시할 파일이 없습니다.'); return; }
    window._libSequence = seq;
    window._libSeqIdx = 0;
    console.log('[ph250] 시퀀스 모드 시작 — 총', seq.length, '개 파일 (자연 정렬)');
    closeTextbookLibrary();
    var first = seq[0];
    if (typeof window.selectFromTextbookLibrary === 'function') {
      window.selectFromTextbookLibrary(first.id, first.url, first.kind, first.name);
    } else {
      window.open(first.url, '_blank');
    }
  }
  async function previewBook(book){
    // 서버 교재면 파일을 먼저 lazy 로드
    if (book && book._serverBook && !(book.lessons && book.lessons.length)) {
      try { if (typeof window.showToast === 'function') window.showToast('📥 교재 불러오는 중…'); } catch(_){}
      try { await _ensureServerBookFiles(book); } catch(e) { alert('교재 파일 로드 실패: ' + (e.message || e)); return; }
    }
    var lessons = book.lessons || [];
    var modal = document.createElement('div');
    modal.id = 'tbf-preview-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;padding:14px';
    var lessonsHtml = '';
    if (lessons.length === 0) {
      lessonsHtml = '<div style="color:#94a3b8;text-align:center;padding:30px">레슨 정보가 없습니다.</div>';
    } else {
      // ph250: 레슨 자연 정렬 + 레슨 안의 파일도 자연 정렬
      lessons.slice().sort(function(a,b){ return naturalCmp(a.name, b.name); }).forEach(function(l){
        lessonsHtml += '<div style="margin-bottom:10px"><div style="font-weight:700;color:#1e40af;font-size:13px;margin-bottom:4px">📑 ' + esc(l.name) + '</div>';
        var sortedIds = (l.fileIds || []).slice().sort(function(a, b){
          var fa = window._libFileMap[a] || {};
          var fb = window._libFileMap[b] || {};
          return naturalCmp(fa.name || '', fb.name || '');
        });
        sortedIds.forEach(function(fid){
          var f = window._libFileMap[fid];
          if (!f) {
            lessonsHtml += '<div style="color:#94a3b8;padding:4px 8px">❓ 파일 없음</div>';
          } else {
            lessonsHtml += '<div class="tbf-pv-file" data-fid="' + esc(fid) + '" data-kind="' + esc(f.kind) + '" data-name="' + esc(f.name) + '" style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:#f8fafc;border-radius:6px;margin:3px 0;font-size:12px;cursor:pointer;border:1px solid #e2e8f0">' +
              '<span>' + fileEmoji(f.kind) + '</span>' +
              '<span style="flex:1;color:#334155;font-weight:600">' + esc(f.name) + '</span>' +
              '<span style="padding:3px 10px;background:#3b82f6;color:#fff;border-radius:99px;font-size:11px;font-weight:700">▶ 띄우기</span>' +
            '</div>';
          }
        });
        lessonsHtml += '</div>';
      });
    }
    modal.innerHTML =
      '<div style="background:#fff;border-radius:14px;width:min(640px,95vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden">' +
        '<div style="padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#f8fafc,#eff6ff)">' +
          '<div style="font-size:22px">' + courseIcon(book.publisher) + '</div>' +
          '<div style="flex:1">' +
            '<div style="font-weight:900;color:#0f172a;font-size:15px">' + esc(book.textbook) + '</div>' +
            '<div style="font-size:11.5px;color:#64748b">' + esc(book.publisher) + ' · ' + esc(book.level || '') + '</div>' +
          '</div>' +
          '<button id="tbf-pv-close" style="background:#fff;border:1px solid #cbd5e1;padding:6px 12px;border-radius:8px;cursor:pointer;font-weight:700">✕</button>' +
        '</div>' +
        '<div style="padding:14px 18px;overflow-y:auto;flex:1">' + lessonsHtml + '</div>' +
      '</div>';
    modal.addEventListener('click', function(e){ if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    document.getElementById('tbf-pv-close').addEventListener('click', function(){ modal.remove(); });
    // ph250: 미리보기에서 파일 클릭 시 — book 전체 시퀀스 만들어 그 파일부터 시작
    modal.querySelectorAll('.tbf-pv-file').forEach(function(el){
      el.addEventListener('click', function(){
        var fid = el.getAttribute('data-fid');
        var seq = buildBookSequence(book);
        var idx = 0;
        for (var i = 0; i < seq.length; i++) {
          if (seq[i].id === fid) { idx = i; break; }
        }
        if (seq.length === 0) { alert('파일을 찾을 수 없습니다.'); return; }
        window._libSequence = seq;
        window._libSeqIdx = idx;
        console.log('[ph250] 미리보기에서 시퀀스 시작 —', seq.length, '개 / 현재', idx + 1);
        modal.remove();
        closeTextbookLibrary();
        var f = seq[idx];
        if (window.selectFromTextbookLibrary) window.selectFromTextbookLibrary(f.id, f.url, f.kind, f.name);
      });
    });
  }

  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') {
      var pv = document.getElementById('tbf-preview-modal');
      if (pv) { pv.remove(); return; }
      var m = document.getElementById('tbf-lib-modal');
      if (m && m.style.display === 'flex') closeTextbookLibrary();
    }
  });

  // ph255: IDB raw 진단 — 사용자가 화면에서 직접 확인 가능
  window.tbfDiagnostic = async function(){
    var lines = ['🔬 IndexedDB 진단 결과', '─────────────────'];
    lines.push('현재 URL: ' + location.origin);
    lines.push('User-Agent: ' + navigator.userAgent.slice(0, 80));
    try {
      var dbs = await indexedDB.databases();
      lines.push('');
      lines.push('📦 모든 DB (' + dbs.length + '개):');
      for (var i = 0; i < dbs.length; i++) {
        lines.push('  • ' + dbs[i].name + ' (v' + dbs[i].version + ')');
      }
    } catch(e) { lines.push('❌ DB 목록 조회 실패: ' + e.message); }
    // mangoi-textbooks 직접 조회
    try {
      var r = await new Promise(function(resolve){
        var req = indexedDB.open('mangoi-textbooks');
        req.onsuccess = function(){ resolve({ok:true, db:req.result}); };
        req.onerror = function(){ resolve({ok:false, err:req.error}); };
        req.onblocked = function(){ resolve({ok:false, err:'blocked'}); };
        setTimeout(function(){ resolve({ok:false, err:'timeout'}); }, 3000);
      });
      lines.push('');
      lines.push('🗃 mangoi-textbooks 조회:');
      if (!r.ok) { lines.push('  ❌ ' + (r.err || 'unknown')); }
      else {
        var db = r.db;
        lines.push('  ✅ open OK · version=' + db.version);
        lines.push('  · stores=[' + Array.from(db.objectStoreNames).join(', ') + ']');
        if (db.objectStoreNames.contains('textbooks') && db.objectStoreNames.contains('files')) {
          var tx = db.transaction(['textbooks','files'], 'readonly');
          var tbCount = await new Promise(function(res){
            var cr = tx.objectStore('textbooks').count();
            cr.onsuccess = function(){ res(cr.result); };
            cr.onerror = function(){ res('?'); };
          });
          var flCount = await new Promise(function(res){
            var cr = tx.objectStore('files').count();
            cr.onsuccess = function(){ res(cr.result); };
            cr.onerror = function(){ res('?'); };
          });
          lines.push('  · textbooks count = ' + tbCount);
          lines.push('  · files count = ' + flCount);
        }
        db.close();
      }
    } catch(e) { lines.push('❌ 직접 조회 실패: ' + e.message); }
    // storage estimate
    try {
      if (navigator.storage && navigator.storage.estimate) {
        var est = await navigator.storage.estimate();
        lines.push('');
        lines.push('💾 Storage quota: ' + Math.round((est.quota||0)/1024/1024) + ' MB');
        lines.push('💾 Storage usage: ' + Math.round((est.usage||0)/1024/1024) + ' MB');
      }
    } catch(e){}
    var msg = lines.join('\n');
    console.log(msg);
    alert(msg);
  };

  // ph256: BroadcastChannel — textbook-uploader 가 저장하면 자동 reload
  try {
    var libBC = new BroadcastChannel('mangoi-textbooks-sync');
    libBC.onmessage = function(e) {
      console.log('[ph256] 다른 탭에서 교재 업데이트:', e.data);
      var modal = document.getElementById('tbf-lib-modal');
      if (modal && modal.style.display === 'flex') {
        console.log('[ph256] 라이브러리 모달 열려있음 → 자동 reload');
        if (typeof window.loadTextbookLibrary === 'function') {
          window.loadTextbookLibrary();
        }
      }
    };
  } catch(e) { console.warn('[ph256] BC 수신 설정 실패', e); }

      console.log('[ph245] 교재 라이브러리 모달 — split layout + 카드 그리드 로드');
})();
