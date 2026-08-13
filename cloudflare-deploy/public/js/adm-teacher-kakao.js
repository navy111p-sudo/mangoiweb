/* ═══════════════════════════════════════════════════════════════════════
   💬 adm-teacher-kakao.js — 강사 카카오ID 명부 + 강사에게 바로 전달 (2026-08-13)

   ▶ 먼저 알아 두어야 할 사실 — 「카카오ID 로 자동 발송」은 불가능합니다.
     카카오톡에는 «카카오ID 로 메시지를 보내는» 공개 API 가 없습니다. 카카오 비즈메시지
     (알림톡/친구톡)는 «전화번호» 로 보내고, 그나마 한국 통신사 번호로 가입된 카카오
     계정에만 도달합니다. 필리핀 강사는 09xx 번호라 알림톡은 도달하지 않습니다.
     그래서 «실제로 되는» 두 경로만 씁니다.

       ① 문자 자동발송  — 번호가 있으면 서버(SOLAPI)가 즉시 보냅니다.
                          한국 010… → 국내문자 / 필리핀 09… → 해외문자(country=63)
       ② 카카오톡 전달  — 본문을 클립보드에 넣고 카카오톡을 열어 줍니다.
                          해당 카카오ID 채팅방에 «붙여넣기» 만 하면 됩니다.
                          보낸 뒤 [보냄] 을 누르면 이력에 남습니다.

     ②를 «자동» 이라고 표시하지 않는 이유는, 안 되는 걸 된다고 적어 두면 나중에
     "보냈는데 왜 안 갔지?" 를 아무도 추적할 수 없기 때문입니다. 화면에도 그대로 씁니다.

   ▶ 화면 진입점
     · 강사관리 → 강사 명부 상단 [💬 카카오·문자 전달] / [📇 카카오ID 일괄 반영]
     · 강사 명부 각 행의 노란 말풍선 버튼 (그 강사 한 명에게)

   ▶ 서버: /api/admin/teachers/kakao{,/backfill,/assign,/send,/mark-sent,/log}
           (src/teacher-kakao.ts — 인증게이트는 src/index.ts 에 등록돼 있음)
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var EN = function () {
    try { return (typeof window.getLang === 'function' ? window.getLang() : 'ko') === 'en'; }
    catch (e) { return false; }
  };
  var T = function (ko, en) { return EN() ? en : ko; };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 📋 클립보드 — navigator.clipboard 는 https + 사용자 제스처가 있어야 하고, 관리자
     화면이 인앱 브라우저에서 열리면 아예 없을 수도 있다. 그때는 textarea + execCommand
     로 떨어진다(구식이지만 아직 모든 브라우저가 지원). 복사 성공/실패를 반드시 돌려준다 —
     "복사됐겠거니" 하고 카톡을 열면 빈 채로 붙여넣게 된다. */
  function copyText(text) {
    return new Promise(function (resolve) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(fallback()); });
          return;
        }
      } catch (e) { /* 아래 폴백 */ }
      resolve(fallback());
      function fallback() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
          document.body.appendChild(ta);
          ta.select(); ta.setSelectionRange(0, ta.value.length);
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return !!ok;
        } catch (e) { return false; }
      }
    });
  }

  // 목록 표의 카카오ID 옆 📋 버튼
  window.tkCopy = function (text, btn) {
    copyText(String(text || '')).then(function (ok) {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = ok ? '✔' : '✖';
      setTimeout(function () { btn.textContent = old; }, 1200);
    });
  };

  /* 📱 카카오톡 열기 — 특정 «카카오ID 채팅방» 을 바로 여는 공개 딥링크는 없다.
     앱만 열어 주고, ID 는 이미 클립보드 옆에 적어 둔다.
     ⚠️ CLAUDE.md — 카톡·문자앱 인앱 브라우저에서 window.open 은 예외를 던지지 않고
        null 만 돌려준다. try/catch 로는 못 잡으므로 반환값을 보고 location.href 로 뗀다. */
  function openKakaoApp() {
    try {
      var w = window.open('kakaotalk://', '_blank');
      if (!w) location.href = 'kakaotalk://';
    } catch (e) {
      try { location.href = 'kakaotalk://'; } catch (e2) { /* 앱 미설치 — 조용히 무시 */ }
    }
  }

  // ═══ 공용 모달 껍데기 ════════════════════════════════════════════════
  function closeModal() {
    var m = document.getElementById('tk-modal');
    if (m) m.remove();
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') closeModal(); }

  function openModal(titleHtml, bodyHtml, width) {
    closeModal();
    var wrap = document.createElement('div');
    wrap.id = 'tk-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);' +
      'display:flex;align-items:center;justify-content:center;padding:18px';
    wrap.innerHTML =
      '<div role="dialog" aria-modal="true" style="background:#fff;border-radius:14px;width:100%;max-width:' + (width || 760) + 'px;' +
        'max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 50px rgba(0,0,0,.35);overflow:hidden">' +
        '<div style="display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #e5e7eb;background:#fffbeb">' +
          '<div style="font-size:15px;font-weight:800;color:#111827;flex:1">' + titleHtml + '</div>' +
          '<button type="button" id="tk-close" aria-label="' + T('닫기', 'Close') + '" ' +
            'style="border:0;background:#fff;border-radius:8px;width:30px;height:30px;font-size:16px;cursor:pointer;color:#374151">✕</button>' +
        '</div>' +
        '<div id="tk-body" style="padding:16px 18px;overflow:auto;flex:1"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.querySelector('#tk-body').innerHTML = bodyHtml;
    wrap.querySelector('#tk-close').onclick = closeModal;
    wrap.addEventListener('mousedown', function (e) { if (e.target === wrap) closeModal(); });
    document.addEventListener('keydown', onEsc);
    return wrap.querySelector('#tk-body');
  }

  function api(path, opt) {
    var o = Object.assign({ credentials: 'include', cache: 'no-store' }, opt || {});
    if (o.body && typeof o.body !== 'string') {
      o.headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers || {});
      o.body = JSON.stringify(o.body);
    }
    return fetch(path, o).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; });
    });
  }

  // ═══ 📇 카카오ID 일괄 반영 ═══════════════════════════════════════════
  window.tkOpenBackfill = function () {
    var body = openModal(
      T('📇 강사 카카오ID 일괄 반영', '📇 Import KakaoTalk IDs'),
      '<div id="tk-bf" style="font-size:13px;color:#374151">' + T('불러오는 중…', 'Loading…') + '</div>',
      820
    );
    // 미리보기(dry_run) 먼저 — 무엇이 바뀌는지 보여 주고 나서 사람이 [반영] 을 누른다.
    api('/api/admin/teachers/kakao/backfill', { method: 'POST', body: { dry_run: true } })
      .then(function (d) { renderBackfill(body.querySelector('#tk-bf'), d, true); });
  };

  function renderBackfill(el, d, isPreview) {
    if (!el) return;
    if (!d || !d.ok) {
      el.innerHTML = '<div style="color:#b91c1c">' + T('실패: ', 'Failed: ') + esc((d && (d.message || d.error)) || 'unknown') + '</div>';
      return;
    }
    var s = d.summary;
    var rowsHtml = '';
    function section(title, color, items, render) {
      if (!items || !items.length) return '';
      return '<div style="margin-top:12px"><div style="font-weight:700;font-size:12.5px;color:' + color + ';margin-bottom:5px">' +
        title + ' (' + items.length + ')</div><div style="font-size:12px;line-height:1.75">' +
        items.map(render).join('') + '</div></div>';
    }
    rowsHtml += section(T('✅ 채울 카카오ID', '✅ Will fill'), '#047857', d.updated, function (u) {
      return '<div>· <b>' + esc(u.name) + '</b> → <code>' + esc(u.to) + '</code></div>';
    });
    rowsHtml += section(T('⏭ 이미 같은 값', '⏭ Already set'), '#6b7280', d.already, function (u) {
      return '<div>· ' + esc(u.name) + ' — <code>' + esc(u.kakao_id) + '</code></div>';
    });
    rowsHtml += section(T('⚠️ 값이 달라 건드리지 않음', '⚠️ Conflict — left untouched'), '#b45309', d.conflicts, function (u) {
      return '<div>· <b>' + esc(u.name) + '</b> — ' + T('명부', 'roster') + ' <code>' + esc(u.current) +
        '</code> / ' + T('명단', 'list') + ' <code>' + esc(u.incoming) + '</code></div>';
    });
    rowsHtml += section(T('❓ 주인을 모르는 카카오ID (미배정함으로)', '❓ Unassigned KakaoTalk IDs'), '#b91c1c', d.parked, function (u) {
      return '<div>· <code>' + esc(u.kakao_id) + '</code>' + (u.note ? ' — <span style="color:#6b7280">' + esc(u.note) + '</span>' : '') + '</div>';
    });

    el.innerHTML =
      '<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.7;color:#78350f">' +
        T('운영진이 준 필리핀 강사 카카오ID 명단(26건)을 강사 명부의 <b>빈 칸에만</b> 채웁니다. ' +
          '이미 다른 값이 들어 있으면 덮어쓰지 않고 알려만 줍니다. 여러 번 눌러도 결과는 같습니다.',
          'Fills empty KakaoTalk ID cells only. Existing values are reported, never overwritten. Safe to run repeatedly.') +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;font-weight:700">' +
        '<span style="color:#047857">' + T('채울 항목', 'To fill') + ' ' + s.updated + '</span>' +
        '<span style="color:#6b7280">' + T('이미 동일', 'Already') + ' ' + s.already + '</span>' +
        '<span style="color:#b45309">' + T('충돌', 'Conflict') + ' ' + s.conflicts + '</span>' +
        '<span style="color:#b91c1c">' + T('미배정', 'Unassigned') + ' ' + s.parked + '</span>' +
      '</div>' +
      rowsHtml +
      '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">' +
        (isPreview
          ? '<button type="button" id="tk-bf-apply" style="padding:8px 18px;font-size:13px;font-weight:800;border:0;border-radius:8px;background:#f59e0b;color:#fff;cursor:pointer">' +
              (s.updated ? T('✅ 실제로 반영 (' + s.updated + '건)', '✅ Apply (' + s.updated + ')') : T('✅ 반영할 게 없습니다', '✅ Nothing to apply')) + '</button>'
          : '<span style="align-self:center;color:#047857;font-weight:700;font-size:13px">' + T('반영 완료', 'Applied') + '</span>') +
        '<button type="button" id="tk-bf-close" style="padding:8px 18px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer">' +
          T('닫기', 'Close') + '</button>' +
      '</div>';

    var applyBtn = el.querySelector('#tk-bf-apply');
    if (applyBtn) {
      if (!s.updated) applyBtn.disabled = true;
      applyBtn.onclick = function () {
        applyBtn.disabled = true;
        applyBtn.textContent = T('반영 중…', 'Applying…');
        api('/api/admin/teachers/kakao/backfill', { method: 'POST', body: { dry_run: false } })
          .then(function (r) {
            renderBackfill(el, r, false);
            if (typeof window.loadTeacherProfiles === 'function') window.loadTeacherProfiles();
          });
      };
    }
    var closeBtn = el.querySelector('#tk-bf-close');
    if (closeBtn) closeBtn.onclick = closeModal;
  }

  // ═══ 💬 전달 ═════════════════════════════════════════════════════════
  var TEMPLATES = [
    { key: 'hello',  ko: '🧪 테스트',   en: '🧪 Test',      text: 'Hello' },
    { key: 'class',  ko: '수업 안내',   en: 'Class',
      textKo: '[망고아이] 수업 안내드립니다.\n일시: \n학생: \n확인 부탁드립니다. 감사합니다!',
      textEn: '[Mangoi] Class notice.\nDate/Time: \nStudent: \nPlease confirm. Thank you!' },
    { key: 'notice', ko: '공지',        en: 'Notice',
      textKo: '[망고아이] 공지드립니다.\n\n\n확인 후 회신 부탁드립니다. 감사합니다!',
      textEn: '[Mangoi] Announcement.\n\n\nPlease read and reply. Thank you!' },
    { key: 'pay',    ko: '급여 안내',   en: 'Payroll',
      textKo: '[망고아이] 이번 달 급여명세서가 준비되었습니다.\n관리자 페이지에서 확인해 주세요.',
      textEn: '[Mangoi] Your payslip for this month is ready.\nPlease check the admin page.' }
  ];

  var _tkRoster = [];      // 서버에서 받은 강사 목록
  var _tkSmsMode = '';     // 'real' | 'mock' | 'disabled'

  /* profileId 를 주면 그 강사 한 명만 미리 선택된 상태로 연다.
     안 주면 전체 목록에서 고르게 한다(단체 전달). */
  window.tkOpenSend = function (profileId) {
    var body = openModal(
      T('💬 강사에게 카카오·문자 전달', '💬 Message Teachers — KakaoTalk / SMS'),
      '<div id="tk-send" style="font-size:13px;color:#6b7280">' + T('강사 명부를 불러오는 중…', 'Loading teachers…') + '</div>',
      880
    );
    api('/api/admin/teachers/kakao').then(function (d) {
      var el = body.querySelector('#tk-send');
      if (!d || !d.ok) {
        el.innerHTML = '<div style="color:#b91c1c">' + T('불러오기 실패: ', 'Failed: ') + esc((d && (d.message || d.error)) || 'unknown') + '</div>';
        return;
      }
      _tkRoster = d.items || [];
      _tkSmsMode = d.sms_mode || 'disabled';
      renderSendForm(el, profileId ? [Number(profileId)] : null, d);
    });
  };

  function reachLabel(t) {
    var bits = [];
    if (t.has_kakao) bits.push('<span style="background:#fee500;color:#191919;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:800">' + esc(t.kakao_id) + '</span>');
    if (t.sms_label) bits.push('<span style="background:#dbeafe;color:#1d4ed8;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:800">' +
      T('문자', 'SMS') + ' ' + t.sms_label + '</span>');
    if (!bits.length) bits.push('<span style="background:#fee2e2;color:#b91c1c;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:800">' +
      T('연락 수단 없음', 'no contact') + '</span>');
    return bits.join(' ');
  }

  function renderSendForm(el, preselect, meta) {
    var smsNote = _tkSmsMode === 'real'
      ? T('문자는 서버가 <b>실제로</b> 발송합니다.', 'SMS is sent for real by the server.')
      : (_tkSmsMode === 'mock'
        ? T('⚠️ SOLAPI 가 <b>테스트 모드</b>라 문자는 실제로 나가지 않습니다(로그만 남음).',
            '⚠️ SOLAPI is in TEST MODE — SMS is logged but not actually delivered.')
        : T('⚠️ SOLAPI 키가 설정되지 않아 <b>문자 자동발송은 꺼져 있습니다</b>. 카카오톡 전달은 그대로 됩니다.',
            '⚠️ SOLAPI keys are not configured — SMS is off. KakaoTalk hand-off still works.'));

    el.innerHTML =
      '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:11.5px;line-height:1.75;color:#334155">' +
        T('<b>카카오톡은 카카오ID 로 자동 발송할 수 있는 공개 API 가 없습니다.</b> 그래서 두 갈래로 보냅니다 — ' +
          '① 번호가 있는 강사에게는 <b>문자를 자동 발송</b>하고, ② 카카오톡은 <b>본문을 복사해 드리고 카톡을 열어</b> 드립니다(붙여넣기만 하세요). ' +
          '두 경로 모두 전달 이력에 남습니다.',
          '<b>KakaoTalk has no public API to message someone by KakaoTalk ID.</b> So this works two ways — ' +
          '① teachers with a phone number get an <b>SMS sent automatically</b>, and ② for KakaoTalk the message is <b>copied to your clipboard</b> and KakaoTalk opens, so you just paste. Both are recorded in the log.') +
        '<br>' + smsNote +
      '</div>' +

      '<div style="margin-top:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<b style="font-size:13px">' + T('받는 강사', 'Recipients') + '</b>' +
        '<span id="tk-sel-count" style="font-size:12px;color:#6b7280"></span>' +
        '<span style="flex:1"></span>' +
        '<button type="button" class="tk-pick" data-pick="all" style="padding:3px 9px;font-size:11px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">' + T('전체', 'All') + '</button>' +
        '<button type="button" class="tk-pick" data-pick="kakao" style="padding:3px 9px;font-size:11px;border:1px solid #fcd34d;border-radius:6px;background:#fffbeb;cursor:pointer">' + T('카카오ID 있는 강사', 'Has KakaoTalk ID') + '</button>' +
        '<button type="button" class="tk-pick" data-pick="none" style="padding:3px 9px;font-size:11px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">' + T('해제', 'Clear') + '</button>' +
      '</div>' +
      '<div style="margin-top:6px;max-height:210px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px">' +
        _tkRoster.map(function (t) {
          var checked = preselect ? (preselect.indexOf(Number(t.id)) >= 0) : false;
          return '<label style="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:12px;cursor:pointer">' +
            '<input type="checkbox" class="tk-rcp" value="' + t.id + '"' + (checked ? ' checked' : '') + ' />' +
            '<span style="min-width:150px;font-weight:600">' + esc(t.korean_name || t.english_name || ('#' + t.id)) + '</span>' +
            '<span>' + reachLabel(t) + '</span>' +
          '</label>';
        }).join('') +
      '</div>' +
      (meta && meta.unassigned && meta.unassigned.length
        ? '<div style="margin-top:8px;font-size:11.5px;color:#b45309">⚠️ ' +
            T('주인이 정해지지 않은 카카오ID ' + meta.unassigned.length + '건이 있습니다: ', 'Unassigned KakaoTalk IDs (' + meta.unassigned.length + '): ') +
            meta.unassigned.map(function (u) { return '<code>' + esc(u.kakao_id) + '</code>'; }).join(', ') +
            ' — ' + T('[📇 카카오ID 일괄 반영] 에서 배정하세요.', 'assign them from [📇 Import KakaoTalk IDs].') +
          '</div>'
        : '') +

      '<div style="margin-top:14px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">' +
        '<b style="font-size:13px">' + T('내용', 'Message') + '</b>' +
        TEMPLATES.map(function (tp) {
          return '<button type="button" class="tk-tpl" data-key="' + tp.key + '" style="padding:3px 9px;font-size:11px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">' +
            esc(EN() ? tp.en : tp.ko) + '</button>';
        }).join('') +
      '</div>' +
      '<textarea id="tk-msg" rows="5" maxlength="1000" placeholder="' + T('보낼 내용을 적으세요', 'Type your message') + '" ' +
        'style="margin-top:6px;width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:8px;font-size:13px;line-height:1.6;resize:vertical"></textarea>' +
      /* 보내는 방법 — 강사 대부분이 번호와 카카오ID 를 «둘 다» 갖고 있어서, 아무 생각 없이
         두 경로로 다 보내면 같은 사람이 문자와 카톡을 두 번 받는다. 기본은 한 사람당 한 번. */
      '<div style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap">' +
        '<label style="font-size:12px;display:flex;align-items:center;gap:6px">' +
          '<b>' + T('보내는 방법', 'How to send') + '</b>' +
          '<select id="tk-mode" style="padding:4px 8px;font-size:12px;border:1px solid #d1d5db;border-radius:6px">' +
            '<option value="auto">' + T('번호 있으면 문자 · 없으면 카톡 (한 번만)', 'SMS if a number exists, else KakaoTalk (once each)') + '</option>' +
            '<option value="both">' + T('문자 + 카카오톡 둘 다', 'Both SMS and KakaoTalk') + '</option>' +
            '<option value="sms">' + T('문자만', 'SMS only') + '</option>' +
            '<option value="kakao">' + T('카카오톡만', 'KakaoTalk only') + '</option>' +
          '</select>' +
        '</label>' +
        '<span style="flex:1"></span>' +
        '<span id="tk-len" style="font-size:11px;color:#9ca3af">0 / 1000</span>' +
      '</div>' +

      '<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">' +
        '<button type="button" id="tk-cancel" style="padding:8px 18px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer">' + T('취소', 'Cancel') + '</button>' +
        '<button type="button" id="tk-send-go" style="padding:8px 22px;font-size:13px;font-weight:800;border:0;border-radius:8px;background:#fee500;color:#191919;cursor:pointer">' + T('보내기', 'Send') + '</button>' +
      '</div>';

    var msg = el.querySelector('#tk-msg');
    var len = el.querySelector('#tk-len');
    function refreshCount() {
      var n = el.querySelectorAll('.tk-rcp:checked').length;
      el.querySelector('#tk-sel-count').textContent = T(n + '명 선택', n + ' selected');
    }
    msg.addEventListener('input', function () { len.textContent = msg.value.length + ' / 1000'; });
    el.addEventListener('change', function (e) { if (e.target.classList.contains('tk-rcp')) refreshCount(); });
    Array.prototype.forEach.call(el.querySelectorAll('.tk-pick'), function (b) {
      b.onclick = function () {
        var mode = b.dataset.pick;
        Array.prototype.forEach.call(el.querySelectorAll('.tk-rcp'), function (c) {
          var t = _tkRoster.filter(function (x) { return String(x.id) === c.value; })[0];
          c.checked = mode === 'all' ? true : (mode === 'none' ? false : !!(t && t.has_kakao));
        });
        refreshCount();
      };
    });
    Array.prototype.forEach.call(el.querySelectorAll('.tk-tpl'), function (b) {
      b.onclick = function () {
        var tp = TEMPLATES.filter(function (x) { return x.key === b.dataset.key; })[0];
        if (!tp) return;
        msg.value = tp.text || (EN() ? tp.textEn : tp.textKo) || '';
        len.textContent = msg.value.length + ' / 1000';
        msg.focus();
      };
    });
    el.querySelector('#tk-cancel').onclick = closeModal;
    el.querySelector('#tk-send-go').onclick = function () { doSend(el); };
    refreshCount();
    if (preselect) msg.focus();
  }

  function doSend(el) {
    var ids = Array.prototype.map.call(el.querySelectorAll('.tk-rcp:checked'), function (c) { return Number(c.value); });
    var message = el.querySelector('#tk-msg').value.trim();
    var mode = el.querySelector('#tk-mode').value;
    if (!ids.length) { alert(T('받는 강사를 한 명 이상 고르세요.', 'Pick at least one teacher.')); return; }
    if (!message) { alert(T('보낼 내용을 적으세요.', 'Type a message.')); return; }
    // 90명 제한 — D1 바인드 파라미터 100개 한도(서버도 막지만 여기서 먼저 알려 준다)
    if (ids.length > 90) { alert(T('한 번에 90명까지 보낼 수 있습니다.', 'Up to 90 recipients per send.')); return; }

    var btn = el.querySelector('#tk-send-go');
    btn.disabled = true;
    btn.textContent = T('보내는 중…', 'Sending…');
    api('/api/admin/teachers/kakao/send', { method: 'POST', body: { profile_ids: ids, message: message, mode: mode } })
      .then(function (d) {
        if (!d || !d.ok) {
          btn.disabled = false; btn.textContent = T('보내기', 'Send');
          alert(T('전달 실패: ', 'Send failed: ') + ((d && (d.message || d.error)) || 'unknown'));
          return;
        }
        renderResult(el, d, message);
      });
  }

  // ═══ 결과 + 카카오톡 수동 전달 위저드 ════════════════════════════════
  function renderResult(el, d, message) {
    var s = d.summary;
    var manual = d.manual || [];
    var auto = d.auto || [];

    el.innerHTML =
      '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;font-weight:700;margin-bottom:10px">' +
        '<span style="color:#047857">' + T('문자 발송 성공 ', 'SMS sent ') + s.auto_sent + '</span>' +
        (s.auto_failed ? '<span style="color:#b91c1c">' + T('문자 실패 ', 'SMS failed ') + s.auto_failed + '</span>' : '') +
        '<span style="color:#b45309">' + T('카카오톡 전달 대기 ', 'KakaoTalk pending ') + s.manual_pending + '</span>' +
        (s.skipped ? '<span style="color:#6b7280">' + T('연락 수단 없음 ', 'No contact ') + s.skipped + '</span>' : '') +
      '</div>' +
      (auto.length
        ? '<details style="margin-bottom:10px"><summary style="cursor:pointer;font-size:12.5px;font-weight:700">' +
            T('📨 문자 발송 결과 자세히', '📨 SMS results') + '</summary>' +
            '<div style="font-size:11.5px;line-height:1.8;margin-top:6px">' +
            auto.map(function (a) {
              return '<div>' + (a.ok ? '✅' : '❌') + ' <b>' + esc(a.name) + '</b> (' + esc(a.country) + ' ' + esc(a.phone || '') + ')' +
                (a.ok ? (a.mode === 'mock' ? ' — <span style="color:#b45309">' + T('테스트 모드(실제 발송 안 함)', 'test mode — not delivered') + '</span>' : '')
                      : ' — <span style="color:#b91c1c">' + esc(a.error || '') + ' ' + esc(a.message || '') + '</span>') +
              '</div>';
            }).join('') + '</div></details>'
        : '') +
      (d.skipped && d.skipped.length
        ? '<div style="font-size:11.5px;color:#6b7280;margin-bottom:10px">' +
            T('연락처가 없어 건너뛴 강사: ', 'Skipped (no contact): ') +
            d.skipped.map(function (x) { return esc(x.name || ('#' + x.profile_id)); }).join(', ') + '</div>'
        : '') +
      (manual.length
        ? '<div style="border:1px solid #fcd34d;background:#fffbeb;border-radius:10px;padding:12px 14px">' +
            '<div style="font-weight:800;font-size:13px;color:#78350f">' +
              T('💬 카카오톡으로 전달 — 한 명씩 진행', '💬 KakaoTalk hand-off — one by one') + '</div>' +
            '<div style="font-size:11.5px;color:#92400e;margin-top:4px;line-height:1.7">' +
              T('[복사 + 카톡 열기] 를 누르면 본문이 클립보드에 담기고 카카오톡이 열립니다. ' +
                '해당 카카오ID 채팅방에 붙여넣고 보낸 뒤 [보냄 · 다음] 을 누르세요.',
                'Press [Copy + open KakaoTalk] — the message goes to your clipboard and KakaoTalk opens. ' +
                'Paste it into that KakaoTalk ID’s chat, then press [Sent · next].') +
            '</div>' +
            '<div id="tk-wiz" style="margin-top:12px"></div>' +
            '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
              '<button type="button" id="tk-copy-all" style="padding:5px 12px;font-size:11.5px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">' +
                T('📋 남은 대상 카카오ID 전부 복사', '📋 Copy all remaining KakaoTalk IDs') + '</button>' +
              '<button type="button" id="tk-mark-all" style="padding:5px 12px;font-size:11.5px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer">' +
                T('✅ 남은 대상 전부 보냄으로 표시', '✅ Mark all remaining as sent') + '</button>' +
            '</div>' +
          '</div>'
        : '<div style="font-size:12.5px;color:#047857;font-weight:700">' + T('카카오톡으로 전달할 대상이 없습니다.', 'Nothing to hand off via KakaoTalk.') + '</div>') +
      '<div style="margin-top:16px;display:flex;justify-content:flex-end">' +
        '<button type="button" id="tk-done" style="padding:8px 18px;font-size:13px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer">' + T('닫기', 'Close') + '</button>' +
      '</div>';

    el.querySelector('#tk-done').onclick = closeModal;

    if (!manual.length) return;

    var idx = 0;
    var doneIds = [];
    var wiz = el.querySelector('#tk-wiz');

    function drawWiz() {
      if (idx >= manual.length) {
        wiz.innerHTML = '<div style="font-size:13px;font-weight:800;color:#047857">' +
          T('✅ 전부 진행했습니다 (' + doneIds.length + '명 보냄 표시)', '✅ All done (' + doneIds.length + ' marked as sent)') + '</div>';
        return;
      }
      var m = manual[idx];
      wiz.innerHTML =
        '<div style="background:#fff;border:1px solid #fde68a;border-radius:8px;padding:10px 12px">' +
          '<div style="font-size:12px;color:#92400e;font-weight:700">' + (idx + 1) + ' / ' + manual.length + '</div>' +
          '<div style="margin-top:4px;font-size:14px;font-weight:800;color:#111827">' + esc(m.name) + '</div>' +
          '<div style="margin-top:2px;font-size:12px">' + T('카카오ID', 'KakaoTalk ID') + ': ' +
            '<code style="background:#fee500;padding:1px 6px;border-radius:4px;font-weight:700">' + esc(m.kakao_id) + '</code></div>' +
          '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
            '<button type="button" id="tk-w-copy" style="padding:6px 14px;font-size:12px;font-weight:800;border:0;border-radius:7px;background:#fee500;color:#191919;cursor:pointer">' +
              T('📋 복사 + 카톡 열기', '📋 Copy + open KakaoTalk') + '</button>' +
            '<button type="button" id="tk-w-sent" style="padding:6px 14px;font-size:12px;font-weight:800;border:0;border-radius:7px;background:#10b981;color:#fff;cursor:pointer">' +
              T('✅ 보냄 · 다음', '✅ Sent · next') + '</button>' +
            '<button type="button" id="tk-w-skip" style="padding:6px 12px;font-size:12px;border:1px solid #d1d5db;border-radius:7px;background:#fff;cursor:pointer">' +
              T('건너뛰기', 'Skip') + '</button>' +
            '<span id="tk-w-note" style="align-self:center;font-size:11.5px;color:#6b7280"></span>' +
          '</div>' +
        '</div>';

      wiz.querySelector('#tk-w-copy').onclick = function () {
        copyText(message).then(function (ok) {
          wiz.querySelector('#tk-w-note').textContent = ok
            ? T('본문을 복사했습니다 — 카톡에 붙여넣으세요', 'Copied — paste it in KakaoTalk')
            : T('복사에 실패했습니다. 아래 본문을 직접 선택해 복사하세요.', 'Copy failed — select the text manually.');
          if (ok) openKakaoApp();
        });
      };
      wiz.querySelector('#tk-w-sent').onclick = function () {
        doneIds.push(m.log_id);
        api('/api/admin/teachers/kakao/mark-sent', { method: 'POST', body: { log_ids: [m.log_id] } });
        idx++; drawWiz();
      };
      wiz.querySelector('#tk-w-skip').onclick = function () { idx++; drawWiz(); };
    }
    drawWiz();

    el.querySelector('#tk-copy-all').onclick = function (e) {
      var rest = manual.slice(idx).map(function (m) { return m.kakao_id + '\t' + m.name; }).join('\n');
      copyText(rest).then(function (ok) { e.target.textContent = ok ? T('✔ 복사됨', '✔ Copied') : T('✖ 복사 실패', '✖ Copy failed'); });
    };
    el.querySelector('#tk-mark-all').onclick = function () {
      var rest = manual.slice(idx).map(function (m) { return m.log_id; });
      if (!rest.length) return;
      if (!confirm(T('남은 ' + rest.length + '명을 «보냄» 으로 표시할까요? 실제 전송은 카카오톡에서 직접 하셔야 합니다.',
                     'Mark the remaining ' + rest.length + ' as sent? You still have to send them in KakaoTalk yourself.'))) return;
      api('/api/admin/teachers/kakao/mark-sent', { method: 'POST', body: { log_ids: rest } }).then(function () {
        idx = manual.length; doneIds = doneIds.concat(rest); drawWiz();
      });
    };
  }
})();
