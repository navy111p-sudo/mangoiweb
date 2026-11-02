/* work-ledger-export.js — 결재함 › 회계장부 «미리보기 · PDF · 엑셀 · 인쇄» (2026-11-02 사장님 지시)
 *
 *   「엑셀 내려받기 전에 이 장부를 PDF 로 예쁘게 볼 수 있게, 엑셀도 정식 회계장부처럼.
 *    회계사·세무사에게 바로 제출해도 문제없게. 다운로드에 PDF · 엑셀 · 인쇄.」
 *
 *   [어디서 불리나]  work.html 의 ledExport(kind) 가 «처음 누를 때만» loadScript 로 이 파일을 부른다
 *                    (pdf.js 와 같은 방식 — 결재함 첫 화면 무게를 늘리지 않는다).
 *   [무엇을 그리나]  화면이 이미 받은 장부 응답(/api/approval/requests?view=ledger) 하나만 쓴다.
 *                    ⛔ 서버 API 를 새로 만들지 않는다 — 화면과 «같은 줄·같은 합계» 여야 한다.
 *   [⛔ 통화를 섞지 않는다]  합계·소계·누계는 전부 «통화마다 따로». 원화 환산은 «오늘 환율 기준 참고값» 으로만
 *                    적고, 그 사실을 문서에 함께 적는다(회계 처리는 거래일 환율 — 오늘 환율을 장부값처럼 쓰면 틀린다).
 *   [⛔ 빠진 것을 숨기지 않는다]  대기·금액 없음·잘림·결재선 못 읽음·«지난 기간엔 있었는데» 를 문서와 엑셀에 적는다
 *                    (안 적으면 파일이 화면보다 «완전해 보인다» — 서버 CSV 와 같은 원칙).
 *   [엑셀]  외부 라이브러리 없이 진짜 .xlsx 를 만든다(무압축 zip). 합계·누계·분류별 집계는 «수식» 이라
 *           세무사가 줄을 고치면 다시 계산된다. 분류 집계는 라벨 글자가 아니라 «숫자 그룹 열» 로 묶는다
 *           (라벨로 세면 같은 이름 두 그룹이 COUNTIF 로 중복 집계된다 — CLAUDE.md 같은 뿌리).
 *   [PDF·인쇄]  같은 문서를 숨은 iframe 에 넣고 인쇄를 부른다. PDF 는 인쇄 창에서 «PDF로 저장» —
 *               글자가 텍스트로 남아 검색·복사가 된다. 문서 제목이 기본 파일명이 된다.
 */
(function () {
  'use strict';

  // ───────────────────────── 공용 ─────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** <style> 안 CSS 문자열 — 줄바꿈 정리, 따옴표·역슬래시·꺾쇠 이스케이프(</style> 탈출 방지) */
  function cssStr(s) {
    return String(s).replace(/\s+/g, ' ').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      .replace(/</g, '\\3c ').replace(/>/g, '\\3e ');
  }
  function cur3(c) { var u = String(c || '').toUpperCase(); return /^[A-Z]{3}$/.test(u) ? u : 'PHP'; }
  function digitsOf(cur) { return cur3(cur) === 'KRW' ? 0 : 2; }
  function r2(n) { return Math.round(Number(n) * 100) / 100; }
  function num(n, cur) {
    var d = digitsOf(cur), v = Number(n);
    if (!isFinite(v)) return '–';
    var s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
    return (v < 0 ? '-' : '') + s;
  }
  function sym(cur) { var c = cur3(cur); return c === 'KRW' ? '₩' : c === 'PHP' ? '₱' : c === 'USD' ? '$' : ''; }
  function money(n, cur) {
    var v = Number(n); if (!isFinite(v)) return '–';
    var s = sym(cur), body = num(Math.abs(v), cur);
    return (v < 0 ? '-' : '') + (s ? s + body : body + ' ' + cur3(cur));
  }
  function pct(p) { return isFinite(p) ? (p * 100).toFixed(1) + '%' : '–'; }
  function kstNow() {
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }
  function safeName(s) { return String(s).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'ledger'; }

  // ───────────────────────── 모델 ─────────────────────────
  /**
   * 장부 응답 → 문서용 모델. 화면이 받은 값만 쓰고, 새로 지어내지 않는다.
   * ctx = { en, scopeAll, perKey, who, fx }
   */
  function buildModel(d, ctx) {
    var en = !!ctx.en;
    var T = function (e, k) { return en ? e : k; };
    var rows = (Array.isArray(d.ledger) ? d.ledger : []).slice().filter(function (r) { return r && isFinite(Number(r.amount)); });
    // 회계 장부 순서: 날짜 오름차순 → 같은 날은 결재번호 오름차순
    rows.sort(function (a, b) { return a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : Number(a.id) - Number(b.id); });

    // 통화 순서는 서버 totals 순서(없으면 행에서)
    var curs = [];
    (d.totals || []).forEach(function (t) { var c = cur3(t.cur); if (curs.indexOf(c) < 0) curs.push(c); });
    rows.forEach(function (r) { var c = cur3(r.currency); if (curs.indexOf(c) < 0) curs.push(c); });

    // 분류 그룹: «통화 + 이 문서에 찍히는 분류 글자» — 엑셀 집계와 같은 열쇠
    var noCat = T('No category', '분류 없음');
    var groups = [], gIndex = {};
    var cum = {}, sumBy = {}, cntBy = {};
    var out = rows.map(function (r, i) {
      var c = cur3(r.currency);
      var label = String((en ? (r.category_en || r.category_ko) : (r.category_ko || r.category_en)) || '').trim() || noCat;
      var gk = c + '\u0001' + label;
      if (!gIndex[gk]) { gIndex[gk] = groups.length + 1; groups.push({ id: groups.length + 1, cur: c, label: label, sum: 0, n: 0 }); }
      var g = groups[gIndex[gk] - 1];
      var amt = Number(r.amount);
      g.sum = r2(g.sum + amt); g.n++;
      cum[c] = r2((cum[c] || 0) + amt);
      sumBy[c] = r2((sumBy[c] || 0) + amt); cntBy[c] = (cntBy[c] || 0) + 1;
      return { no: i + 1, ymd: String(r.ymd || ''), id: Number(r.id), title: String(r.title || ('#' + r.id)),
               who: String(r.who || ''), cat: label, cur: c, amt: amt, cum: cum[c], gid: g.id };
    });
    // 분류 그룹 순서: 통화(총계 순) → 큰 돈 먼저 → «분류 없음» 맨 뒤
    groups.sort(function (a, b) {
      if (a.cur !== b.cur) return curs.indexOf(a.cur) - curs.indexOf(b.cur);
      var an = a.label === noCat, bn = b.label === noCat;
      if (an !== bn) return an ? 1 : -1;
      return b.sum - a.sum || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
    });

    // 통화별 합계 — 행에서 다시 센 값과 서버 totals 를 대조(같아야 한다)
    var totals = curs.map(function (c) {
      var srv = (d.totals || []).filter(function (t) { return cur3(t.cur) === c; })[0];
      return { cur: c, sum: sumBy[c] || 0, n: cntBy[c] || 0, srvSum: srv ? r2(srv.sum) : null, srvN: srv ? Number(srv.n) : null };
    });
    var checks = { ok: true, lines: [] };
    totals.forEach(function (t) {
      var gsum = 0; groups.forEach(function (g) { if (g.cur === t.cur) gsum = r2(gsum + g.sum); });
      var okSrv = t.srvSum == null || (Math.abs(t.srvSum - t.sum) < 0.005 && t.srvN === t.n);
      var okCat = Math.abs(gsum - t.sum) < 0.005;
      if (!okSrv || !okCat) checks.ok = false;
    });
    // 구성비 — 같은 통화 안에서만 잰다
    totals.forEach(function (t) {
      groups.forEach(function (g) { if (g.cur === t.cur) g.share = t.sum ? g.sum / t.sum : 0; });
    });

    // 참고 환산(오늘 환율) — 보기용. ⛔ 장부 합계 대신 쓰지 않는다.
    var fx = ctx.fx || d.fx || null, rate = fx && Number(fx.krw_per_php);
    var fxOk = rate >= 10 && rate <= 60;
    var ref = null;
    if (fxOk && curs.length) {
      var krw = 0, okAll = true;
      totals.forEach(function (t) {
        if (t.cur === 'KRW') krw += t.sum;
        else if (t.cur === 'PHP') krw += t.sum * rate;
        else okAll = false;
      });
      if (okAll) ref = { krw: Math.round(krw), rate: rate, date: fx.date || '', source: fx.source || '' };
    }

    // 빠진 것 — 화면 notes 와 같은 값
    var missing = [];
    if (d.pending) missing.push({ k: 'pending', n: Number(d.pending), text: T('Waiting for approval — not counted (money not out yet)', '결재 대기 — 합계에서 제외(아직 안 나간 돈)') });
    if (d.no_amount) missing.push({ k: 'no_amount', n: Number(d.no_amount), text: T('Approved but no amount entered — not counted', '승인됐지만 금액이 없음 — 합계에서 제외') });
    if (d.truncated) missing.push({ k: 'truncated', n: Number(d.max) || null, text: T('Too many rows — only the first ' + d.max + ' were read; totals are short', '건수가 많아 앞 ' + d.max + '건만 읽음 — 합계가 모자람') });
    if (d.steps_missing) missing.push({ k: 'steps', n: null, text: T('Some approval lines could not be read — totals may be short', '결재선을 다 읽지 못함 — 합계가 모자랄 수 있음') });
    var mN = d.checks && Number(d.checks.missing_n);
    if (mN > 0) missing.push({ k: 'chk', n: mN, text: T('Spent in the previous period but not in this one — please check', '지난 기간엔 있었는데 이번 기간엔 없는 지출 — 확인 필요') });

    var perName = ctx.perKey === 'year' ? T('Last 12 months', '최근 1년') : ctx.perKey === 'last_month' ? T('Last month', '지난달') : T('This month', '이번 달');
    return {
      en: en, T: T, rows: out, groups: groups, totals: totals, curs: curs, checks: checks, ref: ref,
      missing: missing, from: String(d.from || ''), to: String(d.to || ''), perName: perName,
      scope: ctx.scopeAll ? T('All visible approvals (approver view)', '결재 권한 범위 전체') : T('My requests only', '내가 올린 결재만'),
      who: String(ctx.who || ''), issued: kstNow(),
      title: T('Expense Ledger', '지출 회계장부'), sub: T('지출 회계장부', 'Expense Ledger'),
      company: T('Mangoi', '망고아이'),
    };
  }

  function fileBase(M) {
    return safeName(M.T('Expense_Ledger_', '지출회계장부_') + (M.from || 'all') + '_' + (M.to || M.issued.slice(0, 10)));
  }

  // ───────────────────────── 문서(HTML) ─────────────────────────
  /* 🀄 글꼴 — 저장소 규칙(hanzi_font_harness): font-family 맨 앞은 MangoiHanSC, 정의(@font-face)는 이 문서 안에.
     work.html 과 같은 정의(한자 범위만 — 한글은 뒤의 맑은 고딕으로). */
  var CSS =
    "@font-face{font-family:'MangoiHanSC';src:url('/fonts/mangoi-han-sc.woff2') format('woff2');font-weight:100 900;font-display:swap;unicode-range:U+2E80-2EFF,U+3000-303F,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF,U+0100-017F,U+01CD-01DC;}" +
    ':root{--ink:#111827;--muted:#6b7280;--line:#d6dde3;--brand:#1f5c4a;--soft:#e8f2ee;--tot:#f1f5f3;--warn:#b45309;--warnbg:#fff7ed;color-scheme:light}' +
    '*{box-sizing:border-box}html,body{margin:0;background:#e5e7eb}' +
    'body{color:var(--ink);font-family:MangoiHanSC,"Malgun Gothic","맑은 고딕","Apple SD Gothic Neo","Noto Sans KR",Arial,sans-serif;font-size:10pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '.sheet{width:273mm;max-width:100%;margin:16px auto;padding:12mm;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.12)}' +
    'section{margin-top:6mm}section.first{margin-top:0}' +
    'h2{font-size:11pt;margin:0 0 2mm;padding-left:6px;border-left:4px solid var(--brand);color:var(--brand)}' +
    '.head{display:grid;grid-template-columns:1fr auto 1fr;gap:6mm;align-items:end;padding-bottom:3mm;border-bottom:2px solid var(--brand)}' +
    '.co{font-size:13pt;font-weight:700}.co small{display:block;font-size:8.5pt;color:var(--muted);font-weight:400;margin-top:1mm}' +
    '.ttl{text-align:center}.ttl h1{margin:0;font-size:20pt;letter-spacing:.25em;color:var(--brand)}.ttl p{margin:1mm 0 0;font-size:9pt;color:var(--muted)}' +
    '.meta{justify-self:end;border-collapse:collapse;font-size:8.5pt}.meta th,.meta td{border:1px solid var(--line);padding:2px 6px;white-space:nowrap;text-align:left}' +
    '.meta th{background:var(--soft);color:var(--brand)}' +
    '.kpis{display:flex;flex-wrap:wrap;gap:3mm}.kpi{flex:1 1 45mm;border:1px solid var(--line);border-radius:4px;padding:3mm 4mm}' +
    '.kpi.hi{background:var(--brand);border-color:var(--brand);color:#fff}.kpi .l{font-size:8.5pt;color:var(--muted)}.kpi.hi .l{color:#d1ebe2}' +
    '.kpi .v{font-size:14pt;font-weight:700;margin-top:1mm;font-variant-numeric:tabular-nums}' +
    '.chk{margin-top:2mm;font-size:8.5pt;color:var(--brand)}.chk.bad{color:#b91c1c;font-weight:700}' +
    '.ref{margin-top:1.5mm;font-size:8.5pt;color:var(--muted)}' +
    'table.g{width:100%;border-collapse:collapse;font-size:9pt}table.g thead{display:table-header-group}table.g tfoot{display:table-footer-group}' +
    'table.g tr{break-inside:avoid;page-break-inside:avoid}' +
    'table.g th{background:var(--brand);color:#fff;font-weight:600;padding:4px 5px;border:1px solid var(--brand);white-space:nowrap}' +
    'table.g td{padding:3px 5px;border-bottom:1px solid var(--line)}table.g td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}' +
    'table.g td.c{text-align:center;white-space:nowrap}table.g tr:nth-child(even) td{background:#fafbfc}' +
    'table.g tr.t td{font-weight:700;background:var(--tot);border-top:2px solid var(--ink);border-bottom:2px solid var(--ink)}' +
    'table.g tr.w td{background:var(--warnbg)}.none{padding:4mm;text-align:center;color:var(--muted);border:1px dashed var(--line)}' +
    'ol.notes{margin:0;padding-left:5mm;font-size:8.5pt;color:#374151}ol.notes li{margin:1mm 0}' +
    '.signs{display:flex;gap:6mm;margin-top:4mm}.sign{flex:1;text-align:center;font-size:9pt}.sign .b{height:16mm;border:1px solid var(--line);border-radius:3px;margin-bottom:1mm}' +
    '.sign .r{font-weight:700}.sign .w{color:var(--muted);font-size:8pt}' +
    '@page{size:A4 landscape;margin:12mm 12mm 14mm 12mm;@bottom-right{content:counter(page) " / " counter(pages);font-size:8pt;color:#6b7280}}' +
    '@media print{html,body{background:#fff}.sheet{width:auto;margin:0;padding:0;box-shadow:none}section.np{break-before:page;page-break-before:always}section.tail{break-before:page;page-break-before:always}}' +
    'section.tail{break-inside:avoid}';

  function docHtml(M) {
    var T = M.T, h = '';
    var meta = function (k, v) { return '<tr><th>' + esc(k) + '</th><td>' + esc(v) + '</td></tr>'; };
    h += '<header class="head"><div class="co">' + esc(M.company) + '<small>' + esc(T('Approvals › Ledger', '결재함 › 회계장부')) + '</small></div>' +
         '<div class="ttl"><h1>' + esc(M.title) + '</h1><p>' + esc(M.sub) + '</p></div>' +
         '<table class="meta">' + meta(T('Period', '기간'), (M.from || '…') + ' ~ ' + (M.to || '…') + ' (' + M.perName + ')') +
         meta(T('Scope', '범위'), M.scope) + meta(T('Issued (KST)', '발행 일시(KST)'), M.issued) +
         meta(T('Issued by', '발행자'), M.who || '-') + meta(T('Currency basis', '통화 기준'), T('Original currency, totals per currency', '원래 통화 · 통화별 합계')) +
         '</table></header>';

    // 1. 요약
    h += '<section class="first"><h2>' + esc(T('1. Summary', '1. 요약')) + '</h2><div class="kpis">';
    if (!M.totals.length) h += '<div class="kpi"><div class="l">' + esc(T('Approved spending', '승인된 지출')) + '</div><div class="v">0</div></div>';
    M.totals.forEach(function (t, i) {
      h += '<div class="kpi' + (i === 0 ? ' hi' : '') + '"><div class="l">' + esc(T('Approved spending', '승인된 지출 합계') + ' (' + t.cur + ')') + '</div>' +
           '<div class="v">' + esc(money(t.sum, t.cur)) + '</div><div class="l">' + esc(t.n + T(' items', '건')) + '</div></div>';
    });
    var exN = 0; M.missing.forEach(function (x) { if (x.k === 'pending' || x.k === 'no_amount') exN += x.n || 0; });
    h += '<div class="kpi"><div class="l">' + esc(T('Excluded (waiting · no amount)', '제외 (대기 · 금액 없음)')) + '</div><div class="v">' + exN + '</div><div class="l">' + esc(T('see section 4', '4번 항목 참고')) + '</div></div>';
    h += '</div><div class="chk' + (M.checks.ok ? '' : ' bad') + '">' + esc(M.checks.ok
      ? T('Verified: ledger lines = category totals = server totals (per currency)', '검증 완료: 전표 장부 합계 = 분류별 집계 합계 = 서버 합계 (통화별)')
      : T('Check failed: totals do not agree — do not submit; reload and try again', '검증 실패: 합계가 서로 맞지 않습니다 — 제출하지 말고 다시 불러오세요')) + '</div>';
    if (M.ref) h += '<div class="ref">' + esc(T('Reference only: all currencies at today\'s rate ≈ ', '참고값: 오늘 환율로 모두 원화 환산 ≈ ') + money(M.ref.krw, 'KRW') +
                    ' (₱1 = ₩' + M.ref.rate.toFixed(2) + (M.ref.date ? ', ' + M.ref.date : '') + T('). Not a booked amount — use the transaction-date rate for accounting.', '). 장부 금액이 아닙니다 — 회계 처리는 거래일 환율로 하십시오.')) + '</div>';
    h += '</section>';

    // 2. 분류별 집계
    h += '<section><h2>' + esc(T('2. Totals by category', '2. 분류(계정)별 집계')) + '</h2>';
    if (!M.groups.length) h += '<div class="none">' + esc(T('No approved spending in this period.', '이 기간에 승인된 지출이 없습니다.')) + '</div>';
    else {
      h += '<table class="g"><thead><tr><th>' + esc(T('Currency', '통화')) + '</th><th>' + esc(T('Category', '분류')) + '</th><th>' + esc(T('Items', '건수')) +
           '</th><th>' + esc(T('Amount', '금액')) + '</th><th>' + esc(T('Share (in currency)', '구성비(통화 내)')) + '</th></tr></thead><tbody>';
      M.curs.forEach(function (c) {
        M.groups.forEach(function (g) {
          if (g.cur !== c) return;
          h += '<tr><td class="c">' + esc(c) + '</td><td>' + esc(g.label) + '</td><td class="c">' + g.n + '</td><td class="n">' + esc(money(g.sum, c)) + '</td><td class="n">' + esc(pct(g.share)) + '</td></tr>';
        });
        var t = M.totals.filter(function (x) { return x.cur === c; })[0];
        if (t) h += '<tr class="t"><td class="c">' + esc(c) + '</td><td>' + esc(T('Subtotal', '소계')) + '</td><td class="c">' + t.n + '</td><td class="n">' + esc(money(t.sum, c)) + '</td><td class="n">100.0%</td></tr>';
      });
      h += '</tbody></table>';
    }
    h += '</section>';

    // 3. 전표 장부
    h += '<section class="np"><h2>' + esc(T('3. Ledger lines (by date)', '3. 전표 장부 (일자순)')) + '</h2>';
    if (!M.rows.length) h += '<div class="none">' + esc(T('No approved spending in this period.', '이 기간에 승인된 지출이 없습니다.')) + '</div>';
    else {
      h += '<table class="g"><thead><tr><th>No.</th><th>' + esc(T('Date', '일자')) + '</th><th>' + esc(T('Approval #', '결재번호')) + '</th><th>' +
           esc(T('Category', '분류')) + '</th><th>' + esc(T('Description', '적요(내용)')) + '</th><th>' + esc(T('Requested by', '올린 사람')) + '</th><th>' +
           esc(T('Currency', '통화')) + '</th><th>' + esc(T('Amount', '금액')) + '</th><th>' + esc(T('Running total (per currency)', '누계(통화별)')) + '</th></tr></thead><tbody>';
      M.rows.forEach(function (r) {
        h += '<tr><td class="c">' + r.no + '</td><td class="c">' + esc(r.ymd) + '</td><td class="c">#' + r.id + '</td><td>' + esc(r.cat) + '</td><td>' + esc(r.title) +
             '</td><td>' + esc(r.who) + '</td><td class="c">' + esc(r.cur) + '</td><td class="n">' + esc(num(r.amt, r.cur)) + '</td><td class="n">' + esc(num(r.cum, r.cur)) + '</td></tr>';
      });
      h += '</tbody><tfoot>';
      M.totals.forEach(function (t) {
        h += '<tr class="t"><td colspan="6" class="c">' + esc(T('Total', '합계') + ' (' + t.cur + ', ' + t.n + T(' items', '건') + ')') + '</td><td class="c">' + esc(t.cur) +
             '</td><td class="n">' + esc(num(t.sum, t.cur)) + '</td><td></td></tr>';
      });
      h += '</tfoot></table>';
    }
    h += '</section>';

    // 4. 검토·제외
    h += '<section><h2>' + esc(T('4. Excluded & to check', '4. 제외 및 확인 필요')) + '</h2>';
    if (!M.missing.length) h += '<div class="none">' + esc(T('Nothing excluded or to check.', '제외되거나 확인이 필요한 항목이 없습니다.')) + '</div>';
    else {
      h += '<table class="g"><thead><tr><th>' + esc(T('What', '구분')) + '</th><th>' + esc(T('Count', '건수')) + '</th></tr></thead><tbody>';
      M.missing.forEach(function (x) { h += '<tr class="w"><td>' + esc(x.text) + '</td><td class="c">' + (x.n == null ? '–' : x.n) + '</td></tr>'; });
      h += '</tbody></table>';
    }
    h += '</section>';

    // 5. 작성 기준 + 서명
    var notes = [
      T('Only approved spending with an amount is counted. Waiting, rejected, withdrawn and cancellation approvals are not.', '승인되고 금액이 있는 지출만 합계에 넣었습니다. 대기·반려·회수·취소 결재는 넣지 않았습니다.'),
      T('Amounts are in the currency they were requested in. Totals are per currency and never mixed.', '금액은 결재를 올린 원래 통화 그대로이며, 합계는 통화별로 내고 서로 섞지 않았습니다.'),
      T('Running totals restart for each currency.', '누계는 통화마다 따로 셉니다.'),
      T('The won reference uses today\'s rate and is not a booked amount. For accounting, use the rate on each transaction date.', '원화 참고값은 오늘 환율 기준이며 장부 금액이 아닙니다. 회계 처리는 거래일 환율로 하십시오.'),
      T('Receipts and details: open the approval number in the Approvals screen.', '증빙·상세 내용은 결재함에서 결재번호로 확인할 수 있습니다.'),
    ];
    h += '<section class="tail"><h2>' + esc(T('5. Basis & notes', '5. 작성 기준 및 비고')) + '</h2><ol class="notes">' +
         notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ol><div class="signs">';
    [[T('Prepared by', '작성'), M.who], [T('Reviewed by (CPA / tax accountant)', '검토 (세무사·회계사)'), ''], [T('Approved by', '승인'), '']].forEach(function (s) {
      h += '<div class="sign"><div class="b"></div><div class="r">' + esc(s[0]) + '</div><div class="w">' + esc(s[1] || T('(signature)', '(서명/인)')) + '</div></div>';
    });
    h += '</div></section>';

    var footer = M.company + ' · ' + M.title + ' · ' + (M.from || '') + '~' + (M.to || '') + ' · ' + M.T('Issued ', '발행 ') + M.issued;
    return '<!doctype html><html lang="' + (M.en ? 'en' : 'ko') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(fileBase(M)) + '</title><style>' + CSS +
      '@page{@bottom-left{content:"' + cssStr(footer) + '";font-size:8pt;color:#6b7280}}</style></head><body><main class="sheet">' + h + '</main></body></html>';
  }

  // ───────────────────────── 엑셀(.xlsx) ─────────────────────────
  var CRC = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { return new TextEncoder().encode(s); }
  /** 무압축(STORE) zip — xlsx 는 zip 이면 되고 압축은 필수가 아니다 */
  function zip(files) {
    var parts = [], central = [], off = 0;
    var u16 = function (v) { return [v & 255, (v >>> 8) & 255]; };
    var u32 = function (v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; };
    files.forEach(function (f) {
      var name = utf8(f.name), data = utf8(f.data), crc = crc32(data);
      var head = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      parts.push(new Uint8Array(head), name, data);
      central.push([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off)), name);
      off += head.length + name.length + data.length;
    });
    var cdStart = off, cdLen = 0;
    central.forEach(function (x) { var a = Array.isArray(x) ? new Uint8Array(x) : x; parts.push(a); cdLen += a.length; });
    parts.push(new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdLen), u32(cdStart), u16(0))));
    return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function xe(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; })
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function colL(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function ref(c, r) { return colL(c) + r; }
  function serial(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); if (!m) return null;
    return (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000;
  }
  function qs(name) { return "'" + String(name).replace(/'/g, "''") + "'"; }

  // 스타일 번호(styles.xml cellXfs 순서와 같아야 한다)
  var S = { txt: 1, head: 2, int: 3, dec: 4, date: 5, totL: 6, totI: 7, totD: 8, title: 9, sub: 10, lab: 11, pct: 12, warn: 13, ctr: 14, totP: 15 };
  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0;-#,##0"/><numFmt numFmtId="165" formatCode="#,##0.00;-#,##0.00"/><numFmt numFmtId="166" formatCode="yyyy-mm-dd"/><numFmt numFmtId="167" formatCode="0.0%"/></numFmts>' +
    '<fonts count="6"><font><sz val="10"/><name val="Malgun Gothic"/></font><font><b/><sz val="10"/><name val="Malgun Gothic"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Malgun Gothic"/></font><font><b/><sz val="16"/><color rgb="FF1F5C4A"/><name val="Malgun Gothic"/></font>' +
    '<font><sz val="9"/><color rgb="FF6B7280"/><name val="Malgun Gothic"/></font><font><sz val="10"/><color rgb="FFB45309"/><name val="Malgun Gothic"/></font></fonts>' +
    '<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F5C4A"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F3"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8F2EE"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7ED"/></patternFill></fill></fills>' +
    '<borders count="3"><border/><border><left style="thin"><color rgb="FFD6DDE3"/></left><right style="thin"><color rgb="FFD6DDE3"/></right><top style="thin"><color rgb="FFD6DDE3"/></top><bottom style="thin"><color rgb="FFD6DDE3"/></bottom></border>' +
    '<border><left style="thin"><color rgb="FFD6DDE3"/></left><right style="thin"><color rgb="FFD6DDE3"/></right><top style="medium"><color rgb="FF111827"/></top><bottom style="medium"><color rgb="FF111827"/></bottom></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="16">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                                                                   // 0
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +     // 1 txt
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 2 head
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                                             // 3 int
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                                             // 4 dec
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // 5 date
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' + // 6 totL
    '<xf numFmtId="164" fontId="1" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +                // 7 totI
    '<xf numFmtId="165" fontId="1" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +                // 8 totD
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                                       // 9 title
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                                                       // 10 sub
    '<xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +                                         // 11 lab
    '<xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +                                             // 12 pct
    '<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf>' + // 13 warn
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>' +              // 14 ctr
    '<xf numFmtId="167" fontId="1" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +                // 15 totP
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  /** 시트 하나 — cells: {r,c,v,s,f} (v=값, f=수식, s=스타일). 문자열은 inlineStr */
  function sheetXml(o) {
    var byRow = {};
    o.cells.forEach(function (x) { (byRow[x.r] = byRow[x.r] || []).push(x); });
    var rows = Object.keys(byRow).map(Number).sort(function (a, b) { return a - b; });
    var sd = rows.map(function (r) {
      var cs = byRow[r].sort(function (a, b) { return a.c - b.c; }).map(function (x) {
        var a = ' r="' + ref(x.c, r) + '"' + (x.s ? ' s="' + x.s + '"' : '');
        if (x.f) {
          var cached = x.v == null ? '' : (typeof x.v === 'number' ? '<v>' + x.v + '</v>' : '');
          var tstr = typeof x.v === 'string' ? ' t="str"' : '';
          return '<c' + a + tstr + '><f>' + xe(x.f) + '</f>' + (typeof x.v === 'string' ? '<v>' + xe(x.v) + '</v>' : cached) + '</c>';
        }
        if (x.v == null || x.v === '') return '<c' + a + '/>';
        if (typeof x.v === 'number') return '<c' + a + '><v>' + x.v + '</v></c>';
        return '<c' + a + ' t="inlineStr"><is><t xml:space="preserve">' + xe(x.v) + '</t></is></c>';
      }).join('');
      return '<row r="' + r + '"' + (o.heights && o.heights[r] ? ' ht="' + o.heights[r] + '" customHeight="1"' : '') + '>' + cs + '</row>';
    }).join('');
    var pane = o.freeze ? '<pane ySplit="' + (o.freeze - 1) + '" topLeftCell="A' + o.freeze + '" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0">' + pane + '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="16"/><cols>' + o.widths.map(function (w, i) {
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"' + (o.hidden && o.hidden.indexOf(i) >= 0 ? ' hidden="1"' : '') + '/>';
      }).join('') + '</cols><sheetData>' + sd + '</sheetData>' +
      (o.filter ? '<autoFilter ref="' + o.filter + '"/>' : '') +
      (o.merges && o.merges.length ? '<mergeCells count="' + o.merges.length + '">' + o.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '') +
      '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.7" header="0.3" footer="0.3"/>' +
      '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      '<headerFooter><oddFooter>' + xe('&L' + o.footer.replace(/&/g, '&&') + '&R&P / &N') + '</oddFooter></headerFooter></worksheet>';
  }

  function xlsxBlob(M) {
    var T = M.T;
    var N = { sum: T('Summary', '요약'), led: T('Ledger', '전표장부'), cat: T('By category', '분류별집계'), chk: T('Excluded', '제외·확인') };
    var foot = M.company + ' · ' + M.title + ' · ' + (M.from || '') + '~' + (M.to || '');
    var amtS = function (cur) { return digitsOf(cur) ? S.dec : S.int; };
    var totS = function (cur) { return digitsOf(cur) ? S.totD : S.totI; };

    // ── 전표장부 ── (머리 5행, 데이터 6행부터)
    var L = [], F = 6, lastData = Math.max(F, F + M.rows.length - 1);
    var LR = function (col) { return qs(N.led) + '!$' + col + '$' + F + ':$' + col + '$' + lastData; };
    L.push({ r: 1, c: 0, v: M.company + '  ·  ' + M.title, s: S.title });
    L.push({ r: 2, c: 0, v: T('Period: ', '기간: ') + (M.from || '…') + ' ~ ' + (M.to || '…') + '   ' + T('Issued: ', '발행: ') + M.issued + ' KST   ' + M.scope, s: S.sub });
    L.push({ r: 3, c: 0, v: T('Amounts in original currency. Running totals and all totals are formulas (they recalculate when a line changes).',
                              '금액은 원래 통화입니다. 누계·합계·집계는 수식이라 줄을 고치면 다시 계산됩니다.'), s: S.sub });
    var head = ['No.', T('Date', '일자'), T('Approval #', '결재번호'), T('Category', '분류'), T('Description', '적요(내용)'), T('Requested by', '올린 사람'),
                T('Currency', '통화'), T('Amount', '금액'), T('Running total', '누계(통화별)'), T('Group key', '집계키')];
    head.forEach(function (h, i) { L.push({ r: 5, c: i, v: h, s: S.head }); });
    if (!M.rows.length) L.push({ r: F, c: 4, v: T('No approved spending in this period.', '이 기간에 승인된 지출이 없습니다.'), s: S.txt });
    M.rows.forEach(function (x, i) {
      var r = F + i, sd = serial(x.ymd);
      L.push({ r: r, c: 0, v: x.no, s: S.ctr });
      L.push({ r: r, c: 1, v: sd == null ? x.ymd : sd, s: sd == null ? S.ctr : S.date });
      L.push({ r: r, c: 2, v: x.id, s: S.ctr });
      L.push({ r: r, c: 3, v: x.cat, s: S.txt });
      L.push({ r: r, c: 4, v: x.title, s: S.txt });
      L.push({ r: r, c: 5, v: x.who, s: S.txt });
      L.push({ r: r, c: 6, v: x.cur, s: S.ctr });
      L.push({ r: r, c: 7, v: x.amt, s: amtS(x.cur) });
      L.push({ r: r, c: 8, f: 'SUMIF($G$' + F + ':G' + r + ',G' + r + ',$H$' + F + ':H' + r + ')', v: x.cum, s: amtS(x.cur) });
      L.push({ r: r, c: 9, v: x.gid, s: S.ctr });
    });
    var tr = lastData + 2;
    var totRow = {};            // 통화 → 합계가 적힌 행(요약 시트가 참조)
    M.totals.forEach(function (t, i) {
      var r = tr + i; totRow[t.cur] = r;
      L.push({ r: r, c: 0, v: T('Total', '합계') + ' (' + t.cur + ', ' + t.n + T(' items', '건') + ')', s: S.totL });
      for (var cc = 1; cc <= 5; cc++) L.push({ r: r, c: cc, v: '', s: S.totL });
      L.push({ r: r, c: 6, v: t.cur, s: S.totL });
      L.push({ r: r, c: 7, f: 'SUMIF($G$' + F + ':$G$' + lastData + ',"' + t.cur + '",$H$' + F + ':$H$' + lastData + ')', v: t.sum, s: totS(t.cur) });
      L.push({ r: r, c: 8, v: '', s: S.totL });
    });
    var ledMerges = ['A1:I1', 'A2:I2', 'A3:I3'];
    M.totals.forEach(function (t) { ledMerges.push('A' + totRow[t.cur] + ':F' + totRow[t.cur]); });

    // ── 분류별집계 ── (집계키 = 전표장부 J열의 숫자 — 라벨 글자로 세지 않는다)
    var C = [], cr = 2;
    [T('Currency', '통화'), T('Category', '분류'), T('Items', '건수'), T('Amount', '금액'), T('Share (in currency)', '구성비(통화 내)'), T('Group key', '집계키')]
      .forEach(function (h, i) { C.push({ r: 1, c: i, v: h, s: S.head }); });
    var catSubRow = {};
    M.curs.forEach(function (cu) {
      var first = cr;
      M.groups.forEach(function (g) {
        if (g.cur !== cu) return;
        C.push({ r: cr, c: 0, v: cu, s: S.ctr });
        C.push({ r: cr, c: 1, v: g.label, s: S.txt });
        C.push({ r: cr, c: 2, f: 'COUNTIF(' + LR('J') + ',F' + cr + ')', v: g.n, s: S.ctr });
        C.push({ r: cr, c: 3, f: 'SUMIF(' + LR('J') + ',F' + cr + ',' + LR('H') + ')', v: g.sum, s: amtS(cu) });
        C.push({ r: cr, c: 5, v: g.id, s: S.ctr });
        cr++;
      });
      var last = cr - 1, sr = cr; catSubRow[cu] = sr;
      for (var k = first; k <= last; k++) C.push({ r: k, c: 4, f: 'IF($D$' + sr + '=0,0,D' + k + '/$D$' + sr + ')', v: (M.groups.filter(function (g) { return g.cur === cu; })[k - first] || {}).share || 0, s: S.pct });
      var t = M.totals.filter(function (x) { return x.cur === cu; })[0] || { n: 0, sum: 0 };
      C.push({ r: sr, c: 0, v: cu, s: S.totL });
      C.push({ r: sr, c: 1, v: T('Subtotal', '소계'), s: S.totL });
      C.push({ r: sr, c: 2, f: last >= first ? 'SUM(C' + first + ':C' + last + ')' : '0', v: t.n, s: S.totI });
      C.push({ r: sr, c: 3, f: last >= first ? 'SUM(D' + first + ':D' + last + ')' : '0', v: t.sum, s: totS(cu) });
      C.push({ r: sr, c: 4, v: 1, s: S.totP });
      cr = sr + 2;
    });
    if (!M.curs.length) C.push({ r: 2, c: 1, v: T('No approved spending in this period.', '이 기간에 승인된 지출이 없습니다.'), s: S.txt });

    // ── 요약 ──
    var Y = [], yr = 1;
    Y.push({ r: yr++, c: 0, v: M.company + '  ·  ' + M.title, s: S.title });
    Y.push({ r: yr++, c: 0, v: M.sub, s: S.sub });
    yr++;
    [[T('Period', '기간'), (M.from || '…') + ' ~ ' + (M.to || '…') + ' (' + M.perName + ')'], [T('Scope', '범위'), M.scope],
     [T('Issued (KST)', '발행 일시(KST)'), M.issued], [T('Issued by', '발행자'), M.who || '-'],
     [T('Currency basis', '통화 기준'), T('Original currency · totals per currency (never mixed)', '원래 통화 · 통화별 합계(섞지 않음)')]].forEach(function (p) {
      Y.push({ r: yr, c: 0, v: p[0], s: S.lab }); Y.push({ r: yr, c: 1, v: p[1], s: S.txt }); yr++;
    });
    yr++;
    [T('Currency', '통화'), T('Items', '건수'), T('Approved spending', '승인된 지출 합계'), T('Check (= category total)', '검증(= 분류별 합계)')]
      .forEach(function (h, i) { Y.push({ r: yr, c: i, v: h, s: S.head }); });
    yr++;
    M.totals.forEach(function (t) {
      Y.push({ r: yr, c: 0, v: t.cur, s: S.ctr });
      Y.push({ r: yr, c: 1, f: 'COUNTIF(' + LR('G') + ',"' + t.cur + '")', v: t.n, s: S.ctr });
      Y.push({ r: yr, c: 2, f: qs(N.led) + '!H' + totRow[t.cur], v: t.sum, s: amtS(t.cur) });
      Y.push({ r: yr, c: 3, f: 'IF(ROUND(C' + yr + '-' + qs(N.cat) + '!D' + catSubRow[t.cur] + ',2)=0,"OK","NG")', v: M.checks.ok ? 'OK' : 'NG', s: S.ctr });
      yr++;
    });
    if (!M.totals.length) { Y.push({ r: yr, c: 0, v: T('No approved spending in this period.', '이 기간에 승인된 지출이 없습니다.'), s: S.txt }); yr++; }
    if (M.ref) {
      yr++;
      Y.push({ r: yr, c: 0, v: T('Reference only', '참고값'), s: S.lab });
      Y.push({ r: yr, c: 1, v: T('All currencies at today\'s rate ≈ ', '오늘 환율로 원화 환산 ≈ ') + money(M.ref.krw, 'KRW') + ' (₱1 = ₩' + M.ref.rate.toFixed(2) +
        (M.ref.date ? ', ' + M.ref.date : '') + ') — ' + T('not a booked amount; use transaction-date rates.', '장부 금액 아님 · 회계 처리는 거래일 환율.'), s: S.warn });
      yr++;
    }
    yr++;
    [T('Prepared by', '작성'), T('Reviewed by (CPA / tax accountant)', '검토 (세무사·회계사)'), T('Approved by', '승인')].forEach(function (s, i) {
      Y.push({ r: yr, c: i, v: s, s: S.lab }); Y.push({ r: yr + 1, c: i, v: i === 0 ? (M.who || '') : '', s: S.txt });
    });
    var sumHeights = {}; sumHeights[yr + 1] = 36;

    // ── 제외·확인 ──
    var X = [];
    [T('What', '구분'), T('Count', '건수')].forEach(function (h, i) { X.push({ r: 1, c: i, v: h, s: S.head }); });
    if (!M.missing.length) X.push({ r: 2, c: 0, v: T('Nothing excluded or to check.', '제외되거나 확인이 필요한 항목이 없습니다.'), s: S.txt });
    M.missing.forEach(function (x, i) { X.push({ r: 2 + i, c: 0, v: x.text, s: S.warn }); X.push({ r: 2 + i, c: 1, v: x.n == null ? '–' : x.n, s: S.ctr }); });

    var sheets = [
      { name: N.sum, xml: sheetXml({ cells: Y, widths: [26, 34, 26, 22], merges: ['A1:D1', 'A2:D2'], footer: foot, heights: sumHeights }) },
      { name: N.led, xml: sheetXml({ cells: L, widths: [6, 12, 11, 18, 40, 16, 8, 15, 17, 8], hidden: [9], freeze: F, filter: 'A5:J' + lastData, merges: ledMerges, footer: foot }) },
      { name: N.cat, xml: sheetXml({ cells: C, widths: [9, 30, 9, 16, 16, 8], hidden: [5], freeze: 2, footer: foot }) },
      { name: N.chk, xml: sheetXml({ cells: X, widths: [70, 10], footer: foot }) },
    ];
    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets>' + sheets.map(function (s, i) { return '<sheet name="' + xe(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets>' +
      '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">' + xe(qs(N.led) + '!$A$5:$J$' + lastData) + '</definedName>' +
      '<definedName name="_xlnm.Print_Titles" localSheetId="1">' + xe(qs(N.led) + '!$5:$5') + '</definedName></definedNames>' +
      '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>';
    var files = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
        '</Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: wb },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: STYLES },
    ];
    sheets.forEach(function (s, i) { files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s.xml }); });
    return zip(files);
  }

  // ───────────────────────── 동작 ─────────────────────────
  function save(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  /** 숨은 iframe 에 문서를 넣고 인쇄 — PDF 는 인쇄 창에서 «PDF로 저장» */
  function printDoc(html) {
    var f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none';
    var gone = false, drop = function () { if (!gone) { gone = true; f.remove(); } };
    f.onload = function () {
      var w = f.contentWindow; if (!w) return drop();
      w.onafterprint = function () { setTimeout(drop, 300); };
      w.focus(); w.print();
      setTimeout(drop, 5 * 60 * 1000);
    };
    document.body.appendChild(f);
    f.srcdoc = html;
  }
  var OV = null;
  function closePreview() { if (OV) { OV.remove(); OV = null; document.removeEventListener('keydown', onKey); } }
  function onKey(e) { if (e.key === 'Escape') closePreview(); }
  function preview(M, html, act) {
    closePreview();
    var T = M.T;
    OV = document.createElement('div');
    OV.className = 'ledxov';
    OV.setAttribute('role', 'dialog'); OV.setAttribute('aria-modal', 'true'); OV.setAttribute('aria-label', M.title);
    OV.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(17,24,39,.6);display:flex;align-items:center;justify-content:center;padding:12px';
    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:12px;width:min(1100px,100%);height:min(92vh,960px);display:flex;flex-direction:column;overflow:hidden';
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:10px 12px;border-bottom:1px solid #d6dde3;color:#111827';
    var h = document.createElement('b'); h.textContent = M.title + ' · ' + (M.from || '') + ' ~ ' + (M.to || ''); h.style.cssText = 'margin-right:auto;font-size:14px';
    bar.appendChild(h);
    var mk = function (label, fn, main) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.style.cssText = 'border:1px solid #1f5c4a;border-radius:8px;padding:7px 12px;font:inherit;font-weight:600;cursor:pointer;' + (main ? 'background:#1f5c4a;color:#fff' : 'background:#fff;color:#1f5c4a');
      b.addEventListener('click', fn); bar.appendChild(b);
    };
    mk('PDF', function () { act('pdf'); }, true);
    mk(T('Excel', '엑셀'), function () { act('xlsx'); });
    mk(T('Print', '인쇄'), function () { act('print'); });
    mk(T('Close', '닫기'), closePreview);
    var fr = document.createElement('iframe');
    fr.title = M.title; fr.style.cssText = 'flex:1;width:100%;border:0;background:#e5e7eb';
    fr.srcdoc = html;
    box.appendChild(bar); box.appendChild(fr); OV.appendChild(box);
    OV.addEventListener('click', function (e) { if (e.target === OV) closePreview(); });
    document.body.appendChild(OV);
    document.addEventListener('keydown', onKey);
  }

  /**
   * kind: 'preview' | 'pdf' | 'print' | 'xlsx'
   * 반환: { ok, note } — 부르는 쪽이 화면 한 줄로 알린다.
   */
  function run(kind, d, ctx) {
    var M = buildModel(d, ctx);
    var html = docHtml(M);
    var act = function (k) { return run(k, d, ctx); };
    if (kind === 'xlsx') { save(xlsxBlob(M), fileBase(M) + '.xlsx'); return { ok: true, note: M.T('Excel file downloaded.', '엑셀 파일을 내려받았습니다.') }; }
    if (kind === 'pdf') { printDoc(html); return { ok: true, note: M.T('In the print window choose "Save as PDF".', '인쇄 창에서 대상을 «PDF로 저장» 으로 고르면 PDF 파일이 됩니다.') }; }
    if (kind === 'print') { printDoc(html); return { ok: true, note: '' }; }
    preview(M, html, act);
    return { ok: true, note: '' };
  }

  window.MangoiLedgerExport = { run: run, _buildModel: buildModel, _docHtml: docHtml, _xlsxBlob: xlsxBlob, version: 1 };
})();
