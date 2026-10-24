/* Start, resume and private work gallery. Playback/recording stays in the
 * existing player; this module never starts a microphone on page load. */
(function () {
  'use strict';
  var L = window.MangoiDubLibrary, adapter, view = 'movies', generation = 0, urls = [], catalogue = null, bulkJob = null, downloadPauses = [], uploadJob = null;
  if (!L) return;
  var $ = function (id) { return document.getElementById(id); };
  function en() { try { return window.getLang && window.getLang() === 'en'; } catch (_) { return false; } }
  function t(ko, english) { return en() ? english : ko; }
  function node(tag, cls, text) { var el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; }
  function pair(value) { return value && typeof value === 'object' ? (en() ? value.en || value.ko : value.ko || value.en) : String(value || ''); }
  function status(text) { if ($('dub-library-status')) $('dub-library-status').textContent = text; }
  function message(error) { return L.errorText(error, !!en()); }
  function releaseUrls() { urls.splice(0).forEach(function (url) { URL.revokeObjectURL(url); }); }
  function clearItems() { if ($('dub-library-upload')) { $('dub-library-upload').replaceChildren(); $('dub-library-upload').hidden = true; } downloadPauses.splice(0).forEach(function (pause) { pause(); }); bulkJob = null; releaseUrls(); if ($('dub-library-items')) $('dub-library-items').replaceChildren(); if ($('dub-library-bulk')) { $('dub-library-bulk').replaceChildren(); $('dub-library-bulk').hidden = true; } if ($('dub-library-downloads')) { $('dub-library-downloads').replaceChildren(); $('dub-library-downloads').hidden = true; } }
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
  var DOWNLOAD_KEY = 'mangoi_dub_downloads_v1:';
  function downloadKey(owner) { return DOWNLOAD_KEY + encodeURIComponent(owner); }
  function checkpointValid(record, owner) {
    try {
      if (!record || record.version !== 1 || record.owner !== owner || record.limit !== ZIP_MAX_BYTES || typeof record.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(record.id)) return false;
      if (typeof record.title !== 'string' || record.title.length > 500 || typeof record.filename !== 'string' || record.filename.length > 220 || !/^mangoi-.*\.zip$/.test(record.filename) || /[<>:"/\\|?*\u0000-\u001f]/.test(record.filename)) return false;
      if (!Number.isSafeInteger(record.updatedAt) || record.updatedAt <= 0) return false;
      if (!Array.isArray(record.parts) || !record.parts.length || record.parts.length > 1000 || !Array.isArray(record.requested) || record.requested.length > record.parts.length) return false;
      if (!record.requested.every(function (i) { return Number.isInteger(i) && i >= 0 && i < record.parts.length; }) || new Set(record.requested).size !== record.requested.length) return false;
      var count = 0, ids = new Set(), paths = new Set();
      return record.parts.every(function (part) {
        if (!Array.isArray(part) || !part.length || part.length > 2000) return false;
        if (zipParts(part).length !== 1) return false;
        return part.every(function (e) {
          if (++count > 2000 || !e || typeof e.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(e.id) || ids.has(e.id) || paths.has(e.path)) return false;
          ids.add(e.id); paths.add(e.path);
          if ((e.deviceOnly !== undefined && typeof e.deviceOnly !== 'boolean') || !Number.isSafeInteger(e.size) || e.size <= 0 || typeof e.title !== 'string' || e.title.length > 500 || typeof e.name !== 'string' || e.name.length > 500 || typeof e.mime !== 'string' || e.mime.length > 100 || typeof e.createdAt !== 'string' || e.createdAt.length > 80) return false;
          if (typeof e.path !== 'string' || e.path.length > 500 || !/\.(mp4|webm)$/.test(e.path)) return false;
          var segments = e.path.split('/');
          return segments.length <= 2 && segments.every(function (v) { return v && v !== '.' && v !== '..' && !/[<>:"\\|?*\u0000-\u001f]/.test(v) && !/[. ]$/.test(v) && /^\d{3,}_/.test(v); });
        });
      });
    } catch (_) { return false; }
  }
  function readDownloads(owner) {
    var raw = localStorage.getItem(downloadKey(owner));
    if (raw && raw.length > 2 * 1024 * 1024) throw new Error('download_history_too_large');
    var records = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(records) || records.length > 10) throw new Error('invalid_download_history');
    return records;
  }
  function downloadRecord(run, owner) {
    return { version: 1, owner: owner, id: run.id, limit: ZIP_MAX_BYTES, title: run.title, filename: run.filename, updatedAt: Date.now(), requested: Array.from(run.requested).sort(function (a, b) { return a - b; }), parts: run.parts.map(function (part) {
        return part.map(function (e) { if (e.checkpoint) return Object.assign({}, e.checkpoint); var m = e.movie; return { deviceOnly: !!m.local, id: m.id, title: m.title || '', size: e.size, mime: e.mime || '', createdAt: String(m.createdAt || ''), name: e.name, path: e.path }; });
      }) };
  }
  function writeDownload(run, owner) {
    try {
      if (!owned(owner)) return false;
      var record = Object.assign(downloadRecord(run, owner), { cloud: !!run.cloud });
      if (!checkpointValid(record, owner)) return false;
      var records = readDownloads(owner).filter(function (r) { return checkpointValid(r, owner) && r.id !== run.id; });
      // Keep unfinished jobs. Only old fully-requested jobs may be evicted.
      if (records.length >= 10) {
        var completed = records.findIndex(function (r) { return r.requested.length === r.parts.length; });
        if (completed < 0) return false;
        records.splice(completed, 1);
      }
      records.push(record); var json = JSON.stringify(records); if (json.length > 2 * 1024 * 1024) return false;
      localStorage.setItem(downloadKey(owner), json); return true;
    } catch (_) { return false; }
  }
  function checkpointParts(record, items) {
    var byId = new Map(); items.forEach(function (m) { byId.set(m.id, m); });
    return record.parts.map(function (part) { return part.map(function (e) {
      var movie = byId.get(e.id), size = movie && (movie.blob ? movie.blob.size : movie.size), mime = movie && (movie.mime || movie.blob && movie.blob.type);
      if (!movie || movie.title !== e.title || (Number.isSafeInteger(size) && size !== e.size) || (mime && e.mime && mime !== e.mime) || (!e.deviceOnly && e.createdAt && String(movie.createdAt || '') !== e.createdAt)) throw new Error('download_movie_changed');
      return { movie: movie, size: e.size, mime: e.mime, name: e.name, path: e.path, checkpoint: e };
    }); });
  }
  function mergeDownload(a, b) {
    // Part boundaries and paths are immutable. Never merge unrelated manifests.
    if (JSON.stringify(a.parts) !== JSON.stringify(b.parts) || a.filename !== b.filename || a.title !== b.title) return b;
    return Object.assign({}, b, { requested: Array.from(new Set(a.requested.concat(b.requested))).sort(function (x, y) { return x - y; }), cloud: !!(a.cloud || b.cloud) });
  }
  function putCatalogueDownload(c, record) {
    if (!owned(c.owner) || catalogue !== c) return;
    if (!c.downloads) { try { c.downloads = readDownloads(c.owner); } catch (_) { c.downloads = []; } }
    var previous = c.downloads.find(function (r) { return r.id === record.id; });
    c.downloads = c.downloads.filter(function (r) { return r.id !== record.id; });
    c.downloads.push(previous ? mergeDownload(previous, record) : record);
  }
  async function pullDownloads(c) {
    if (!L.listDownloads || !L.hasAccount()) return;
    var response = await L.listDownloads();
    if (!owned(c.owner) || catalogue !== c) return;
    if (!response || !Array.isArray(response.downloads) || response.downloads.length > 10 || !Array.isArray(response.removed)) throw new Error('invalid_download_response');
    var records = response.downloads.filter(function (r) { return checkpointValid(r, c.owner); }).map(function (r) { return Object.assign({}, r, { cloud: true }); });
    var locals = []; try { locals = readDownloads(c.owner); } catch (_) {}
    var deleted = new Set(response.removed);
    locals = locals.filter(function (r) { return checkpointValid(r, c.owner) && !deleted.has(r.id) && (!r.cloud || records.some(function (s) { return s.id === r.id; })); });
    // A local outbox recovers a connection loss or a tab closed just after click.
    for (var i = 0; i < locals.length; i++) {
      if (!owned(c.owner) || catalogue !== c) return;
      var local = locals[i], remote = records.find(function (r) { return r.id === local.id; }), merged = remote ? mergeDownload(local, remote) : local;
      if (!remote || merged.requested.length !== remote.requested.length) {
        try {
          var saved = await L.saveDownload(merged, c.owner);
          if (!owned(c.owner) || catalogue !== c) return;
          if (!saved || !checkpointValid(saved.download, c.owner)) throw new Error('invalid_download_response');
          merged = Object.assign({}, saved.download, { cloud: true });
        } catch (e) {
          if (!owned(c.owner) || catalogue !== c) return;
          if (e.code === 'download_deleted') { deleted.add(local.id); continue; }
          c.downloadSyncError = true;
        }
      }
      records = records.filter(function (r) { return r.id !== local.id; }); records.push(merged);
    }
    if (!owned(c.owner) || catalogue !== c) return;
    c.downloads = records;
    // Keep only existing local outbox entries; cloud-only histories need no
    // browser storage. Clearing a deleted job never deletes the original videos.
    try { localStorage.setItem(downloadKey(c.owner), JSON.stringify(locals.filter(function (r) { return !deleted.has(r.id); }).map(function (r) { return records.find(function (s) { return s.id === r.id; }) || r; }))); } catch (_) {}
  }
  function renderDownloads(c) {
    var host = $('dub-library-downloads'); if (!host || c.kind !== 'movies') return;
    var records;
    try { records = c.downloads || readDownloads(c.owner); }
    catch (_) { host.hidden = false; host.append(node('p', '', t('저장한 다운로드 진행 상황을 읽지 못했어요. 이 브라우저의 저장 설정을 확인해 주세요.', 'Saved download progress could not be read. Check this browser’s storage settings.'))); return; }
    if (c.downloadSyncError) { host.hidden = false; host.append(node('p', 'dub-save-note', t('계정의 다운로드 기록을 동기화하지 못했어요. 연결을 확인하고 보관함을 새로고침해 주세요. 다른 기기의 최신 기록은 아직 반영되지 않았어요.', 'Account progress could not sync. Check your connection and refresh the library. Progress from other devices is not yet included.'))); }
    if (!records.length) return;
    host.hidden = false; host.append(node('h3', '', t('저장한 다운로드', 'Saved downloads')));
    records.sort(function (a, b) { return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0); }).forEach(function (record) {
      if (!checkpointValid(record, c.owner)) { host.append(node('p', '', t('형식이 맞지 않는 다운로드 기록은 복원하지 않았어요.', 'An invalid download record was not restored.'))); return; }
      var card = node('details', 'dub-saved-download'); card.open = record.requested.length < record.parts.length;
      card.append(node('summary', '', record.title + ' · ' + t('요청 ', 'Requested ') + record.requested.length + ' / ' + record.parts.length + ' · ' + date(record.updatedAt)));
      card.append(node('p', 'dub-library-badge', record.cloud && !c.downloadSyncError ? t('계정에 동기화됨', 'Synced to your account') : t('이 브라우저에 저장됨', 'Saved in this browser')));
      try { checkpointParts(record, c.items); card.append(groupDownload(null, card, c, null, record)); }
      catch (_) { card.append(node('p', 'dub-save-note', t('원본 영상이 이 기기에서 보이지 않거나 변경되었어요. 원래 기기에서 영상의 ‘내 계정에도 저장하기’를 누른 뒤 이 보관함을 새로고침해 주세요. 삭제되거나 변경된 영상은 다시 선택해 주세요.', 'An original is unavailable here or changed. On the original device, choose Save to my account for the video, then refresh here. Reselect deleted or changed videos.'))); }
      card.append(button(t('다운로드 진행 기록 삭제', 'Remove download progress'), async function () {
        if (!owned(c.owner) || catalogue !== c) return;
        if (bulkJob) { status(t('다운로드를 중단한 뒤 진행 기록을 삭제해 주세요.', 'Pause the download before removing its progress.')); return; }
        try {
          if (L.deleteDownload && L.hasAccount()) await L.deleteDownload(record.id, c.owner);
          if (!owned(c.owner) || catalogue !== c) return;
          if (c.downloads) c.downloads = c.downloads.filter(function (r) { return r.id !== record.id; });
          try { localStorage.setItem(downloadKey(c.owner), JSON.stringify(readDownloads(c.owner).filter(function (r) { return r.id !== record.id; }))); } catch (_) {}
          drawCatalogue();
        }
        catch (_) { status(t('진행 기록을 삭제하지 못했어요. 연결을 확인하고 다시 시도해 주세요.', 'Could not remove the progress. Check browser storage settings.')); }
      }));
      host.append(card);
    });
  }
  function groupDownload(group, section, c, selection, restored) {
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
    function remember(run) {
      if (!valid(run)) return Promise.resolve();
      run.remembered = writeDownload(run, c.owner);
      var snapshot = downloadRecord(run, c.owner);
      putCatalogueDownload(c, Object.assign({}, snapshot, { cloud: !!run.cloud }));
      if (!L.saveDownload || !L.hasAccount()) return Promise.resolve();
      run.syncState = 'syncing'; updateProgress(run);
      run.saveQueue = (run.saveQueue || Promise.resolve()).then(async function () {
        if (!valid(run) || run.deleted) return;
        run.syncState = 'syncing'; updateProgress(run);
        try {
          var response = await L.saveDownload(snapshot, c.owner);
          if (!valid(run)) return;
          if (!response || !checkpointValid(response.download, c.owner)) throw new Error('invalid_download_response');
          response.download.requested.forEach(function (i) { run.requested.add(i); });
          run.cloud = true; run.syncState = 'saved'; run.remembered = writeDownload(run, c.owner);
          putCatalogueDownload(c, Object.assign(downloadRecord(run, c.owner), { cloud: true }));
        } catch (e) {
          if (!valid(run)) return;
          run.syncState = 'error'; run.syncErrorCode = e.code || '';
          if (e.code === 'download_deleted') { run.deleted = true; run.paused = true; }
        }
        updateProgress(run);
      });
      return run.saveQueue;
    }
    function updateProgress(run, phase, initial) {
      if ((!initial && !valid(run)) || !run.meter) return;
      if (phase) run.phase = phase;
      var total = run.parts.length, sent = run.requested.size, remaining = total - sent;
      run.meter.max = total; run.meter.value = sent;
      var count = t('다운로드 요청 ', 'Download requests: ') + sent + ' / ' + total + t('개', '');
      run.meter.setAttribute('aria-valuetext', count);
      var state = !run.busy && remaining === 0 ? t('모든 ZIP 다운로드 요청됨', 'All ZIP downloads requested') : run.paused ? (run.busy ? t('중단 중…', 'Stopping…') : t('중단됨', 'Paused'))
        : run.busy && run.currentIndex != null ? t('전체 ' + total + '개 중 ' + (run.currentIndex + 1) + '번째 ZIP', 'ZIP ' + (run.currentIndex + 1) + ' of ' + total) + ' · ' + run.phase
        : remaining === 0 ? t('모든 ZIP 다운로드 요청됨', 'All ZIP downloads requested') : t('남은 ZIP ', 'Remaining ZIPs: ') + remaining + t('개', '');
      run.summary.textContent = state + ' · ' + count;
      if (run.help) {
        var localOnly = run.parts.some(function (part) { return part.some(function (e) { return e.movie.local; }); });
        run.help.textContent = run.deleted ? t('다른 기기에서 이 진행 기록을 삭제했어요. 보관함을 새로고침해 주세요.', 'This progress was removed on another device. Refresh the library.')
          : run.syncState === 'syncing' ? t('계정에 진행 상황을 저장하는 중… 저장 완료 안내 후 화면을 닫아 주세요.', 'Saving progress to your account… Wait for confirmation before closing.')
          : run.syncState === 'saved' ? t('계정에 진행 상황을 저장했어요. 다른 컴퓨터·브라우저에서도 같은 계정으로 보관함을 열면 남은 ZIP만 이어받을 수 있어요.', 'Progress saved to your account. Open the library with the same account on another computer or browser to resume remaining ZIPs.')
          : run.syncState === 'error' && /limit/.test(run.syncErrorCode || '') ? t('계정의 다운로드 기록 저장 한도에 도달했어요. 완료한 진행 기록을 삭제한 뒤 보관함을 새로고침해 주세요. 원본 영상은 삭제되지 않아요.', 'Your account download history is full. Remove a completed progress record and refresh the library. Original videos are kept.')
          : run.syncState === 'error' ? t('계정 동기화에 실패했어요. 다른 기기에는 최신 기록이 없을 수 있어요. 연결 후 이 보관함을 새로고침해 주세요.', 'Account sync failed. Other devices may not have the latest progress. Reconnect and refresh this library.')
          : run.remembered ? t('이 기기·브라우저에 진행 상황을 기억해요. 같은 계정으로 보관함을 다시 열면 이어받을 수 있어요.', 'Progress is remembered in this browser. Reopen the library with the same account to resume.')
          : t('진행 상황을 저장하지 못했어요. 이 화면을 유지해 주세요.', 'Progress could not be saved. Keep this view open.');
        if (localOnly) run.help.textContent += t(' 이 기기에만 있는 원본은 먼저 ‘내 계정에도 저장하기’를 눌러야 다른 기기에서 받을 수 있어요.', ' Save device-only originals to your account before downloading them on another device.');
        run.help.textContent += t(' 요청한 ZIP은 건너뛰며, 실제 저장 여부는 다운로드 폴더에서 확인하세요. 차단된 파일은 번호별 버튼으로 다시 받으세요.', ' Requested ZIPs are skipped. Check Downloads for saved files; retry blocked files with their numbered buttons.');
      }
      run.stopButton.hidden = !run.busy; run.stopButton.disabled = !run.busy || run.paused;
      run.resumeButton.hidden = remaining === 0 || (!run.paused && !run.failed);
      run.resumeButton.disabled = run.busy || remaining === 0 || !!run.deleted;
    }
    function setupProgress(run) {
      progressBox.replaceChildren(); progressBox.hidden = false;
      run.summary = node('p', 'dub-zip-summary'); run.summary.setAttribute('role', 'status'); run.summary.setAttribute('aria-live', 'polite');
      run.meter = node('progress'); run.meter.setAttribute('aria-label', t('ZIP 다운로드 요청 진행 상황', 'ZIP download request progress'));
      var controls = node('div', 'row');
      run.stopButton = button(t('중단', 'Pause'), function () {
        if (!valid(run) || !run.busy) return;
        run.paused = true; remember(run); updateProgress(run);
        note.textContent = t('중단을 요청했어요. 현재 준비 작업을 정리한 뒤 남은 ZIP만 이어받을 수 있어요. 이미 시작된 파일 저장은 브라우저에서 계속될 수 있어요.', 'Pause requested. Once the current preparation stops, resume only the remaining ZIPs. Downloads already started may continue in the browser.');
      });
      run.resumeButton = button(t('남은 ZIP 이어받기', 'Resume remaining ZIPs'), function () { return downloadAll(run, true); });
      controls.append(run.stopButton, run.resumeButton);
      run.help = node('p', 'dub-zip-help');
      progressBox.append(run.summary, run.meter, controls, run.help);
      updateProgress(run, null, true);
    }
    async function buildPart(run, index, queueTicket) {
      if (!valid(run) || run.deleted) return false;
      if (queueTicket && bulkJob !== queueTicket) return false;
      if (uploadJob) { note.textContent = t('영상 저장을 마친 뒤 내려받아 주세요.', 'Download after video saving finishes.'); return; }
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
          if (entry.mime && blob.type && entry.mime !== blob.type) throw downloadError(t('영상 형식이 바뀌었어요. 영상을 다시 선택해 주세요.', 'The video format changed. Select the videos again.'));
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
        run.requested.add(index); await remember(run); if (!valid(run)) return false; updateProgress(run, t('다운로드 요청함', 'Download requested'));
        if (control) control.textContent = (index + 1) + t('번 ZIP 다시 내려받기', ' · Download ZIP again');
        note.textContent = run.parts.length > 1
          ? (index + 1) + ' / ' + run.parts.length + t('번 ZIP 내려받기를 시작했어요. 다운로드 폴더를 확인해 주세요. 차단되거나 빠진 파일은 번호별 버튼으로 다시 받을 수 있어요.', ' ZIP download started. Check Downloads. Use the numbered buttons to retry any blocked or missing file.')
          : t('ZIP 내려받기를 시작했어요. 다운로드 폴더를 확인하고, 시작되지 않으면 ‘ZIP 다시 내려받기’를 누르세요.', 'ZIP download started. Check Downloads, or choose Download ZIP again if it did not start.');
        return true;
      } catch (e) {
        if (current()) { run.failed = true; remember(run); }
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
      if (!valid(run) || run.deleted) return;
      if (uploadJob) { note.textContent = t('영상을 계정에 저장하는 중이에요. 저장을 마친 뒤 내려받아 주세요.', 'Videos are being saved to your account. Download after saving finishes.'); return; }
      if (bulkJob) { note.textContent = t('다른 ZIP을 준비 중이에요. 잠시 후 다시 눌러 주세요.', 'Another ZIP is being prepared. Please try again shortly.'); return; }
      var ticket = {}; bulkJob = ticket; start.disabled = true;
      if (remainingOnly && L.listDownloads && L.hasAccount()) {
        try {
          c.downloadSyncError = false; await pullDownloads(c);
          if (!valid(run) || bulkJob !== ticket) return;
          var latest = c.downloads && c.downloads.find(function (r) { return r.id === run.id; });
          if (!latest || c.downloadSyncError) throw new Error('download_sync');
          latest.requested.forEach(function (i) { run.requested.add(i); });
        } catch (_) {
          if (bulkJob === ticket) bulkJob = null;
          start.disabled = false; run.paused = true; run.syncState = 'error'; updateProgress(run);
          note.textContent = t('최신 진행 상황을 확인하지 못했어요. 연결을 확인한 뒤 이어받기를 다시 눌러 주세요.', 'Could not check the latest progress. Check your connection and retry resume.'); return;
        }
      }
      // Redownloading all keeps the cumulative request history; the server
      // merges request indices monotonically across devices.
      if (!valid(run) || bulkJob !== ticket) { if (bulkJob === ticket) bulkJob = null; return; }
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
    function setupPartButtons(run) {
      partButtons.replaceChildren();
      if (run.parts.length > 1) {
        partButtons.append(node('p', '', run.parts.length + t('개 ZIP을 순서대로 내려받아요. 차단되면 번호별 버튼으로 다시 받아 주세요. 각 ZIP은 최대 512MB예요.', ' ZIP files download in order. If blocked, retry with the numbered buttons. Each ZIP is at most 512MB.')));
        run.allButton = button(t('모두 내려받기', 'Download all'), function () { return downloadAll(run); }); partButtons.append(run.allButton);
        run.parts.forEach(function (_, index) {
          var control = button((index + 1) + (run.requested.has(index) ? t('번 ZIP 다시 내려받기', ' · Download ZIP again') : t('번 ZIP 내려받기', ' · Download ZIP')), function () { return buildPart(run, index); });
          run.buttons.push(control); partButtons.append(control);
        }); start.hidden = true;
      } else if (restored) {
        var control = button(t('1번 ZIP 다시 내려받기', '1 · Download ZIP again'), function () { return buildPart(run, 0); });
        run.buttons.push(control); partButtons.append(control);
      }
    }
    var start = button(selection ? t('선택한 모둠 내려받기 (ZIP)', 'Download selected groups (ZIP)') : t('모두 내려받기 (ZIP)', 'Download all (ZIP)'), async function () {
      if (!owned(c.owner) || catalogue !== c || !actions.isConnected) return;
      var groups = selection ? selection() : [group]; if (!groups.length) return;
      if (uploadJob) { note.textContent = t('영상을 계정에 저장하는 중이에요. 저장을 마친 뒤 내려받아 주세요.', 'Videos are being saved to your account. Download after saving finishes.'); return; }
      if (bulkJob) { note.textContent = t('다른 ZIP을 준비 중이에요. 잠시 후 다시 눌러 주세요.', 'Another ZIP is being prepared. Please try again shortly.'); return; }
      var run = { id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12), parts: [], buttons: [], requested: new Set(), busy: false, paused: false, failed: false }, ticket = {}; session = run; bulkJob = ticket; start.disabled = true;
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
          entry.size = size; entry.mime = mime || '';
          entry.path = entry.folder + String(entry.ordinal).padStart(3, '0') + '_' + movieFilename(entry.title, mime);
        }
        run.parts = zipParts(entries);
        if (!selection && run.parts.length > 1) {
          entries.forEach(function (entry) { entry.path = '001_' + filenameStem(entry.name) + '/' + entry.path; });
          run.parts = zipParts(entries);
        }
        var archiveTitle = selection ? t('선택한 모둠 ' + groups.length + '개', groups.length + ' selected groups') : (group.name || t('모둠 이름 없음', 'No group name'));
        run.title = archiveTitle;
        run.filename = movieFilename(archiveTitle + ' · ' + t('더빙영상', 'dubbing videos'), '').replace(/\.webm$/, '.zip');
        if (!current()) return;
        await remember(run); if (!current()) return; setupProgress(run); setupPartButtons(run);
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
    actions.append(start, ready, progressBox, partButtons, note);
    downloadPauses.push(function () { if (session && session.busy && valid(session)) { session.paused = true; remember(session); updateProgress(session); } });
    if (restored) {
      var run = { id: restored.id, title: restored.title, filename: restored.filename, parts: checkpointParts(restored, c.items), buttons: [], requested: new Set(restored.requested), busy: false, paused: true, failed: false, remembered: true, cloud: !!restored.cloud, syncState: restored.cloud ? 'saved' : null };
      session = run; start.hidden = true; setupProgress(run); setupPartButtons(run);
    }
    return actions;
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
  // Account-scoped, bounded metadata only. Original blobs stay in IndexedDB.
  // A single remembered queue can include later selections without losing work.
  var UPLOAD_KEY = 'mangoi_dub_uploads_v1:';
  function uploadKey(owner) { return UPLOAD_KEY + encodeURIComponent(owner); }
  function validUpload(r, owner) {
    if (!r || r.version !== 1 || r.owner !== owner || typeof r.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(r.id) || !Number.isSafeInteger(r.updatedAt) || r.updatedAt <= 0 || !Array.isArray(r.entries) || !r.entries.length || r.entries.length > 2000) return false;
    if (r.connections !== undefined && !validConnections(r.connections, r)) return false;
    var ids = new Set();
    return r.entries.every(function (e) {
      if (!e || typeof e.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(e.id) || ids.has(e.id)) return false;
      ids.add(e.id);
      return typeof e.title === 'string' && e.title.length <= 500 && Number.isSafeInteger(e.size) && e.size > 0 && typeof e.mime === 'string' && e.mime.length <= 100
        && typeof e.engine === 'string' && e.engine.length <= 20 && typeof e.episodeId === 'string' && e.episodeId.length <= 80
        && (e.sha256 === undefined || typeof e.sha256 === 'string' && /^[a-f0-9]{64}$/.test(e.sha256))
        && ['pending', 'saved', 'failed', 'missing', 'changed'].indexOf(e.state) >= 0 && typeof e.error === 'string' && e.error.length <= 1000;
    });
  }
  function readUpload(owner) {
    var raw = localStorage.getItem(uploadKey(owner)); if (!raw) return null;
    if (raw.length > 1024 * 1024) throw new Error('upload_history_too_large');
    var r = JSON.parse(raw); if (!validUpload(r, owner)) throw new Error('invalid_upload_history'); return r;
  }
  function uploadEntry(m) { return { id: m.id, title: m.title || '', size: m.blob.size, mime: m.blob.type || 'video/webm', engine: m.engine || '', episodeId: m.episodeId || '', state: 'pending', error: '', durationMs: m.durationMs || 0, interrupted: !!m.interrupted }; }
  function sameUpload(e, m) {
    return e.id === m.id && e.title === m.title && e.size === (m.blob ? m.blob.size : m.size) && e.mime === (m.blob ? m.blob.type || 'video/webm' : m.mime) && e.engine === (m.engine || '') && e.episodeId === (m.episodeId || '');
  }
  function rememberUpload(c, u) {
    if (!owned(c.owner) || !u.record) return false;
    try {
      var old = readUpload(c.owner), r = u.record;
      if ((!old && u.persistedId === r.id) || old && old.id !== r.id && old.id !== u.replaceId) throw new Error('upload_history_changed');
      if (old && old.id === r.id) {
        // Keep another tab's confirmed successes and extra queued originals.
        var map = new Map(old.entries.map(function (e) { return [e.id, e]; }));
        r.entries.forEach(function (e) {
          var prior = map.get(e.id);
          if (prior && !sameUpload(prior, { id: e.id, title: e.title, size: e.size, mime: e.mime, engine: e.engine, episodeId: e.episodeId })) throw new Error('upload_history_changed');
          map.set(e.id, prior && prior.state === 'saved' ? prior : e);
        }); r.entries = Array.from(map.values());
      }
      r.updatedAt = Date.now(); if (!validUpload(r, c.owner)) throw new Error('invalid_upload_history');
      var json = JSON.stringify(r); if (json.length > 1024 * 1024) throw new Error('upload_history_too_large');
      localStorage.setItem(uploadKey(c.owner), json); r.entries.forEach(function (e) { if (e.state === 'saved') u.selected.delete(e.id); }); u.replaceId = null; u.persistedId = r.id; u.remembered = true; return true;
    } catch (e) { u.remembered = false; if (e.message === 'upload_history_changed') { u.historyChanged = true; u.stopped = true; u.reason = t('진행 기록이 다른 화면에서 바뀌었어요. 보관함을 새로고침해 주세요.', 'Save progress changed in another view. Refresh the library.'); } return false; }
  }
  function reconcileUpload(c, u, response) {
    if (!u.record || !response || !Array.isArray(response.movies)) return;
    var remote = new Map(response.movies.map(function (m) { return [m.id, m]; }));
    var locals = new Map(c.items.filter(function (m) { return m.local; }).map(function (m) { return [m.id, m]; }));
    u.record.entries.forEach(function (e) {
      var saved = remote.get(e.id), local = locals.get(e.id);
      if (saved && sameUpload(e, saved)) { e.state = 'saved'; e.error = ''; u.selected.delete(e.id); }
      else if (e.state === 'saved') { u.selected.delete(e.id); }
      else if (saved || local && !sameUpload(e, local)) { e.state = 'changed'; e.error = t('원본 정보가 바뀌었어요. 영상을 확인한 뒤 진행 기록을 지우고 다시 선택해 주세요.', 'The original changed. Check it, remove the progress record, and select again.'); }
      else if (!local && !c.localError) { e.state = 'missing'; e.error = t('이 기기에 원본 영상이 없어요. 원래 기기·브라우저에서 보관함을 열거나 원본을 복원해 주세요.', 'The original is missing on this device. Open the library in the original browser or restore the original.'); }
      else if (local && (e.state === 'missing' || e.state === 'changed')) { e.state = 'pending'; e.error = ''; }
    });
    c.items = response.movies.slice().concat(Array.from(locals.values()).filter(function (m) { return !remote.has(m.id); })); c.response = response;
  }
  function uploadState(c) {
    if (!c.upload) {
      var u = c.upload = { selected: new Set(), results: new Map(), busy: false, stopped: false, total: 0, done: 0, saved: 0, failed: 0 };
      try {
        u.record = readUpload(c.owner); u.remembered = !!u.record; u.persistedId = u.record && u.record.id;
        if (u.record) {
          reconcileUpload(c, u, c.response);
          u.record.entries.forEach(function (e) { if (e.state !== 'saved' && c.items.some(function (m) { return m.local && sameUpload(e, m); })) u.selected.add(e.id); });
          rememberUpload(c, u);
        }
      } catch (_) { u.historyError = true; }
    }
    return c.upload;
  }
  function mergeUpload(a, b) {
    var entries = new Map(a.entries.map(function (e) { return [e.id, e]; }));
    b.entries.forEach(function (e) {
      var old = entries.get(e.id);
      if (old && (!sameUpload(old, e) || old.sha256 && e.sha256 && old.sha256 !== e.sha256)) throw new Error('upload_changed');
      entries.set(e.id, Object.assign({}, old, e, old && old.sha256 ? { sha256: old.sha256 } : {}, old && old.state === 'saved' ? { state: 'saved', error: '' } : old && e.state !== 'saved' ? { state: old.state, error: old.error } : {}));
    });
    return Object.assign({}, a, { entries: Array.from(entries.values()), updatedAt: Math.max(a.updatedAt, b.updatedAt), connections: mergeCloudConnections(a.connections, b.connections) });
  }
  async function syncUpload(c, u) {
    if (!L.saveUpload || !L.hasAccount() || !u.record || !uploadCurrent(c, u)) return;
    var snapshot = JSON.parse(JSON.stringify(u.record));
    if (snapshot.connections) {
      var delta = connectionPending(u, snapshot.connections);
      if (delta.rows.length || delta.removed.length) snapshot.connections = { version: 1, rows: delta.rows.slice(0, 25), removed: delta.removed.slice(0, Math.max(0, 25 - Math.min(25, delta.rows.length))) };
      else delete snapshot.connections;
    }
    try {
      var response = await L.saveUpload(snapshot, c.owner);
      if (!uploadCurrent(c, u) || !u.record || u.record.id !== snapshot.id) return;
      if (!validUpload(response.upload, c.owner) || response.upload.id !== snapshot.id || snapshot.connections && !response.upload.connections) throw new Error('invalid_upload');
      u.record = mergeUpload(u.record, response.upload); c.uploads = (c.uploads || []).filter(function (r) { return r.id !== u.record.id; }); c.uploads.push(response.upload);
      if (response.upload.connections) { u.connectionAckHistory = mergeCloudConnections(u.connectionAckHistory, response.upload.connections); u.connectionAck = connectionSignature(u.connectionAckHistory); applyCloudConnections(c, u, u.record.connections); }
      reconcileUpload(c, u, c.response); rememberUpload(c, u); u.cloudSaved = true; u.cloudError = false;
      if (snapshot.connections) { u.connectionCloudError = false; u.connectionCloudSaved = true; }
    } catch (e) {
      if (!uploadCurrent(c, u)) return;
      u.cloudSaved = false; u.cloudError = true; if (snapshot.connections) { u.connectionCloudError = true; u.connectionCloudSaved = false; }
      if (e.status === 410 || e.code === 'connections_changed' || e.code === 'upload_changed' || e.code === 'upload_expired') { u.historyChanged = true; u.stopped = true; u.reason = t('계정의 진행 기록이 삭제되거나 바뀌었어요. 보관함을 새로고침해 주세요.', 'Account save progress was removed or changed. Refresh the library.'); }
    }
  }
  async function pullUploads(c) {
    var response = await L.listUploads();
    if (catalogue !== c || !owned(c.owner)) return;
    if (!response || !Array.isArray(response.uploads) || !Array.isArray(response.removed) || response.uploads.some(function (r) { return !validUpload(r, c.owner); })) throw new Error('invalid_upload');
    c.uploads = response.uploads;
    var u = uploadState(c);
    if (u.record && response.removed.indexOf(u.record.id) >= 0) {
      if (uploadJob) { u.stopped = true; u.historyChanged = true; u.reason = t('계정에서 삭제된 진행 기록이에요. 보관함을 새로고침해 주세요.', 'This progress was removed from your account. Refresh the library.'); return; }
      localStorage.removeItem(connectionKey(c.owner, u.record.id)); localStorage.removeItem(uploadKey(c.owner)); u.record = null; u.persistedId = null; u.selected.clear();
    }
    var remote = u.record && c.uploads.find(function (r) { return r.id === u.record.id; });
    if (remote) u.record = mergeUpload(u.record, remote);
    if (!u.record && !u.historyError && c.uploads.length) {
      var candidates = c.uploads.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      u.record = candidates.find(function (r) { return r.entries.some(function (e) { return e.state !== 'saved'; }); }) || candidates[0];
      u.record = JSON.parse(JSON.stringify(u.record));
    }
    if (u.record) { restoreConnections(c, u); remote = c.uploads.find(function (r) { return r.id === u.record.id; }); if (remote && remote.connections) { u.connectionAckHistory = mergeCloudConnections(u.connectionAckHistory, remote.connections); u.connectionAck = connectionSignature(u.connectionAckHistory); } if (remote && remote.connections) applyCloudConnections(c, u, mergeCloudConnections(connectionWire(u), remote.connections)); reconcileUpload(c, u, c.response); rememberUpload(c, u); await syncUpload(c, u); }
  }
  async function originalHash(blob) {
    if (!blob || blob.size > 64 * 1024 * 1024 || !window.crypto || !window.crypto.subtle) throw new Error('original_hash_unavailable');
    var bytes = await blob.arrayBuffer(), hash = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash)).map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }
  function connectionId() { return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 15); }
  function validConnections(h, job) {
    if (!h || h.version !== 1 || !Array.isArray(h.rows) || h.rows.length > 2000 || !Array.isArray(h.removed) || h.removed.length > 4000) return false;
    var keys = new Set(), ids = new Set(job.entries.map(function (e) { return e.id; }));
    return h.removed.every(function (key) { return typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(key); }) && new Set(h.removed).size === h.removed.length && h.rows.every(function (r) {
      if (!r || typeof r.key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(r.key) || keys.has(r.key)) return false; keys.add(r.key);
      return Number.isSafeInteger(r.seq) && r.seq > 0 && typeof r.name === 'string' && r.name.length <= 1000 && ['pending','connected','duplicate','saved','empty','large','size','content','legacy','read','storage','stopped','lost','check'].indexOf(r.code) >= 0
        && Array.isArray(r.movieIds) && r.movieIds.length <= 2000 && new Set(r.movieIds).size === r.movieIds.length && r.movieIds.every(function (id) { return ids.has(id); })
        && (r.sha256 === undefined || typeof r.sha256 === 'string' && /^[a-f0-9]{64}$/.test(r.sha256));
    });
  }
  function mergeCloudConnections(a, b) {
    if (!a) return b; if (!b) return a;
    var removed = Array.from(new Set(a.removed.concat(b.removed))), rows = new Map();
    a.rows.concat(b.rows).forEach(function (r) { if (removed.indexOf(r.key) >= 0) return; var old = rows.get(r.key); if (old && old.seq === r.seq && JSON.stringify(old) !== JSON.stringify(r)) throw new Error('connections_changed'); if (!old || r.seq > old.seq) rows.set(r.key, r); });
    return { version: 1, rows: Array.from(rows.values()), removed: removed };
  }
  function connectionSignature(h) { return JSON.stringify({ rows: h.rows.slice().sort(function (a, b) { return a.key.localeCompare(b.key); }), removed: h.removed.slice().sort() }); }
  function connectionPending(u, wire) {
    var ack = u.connectionAckHistory || { rows: [], removed: [] }, rows = new Map(ack.rows.map(function (r) { return [r.key, r]; })), removed = new Set(ack.removed);
    return { rows: wire.rows.filter(function (r) { var old = rows.get(r.key); return !removed.has(r.key) && (!old || old.seq < r.seq || old.seq === r.seq && JSON.stringify(old) !== JSON.stringify(r)); }), removed: wire.removed.filter(function (key) { return !removed.has(key); }) };
  }
  async function retryConnectionSync(c, u) {
    if (!uploadCurrent(c, u) || !u.record || u.connectionSyncing || u.historyChanged) return;
    var jobId = u.record.id; u.connectionSyncing = true; u.connectionCloudError = false; drawCatalogue();
    try {
      var response = await L.listUploads();
      if (!uploadCurrent(c, u) || !u.record || u.record.id !== jobId) return;
      if (!response || !Array.isArray(response.uploads) || !Array.isArray(response.removed) || response.uploads.some(function (r) { return !validUpload(r, c.owner); })) throw new Error('invalid_upload');
      if (response.removed.indexOf(jobId) >= 0) { u.historyChanged = true; throw new Error('upload_removed'); }
      var remote = response.uploads.find(function (r) { return r.id === jobId; });
      if (remote) {
        u.record = mergeUpload(u.record, remote);
        if (remote.connections) { u.connectionAckHistory = mergeCloudConnections(u.connectionAckHistory, remote.connections); u.connectionAck = connectionSignature(u.connectionAckHistory); applyCloudConnections(c, u, u.record.connections); }
      }
    } catch (_) { if (uploadCurrent(c, u) && u.record && u.record.id === jobId) u.connectionCloudError = true; }
    finally { u.connectionSyncing = false; }
    if (!uploadCurrent(c, u) || !u.record || u.record.id !== jobId) return;
    if (!u.connectionCloudError) return queueConnectionSync(c, u);
    drawCatalogue();
  }
  function connectionWire(u) {
    return { version: 1, rows: (u.connectionResults || []).map(function (r) {
      var data = { key: r.key, name: r.name, code: r.outcome || r.code, movieIds: r.movieIds || [], ...(r.sha256 ? { sha256: r.sha256 } : {}) }, sig = JSON.stringify(data);
      if (r.wireSig && r.wireSig !== sig) r.seq++; r.wireSig = sig; r.seq = r.seq || 1;
      return { key: data.key, seq: r.seq, name: data.name, code: data.code, movieIds: data.movieIds, ...(data.sha256 ? { sha256: data.sha256 } : {}) };
    }), removed: u.connectionRemoved || [] };
  }
  function applyCloudConnections(c, u, history) {
    if (!history || !uploadCurrent(c, u) || !u.record || !validConnections(history, u.record)) return;
    var previous = new Map((u.connectionResults || []).map(function (r) { return [r.key, r]; }));
    u.connectionResults = history.rows.filter(function (r) { return history.removed.indexOf(r.key) < 0; }).map(function (r) {
      var old = previous.get(r.key); if (old && u.connecting && old.seq >= r.seq) return old;
      var row = Object.assign(old || {}, r, { id: old ? old.id : ++u.connectionSeq, outcome: r.code, titles: [] });
      row.wireSig = JSON.stringify({ key: row.key, name: row.name, code: row.outcome, movieIds: row.movieIds, ...(row.sha256 ? { sha256: row.sha256 } : {}) }); return row;
    });
    u.connectionRemoved = history.removed.slice(); u.connectionRecordId = u.record.id; u.record.connections = history;
    if (!u.connecting) reconcileConnections(c, u); saveConnections(c, u, true);
  }
  function queueConnectionSync(c, u) {
    if (!L.saveUpload || !L.hasAccount() || !uploadCurrent(c, u) || !u.record || u.historyChanged) return Promise.resolve();
    if (u.connectionSyncing) return u.connectionPromise;
    var jobId = u.record.id; u.connectionSyncing = true; u.connectionCloudError = false;
    u.connectionPromise = (async function () {
      try {
        while (uploadCurrent(c, u) && u.record && u.record.id === jobId) {
          var wire = connectionWire(u), pending = connectionPending(u, wire); if (!pending.rows.length && !pending.removed.length) { u.connectionCloudSaved = true; break; }
          u.record.connections = wire; drawCatalogue(); await syncUpload(c, u);
          if (uploadCurrent(c, u)) drawCatalogue();
          if (!uploadCurrent(c, u) || u.historyChanged || !u.cloudSaved) break;
        }
      } catch (_) { u.connectionCloudError = true; u.connectionCloudSaved = false; }
      finally { u.connectionSyncing = false; if (uploadCurrent(c, u)) { drawCatalogue(); if (u.record && u.record.id !== jobId) queueConnectionSync(c, u); } }
    })(); return u.connectionPromise;
  }
  var CONNECTION_KEY = 'mangoi_dub_connections_v1:';
  function connectionKey(owner, jobId) { return CONNECTION_KEY + encodeURIComponent(owner) + ':' + jobId; }
  function connectionRetry(r) { return ['connected', 'duplicate', 'saved', 'pending'].indexOf(r.code) < 0; }
  function saveConnections(c, u, fromCloud) {
    if (!uploadCurrent(c, u) || !u.record || u.connectionRecordId !== u.record.id) return;
    try {
      var wire = connectionWire(u); u.record.connections = wire;
      var rows = wire.rows.map(function (r) { var local = u.connectionResults.find(function (e) { return e.key === r.key; }); return Object.assign({ id: local.id }, r); });
      var raw = JSON.stringify({ version: 1, owner: c.owner, jobId: u.record.id, rows: rows, removed: wire.removed });
      if (rows.length > 2000 || raw.length > 1024 * 1024) throw new Error('connection_history_limit');
      localStorage.setItem(connectionKey(c.owner, u.record.id), raw); u.connectionRemembered = true; u.connectionHistoryError = false;
    } catch (_) { u.connectionRemembered = false; }
    if (!fromCloud && (u.connectionResults || []).length) { queueConnectionSync(c, u); }
  }
  function reconcileConnections(c, u) {
    var entries = new Map(u.record.entries.map(function (e) { return [e.id, e]; }));
    (u.connectionResults || []).forEach(function (r) {
      var matches = (r.movieIds || []).map(function (id) { return entries.get(id); }).filter(Boolean);
      if (!matches.length && r.code === 'pending' && r.sha256) matches = u.record.entries.filter(function (e) { return e.sha256 === r.sha256; });
      r.titles = matches.filter(function (e) { return e.state === 'saved' || c.items.some(function (m) { return m.local && sameUpload(e, m); }); }).map(function (e) { return e.title; });
      var available = matches.length && matches.every(function (e) { return e.state === 'saved' || c.items.some(function (m) { return m.local && sameUpload(e, m); }); });
      if (available) r.code = matches.every(function (e) { return e.state === 'saved'; }) ? 'saved' : r.outcome === 'duplicate' ? 'duplicate' : 'connected';
      else if (['connected', 'duplicate', 'saved', 'pending'].indexOf(r.code) >= 0) r.code = c.localError ? 'check' : r.code === 'pending' ? 'stopped' : 'lost';
    });
  }
  function restoreConnections(c, u) {
    if (!u.record || u.connectionRecordId === u.record.id) return;
    u.connectionRecordId = u.record.id; u.connectionResults = []; u.connectionSeq = 0; u.connectionOnlyFailed = true; u.connectionRemembered = true; u.connectionHistoryError = false; u.connectionRemoved = []; u.connectionAck = null; u.connectionAckHistory = null; u.connectionCloudSaved = false; u.connectionCloudError = false;
    try {
      var raw = localStorage.getItem(connectionKey(c.owner, u.record.id)); if (!raw) { if (u.record.connections) applyCloudConnections(c, u, u.record.connections); return; }
      if (raw.length > 1024 * 1024) throw new Error('connection_history_limit');
      var saved = JSON.parse(raw), ids = new Set(), movieIds = new Set(u.record.entries.map(function (e) { return e.id; }));
      if (!saved || saved.version !== 1 || saved.owner !== c.owner || saved.jobId !== u.record.id || !Array.isArray(saved.rows) || saved.rows.length > 2000) throw new Error('invalid_connection_history');
      if (saved.removed !== undefined && (!Array.isArray(saved.removed) || saved.removed.length > 4000 || saved.removed.some(function (key) { return typeof key !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(key); }))) throw new Error('invalid_connection_history');
      u.connectionRemoved = saved.removed || [];
      u.connectionResults = saved.rows.map(function (r) {
        if (!r || !Number.isSafeInteger(r.id) || r.id <= 0 || ids.has(r.id) || typeof r.name !== 'string' || r.name.length > 1000
          || ['pending', 'connected', 'duplicate', 'saved', 'empty', 'large', 'size', 'content', 'legacy', 'read', 'storage', 'stopped', 'lost', 'check'].indexOf(r.code) < 0
          || !Array.isArray(r.movieIds) || r.movieIds.length > 2000 || new Set(r.movieIds).size !== r.movieIds.length || r.movieIds.some(function (id) { return !movieIds.has(id); })
          || r.sha256 !== undefined && (typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256))) throw new Error('invalid_connection_history');
        ids.add(r.id); u.connectionSeq = Math.max(u.connectionSeq, r.id);
        return { id: r.id, key: r.key || 'legacy-' + u.record.id.slice(-48) + '-' + r.id, seq: r.seq || 1, name: r.name, code: r.code, outcome: r.code, movieIds: r.movieIds.slice(), titles: [], ...(r.sha256 ? { sha256: r.sha256 } : {}) };
      });
      if (!validConnections(connectionWire(u), u.record)) throw new Error('invalid_connection_history');
      var merged = mergeCloudConnections(connectionWire(u), u.record.connections); if (merged) applyCloudConnections(c, u, merged);
      reconcileConnections(c, u); saveConnections(c, u);
    } catch (_) { u.connectionResults = []; u.connectionHistoryError = true; }
  }
  function connectionReason(code) {
    var reasons = {
      lost: ['연결했던 원본이 이 기기에 없어요. 원본 파일을 다시 선택해 주세요.', 'The connected original is missing on this device. Select it again.'],
      check: ['이 기기의 원본을 확인하지 못했어요. 보관함을 새로고침하거나 원본을 다시 선택해 주세요.', 'Could not check device originals. Refresh the library or select the original again.'],
      pending: ['원본 내용을 확인하는 중이에요.', 'Checking original content.'],
      connected: ['남은 영상과 연결했어요. 이어서 저장할 수 있어요.', 'Connected to remaining videos. Ready to resume.'],
      duplicate: ['이 원본은 이미 이 기기에 연결돼 있어요.', 'This original is already connected on this device.'],
      saved: ['이미 계정에 저장된 영상이에요. 다시 연결할 필요가 없어요.', 'This video is already saved to your account.'],
      empty: ['비어 있는 파일이에요. 원본 영상 파일을 다시 선택해 주세요.', 'This file is empty. Select the original video again.'],
      large: ['파일이 64MB 저장 한도를 넘어요. 해당 원본을 확인해 주세요.', 'This file exceeds the 64MB save limit. Check the original.'],
      size: ['남은 영상과 파일 크기가 일치하지 않아요. 원본 파일을 다시 선택해 주세요.', 'No remaining video has this file size. Select the original again.'],
      content: ['파일 내용이 남은 영상의 원본과 달라요. 편집·변환하지 않은 원본을 선택해 주세요.', 'Content does not match an original. Select the unedited, unconverted original.'],
      legacy: ['원본 확인 정보가 없는 이전 기록이에요. 원래 기기에서 이어서 저장해 주세요.', 'This older job has no fingerprint. Resume on the original device.'],
      read: ['파일 내용을 읽지 못했어요. 파일 접근 권한과 브라우저 설정을 확인한 뒤 다시 선택해 주세요.', 'Could not read this file. Check file access and browser settings, then select it again.'],
      storage: ['이 기기에 원본을 보관하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 선택해 주세요.', 'Could not keep this original on this device. Check browser storage, then select it again.'],
      stopped: ['연결을 중단해 아직 확인하지 않은 파일이에요. 다시 선택해 주세요.', 'Connection stopped before checking this file. Select it again.']
    };
    var reason = reasons[code] || reasons.read; return t(reason[0], reason[1]);
  }
  async function connectOriginals(c, u, files, retryId) {
    if (!uploadCurrent(c, u) || u.busy || uploadJob || bulkJob || !u.record || !L.storeLocalMovie || !files.length) return;
    restoreConnections(c, u);
    if ((u.connectionResults || []).length + files.length - (retryId ? 1 : 0) > 2000) { u.reason = t('연결 결과는 작업당 2,000개까지 기억할 수 있어요. 파일을 나눠 선택하거나 진행 기록을 정리해 주세요.', 'A job can remember up to 2,000 file results. Select fewer files or remove old progress.'); drawCatalogue(); return; }
    var jobId = u.record.id, epoch = u.connectionEpoch = (u.connectionEpoch || 0) + 1;
    function current() { return uploadCurrent(c, u) && u.record && u.record.id === jobId && u.connectionEpoch === epoch; }
    if (!retryId) u.connectionOnlyFailed = false; u.connectionResults = u.connectionResults || []; u.connectionSeq = u.connectionSeq || 0;
    // Keep descriptors only in the result list, never File objects or video bytes.
    var rows = files.map(function (file, i) {
      var row = { key: connectionId(), seq: 1, outcome: 'pending', id: retryId && i === 0 ? retryId : ++u.connectionSeq, name: file.name || t('이름 없는 파일 ', 'Unnamed file ') + (i + 1), code: 'pending', titles: [], movieIds: [] };
      var old = u.connectionResults.findIndex(function (r) { return r.id === row.id; });
      if (old >= 0) { u.connectionRemoved = Array.from(new Set((u.connectionRemoved || []).concat(u.connectionResults[old].key))); u.connectionResults[old] = row; } else u.connectionResults.push(row); return row;
    });
    u.busy = true; u.connecting = true; u.stopped = false; u.reason = ''; saveConnections(c, u); drawCatalogue();
    var connected = 0, rejected = 0;
    try {
      for (var i = 0; i < files.length; i++) {
        if (!current()) return;
        var file = files[i], row = rows[i];
        try {
        if (u.stopped) { row.code = 'stopped'; rejected++; continue; }
        if (!file.size) { row.code = 'empty'; rejected++; continue; }
        if (file.size > 64 * 1024 * 1024) { row.code = 'large'; rejected++; continue; }
        var sameSize = u.record.entries.filter(function (e) { return e.size === file.size; });
        if (!sameSize.length) { row.code = 'size'; rejected++; continue; }
        var hash;
        try { hash = await originalHash(file); }
        catch (_) { if (!current()) return; row.code = 'read'; rejected++; continue; }
        if (!current()) return;
        if (u.stopped) { row.code = 'stopped'; rejected++; continue; }
        row.sha256 = hash; saveConnections(c, u);
        var exact = sameSize.filter(function (e) { return e.sha256 === hash; });
        var matches = exact.filter(function (e) { return e.state !== 'saved' && !c.items.some(function (m) { return m.local && sameUpload(e, m); }); });
        row.movieIds = exact.map(function (e) { return e.id; }); saveConnections(c, u);
        if (!matches.length) {
          row.code = exact.some(function (e) { return e.state !== 'saved'; }) ? 'duplicate' : exact.length ? 'saved' : sameSize.some(function (e) { return e.state !== 'saved' && !e.sha256; }) ? 'legacy' : 'content';
          if (row.code !== 'duplicate' && row.code !== 'saved') rejected++; continue;
        }
        row.code = 'connected';
        for (var j = 0; j < matches.length; j++) {
          if (!current()) return;
          if (u.stopped) { row.code = 'stopped'; break; }
          var e = matches[j], blob = file.slice(0, file.size, e.mime), meta = { clientId: e.id, title: e.title, engine: e.engine, episodeId: e.episodeId, durationMs: e.durationMs || 0, interrupted: !!e.interrupted };
          try { await L.storeLocalMovie(blob, meta, c.owner); }
          catch (_) { if (!current()) return; row.code = 'storage'; break; }
          if (!current()) return;
          c.items.push(Object.assign({}, meta, { id: e.id, local: true, blob: blob, createdAt: Date.now() })); e.state = 'pending'; e.error = ''; u.selected.add(e.id); row.titles.push(e.title); connected++; row.outcome = row.code; saveConnections(c, u);
        }
        if (row.code !== 'connected') rejected++;
        rememberUpload(c, u); drawCatalogue();
        } finally { if (current()) { row.outcome = row.code; saveConnections(c, u); } }
      }
      rememberUpload(c, u);
      u.reason = t('원본 ' + connected + '개 연결 · 연결하지 못한 파일 ' + rejected + '개. 아래 파일별 결과를 확인하세요. 연결된 영상은 ‘남은 영상 이어서 저장’을 눌러 저장하세요.', connected + ' originals connected; ' + rejected + ' files need attention. Check each result below, then choose Resume to save connected videos.');
    } finally { if (u.connectionEpoch === epoch) { u.busy = false; u.connecting = false; if (current()) { saveConnections(c, u); drawCatalogue(); } } }
  }
  function connectionResults(c, u, host) {
    if (!u.connectionResults || !u.connectionResults.length) return;
    var section = node('section', 'dub-original-results'); section.setAttribute('aria-label', t('원본 파일 연결 결과', 'Original file connection results'));
    section.append(node('h4', '', t('파일별 연결 결과', 'File connection results')));
    section.append(node('p', 'dub-save-note', t('연결되지 않은 파일은 이유를 확인하고 옆의 파일 선택으로 다시 골라 주세요. 이 기기에서 연결된 파일은 다시 선택하지 않아도 돼요.', 'For an unconnected file, check its reason and select a replacement beside it. Files connected on this device do not need to be selected again.')));
    section.append(node('p', 'dub-save-note', u.connectionRemembered ? t('파일 이름과 연결 결과를 기억해요. 다시 열면 연결되지 않은 파일만 먼저 보여요. 연결되지 않은 파일은 다시 선택해야 해요.', 'Names and results are remembered for this account. Reopening shows unconnected files first. Unconnected files must be selected again.') : t('파일별 결과를 이 브라우저에 저장하지 못했어요. 화면을 닫기 전에 브라우저 저장 공간·설정을 확인해 주세요.', 'File results could not be remembered. Check browser storage before closing.')));
    var resultsSynced = u.connectionCloudSaved && !u.connectionSyncing && connectionSignature(connectionWire(u)) === u.connectionAck;
    if (L.saveUpload) section.append(node('p', 'dub-save-note', u.connectionCloudError ? t('파일별 결과를 계정에 동기화하지 못했어요. 이 기기의 기록은 유지돼요. 연결을 확인한 뒤 남은 기록만 다시 동기화해 주세요.', 'File results could not sync to your account. Device history is kept. Retry the remaining records.') : resultsSynced ? t('✓ 파일별 결과가 계정에 동기화됐어요. 다른 기기에서 같은 계정으로 로그인해도 불러와요. 그 기기에 없는 원본은 다시 선택해 주세요.', '✓ File results are synced to your account. Sign in on another device to restore them. Reselect originals missing on that device.') : t('파일별 결과를 계정에 동기화하는 중… 완료 안내를 확인해 주세요.', 'Syncing file results to your account… Wait for confirmation.')));
    if (L.saveUpload && L.hasAccount()) {
      var wire = connectionWire(u), pending = connectionPending(u, wire), total = wire.rows.length + wire.removed.length, remaining = pending.rows.length + pending.removed.length, completed = total - remaining;
      var progressText = node('p', 'dub-save-note', t('계정 동기화: ', 'Account sync: ') + completed + ' / ' + total + t('개 완료 · 남은 기록 ', ' complete · Remaining ') + remaining + t('개', '') + (wire.removed.length ? t(' (교체된 기록 정리 포함)', ' (including replaced records)') : ''));
      progressText.setAttribute('role', 'status'); progressText.setAttribute('aria-live', 'polite'); section.append(progressText);
      var meter = node('progress'); meter.max = Math.max(1, total); meter.value = completed; meter.setAttribute('aria-label', t('파일별 연결 결과 계정 동기화', 'File result account sync')); section.append(meter);
      if (u.connectionCloudError && remaining) {
        var retrySync = node('button', 'btn btn-secondary', t('남은 기록 다시 동기화', 'Retry remaining records')); retrySync.type = 'button'; retrySync.disabled = !!u.connectionSyncing || !!u.historyChanged;
        retrySync.addEventListener('click', function () { return retryConnectionSync(c, u); }); section.append(retrySync);
        if (u.historyChanged) section.append(node('p', 'dub-save-note', t('계정의 기록이 바뀌었어요. 보관함을 새로고침해 주세요.', 'Account history changed. Refresh the library.')));
      }
    }
    var failures = u.connectionResults.filter(connectionRetry), filterLabel = node('label', 'dub-original-filter'), filter = node('input'); filter.type = 'checkbox'; filter.checked = !!u.connectionOnlyFailed; filter.disabled = u.busy;
    filter.setAttribute('aria-label', t('연결되지 않은 파일만 보기', 'Show only unconnected files'));
    filter.addEventListener('change', function () { if (!uploadCurrent(c, u) || u.busy) return; u.connectionOnlyFailed = filter.checked; drawCatalogue(); });
    filterLabel.append(filter, node('span', '', t('연결되지 않은 파일만 보기', 'Show only unconnected files') + ' · ' + failures.length + t('개', ''))); section.append(filterLabel);
    if (u.connectionOnlyFailed && !failures.length) section.append(node('p', '', t('다시 선택할 파일이 없어요. 연결된 영상은 ‘남은 영상 이어서 저장’을 눌러 저장하세요.', 'No files need reselecting. Choose Resume to save connected videos.')));
    var list = node('ul');
    u.connectionResults.filter(function (r) { return !u.connectionOnlyFailed || connectionRetry(r); }).forEach(function (r) {
      var item = node('li'), retry = connectionRetry(r);
      item.append(node('strong', '', r.name), node('p', '', connectionReason(r.code)));
      if (r.titles.length) item.append(node('p', '', t('연결된 영상: ', 'Connected videos: ') + r.titles.join(' · ')));
      if (retry) {
        var label = node('label', '', t('이 파일 다시 선택 ', 'Select this file again ')), picker = node('input');
        picker.type = 'file'; picker.accept = 'video/webm,video/mp4,.webm,.mp4'; picker.disabled = u.busy;
        picker.setAttribute('aria-label', r.name + t(' 다시 선택', ' select again'));
        picker.addEventListener('change', function () { return connectOriginals(c, u, Array.from(picker.files || []), r.id); }); label.append(picker); item.append(label);
      }
      list.append(item);
    }); section.append(list); host.append(section);
  }
  function uploadCurrent(c, u) { return catalogue === c && c.upload === u && owned(c.owner) && view === 'movies'; }
  async function uploadSelected(c, only, resumeOnly) {
    if (catalogue !== c || !owned(c.owner) || !L.hasAccount()) return;
    if (uploadJob || bulkJob) { status(t('다른 저장·다운로드 작업이 끝난 뒤 다시 눌러 주세요.', 'Wait for the other save or download to finish.')); return; }
    var u = uploadState(c), movies = only || c.items.filter(function (m) { return m.local && u.selected.has(m.id); });
    if (u.busy) return;
    if (u.historyError) { status(t('저장 진행 기록을 읽지 못했어요. 아래의 진행 기록 지우기를 누른 뒤 다시 선택해 주세요.', 'Could not read save progress. Remove the progress record below and select again.')); return; }
    if (!resumeOnly && !movies.length) return;
    if (resumeOnly) {
      try { var latest = readUpload(c.owner); if (!latest && !u.persistedId) latest = u.record; if (!latest || !u.record || latest.id !== u.record.id) throw new Error('upload_history_changed'); u.record = latest; }
      catch (_) { u.reason = t('저장 진행 기록이 다른 화면에서 바뀌었어요. 보관함을 새로고침해 주세요.', 'Save progress changed in another view. Refresh the library.'); drawCatalogue(); return; }
    } else {
      if (!u.record || u.record.entries.every(function (e) { return e.state === 'saved'; })) {
        u.replaceId = u.record && u.record.id; u.connectionResults = [];
        u.record = { version: 1, owner: c.owner, id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12), updatedAt: Date.now(), entries: [] };
      }
      var known = new Set(u.record.entries.map(function (e) { return e.id; }));
      movies.forEach(function (m) { if (!known.has(m.id)) { u.record.entries.push(uploadEntry(m)); known.add(m.id); } u.selected.add(m.id); });
    }
    // Persist the full queue BEFORE the first asynchronous step. A tab may close
    // after the server commits a file but before the success response arrives.
    rememberUpload(c, u); if (u.historyChanged) { drawCatalogue(); return; }
    var requested = new Set(movies.map(function (m) { return m.id; })), ticket = { state: u, catalogue: c }; uploadJob = ticket;
    u.busy = true; u.verifying = true; u.stopped = false; u.reason = ''; u.results = new Map(); drawCatalogue();
    try {
      if (L.listUploads) {
        try { await pullUploads(c); } catch (_) { u.cloudError = true; u.cloudSaved = false; }
        if (!uploadCurrent(c, u) || u.stopped || u.historyChanged) return;
        await syncUpload(c, u);
        // Hash every available unfinished original before sending the first movie.
        // A fresh browser can then reconnect an exact file rather than guessing.
        if (L.saveUpload) {
          for (var h = 0; h < u.record.entries.length; h++) {
            var he = u.record.entries[h], hm = c.items.find(function (m) { return m.local && sameUpload(he, m); });
            if (he.state !== 'saved' && hm) {
              try {
                var actualHash = await originalHash(hm.blob);
                if (he.sha256 && he.sha256 !== actualHash) { u.stopped = true; u.reason = t('원본 파일 내용이 진행 기록과 달라 저장을 멈췄어요. 원본을 확인해 주세요.', 'Saving stopped because an original no longer matches its fingerprint. Check the original.'); return; }
                he.sha256 = actualHash;
              } catch (_) { u.hashError = true; if (he.sha256) { u.stopped = true; u.reason = t('원본 파일 내용을 확인하지 못했어요. 원본과 브라우저 설정을 확인해 주세요.', 'Could not verify the original file. Check the original and browser settings.'); return; } }
              if (!uploadCurrent(c, u) || u.stopped) return;
            }
          }
          rememberUpload(c, u); await syncUpload(c, u);
          if (!uploadCurrent(c, u) || u.stopped || u.historyChanged) return;
        }
      }
      var response;
      try { response = await L.listMovies(); if (!response || !Array.isArray(response.movies)) throw new Error('invalid_response'); }
      catch (_) { if (uploadCurrent(c, u)) { u.stopped = true; u.reason = t('계정의 저장 완료 목록을 확인하지 못했어요. 연결을 확인한 뒤 이어서 저장을 다시 눌러 주세요.', 'Could not check saved account videos. Check your connection and retry resume.'); } return; }
      if (!uploadCurrent(c, u) || u.stopped || uploadJob !== ticket) return;
      reconcileUpload(c, u, response); rememberUpload(c, u); u.verifying = false;
      movies = u.record.entries.filter(function (e) { return e.state !== 'saved' && e.state !== 'missing' && e.state !== 'changed' && (resumeOnly || requested.has(e.id)); }).map(function (e) { return c.items.find(function (m) { return m.local && sameUpload(e, m); }); }).filter(Boolean);
      for (var i = 0; i < movies.length; i++) {
        if (!uploadCurrent(c, u) || u.stopped || uploadJob !== ticket) return;
        var movie = movies[i], entry = u.record.entries.find(function (e) { return e.id === movie.id; });
        entry.state = 'pending'; entry.error = ''; u.currentTitle = movie.title; u.currentIndex = u.record.entries.indexOf(entry); rememberUpload(c, u); if (u.historyChanged) return; drawCatalogue();
        try {
          var result = await L.saveMovie(movie.blob, { clientId: movie.id, engine: movie.engine, episodeId: movie.episodeId, title: movie.title, interrupted: !!movie.interrupted, durationMs: movie.durationMs || 0 });
          if (!uploadCurrent(c, u) || uploadJob !== ticket) return;
          if (!result || !result.movie || result.movie.id !== movie.id) throw new Error('invalid_movie_response');
          c.items = c.items.map(function (m) { return m.id === movie.id ? Object.assign({}, result.movie, { local: false }) : m; });
          u.selected.delete(movie.id); entry.state = 'saved'; entry.error = '';
          c.response = Object.assign({}, c.response, { movies: c.items.filter(function (m) { return !m.local; }) });
        } catch (e) {
          if (!uploadCurrent(c, u) || uploadJob !== ticket) return;
          entry.state = 'failed'; entry.error = message(e).slice(0, 1000);
          if (e.status === 401 || e.status === 429 || e.status === 503 || /account_changed|auth_required|movie_count_limit|quota|network|timeout/.test(e.code || '')) { u.stopped = true; u.reason = message(e); }
        }
        rememberUpload(c, u); await syncUpload(c, u); drawCatalogue();
      }
    } finally {
      if (uploadJob === ticket) uploadJob = null;
      u.busy = false; u.verifying = false; u.currentTitle = '';
      if (uploadCurrent(c, u)) { rememberUpload(c, u); drawCatalogue(); }
    }
  }
  function uploadBar(c, shown) {
    var host = $('dub-library-upload'); if (!host || c.kind !== 'movies') return;
    var locals = c.items.filter(function (m) { return m.local; }), u = uploadState(c); restoreConnections(c, u); u.checks = new Map();
    if (!locals.length && !u.record && !u.historyError && !u.cloudError) return;
    host.hidden = false;
    host.append(node('h3', '', t('이 기기의 영상, 계정에 모아 저장', 'Save device videos to your account')));
    host.append(node('p', '', t('영상 카드에서 저장할 영상을 선택하세요. 검색해도 선택은 유지돼요. 계정에 저장하면 다른 컴퓨터·브라우저에서도 볼 수 있어요.', 'Select videos on their cards. Selections stay when you search. Account videos are available on other computers and browsers.')));
    if (c.uploads && c.uploads.length > 1) {
      var jobLabel = node('label', '', t('저장 작업 선택 ', 'Save job ')), jobs = node('select'); jobs.setAttribute('aria-label', t('저장 작업 선택', 'Choose save job')); jobs.disabled = u.busy;
      c.uploads.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).forEach(function (r) { var option = node('option', '', r.entries[0].title + ' · ' + r.entries.length + t('개 영상', ' videos') + ' · ' + new Date(r.updatedAt).toLocaleString()); option.value = r.id; option.selected = !!u.record && r.id === u.record.id; jobs.append(option); });
      jobs.addEventListener('change', function () {
        if (!uploadCurrent(c, u) || u.busy) return;
        var next = c.uploads.find(function (r) { return r.id === jobs.value; }); if (!next) return;
        u.replaceId = u.record && u.record.id; u.record = JSON.parse(JSON.stringify(next)); u.selected.clear(); u.persistedId = null; u.connectionResults = [];
        reconcileUpload(c, u, c.response); rememberUpload(c, u); u.cloudSaved = true; drawCatalogue();
      }); jobLabel.append(jobs); host.append(jobLabel);
    }
    var summary = node('p', 'dub-selection-summary', t('선택한 영상 ', 'Selected videos: ') + u.selected.size + t('개 · 이 기기에만 저장된 영상 ', ' · Device-only videos: ') + locals.length + t('개', ''));
    summary.setAttribute('role', 'status'); host.append(summary);
    var controls = node('div', 'row');
    var select = button(t('보이는 기기 영상 모두 선택', 'Select visible device videos'), function () {
      if (!uploadCurrent(c, u) || u.busy) return;
      shown.forEach(function (m) { if (m.local) u.selected.add(m.id); }); drawCatalogue(); u.selectShown.focus();
    }); u.selectShown = select; select.disabled = u.busy || !shown.some(function (m) { return m.local; });
    var clear = button(t('영상 선택 해제', 'Clear video selection'), function () { if (uploadCurrent(c, u) && !u.busy) { u.selected.clear(); drawCatalogue(); u.clearSelection.focus(); } }); u.clearSelection = clear; clear.disabled = u.busy || !u.selected.size;
    var save = button(t('선택한 영상 계정에 저장', 'Save selected videos to account'), function () { return uploadSelected(c); }, 'go');
    save.disabled = u.busy || !u.selected.size || !L.hasAccount();
    var stop = button(t('저장 중단', 'Stop saving'), function () { if (uploadCurrent(c, u) && u.busy) { u.stopped = true; rememberUpload(c, u); drawCatalogue(); } }); stop.hidden = !u.busy; stop.disabled = u.stopped;
    controls.append(select, clear, save, stop); host.append(controls);
    if (!L.hasAccount()) host.append(node('p', 'dub-save-note', t('계정에 저장하려면 먼저 로그인해 주세요.', 'Sign in before saving to your account.')));
    if (u.cloudError && !u.record) host.append(node('p', 'dub-save-note', t('계정의 저장 진행을 불러오지 못했어요. 연결을 확인하고 보관함을 새로고침해 주세요.', 'Could not load account save progress. Check your connection and refresh the library.')));
    if (u.historyError) host.append(node('p', 'dub-save-note', t('저장 진행 기록을 읽지 못했어요. 원본 영상은 지우지 않았어요. 진행 기록을 지운 뒤 다시 선택해 주세요.', 'Save progress could not be read. Original videos are kept. Remove the progress record and select again.')));
    if (u.record) {
      u.total = u.record.entries.length; u.saved = u.record.entries.filter(function (e) { return e.state === 'saved'; }).length;
      u.failed = u.record.entries.filter(function (e) { return e.state === 'failed' || e.state === 'missing' || e.state === 'changed'; }).length; u.done = u.saved + u.failed;
      u.results = new Map(u.record.entries.filter(function (e) { return e.state !== 'pending'; }).map(function (e) { return [e.id, { title: e.title, saved: e.state === 'saved', error: e.error }]; }));
      var remaining = u.total - u.saved;
      var resume = button(t('남은 영상 이어서 저장', 'Resume remaining video saves'), function () { return uploadSelected(c, null, true); }, 'go');
      resume.disabled = u.busy || !L.hasAccount() || !!c.localError; resume.hidden = remaining === 0; controls.append(resume);
      host.append(node('p', 'dub-selection-summary', (u.remembered ? t('기억한 저장 진행: ', 'Remembered save progress: ') : t('현재 저장 진행: ', 'Current save progress: ')) + u.saved + ' / ' + u.total + t('개 저장 · 남은 ', ' saved · Remaining ') + remaining + t('개', '')));
      host.append(node('p', 'dub-save-note', u.remembered ? t('같은 계정으로 보관함을 열면 저장 진행을 불러오고 이미 저장된 영상은 건너뛰어요. 다른 기기에서는 아직 전송하지 않은 원본 파일을 아래에서 연결해 주세요.', 'Open the library with the same account to restore progress and skip saved videos. On another device, connect untransferred original files below.') : t('이 브라우저에 진행 기록을 저장하지 못했어요. 화면을 닫지 말고 브라우저 저장 공간·설정을 확인해 주세요.', 'Save progress could not be remembered in this browser. Keep this screen open and check browser storage settings.')));
      host.append(node('p', 'dub-save-note', u.cloudSaved ? t('✓ 계정에 저장 진행이 동기화됐어요. 다른 컴퓨터·브라우저에서도 불러올 수 있어요.', '✓ Save progress is synced to your account and available on other devices.') : t('계정에 진행 상황을 동기화하지 못했어요. 현재 기기의 진행 기록은 유지돼요. 연결을 확인하고 보관함을 새로고침해 주세요.', 'Progress is not synced to your account. Device progress is kept. Check your connection and refresh the library.')));
      if (u.hashError) host.append(node('p', 'dub-save-note', t('일부 원본의 내용 확인을 마치지 못했어요. 해당 영상은 원래 기기에서 이어서 저장해 주세요.', 'Some originals could not be fingerprinted. Resume those videos on the original device.')));
      if (u.record.entries.some(function (e) { return e.state === 'missing'; })) {
        var originalLabel = node('label', 'dub-save-note', t('다른 기기에서 이어서 저장하려면 원본 파일 연결 ', 'Connect original files to resume on this device ')), picker = node('input');
        picker.type = 'file'; picker.multiple = true; picker.accept = 'video/webm,video/mp4,.webm,.mp4'; picker.disabled = u.busy; picker.setAttribute('aria-label', t('남은 영상 원본 파일 연결', 'Connect remaining original video files'));
        picker.addEventListener('change', function () { return connectOriginals(c, u, Array.from(picker.files || [])); }); originalLabel.append(picker); host.append(originalLabel);
        host.append(node('p', 'dub-save-note', t('원본 파일을 여러 개 한 번에 선택할 수 있어요. 전송 전 원본은 자동으로 다른 기기에 옮겨지지 않아요. 내려받아 둔 원본을 선택하면 내용이 정확히 일치하는 영상만 연결돼요. 원본이 없거나 이전 버전의 기록이면 원래 기기·브라우저에서 이어서 저장하세요.', 'Select several original files at once. Untransferred originals do not move automatically. Select downloaded originals; only exact content matches are connected. Without an original or for older progress, resume in the original browser.')));
      }
      if (c.localError) host.append(node('p', 'dub-save-note', t('이 기기의 원본 영상을 불러오지 못했어요. 브라우저 저장 설정을 확인하고 보관함을 새로고침해 주세요.', 'Could not load device originals. Check browser storage and refresh the library.')));
    }
    if (u.connectionHistoryError) host.append(node('p', 'dub-save-note', t('파일별 연결 기록을 읽지 못했어요. 원본 영상은 유지돼요. 필요한 파일을 다시 선택해 주세요.', 'Could not read file connection history. Originals are kept. Select the files again.')));
    if (u.record) connectionResults(c, u, host);
    if (u.record || u.historyError) {
      var remove = button(t('저장 진행 기록 지우기', 'Remove save progress'), async function () {
        if (!uploadCurrent(c, u) || u.busy || uploadJob) return;
        try {
          if (L.deleteUpload && u.record) { u.busy = true; await L.deleteUpload(u.record.id, c.owner); if (!uploadCurrent(c, u)) return; c.uploads = (c.uploads || []).filter(function (r) { return r.id !== u.record.id; }); u.busy = false; }
          if (u.record) localStorage.removeItem(connectionKey(c.owner, u.record.id)); localStorage.removeItem(uploadKey(c.owner)); u.record = null; u.persistedId = null; u.historyError = false; u.historyChanged = false; u.total = 0; u.reason = ''; u.results.clear(); await refresh(); }
        catch (_) { u.busy = false; status(t('진행 기록을 지우지 못했어요. 브라우저 저장 설정을 확인해 주세요.', 'Could not remove progress. Check browser storage settings.')); }
      }); remove.disabled = u.busy; controls.append(remove);
      if (L.deleteUpload) host.append(node('p', 'dub-save-note', t('진행 기록을 지우면 모든 기기에서 해당 작업 기록만 사라져요. 저장된 영상과 원본은 유지돼요.', 'Removing progress clears this job on all devices. Saved videos and originals are kept.')));
    }
    if (u.record) {
      var text = u.connecting ? t('원본 파일 내용을 확인하고 연결하는 중…', 'Checking and connecting original files…') : u.busy && u.verifying ? t('계정에 이미 저장된 영상을 확인하는 중…', 'Checking videos already saved to your account…') : u.busy ? (u.stopped ? t('현재 영상 저장을 마친 뒤 중단해요.', 'Stopping after the current video.') : t('전체 ' + u.total + '개 중 ' + Math.min((u.currentIndex || 0) + 1, u.total) + '번째 저장 중 · ', 'Saving video ' + Math.min((u.currentIndex || 0) + 1, u.total) + ' of ' + u.total + ' · ') + u.currentTitle)
        : u.stopped ? t('저장을 중단했어요.', 'Saving stopped.') : remaining ? t('저장이 멈춰 있어요. 남은 영상을 이어서 저장해 주세요.', 'Saving is paused. Resume the remaining videos.') : t('모든 영상을 계정에 저장했어요.', 'All videos are saved to your account.');
      var progress = node('p', 'dub-selection-summary', text + ' · ' + t('저장 ', 'Saved ') + u.saved + t('개 · 실패 ', ' · Failed ') + u.failed + t('개 · 남은 ', ' · Remaining ') + (u.total - u.saved) + t('개', ''));
      progress.setAttribute('role', 'status'); progress.setAttribute('aria-live', 'polite'); host.append(progress);
      var meter = node('progress'); meter.max = u.total; meter.value = u.saved; meter.setAttribute('aria-label', t('선택한 영상 계정 저장 진행 상황', 'Selected video account save progress')); host.append(meter);
      if (u.reason) host.append(node('p', 'dub-save-note', u.reason));
      if (!u.busy && u.selected.size) host.append(node('p', 'dub-save-note', t('실패하거나 아직 저장하지 않은 영상은 선택된 채로 남아요. ‘선택한 영상 계정에 저장’을 다시 눌러 주세요.', 'Failed and unattempted videos stay selected. Choose Save selected videos to account to retry.')));
      var results = node('ul', 'dub-upload-results');
      u.results.forEach(function (r) { results.append(node('li', '', (r.saved ? t('저장 완료 · ', 'Saved · ') : t('저장 실패 · ', 'Failed · ')) + r.title + (r.error ? ' · ' + r.error : ''))); }); host.append(results);
    }
    host.append(node('p', 'dub-save-note', t('화면을 닫거나 새로고침하면 저장이 멈춰요. 같은 계정의 보관함에서 남은 영상을 이어서 저장할 수 있어요. 다른 기기에서는 원본 파일 연결이 필요해요. 아직 계정에 저장하지 않은 원본 영상은 브라우저에서 삭제하지 마세요.', 'Closing or refreshing pauses saving. Reopen your account library to resume remaining videos. Another device needs the original files. Keep device originals until they are saved to your account.')));
  }

  function drawCatalogue() {
    var c = catalogue;
    if (!c || !owned(c.owner) || c.kind !== view) return;
    clearItems(); renderDownloads(c);
    var box = $('dub-library-items'); if (!box) return;
    var query = c.kind === 'movies' && $('dub-library-search') ? searchKey($('dub-library-search').value) : '';
    var shown = c.items.filter(function (item) { return !query || searchKey(movieGroup(item) || t('모둠 이름 없음', 'No group name')).indexOf(query) >= 0; });
    if (c.kind === 'movies') uploadBar(c, shown);
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
        group.items.forEach(function (item) { grid.append(movieCard(item, c.owner, c)); });
        section.append(grid); box.append(section);
      });
    } else shown.forEach(function (item) { box.append(c.kind === 'movies' ? movieCard(item, c.owner, c) : draftCard(item, c.owner)); });
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
    catalogue = { owner: owner, kind: kind, items: items, response: response, localError: results[1].status !== 'fulfilled', error: results[0].reason };
    if (kind === 'movies' && L.listDownloads && L.hasAccount()) {
      try { await pullDownloads(catalogue); } catch (_) { if (catalogue && catalogue.owner === owner) catalogue.downloadSyncError = true; }
      if (ticket !== generation || !owned(owner)) return;
    }
    if (kind === 'movies' && L.listUploads && L.hasAccount()) {
      try { await pullUploads(catalogue); } catch (_) { if (catalogue && catalogue.owner === owner) uploadState(catalogue).cloudError = true; }
      if (ticket !== generation || !owned(owner)) return;
    }
    drawCatalogue();
  }
  function movieCard(movie, owner, c) {
    var card = node('article', 'dub-library-card');
    card.append(node('span', 'dub-library-badge' + (movie.local ? ' local' : ''), movie.local ? t('이 기기에만 저장됨', 'Saved on this device only') : t('내 계정에 저장됨', 'Saved to my account')));
    card.append(node('h3', '', movie.title));
    if (movie.local && c) {
      var u = uploadState(c), label = node('label', 'dub-upload-select'), check = node('input');
      check.type = 'checkbox'; check.checked = u.selected.has(movie.id); check.disabled = u.busy;
      check.setAttribute('aria-label', t('계정에 저장할 영상 선택: ', 'Select video to save: ') + movie.title);
      check.addEventListener('change', function () {
        if (!uploadCurrent(c, u) || u.busy || !card.isConnected) return;
        if (check.checked) u.selected.add(movie.id); else u.selected.delete(movie.id);
        drawCatalogue(); var next = u.checks.get(movie.id); if (next) next.focus();
      });
      u.checks.set(movie.id, check);
      label.append(check, node('span', '', t('계정에 저장할 영상 선택', 'Select for account save'))); card.append(label);
    }
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
    if (movie.local && L.hasAccount()) {
      var save = button(t('내 계정에도 저장하기', 'Save to my account'), function () { if (owned(owner) && card.isConnected && c) return uploadSelected(c, [movie]); });
      save.disabled = !!(c && uploadState(c).busy); actions.append(save);
    }
    actions.append(button(t('삭제', 'Delete'), async function (e) {
      if (uploadJob) { status(t('영상 저장을 중단한 뒤 삭제해 주세요.', 'Stop saving videos before deleting.')); return; }
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
    window.addEventListener('pagehide', function () { if (catalogue && catalogue.upload && catalogue.upload.connecting) { var u = catalogue.upload; saveConnections(catalogue, u); u.connectionEpoch++; u.stopped = true; u.busy = false; u.connecting = false; } if (uploadJob) { uploadJob.state.stopped = true; rememberUpload(uploadJob.catalogue, uploadJob.state); } downloadPauses.slice().forEach(function (pause) { pause(); }); releaseUrls(); });
    render();
  }
  window.MangoiDubHome = { init: init, ready: ready, render: render, checkpoint: checkpoint, saveMovie: saveMovie, practice: practice, openLibrary: openLibrary, movieFilename: movieFilename };
})();
