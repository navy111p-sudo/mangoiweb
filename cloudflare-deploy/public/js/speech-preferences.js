(function () {
  'use strict';
  var valid = function (v) { return Number.isInteger(v) && v >= 1 && v <= 5; };
  function identity() {
    try {
      var token = localStorage.getItem('mango_token') || '';
      var uid = '';
      if (token) {
        try { uid = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).uid || ''; } catch (_) {}
      }
      if (!uid) {
        var u = JSON.parse(localStorage.getItem('mango_user') || localStorage.getItem('mangoi_logged_user') || 'null');
        uid = u && (u.user_id || u.uid || u.id) || '';
      }
      return { uid: String(uid).toLowerCase(), token: token };
    } catch (_) { return { uid: '', token: '' }; }
  }
  window.MangoiSpeechPreferences = {
    create: function (app, fallback, onChange) {
      var account = identity();
      var key = 'mangoi_speech_rate_v1:' + encodeURIComponent(account.uid || 'guest') + ':' + app;
      var storage;
      try { storage = account.uid ? localStorage : sessionStorage; } catch (_) {}
      var cached = null, revision = 0, queue = Promise.resolve();
      try { cached = JSON.parse(storage.getItem(key)); } catch (_) {}
      var pref = { level: cached && valid(cached.level) ? cached.level : fallback, loaded: false };
      var dirty = !!(cached && valid(cached.level) && cached.dirty);
      function remember() { try { storage.setItem(key, JSON.stringify({ level: pref.level, dirty: dirty })); } catch (_) {} }
      function sameAccount() { return identity().uid === account.uid; }
      async function call(method, level) {
        var token = identity().token;
        if (!account.uid || !token || !sameAccount()) throw new Error('signed_out');
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 4000);
        try {
          var response = await fetch('/api/student/speech-preferences?app=' + app, {
            method: method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: method === 'PUT' ? JSON.stringify({ level: level }) : undefined,
            cache: 'no-store', keepalive: method === 'PUT', signal: controller.signal
          });
          var data = await response.json();
          if (!response.ok || !data.ok) throw new Error('save_failed');
          return data;
        } finally { clearTimeout(timer); }
      }
      function save() {
        var level = pref.level, version = revision;
        queue = queue.then(function () { return call('PUT', level); }).then(function () {
          if (revision === version) { dirty = false; remember(); }
        }).catch(function () { /* Local account cache survives outages; retry on next visit/online. */ });
        return queue;
      }
      pref.set = function (level) {
        if (!valid(level) || !sameAccount()) return;
        revision++; pref.level = level; dirty = true; remember(); save();
      };
      pref.ready = (async function () {
        try {
          if (dirty) { await save(); return; }
          var version = revision;
          var data = await call('GET');
          if (version !== revision || !sameAccount()) return;
          if (valid(data.level)) { pref.level = data.level; dirty = false; remember(); onChange(pref.level); }
        } catch (_) { /* Use only this account's cached preference on network failure. */ }
        finally { pref.loaded = true; }
      })();
      window.addEventListener('online', function () { if (dirty && sameAccount()) save(); });
      return pref;
    }
  };
})();
