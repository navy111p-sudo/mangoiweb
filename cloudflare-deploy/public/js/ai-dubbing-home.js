/* Start, resume and private work gallery. Playback/recording stays in the
 * existing player; this module never starts a microphone on page load. */
(function () {
  'use strict';
  var L = window.MangoiDubLibrary, adapter, view = 'movies', generation = 0, urls = [], catalogue = null, bulkJob = null;
  if (!L) return;
  var $ = function (id) { return document.getElementById(id); };
  function en() { try { return window.getLang && window.getLang() === 'en'; } catch (_) { return false; } }
  function t(ko, english) { return en() ? english : ko; }
  function node(tag, cls, text) { var el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
  function pair(value) { return value && typeof value === 'object' ? (en() ? value.en || value.ko : value.ko || value.en) : String(value || ''); }
  function status(text) { if ($('dub-library-status')) $('dub-library-status').textContent = text; }
  function message(error) { return L.errorText(error, !!en()); }
  function releaseUrls() { urls.splice(0).forEach(function (url) { URL.revokeObjectURL(url); }); }
  function clearItems() { bulkJob = null; releaseUrls(); if ($('dub-library-items')) $('dub-library-items').replaceChildren(); if ($('dub-library-bulk')) { $('dub-library-bulk').replaceChildren(); $('dub-library-bulk').hidden = true; } }
  function owned(owner) { return owner === L.identity(); }
  // Use the saved title so reopening a movie never picks up another group's name.
  function filenameStem(title) {
    var stem = String(title || 'dubbing').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
      .replace(/\s*·\s*/g, '_').replace(/\s+/g, '_').replace(/[. _]+$/g, '');
    return Array.from(stem || 'dubbing').slice(0, 100).join('');
  }
  function movieFilename(title, mime) {
    return 'mangoi-' + filenameStem(title) + (/mp4/.test(mime || '') ? '.mp4' : '.webm');
  }
  function button(text, action, cls) { var b = node('button', 'btn ' + (cls || ''), text); b.type = 'button'; b.addEventListener('click', action); return b; }
  function date(value) { var d = new Date(value); return isNaN(d.getTime()) ? '' : d.toLocaleString(en() ? 'en-US' : 'ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function movieGroup(movie) {
    var match = /^(.*?) · (?=에피소드 \d|Episode \d|처음부터 끝까지|Whole story)/.exec(String(movie.title || ''));
    return match ? match[1].trim() : '';
  }
  function searchKey(value) { return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function downloadError(text) { var error = new Error(); error.downloadText = text; return error; }
  var ZIP_MAX_BYTES = 512 * 1024 * 1024;
  function zipParts(entries) {
    var parts = [], part = [], size = 22;
    entries.forEach(function (entry) {
      // STORE adds headers, UTF-8 path fields and folder entries. Reserve space
      // for them so the generated ZIP, not just its video payload, stays bounded.
      var cost = entry.size + 1024 + new TextEncoder().encode(entry.path).length * 6;
      if (cost + 22 > ZIP_MAX_BYTES) throw downloadError(t('영상 하나가 ZIP 한도보다 커요. 해당 영상의 ‘영상 보기’ → ‘파일 내려받기’로 원본을 저장해 주세요.', 'One video exceeds the ZIP limit. Use Watch video → Download to save its original file.'));
      if (part.length && size + cost > ZIP_MAX_BYTES) { parts.push(part); part = []; size = 22; }
      part.push(entry); size += cost;
    });
    if (part.length) parts.push(part);
    return parts;
  }
  function groupDownload(group, section, c, selection) {
    var actions = node('div', 'dub-group-download'), note = node('p', 'dub-save-note'), partButtons = node('div', 'dub-zip-parts'), progressBox = node('div', 'dub-zip-progress');
    progressBox.hidden = true;
    note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
    var ready = node('a', 'btn', t('ZIP 다시 내려받기', 'Download ZIP again')); ready.hidden = true;
    var session = null, currentUrl = null;
    function valid(run) { return session === run && owned(c.owner) && catalogue === c && section.isConnected && actions.isConnected; }
    function forgetArchive() {
      ready.hidden = true; ready.removeAttribute('href');
      if (currentUrl) { URL.revokeObjectURL(currentUrl); urls = urls.filter(function (url) { return url !== currentUrl; }); currentUrl = null; }
    }
    function failed(e) { return e.downloadText || (e.status === 401 ? t('로그인 상태를 확인해 주세요.', 'Please check that you are signed in.') : t('영상 연결을 확인하고 다시 시도해 주세요.', 'Check your connection and try again.')); }
    function updateProgress(run, phase) {
      if (!valid(run) || !run.meter) return;
      if (phase) run.phase = phase;
      var total = run.parts.length, sent = run.requested.size, remaining = total - sent;
      run.meter.max = total; run.meter.value = sent;
      var count = t('다운로드 요청 ', 'Download requests: ') + sent + ' / ' + total + t('개', '');
      run.meter.setAttribute('aria-valuetext', count);
      var state = !run.busy && remaining === 0 ? t('모든 ZIP 다운로드 요청됨', 'All ZIP downloads requested') : run.paused ? (run.busy ? t('중단 중…', 'Stopping…') : t('중단됨', 'Paused'))
        : run.busy && run.currentIndex != null ? t('전체 ' + total + '개 중 ' + (run.currentIndex + 1) + '번째 ZIP', 'ZIP ' + (run.currentIndex + 1) + ' of ' + total) + ' · ' + run.phase
        : remaining === 0 ? t('모든 ZIP 다운로드 요청됨', 'All ZIP downloads requested') : t('남은 ZIP ', 'Remaining ZIPs: ') + remaining + t('개', '');
      run.summary.textContent = state + ' · ' + count;
      run.stopButton.hidden = !run.busy; run.stopButton.disabled = !run.busy || run.paused;
      run.resumeButton.hidden = remaining === 0 || (!run.paused && !run.failed);
      run.resumeButton.disabled = run.busy || remaining === 0;
    }
    function setupProgress(run) {
      progressBox.replaceChildren(); progressBox.hidden = false;
      run.summary = node('p', 'dub-zip-summary'); run.summary.setAttribute('role', 'status'); run.summary.setAttribute('aria-live', 'polite');
      run.meter = node('progress'); run.meter.setAttribute('aria-label', t('ZIP 다운로드 요청 진행 상황', 'ZIP download request progress'));
      var controls = node('div', 'row');
      run.stopButton = button(t('중단', 'Pause'), function () {
        if (!valid(run) || !run.busy) return;
        run.paused = true; updateProgress(run);
        note.textContent = t('중단을 요청했어요. 현재 준비 작업을 정리한 뒤 남은 ZIP만 이어받을 수 있어요. 이미 시작된 파일 저장은 브라우저에서 계속될 수 있어요.', 'Pause requested. Once the current preparation stops, resume only the remaining ZIPs. Downloads already started may continue in the browser.');
      });
      run.resumeButton = button(t('남은 ZIP 이어받기', 'Resume remaining ZIPs'), function () { return downloadAll(run, true); });
      controls.append(run.stopButton, run.resumeButton);
      progressBox.append(run.summary, run.meter, controls, node('p', 'dub-zip-help', t('이어받기는 이 보관함 화면을 그대로 열어 둔 동안 가능해요. 요청한 ZIP은 건너뛰며, 브라우저에서 차단된 파일은 번호별 버튼으로 다시 받으세요.', 'Resume while keeping this library view open. ZIPs already requested are skipped; retry browser-blocked files with their numbered buttons.')));
      updateProgress(run);
    }
    async function buildPart(run, index, queueTicket) {
      if (!valid(run)) return false;
      if (queueTicket && bulkJob !== queueTicket) return false;
      if (!queueTicket && bulkJob) { note.textContent = t('다른 ZIP을 준비 중이에요. 잠시 후 다시 눌러 주세요.', 'Another ZIP is being prepared. Please try again shortly.'); return; }
      var wasPaused = run.paused;
      if (!queueTicket) { run.paused = false; run.failed = false; run.busy = true; }
      run.currentIndex = index; updateProgress(run, t('영상 준비 중', 'Preparing videos'));
      var ticket = queueTicket || {}; bulkJob = ticket; start.disabled = true;
      var part = run.parts[index], control = run.buttons[index]; if (control) control.disabled = true;
      function current() { return bulkJob === ticket && valid(run) && !run.paused; }
      try {
        forgetArchive();
        var zip = new window.JSZip();
        for (var i = 0; i < part.length; i++) {
          if (!current()) return;
          var entry = part[i];
          updateProgress(run, t('영상 불러오는 중 ', 'Loading videos ') + (i + 1) + ' / ' + part.length);
          note.textContent = t('ZIP ', 'ZIP ') + (index + 1) + ' / ' + run.parts.length + t(' · 영상을 모으는 중… ', ' · Collecting videos… ') + (i + 1) + ' / ' + part.length + ' · ' + entry.name;
          var blob = entry.movie.blob || await L.getMovie(entry.movie.id);
          if (!current()) return;
          if (!(blob instanceof Blob) || !blob.size || blob.size !== entry.size) throw downloadError(t('영상 용량이 바뀌었거나 비어 있어요. 보관함을 새로고침한 뒤 다시 선택해 주세요.', 'A video changed size or is empty. Refresh the library and select it again.'));
          zip.file(entry.path, blob, { compression: 'STORE' });
        }
        updateProgress(run, t('ZIP 파일 만드는 중', 'Creating ZIP'));
        note.textContent = t('ZIP 파일을 만드는 중… ', 'Creating ZIP… ') + (index + 1) + ' / ' + run.parts.length;
        var archive = await zip.generateAsync({ type: 'blob', compression: 'STORE', streamFiles: true });
        if (!current()) return;
        if (archive.size > ZIP_MAX_BYTES) throw downloadError(t('ZIP 용량을 초과했어요. 모둠을 나누어 선택한 뒤 다시 시도해 주세요.', 'The ZIP exceeded the size limit. Select fewer groups and try again.'));
        currentUrl = URL.createObjectURL(archive); urls.push(currentUrl);
        ready.href = currentUrl; ready.download = run.filename.replace(/\.zip$/, run.parts.length > 1 ? '-part-' + String(index + 1).padStart(3, '0') + '.zip' : '.zip');
        ready.hidden = false; ready.click(); start.hidden = true;
        run.requested.add(index); updateProgress(run, t('다운로드 요청함', 'Download requested'));
        if (control) control.textContent = (index + 1) + t('번 ZIP 다시 내려받기', ' · Download ZIP again');
        note.textContent = run.parts.length > 1
          ? (index + 1) + ' / ' + run.parts.length + t('번 ZIP 내려받기를 시작했어요. 다운로드 폴더를 확인해 주세요. 차단되거나 빠진 파일은 번호별 버튼으로 다시 받을 수 있어요.', ' ZIP download started. Check Downloads. Use the numbered buttons to retry any blocked or missing file.')
          : t('ZIP 내려받기를 시작했어요. 다운로드 폴더를 확인하고, 시작되지 않으면 ‘ZIP 다시 내려받기’를 누르세요.', 'ZIP download started. Check Downloads, or choose Download ZIP again if it did not start.');
        return true;
      } catch (e) {
        if (current()) run.failed = true;
        if (current()) note.textContent = (index + 1) + ' / ' + run.parts.length + t('번 ZIP을 완료하지 못했어요. ', ' ZIP could not be completed. ') + failed(e) + (run.parts.length > 1 ? t(' 이 ZIP의 번호별 버튼으로 다시 시도해 주세요.', ' Retry using this ZIP’s numbered button.') : t(' 내려받기 버튼을 다시 눌러 시도해 주세요.', ' Press the download button to retry.'));
        return false;
      } finally {
        if (!queueTicket) {
          if (bulkJob === ticket) bulkJob = null;
          start.disabled = false; if (control) control.disabled = false;
          run.busy = false; run.paused = run.paused || wasPaused || run.requested.size < run.parts.length;
          updateProgress(run);
        }
      }
    }
    async function downloadAll(run, remainingOnly) {
      if (!valid(run)) return;
      if (bulkJob) { note.textContent = t('다른 ZIP을 준비 중이에요. 잠시 후 다시 눌러 주세요.', 'Another ZIP is being prepared. Please try again shortly.'); return; }
      var ticket = {}; bulkJob = ticket; start.disabled = true;
      if (!remainingOnly) run.requested.clear();
      run.paused = false; run.failed = false; run.busy = true; run.currentIndex = null; updateProgress(run);
      if (run.allButton) run.allButton.disabled = true;
      run.buttons.forEach(function (b) { b.disabled = true; });
      try {
        for (var index = 0; index < run.parts.length; index++) {
          if (!valid(run) || bulkJob !== ticket || run.paused) return;
          if (remainingOnly && run.requested.has(index)) continue;
          if (!await buildPart(run, index, ticket)) return;
          // Give the browser time to start this Blob download before releasing
          // its URL while preparing the next ZIP. Never build ZIPs concurrently.
          if (index + 1 < run.parts.length) await new Promise(function (resolve) { setTimeout(resolve, 250); });
        }
        if (valid(run) && bulkJob === ticket && !run.paused && run.parts.length > 1) note.textContent = run.parts.length + t('개 ZIP의 다운로드를 순서대로 요청했어요. 브라우저에서 차단 안내가 뜨면 ‘여러 파일 다운로드’를 허용해 주세요. 다운로드 폴더에서 모든 번호를 확인하고, 차단되거나 빠진 ZIP은 번호별 버튼으로 다시 받으세요.', ' ZIP download requests were sent in order. If your browser shows a blocking notice, allow multiple file downloads. Check Downloads for every part number and retry blocked or missing ZIPs with the numbered buttons.');
      } finally {
        if (bulkJob === ticket) bulkJob = null;
        start.disabled = false;
        if (run.allButton) run.allButton.disabled = false;
        run.buttons.forEach(function (b) { b.disabled = false; });
        run.busy = false; updateProgress(run);
        if (valid(run) && run.paused) note.textContent = t('중단했어요. ‘남은 ZIP 이어받기’를 누르면 다운로드를 요청하지 않은 ZIP부터 계속해요.', 'Paused. Resume remaining ZIPs continues with ZIPs not yet requested.');
      }
    }
    var start = button(selection ? t('선택한 모둠 내려받기 (ZIP)', 'Download selected groups (ZIP)') : t('모두 내려받기 (ZIP)', 'Download all (ZIP)'), async function () {
      if (!owned(c.owner) || catalogue !== c || !actions.isConnected) return;
      var groups = selection ? selection() : [group]; if (!groups.length) return;
      if (bulkJob) { note.textContent = t('다른 ZIP을 준비 중이에요. 잠시 후 다시 눌러 주세요.', 'Another ZIP is being prepared. Please try again shortly.'); return; }
      var run = { parts: [], buttons: [], requested: new Set(), busy: false, paused: false, failed: false }, ticket = {}; session = run; bulkJob = ticket; start.disabled = true;
      function current() { return bulkJob === ticket && valid(run) && !run.paused; }
      try {
        if (!window.JSZip) throw downloadError(t('ZIP 기능을 불러오지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요.', 'ZIP could not load. Refresh the page and try again.'));
        forgetArchive(); partButtons.replaceChildren(); progressBox.replaceChildren(); progressBox.hidden = true;
        var entries = [];
        groups.forEach(function (g, index) {
          var name = g.name || t('모둠 이름 없음', 'No group name');
          var folder = selection ? String(index + 1).padStart(3, '0') + '_' + filenameStem(name) + '/' : '';
          g.items.forEach(function (movie, ordinal) {
            var title = movieGroup(movie) ? movie.title : name + ' · ' + movie.title;
            entries.push({ movie: movie, name: name, folder: folder, ordinal: ordinal + 1, title: title });
          });
        });
        for (var i = 0; i < entries.length; i++) {
          if (!current()) return;
          var entry = entries[i], movie = entry.movie, size = movie.blob ? movie.blob.size : movie.size, mime = movie.mime || movie.blob && movie.blob.type;
          note.textContent = t('영상 용량을 확인하는 중… ', 'Checking video sizes… ') + (i + 1) + ' / ' + entries.length;
          // Current account metadata includes size. Legacy records are checked one
          // at a time; never keep every selected remote video in memory to plan parts.
          if (!Number.isSafeInteger(size) || size <= 0 || (!mime && !movie.blob)) {
            var probe = await L.getMovie(movie.id);
            if (!current()) return;
            size = probe.size; mime = mime || probe.type; probe = null;
          }
          if (!Number.isSafeInteger(size) || size <= 0) throw downloadError(t('비어 있는 영상이 있어요. ‘영상 보기’를 확인한 뒤 다시 시도해 주세요.', 'A video is empty. Check Watch video and try again.'));
          entry.size = size;
          entry.path = entry.folder + String(entry.ordinal).padStart(3, '0') + '_' + movieFilename(entry.title, mime);
        }
        run.parts = zipParts(entries);
        if (!selection && run.parts.length > 1) {
          entries.forEach(function (entry) { entry.path = '001_' + filenameStem(entry.name) + '/' + entry.path; });
          run.parts = zipParts(entries);
        }
        var archiveTitle = selection ? t('선택한 모둠 ' + groups.length + '개', groups.length + ' selected groups') : (group.name || t('모둠 이름 없음', 'No group name'));
        run.filename = movieFilename(archiveTitle + ' · ' + t('더빙영상', 'dubbing videos'), '').replace(/\.webm$/, '.zip');
        if (!current()) return;
        setupProgress(run);
        if (run.parts.length > 1) {
          partButtons.append(node('p', '', run.parts.length + t('개 ZIP을 순서대로 내려받아요. 차단되면 번호별 버튼으로 다시 받아 주세요. 각 ZIP은 최대 512MB예요.', ' ZIP files download in order. If blocked, retry with the numbered buttons. Each ZIP is at most 512MB.')));
          run.allButton = button(t('모두 내려받기', 'Download all'), function () { return downloadAll(run); });
          partButtons.append(run.allButton);
          run.parts.forEach(function (_, index) {
            var control = button((index + 1) + t('번 ZIP 내려받기', ' · Download ZIP'), function () { return buildPart(run, index); });
            run.buttons.push(control); partButtons.append(control);
          }); start.hidden = true;
        }
      } catch (e) {
        if (current()) note.textContent = t('모두 내려받기를 준비하지 못했어요. ', 'Could not prepare the download. ') + failed(e) + t(' 다시 눌러 시도할 수 있어요.', ' You can try again.');
        return;
      } finally {
        if (bulkJob === ticket) bulkJob = null;
        start.disabled = false;
      }
      if (valid(run)) await downloadAll(run);
    });
    start.disabled = !!selection && !selection().length;
    actions.append(start, ready, progressBox, partButtons, note); return actions;
  }
  function movieGroups(items) {
    var groups = new Map();
    items.forEach(function (item) { var name = movieGroup(item), key = searchKey(name); if (!groups.has(key)) groups.set(key, { key: key, name: name, items: [] }); groups.get(key).items.push(item); });
    return Array.from(groups.values()).sort(function (a, b) { return a.name && b.name ? a.name.localeCompare(b.name, en() ? 'en' : 'ko', { numeric: true }) : a.name ? -1 : b.name ? 1 : 0; });
  }
  function selectionBar(c, shownGroups) {
    var host = $('dub-library-bulk'); if (!host) return;
    host.hidden = false;
    var selected = function () { return c.groups.filter(function (g) { return c.selected.has(g.key); }); };
    var chosen = selected(), count = chosen.reduce(function (sum, g) { return sum + g.items.length; }, 0);
    var summary = node('p', 'dub-selection-summary', t('선택한 모둠 ', 'Selected groups: ') + chosen.length + t('개 · 영상 ', ' · Videos: ') + count + t('개', ''));
    summary.setAttribute('role', 'status'); host.append(summary);
    if (chosen.length) host.append(node('p', 'dub-selected-names', chosen.map(function (g) { return g.name || t('모둠 이름 없음', 'No group name'); }).join(', ')));
    var controls = node('div', 'row');
    c.selectShown = button(t('보이는 모둠 모두 선택', 'Select visible groups'), function () {
      if (catalogue !== c || !owned(c.owner)) return;
      shownGroups.forEach(function (g) { c.selected.add(g.key); }); drawCatalogue(); c.selectShown.focus();
    }); c.selectShown.disabled = !shownGroups.length;
    c.clearSelected = button(t('선택 해제', 'Clear selection'), function () {
      if (catalogue !== c || !owned(c.owner)) return;
      c.selected.clear(); drawCatalogue(); c.clearSelected.focus();
    }); c.clearSelected.disabled = !chosen.length;
    controls.append(c.selectShown, c.clearSelected); host.append(controls);
    host.append(node('p', 'dub-selection-help', t('모둠 이름 옆의 체크박스로 여러 모둠을 선택하세요. 검색해도 선택은 유지되며, ZIP 안에 모둠별 폴더로 저장돼요. 512MB를 넘으면 여러 ZIP으로 나눠 받아요.', 'Select groups using their checkboxes. Selections stay when you search. ZIP files keep a folder per group. Downloads over 512MB are split into multiple ZIP files.')));
    host.append(groupDownload(null, host, c, selected));
  }
  function drawCatalogue() {
    var c = catalogue;
    if (!c || !owned(c.owner) || c.kind !== view) return;
    clearItems();
    var box = $('dub-library-items'); if (!box) return;
    var query = c.kind === 'movies' && $('dub-library-search') ? searchKey($('dub-library-search').value) : '';
    var shown = c.items.filter(function (item) { return !query || searchKey(movieGroup(item) || t('모둠 이름 없음', 'No group name')).indexOf(query) >= 0; });
    var grouped = c.kind === 'movies' && $('dub-library-layout') && $('dub-library-layout').value === 'groups';
    box.classList.toggle('grouped', !!grouped);
    if (grouped) {
      c.groups = movieGroups(c.items); c.selected = c.selected || new Set(); c.selectionChecks = new Map();
      var groups = movieGroups(shown); selectionBar(c, groups);
      groups.forEach(function (group) {
        var section = node('section', 'dub-library-group');
        var title = node('h3', 'dub-library-group-title'), label = node('label', 'dub-group-select');
        var check = node('input'); check.type = 'checkbox'; check.checked = c.selected.has(group.key);
        check.setAttribute('aria-label', (group.name || t('모둠 이름 없음', 'No group name')) + t(' 선택', ' select'));
        check.addEventListener('change', function () {
          if (catalogue !== c || !owned(c.owner) || !section.isConnected) return;
          if (check.checked) c.selected.add(group.key); else c.selected.delete(group.key);
          drawCatalogue(); var next = c.selectionChecks.get(group.key); if (next) next.focus();
        }); c.selectionChecks.set(group.key, check);
        label.append(check, node('span', '', (group.name || t('모둠 이름 없음', 'No group name')) + ' · ' + group.items.length + t('개 영상', ' videos')));
        title.append(label); section.append(title);
        section.append(groupDownload(group, section, c));
        var grid = node('div', 'dub-library-items');
        group.items.forEach(function (item) { grid.append(movieCard(item, c.owner)); });
        section.append(grid); box.append(section);
      });
    } else shown.forEach(function (item) { box.append(c.kind === 'movies' ? movieCard(item, c.owner) : draftCard(item, c.owner)); });
    if (c.items.length && !shown.length) {
      var none = node('div', 'dub-library-no-match');
      none.append(node('p', '', t('이 모둠 이름으로 찾은 영상이 없어요.', 'No videos match this group name.')));
      none.append(button(t('검색 지우기', 'Clear search'), function () { $('dub-library-search').value = ''; drawCatalogue(); $('dub-library-search').focus(); }));
      box.append(none);
    }
    var empty = $('dub-library-empty'), emptyTitle = $('dub-empty-title');
    if (empty) empty.hidden = !!c.items.length || (!c.response && c.owner !== 'guest');
    if (emptyTitle) emptyTitle.textContent = c.kind === 'movies' ? t('아직 내 영상이 없어요', 'No videos yet') : t('이어할 연습이 없어요', 'No saved practice yet');
    var text;
    if (!c.response) text = message(c.error) + (c.items.length ? t(' 이 기기에 남은 항목을 보여드려요.', ' Showing items saved on this device.') : '');
    else if (!c.items.length) text = c.kind === 'movies' ? t('아직 보관한 영상이 없어요. 짧은 더빙부터 시작해 보세요.', 'No saved videos yet. Start with a short scene.') : t('하던 연습을 저장하면 이곳에서 계속할 수 있어요.', 'Save your practice to continue it here.');
    else text = c.kind === 'movies' ? t('보고 싶은 영상의 ‘영상 보기’를 누르세요.', 'Choose Watch video to open a recording.') : t('계속하고 싶은 연습의 ‘이 연습 이어하기’를 누르세요.', 'Choose Continue this practice to pick up where you left off.');
    if (c.kind === 'movies' && c.items.length) text += ' · ' + shown.length + ' / ' + c.items.length + t('개 영상', ' videos');
    status(text);
  }

  function render() {
    var b = $('dub-quick-start'), note = $('dub-quick-detail'), ep = adapter && adapter.episode();
    if (!b) return;
    var i = ep ? shortScene(ep) : -1;
    b.disabled = !ep || i < 0 || adapter.busy();
    if ($('dub-library-start')) $('dub-library-start').disabled = b.disabled;
    if (note && ep) {
      var sc = ep.scenes[i];
      note.textContent = sc ? t('모험 애니 · 장면 ' + sc.no, 'Adventure · Scene ' + sc.no)
        + (sc.durationSec ? ' · ' + Math.round(sc.durationSec) + t('초 영상', ' sec video') : '')
        + t(' · 전체 대사 ' + sc.lines.length + '줄', ' · ' + sc.lines.length + ' script lines') : t('연습할 영상을 준비하고 있어요', 'Getting a scene ready');
    }
  }
  function shortScene(ep) {
    var choices = ep.scenes.map(function (sc, i) { return { sc: sc, i: i }; }).filter(function (x) { return x.sc.video && x.sc.lines.length; });
    choices.sort(function (a, b) {
      var da = a.sc.durationSec || 0, db = b.sc.durationSec || 0;
      return da && db ? da - db || a.i - b.i : a.sc.lines.length - b.sc.lines.length || a.i - b.i;
    });
    return choices.length ? choices[0].i : -1;
  }
  function startShort() {
    if (!adapter || !adapter.episode() || adapter.busy()) return;
    var i = shortScene(adapter.episode());
    if (i >= 0) adapter.shortStart(i);
  }
  function openLibrary(nextView) {
    if (adapter && adapter.busy()) return;
    view = nextView === 'drafts' ? 'drafts' : 'movies';
    var panel = $('dub-library'); if (!panel) return;
    panel.hidden = false;
    Array.prototype.forEach.call(panel.querySelectorAll('[data-library-view]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-library-view') === view)); });
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return refresh();
  }
  async function refresh() {
    var owner = L.identity(), ticket = ++generation, kind = view;
    catalogue = null;
    if ($('dub-library-filters')) $('dub-library-filters').hidden = kind !== 'movies';
    clearItems(); status(t('내 보관함을 불러오는 중…', 'Loading your library…'));
    if ($('dub-library-empty')) $('dub-library-empty').hidden = true;
    var remote = kind === 'movies' ? L.listMovies() : L.listDrafts();
    var local = kind === 'movies' ? L.listLocalMovies() : L.listLocalDrafts();
    var results = await Promise.allSettled([remote, local]);
    if (ticket !== generation || !owned(owner)) return;
    var response = results[0].status === 'fulfilled' ? results[0].value : null;
    if (response && !Array.isArray(response[kind])) response = null;
    var locals = results[1].status === 'fulfilled' ? results[1].value : [];
    var items = response ? response[kind].slice() : [], byId = Object.create(null);
    items.forEach(function (item) { byId[item.id] = item; });
    locals.forEach(function (item) {
      if (kind === 'movies') {
        if (!byId[item.id]) items.push(Object.assign({}, item.meta, { id: item.id, local: true, blob: item.blob, createdAt: item.createdAt }));
      } else {
        var saved = byId[item.id];
        if (!saved || Number(item.updatedAt) > new Date(saved.updatedAt).getTime()) {
          if (saved) items.splice(items.indexOf(saved), 1);
          items.push(Object.assign({}, item.draft, { id: item.id, local: true, remote: !!saved, updatedAt: item.updatedAt }));
        }
      }
    });
    items.sort(function (a, b) { return new Date(b.createdAt || b.updatedAt).getTime() - new Date(a.createdAt || a.updatedAt).getTime(); });
    catalogue = { owner: owner, kind: kind, items: items, response: response, error: results[0].reason };
    drawCatalogue();
  }
  function movieCard(movie, owner) {
    var card = node('article', 'dub-library-card');
    card.append(node('span', 'dub-library-badge' + (movie.local ? ' local' : ''), movie.local ? t('이 기기에만 저장됨', 'Saved on this device only') : t('내 계정에 저장됨', 'Saved to my account')));
    card.append(node('h3', '', movie.title));
    card.append(node('p', '', date(movie.createdAt) + ' · ' + (movie.engine === 'studio' ? t('키키와 토토', 'Kiki & Toto') : t('모험 3D 애니', '3D Adventure')) + (movie.interrupted ? t(' · 중간에 멈춘 녹음', ' · Recording stopped partway') : '')));
    var player = node('video'); player.controls = true; player.playsInline = true; player.preload = 'metadata'; player.hidden = true; card.append(player);
    var actions = node('div', 'row'), download = node('a', 'btn', t('파일 내려받기', 'Download'));
    download.hidden = true; download.download = movieFilename(movie.title, movie.mime || movie.blob && movie.blob.type);
    var error = node('p', 'dub-save-note'); error.setAttribute('role', 'status');
    var play = button(t('영상 보기', 'Watch video'), async function () {
      play.disabled = true; error.textContent = t('영상을 불러오는 중…', 'Loading the movie…');
      try {
        var blob = movie.blob || await L.getMovie(movie.id);
        if (!owned(owner) || !card.isConnected) return;
        var url = URL.createObjectURL(blob); urls.push(url); player.src = url; player.hidden = false;
        download.href = url; download.hidden = false; play.hidden = true; error.textContent = '';
      } catch (e) { if (owned(owner)) error.textContent = message(e); }
      finally { play.disabled = false; }
    }, 'go');
    actions.append(play, download);
    if (movie.local && L.hasAccount()) actions.append(button(t('내 계정에도 저장하기', 'Save to my account'), async function (e) {
      if (!owned(owner)) return;
      var b = e.currentTarget; b.disabled = true;
      try { await L.saveMovie(movie.blob, { clientId: movie.id, engine: movie.engine, episodeId: movie.episodeId, title: movie.title, interrupted: !!movie.interrupted, durationMs: movie.durationMs || 0 }); if (owned(owner)) refresh(); }
      catch (err) { if (owned(owner)) error.textContent = message(err); }
      finally { b.disabled = false; }
    }));
    actions.append(button(t('삭제', 'Delete'), async function (e) {
      if (!owned(owner) || !confirm(t('「' + movie.title + '」을 보관함에서 삭제할까요? 필요한 영상은 먼저 내려받아 주세요.', 'Delete "' + movie.title + '" from your library? Download it first if you want to keep a copy.'))) return;
      var b = e.currentTarget; b.disabled = true;
      try { if (movie.local) await L.removeLocalMovie(movie.id); else await L.deleteMovie(movie.id); if (owned(owner)) refresh(); }
      catch (err) { if (owned(owner)) error.textContent = message(err); }
      finally { b.disabled = false; }
    }));
    card.append(actions, error); return card;
  }
  function draftCard(draft, owner) {
    var card = node('article', 'dub-library-card');
    card.append(node('span', 'dub-library-badge' + (draft.local ? ' local' : ''), draft.local ? t('이 기기에만 저장된 연습', 'Practice on this device only') : t('내 계정에 저장된 연습', 'Practice saved to my account')));
    card.append(node('h3', '', draft.title));
    card.append(node('p', '', date(draft.updatedAt)));
    card.append(node('p', '', draft.engine === 'studio' ? t('녹음한 대사는 그대로 두고, 남은 대사를 이어서 녹음해요.', 'Keep your recorded lines and record the remaining ones.') : t('이 장면부터 새 영상으로 녹음해요. 이전 영상은 ‘내 영상’에 남아요.', 'Record a new video from this scene. Your earlier video stays in My videos.')));
    var actions = node('div', 'row');
    actions.append(button(t('이 연습 이어하기', 'Continue this practice'), function () { if (owned(owner)) resume(draft.id, draft); }, 'go'));
    actions.append(button(t('연습 기록 삭제', 'Delete practice'), async function () {
      if (!owned(owner) || !confirm(t('이 연습 기록과 연결된 대사 녹음을 삭제할까요? 완성 작품은 보관함에 남아요.', 'Delete this practice and its linked line recordings? Finished movies remain in your library.'))) return;
      try {
        if (!draft.local || draft.remote) await L.deleteDraft(draft.id);
        else await L.removeLocalDraft(draft.id);
        if (owned(owner)) refresh();
      }
      catch (e) { if (owned(owner)) status(message(e)); }
    }));
    card.append(actions); return card;
  }
  async function resume(draftId, known) {
    if (!adapter || adapter.busy()) return;
    var owner = L.identity();
    try {
      var draft;
      if (known && known.local && known.state) draft = known;
      else {
        try { draft = (await L.getDraft(draftId)).draft; }
        catch (e) { var local = await L.getLocalDraft(draftId).catch(function () { return null; }); if (!local) throw e; draft = Object.assign({ id: draftId, local: true }, local.draft); }
      }
      if (!owned(owner)) return;
      if (!draft || !/^[a-z0-9-]{1,40}$/.test(draft.episodeId || '')) throw new Error('invalid_draft');
      if (draft.engine === 'studio') { location.href = '/ai-dubbing-studio.html?ep=' + encodeURIComponent(draft.episodeId) + '&resume=' + encodeURIComponent(draft.id); return; }
      if (draft.engine !== 'main') throw new Error('invalid_draft');
      if (!adapter.episode() || adapter.episode().id !== draft.episodeId) { location.href = '/ai-dubbing.html?ep=' + encodeURIComponent(draft.episodeId) + '&resume=' + encodeURIComponent(draft.id); return; }
      if (!adapter.restore(draft.state)) throw new Error('invalid_draft');
      var note = $('dub-resume-note'); if (note) { note.hidden = false; note.textContent = t('하던 연습을 불러왔어요. ‘이어 녹음 시작’을 누르면 이 장면부터 새 영상으로 녹음해요. 이전 영상은 ‘내 영상’에 남아요.', 'Your practice is ready. Continue recording from this scene into a new video. Earlier videos stay in My videos.'); }
      status(t('연습을 불러왔어요. 역할을 확인하고 시작해 주세요.', 'Practice restored. Check your roles, then start.'));
    } catch (e) { if (owned(owner)) { await openLibrary('drafts'); if (owned(owner)) status(t('연습을 불러오지 못했어요. ', 'Could not restore the practice. ') + message(e)); } }
  }
  function checkpoint(payload) {
    var owner = L.identity(), label = $('dub-draft-status');
    if (label) label.textContent = t('진행 위치 저장 중…', 'Saving your progress…');
    return L.saveDraft(payload.id, { engine: 'main', episodeId: payload.episodeId, title: payload.title, state: payload.state }).then(function () {
      if (owned(owner) && label) label.textContent = t('진행 위치가 계정에 저장됐어요.', 'Progress saved to your account.');
    }).catch(function (e) {
      if (owned(owner) && label) label.textContent = (e.localSaved ? t('진행 위치는 이 기기에 저장됐어요. ', 'Progress saved on this device. ') : '') + message(e);
    });
  }
  function saveMovie(movie, blob, episodeId) {
    var owner = movie.owner || L.identity();
    if (!owned(owner)) return Promise.resolve();
    movie.owner = owner; movie.blob = blob; movie.clientId = movie.clientId || L.newId(); movie.saveState = 'saving';
    if (adapter) adapter.moviesChanged();
    return L.saveMovie(blob, { clientId: movie.clientId, engine: 'main', episodeId: episodeId, title: movie.title, interrupted: !!movie.interrupted, durationMs: movie.durationMs || 0 }).then(function (result) {
      if (!owned(owner)) return;
      movie.saveState = 'saved'; movie.id = result.movie.id; movie.saveMessage = t('내 계정에 보관됐어요.', 'Saved to your account.');
    }).catch(function (e) {
      if (!owned(owner)) return;
      movie.saveState = 'error'; movie.saveMessage = (e.localSaved ? t('이 기기에 보관됐어요. ', 'Saved on this device. ') : t('파일을 내려받아 보관해 주세요. ', 'Download the file to keep it. ')) + message(e);
    }).then(function () { if (owned(owner) && adapter) adapter.moviesChanged(); });
  }
  function practice(results) {
    var panel = $('dub-next'), list = $('dub-next-lines');
    if (!panel || !list) return;
    var lines = [], seen = Object.create(null);
    (results || []).forEach(function (r) {
      if (!r.recorded || !r.line || !r.line.en || seen[r.line.en]) return;
      seen[r.line.en] = true; lines.push(r.line);
    });
    panel.hidden = !lines.length || !adapter || adapter.busy();
    list.replaceChildren(); lines.slice(0, 3).forEach(function (line) { list.append(node('li', '', line.en)); });
    var b = $('dub-practice-go'); if (b) b.onclick = function () {
      if (!adapter || adapter.busy() || !window.MangoiDubPractice) return;
      var ep = adapter.episode();
      var result = window.MangoiDubPractice.open({ episodeId: ep.id, title: ep.title, lines: lines });
      if (!result.ok) $('dub-practice-status').textContent = t('대화를 준비하지 못했어요. 대사를 복사해 AI 친구에게 말해 주세요.', 'Could not prepare the chat. Copy a line and try it with your AI friend.');
    };
  }
  function ready() {
    render();
    var q = new URLSearchParams(location.search), draftId = q.get('resume');
    if (draftId && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(draftId)) resume(draftId);
    else if (q.get('library') === 'movies' || q.get('library') === 'drafts') openLibrary(q.get('library'));
  }
  function init(value) {
    adapter = value;
    if ($('dub-menu')) $('dub-menu').addEventListener('click', function () { if (typeof window.mgDrawerToggle === 'function') window.mgDrawerToggle(); });
    if ($('dub-quick-start')) $('dub-quick-start').addEventListener('click', startShort);
    if ($('dub-library-start')) $('dub-library-start').addEventListener('click', startShort);
    if ($('dub-quick-resume')) $('dub-quick-resume').addEventListener('click', function () { openLibrary('drafts'); });
    if ($('dub-quick-library')) $('dub-quick-library').addEventListener('click', function () { openLibrary('movies'); });
    if ($('dub-library-refresh')) $('dub-library-refresh').addEventListener('click', refresh);
    if ($('dub-library-search')) $('dub-library-search').addEventListener('input', drawCatalogue);
    if ($('dub-library-layout')) $('dub-library-layout').addEventListener('change', drawCatalogue);
    if ($('dub-library-close')) $('dub-library-close').addEventListener('click', function () { $('dub-library').hidden = true; ++generation; catalogue = null; clearItems(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-library-view]'), function (b) { b.addEventListener('click', function () { openLibrary(b.getAttribute('data-library-view')); }); });
    L.onAccountChange(function () { ++generation; catalogue = null; clearItems(); if ($('dub-library-search')) $('dub-library-search').value = ''; status(t('계정이 바뀌었어요. 내 보관함을 다시 열어 주세요.', 'Your account changed. Reopen your library.')); adapter.accountChanged(); });
    window.addEventListener('mangoi:lang-changed', function () { render(); if ($('dub-library') && !$('dub-library').hidden) refresh(); });
    window.addEventListener('pagehide', releaseUrls);
    render();
  }
  window.MangoiDubHome = { init: init, ready: ready, render: render, checkpoint: checkpoint, saveMovie: saveMovie, practice: practice, openLibrary: openLibrary, movieFilename: movieFilename };
})();
