/* ═══════════════════════════════════════════════════════════════════════════
   🏦 신한 계좌 «출금» 분석 화면 — admin.html 「🏦 신한 계좌 입출금 (지출 분석)」
   (2026-08-23 사장님 요청 — 「신한카드처럼 은행도 구분해서 자세히 보고 싶다」)

   [왜 별도 파일인가] adm-core.js 는 이미 굵고, 이 화면은 회계 담당만 여는 카드다.
   defer 로 따로 받으면 첫 화면 무게에 영향이 없다.

   [숫자는 전부 서버가 준 것을 그대로 그린다]
     GET /api/admin/reports/bank-expenses?month=YYYY-MM
   ⛔ 계정과목을 화면에서 다시 계산하지 말 것 — 서버가 손익계산서와 «같은 함수»
      (resolveExpenseAccount)로 판정해서 내려준다. 여기서 한 번 더 계산하면 두 화면이
      조용히 갈라진다(2026-08-23 에 판정을 한 함수로 모은 이유가 그것이다).
   ⛔ 데이터가 없을 때 예시 숫자를 채우지 말 것 — ₩0 도 «실제 0원» 으로 읽힌다.
      대신 서버가 준 status.message_ko/en 로 «왜 비어 있는지» 를 말한다.

   ⚠️ i18n — JS 로 그린 글자는 data-ko/data-en 루프가 못 고친다. 그래서 라벨을 그릴 때
      data-ko/data-en 을 함께 박고, 언어가 바뀌면 캐시한 자료로 다시 그린다.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var _data = null;          // 마지막으로 받은 payload (언어 전환 때 다시 그리는 데 쓴다)
  var _charts = {};          // Chart 인스턴스 — 다시 그릴 때 destroy 해야 겹치지 않는다
  var _busy = false;

  function en() { return !!(window.adminLang && window.adminLang !== 'ko'); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function krw(n) {
    var v = Number(n) || 0;
    return '₩' + v.toLocaleString('ko-KR');
  }
  /* ⚠️ 방향을 «색으로만» 말하지 않는다. KPI 타일은 테마에 따라 어두운 면이 되는데,
     그때 `js/adm-s13.js` 의 가독성 구제(대비<3 이면 다시 칠함)가 빨강·초록을 같은 색으로
     바꾼다 — 그것이 맞는 동작이다(어두운 면 위의 빨강은 안 읽힌다). 그래서 ▲▼ 를 함께 쓴다.
     색은 읽히는 곳(표)에서 거들 뿐이고, 뜻은 기호가 지고 간다. */
  function pct(v) { return (v == null ? '—' : (v > 0 ? '▲' : v < 0 ? '▼' : '') + Math.abs(v) + '%'); }
  function $(id) { return document.getElementById(id); }
  function setText(id, ko, enText) {
    var el = $(id); if (!el) return;
    el.setAttribute('data-ko', ko);
    el.setAttribute('data-en', enText == null ? ko : enText);
    el.textContent = en() ? (enText == null ? ko : enText) : ko;
  }

  /* 🏷️ 계정과목이 손익계산서에서 어떻게 취급되는지 — 서버의 role 을 사람 말로. */
  var ROLE_LABEL = {
    opex:   ['판관비에 포함', 'Counted in opex'],
    dup:    ['제외 — 카드·급여명세와 중복', 'Excluded — duplicate'],
    moved:  ['다른 줄로 — 강사급여·매출차감', 'Moved to another line'],
    review: ['확인 필요 — 계정과목 없음', 'Needs an account']
  };
  /* ⛔ 색을 인라인 style 로 주지 않는다 — `admin-inline-c.css` 의 전역 규칙이 `[id^="card-"]`
     안 글자를 통째로 덮고, 그 위에 페인터가 **인라인 `!important` 로 한 번 더** 칠한다.
     2026-08-23 실측(KPI 타일): 빨강 `#b91c1c` 로 적은 글자가 화면에는 `rgb(248,250,252)`(흰빛)
     — 인라인에 `color: rgb(248,250,252) !important` 가 박혀 있었고 `data-lightened` 는 없었다
     (= `js/adm-s13.js` 의 `fixTextOnDark()` 가 칠한 것).
     ✅ 뜻이 있는 색은 클래스로 주고, 값은 그 CSS 파일 맨 끝 `#acc-bankacct …` 블록이 정한다.
     ⛔ 페인터의 `SKIP_SEL` 에는 **일부러 등재하지 않았다** — 그건 «대비가 모자랄 때만» 도는
        가독성 구제라, 예외로 빼면 어두운 타일 위에 안 읽히는 빨강이 박힌다. 대신 색이 눌릴 수
        있는 자리는 아래 `pct()` 처럼 ▲▼ 로 뜻을 함께 말한다. */
  var ROLE_CLASS = { opex: 'bk-role-opex', dup: 'bk-role-dup', moved: 'bk-role-moved', review: 'bk-role-review' };

  /* 🎨 도넛 색 — 계정과목 수만큼 돌려 쓴다. 「기타출금」만 늘 빨강으로 튀게 해서
     «아직 분류가 안 된 돈» 이 한눈에 보이게 한다. */
  var PALETTE = ['#1e40af', '#0891b2', '#047857', '#b45309', '#7c3aed', '#be185d',
                 '#0f766e', '#4338ca', '#a16207', '#15803d', '#9333ea', '#0369a1'];
  function catColor(account, i) {
    return account === '기타출금' ? '#b91c1c' : PALETTE[i % PALETTE.length];
  }

  // ── Chart.js 지연 로드 (adm-core.js 와 같은 경로 — 우리 서버 파일을 먼저 쓴다) ──
  function withChart(fn) {
    if (typeof window.Chart !== 'undefined') { fn(); return; }
    if (window._admChartLoading) { setTimeout(function () { withChart(fn); }, 200); return; }
    window._admChartLoading = true;
    var sc = document.createElement('script');
    sc.src = '/vendor/chartjs/chart.umd.min.js';
    sc.onload = function () { window._admChartLoading = false; try { fn(); } catch (e) {} };
    sc.onerror = function () { window._admChartLoading = false; };
    document.head.appendChild(sc);
  }

  function kstMonth() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
  }

  // ── 📣 연동 상태 상자 ──────────────────────────────────────────────────────
  function renderStatus() {
    var box = $('acc-bank-status'); if (!box) return;
    var st = _data && _data.status;
    if (!st) { box.innerHTML = ''; return; }
    var msg = en() ? (st.message_en || st.message_ko) : st.message_ko;
    var tone = st.state === 'ok'
      ? { bg: '#ecfdf5', bd: '#a7f3d0', fg: '#065f46' }
      : (st.state === 'sync_error' ? { bg: '#fef2f2', bd: '#fecaca', fg: '#991b1b' }
                                   : { bg: '#fffbeb', bd: '#fcd34d', fg: '#78350f' });
    var extra = '';
    if (st.state === 'sync_error' && st.last_error) {
      extra = '<div style="margin-top:5px;font-size:11px;opacity:0.9;word-break:break-all">'
            + esc(String(st.last_error).slice(0, 300)) + '</div>';
    }
    var when = st.last_sync_at
      ? new Date(st.last_sync_at + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ')
      : null;
    box.innerHTML =
      '<div style="background-color:' + tone.bg + ';border:1px solid ' + tone.bd
      + ';border-left:3px solid ' + tone.bd + ';border-radius:6px;padding:9px 12px;font-size:12px;line-height:1.7;color:'
      + tone.fg + '">' + esc(msg || '')
      + (when ? '<span style="opacity:0.75"> · ' + (en() ? 'last sync ' : '마지막 동기화 ') + esc(when) + ' KST</span>' : '')
      + (st.rows_total != null ? '<span style="opacity:0.75"> · ' + (en() ? 'rows ' : '적재 ') + Number(st.rows_total).toLocaleString('ko-KR') + (en() ? '' : '건') + '</span>' : '')
      + extra + '</div>';
  }

  // ── 📊 KPI ────────────────────────────────────────────────────────────────
  function renderKpis() {
    var s = _data && _data.summary; if (!s) return;
    setText('bk-kpi-total', krw(s.out_total), krw(s.out_total));
    setText('bk-kpi-total-sub', '건수 ' + (s.out_count || 0) + '건', (s.out_count || 0) + ' transactions');
    setText('bk-kpi-prev', pct(s.prev_delta_pct), pct(s.prev_delta_pct));
    setText('bk-kpi-prev-sub', '전월 ' + krw(s.prev_total), 'last month ' + krw(s.prev_total));
    setText('bk-kpi-avg3', pct(s.avg3m_delta_pct), pct(s.avg3m_delta_pct));
    setText('bk-kpi-avg3-sub', '평균 ' + krw(s.avg3m), 'avg ' + krw(s.avg3m));
    setText('bk-kpi-review', krw(s.review_total), krw(s.review_total));
    setText('bk-kpi-review-sub', '「기타출금」 비율 ' + (s.review_ratio || 0) + '%',
                                 'share ' + (s.review_ratio || 0) + '%');
    // 증감은 «늘면 빨강» — 지출이라 늘어난 것이 나쁜 소식이다
    [['bk-kpi-prev', s.prev_delta_pct], ['bk-kpi-avg3', s.avg3m_delta_pct]].forEach(function (p) {
      var el = $(p[0]); if (!el) return;
      el.classList.remove('bk-sig-up', 'bk-sig-down', 'bk-sig-flat');
      el.classList.add(p[1] == null ? 'bk-sig-flat' : (p[1] > 0 ? 'bk-sig-up' : 'bk-sig-down'));
    });
  }

  // ── 📈 차트 ───────────────────────────────────────────────────────────────
  function renderCharts() {
    if (!_data) return;
    withChart(function () {
      var cats = (_data.categories || []).slice(0, 12);
      var d1 = $('acc-bank-donut');
      if (d1) {
        if (_charts.donut) { try { _charts.donut.destroy(); } catch (e) {} }
        _charts.donut = new window.Chart(d1.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: cats.map(function (c) { return c.account; }),
            datasets: [{
              data: cats.map(function (c) { return c.total; }),
              backgroundColor: cats.map(function (c, i) { return catColor(c.account, i); }),
              borderWidth: 0
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } },
              tooltip: { callbacks: { label: function (ctx) { return ctx.label + ' ' + krw(ctx.parsed); } } }
            }
          }
        });
      }
      var d2 = $('acc-bank-line');
      if (d2) {
        var hist = _data.history || [];
        if (_charts.line) { try { _charts.line.destroy(); } catch (e) {} }
        _charts.line = new window.Chart(d2.getContext('2d'), {
          type: 'bar',
          data: {
            labels: hist.map(function (h) { return String(h.month).slice(2); }),
            datasets: [{
              label: en() ? 'Withdrawals' : '출금',
              data: hist.map(function (h) { return h.total; }),
              backgroundColor: hist.map(function (h) {
                return h.month === _data.period ? '#1e40af' : '#bfdbfe';
              })
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: function (ctx) { return krw(ctx.parsed.y); } } }
            },
            scales: {
              x: { ticks: { font: { size: 10 } } },
              y: { ticks: { font: { size: 10 }, callback: function (v) { return (v / 10000) + '만'; } } }
            }
          }
        });
      }
    });
  }

  // ── 🏷️ 계정과목별 표 ──────────────────────────────────────────────────────
  function renderCats() {
    var tb = $('acc-bank-cats'); if (!tb) return;
    var cats = (_data && _data.categories) || [];
    if (!cats.length) {
      tb.innerHTML = '<tr><td colspan="5" style="padding:22px;text-align:center;color:#9ca3af">'
        + (en() ? 'No withdrawals in this month.' : '이 달에는 출금이 없습니다.') + '</td></tr>';
      return;
    }
    tb.innerHTML = cats.map(function (c) {
      var lab = ROLE_LABEL[c.role] || ROLE_LABEL.opex;
      return '<tr>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9"><b>' + esc(c.account) + '</b></td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">' + krw(c.total) + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right">' + (c.count || 0) + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right">' + (c.share || 0) + '%</td>'
        + '<td class="bk-sig ' + (ROLE_CLASS[c.role] || 'bk-role-opex')
        + '" style="padding:7px 9px;border-bottom:1px solid #f1f5f9">'
        + esc(en() ? lab[1] : lab[0]) + '</td>'
        + '</tr>';
    }).join('');
  }

  /* ── 🏪 거래처별 표 + 🏷️ 그 자리에서 계정과목 지정 (2단계) ──────────────────
     [왜 여기서 지정하나] 지정 화면(「🏷️ 지출 계정과목 분류」)이 이 카드 아래 따로 있는데,
     «무엇을 지정해야 하는지» 는 이 표를 봐야 안다. 두 화면을 오가면 금액이 큰 것부터
     처리하기가 어렵다. 그래서 보는 자리에서 바로 정한다 — 저장은 **기존 API 그대로**
     (`POST /api/admin/reports/payees`)라 지정 화면과 규칙이 갈라질 수 없다.

     ⚠️ 지정은 **그 거래처의 지난 출금까지 함께** 바뀐다(서버가 «읽을 때» 판정하므로).
        그 사실을 표 아래에 반드시 적어 둔다 — 모르고 누르면 지난달 손익계산서가 움직인다.
     ⚠️ 저장된 1차 분류가 「기타출금」이 아닌 행(급여이체·카드대금 등)은 **지정해도 안 바뀐다.**
        서버가 `assignable` 로 미리 알려 주므로 그런 거래처에는 칸 대신 이유를 적는다.
        (안 그러면 지정해 놓고 「저장이 안 된다」로 읽힌다 — 에러가 안 나기 때문이다.)
     ⚠️ 낙관적 갱신을 하지 않는다 — 서버가 «저장했다» 고 답한 뒤에 **다시 조회**한다.
        화면만 먼저 바꾸면 실패했을 때 «바뀐 줄 아는» 상태가 남는다. */
  function renderPayees() {
    var tb = $('acc-bank-payees'); if (!tb) return;
    var rows = ((_data && _data.payees) || []).slice(0, 20);
    var note = $('acc-bank-assign-note');
    if (note) {
      note.textContent = !_data ? ''
        : (_data.can_assign
            ? (en()
                ? '※ Assigning an account applies to that payee’s PAST and future withdrawals. Choosing “기타출금” clears the assignment.'
                : '※ 계정과목을 지정하면 그 거래처의 «지난 출금까지» 함께 그 과목으로 들어갑니다. 「기타출금」을 고르면 지정을 지웁니다.')
            : (en() ? '※ Only head-office accounts can assign expense accounts.'
                    : '※ 계정과목 지정은 본사 계정만 할 수 있습니다.'));
    }
    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="5" style="padding:22px;text-align:center;color:#9ca3af">—</td></tr>';
      return;
    }
    var opts = (_data && _data.account_options) || [];
    tb.innerHTML = rows.map(function (r) {
      var needs = r.account === '기타출금';
      return '<tr>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9">' + esc(r.payee)
        + (r.assigned ? ' <span style="font-size:10px;color:#047857">('
            + (en() ? 'assigned' : '지정됨') + ')</span>' : '') + '</td>'
        + '<td class="' + (needs ? 'bk-sig bk-role-review' : '') + '" style="padding:7px 9px;border-bottom:1px solid #f1f5f9">'
        + esc(r.account) + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">' + krw(r.total) + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right">' + (r.count || 0) + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9">' + assignCell(r, opts) + '</td>'
        + '</tr>';
    }).join('');
    bindAssign();
  }

  /** 지정 칸 하나 — 지정할 수 있을 때만 고르는 칸을 내고, 아니면 «왜 못 하는지» 를 적는다. */
  function assignCell(r, opts) {
    if (!_data || !_data.can_assign) {
      return '<span style="color:#9ca3af">' + (en() ? '—' : '—') + '</span>';
    }
    if (!r.assignable) {
      /* 은행 적요로 이미 분류가 붙은 거래처 — 지정해도 안 바뀐다는 사실을 그대로 적는다 */
      return '<span style="color:#6b7280;font-size:11px">'
        + esc(en() ? 'Set from the bank remark — assigning has no effect'
                   : '은행 적요로 이미 분류됨 — 지정해도 안 바뀝니다') + '</span>';
    }
    var cur = opts.indexOf(r.account) >= 0 ? r.account : '';
    /* ⚠️ `data-prev` 에 «원래 값» 을 적어 둔다 — 저장이 실패했을 때 되돌리기 위해서다.
       change 가 발화한 «뒤» 에 `sel.value` 를 읽으면 그건 이미 바뀐 값이라 되돌리기가
       무효가 된다(2026-08-23 브라우저 검사가 실제로 잡았다: 실패했는데 고른 값이 그대로
       남아 «저장된 줄» 아는 상태). */
    var html = '<select class="bk-assign" data-payee="' + esc(r.payee)
      + '" data-prev="' + esc(cur) + '"'
      + ' style="font-size:11px;padding:3px 5px;border:1px solid #d1d5db;border-radius:5px;max-width:150px">';
    html += '<option value=""' + (cur ? '' : ' selected') + '>'
          + esc(cur ? '' : (en() ? '— choose —' : '— 고르기 —')) + '</option>';
    for (var i = 0; i < opts.length; i++) {
      html += '<option value="' + esc(opts[i]) + '"' + (opts[i] === cur ? ' selected' : '') + '>'
            + esc(opts[i]) + '</option>';
    }
    return html + '</select>';
  }

  /* 고르면 바로 저장한다. 저장이 끝나면 화면 전체를 다시 조회한다 —
     계정과목이 바뀌면 KPI·도넛·계정과목 표·내역 표가 **전부** 따라 움직여야 하기 때문이다. */
  function bindAssign() {
    var list = document.querySelectorAll('#acc-bank-payees select.bk-assign');
    for (var i = 0; i < list.length; i++) {
      (function (sel) {
        if (sel.__bkBound) return;
        sel.__bkBound = true;
        sel.addEventListener('change', function () {
          var payee = sel.getAttribute('data-payee') || '';
          var cat = sel.value;
          if (!payee || !cat) return;
          saveAssign(payee, cat, sel);
        });
      })(list[i]);
    }
  }

  async function saveAssign(payee, category, sel) {
    if (_busy) return;
    _busy = true;
    var note = $('acc-bank-assign-note');
    // ⛔ `sel.value` 를 쓰지 말 것 — change 뒤라 이미 «바뀐 값» 이다. 원래 값은 data-prev.
    var prev = sel ? (sel.getAttribute('data-prev') || '') : '';
    if (sel) sel.disabled = true;
    try {
      var url = '/api/admin/reports/payees?payee=' + encodeURIComponent(payee)
              + '&category=' + encodeURIComponent(category);
      var r = await fetch(url, { method: 'POST', credentials: 'include' });
      var d = null; try { d = await r.json(); } catch (e) {}
      if (!r.ok || !d || !d.ok) {
        /* 실패는 말로 알린다 — 조용히 두면 «저장된 줄» 안다.
           서버가 403 을 주는 경우(본사 아님)도 여기로 온다. */
        if (note) {
          note.textContent = (en() ? 'Could not save: ' : '저장하지 못했습니다: ')
            + String((d && (d.error || d.message)) || ('HTTP ' + r.status));
        }
        if (sel) { sel.disabled = false; sel.value = prev; }
        _busy = false;
        return;
      }
    } catch (e) {
      if (note) note.textContent = en() ? 'Network error.' : '통신에 실패했습니다.';
      if (sel) { sel.disabled = false; sel.value = prev; }
      _busy = false;
      return;
    }
    _busy = false;
    await window.bankExpLoad();   // 서버가 «저장했다» 고 답한 뒤에만 다시 그린다
  }

  // ── 🧾 출금 내역 표 ───────────────────────────────────────────────────────
  function renderRows() {
    var tb = $('acc-bank-rows'); if (!tb) return;
    var rows = (_data && _data.rows) || [];
    if (!rows.length) {
      var st = _data && _data.status;
      var why = st ? (en() ? (st.message_en || st.message_ko) : st.message_ko) : '';
      tb.innerHTML = '<tr><td colspan="5" style="padding:26px;text-align:center;color:#6b7280;font-size:13px;line-height:1.8">'
        + (en() ? '<b>No withdrawals to show for this month.</b>'
                : '<b>이 달에 보여드릴 출금 내역이 없습니다.</b>')
        + (why ? '<br><span style="color:#b45309">' + esc(why) + '</span>' : '')
        + '</td></tr>';
      return;
    }
    tb.innerHTML = rows.map(function (r) {
      var needs = r.account === '기타출금';
      return '<tr>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;white-space:nowrap">' + esc(String(r.datetime || '').slice(0, 16)) + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9">' + esc(r.remark) + '</td>'
        + '<td class="' + (needs ? 'bk-sig bk-role-review' : '') + '" style="padding:7px 9px;border-bottom:1px solid #f1f5f9">'
        + esc(r.account) + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">' + krw(r.amount) + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right;color:#6b7280">' + krw(r.balance) + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderAll() {
    renderStatus(); renderKpis(); renderCats(); renderPayees(); renderRows(); renderCharts();
  }

  /* 자료가 없을 때 — 숫자를 한 칸도 채우지 않는다(₩0 도 «실제 0원» 으로 읽힌다). */
  function renderEmpty(msg) {
    ['bk-kpi-total', 'bk-kpi-review'].forEach(function (id) { setText(id, '₩—', '₩—'); });
    ['bk-kpi-prev', 'bk-kpi-avg3'].forEach(function (id) {
      setText(id, '—%', '—%');
      var el = $(id); if (!el) return;
      el.classList.remove('bk-sig-up', 'bk-sig-down');
      el.classList.add('bk-sig-flat');
    });
    setText('bk-kpi-total-sub', '건수 —', '— transactions');
    setText('bk-kpi-prev-sub', '전월 ₩—', 'last month ₩—');
    setText('bk-kpi-avg3-sub', '평균 ₩—', 'avg ₩—');
    setText('bk-kpi-review-sub', '「기타출금」 비율 —%', 'share —%');
    ['acc-bank-cats', 'acc-bank-payees'].forEach(function (id) {
      var tb = $(id); if (tb) tb.innerHTML = '<tr><td colspan="5" style="padding:22px;text-align:center;color:#9ca3af">—</td></tr>';
    });
    var rb = $('acc-bank-rows');
    if (rb) {
      rb.innerHTML = '<tr><td colspan="5" style="padding:26px;text-align:center;color:#b45309;font-size:13px">'
        + esc(msg || (en() ? 'Could not load.' : '불러오지 못했습니다.')) + '</td></tr>';
    }
    ['donut', 'line'].forEach(function (k) {
      if (_charts[k]) { try { _charts[k].destroy(); } catch (e) {} _charts[k] = null; }
    });
  }

  // ── 조회 ──────────────────────────────────────────────────────────────────
  window.bankExpLoad = async function () {
    if (_busy) return;
    _busy = true;
    var btn = $('acc-bank-load-btn');
    var mEl = $('acc-bank-month');
    var q = (mEl && mEl.value) ? ('?month=' + encodeURIComponent(mEl.value)) : '';
    if (btn) btn.disabled = true;
    try {
      var r = await fetch('/api/admin/reports/bank-expenses' + q, { credentials: 'include' });
      var d = null; try { d = await r.json(); } catch (e) {}
      if (r.ok && d && d.ok) { _data = d; renderAll(); }
      else {
        _data = null;
        renderEmpty((d && (d.error || d.message)) || ('HTTP ' + r.status));
      }
    } catch (e) {
      _data = null;
      renderEmpty(en() ? 'Network error.' : '통신에 실패했습니다.');
    } finally {
      _busy = false;
      if (btn) btn.disabled = false;
    }
  };

  /* ⛔ «계좌 동기화» 실행 함수를 여기 두지 않는다 (2026-08-23 에 넣었다가 뺐다).
     `POST /api/admin/bankacct/sync` 는 적재만 하는 것이 아니라 끝에서
     `UPDATE bankacct_transactions SET category=?` 로 **전 기간 소급 재분류**를 한다
     (`src/bankacct-sync.ts`). D1 은 개발·운영이 같은 DB 라 CLAUDE.md 1-1 이
     「UPDATE 는 사람에게 먼저 알릴 것」이라고 못 박는다. 지금까지 그 UPDATE 를 도는 것은
     밤 자동 동기화뿐이었고, 화면에 버튼을 붙이면 본사 관리자 누구나 돌릴 수 있게 된다.
     ✅ 이 화면은 «보는» 화면이다. 새 거래는 밤에 자동으로 들어오고, 계정과목 지정은
        「🏷️ 지출 계정과목 분류」에서 하며 **동기화를 기다리지 않고 바로 반영된다**
        (서버가 저장된 category 를 덮어쓰지 않고 «읽을 때» 판정하기 때문). */

  // ── 카드를 펼치면 자동 조회 (버튼 안 눌러도 바로 보이게) ──────────────────
  (function bind() {
    var d = $('acc-bankacct');
    if (!d) { document.addEventListener('DOMContentLoaded', bind, { once: true }); return; }
    if (d.__bankBound) return;
    d.__bankBound = true;

    var mEl = $('acc-bank-month');
    if (mEl) {
      if (!mEl.value) mEl.value = kstMonth();
      mEl.addEventListener('change', function () { window.bankExpLoad(); });
    }
    d.addEventListener('toggle', function () {
      if (d.open && !_data) window.bankExpLoad();
    });
    if (d.open) window.bankExpLoad();

    /* 🌐 언어 전환 — JS 로 그린 글자는 data-ko/data-en 루프가 못 고치므로 다시 그린다.
       (받아 둔 자료로만 다시 그린다 — 서버를 또 부르지 않는다)
       ⚠️ 이 이벤트는 window 가 아니라 **document** 에서 발화한다(adm-core.js toggleAdminLang). */
    document.addEventListener('mangoi:lang-changed', function () {
      if (_data) renderAll();
    });
  })();
})();
