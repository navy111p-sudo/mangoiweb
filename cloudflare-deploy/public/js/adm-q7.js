// ═══════════════════════════════════════════════════════════════
// adm-q7.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  // KPI 데모 값 채우기
  function fmt(n){ return '₩' + n.toLocaleString('ko-KR'); }
  function setKpi(id, v){ var e = document.getElementById(id); if (e) e.textContent = v; }
  // B2B KPI
  setKpi('b2b-kpi-today', fmt(890000));
  setKpi('b2b-kpi-month', fmt(28500000));
  setKpi('b2b-kpi-count', '247건');
  setKpi('b2b-kpi-fee',   fmt(815100));
  // B2C KPI
  setKpi('b2c-kpi-today', fmt(2380000));
  setKpi('b2c-kpi-month', fmt(45200000));
  setKpi('b2c-kpi-count', '156건');
  setKpi('b2c-kpi-tax',   '12건');

  // 간단한 라인 차트 (Canvas API 직접, Chart.js 의존 없음)
  function drawSimpleLine(canvasId, data, color){
    var c = document.getElementById(canvasId);
    if (!c) return;
    var ctx = c.getContext('2d');
    var w = c.width = c.offsetWidth;
    var h = c.height = 100;
    ctx.clearRect(0, 0, w, h);
    var max = Math.max.apply(null, data);
    var step = w / (data.length - 1);
    // 그라데이션 배경
    var grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '40');
    grad.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach(function(v, i){
      var x = i * step;
      var y = h - (v / max) * (h - 10) - 5;
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // 라인
    ctx.beginPath();
    data.forEach(function(v, i){
      var x = i * step;
      var y = h - (v / max) * (h - 10) - 5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    // 포인트
    data.forEach(function(v, i){
      var x = i * step;
      var y = h - (v / max) * (h - 10) - 5;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }

  function ph106Draw(){
    // B2B 30일 데모 데이터
    var b2bData = [];
    for (var i = 0; i < 30; i++) b2bData.push(Math.floor(500000 + Math.random() * 1500000));
    drawSimpleLine('b2b-chart', b2bData, '#60A5FA');
    // B2C 12개월 데모 데이터
    var b2cData = [12000000, 15000000, 18000000, 22000000, 28000000, 31000000, 35000000, 38000000, 42000000, 39000000, 41000000, 45200000];
    drawSimpleLine('b2c-chart', b2cData, '#67E8F9');
  }
  // 카드가 열릴 때마다 그리기 (details open 이벤트)
  document.addEventListener('toggle', function(e){
    if (e.target.id === 'card-payments-b2b' || e.target.id === 'card-payments-b2c') {
      if (e.target.open) setTimeout(ph106Draw, 100);
    }
  }, true);
  // 초기 1회
  setTimeout(ph106Draw, 500);

  // 검색/다운로드 stub (실서비스시 fetch API 호출로 교체)
  window.b2bSearch = function(){ console.log('[ph106] B2B 검색 호출 — 실서비스에서 /api/admin/payments/b2b 호출'); alert('검색 요청 전송 (데모)'); };
  window.b2cSearch = function(){ console.log('[ph106] B2C 검색 호출'); alert('검색 요청 전송 (데모)'); };
  window.b2bDownloadCsv = function(){ console.log('[ph106] B2B CSV 다운로드'); alert('CSV 다운로드 시작 (데모)'); };
  window.b2bDownloadExcel = function(){ console.log('[ph106] B2B Excel 다운로드'); alert('Excel 다운로드 시작 (데모)'); };
  window.b2cDownloadCsv = function(){ console.log('[ph106] B2C CSV 다운로드'); alert('CSV 다운로드 시작 (데모)'); };
  window.b2cBulkTaxInvoice = function(){ console.log('[ph106] 세금계산서 일괄발행'); alert('세금계산서 일괄발행 시작 (데모)'); };

  console.log('[ph106] BtoB/BtoC 결제관리 카드 + 차트 초기화 완료');

  // ═════════════════════════════════════════════════════════════════
  // 🔵🔴 ph220: 3년 평균 vs 현재 비교 막대 차트 (BtoB + BtoC 공통)
  // ═════════════════════════════════════════════════════════════════
  function ph220DrawCompareChart(canvasId, summaryId, type) {
    var c = document.getElementById(canvasId);
    if (!c) return;
    var ctx = c.getContext('2d');
    if (!ctx) return;

    // demo 데이터: 12개월 — 3년 평균 vs 올해
    var months = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];
    var nowMonth = new Date().getMonth() + 1;  // 1~12

    // 시드 기반 demo (BtoB 는 더 크게, BtoC 는 더 변동성 큼)
    var base = (type === 'b2b') ? 28000000 : 36000000;
    var avg3y = months.map(function(_, i){
      var m = i + 1;
      var seasonal = 1 + 0.18 * Math.sin((m - 3) * Math.PI / 6); // 봄·가을 피크
      return Math.round(base * seasonal * (0.94 + Math.random() * 0.06));
    });
    // 올해 = 현재 월까지만 표시 + 평균 대비 -8%~+22% 변동
    var thisY = months.map(function(_, i){
      var m = i + 1;
      if (m > nowMonth) return null;
      var multi = (type === 'b2b') ? (1.05 + Math.random() * 0.12) : (0.92 + Math.random() * 0.25);
      return Math.round(avg3y[i] * multi);
    });

    // canvas 크기
    var w = c.clientWidth || c.parentNode.clientWidth || 800;
    var h = 120;
    c.width = w * (window.devicePixelRatio || 1);
    c.height = h * (window.devicePixelRatio || 1);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    // 배경
    ctx.fillStyle = 'rgba(15,23,42,0.4)';
    ctx.fillRect(0, 0, w, h);

    // max
    var maxVal = Math.max.apply(null, avg3y.concat(thisY.filter(function(v){return v!=null;})));
    var pad = 24, gridH = h - 36;

    // 그리드 라인
    ctx.strokeStyle = 'rgba(96,165,250,0.15)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 4; g++) {
      var y = pad + (gridH * g / 4);
      ctx.beginPath();
      ctx.moveTo(28, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
    }

    // 막대
    var barAreaW = (w - 36) / months.length;
    var barW = Math.max(3, (barAreaW - 4) / 2);
    months.forEach(function(_, i){
      var x = 30 + i * barAreaW;
      var avgH = (avg3y[i] / maxVal) * gridH;
      var thisH = thisY[i] != null ? (thisY[i] / maxVal) * gridH : 0;

      // 파란 막대 (3년 평균) - 왼쪽
      var blueGrad = ctx.createLinearGradient(0, pad + gridH - avgH, 0, pad + gridH);
      blueGrad.addColorStop(0, '#60a5fa');
      blueGrad.addColorStop(1, '#2563eb');
      ctx.fillStyle = blueGrad;
      ctx.fillRect(x, pad + gridH - avgH, barW, avgH);

      // 빨간 막대 (올해 현재) - 오른쪽
      if (thisY[i] != null) {
        var redGrad = ctx.createLinearGradient(0, pad + gridH - thisH, 0, pad + gridH);
        redGrad.addColorStop(0, '#f87171');
        redGrad.addColorStop(1, '#dc2626');
        ctx.fillStyle = redGrad;
        ctx.fillRect(x + barW + 2, pad + gridH - thisH, barW, thisH);
      }

      // 월 라벨
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(months[i], x + barW + 1, h - 8);
    });

    // 요약 텍스트
    var thisYearTotal = thisY.filter(function(v){return v!=null;}).reduce(function(a,b){return a+b;}, 0);
    var avgSamePeriod = avg3y.slice(0, nowMonth).reduce(function(a,b){return a+b;}, 0);
    var diff = thisYearTotal - avgSamePeriod;
    var pct = Math.round((diff / avgSamePeriod) * 100);
    var sign = diff >= 0 ? '▲' : '▼';
    var color = diff >= 0 ? '#10b981' : '#ef4444';
    var fmtMoney = function(n){ return '₩' + Math.round(n / 10000).toLocaleString('ko-KR') + '만'; };
    var summary = document.getElementById(summaryId);
    if (summary) {
      summary.innerHTML =
        '<span style="color:#60a5fa">3년 평균 (1~' + nowMonth + '월): <b>' + fmtMoney(avgSamePeriod) + '</b></span>' +
        ' &nbsp;·&nbsp; <span style="color:#f87171">올해 현재 (1~' + nowMonth + '월): <b>' + fmtMoney(thisYearTotal) + '</b></span>' +
        ' &nbsp;·&nbsp; <span style="color:' + color + ';font-weight:800">' + sign + ' ' + Math.abs(pct) + '%</span>';
    }
  }

  function ph220DrawAll() {
    ph220DrawCompareChart('b2b-compare-chart', 'b2b-compare-summary', 'b2b');
    ph220DrawCompareChart('b2c-compare-chart', 'b2c-compare-summary', 'b2c');
  }

  // 초기 호출 + details open 시 재호출
  setTimeout(ph220DrawAll, 600);
  setTimeout(ph220DrawAll, 2000);
  ['card-payments-b2b','card-payments-b2c'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.addEventListener('toggle', function(){
      if (el.open) setTimeout(ph220DrawAll, 200);
    });
  });
  window.addEventListener('resize', function(){ setTimeout(ph220DrawAll, 100); });

  console.log('[ph220] 3년 평균 vs 현재 비교 차트 초기화 완료');
})();
