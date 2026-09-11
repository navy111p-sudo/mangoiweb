// ═══════════════════════════════════════════════════════════════
// adm-ai-billing.js — card-ai-billing (🏢 AI 사용료 관리) 실데이터 렌더러
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유.
//
//   2026-09-10 신설. 실데이터 = /api/admin/ai-billing/rate (src/ai-billing.ts).
//   여기서 하는 일은 딱 하나 — «대리점별 단가를 조회·조정» (사장님 지시:
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px">불러오는 중…</td></tr>';
    var q = (el('aib-q') && el('aib-q').value.trim()) || '';
    var url = '/api/admin/ai-billing/rate' + (q ? '?q=' + encodeURIComponent(q) : '');
    aibFetch(url).then(function(res){
      var d = res.body;
      if (!res.ok || !d || !d.ok) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:#dc2626">불러오지 못했습니다' +
          (d && d.error ? ' (' + esc(d.error) + ')' : '') + '</td></tr>';
        return;
      }
      LAST = d;
      var note = el('aib-readonly-note');
      if (note) note.hidden = !!d.editable;
      var cnt = el('aib-count');
      if (cnt) cnt.textContent = d.count + '개' + (d.truncated ? ' (500개까지만 표시)' : '');
      renderRows(d);
    }).catch(function(e){
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:#dc2626">네트워크 오류: ' + esc(e && e.message || e) + '</td></tr>';
    });
  };

  function renderRows(d){
    var tbody = el('aib-tbody');
    var rows = d.rows || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">재원 학생이 있는 대리점이 없습니다.</td></tr>';
      return;
    }
    var editable = !!d.editable;
    tbody.innerHTML = rows.map(function(r, i){
      var shop = esc(r.shop_name);
      var total = won(Number(r.enrolled_count) * Number(r.rate_krw));
      return '' +
        '<tr>' +
        '<td>' + shop + '</td>' +
        '<td>' + esc(r.franchise || '—') + '</td>' +
        '<td style="text-align:right">' + (Number(r.enrolled_count)||0).toLocaleString('ko-KR') + '명</td>' +
        '<td>' +
          '<input type="number" min="0" max="1000000" step="1000" value="' + (Number(r.rate_krw)||0) + '" ' +
            'id="aib-rate-' + i + '" data-shop="' + shop.replace(/"/g,'&quot;') + '" ' +
            (editable ? '' : 'disabled ') +
            'oninput="aibRecalc(' + i + ')" ' +
            'style="width:110px;padding:5px 8px;font-size:12.5px;border-radius:6px;border:1px solid #d1d5db" />' +
          (r.is_custom_rate ? '' : '<span style="font-size:10.5px;color:#94a3b8;margin-left:4px" data-ko="(기본값)" data-en="(default)">(기본값)</span>') +
        '</td>' +
        '<td style="text-align:right" id="aib-total-' + i + '">' + total + '</td>' +
        '<td>' + (editable ?
          '<button onclick="aibSave(' + i + ')" id="aib-save-' + i + '" style="padding:5px 12px;font-size:12px;background-color:#2563eb;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:700" data-ko="💾 저장" data-en="💾 Save">💾 저장</button>' :
          '<span style="font-size:11px;color:#94a3b8" data-ko="본사 전용" data-en="HQ only">본사 전용</span>') +
        '</td>' +
        '</tr>';
    }).join('');
  }

  window.aibRecalc = function(i){
    var input = el('aib-rate-' + i);
    var totalCell = el('aib-total-' + i);
    if (!input || !totalCell || !LAST || !LAST.rows || !LAST.rows[i]) return;
    var rate = Math.max(0, Math.round(Number(input.value) || 0));
    totalCell.textContent = won(Number(LAST.rows[i].enrolled_count) * rate);
  };

  window.aibSave = function(i){
    var input = el('aib-rate-' + i);
    var btn = el('aib-save-' + i);
    if (!input) return;
    var shopName = input.getAttribute('data-shop');
    var rate = Math.round(Number(input.value));
    if (!(rate >= 0) || rate > 1000000) { alert('단가는 0 ~ 1,000,000원 사이여야 합니다.'); return; }
    if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
    fetch('/api/admin/ai-billing/rate', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shop_name: shopName, rate_krw: rate }),
    }).then(function(r){ return r.json().catch(function(){ return null; }).then(function(d){ return { ok: r.ok, body: d }; }); })
      .then(function(res){
        if (!res.ok || !res.body || !res.body.ok) {
          alert('저장 실패: ' + ((res.body && res.body.error) || 'HTTP 오류'));
          if (btn) { btn.disabled = false; btn.textContent = '💾 저장'; }
          return;
        }
        if (btn) { btn.textContent = '✅ 저장됨'; }
        if (LAST && LAST.rows && LAST.rows[i]) { LAST.rows[i].rate_krw = rate; LAST.rows[i].is_custom_rate = true; }
        setTimeout(function(){
          if (btn) { btn.disabled = false; btn.textContent = '💾 저장'; }
        }, 1200);
      }).catch(function(e){
        alert('네트워크 오류: ' + (e && e.message || e));
        if (btn) { btn.disabled = false; btn.textContent = '💾 저장'; }
      });
  };

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
