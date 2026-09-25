// ═══════════════════════════════════════════════════════════════
// adm-ai-billing.js — card-ai-billing (🏢 AI 사용료 관리) 실데이터 렌더러
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유.
//
//   2026-09-10 신설 · 2026-09-24 개정 · 2026-09-25 «신청 기반» 개정(자동 청구 스위치 · 신청 안 함 칸). 실데이터 = /api/admin/ai-billing/rate (src/ai-billing.ts ·
//   가격 정본 src/ai-billing-price.ts). 학원별 A.i반 인원(재원 − 화상반)·예상 청구액(인원 구간
//   공급가)·지사 40% 를 보고, 특정 학원만 다르게 받을 때 «예외 단가» 를 정한다(비우면 구간 단가).
//   처음 지시(2026-09-10):
//   "본사 관리자 페이지에서는 해당 대리점의 AI 수업 수강료를 조절할 수 있어야 해").
//   청구서 생성·결제는 대리점 담당자가 manager.html 에서 직접 한다(별건 — 안 건드림).
//
//   ⚠️ 편집 가능 여부(editable)는 서버가 scope.type==='hq' 로 다시 판정한다 —
//      여기서 입력칸을 disabled 로 두는 것은 «눌러도 안 되는 버튼» 을 안 보이게
//      하는 것뿐이고, 실제 저장 거부는 POST /rate 가 403 으로 한다.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  function el(id){ return document.getElementById(id); }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }
  function won(n){ return '₩' + (Number(n)||0).toLocaleString('ko-KR'); }

  var LAST = null;   // 마지막으로 불러온 목록 (재계산·재검증용)

  function aibFetch(path){
    return fetch(path, { credentials:'same-origin' })
      .then(function(r){ return r.json().catch(function(){ return null; }).then(function(d){ return { ok: r.ok, status: r.status, body: d }; }); });
  }

  window.aibLoad = function(){
    var tbody = el('aib-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:18px">불러오는 중…</td></tr>';
    var q = (el('aib-q') && el('aib-q').value.trim()) || '';
    var url = '/api/admin/ai-billing/rate' + (q ? '?q=' + encodeURIComponent(q) : '');
    aibFetch(url).then(function(res){
      var d = res.body;
      if (!res.ok || !d || !d.ok) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:18px;color:#b91c1c">' + esc(L('불러오지 못했습니다', 'Failed to load')) +
          (d && d.error ? ' (' + esc(d.error) + ')' : '') + '</td></tr>';
        return;
      }
      LAST = d;
      renderSwitch(d);
      var note = el('aib-readonly-note');
      if (note) note.hidden = !!d.editable;
      var cnt = el('aib-count');
      if (cnt) cnt.textContent = d.count + '개' + (d.truncated ? ' (500개까지만 표시)' : '');
      renderRows(d);
      renderCron(d.last_cron);
    }).catch(function(e){
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:18px;color:#dc2626">네트워크 오류: ' + esc(e && e.message || e) + '</td></tr>';
    });
  };

  /* 💰 (2026-09-24) 청구액은 «A.i반 인원 구간 공급가» 로 서버(ai-billing-price.ts)가 계산한다.
     ⛔ 이 화면에서 인원 × 단가를 다시 계산하지 말 것 — 구간·최소 20명분·경계 보정이 있어
        화면 계산은 반드시 틀린다(2026-09-10 판의 aibRecalc 를 그래서 지웠다).
        입력칸은 «학원 예외 단가» 이고, 저장하면 서버 값으로 다시 그린다. */
  function isEn(){ try { return window.adminLang === 'en' || (!window.adminLang && localStorage.getItem('mangoi_lang') === 'en'); } catch(_) { return false; } }
  function L(ko, en){ return isEn() ? en : ko; }
  function num(n){ return (Number(n)||0).toLocaleString('ko-KR'); }

  /* 🛎 (2026-09-24) 월 자동 청구(매달 1일)의 마지막 결과 — 서버 로그는 5% 만 남아서, 실패하면 아무도 몰랐다.
     실패·일부 실패면 빨간 줄로 «무엇을 하라» 까지 말한다. 모르면(null) «—» (지어내지 않는다).
     ⛔ 이 요소에 data-ko/data-en 을 달지 말 것 — 그리는 쪽이 글자를 정하고 언어 전환 때 다시 그린다. */
  var LAST_CRON;
  function renderCron(c){
    LAST_CRON = c;
    var box = el('aib-cron');
    if (!box) {
      var tbl = el('aib-table');
      var host = tbl && tbl.parentNode;
      if (!host || !host.parentNode) return;
      box = document.createElement('div');
      box.id = 'aib-cron';
      box.style.cssText = 'padding:8px 12px;border-radius:6px;font-size:12px;margin-bottom:10px;border:1px solid #cbd5e1;background:#f8fafc;color:#475467';
      host.parentNode.insertBefore(box, host);
    }
    var bad = c && (c.status === 'live_check_failed' || c.status === 'shops_failed' || c.status === 'partial');
    box.style.background = bad ? '#fef2f2' : '#f8fafc';
    box.style.borderColor = bad ? '#fca5a5' : '#cbd5e1';
    box.style.color = bad ? '#b91c1c' : '#475467';
    if (c && c.status === 'disabled') {
      var whenD = '—';
      try { whenD = new Date(c.at).toLocaleString(isEn() ? 'en-US' : 'ko-KR', { timeZone: 'Asia/Seoul' }); } catch(_) {}
      box.textContent = L('🛎 월 자동 청구 (' + (c.month || '') + '분, ' + whenD + ') — 자동 청구가 꺼져 있어 청구서를 만들지 않았습니다.', '🛎 Monthly auto-billing (' + (c.month || '') + ', ' + whenD + ') — auto-billing is OFF, so no invoices were created.');
      return;
    }
    if (!c) { box.textContent = L('🛎 월 자동 청구: 아직 실행 기록이 없습니다 — 매달 1일에 다음 달 청구서를 만듭니다.', '🛎 Monthly auto-billing: no run recorded yet — it creates next month’s invoices on the 1st.'); return; }
    var when = '—';
    try { when = new Date(c.at).toLocaleString(isEn() ? 'en-US' : 'ko-KR', { timeZone: 'Asia/Seoul' }); } catch(_) {}
    var head = L('🛎 월 자동 청구 (' + (c.month || '') + '분, ' + when + ')', '🛎 Monthly auto-billing (' + (c.month || '') + ', ' + when + ')');
    var msg;
    if (c.status === 'live_check_failed') msg = L('⚠ 화상반 학생을 확인하지 못해 청구서를 한 장도 만들지 않았습니다(이중 청구 방지). 학원 화면의 「청구서 만들기」로 다시 만들 수 있습니다.', '⚠ Could not check video-class students, so no invoices were created (to avoid double billing). Academies can create them with “Create invoice”.');
    else if (c.status === 'shops_failed') msg = L('⚠ 대리점 목록을 읽지 못해 실행하지 못했습니다. 학원 화면의 「청구서 만들기」로 다시 만들 수 있습니다.', '⚠ Could not read the agency list, so nothing ran. Academies can create invoices with “Create invoice”.');
    else msg = L('대리점 ' + num(c.agencies) + '곳 · 청구서 ' + num(c.invoices) + '장 · 새로 넣은 학생 ' + num(c.added) + '명', num(c.agencies) + ' agencies · ' + num(c.invoices) + ' invoices · ' + num(c.added) + ' students added')
      + (c.status === 'partial' ? L(' — ⚠ ' + num(c.failed) + '곳은 만들지 못했습니다(학원 화면에서 다시 만들 수 있습니다).', ' — ⚠ ' + num(c.failed) + ' failed (academies can recreate them).') : '');
    box.textContent = head + ' — ' + msg;
  }

  /* 🔌 (2026-09-25) 자동 청구 스위치 — 기본 «꺼짐»(테스트 기간). 켜고 끄는 것은 본사만(서버가 다시 판정).
     꺼져 있으면: 월 자동 청구가 청구서를 만들지 않고, 학원 화면은 «테스트 기간» 안내만 보여 줍니다.
     ⛔ 이 요소에 data-ko/data-en 을 달지 말 것 — 그리는 쪽이 글자를 정하고 언어 전환 때 다시 그린다. */
  function renderSwitch(d){
    var box = el('aib-switch');
    if (!box) {
      var tbl = el('aib-table');
      var host = tbl && tbl.parentNode;
      if (!host || !host.parentNode) return;
      box = document.createElement('div');
      box.id = 'aib-switch';
      box.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 12px;border-radius:8px;font-size:12.5px;margin-bottom:10px;border:1px solid';
      host.parentNode.insertBefore(box, host);
    }
    var on = d.billing_enabled === true;
    box.style.background = on ? '#ecfdf3' : '#f8fafc';
    box.style.borderColor = on ? '#86efac' : '#cbd5e1';
    box.style.color = on ? '#166534' : '#344054';
    var t = d.totals || {};
    var msg = on
      ? L('🟢 자동 청구 켜짐 — 매달 1일, A.i 단독 신청 학생이 있는 학원에만 다음 달 청구서를 만듭니다.', '🟢 Auto-billing ON — on the 1st, next month’s invoices are created only for academies with A.i-only sign-ups.')
      : L('⏸ 자동 청구 꺼짐 (테스트 기간) — 청구서를 만들지 않고, 학원 화면에는 «청구하지 않습니다» 만 보입니다.', '⏸ Auto-billing OFF (test period) — no invoices are created; academies only see “not billed”.');
    var sum = L('합계: 재원 ' + num(t.enrolled) + ' · 화상반(무료) ' + num(t.live) + ' · A.i 단독 신청 ' + num(t.ai) + ' · 신청 안 함 ' + num(t.idle) + ' · 예상 청구액 ' + won(t.est),
      'Total: enrolled ' + num(t.enrolled) + ' · video (free) ' + num(t.live) + ' · A.i-only sign-ups ' + num(t.ai) + ' · not signed up ' + num(t.idle) + ' · est. ' + won(t.est));
    box.innerHTML = '<span style="font-weight:700">' + esc(msg) + '</span>'
      + '<span style="color:#475467">' + esc(sum) + '</span>'
      + (d.editable ? '<button id="aib-switch-btn" onclick="aibSwitch(' + (on ? 'false' : 'true') + ')" style="margin-left:auto;padding:5px 12px;font-size:12px;border:1px solid #d0d5dd;border-radius:6px;cursor:pointer;font-weight:700;background-color:#ffffff;color:#101828">'
          + esc(on ? L('자동 청구 끄기', 'Turn OFF') : L('자동 청구 켜기', 'Turn ON')) + '</button>' : '');
  }

  window.aibSwitch = function(on){
    var ask = on
      ? L('자동 청구를 켤까요?\n\n켜면 매달 1일, A.i 단독 신청 학생이 있는 학원에 청구서가 만들어지고 학원 화면에 청구서가 보입니다.', 'Turn auto-billing ON?\n\nInvoices will be created on the 1st for academies with A.i-only sign-ups and shown on their screens.')
      : L('자동 청구를 끌까요?\n\n이미 만든 청구서는 지우지 않지만, 새 청구서 만들기와 결제가 멈춥니다.', 'Turn auto-billing OFF?\n\nExisting invoices stay, but creating new invoices and paying stop.');
    if (!window.confirm(ask)) return;
    var btn = el('aib-switch-btn'); if (btn) btn.disabled = true;
    fetch('/api/admin/ai-billing/switch', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on: !!on }),
    }).then(function(r){ return r.json().catch(function(){ return null; }).then(function(d){ return { ok: r.ok, body: d }; }); })
      .then(function(res){
        if (!res.ok || !res.body || !res.body.ok) {
          alert(L('바꾸지 못했습니다: ', 'Could not change: ') + ((res.body && res.body.error) || 'HTTP'));
          if (btn) btn.disabled = false; return;
        }
        window.aibLoad();
      }).catch(function(e){ alert(L('네트워크 오류: ', 'Network error: ') + (e && e.message || e)); if (btn) btn.disabled = false; });
  };

  function renderRows(d){
    var tbody = el('aib-tbody');
    var rows = d.rows || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="11" class="empty">' + esc(L('재원 학생이 있는 대리점이 없습니다.', 'No agencies with enrolled students.')) + '</td></tr>';
      return;
    }
    var editable = !!d.editable;
    tbody.innerHTML = rows.map(function(r, i){
      var shop = esc(r.shop_name);
      var note = isEn() ? (r.price_note_en || '') : (r.price_note_ko || '');
      return '' +
        '<tr>' +
        '<td>' + shop + '</td>' +
        '<td>' + esc(r.franchise || '—') + '</td>' +
        '<td style="text-align:right">' + num(r.enrolled_count) + '</td>' +
        '<td style="text-align:right;color:#475467">' + num(r.live_count) + '</td>' +
        '<td style="text-align:right;font-weight:700">' + num(r.ai_count) + '</td>' +
        '<td style="text-align:right;color:#667085">' + num(r.idle_count) + '</td>' +
        '<td style="font-size:11.5px;color:#475467;min-width:160px">' + esc(note || '—') + '</td>' +
        '<td>' +
          '<input type="number" min="0" max="1000000" step="100" value="' + (r.is_custom_rate ? (Number(r.custom_rate_krw)||'') : '') + '" ' +
            'placeholder="' + esc(L('구간 단가', 'tier rate')) + '" ' +
            'id="aib-rate-' + i + '" data-shop="' + shop.replace(/"/g,'&quot;') + '" ' +
            (editable ? '' : 'disabled ') +
            'style="width:100px;padding:5px 8px;font-size:12.5px;border-radius:6px;border:1px solid #d1d5db;background-color:#ffffff;color:#101828" />' +
        '</td>' +
        '<td style="text-align:right;font-weight:700">' + won(r.estimated_total_krw) + '</td>' +
        '<td style="text-align:right;color:#475467">' + won(r.branch_commission_krw) + '</td>' +
        '<td>' + (editable ?
          '<button onclick="aibSave(' + i + ')" id="aib-save-' + i + '" style="padding:5px 12px;font-size:12px;background-color:#2563eb;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:700">' + esc(L('💾 저장', '💾 Save')) + '</button>' :
          '<span style="font-size:11px;color:#94a3b8">' + esc(L('본사 전용', 'HQ only')) + '</span>') +
        '</td>' +
        '</tr>';
    }).join('');
  }

  window.aibSave = function(i){
    var input = el('aib-rate-' + i);
    var btn = el('aib-save-' + i);
    if (!input) return;
    var shopName = input.getAttribute('data-shop');
    var raw = String(input.value || '').trim();
    var rate = raw === '' ? 0 : Math.round(Number(raw));   // 비우면(0) 예외 단가 해제 → 인원 구간 단가
    if (!(rate >= 0) || rate > 1000000) { alert(L('단가는 0 ~ 1,000,000원 사이여야 합니다.', 'Rate must be between 0 and 1,000,000.')); return; }
    if (btn) { btn.disabled = true; btn.textContent = L('저장 중…', 'Saving…'); }
    fetch('/api/admin/ai-billing/rate', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_name: shopName, rate_krw: rate }),
    }).then(function(r){ return r.json().catch(function(){ return null; }).then(function(d){ return { ok: r.ok, body: d }; }); })
      .then(function(res){
        if (!res.ok || !res.body || !res.body.ok) {
          alert(L('저장 실패: ', 'Save failed: ') + ((res.body && res.body.error) || 'HTTP'));
          if (btn) { btn.disabled = false; btn.textContent = L('💾 저장', '💾 Save'); }
          return;
        }
        // 서버가 계산한 새 청구액으로 다시 그린다(화면에서 계산하지 않는다)
        window.aibLoad();
      }).catch(function(e){
        alert(L('네트워크 오류: ', 'Network error: ') + (e && e.message || e));
        if (btn) { btn.disabled = false; btn.textContent = L('💾 저장', '💾 Save'); }
      });
  };

  function relang(){ if (LAST) { renderSwitch(LAST); renderRows(LAST); renderCron(LAST_CRON); } }
  document.addEventListener('mangoi:lang-changed', relang);   // 관리자 화면은 document 에서 발행(bubbles:false)
  window.addEventListener('mangoi:lang-changed', relang);

  /* ── 최초 로드 · 카드를 열 때 다시 그리기 ── */
  var loaded = false;
  function open(){
    if (loaded) return;
    loaded = true;
    window.aibLoad();
  }
  document.addEventListener('toggle', function(e){
    var t = e.target;
    if (t && t.id === 'card-ai-billing' && t.open) setTimeout(open, 30);
  }, true);
  document.addEventListener('DOMContentLoaded', function(){
    var c = el('card-ai-billing');
    if (c && c.open) open();
  });

  console.log('[adm-ai-billing] 🏢 AI 사용료 관리 렌더러 준비 완료');
})();
