/* Private dubbing library. Audio/video never enters URLs, logs or public assets.
 * Server authentication is authoritative; the local identity only separates device
 * drafts and prevents a late request from being applied after an account switch. */
(function () {
  'use strict';
  var BASE = '/api/dubbing', DB_NAME = 'mangoi-dubbing-library-v1';
  var versions = Object.create(null), queues = Object.create(null), listeners = [], requests = new Set();
  var DELETE_NOTICE = 'mangoi:dubbing-draft-deleted', draftGenerations = Object.create(null);
  function read(key) { try { return localStorage.getItem(key) || ''; } catch (_) { return ''; } }
  function object(key) { try { return JSON.parse(read(key) || 'null'); } catch (_) { return null; } }
  function identityValue() {
    var a = object('mangoi_logged_user'), uid = a && (a.uid || a.user_id || a.id);
    if (!uid) { a = object('mango_user'); uid = a && (a.uid || a.user_id || a.id); }
    if (uid && read('mango_token')) return 'student:' + String(uid).toLowerCase();
    var s = object('mangoi_admin_session');
    var name = s && (s.username || s.uid || s.user_id || (s.user && (s.user.username || s.user.uid)));
    return name ? 'staff:' + String(name).toLowerCase() : read('mango_token') ? 'student:unknown' : 'guest';
  }
  function identity() { checkAccount(); return identityValue(); }
  function failure(code, status) { var e = new Error(code); e.code = code; e.status = status || 0; return e; }
  var current = identityValue();
  function checkAccount() {
    var next = identityValue();
    if (next === current) return;
    var old = current; current = next;
    requests.forEach(function (r) { r.abort(); });
    versions = Object.create(null);
    listeners.slice().forEach(function (fn) { try { fn(next, old); } catch (_) {} });
  }
  function assertOwner(owner) { checkAccount(); if (owner !== identity()) throw failure('account_changed'); }
  function id() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function keyPart(value) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(String(value || ''))) throw failure('invalid_id');
    return encodeURIComponent(value);
  }
  async function request(path, options, raw, owner) {
    owner = owner || identity();
    assertOwner(owner);
    if (owner === 'guest') throw failure('auth_required', 401);
    var headers = new Headers(options && options.headers || {}), token = read('mango_token');
    if (token && owner.indexOf('student:') === 0) headers.set('Authorization', 'Bearer ' + token);
    // The server compares this hint with its independently authenticated subject.
    // It never uses this value to choose a bucket or authenticate a request.
    headers.set('X-Dubbing-Actor', encodeURIComponent(owner));
    var controller = new AbortController(); requests.add(controller);
    var timer = setTimeout(function () { controller.abort(); }, raw === 'upload' ? 120000 : 60000);
    try {
      var response = await fetch(BASE + path, Object.assign({}, options, {
        headers: headers, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
      }));
      assertOwner(owner);
      if (!response.ok) {
        var body = await response.json().catch(function () { return {}; });
        assertOwner(owner);
        throw failure(body.error || ('http_' + response.status), response.status);
      }
      var result = raw === true ? await response.blob() : await response.json();
      assertOwner(owner);
      if (raw !== true && (!result || result.ok !== true)) throw failure('invalid_response');
      return result;
    } catch (e) {
      assertOwner(owner);
      if (e && e.code && typeof e.code === 'string') throw e;
      throw failure(e && e.name === 'AbortError' ? 'timeout' : 'network');
    } finally { clearTimeout(timer); requests.delete(controller); }
  }

  /* A failed upload remains on this device. No unscoped legacy recordings are
   * imported, and changing accounts never uploads a previous account's blobs. */
  var dbPromise;
  function database() {
    if (!window.indexedDB) return Promise.reject(failure('local_unavailable'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        ['movies', 'drafts'].forEach(function (name) {
          var store = req.result.createObjectStore(name, { keyPath: 'key' });
          store.createIndex('owner', 'owner');
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = req.onblocked = function () { dbPromise = null; reject(failure('local_unavailable')); };
    });
    return dbPromise;
  }
  async function localWrite(store, value, removeKey, guard) {
    var db = await database();
    if (guard) guard();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, 'readwrite');
      if (removeKey) tx.objectStore(store).delete(removeKey); else tx.objectStore(store).put(value);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = tx.onabort = function () { reject(failure('local_unavailable')); };
    });
  }
  async function localRead(store, owner, itemId) {
    var db = await database();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(store, 'readonly'), bucket = tx.objectStore(store);
      var req = itemId ? bucket.get(owner + '/' + itemId) : bucket.index('owner').getAll(owner);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(failure('local_unavailable')); };
    });
  }
  function serial(key, fn) {
    var result = (queues[key] || Promise.resolve()).catch(function () {}).then(fn);
    queues[key] = result;
    result.finally(function () { if (queues[key] === result) delete queues[key]; }).catch(function () {});
    return result;
  }
  function versionKey(owner, draftId) { return owner + '/' + draftId; }
  function draftGeneration(owner, draftId) { return draftGenerations[versionKey(owner, draftId)] || ''; }
  function assertDraft(owner, draftId, generation) {
    assertOwner(owner);
    if (draftGeneration(owner, draftId) !== generation) throw failure('draft_deleted');
  }
  function receiveDraftDeletion(detail) {
    if (!detail || typeof detail.owner !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(detail.draftId || '')) return;
    var key = versionKey(detail.owner, detail.draftId);
    draftGenerations[key] = detail.nonce || String(detail.at || 'deleted');
    delete versions[key];
  }
  function notifyDraftDeletion(owner, draftId, phase, previous) {
    var detail = { owner: owner, draftId: draftId, at: Date.now(), nonce: previous ? previous.nonce : id(), phase: phase };
    receiveDraftDeletion(detail);
    if (window.dispatchEvent && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent(DELETE_NOTICE, { detail: detail }));
    try { localStorage.setItem(DELETE_NOTICE, JSON.stringify(detail)); } catch (_) {}
    return detail;
  }
  async function clearStudioLocal(owner, draftId) {
    var match = /^studio-([a-z0-9_-]{1,40})$/.exec(draftId);
    if (!match) return;
    assertOwner(owner);
    var episodeId = match[1], prefix = encodeURIComponent(owner) + '|' + episodeId + ':', legacyPrefix = episodeId + ':';
    if (!window.indexedDB) throw failure('local_cleanup');
    await new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open('dubstudio', 1); } catch (_) { reject(failure('local_cleanup')); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore('recs'); };
      req.onerror = req.onblocked = function () { reject(failure('local_cleanup')); };
      req.onsuccess = function () {
        var db = req.result, tx;
        try {
          assertOwner(owner);
          tx = db.transaction('recs', 'readwrite');
          var store = tx.objectStore('recs'), keys = store.getAllKeys();
          keys.onsuccess = function () {
            keys.result.forEach(function (key) {
              if (typeof key !== 'string') return;
              if ((key.indexOf(prefix) === 0 && /^\d+$/.test(key.slice(prefix.length))) ||
                  (owner === 'guest' && key.indexOf(legacyPrefix) === 0 && /^\d+$/.test(key.slice(legacyPrefix.length)))) store.delete(key);
            });
          };
          tx.oncomplete = function () { if (db.close) db.close(); resolve(); };
          tx.onerror = tx.onabort = function () { if (db.close) db.close(); reject(failure('local_cleanup')); };
        } catch (e) { if (db.close) db.close(); reject(e.code ? e : failure('local_cleanup')); }
      };
    });
    assertOwner(owner);
    try { localStorage.removeItem('dubstudio.checkpoint.v2:' + encodeURIComponent(owner) + ':' + episodeId); }
    catch (_) { throw failure('local_cleanup'); }
  }
  function removeDraft(draftId, remote) {
    var owner = identity(), key = versionKey(owner, draftId);
    keyPart(draftId);
    return serial(key, async function () {
      assertOwner(owner);
      var result = remote ? await request('/drafts/' + keyPart(draftId), { method: 'DELETE' }, false, owner) : { ok: true };
      assertOwner(owner);
      // Only a successful remote deletion may invalidate the device's original takes.
      // Notify active studios first, before waiting for IndexedDB cleanup.
      var notice = notifyDraftDeletion(owner, draftId, 'deleting');
      try {
        await clearStudioLocal(owner, draftId);
        try { await localWrite('drafts', null, key, function () { assertOwner(owner); }); }
        catch (e) { if (e.code === 'account_changed') throw e; throw failure('local_cleanup'); }
        assertOwner(owner);
      } catch (e) { notifyDraftDeletion(owner, draftId, 'failed', notice); throw e; }
      notifyDraftDeletion(owner, draftId, 'deleted', notice);
      return result;
    });
  }
  async function getDraft(draftId) {
    var owner = identity(), path = '/drafts/' + keyPart(draftId), generation = draftGeneration(owner, draftId);
    try {
      var result = await request(path, {}, false, owner);
      assertDraft(owner, draftId, generation);
      var tag = result.etag || (result.draft && result.draft.etag);
      if (!tag) throw failure('missing_version');
      versions[versionKey(owner, draftId)] = tag;
      return result;
    } catch (e) {
      assertDraft(owner, draftId, generation);
      if (e.status === 404) versions[versionKey(owner, draftId)] = null;
      throw e;
    }
  }
  function saveDraft(draftId, payload) {
    var owner = identity(), key = versionKey(owner, draftId), generation = draftGeneration(owner, draftId);
    // Freeze the snapshot now, not when an older upload finishes.
    var snapshot = JSON.parse(JSON.stringify(payload));
    return serial(key, async function () {
      assertDraft(owner, draftId, generation);
      var localSaved = false;
      try { await localWrite('drafts', { key: key, owner: owner, id: draftId, draft: snapshot, updatedAt: Date.now() }, null, function () { assertDraft(owner, draftId, generation); }); localSaved = true; } catch (_) {}
      try {
        assertDraft(owner, draftId, generation);
        if (!Object.prototype.hasOwnProperty.call(versions, key)) {
          try { await getDraft(draftId); } catch (e) { if (e.status !== 404) throw e; }
        }
        assertDraft(owner, draftId, generation);
        if (versions[key] === 'conflict') throw failure('conflict', 412);
        var headers = { 'Content-Type': 'application/json' };
        if (versions[key]) headers['If-Match'] = versions[key]; else headers['If-None-Match'] = '*';
        var result = await request('/drafts/' + keyPart(draftId), { method: 'PUT', headers: headers, body: JSON.stringify(snapshot) }, false, owner);
        assertDraft(owner, draftId, generation);
        versions[key] = result.etag || (result.draft && result.draft.etag);
        if (!versions[key]) { versions[key] = 'conflict'; throw failure('missing_version'); }
        result.localSaved = localSaved;
        return result;
      } catch (e) {
        try { assertDraft(owner, draftId, generation); }
        catch (changed) { changed.localSaved = localSaved; throw changed; }
        if (e.status === 412) versions[key] = 'conflict';
        e.localSaved = localSaved; throw e;
      }
    });
  }
  async function saveMovie(blob, metadata) {
    var owner = identity(), meta = Object.assign({}, metadata), localSaved = false;
    meta.clientId = meta.clientId || id();
    var localKey = owner + '/' + meta.clientId;
    if (!blob || !blob.size) throw failure('empty_media');
    assertOwner(owner);
    try {
      await localWrite('movies', { key: localKey, owner: owner, id: meta.clientId, blob: blob, meta: meta, createdAt: Date.now() });
      localSaved = true;
    } catch (_) {}
    try {
      var result = await request('/movies', { method: 'POST', headers: {
        'Content-Type': blob.type || 'video/webm', 'X-Dubbing-Meta': encodeURIComponent(JSON.stringify(meta)), 'X-Dubbing-Size': String(blob.size),
      }, body: blob }, 'upload', owner);
      try { await localWrite('movies', null, localKey); } catch (_) {}
      assertOwner(owner);
      result.localSaved = localSaved;
      return result;
    } catch (e) { e.localSaved = localSaved; e.clientId = meta.clientId; throw e; }
  }
  function audioPath(draftId, audioId) { return '/drafts/' + keyPart(draftId) + '/audio/' + keyPart(audioId); }
  function onAccountChange(fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; }
  function errorText(error, english) {
    var status = error && error.status, code = error && error.code || '';
    if (status === 401 || code === 'auth_required') return english ? 'Sign in to save to your account.' : '계정에 보관하려면 로그인해 주세요.';
    if (code === 'account_changed') return english ? 'The account changed. Reopen your practice.' : '계정이 바뀌었어요. 내 연습을 다시 열어 주세요.';
    if (code === 'draft_deleted') return english ? 'This practice was deleted. Start a new practice to save again.' : '삭제된 연습이에요. 새로 연습을 시작한 뒤 저장해 주세요.';
    if (code === 'local_cleanup') return english ? 'Could not finish removing the practice on this device. Retry deleting it.' : '이 기기의 연습을 모두 삭제하지 못했어요. 삭제를 다시 눌러 주세요.';
    if (status === 412 || status === 428 || code === 'conflict') return english ? 'This practice changed on another screen. Reload the saved practice first.' : '다른 화면에서 연습이 바뀌었어요. 저장된 연습을 다시 불러와 주세요.';
    if (status === 413) return english ? 'This recording is too large. Download it to keep it.' : '저장 한도보다 큰 녹음이에요. 파일로 내려받아 보관해 주세요.';
    if (status === 429 || status === 507 || /limit|quota/.test(code)) return english ? 'Your library is full. Download or remove an old work, then retry.' : '보관함이 가득 찼어요. 이전 작품을 내려받거나 삭제한 뒤 다시 저장해 주세요.';
    return english ? 'Could not save to your account. Check the connection and retry.' : '계정에 저장하지 못했어요. 연결을 확인하고 다시 저장해 주세요.';
  }
  window.MangoiDubLibrary = {
    identity: identity, scope: identity, hasAccount: function () { return identity() !== 'guest'; },
    newId: id, errorText: errorText, onAccountChange: onAccountChange,
    listMovies: function () { return request('/movies'); },
    getMovie: function (movieId) { return request('/movies/' + keyPart(movieId), {}, true); },
    saveMovie: saveMovie,
    deleteMovie: function (movieId) { return request('/movies/' + keyPart(movieId), { method: 'DELETE' }); },
    listDrafts: function () { return request('/drafts'); }, getDraft: getDraft, saveDraft: saveDraft,
    deleteDraft: function (draftId) { return removeDraft(draftId, true); },
    uploadAudio: async function (draftId, audioId, blob) {
      var owner = identity(), generation = draftGeneration(owner, draftId);
      var result = await request(audioPath(draftId, audioId), { method: 'PUT', headers: { 'Content-Type': blob.type || 'audio/webm', 'X-Dubbing-Size': String(blob.size) }, body: blob }, 'upload', owner);
      assertDraft(owner, draftId, generation);
      return result;
    },
    getAudio: function (draftId, audioId) { return request(audioPath(draftId, audioId), {}, true); },
    removeAudio: function (draftId, audioId) { return request(audioPath(draftId, audioId), { method: 'DELETE' }); },
    listLocalMovies: async function () { var owner = identity(); var result = await localRead('movies', owner); assertOwner(owner); return result || []; },
    removeLocalMovie: function (movieId) { return localWrite('movies', null, identity() + '/' + keyPart(movieId)); },
    getLocalDraft: async function (draftId) { var owner = identity(); var result = await localRead('drafts', owner, draftId); assertOwner(owner); return result || null; },
    listLocalDrafts: async function () { var owner = identity(); var result = await localRead('drafts', owner); assertOwner(owner); return result || []; },
    removeLocalDraft: function (draftId) { return removeDraft(draftId, false); },
  };
  window.addEventListener(DELETE_NOTICE, function (event) { receiveDraftDeletion(event.detail); });
  window.addEventListener('storage', function (event) {
    checkAccount();
    if (event.key === DELETE_NOTICE && event.newValue) {
      try { receiveDraftDeletion(JSON.parse(event.newValue)); } catch (_) {}
    }
  });
  window.addEventListener('focus', checkAccount);
  window.addEventListener('mangoi:auth-changed', checkAccount);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkAccount(); });
  if (window.setInterval) window.setInterval(checkAccount, 1000);
})();
