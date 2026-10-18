/* ============================================================
   idx-vc-handover.js — 수업 중 화면에 «🤝 인수인계» 보여 주기 (2026-10-18, 개선안 3순위 ⑧)
   In-class handover for the teacher (EN/KO)

   왜: 강사 포털 «오늘 수업» 줄에는 인수인계(지난 목표 · 아직 연습 안 한 문장 · 복습 카드)가
       있는데(teacher.html handoverHtml), 수업에 «들어가면» 그 정보가 화면에서 사라졌습니다.
       A.i 친구·웜업에서 고쳐 준 문장을 강사가 «수업 중에» 다시 말하게 하려면 그 자리에 있어야 합니다.

   어디에: 강사 전용 «💡 AI 질문» 패널(#vcq-panel, index.html aiQuestionFab) 맨 위.
           ⛔ 새 떠 있는 상자를 만들지 않습니다 — 수업 화면에는 이미 독·드로어 손잡이·교재 화살표·
              별 버튼이 겹쳐 있어(CLAUDE.md 2장) 자리를 새로 잡으면 무언가를 덮습니다.
           인수인계가 있으면 그 버튼에 🤝 표시를 붙여 «열어 볼 것이 있다» 를 알립니다.

   재료: 강사 포털 API(/api/teacher/portal) 의 같은 응답 — 정본은 서버 src/teacher-handover.ts.
         ⛔ 화면이 uid 를 보내지 않습니다(권한 범위 = «이 강사의 오늘 수업» 그 자체).
         지금 방 번호와 «완전일치» 하는 수업 한 줄의 handover 만 씁니다.

   ⛔ 서버 글자는 textContent 로만 넣습니다(innerHTML 금지).
   ⛔ 상주 setInterval · body class MutationObserver 금지(홈을 멎게 한 전력) — 입장 순간부터
      «끝이 있는» 확인(최대 20번)만 합니다.
   ⚠️ 문구는 teacher.html 의 handoverHtml 과 «같은 말» 입니다 — 하니스가 두 함수를 함께 돌려 대조합니다.
   ============================================================ */
(function (w, d) {
  'use strict';
  if (w.__mgVcHandover) return;
  w.__mgVcHandover = true;

  var POLL_MS = 1500, POLL_MAX = 20;

  function isEn() { try { return (w.getLang ? w.getLang() : 'ko') === 'en'; } catch (e) { return false; } }
  function isTeacher() { try { return (typeof w.vcIsTeacherRole === 'function') && !!w.vcIsTeacherRole(); } catch (e) { return false; } }
  function curRoom() {
    // ⚠️ vcRoomId 는 idx-main.js 의 «let» 이라 window 속성이 아닙니다 — 어휘 바인딩으로 읽습니다.
    try { return (typeof vcRoomId !== 'undefined' && vcRoomId) ? String(vcRoomId) : ''; } catch (e) { return ''; }
  }
  /* 예약된 수업 방만 묻습니다 — 연습방·공용방에는 인수인계가 원리상 없습니다. */
  function roomAsks(room) { return !!room && !/^(demo-|mangoi-class$)/i.test(room); }

  /* ── 정본: handover → 줄 목록(순수 함수) ─────────────────────────────
     반환: [{ ico, label, text, was? , note? }]  — 줄이 없으면 [] (그리지 않음)
     teacher.html handoverHtml 과 같은 판정·같은 문구. 다른 점은 «아직 연습 안 한 문장» 을
     서버가 준 만큼(최대 2개) 모두 보여 주는 것뿐입니다(수업 중에 바로 말해 보게). */
  function vchLines(h, en) {
    var T = function (e, k) { return en ? e : k; };
    var out = [];
    if (!h || typeof h !== 'object') return out;
    if (h.goal && h.goal.text) {
      out.push({ ico: '🎯', label: T('Last goal', '지난 목표'), text: String(h.goal.text),
        note: [h.goal.date ? String(h.goal.date) : '', (en && h.goal.lang === 'ko') ? '(Korean note)' : ''].filter(Boolean).join(' ') });
    }
    var f = h.fix;
    if (f && f.total > 0) {
      var un = (f.unfixed && f.unfixed.length) ? f.unfixed : [];
      if (f.unfixed_n > 0 && un.length) {
        for (var i = 0; i < un.length; i++) {
          out.push({ ico: '🔁', label: T('Not practiced yet', '아직 연습 안 한 문장'), was: String(un[i].from || ''), text: String(un[i].to || '') });
        }
        if (f.unfixed_n > un.length) {
          var more = f.unfixed_n - un.length;
          out[out.length - 1].note = T('(+' + more + ' more)', '(외 ' + more + '개)');
        }
      }
      out.push({ ico: '📝', label: T('Review cards', '복습 카드'),
        text: f.practiced > 0
          ? T('practiced ' + f.practiced + ' of ' + f.total, f.total + '장 중 ' + f.practiced + '장 말해 봄')
          : T('not practiced yet (' + f.total + ' cards)', '아직 안 함 (' + f.total + '장)') });
    }
    var st = h.story;
    if (st && st.n > 0) {
      out.push({ ico: '📖', label: T('Storybook writing (7 days)', '동화책 바꿔 쓰기 (7일)'),
        text: T(st.n + ' sentence' + (st.n > 1 ? 's' : '') + ' · ' + st.fixes + ' fix' + (st.fixes === 1 ? '' : 'es'),
                st.n + '문장 · 고친 곳 ' + st.fixes + '개'),
        was: st.last_was ? String(st.last_was) : '', note: st.last ? String(st.last) : '' });
    }
    return out;
  }
  w.__vchLines = vchLines;   // 하니스용

  /* ── 상태 ───────────────────────────────────────────────────────── */
  // S.state: 'idle' | 'loading' | 'ok' | 'none' | 'fail'
  var S = { room: '', state: 'idle', h: null, p: null };

  function pickHandover(d, room) {
    var list = (d && Array.isArray(d.classes)) ? d.classes : null;
    if (!list) return undefined;                    // 모양이 다르면 «모름»
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c && c.kind === 'class' && String(c.room_id || '') === room) return c.handover || null;
    }
    return null;                                     // 이 방은 오늘 내 수업이 아님(또는 인수인계 없음)
  }
  w.__vchPick = pickHandover;   // 하니스용

  function load(room) {
    if (S.room === room && S.p && S.state !== 'fail') return S.p;   // 실패했으면 다시 묻습니다
    S.room = room; S.state = 'loading'; S.h = null;
    S.p = fetch('/api/teacher/portal', { credentials: 'same-origin', cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        // ⚠️ fetch 는 403·500 에 reject 하지 않습니다 — r.ok 를 따로 봅니다.
        if (!r.ok) throw new Error('http-' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (S.room !== room) return;                 // 그 사이 방이 바뀜
        if (!d || d.ok !== true) throw new Error('not-ok');
        var h = pickHandover(d, room);
        if (h === undefined) throw new Error('shape');
        S.h = h; S.state = vchLines(h, false).length ? 'ok' : 'none';
      })
      .catch(function (e) {
        if (S.room !== room) return;
        S.state = 'fail'; S.h = null;
        try { console.warn('[vc-handover]', e && e.message); } catch (_) {}
      })
      .then(function () { if (S.room === room) { paintDot(); paintBox(); } });
    return S.p;
  }

  /* ── 그리기 ─────────────────────────────────────────────────────── */
  function ensureStyle() {
    if (d.getElementById('vch-style')) return;
    var st = d.createElement('style'); st.id = 'vch-style';
    st.textContent =
      '#vch-box{margin:0 0 10px;padding:9px 10px;border-radius:11px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.32)}'
      + '#vch-box .vch-h{font-size:13px;font-weight:800;color:#7dd3fc;margin:0 0 5px}'
      + '#vch-box .vch-l{font-size:12.5px;line-height:1.5;color:#e2e8f0;margin:3px 0;word-break:break-word}'
      + '#vch-box .vch-lb{font-weight:800;color:#fcd34d}'
      + '#vch-box .vch-was{text-decoration:line-through;color:#fca5a5}'
      + '#vch-box .vch-note{color:#94a3b8;font-size:11.5px}'
      + '#vch-box .vch-msg{font-size:12px;color:#94a3b8}'
      + '#vcq-fab .vch-dot{margin-left:2px}';
    (d.head || d.documentElement).appendChild(st);
  }

  function paintDot() {
    var fab = d.getElementById('vcq-fab');
    if (!fab) return;
    var dot = fab.querySelector('.vch-dot');
    var want = S.state === 'ok' && S.room === curRoom();
    if (want && !dot) {
      ensureStyle();
      dot = d.createElement('span'); dot.className = 'vch-dot'; dot.setAttribute('aria-hidden', 'true'); dot.textContent = '🤝';
      fab.appendChild(dot);
    } else if (!want && dot) { dot.parentNode.removeChild(dot); }
    if (want) fab.setAttribute('aria-label', isEn() ? 'AI questions — this student has a handover' : 'AI 질문 — 이 학생 인수인계 있음');
  }

  function el(tag, cls, txt) { var e = d.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function paintBox() {
    var panel = d.getElementById('vcq-panel');
    if (!panel) return;
    var box = d.getElementById('vch-box');
    var en = isEn();
    if (S.room !== curRoom() || S.state === 'idle' || S.state === 'none') {
      if (box) box.parentNode.removeChild(box);
      return;
    }
    ensureStyle();
    if (!box) {
      box = el('div'); box.id = 'vch-box';
      var anchor = panel.querySelector('.vcq-sub') || panel.querySelector('h4');
      if (anchor && anchor.nextSibling) panel.insertBefore(box, anchor.nextSibling);
      else panel.insertBefore(box, panel.firstChild);
    }
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(el('div', 'vch-h', '🤝 ' + (en ? 'Handover — this student' : '인수인계 — 이 학생')));
    if (S.state === 'loading') { box.appendChild(el('div', 'vch-msg', en ? 'Loading…' : '불러오는 중…')); return; }
    if (S.state === 'fail') {
      // 지어내지 않습니다 — «없다» 와 «못 물어봤다» 는 다른 사실입니다.
      box.appendChild(el('div', 'vch-msg', en ? 'Could not load the handover. It is still on your Teacher page.' : '인수인계를 불러오지 못했어요. 강사 페이지 «오늘 수업» 에는 그대로 있습니다.'));
      return;
    }
    var lines = vchLines(S.h, en);
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i], row = el('div', 'vch-l');
      row.appendChild(d.createTextNode(L.ico + ' '));
      row.appendChild(el('span', 'vch-lb', L.label));
      row.appendChild(d.createTextNode(': '));
      if (L.was) { row.appendChild(el('span', 'vch-was', L.was)); row.appendChild(d.createTextNode(' → ')); }
      row.appendChild(d.createTextNode(L.text));
      if (L.note) { row.appendChild(d.createTextNode(' ')); row.appendChild(el('span', 'vch-note', L.note)); }
      box.appendChild(row);
    }
  }

  /* ── 배선 ───────────────────────────────────────────────────────── */
  var pollN = 0, pollT = 0;
  function tryStart() {
    pollT = 0;
    if (!d.body.classList.contains('vc-in-call') && pollN > 2) { pollN = 0; return; }   // 수업을 떠났음
    var room = curRoom();
    if (isTeacher() && roomAsks(room)) { pollN = 0; load(room); return; }
    if (++pollN < POLL_MAX) pollT = setTimeout(tryStart, POLL_MS);
    else pollN = 0;
  }
  function onEnter() { if (pollT) clearTimeout(pollT); pollN = 0; pollT = setTimeout(tryStart, POLL_MS); }

  // 입장 순간은 showView('view-videocall-call') 로 압니다(body class 는 그 «뒤» 에 붙습니다).
  var _sv = w.showView;
  if (typeof _sv === 'function' && !_sv.__vchWrapped) {
    var wrapped = function (id) {
      var r = _sv.apply(this, arguments);
      try { if (id === 'view-videocall-call') onEnter(); } catch (e) {}
      return r;
    };
    wrapped.__vchWrapped = true;
    w.showView = wrapped;
  }

  // 💡 버튼을 누르면(패널이 열리면) 그 자리에 그립니다. 캡처 단계 — 패널 토글은 그 «뒤» 에 돕니다.
  d.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest || !t.closest('#vcq-fab')) return;
    setTimeout(function () {
      var panel = d.getElementById('vcq-panel');
      if (!panel || !panel.classList.contains('show')) return;
      var room = curRoom();
      if (!isTeacher() || !roomAsks(room)) return;
      // 못 불러왔으면 누를 때 한 번 더 묻습니다(회선이 잠깐 끊겼던 경우).
      if (S.room !== room || S.state === 'idle' || S.state === 'fail') { S.p = null; load(room); }
      paintBox(); paintDot();
    }, 0);
  }, true);

  // 🌐 언어를 바꾸면 다시 그립니다 — 관리자·홈 화면마다 발행처가 달라 둘 다 듣습니다.
  function onLang() { try { paintBox(); paintDot(); } catch (e) {} }
  w.addEventListener('mangoi:lang-changed', onLang);
  d.addEventListener('mangoi:lang-changed', onLang);

  // 이미 수업 화면이면(새로고침 등) 한 번 시작합니다.
  try { if (d.body && d.body.classList.contains('vc-in-call')) onEnter(); } catch (e) {}
})(window, document);
