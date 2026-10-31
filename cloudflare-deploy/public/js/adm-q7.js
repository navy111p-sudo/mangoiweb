// ═══════════════════════════════════════════════════════════════
// adm-q7.js — 결제관리 카드(ph106) 실데이터 렌더러
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유.
//
//   2026-08-17: 데모 상수 → 실 API 로 교체.
//     BtoB  /api/admin/payments/b2b   통장 직접입금(bankacct_transactions)
//     BtoC  /api/admin/payments/b2c   카드결제(student_payments)
//
//   ⚠️ 왜 둘이 서로 다른 표를 보는지는 src/payments-board.ts 머리말에 적어 뒀다.
//      요약: B2B 돈은 student_payments 에 «한 건도» 없다. 학원이 통장으로 바로 보낸다.
//   ⛔ 되살리지 말 것 — 여기 있던 것들은 전부 가짜였다:
//      · setKpi(..., 890000) 류 하드코딩 상수
//      · Math.random() 으로 그리던 30일 차트와 「지난 3년 평균 vs 올해」 비교 차트
//      · alert('검색 요청 전송 (데모)') 만 띄우던 검색·다운로드 버튼
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  var B2B = { from:'', to:'', q:'', page:1, data:null };
  var B2C = { agency:'', from:'', to:'', q:'', page:1, data:null };

  /* ── 표시 헬퍼 ─────────────────────────────────────────────── */
  function won(n){ return '₩' + (Number(n)||0).toLocaleString('ko-KR'); }
  function cnt(n){ return (Number(n)||0).toLocaleString('ko-KR') + '건'; }
  function el(id){ return document.getElementById(id); }
  function setText(id, v){ var e = el(id); if (e) e.textContent = v; }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }
  /* 증감률 — API 가 null 을 주면 «비교 불가» 다. 0을 +100% 로 쓰지 않는다. */
  function trend(label, d){
    if (d == null) return label + ' —';
    var arrow = d > 0 ? '▲' : (d < 0 ? '▼' : '·');
    return arrow + ' ' + label + ' ' + (d > 0 ? '+' : '') + d + '%';
  }

  /* ── 30일 라인 차트 (Canvas 직접, 라이브러리 의존 없음) ────────
     ⚠️ 값이 전부 0이면 max=0 이라 y 계산이 NaN 이 된다 — 바닥선만 그린다. */
  function drawLine(canvasId, data, color){
    var c = el(canvasId); if (!c) return;
    var ctx = c.getContext('2d'); if (!ctx) return;
    var w = c.width = c.offsetWidth || 600;
    var h = c.height = 100;
    ctx.clearRect(0, 0, w, h);
    if (!data || !data.length) return;
    var max = Math.max.apply(null, data);
    var step = data.length > 1 ? w / (data.length - 1) : w;
    var y = function(v){ return max > 0 ? h - (v / max) * (h - 10) - 5 : h - 5; };

    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '00');
    ctx.beginPath(); ctx.moveTo(0, h);
    data.forEach(function(v, i){ ctx.lineTo(i * step, y(v)); });
    ctx.lineTo(w, h); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath();
    data.forEach(function(v, i){ i ? ctx.lineTo(i * step, y(v)) : ctx.moveTo(0, y(v)); });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();

    data.forEach(function(v, i){
      if (!v) return;                       // 0인 날은 점을 안 찍는다 (바닥이 점선처럼 보임)
      ctx.beginPath(); ctx.arc(i * step, y(v), 3, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
    });
  }

  /* ── 페이지네이션 ──────────────────────────────────────────── */
  function pager(id, state, total, reload){
    var box = el(id); if (!box) return;
    var size = (state.data && state.data.pageSize) || 50;
    var pages = Math.max(1, Math.ceil((total || 0) / size));
    box.innerHTML = '';
    if (pages <= 1) return;
    var mk = function(label, page, active, disabled){
      var b = document.createElement('button');
      b.className = 'pm-page-btn' + (active ? ' active' : '');
      b.textContent = label;
      if (disabled) b.disabled = true;
      else b.onclick = function(){ state.page = page; reload(); };
      box.appendChild(b);
    };
    mk('‹', state.page - 1, false, state.page <= 1);
    var from = Math.max(1, state.page - 2), to = Math.min(pages, from + 4);
    for (var p = from; p <= to; p++) mk(String(p), p, p === state.page, false);
    mk('›', state.page + 1, false, state.page >= pages);
  }

  function fail(tbodyId, cols, msg){
    var b = el(tbodyId); if (!b) return;
    b.innerHTML = '<tr><td colspan="' + cols + '" style="text-align:center;padding:18px;color:#b91c1c">'
      + esc(msg) + '</td></tr>';
  }

  function qs(o){
    return Object.keys(o).filter(function(k){ return o[k]; })
      .map(function(k){ return k + '=' + encodeURIComponent(o[k]); }).join('&');
  }

  /* ══ BtoB — 통장 직접입금 ══════════════════════════════════ */
  function loadB2B(){
    var url = '/api/admin/payments/b2b?' + qs({ from:B2B.from, to:B2B.to, q:B2B.q, page:B2B.page });
    return fetch(url, { credentials:'same-origin' })
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d){
        if (!d || !d.ok) throw new Error((d && d.error) || '응답 오류');
        B2B.data = d;
        var k = d.kpi || {};
        setText('b2b-kpi-today',  won(k.today && k.today.amount));
        setText('b2b-kpi-month',  won(k.month && k.month.amount));
        setText('b2b-kpi-count',  cnt(k.count));
        setText('b2b-kpi-payers', (Number(k.payers)||0) + '곳');
        setText('b2b-kpi-today-t', trend('전일 대비', k.dayDelta));
        setText('b2b-kpi-month-t', trend('전월 대비', k.monthDelta));
        setText('b2b-kpi-count-t', '평균 ' + won(k.avgPerCase) + '/건');

        /* 🏦 통장은 배포 권한자가 «바로빌 동기화» 를 돌려야 채워진다. 며칠 멈춰 있는
           상태를 모르고 보면 「이번달 입금이 이것뿐」 으로 오해한다 — 그래서 밝힌다. */
        var note = el('b2b-src-note');
        if (note) {
          if (!d.hasBank) {
            note.textContent = '🏦 통장 입금 내역이 아직 없습니다 — 신한 계좌 동기화를 한 번도 돌리지 않았거나 연동이 꺼져 있습니다.';
            note.hidden = false;
          } else if (d.stale) {
            note.textContent = '🏦 통장 반영 ' + d.lastBankAt + '까지 — 그 이후 입금은 아직 안 보입니다. 최신으로 보려면 신한 계좌 동기화를 돌려야 합니다.';
            note.hidden = false;
          } else { note.hidden = true; }
        }

        drawLine('b2b-chart', (d.daily||[]).map(function(x){ return Number(x.amount)||0; }), '#60A5FA');

        var b = el('b2b-tbody');
        if (b) {
          var rows = d.rows || [];
          if (!rows.length) {
            b.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px">해당 기간에 통장 입금이 없습니다.</td></tr>';
          } else {
            var start = ((d.page||1) - 1) * (d.pageSize||50);
            b.innerHTML = rows.map(function(r, i){
              return '<tr><td>' + (start + i + 1) + '</td><td>' + esc(r.date) + '</td><td>'
                + esc(r.remark) + '</td><td style="text-align:right">'
                + (Number(r.amount)||0).toLocaleString('ko-KR') + '</td></tr>';
            }).join('');
          }
        }
        pager('b2b-pager', B2B, d.total, loadB2B);
      })
      .catch(function(e){
        fail('b2b-tbody', 4, '통장 입금을 불러오지 못했습니다 — ' + e.message);
      });
  }

  /* ══ BtoC — 카드결제 ═══════════════════════════════════════ */
  function loadB2C(){
    var url = '/api/admin/payments/b2c?' + qs({
      agency:B2C.agency, from:B2C.from, to:B2C.to, q:B2C.q, page:B2C.page
    });
    return fetch(url, { credentials:'same-origin' })
      .then(function(r){ if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(d){
        if (!d || !d.ok) throw new Error((d && d.error) || '응답 오류');
        B2C.data = d;
        var k = d.kpi || {};
        var ratePct = ((Number(d.feeRate)||0) * 100).toFixed(2) + '%';
        setText('b2c-kpi-today', won(k.today && k.today.amount));
        setText('b2c-kpi-month', won(k.month && k.month.amount));
        setText('b2c-kpi-count', cnt(k.count));
        setText('b2c-kpi-fee',   won(k.fee));
        setText('b2c-kpi-today-t', trend('전일 대비', k.dayDelta));
        setText('b2c-kpi-month-t', trend('전월 대비', k.monthDelta));
        setText('b2c-kpi-count-t', '평균 ' + won(k.avgPerCase) + '/건');
        setText('b2c-kpi-fee-t',   '이번달 · 요율 ' + ratePct);

        // 대리점 드롭다운 — 결제가 실제로 있는 곳만. 고른 값은 유지한다.
        var sel = el('b2c-f-agency');
        if (sel && !sel.dataset.filled) {
          (d.agencies || []).forEach(function(n){
            var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o);
          });
          sel.dataset.filled = '1';
          sel.value = B2C.agency || '';
        }

        // ⚠️ 대리점을 못 붙인 몫 — 숨기지 않는다
        var un = el('b2c-unattr');
        if (un) {
          var u = d.unattributed || { count:0, amount:0 };
          if (u.count > 0) {
            un.textContent = '⚠️ 이 중 ' + cnt(u.count) + ' (' + won(u.amount) + ')는 결제한 아이디가 학생 원부에 없어 '
              + '대리점을 붙이지 못했습니다. 대리점으로 거르면 이 금액은 빠집니다.';
            un.hidden = false;
          } else { un.hidden = true; }
        }

        drawLine('b2c-chart', (d.daily||[]).map(function(x){ return Number(x.amount)||0; }), '#67E8F9');

        var b = el('b2c-tbody');
        if (b) {
          var rows = d.rows || [];
          if (!rows.length) {
            b.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px">조건에 맞는 결제가 없습니다.</td></tr>';
          } else {
            var start = ((d.page||1) - 1) * (d.pageSize||50);
            var rate = Number(d.feeRate) || 0;
            b.innerHTML = rows.map(function(r, i){
              var amt = Number(r.amount) || 0;
              return '<tr><td>' + (start + i + 1) + '</td>'
                + '<td>' + esc(r.date) + '</td>'
                + '<td>' + (r.student_name ? esc(r.student_name) : '<span style="color:#94a3b8">원부에 없음</span>') + '</td>'
                + '<td>' + esc(r.user_id) + '</td>'
                + '<td>' + (r.agency ? esc(r.agency) : '<span style="color:#94a3b8">—</span>') + '</td>'
                + '<td>' + esc(r.method || '—') + '</td>'
                + '<td style="text-align:right">' + amt.toLocaleString('ko-KR') + '</td>'
                + '<td style="text-align:right">' + Math.round(amt * rate).toLocaleString('ko-KR') + '</td></tr>';
            }).join('');
          }
        }
        pager('b2c-pager', B2C, d.total, loadB2C);
      })
      .catch(function(e){
        fail('b2c-tbody', 8, '결제 내역을 불러오지 못했습니다 — ' + e.message);
      });
  }

  /* ── 검색 / CSV ────────────────────────────────────────────── */
  function val(id){ var e = el(id); return e ? String(e.value || '').trim() : ''; }

  window.b2bSearch = function(){
    B2B.from = val('b2b-f-from'); B2B.to = val('b2b-f-to'); B2B.q = val('b2b-f-q'); B2B.page = 1;
    loadB2B();
  };
  window.b2cSearch = function(){
    B2C.agency = val('b2c-f-agency'); B2C.from = val('b2c-f-from');
    B2C.to = val('b2c-f-to'); B2C.q = val('b2c-f-q'); B2C.page = 1;
    loadB2C();
  };

  /* CSV — 지금 화면에 보이는 페이지를 그대로 내보낸다.
     ⚠️ 「전체 내보내기」로 오해하지 않게 파일명에 페이지를 박는다. */
  function csv(rows, header, name){
    if (!rows.length) { alert('내보낼 내용이 없습니다.'); return; }
    var body = [header].concat(rows).map(function(r){
      return r.map(function(c){ return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\r\n');
    // BOM — 엑셀이 UTF-8 한글을 깨뜨리지 않게
    var blob = new Blob(['﻿' + body], { type:'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  window.b2bDownloadCsv = function(){
    var d = B2B.data; if (!d) return;
    csv((d.rows||[]).map(function(r){ return [r.date, r.remark, r.amount]; }),
        ['입금일','입금처(적요)','입금액'],
        'btob-통장입금-' + (d.today||'') + '-p' + (d.page||1) + '.csv');
  };
  window.b2cDownloadCsv = function(){
    var d = B2C.data; if (!d) return;
    var rate = Number(d.feeRate) || 0;
    csv((d.rows||[]).map(function(r){
          var a = Number(r.amount)||0;
          return [r.date, r.student_name, r.user_id, r.agency, r.method, a, Math.round(a*rate)];
        }),
        ['결제일','학생명','결제 아이디','대리점','결제수단','결제금액','PG수수료'],
        'btoc-카드결제-' + (d.today||'') + '-p' + (d.page||1) + '.csv');
  };

  /* ── 최초 로드 · 카드를 열 때 다시 그리기 ──────────────────
     카드가 접힌 상태에서는 canvas 폭이 0이라 차트가 안 그려진다. */
  var loaded = { b2b:false, b2c:false };
  function open(id){
    if (id === 'card-payments-b2b') { if (!loaded.b2b) { loaded.b2b = true; loadB2B(); } else redraw(); }
    if (id === 'card-payments-b2c') { if (!loaded.b2c) { loaded.b2c = true; loadB2C(); } else redraw(); }
  }
  function redraw(){
    if (B2B.data) drawLine('b2b-chart', (B2B.data.daily||[]).map(function(x){ return Number(x.amount)||0; }), '#60A5FA');
    if (B2C.data) drawLine('b2c-chart', (B2C.data.daily||[]).map(function(x){ return Number(x.amount)||0; }), '#67E8F9');
  }

  document.addEventListener('toggle', function(e){
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'card-payments-b2b' || t.id === 'card-payments-b2c') {
      if (t.open) setTimeout(function(){ open(t.id); }, 60);
    }
  }, true);

  // 이미 열린 채로 그려진 경우(펼침 상태 복원 등)
  document.addEventListener('DOMContentLoaded', function(){
    ['card-payments-b2b','card-payments-b2c'].forEach(function(id){
      var c = el(id); if (c && c.open) open(id);
    });
  });

  window.addEventListener('resize', function(){ setTimeout(redraw, 120); });

  console.log('[ph106] 결제관리 실데이터 렌더러 준비 완료');
})();
