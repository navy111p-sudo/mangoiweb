// ═══════════════════════════════════════════════════════════════
// adm-perf.js — 관리자 메뉴 로딩 체감속도 개선 (2026-07-15)
//
//   문제: 메뉴(카드)를 열 때마다 서버에서 매번 새로 불러오고, 일부 엔드포인트는
//         무거워서(외부 Neo4j·대량 집계) 오래 걸리거나, 서버가 느리면 스피너가
//         무한정 도는 것처럼 보임.
//
//   해결(전역 fetch 1곳에서):
//     ① 타임아웃 — /api/admin/* 요청이 12초를 넘으면 중단하고 명확한 에러 응답으로
//        변환 → 로더의 catch 가 실행되어 "불러오는 중" 스피너가 반드시 해제됨.
//     ② 클라이언트 캐시 — 무겁고 읽기전용인 분석 GET 을 60초 메모리 캐시.
//        같은 메뉴를 다시 열면 네트워크 없이 즉시 표시.
//     ③ 변경 무효화 — 관리자 API 로 POST/PATCH/PUT/DELETE 가 나가면 캐시 전체를
//        비워, 수정 직후 목록이 옛 데이터로 남지 않도록 함.
//
//   ⚠️ scope-guard(adm-scope-guard.js) 다음에 로드되어야 함(그 위에서 한 번 더 감쌈).
//   ⚠️ 명시적 강제 새로고침(cache:'no-store')·비-GET 은 캐시를 건너뜀(항상 최신).
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__admPerf) return;
  window.__admPerf = { version: 1 };

  var TIMEOUT_MS = 12000;   // 무한 스피너 방지 상한
  var CACHE_TTL  = 60000;   // 클라이언트 캐시 유효기간(ms)

  // 캐시 대상: 무겁고 읽기전용인 분석 GET (prefix 매칭). 목록/수정 API 는 제외(최신성 우선).
  var CACHEABLE = [
    '/api/admin/retention/risk',
    '/api/admin/retention/care/logs',
    '/api/admin/churn',
    '/api/admin/dashboard',
    '/api/admin/kpi/',
    '/api/admin/stats/',
    '/api/admin/teachers/graph-list',
    '/api/admin/settlement/',
    '/api/admin/schedules'
  ];
  function isCacheable(path) {
    for (var i = 0; i < CACHEABLE.length; i++) {
      if (path === CACHEABLE[i] || path.indexOf(CACHEABLE[i]) === 0) return true;
    }
    return false;
  }

  var mem = Object.create(null);   // key(pathname+search) → { at, body, ctype, status }

  // ── ④ 「같은 순간에 나가는 똑같은 GET」 합치기 (2026-08-08) ──────────────
  //   위의 60초 캐시로는 못 막는 구멍이 하나 있다. **캐시가 채워지기 «전»** 에
  //   여러 카드가 동시에 같은 주소를 부르면 전부 캐시 미스라 전부 나간다(스탬피드).
  //
  //   실측(2026-08-08, admin.html 첫 화면, 지연 350ms·400KB/s 흉내):
  //     /api/admin/students/erp-list?limit=2000 (학생 2,000명 명부)이
  //     4ms 안에 **5건**씩, 모두 세 차례 = 15건 나갔다. 필리핀 회선에서 이건 그냥 낭비다.
  //
  //   그래서 «이미 날아가고 있는 요청»이 있으면 새로 보내지 않고 거기 올라탄다.
  //   ⚠️ 캐시가 아니다 — 응답이 오는 즉시 잊는다. 그래서 최신성이 나빠지지 않는다.
  //      (캐시 대상이 아닌 주소도 합쳐진다. 같은 순간의 같은 GET 은 어차피 같은 답이므로.)
  //   ⚠️ 호출자가 자기 signal 로 취소할 수 있는 요청은 합치지 않는다.
  //      한 명이 취소하면 같이 탄 사람들까지 죽는다.
  var inflight = Object.create(null);
  var coalesced = 0;

  function makeResp(ent) {
    return new Response(ent.body, {
      status: ent.status || 200,
      headers: { 'Content-Type': ent.ctype || 'application/json', 'X-Adm-Cache': 'hit' }
    });
  }

  var orig = window.fetch;
  window.fetch = function (input, init) {
    var u;
    try {
      var raw = (input && typeof input === 'object' && input.url) ? input.url : String(input);
      u = new URL(raw, location.origin);
    } catch (e) { return orig.apply(this, arguments); }

    // 관리자 API 만 대상
    if (!(u.origin === location.origin && u.pathname.indexOf('/api/admin/') === 0)) {
      return orig.apply(this, arguments);
    }

    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();

    // 변경 요청 → 캐시 전체 무효화 후 통과 (수정 직후 옛 데이터 방지)
    if (method !== 'GET' && method !== 'HEAD') {
      mem = Object.create(null);
      return orig.apply(this, arguments);
    }

    var key = u.pathname + u.search;
    var cacheable = isCacheable(u.pathname);
    var forceFresh = !!(init && init.cache === 'no-store');   // 강제 새로고침 존중

    // ① 신선한 캐시 → 즉시 반환 (네트워크 없음)
    if (cacheable && !forceFresh) {
      var ent = mem[key];
      if (ent && (Date.now() - ent.at) < CACHE_TTL) {
        return Promise.resolve(makeResp(ent));
      }
    }

    // ②-0 이미 같은 GET 이 날아가고 있으면 거기 올라탄다 (스탬피드 방지)
    var userSignal0 = init && init.signal;
    if (!userSignal0 && inflight[key]) {
      coalesced++;
      return inflight[key].then(function (r) { return r.clone(); });
    }

    // ② 네트워크 + 타임아웃
    var ac = new AbortController();
    var userSignal = init && init.signal;
    if (userSignal) {
      if (userSignal.aborted) ac.abort();
      else try { userSignal.addEventListener('abort', function () { ac.abort(); }); } catch (e) {}
    }
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; ac.abort(); }, TIMEOUT_MS);
    var newInit = Object.assign({}, init, { signal: ac.signal });

    var p = orig.call(this, input, newInit).then(function (resp) {
      clearTimeout(timer);
      // 캐시 저장 (200 + JSON 만) — 쓰기를 확정한 뒤 원본 응답 반환(연속 호출 레이스 방지)
      if (cacheable && resp && resp.ok) {
        var ct = '';
        try { ct = resp.headers.get('Content-Type') || ''; } catch (e) {}
        if (ct.indexOf('application/json') >= 0) {
          return resp.clone().text().then(function (txt) {
            mem[key] = { at: Date.now(), body: txt, ctype: ct, status: resp.status };
            return resp;
          }).catch(function () { return resp; });
        }
      }
      return resp;
    }).catch(function (err) {
      clearTimeout(timer);
      // 우리 타임아웃이 일으킨 abort 만 504 로 변환. 호출자가 자기 signal 로 취소한 abort 는 그대로 전파(취소 처리 보존).
      if (timedOut && err && err.name === 'AbortError') {
        // 오래된 캐시라도 있으면 그거라도 (무한 스피너보다 낫다)
        if (cacheable && mem[key]) return makeResp(mem[key]);
        return new Response(
          JSON.stringify({ ok: false, error: '요청 시간 초과 — 서버 응답이 지연됩니다. 잠시 후 다시 시도하세요.', timeout: true }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    });

    // 합칠 수 있는 요청이면 «날아가는 중» 목록에 올려 두고, 부르는 쪽마다 복제본을 준다.
    // 응답이 오는 즉시(성공이든 실패든) 목록에서 지운다 — 캐시가 아니다.
    if (!userSignal) {
      inflight[key] = p;
      var forget = function () { if (inflight[key] === p) delete inflight[key]; };
      p.then(forget, forget);
      return p.then(function (r) { return r.clone(); });
    }
    return p;
  };

  window.__admPerf.coalesced = function () { return coalesced; };   // 검증용: 합쳐서 «안 보낸» 요청 수
  console.info('[adm-perf] 관리자 fetch 캐시+타임아웃+합치기 레이어 활성 (캐시 ' + (CACHE_TTL / 1000) + 's, 타임아웃 ' + (TIMEOUT_MS / 1000) + 's)');
})();
