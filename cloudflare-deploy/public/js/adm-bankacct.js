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
  var _expanded = {};        // 🔎 거래처별 표에서 «펼쳐 둔» 이름 — 다시 그려도 유지한다

  /* ── 🔃 정렬 · 🔍 필터 (2026-08-24 사장님 요청) ────────────────────────────
     [왜 화면에서 하나] 그 달 전건이 이미 payload 에 있다. 서버를 다시 부르면 왕복만 늘고
     «합계와 목록이 다른 시점 자료» 가 될 위험이 생긴다(펼치기 때와 같은 판단).
     ⚠️ 그래서 필터는 «받아 온 그 달» 안에서만 거른다 — 다른 달을 찾으려면 월을 바꿔야 한다.
     ⚠️ 걸러 놓으면 위쪽 KPI·도넛과 표가 어긋나 보인다. KPI 는 «그 달 전체» 이고 표는
        «걸러진 것» 이라 둘 다 맞다 — 그 사실을 표 옆 «N/M건 · 표시 중 합계» 로 말한다.
        (숫자만 바뀌고 아무 설명이 없으면 「합계가 틀렸다」로 읽힌다) */
  var _sort = { recur: [], cats: [], payees: [], rows: [] };
  var _flt  = { recurQ: '', recurKind: '', catsRole: '', payeesQ: '', rowsQ: '', rowsAcc: '' };
  var _moversAll = false;    // 📈 증감 표를 Top 5 로 볼지, 전체로 볼지

  /* 정렬 «값» 을 꺼내는 법 — 숫자는 숫자로, 글자는 글자로 비교해야 한다.
     ⚠️ 성격(kind)은 글자로 비교하면 「고정비·반복·변동」이 뜻과 무관한 순서가 되므로
        의미 순서(고정 0 → 반복 1 → 변동 2)를 숫자로 준다. */
  var SORT_VAL = {
    recur: {
      payee:   function (r) { return String(r.payee || ''); },
      kind:    function (r) { return ({ fixed: 0, recurring: 1, variable: 2 })[r.kind]; },
      current: function (r) { return Number(r.current) || 0; },
      avg:     function (r) { return Number(r.avg) || 0; },
      months:  function (r) { return Number(r.months_seen) || 0; }
    },
    cats: {
      account: function (r) { return String(r.account || ''); },
      total:   function (r) { return Number(r.total) || 0; },
      count:   function (r) { return Number(r.count) || 0; },
      share:   function (r) { return Number(r.share) || 0; },
      role:    function (r) { return String(r.role || ''); }
    },
    payees: {
      payee:   function (r) { return String(r.payee || ''); },
      account: function (r) { return String(r.account || ''); },
      total:   function (r) { return Number(r.total) || 0; },
      count:   function (r) { return Number(r.count) || 0; }
    },
    rows: {
      datetime: function (r) { return String(r.datetime || ''); },
      remark:   function (r) { return String(r.remark || ''); },
      account:  function (r) { return String(r.account || ''); },
      amount:   function (r) { return Number(r.amount) || 0; },
      balance:  function (r) { return Number(r.balance) || 0; }
    }
  };
  var SORT_LABEL = {
    recur:  { payee: ['거래처', 'Payee'], kind: ['성격', 'Type'], current: ['이번 달', 'This month'],
              avg: ['월평균', 'Monthly avg'], months: ['근거', 'Why'] },
    cats:   { account: ['계정과목', 'Account'], total: ['금액', 'Amount'], count: ['건수', 'Count'],
              share: ['비중', 'Share'], role: ['손익계산서 취급', 'In P&L'] },
    payees: { payee: ['거래처', 'Payee'], account: ['계정과목', 'Account'], total: ['합계 금액', 'Total'],
              count: ['건수', 'Count'] },
    rows:   { datetime: ['일시', 'Date'], remark: ['적요', 'Remark'], account: ['계정과목', 'Account'],
              amount: ['출금액', 'Amount'], balance: ['잔액', 'Balance'] }
  };

  function applySort(table, list) {
    var spec = _sort[table];
    if (!spec || !spec.length) return list;   // 안 걸었으면 서버가 준 순서 그대로 — 예전 동작이다
    var vf = SORT_VAL[table] || {};
    return list.slice().sort(function (a, b) {
      for (var i = 0; i < spec.length; i++) {
        var f = vf[spec[i].key]; if (!f) continue;
        var va = f(a), vb = f(b), c;
        if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
        else c = String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb), 'ko');
        if (c !== 0) return spec[i].dir === 'asc' ? c : -c;
      }
      return 0;
    });
  }

  /** 헤더 클릭 = 내림 → 오름 → 해제. Shift+클릭 = 2차·3차 키 추가 (법인카드 표와 같은 조작) */
  function toggleSort(table, key, shift) {
    var spec = _sort[table]; if (!spec) return;
    var idx = -1;
    for (var i = 0; i < spec.length; i++) if (spec[i].key === key) idx = i;
    if (shift) {
      if (idx === -1) spec.push({ key: key, dir: 'desc' });
      else if (spec[idx].dir === 'desc') spec[idx].dir = 'asc';
      else spec.splice(idx, 1);
    } else if (spec.length === 1 && spec[0].key === key) {
      if (spec[0].dir === 'desc') spec[0].dir = 'asc';
      else _sort[table] = [];
    } else {
      _sort[table] = [{ key: key, dir: 'desc' }];
    }
  }

  /* 지금 무슨 순서인지 화면에 말한다 — 화살표만 두면 «왜 이 순서지» 를 아무도 모른다. */
  function paintSortUi(table) {
    var ths = document.querySelectorAll('#acc-bankacct .pr-th[data-bk-table="' + table + '"]');
    var spec = _sort[table] || [];
    for (var i = 0; i < ths.length; i++) {
      var th = ths[i], ar = th.querySelector('.pr-arrow');
      th.classList.remove('pr-active');
      if (ar) ar.textContent = '↕';
      var k = th.getAttribute('data-sort-key'), at = -1;
      for (var j = 0; j < spec.length; j++) if (spec[j].key === k) at = j;
      if (at >= 0) {
        th.classList.add('pr-active');
        if (ar) ar.textContent = (spec[at].dir === 'asc' ? '▲' : '▼') + (spec.length > 1 ? String(at + 1) : '');
      }
    }
    var note = $('acc-bank-' + table + '-sortnote'); if (!note) return;
    if (!spec.length) { note.innerHTML = ''; return; }
    var L = en(), lab = SORT_LABEL[table] || {};
    note.innerHTML = spec.map(function (s, i) {
      var t = lab[s.key] || [s.key, s.key];
      return '<span class="bk-sortchip">' + (spec.length > 1 ? (i + 1) + '. ' : '')
           + esc(L ? t[1] : t[0]) + ' ' + (s.dir === 'asc' ? '▲' : '▼') + '</span>';
    }).join('')
    /* ⛔ `<button>` 이 아니라 span 이다 — `details.menu-card button` 전역 규칙이 인디고
       그라데이션 알약(padding 9px 18px)으로 바꿔 제목줄을 밀어낸다(CLAUDE.md 2장). */
    + '<span class="bk-clear" data-bk-clear="' + table + '" role="button" tabindex="0">'
    + (L ? '✕ clear sort' : '✕ 정렬 해제') + '</span>';
  }

  /** 「N / M건 · 표시 중 합계 ₩…」 — 걸러 놓고 합계가 안 맞아 보이는 것을 막는다 */
  function setCount(id, shown, total, sum) {
    var el = $(id); if (!el) return;
    if (!total) { el.textContent = ''; return; }
    var L = en();
    var txt = (shown === total)
      ? (L ? total + ' rows' : total + '건')
      : (L ? shown + ' of ' + total + ' rows' : total + '건 중 ' + shown + '건');
    if (sum != null) txt += (L ? ' · shown total ' : ' · 표시 중 합계 ') + krw(sum);
    el.textContent = txt;
  }

  function hit(q, parts) {
    if (!q) return true;
    var s = parts.join(' ').toLowerCase();
    return s.indexOf(String(q).trim().toLowerCase()) !== -1;
  }
  function sumOf(list, key) {
    var t = 0; for (var i = 0; i < list.length; i++) t += (Number(list[i][key]) || 0);
    return t;
  }

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
    var all = (_data && _data.categories) || [];
    var cats = applySort('cats', all.filter(function (c) {
      return !_flt.catsRole || c.role === _flt.catsRole;
    }));
    setCount('acc-bank-cats-count', cats.length, all.length, sumOf(cats, 'total'));
    paintSortUi('cats');
    if (!cats.length) {
      tb.innerHTML = '<tr><td colspan="5" style="padding:22px;text-align:center;color:#9ca3af">'
        + (all.length ? (en() ? 'Nothing matches this filter.' : '고른 조건에 맞는 계정과목이 없습니다.')
                      : (en() ? 'No withdrawals in this month.' : '이 달에는 출금이 없습니다.')) + '</td></tr>';
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
    var allPayees = (_data && _data.payees) || [];
    /* ⚠️ 거르고 «나서» 20개를 자른다 — 먼저 자르면 21번째부터는 검색해도 영영 안 나온다. */
    var matched = allPayees.filter(function (r) { return hit(_flt.payeesQ, [r.payee, r.account]); });
    var rows = applySort('payees', matched).slice(0, 20);
    setCount('acc-bank-payees-count', rows.length, allPayees.length, sumOf(rows, 'total'));
    paintSortUi('payees');
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
      tb.innerHTML = '<tr><td colspan="5" style="padding:22px;text-align:center;color:#9ca3af">'
        + (allPayees.length ? esc(en() ? 'Nothing matches this search.' : '검색어에 맞는 거래처가 없습니다.') : '—')
        + '</td></tr>';
      return;
    }
    var opts = (_data && _data.account_options) || [];
    tb.innerHTML = rows.map(function (r) {
      var needs = r.account === '기타출금';
      var n = Number(r.count) || 0;
      var open = !!_expanded[r.payee];
      /* 🔎 이 표는 «합계», 아래 「출금 내역」 표는 «한 건» 이다. 두 표에 같은 이름이
         비슷한 금액으로 나와 「무슨 차이냐」는 물음이 실제로 나왔다(2026-08-23 사장님).
         그래서 ① 금액 밑에 «N건 합계» 를 적고 ② 이름을 누르면 그 N건을 여기서 편다. */
      var line = '<tr>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9">'
        + (n > 1
            ? '<span class="bk-sig bk-exp" data-exp="' + esc(r.payee) + '" role="button" tabindex="0">'
              + (open ? '▾ ' : '▸ ') + esc(r.payee) + '</span>'
            : esc(r.payee))
        + (r.assigned ? ' <span class="bk-sig bk-ok" style="font-size:10px">('
            + (en() ? 'assigned' : '지정됨') + ')</span>' : '') + '</td>'
        + '<td class="' + (needs ? 'bk-sig bk-role-review' : '') + '" style="padding:7px 9px;border-bottom:1px solid #f1f5f9">'
        + esc(r.account) + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">' + krw(r.total)
        + (n > 1 ? '<div class="bk-sig bk-note-mute" style="font-size:10px;font-weight:400;margin-top:1px">'
                   + esc(n + (en() ? ' transactions total' : '건 합계')) + '</div>' : '')
        + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right">' + n + '</td>'
        + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9">' + assignCell(r, opts) + '</td>'
        + '</tr>';
      return line + (open ? detailRows(r.payee) : '');
    }).join('');
    bindAssign();
    bindExpand();
  }

  /* 펼친 줄 — 그 거래처의 «개별 건» 을 여기서 보여 준다.
     ⚠️ 서버를 다시 부르지 않는다. 그 달 전건이 이미 `_data.rows` 에 있다.
     ⚠️ 묶는 키를 서버와 똑같이 맞춘다(`payee || remark || '(적요 없음)'`) — 여기서 다르게
        묶으면 «합계는 2건인데 펼치면 1건» 같은 어긋남이 조용히 생긴다. */
  function detailRows(payee) {
    var list = ((_data && _data.rows) || []).filter(function (d) {
      return (d.payee || d.remark || '(적요 없음)') === payee;
    });
    if (!list.length) {
      return '<tr><td colspan="5" class="bk-sig bk-note-mute" style="padding:8px 9px 8px 26px;border-bottom:1px solid #f1f5f9">'
        + esc(en() ? 'No individual rows for this month.' : '이 달에는 개별 건이 없습니다.') + '</td></tr>';
    }
    var inner = list.map(function (d) {
      return '<tr>'
        + '<td style="padding:4px 8px;white-space:nowrap">' + esc(String(d.datetime || '').slice(0, 16)) + '</td>'
        + '<td style="padding:4px 8px">' + esc(d.remark) + '</td>'
        + '<td style="padding:4px 8px">' + esc(d.account) + '</td>'
        + '<td style="padding:4px 8px;text-align:right;font-weight:700">' + krw(d.amount) + '</td>'
        + '</tr>';
    }).join('');
    return '<tr class="bk-detail"><td colspan="5" style="padding:0 9px 8px 26px;border-bottom:1px solid #f1f5f9">'
      + '<div class="bk-sig bk-note-mute" style="font-size:11px;margin:2px 0 4px">'
      + esc(en() ? 'Individual transactions (' + list.length + ')'
                 : '이 거래처의 개별 건 ' + list.length + '건') + '</div>'
      + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">'
      + inner + '</table></div></td></tr>';
  }

  /** 이름을 누르면 편다/접는다. 편 상태는 다시 그려도 유지한다(계정과목 지정 뒤 재조회 포함). */
  function bindExpand() {
    var list = document.querySelectorAll('#acc-bank-payees .bk-exp');
    for (var i = 0; i < list.length; i++) {
      (function (el) {
        if (el.__bkExpBound) return;
        el.__bkExpBound = true;
        var toggle = function (e) {
          e.preventDefault();
          var k = el.getAttribute('data-exp') || '';
          if (_expanded[k]) delete _expanded[k]; else _expanded[k] = true;
          renderPayees();
        };
        el.addEventListener('click', toggle);
        // 키보드로도 열 수 있게 (role="button" 을 달았으니 짝을 맞춘다)
        el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') toggle(e);
        });
      })(list[i]);
    }
  }

  /** 지정 칸 하나 — 지정할 수 있을 때만 고르는 칸을 내고, 아니면 «왜 못 하는지» 를 적는다. */
  function assignCell(r, opts) {
    if (!_data || !_data.can_assign) {
      return '<span class="bk-sig bk-note-mute">—</span>';
    }
    if (!r.assignable) {
      /* 은행 적요로 이미 분류가 붙은 거래처 — 지정해도 안 바뀐다는 사실을 그대로 적는다.
         ⚠️ 색은 클래스로 — 인라인 color 는 `[id^="card-"] :is(span…)` 전역 규칙에 진다.
         ⚠️ 여기에 «(지정됨)» 배지가 붙어 있는데 지울 칸이 없으면 막다른 길로 보인다.
            그런 경우(지정해 둔 뒤 은행 1차 분류가 바뀐 거래처)에는 어디서 지우는지 알려 준다. */
      var msg = en() ? 'Set from the bank remark — assigning has no effect'
                     : '은행 적요로 이미 분류됨 — 지정해도 안 바뀝니다';
      if (r.assigned) {
        msg += en() ? ' (clear it in “Expense categories” below)'
                    : ' (지우려면 아래 「🏷️ 지출 계정과목 분류」에서)';
      }
      return '<span class="bk-sig bk-note-mute" style="font-size:11px">' + esc(msg) + '</span>';
    }
    var cur = opts.indexOf(r.account) >= 0 ? r.account : '';
    /* ⚠️ `data-prev` 에 «원래 값» 을 적어 둔다 — 저장이 실패했을 때 되돌리기 위해서다.
       change 가 발화한 «뒤» 에 `sel.value` 를 읽으면 그건 이미 바뀐 값이라 되돌리기가
       무효가 된다(2026-08-23 브라우저 검사가 실제로 잡았다: 실패했는데 고른 값이 그대로
       남아 «저장된 줄» 아는 상태). */
    /* ⛔ 크기·테두리를 인라인 style 로 주지 않는다 — `[id^="card-"] select` 전역 규칙이
       `!important` 로 이겨서 11px→13.5px·3px 5px→8px 12px 로 부풀린다(2026-08-23 실측).
       값은 `admin-inline-c.css` 맨 끝 `#acc-bankacct td select.bk-assign` 블록이 정한다. */
    var html = '<select class="bk-assign" data-payee="' + esc(r.payee)
      + '" data-prev="' + esc(cur) + '">';
    html += '<option value=""' + (cur ? '' : ' selected') + '>'
          + esc(cur ? '' : (en() ? '— choose —' : '— 고르기 —')) + '</option>';
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      /* ⚠️ 서버에서 「기타출금」은 «지정 지우기»(DELETE)다. 그런데 지정이 없던 거래처
         (지사 대표자명 자동판정으로 과목이 붙은 곳)에서 고르면 **아무것도 안 지워지는데
         성공으로 보이고 화면도 그대로**다 — 「저장이 안 된다」가 다른 길로 재현된다.
         그래서 라벨을 «지정 지우기» 로 밝히고, 지울 것이 없으면 고를 수 없게 한다. */
      var isClear = (o === '기타출금');
      /* ⚠️ 라벨에 «지정 지우기» 를 붙이는 것은 **지울 것이 있을 때뿐**이다.
         「기타출금」은 EXPENSE_CATEGORIES 에 들어 있으므로, 아직 지정 안 된 거래처
         (= 이 화면이 줄이려는 그 대상)는 `cur === '기타출금'` 이라 그 option 이
         **selected 이면서 disabled** 가 된다. 그때 라벨까지 바꾸면 닫힌 select 에
         「기타출금 (지정 지우기)」가 «현재 계정과목» 인 것처럼 보인다(2026-08-23 대조가 잡음). */
      var label = (isClear && r.assigned)
        ? (en() ? '기타출금 (clear assignment)' : '기타출금 (지정 지우기)')
        : o;
      var dis = (isClear && !r.assigned) ? ' disabled' : '';
      html += '<option value="' + esc(o) + '"' + (o === cur ? ' selected' : '') + dis + '>'
            + esc(label) + '</option>';
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
          /* ⚠️ 포커스된 select 는 휠·방향키만으로도 값이 바뀌어 change 가 발화한다.
             그 한 번이 운영 DB(개발·운영 같은 DB)에 바로 쓰이고 **지난 달 손익계산서까지**
             움직이므로 한 번 확인한다. 취소하면 원래 값으로 되돌린다. */
          var ask = en()
            ? 'Assign “' + cat + '” to “' + payee + '”?\nThis also applies to that payee’s PAST withdrawals.'
            : '「' + payee + '」의 계정과목을 「' + cat + '」(으)로 지정할까요?\n지난 출금까지 함께 바뀝니다.';
          if (!window.confirm(ask)) { sel.value = sel.getAttribute('data-prev') || ''; return; }
          saveAssign(payee, cat, sel);
        });
      })(list[i]);
    }
  }

  async function saveAssign(payee, category, sel) {
    if (_busy) {
      /* ⛔ 조용히 버리지 않는다 — 고른 값이 잠깐 남아 «저장된 줄» 알게 된다 */
      var busyNote = $('acc-bank-assign-note');
      if (busyNote) busyNote.textContent = en() ? 'Still saving — try again in a moment.'
                                                : '아직 저장 중입니다. 잠시 뒤 다시 골라 주세요.';
      if (sel) sel.value = sel.getAttribute('data-prev') || '';
      return;
    }
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
    var all = (_data && _data.rows) || [];
    syncAccountOptions(all);
    var rows = applySort('rows', all.filter(function (r) {
      return (!_flt.rowsAcc || r.account === _flt.rowsAcc)
          && hit(_flt.rowsQ, [r.remark, r.account, r.payee]);
    }));
    setCount('acc-bank-rows-count', rows.length, all.length, sumOf(rows, 'amount'));
    paintSortUi('rows');
    if (!rows.length && all.length) {
      tb.innerHTML = '<tr><td colspan="5" style="padding:26px;text-align:center;color:#9ca3af;font-size:13px">'
        + esc(en() ? 'Nothing matches this filter.' : '고른 조건에 맞는 출금이 없습니다.') + '</td></tr>';
      return;
    }
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

  /* 「계정과목 전체」 드롭다운 — «그 달에 실제로 나온 과목» 만 넣는다.
     ⚠️ 없는 과목을 고를 수 있게 두면 빈 표가 나와 「검색했는데 아무것도 없다」가 된다.
     ⚠️ 고른 값이 새 목록에 없으면(달을 바꾼 경우) 필터를 스스로 푼다 — 안 그러면 표가
        영영 비어 있는데 왜 그런지 화면 어디에도 안 나온다. */
  function syncAccountOptions(rows) {
    var sel = $('acc-bank-rows-acc'); if (!sel) return;
    var seen = {}, list = [];
    for (var i = 0; i < rows.length; i++) {
      var a = rows[i].account || '';
      if (a && !seen[a]) { seen[a] = 1; list.push(a); }
    }
    list.sort(function (x, y) { return x.localeCompare(y, 'ko'); });
    var sig = list.join('\u0001');
    if (sel.__bkSig === sig) return;
    sel.__bkSig = sig;
    if (_flt.rowsAcc && seen[_flt.rowsAcc] !== 1) _flt.rowsAcc = '';
    var head = sel.querySelector('option[value=""]');
    sel.innerHTML = '';
    sel.appendChild(head || (function () {
      var o = document.createElement('option');
      o.value = ''; o.textContent = en() ? 'All accounts' : '계정과목 전체';
      o.setAttribute('data-ko', '계정과목 전체'); o.setAttribute('data-en', 'All accounts');
      return o;
    })());
    for (var j = 0; j < list.length; j++) {
      var op = document.createElement('option');
      op.value = list[j]; op.textContent = list[j];
      sel.appendChild(op);
    }
    sel.value = _flt.rowsAcc || '';
  }

  /* ── 🔁 고정비 · 변동비 (3단계) ────────────────────────────────────────────
     ⚠️ 이건 «패턴 추정» 이지 회계 계정과목이 아니다. 그래서 근거(몇 달 나왔는지·금액 폭)를
        같은 줄에 함께 그린다 — 숫자만 주면 사람이 맞는지 확인할 방법이 없다.
     ⚠️ 자료가 창(4개월)만큼 없는 초기에는 대부분 «변동비» 로 나온다. 틀린 게 아니라
        «아직 모른다» 는 뜻이라, 창 기간을 표 아래에 밝힌다. */
  var KIND_LABEL = {
    fixed:     ['고정비', 'Fixed'],
    recurring: ['반복 (금액 변동)', 'Recurring (varies)'],
    variable:  ['변동비', 'Variable']
  };
  var KIND_CLASS = { fixed: 'bk-role-opex', recurring: 'bk-role-moved', variable: 'bk-role-dup' };

  function renderRecurring() {
    var box = $('acc-bank-recur-sum'), tb = $('acc-bank-recur'), note = $('acc-bank-recur-note');
    var rc = _data && _data.recurring;
    if (!rc) {
      if (box) box.innerHTML = '';
      if (tb) tb.innerHTML = '<tr><td colspan="5" style="padding:22px;text-align:center;color:#9ca3af">—</td></tr>';
      if (note) note.textContent = '';
      return;
    }
    if (box) {
      box.innerHTML = [
        ['fixed', rc.fixed_total], ['recurring', rc.recurring_total], ['variable', rc.variable_total]
      ].map(function (p) {
        var lab = KIND_LABEL[p[0]];
        return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:9px 11px;min-width:0">'
          + '<div style="font-size:11px;color:#6b7280">' + esc(en() ? lab[1] : lab[0]) + '</div>'
          + '<div class="bk-sig ' + KIND_CLASS[p[0]] + '" style="font-size:17px;font-weight:800;margin-top:2px">'
          + krw(p[1]) + '</div></div>';
      }).join('');
    }
    // 고정비 → 반복 → 변동 순, 각 묶음 안에서는 금액 큰 순. 위에서부터 «매달 나가는 돈» 이다
    var order = { fixed: 0, recurring: 1, variable: 2 };
    var allItems = rc.items || [];
    var matched = allItems.filter(function (i) {
      return (!_flt.recurKind || i.kind === _flt.recurKind) && hit(_flt.recurQ, [i.payee]);
    });
    /* 기본 순서는 «고정 → 반복 → 변동, 그 안에서 금액 큰 순» — 위에서부터 매달 나가는 돈이다.
       헤더를 눌러 정렬을 걸면 그 순서가 이긴다. */
    var items = matched.slice().sort(function (a, b) {
      return (order[a.kind] - order[b.kind]) || (b.current - a.current);
    });
    items = applySort('recur', items).slice(0, 20);
    setCount('acc-bank-recur-count', items.length, allItems.length, sumOf(items, 'current'));
    paintSortUi('recur');
    if (tb) {
      tb.innerHTML = items.length ? items.map(function (i) {
        var lab = KIND_LABEL[i.kind] || KIND_LABEL.variable;
        var why = (en() ? 'seen ' : '') + (i.months_seen || 0)
          + (en() ? ' of ' + (rc.window_months || 4) + ' months' : '/' + (rc.window_months || 4) + '개월')
          + (i.spread != null ? (en() ? ' · spread ×' : ' · 금액 폭 ×') + i.spread : '');
        return '<tr>'
          + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9">' + esc(i.payee) + '</td>'
          + '<td class="bk-sig ' + (KIND_CLASS[i.kind] || '') + '" style="padding:7px 9px;border-bottom:1px solid #f1f5f9">'
          + esc(en() ? lab[1] : lab[0]) + '</td>'
          + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">' + krw(i.current) + '</td>'
          + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;text-align:right;color:#6b7280">' + krw(i.avg) + '</td>'
          + '<td style="padding:7px 9px;border-bottom:1px solid #f1f5f9;color:#6b7280;font-size:11px">' + esc(why) + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="5" style="padding:22px;text-align:center;color:#9ca3af">'
        + (allItems.length ? esc(en() ? 'Nothing matches this filter.' : '고른 조건에 맞는 거래처가 없습니다.') : '—')
        + '</td></tr>';
    }
    if (note) {
      var w = rc.window || [];
      note.textContent = en()
        ? '※ Estimated from a pattern, not an accounting rule: seen in ' + (rc.min_months || 3) + '+ of '
          + (rc.window_months || 4) + ' months (' + (w[0] || '') + '–' + (w[w.length - 1] || '')
          + ') with amounts within ×' + (rc.spread_max || 1.25) + '. With less history most payees read as “variable”.'
          + (rc.period_in_progress ? ' ⚠️ This month is still in progress — totals are incomplete.' : '')
        : '※ 회계 기준이 아니라 «패턴 추정» 입니다 — ' + (w[0] || '') + '~' + (w[w.length - 1] || '')
          + ' 중 ' + (rc.min_months || 3) + '개월 이상 나왔고 금액 폭이 ×' + (rc.spread_max || 1.25)
          + ' 이하면 고정비로 봅니다. 자료가 이 기간만큼 없으면 대부분 «변동비» 로 나옵니다.'
          /* ⚠️ 진행 중인 달은 «합계» 가 아직 덜 찼다. 한 달에 여러 번 나가는 거래처는
             월 중반에 금액 폭이 부풀어 고정비가 «반복» 으로 내려앉는다 — 그 사실을 밝힌다. */
          + (rc.period_in_progress
              ? ' ⚠️ 이번 달은 아직 진행 중이라 합계가 덜 찼습니다 — 매달 여러 번 나가는 곳은 «반복» 으로 보일 수 있습니다.'
              : '');
    }
  }

  // ── 📈 전월 대비 증감 Top 5 ───────────────────────────────────────────────
  function renderMovers() {
    var up = $('acc-bank-movers-up'), down = $('acc-bank-movers-down'), t = $('acc-bank-movers-title');
    var list = (_data && _data.movers) || [];
    if (t && _data) {
      var ko = '📈 전월 대비 증감 Top 5 (' + (_data.prev_month || '') + ' → ' + (_data.period || '') + ')';
      var eng = '📈 Biggest changes ' + (_data.prev_month || '') + ' → ' + (_data.period || '');
      t.setAttribute('data-ko', ko); t.setAttribute('data-en', eng);
      t.textContent = en() ? eng : ko;
    }
    var draw = function (tb, rows, sign) {
      if (!tb) return;
      if (!rows.length) {
        tb.innerHTML = '<tr><td style="padding:16px;text-align:center;color:#9ca3af">'
          + (en() ? 'none' : '없음') + '</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(function (m) {
        var tag = m.status === 'new' ? (en() ? 'new' : '새로 생김')
                : m.status === 'gone' ? (en() ? 'gone' : '사라짐')
                : (m.delta_pct == null ? '' : (m.delta_pct > 0 ? '▲' : '▼') + Math.abs(m.delta_pct) + '%');
        return '<tr>'
          + '<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">' + esc(m.payee)
          + (m.account ? '<span style="color:#9ca3af;font-size:11px"> · ' + esc(m.account) + '</span>' : '')
          + '</td>'
          + '<td class="bk-sig ' + (sign > 0 ? 'bk-sig-up' : 'bk-sig-down')
          + '" style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;white-space:nowrap">'
          + (sign > 0 ? '+' : '−') + krw(Math.abs(m.delta)) + '</td>'
          + '<td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#6b7280;font-size:11px;white-space:nowrap">'
          + esc(tag) + '</td>'
          + '</tr>';
      }).join('');
    };
    var ups = list.filter(function (m) { return m.delta > 0; });
    // 줄어든 쪽은 «가장 많이 줄어든» 것부터 — 서버가 증가순으로 줬으니 뒤집는다
    var downs = list.filter(function (m) { return m.delta < 0; }).slice().reverse();
    var N = _moversAll ? Math.max(ups.length, downs.length) : 5;
    draw(up, ups.slice(0, N), 1);
    draw(down, downs.slice(0, N), -1);

    /* 「전체 보기」 — 이 표에 정렬 헤더를 달지 않는 대신 5개 너머를 볼 수 있게 한다.
       ⚠️ 더 볼 것이 없으면 «누를 수 있는 것처럼» 두지 않는다(눌러도 아무 일이 없다). */
    var more = $('acc-bank-movers-more');
    if (more) {
      var extra = Math.max(ups.length, downs.length) - 5;
      if (extra <= 0) { more.textContent = ''; more.removeAttribute('data-bk-more'); }
      else {
        more.setAttribute('data-bk-more', '1');
        more.textContent = _moversAll
          ? (en() ? '▴ show top 5 only' : '▴ Top 5 만 보기')
          : (en() ? '▾ show all (' + extra + ' more)' : '▾ 전체 보기 (' + extra + '개 더)');
      }
    }
  }

  /* 📥 엑셀 내보내기 — 서버가 «화면과 같은 payload» 로 만들어 준다(따로 계산하지 않는다).
     ⚠️ `window.open` 을 쓰지 않는다 — 카톡·문자앱 인앱 브라우저는 새 창을 못 열고
        예외도 안 던지며 null 만 돌려준다(CLAUDE.md 2장). 파일은 Content-Disposition 이
        붙어 오므로 `location.href` 로도 화면이 넘어가지 않고 내려받기만 된다. */
  window.bankExpExport = function (fmt) {
    var mEl = $('acc-bank-month');
    var m = (mEl && mEl.value) ? mEl.value : '';
    location.href = '/api/admin/reports/bank-expenses?format=' + encodeURIComponent(fmt || 'xlsx')
                  + (m ? '&month=' + encodeURIComponent(m) : '');
  };

  function renderAll() {
    renderStatus(); renderKpis(); renderCats(); renderRecurring(); renderMovers();
    renderPayees(); renderRows(); renderCharts();
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
    ['acc-bank-cats', 'acc-bank-payees', 'acc-bank-recur'].forEach(function (id) {
      var tb = $(id); if (tb) tb.innerHTML = '<tr><td colspan="5" style="padding:22px;text-align:center;color:#9ca3af">—</td></tr>';
    });
    ['acc-bank-movers-up', 'acc-bank-movers-down'].forEach(function (id) {
      var tb = $(id); if (tb) tb.innerHTML = '<tr><td style="padding:16px;text-align:center;color:#9ca3af">—</td></tr>';
    });
    ['recur', 'cats', 'payees', 'rows'].forEach(function (t) {
      var n = $('acc-bank-' + t + '-sortnote'); if (n) n.innerHTML = '';
      var c = $('acc-bank-' + t + '-count'); if (c) c.textContent = '';
    });
    var mm = $('acc-bank-movers-more'); if (mm) { mm.textContent = ''; mm.removeAttribute('data-bk-more'); }
    var rs = $('acc-bank-recur-sum'); if (rs) rs.innerHTML = '';
    var rn = $('acc-bank-recur-note'); if (rn) rn.textContent = '';
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
     ✅ 새 거래는 밤에 자동으로 들어온다. 계정과목 지정은 (2026-08-23 2단계부터) 이 화면의
        거래처 표에서 바로 할 수 있고, 저장은 「🏷️ 지출 계정과목 분류」와 **같은 API** 를 쓴다.
        어느 쪽에서 하든 **동기화를 기다리지 않고 바로 반영된다** — 서버가 저장된 category 를
        덮어쓰지 않고 «읽을 때» 판정하기 때문이다. */

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
    /* 🔃 정렬 헤더 · ✕ 정렬 해제 · ▾ 전체 보기 — 위임 한 곳에서 받는다.
       ⚠️ 표는 다시 그릴 때마다 통째로 갈아치워지므로 헤더에 리스너를 «직접» 달면
          한 번 그리고 나서 죽는다. 그래서 `#acc-bankacct` 에 한 번만 단다.
       ⚠️ 필요한 표 하나만 다시 그린다 — 전부 다시 그리면 펼쳐 둔 거래처가 접히고
          차트도 매번 destroy/재생성이라 눈에 띄게 끊긴다. */
    function rerenderTable(t) {
      if (t === 'recur') renderRecurring();
      else if (t === 'cats') renderCats();
      else if (t === 'payees') renderPayees();
      else if (t === 'rows') renderRows();
    }
    function onActivate(e) {
      if (!_data) return;
      var t = e.target;
      if (!t || !t.closest) return;
      var th = t.closest('.pr-th[data-bk-table]');
      if (th) {
        toggleSort(th.getAttribute('data-bk-table'), th.getAttribute('data-sort-key'), !!e.shiftKey);
        rerenderTable(th.getAttribute('data-bk-table'));
        e.preventDefault(); return;
      }
      var cl = t.closest('[data-bk-clear]');
      if (cl) {
        var k = cl.getAttribute('data-bk-clear');
        _sort[k] = []; rerenderTable(k);
        e.preventDefault(); return;
      }
      var mo = t.closest('[data-bk-more]');
      if (mo) { _moversAll = !_moversAll; renderMovers(); e.preventDefault(); }
    }
    d.addEventListener('click', onActivate);
    d.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target && e.target.closest && e.target.closest('[data-bk-clear],[data-bk-more]')) onActivate(e);
    });

    /* 🔍 필터 칸 — 입력할 때마다 그 표만 다시 그린다(서버를 부르지 않는다). */
    [['acc-bank-recur-q', 'recurQ', 'recur'], ['acc-bank-recur-kind', 'recurKind', 'recur'],
     ['acc-bank-cats-role', 'catsRole', 'cats'],
     ['acc-bank-payees-q', 'payeesQ', 'payees'],
     ['acc-bank-rows-q', 'rowsQ', 'rows'], ['acc-bank-rows-acc', 'rowsAcc', 'rows']
    ].forEach(function (m) {
      var el = $(m[0]); if (!el) return;
      var h = function () { _flt[m[1]] = el.value || ''; if (_data) rerenderTable(m[2]); };
      el.addEventListener('input', h);
      el.addEventListener('change', h);
    });

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
