/**
 * mango.js — MangoV3 네임스페이스 기본 헬퍼
 * 이유: mango-rec.js 등 추가 모듈이 window.MangoV3.api() 를 필요로 함.
 *       이 파일은 반드시 mango-rec.js보다 먼저 로드되어야 함.
 */
(function () {
  if (window.MangoV3) return; // 이미 정의되어 있으면 유지

  // 교사/학생 식별자(간단 로컬 저장)
  function ensureUserId() {
    try {
      let uid = localStorage.getItem('mango_user_id');
      if (!uid) {
        uid = 'u_' + Math.random().toString(36).slice(2, 12);
        localStorage.setItem('mango_user_id', uid);
      }
      return uid;
    } catch (e) {
      return 'u_' + Math.random().toString(36).slice(2, 12);
    }
  }

  const _uid = ensureUserId();

  window.MangoV3 = {
    version: '3.0-shim',
    userId: _uid,

    // mango-rec.js가 함수 형태로도 호출함
    getUserId() { return _uid; },

    // 공용 API 호출 헬퍼
    // - body가 있으면 POST + JSON
    // - 없으면 GET
    async api(path, body) {
      const opts = {
        method: body ? 'POST' : 'GET',
        headers: { 'Accept': 'application/json' },
        credentials: 'include'
      };
      if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(path, opts);
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
      if (!res.ok) {
        const err = new Error('API ' + path + ' failed: ' + res.status);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },

    // 로깅
    log(...args) { console.log('[MangoV3]', ...args); },
    warn(...args) { console.warn('[MangoV3]', ...args); },
    error(...args) { console.error('[MangoV3]', ...args); }
  };

  console.log('[MangoV3] shim loaded, userId=', window.MangoV3.userId);
})();
