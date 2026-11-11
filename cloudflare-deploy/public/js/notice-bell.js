/* 🔔 notice-bell.js — 관리자·매니저 화면 오른쪽 위 «알림 종» (2026-11-11, 필리핀 매니저 건의:
 *    「옛 LMS 의 MESSAGES 종처럼 망고아이에도 알림을」). 지금 싣는 알림은 «강사 미입장» 하나 —
 *    결석 감지 크론이 «학생은 들어왔는데 강사가 없다» 로 확정한 수업(최근 7일). 「확인」은 모두가 함께 본다.
 *  서버 정본 src/notice-inbox.ts — GET/POST /api/admin/no-shows/inbox
 *  ⚠️ 401·403(강사·지사·대리점)이면 아무것도 안 그리고 다시 묻지 않는다.
 *  ⚠️ Shadow DOM — admin-inline-c.css 의 전역 button !important 규칙에 안 먹히게(CLAUDE.md 2장).
 *  ⚠️ 화면이 보일 때만 1분에 한 번 묻는다. body class·MutationObserver 를 쓰지 않는다(홈 정지 전력).
 *  ⚠️ 서버 글자는 textContent 로만 넣는다(이름은 사람이 적은 값).
 */
(function () {
  'use strict';
  if (window.__noticeBellOn) return;
  window.__noticeBellOn = true;
  var API = '/api/admin/no-shows/inbox', POLL_MS = 60000;
  var last = null, isOpen = false, timer = 0, stopped = false;
  var host, btn, badge, panel, head, list;

  function en() { var l = window.adminLang; if (l !== 'en' && l !== 'ko') l = (document.documentElement.lang || '').slice(0, 2); return l === 'en'; }
  function t(ko, e) { return en() ? e : ko; }
  function kst(ms) { return new Date(ms + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' '); }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }

  function mount() {
    host = document.createElement('div');
    host.id = 'notice-bell';
    var sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = '<style>' +
      ':host{position:fixed;top:8px;right:12px;z-index:2147482000;font:14px/1.45 system-ui,sans-serif;color-scheme:light}' +
      '*{box-sizing:border-box}' +
      '.bell{position:relative;width:42px;height:42px;border-radius:50%;border:1px solid #c7d2fe;background:#fff;color:#1e3a8a;cursor:pointer;font-size:20px;line-height:1;box-shadow:0 2px 8px rgba(15,23,42,.18);padding:0}' +
      '.bell:focus-visible{outline:3px solid #2563eb;outline-offset:2px}' +
      '.badge{position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#dc2626;color:#fff;font:700 12px/20px system-ui,sans-serif}' +
      '.panel{position:fixed;top:58px;right:12px;width:370px;max-width:calc(100% - 24px);max-height:min(70vh,560px);overflow:auto;background:#fff;color:#334155;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.25)}' +
      '.head{position:sticky;top:0;background:#fff;text-align:center;font-weight:700;color:#334155;padding:12px;border-bottom:2px solid #2563eb}' +
      '.item{display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid #e2e8f0}' +
      '.icon{flex:none;font-size:20px;line-height:1.2}' +
      '.body{flex:1;min-width:0}' +
      '.time{color:#1d4ed8;font-weight:700}' +
      '.text{color:#475569;margin-top:2px}' +
      '.warn{color:#b91c1c;font-size:12.5px;margin-top:3px}' +
      '.foot{text-align:right;margin-top:4px;font-size:12.5px;color:#1d4ed8}' +
      '.foot button{font:inherit;font-weight:700;color:#fff;background:#2563eb;border:0;border-radius:6px;padding:6px 12px;min-height:32px;cursor:pointer}' +
      '.foot button:disabled{opacity:.6;cursor:default}' +
      '.empty,.note{padding:14px;color:#64748b;text-align:center}' +
      '.note{font-size:12px;padding:10px 14px}' +
      '[hidden]{display:none!important}' +
      '</style><button class="bell" type="button" aria-haspopup="true" aria-expanded="false">🔔<span class="badge" hidden></span></button>' +
      '<div class="panel" role="region" hidden><div class="head"></div><div class="list"></div></div>';
    btn = sh.querySelector('.bell'); badge = sh.querySelector('.badge');
    panel = sh.querySelector('.panel'); head = sh.querySelector('.head'); list = sh.querySelector('.list');
    btn.addEventListener('click', function () { toggle(!isOpen); });
    // document 에 건다 — 「확인」을 누르면 그 버튼이 다시 그려져 포커스가 body 로 빠지기 때문(브라우저 실측)
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) { toggle(false); btn.focus(); } });
    // 바깥을 누르면 닫는다(종 안을 누른 것은 composedPath 에 host 가 있다)
    document.addEventListener('click', function (e) {
      if (isOpen && e.composedPath && e.composedPath().indexOf(host) < 0) toggle(false);
    });
    document.body.appendChild(host);
  }

  function toggle(on) {
    isOpen = on; panel.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { paint(); load(); }
  }

  function paint() {
    if (!host || !last) return;
    var n = last.unread || 0;
    badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n);
    var lbl = t('알림 ' + n + '건 미확인', 'Notifications · ' + n + ' unconfirmed');
    btn.setAttribute('aria-label', lbl); btn.title = lbl;
    panel.setAttribute('aria-label', t('알림', 'Notifications'));
    if (!isOpen) return;
    head.textContent = t('알림', 'MESSAGES') + ' (' + last.items.length + ')';
    var out = [];
    if (!last.items.length) out.push(el('div', 'empty', t('최근 7일 동안 알림이 없습니다.', 'No alerts in the last 7 days.')));
    last.items.forEach(function (it) {
      var row = el('div', 'item'), body = el('div', 'body'), foot = el('div', 'foot');
      row.appendChild(el('div', 'icon', '⚠️'));
      body.appendChild(el('div', 'time', kst(it.at)));
      body.appendChild(el('div', 'text', en() ? it.en : it.ko));
      if (it.unreached) body.appendChild(el('div', 'warn', t('📵 강사에게 알림이 닿지 않았습니다 — 직접 연락해 주세요.', '📵 The alert did not reach the teacher — please contact them directly.')));
      if (it.acked_by) {
        foot.textContent = t('확인됨', 'Confirmed') + ' · ' + it.acked_by;
      } else {
        var b = el('button', '', t('확인', 'Confirm'));
        b.type = 'button';
        b.addEventListener('click', function () { ack(it, b); });
        foot.appendChild(b);
      }
      body.appendChild(foot); row.appendChild(body); out.push(row);
    });
    out.push(el('div', 'note', t('강사 미입장(학생은 입장, 시작 +10분까지 강사 없음) · 최근 7일',
                                 'Teacher no-show (student joined, no teacher by +10 min) · last 7 days')));
    list.replaceChildren.apply(list, out);
  }

  function take(d) {
    if (!d || d.ok !== true || !Array.isArray(d.items)) return;
    last = d;
    if (!host) mount();
    paint();
  }

  function stop() {
    stopped = true; clearInterval(timer);
    if (host) { host.remove(); host = null; }
  }

  function load() {
    if (stopped) return;
    fetch(API, { credentials: 'include', cache: 'no-store' }).then(function (r) {
      if (r.status === 401 || r.status === 403) { stop(); return null; }
      return r.ok ? r.json() : null;
    }).then(take).catch(function () { /* 회선 문제 — 다음 차례에 다시 */ });
  }

  function ack(it, b) {
    b.disabled = true;
    fetch(API, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || d.ok !== true || !d.ack) throw new Error('ack');
        it.acked_by = d.ack.acked_by; it.acked_at = d.ack.acked_at;
        last.unread = last.items.filter(function (x) { return !x.acked_by; }).length;
        paint();
      })
      .catch(function () { b.disabled = false; b.textContent = t('실패 — 다시 누르기', 'Failed — try again'); });
  }

  // manager.html 은 «있을 때만 싣는» 로더가 첫 응답을 넘겨준다(같은 요청을 두 번 안 하려고)
  var first = window.__noticeBellFirst; window.__noticeBellFirst = null;
  if (first) take(first); else load();
  timer = setInterval(function () { if (!document.hidden) load(); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();
