/* ═══════════════════════════════════════════════════════════════════════
   🎥🤖 adm-student-track.js — 관리자 «학생관리» 안 「학생 구분 — 화상+AI / AI만」 (2026-09-24)

   [무엇] 본사가 조직(지사 → 대리점)별로 두 무리의 인원을 막대로 비교하고(샘플 4),
          대리점을 누르면 그 학생 명부를 탭으로 나눠 봅니다(샘플 1 + 배지 샘플 2).
   [판정] 서버 정본 src/student-track.ts — A.i 사용료 청구와 같은 규칙. ⛔ 여기서 다시 판정하지 않는다.
   [API]  이미 있는 /api/admin/students/unified 에 선택 파라미터만 붙인다(새 주소 0개).
            summary_only=1 → 조직별 인원 · shop=<이름>&track=1 → 그 대리점 명부 + 행마다 track
   [관리자 화면 함정 — CLAUDE.md 2장]
     · 카드 안 <button> 은 전역 파랑 알약 규칙(!important)에 먹힌다 → 누를 것은 <a role="button">.
     · 인라인 background: 는 옛 다크 규칙에 걸린다 → background-color: 로.
     · 어두운 인라인 배경은 페인터가 밝힌다 → 막대색은 휘도 0.16 이상의 중간 톤만 쓴다.
     · 스타일은 body 에 붙인다(admin-inline-c.css 가 body 안에서 링크돼 head 규칙이 진다).
     · 언어 이벤트는 document 에서 온다(bubbles:false) → document·window 둘 다 듣는다.
   ⛔ 상주 setInterval · body class MutationObserver 없음 — 펼칠 때 한 번 받는다.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__admStudentTrack) return;
  window.__admStudentTrack = true;

  var ROOT_ID = 'sm-student-track';
  var S = { sum: null, sumErr: null, openF: {}, shop: null, list: null, listErr: null, tab: 'all', loading: false };

  function EN() { return window.adminLang === 'en'; }
  function T(en, ko) { return EN() ? en : ko; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var TRK = {
    live_ai: { c: 'stk-live', en: 'Video + AI', ko: '화상+AI' },
    ai_only: { c: 'stk-ai', en: 'A.i-only sign-up', ko: 'A.i 단독 신청' },
    idle: { c: 'stk-none', en: 'No class record', ko: '수업 기록 없음' },   // (2026-09-25) 재원 · 화상 기록·A.i 신청 없음 — 청구 안 함
    none: { c: 'stk-none', en: 'Not enrolled', ko: '재원 아님' },
    unknown: { c: 'stk-unk', en: 'Unknown', ko: '확인 못 함' }
  };
  function trkOf(s) { var t = s && s.track; return TRK[t] ? t : 'unknown'; }

  function injectStyle() {
    if (document.getElementById('stk-style')) return;
    var st = document.createElement('style');
    st.id = 'stk-style';
    var R = '#' + ROOT_ID + ' ';
    st.textContent = [
      R + '.stk-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:10px}',
      R + '.stk-kpi{border:1px solid #d7e3dc;border-radius:10px;padding:10px 12px;display:block}',
      R + '.stk-kpi.l{background-color:#eef8f4}',
      R + '.stk-kpi.a{background-color:#f4f0fd;border-color:#ddd3f5}',
      R + '.stk-kpi b{display:block;font-size:24px;font-variant-numeric:tabular-nums}',
      R + '.stk-kpi small{display:block;font-size:12px}',
      R + '.stk-row{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(90px,2fr) 110px;gap:10px;align-items:center;padding:6px 4px;border-top:1px solid #e7ecf1;font-size:12.5px;text-decoration:none;cursor:pointer}',
      R + '.stk-row.sh{padding-left:22px}',
      R + '.stk-row.fr{font-weight:700}',
      R + '.stk-row .nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      R + '.stk-row .n{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}',
      R + '.stk-bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background-color:#e7ecf1}',
      R + '.stk-bar i{display:block;height:100%}',
      R + '.stk-bar .l{background-color:#2a9d80}',
      R + '.stk-bar .a{background-color:#8b6fd6}',
      R + '.stk-seg{display:flex;flex-wrap:wrap;gap:4px;padding:4px;border-radius:9px;background-color:#eef1f5;margin:8px 0}',
      R + '.stk-seg a{flex:1 1 90px;text-align:center;padding:6px 8px;border-radius:7px;font-size:12.5px;cursor:pointer;text-decoration:none}',
      R + '.stk-seg a.on{background-color:#ffffff;font-weight:700;box-shadow:0 1px 2px rgba(0,0,0,.08)}',
      R + '.stk-pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap}',
      R + '.stk-live{background-color:#dff3ec}',
      R + '.stk-ai{background-color:#ece6fb}',
      R + '.stk-none{background-color:#eef1f5}',
      R + '.stk-unk{background-color:#fbf1d6}',
      R + '.stk-srow{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:6px 4px;border-top:1px solid #e7ecf1;font-size:12.5px}',
      R + '.stk-srow b{flex:1;min-width:0}',
      R + '.stk-note{font-size:11.5px;line-height:1.6;margin-top:6px}',
      R + '.stk-back{display:inline-block;margin-bottom:6px;font-size:12.5px;cursor:pointer}',
      /* 관리자 전역 링크 밑줄 규칙을 이긴다 — 누를 수 있는 줄은 밑줄 없이(▸ 표시·커서로 알린다). */
      R + 'a[data-stk]{text-decoration:none !important}'
    ].join('\n');
    document.body.appendChild(st);
  }

  function bar(l, a) {
    var t = l + a;
    if (!t) return '<span class="stk-bar"></span>';
    var lp = Math.round(l * 1000 / t) / 10;
    return '<span class="stk-bar" aria-hidden="true"><i class="l" style="width:' + lp + '%"></i><i class="a" style="width:' + (Math.round((100 - lp) * 10) / 10) + '%"></i></span>';
  }

  function getJson(url) {
    return fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('http_' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || j.ok !== true) throw new Error((j && j.error) || 'load_failed');
      return j;
    });
  }

  function body() { return document.getElementById('stk-body'); }

  function paintSummary() {
    var el = body(); if (!el) return;
    if (S.sumErr) { el.innerHTML = '<div class="stk-note">' + esc(T('Could not load. (', '불러오지 못했습니다. (') + S.sumErr + ')') + '</div>'; return; }
    var ts = S.sum && S.sum.track_summary;
    if (!ts) { el.innerHTML = '<div class="stk-note">' + esc(T('Loading...', '불러오는 중...')) + '</div>'; return; }
    if (!ts.ok) {
      el.innerHTML = '<div class="stk-note">' + esc(T('Could not check video classes right now. Try again shortly.',
        '지금은 화상수업 여부를 확인하지 못했습니다. 잠시 뒤 다시 펼쳐 주세요.')) + '</div>';
      return;
    }
    var byF = {}, order = [];
    (ts.orgs || []).forEach(function (o) {
      var f = o.franchise || '';
      if (!byF[f]) { byF[f] = { l: 0, a: 0, shops: [] }; order.push(f); }
      byF[f].l += o.live; byF[f].a += o.ai_only; byF[f].shops.push(o);
    });
    order.sort(function (x, y) { return (byF[y].l + byF[y].a) - (byF[x].l + byF[x].a); });
    var h = '<div class="stk-kpis">'
      + '<div class="stk-kpi l"><b>' + ts.live + '</b><small>🎥 ' + esc(T('Video + AI', '화상+AI')) + '</small>'
      + '<small>' + esc(T('AI included in video tuition', 'A.i 는 화상 수강료에 포함')) + '</small></div>'
      + '<div class="stk-kpi a"><b>' + ts.ai_only + '</b><small>🤖 ' + esc(T('A.i-only sign-up', 'A.i 단독 신청')) + '</small>'
      + '<small>' + esc(T('Signed up · AI usage fee applies', '신청한 학생 · A.i 사용료 대상')) + '</small></div>'
      + '<div class="stk-kpi"><b>' + (ts.idle || 0) + '</b><small>' + esc(T('No class record', '수업 기록 없음')) + '</small>'
      + '<small>' + esc(T('Enrolled · no video class, not signed up · not billed', '재원 · 화상 기록·A.i 신청 없음 · 청구 안 함')) + '</small></div></div>';
    h += '<div class="stk-note">' + esc(T('By branch — video + AI / A.i-only sign-ups. Open a branch, then pick an academy to see its students.',
      '지사별 — 화상+AI / A.i 단독 신청. 지사를 펼친 뒤 대리점을 누르면 그 학생들이 나옵니다.')) + '</div>';
    order.forEach(function (f) {
      var g = byF[f], open = !!S.openF[f];
      h += '<a class="stk-row fr" role="button" tabindex="0" data-stk="fr" data-f="' + esc(f) + '">'
        + '<span class="nm">' + (open ? '▾ ' : '▸ ') + esc(f || T('No branch', '지사 미지정')) + ' <span style="font-weight:400">(' + g.shops.length + ')</span></span>'
        + bar(g.l, g.a) + '<span class="n">' + g.l + ' / ' + g.a + '</span></a>';
      if (open) g.shops.forEach(function (o) {
        h += '<a class="stk-row sh" role="button" tabindex="0" data-stk="sh" data-shop="' + esc(o.shop_name) + '">'
          + '<span class="nm">' + esc(o.shop_name || T('No academy', '대리점 미지정')) + '</span>'
          + bar(o.live, o.ai_only) + '<span class="n">' + o.live + ' / ' + o.ai_only + '</span></a>';
      });
    });
    h += '<div class="stk-note">' + esc(T('Video = booked class, or a video class in the last ' + (ts.lookback_days || 30) + ' days. Same rule as the AI usage invoice.',
      '화상 = 예약된 수업이 있거나 최근 ' + (ts.lookback_days || 30) + '일 안에 화상수업 기록. A.i 사용료 청구서와 같은 기준입니다.')) + '</div>';
    el.innerHTML = h;
  }

  function paintShop() {
    var el = body(); if (!el) return;
    var back = '<a class="stk-back" role="button" tabindex="0" data-stk="back">← ' + esc(T('All branches', '지사 목록으로')) + '</a>';
    var title = '<div style="font-weight:700;font-size:13px">📍 ' + esc(S.shop || T('No academy', '대리점 미지정')) + '</div>';
    if (S.listErr) { el.innerHTML = back + title + '<div class="stk-note">' + esc(T('Could not load. (', '불러오지 못했습니다. (') + S.listErr + ')') + '</div>'; return; }
    if (!S.list) { el.innerHTML = back + title + '<div class="stk-note">' + esc(T('Loading...', '불러오는 중...')) + '</div>'; return; }
    var all = S.list.students || [];
    var cnt = { all: all.length, live_ai: 0, ai_only: 0, idle: 0, none: 0, unknown: 0 };
    all.forEach(function (s) { cnt[trkOf(s)]++; });
    var tabs = [['all', T('All', '전체')], ['live_ai', '🎥 ' + T('Video + AI', '화상+AI')], ['ai_only', '🤖 ' + T('A.i-only sign-up', 'A.i 단독 신청')]];
    if (cnt.idle) tabs.push(['idle', T('No class record', '수업 기록 없음')]);
    if (cnt.none) tabs.push(['none', T('Not enrolled', '재원 아님')]);
    if (cnt.unknown) tabs.push(['unknown', '❓ ' + T('Unknown', '확인 못 함')]);
    if (!tabs.some(function (t) { return t[0] === S.tab; })) S.tab = 'all';
    var h = back + title + '<div class="stk-seg" role="tablist">' + tabs.map(function (t) {
      return '<a role="tab" tabindex="0" aria-selected="' + (t[0] === S.tab) + '" data-stk="tab" data-tab="' + t[0] + '"'
        + (t[0] === S.tab ? ' class="on"' : '') + '>' + esc(t[1]) + ' ' + cnt[t[0]] + '</a>';
    }).join('') + '</div>';
    var list = S.tab === 'all' ? all : all.filter(function (s) { return trkOf(s) === S.tab; });
    if (!list.length) h += '<div class="stk-note">' + esc(T('No students found.', '해당하는 학생이 없습니다.')) + '</div>';
    list.slice(0, 300).forEach(function (s) {
      var id = s.user_id || '';
      var nm = (s.name && String(s.name) !== String(id)) ? s.name : T('(no name on file)', '이름 미등록');
      var k = TRK[trkOf(s)];
      h += '<div class="stk-srow"><b>' + esc(nm) + '</b><span>' + esc(id) + '</span>'
        + '<span class="stk-pill ' + k.c + '">' + esc(T(k.en, k.ko)) + '</span>'
        + (s.status ? '<span>' + esc(s.status) + '</span>' : '') + '</div>';
    });
    if (list.length > 300) h += '<div class="stk-note">' + esc(T('Showing 300 of ' + list.length + '.', list.length + '명 중 300명 표시.')) + '</div>';
    if (S.list.track_ok === false) h += '<div class="stk-note">' + esc(T('Could not check video classes right now, so students are marked «Unknown».',
      '지금은 화상수업 여부를 확인하지 못해 «확인 못 함» 으로 표시했습니다.')) + '</div>';
    el.innerHTML = h;
  }

  function paint() { if (S.shop !== null) paintShop(); else paintSummary(); }

  function loadSummary() {
    if (S.loading) return;
    S.loading = true; S.sumErr = null; paint();
    getJson('/api/admin/students/unified?summary_only=1')
      .then(function (j) { S.sum = j; })
      .catch(function (e) { S.sumErr = (e && e.message) || 'error'; })
      .then(function () { S.loading = false; paint(); });
  }
  function openShop(shop) {
    S.shop = shop; S.list = null; S.listErr = null; S.tab = 'all'; paint();
    var q = '?track=1&shop=' + encodeURIComponent(shop === '' ? '__none__' : shop);
    getJson('/api/admin/students/unified' + q)
      .then(function (j) { if (S.shop === shop) S.list = j; })
      .catch(function (e) { if (S.shop === shop) S.listErr = (e && e.message) || 'error'; })
      .then(function () { if (S.shop === shop) paint(); });
  }

  function onAct(t) {
    var k = t.getAttribute('data-stk');
    if (k === 'fr') { var f = t.getAttribute('data-f') || ''; S.openF[f] = !S.openF[f]; paintSummary(); }
    else if (k === 'sh') openShop(t.getAttribute('data-shop') || '');
    else if (k === 'back') { S.shop = null; paintSummary(); }
    else if (k === 'tab') { S.tab = t.getAttribute('data-tab') || 'all'; paintShop(); }
  }

  function mount() {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;
    injectStyle();
    root.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-stk]');
      if (!t || !root.contains(t)) return;
      e.preventDefault();
      onAct(t);
    });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var t = e.target && e.target.closest && e.target.closest('[data-stk]');
      if (!t) return;
      e.preventDefault();
      onAct(t);
    });
    root.addEventListener('toggle', function () { if (root.open && !S.sum && !S.loading) loadSummary(); });
    if (root.open) loadSummary();
    var re = function () { if (document.getElementById('stk-body')) paint(); };
    document.addEventListener('mangoi:lang-changed', re);
    window.addEventListener('mangoi:lang-changed', re);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
