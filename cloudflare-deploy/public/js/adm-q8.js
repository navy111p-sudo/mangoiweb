// ═══════════════════════════════════════════════════════════════
// adm-q8.js — admin.html 인라인 스크립트 추출 (2단계 32차, 2026-07-14)
//   외부 classic script — admin.html 다른 <script> 와 전역 스코프 공유. 원복=이 위치에 인라인.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // ============================================
  // 폼 데이터 수집 helper
  // ============================================
  function rfCollectFormData(){
    var data = {
      title: document.getElementById('rf-modal-title').textContent || '보고서',
      subtitle: document.getElementById('rf-modal-subtitle').textContent || '',
      sections: []
    };
    var sections = document.querySelectorAll('#rf-modal-body .rf-form-section');
    sections.forEach(function(sec){
      if (sec.style.display === 'none') return;
      var secTitle = sec.querySelector('.rf-form-section-title');
      var fields = [];
      sec.querySelectorAll('input, textarea, select').forEach(function(el){
        var wrap = el.closest('div');
        var label = wrap && wrap.querySelector('.rf-field-label');
        var labelText = label ? label.textContent.replace('*','').trim() : (el.id || el.name || '');
        var value = '';
        if (el.tagName === 'SELECT') {
          value = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : '';
        } else {
          value = el.value || '';
        }
        fields.push({ label: labelText, value: value });
      });
      data.sections.push({
        title: secTitle ? secTitle.textContent.trim() : '',
        fields: fields
      });
    });
    return data;
  }

  function rfFilename(data, ext){
    var date = new Date().toISOString().slice(0,10);
    var clean = data.title.replace(/[^가-힣a-zA-Z0-9_\- ]/g, '').trim();
    return clean + '_' + date + '.' + ext;
  }

  function rfDownloadBlob(blob, filename){
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // ============================================
  // 1) 인쇄 — window.print()
  // ============================================
  window.rfPrint = function(){
    console.log('[ph109] 인쇄 호출');
    window.print();
  };

  // ============================================
  // 2) PDF — jsPDF + html2canvas 동적 로드 후 변환
  //    (대안: window.print() 다이얼로그에서 PDF 저장 선택)
  // ============================================
  window.rfDownloadPDF = function(){
    var data = rfCollectFormData();
    var filename = rfFilename(data, 'pdf');

    // 가벼운 방법: 인쇄 다이얼로그에서 "PDF로 저장" 안내
    if (confirm('PDF 저장 방법을 선택해주세요:\n\n[확인] 인쇄 다이얼로그 열기 → 대상에서 "PDF로 저장" 선택 (가장 깔끔)\n[취소] 즉시 jsPDF 라이브러리 로드 후 자동 PDF 생성 (CDN 다운로드 필요)')) {
      window.print();
      return;
    }

    // jsPDF + html2canvas 동적 로드
    console.log('[ph109] jsPDF + html2canvas 로딩...');
    var loaded = 0;
    function tryGenerate(){
      if (loaded < 2) return;
      try {
        var modal = document.querySelector('.rf-modal');
        html2canvas(modal, { backgroundColor: '#ffffff', scale: 2 }).then(function(canvas){
          var imgData = canvas.toDataURL('image/png');
          var pdf = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
          var pageWidth = pdf.internal.pageSize.getWidth();
          var pageHeight = pdf.internal.pageSize.getHeight();
          var imgWidth = pageWidth - 20;
          var imgHeight = (canvas.height * imgWidth) / canvas.width;
          var heightLeft = imgHeight;
          var position = 10;
          pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
          heightLeft -= (pageHeight - 20);
          while (heightLeft > 0) {
            position = heightLeft - imgHeight + 10;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            heightLeft -= (pageHeight - 20);
          }
          pdf.save(filename);
          console.log('[ph109] PDF 다운로드 완료:', filename);
        });
      } catch(e){
        console.error('[ph109] PDF 생성 실패:', e);
        alert('PDF 자동 생성 실패. "인쇄 → PDF로 저장" 방법을 권장합니다.');
        window.print();
      }
    }
    function loadScript(src){
      var s = document.createElement('script');
      s.src = src;
      s.onload = function(){ loaded++; tryGenerate(); };
      s.onerror = function(){ alert('PDF 라이브러리 로드 실패 (네트워크 확인). 인쇄 다이얼로그를 엽니다.'); window.print(); };
      document.head.appendChild(s);
    }
    if (!window.jspdf) loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js');
    else loaded++;
    if (!window.html2canvas) loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
    else loaded++;
    if (loaded === 2) tryGenerate();
  };

  // ============================================
  // 3) Excel — 자체 .xls 생성 (MS Excel XML 호환)
  //    의존성 없음
  // ============================================
  window.rfDownloadExcel = function(){
    var data = rfCollectFormData();
    var filename = rfFilename(data, 'xls');
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head><meta charset="utf-8">';
    html += '<xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>' + data.title.substring(0, 28) + '</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml>';
    html += '<style>td{vnd.ms-excel.numberformat:"@";}</style>';
    html += '</head><body>';
    html += '<table border="1" style="border-collapse:collapse;font-family:Malgun Gothic,Arial">';
    // 제목
    html += '<tr><td colspan="2" style="background:#1E3A8A;color:#fff;font-size:16pt;font-weight:bold;padding:10px;text-align:center">' + data.title + '</td></tr>';
    html += '<tr><td colspan="2" style="background:#E0F2FE;color:#1E40AF;padding:6px;text-align:center">' + data.subtitle + '</td></tr>';
    html += '<tr><td colspan="2" style="padding:4px;font-size:9pt;color:#666">발급일: ' + new Date().toLocaleString('ko-KR') + '</td></tr>';
    // 빈 행
    html += '<tr><td colspan="2" style="height:8px"></td></tr>';
    data.sections.forEach(function(sec){
      // 섹션 헤더
      html += '<tr><td colspan="2" style="background:#2563EB;color:#fff;font-weight:bold;padding:6px;font-size:11pt">' + sec.title + '</td></tr>';
      sec.fields.forEach(function(f){
        html += '<tr>';
        html += '<td style="background:#F0F9FF;font-weight:bold;padding:6px;width:30%;border:1px solid #93C5FD">' + f.label + '</td>';
        html += '<td style="padding:6px;border:1px solid #93C5FD">' + (f.value || '-') + '</td>';
        html += '</tr>';
      });
      html += '<tr><td colspan="2" style="height:4px"></td></tr>';
    });
    html += '</table></body></html>';
    var blob = new Blob(['﻿', html], { type: 'application/vnd.ms-excel;charset=utf-8' });
    rfDownloadBlob(blob, filename);
    console.log('[ph109] Excel 다운로드 완료:', filename);
  };

  // ============================================
  // 4) Word — 자체 .doc 생성 (MS Word XML 호환)
  //    의존성 없음
  // ============================================
  window.rfDownloadWord = function(){
    var data = rfCollectFormData();
    var filename = rfFilename(data, 'doc');
    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head><meta charset="utf-8"><title>' + data.title + '</title>';
    html += '<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotPromptForConvert/><w:DoNotShowInsertionsAndDeletions/></w:WordDocument></xml>';
    html += '<style>@page WordSection1 { size: A4; margin: 2cm; } div.WordSection1 { page: WordSection1; } body { font-family: "Malgun Gothic", "맑은 고딕", Arial; font-size: 11pt; }</style>';
    html += '</head><body>';
    html += '<div class="WordSection1">';
    // 제목
    html += '<h1 style="text-align:center;color:#1E3A8A;border-bottom:3px solid #2563EB;padding-bottom:10px">' + data.title + '</h1>';
    html += '<p style="text-align:center;color:#475569;margin-top:-8px">' + data.subtitle + '</p>';
    html += '<p style="text-align:right;font-size:10pt;color:#64748B">발급일: ' + new Date().toLocaleString('ko-KR') + '</p>';
    // 섹션
    data.sections.forEach(function(sec){
      html += '<h2 style="background:#2563EB;color:#fff;padding:6px 10px;font-size:13pt;margin-top:18px">' + sec.title + '</h2>';
      html += '<table border="1" style="border-collapse:collapse;width:100%;font-size:11pt">';
      sec.fields.forEach(function(f){
        html += '<tr>';
        html += '<td style="background:#F0F9FF;color:#1E40AF;font-weight:bold;padding:8px;width:30%;border:1px solid #94A3B8">' + f.label + '</td>';
        html += '<td style="padding:8px;border:1px solid #94A3B8;color:#0F172A">' + (f.value || '-') + '</td>';
        html += '</tr>';
      });
      html += '</table>';
    });
    // 결재 서명란 추가 (보고서 양식 특성)
    html += '<table style="width:100%;margin-top:30px;border-collapse:collapse;font-size:10pt">';
    html += '<tr>';
    html += '<td style="border:1px solid #999;width:25%;text-align:center;padding:8px;background:#F0F9FF">결재선</td>';
    html += '<td style="border:1px solid #999;height:60px;text-align:center;color:#999">기안자</td>';
    html += '<td style="border:1px solid #999;height:60px;text-align:center;color:#999">팀장</td>';
    html += '<td style="border:1px solid #999;height:60px;text-align:center;color:#999">본부장</td>';
    html += '<td style="border:1px solid #999;height:60px;text-align:center;color:#999">대표이사</td>';
    html += '</tr>';
    html += '<tr style="height:80px"><td style="border:1px solid #999;text-align:center;background:#F0F9FF;padding:8px">서명/날인</td>';
    html += '<td style="border:1px solid #999"></td><td style="border:1px solid #999"></td><td style="border:1px solid #999"></td><td style="border:1px solid #999"></td>';
    html += '</tr></table>';
    html += '</div></body></html>';
    var blob = new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' });
    rfDownloadBlob(blob, filename);
    console.log('[ph109] Word 다운로드 완료:', filename);
  };

  // ============================================
  // 모달 푸터에 출력 버튼 그룹 동적 삽입
  // ============================================
  function ph109InjectButtons(){
    var footer = document.querySelector('.rf-modal-footer');
    if (!footer || document.getElementById('rf-export-row')) return;
    var exportRow = document.createElement('div');
    exportRow.id = 'rf-export-row';
    exportRow.className = 'rf-export-row';
    exportRow.innerHTML =
      '<button type="button" class="rf-export-btn print" onclick="rfPrint()">🖨 인쇄</button>' +
      '<button type="button" class="rf-export-btn pdf"   onclick="rfDownloadPDF()">📄 PDF</button>' +
      '<button type="button" class="rf-export-btn excel" onclick="rfDownloadExcel()">📊 Excel</button>' +
      '<button type="button" class="rf-export-btn word"  onclick="rfDownloadWord()">📝 Word</button>';
    footer.insertBefore(exportRow, footer.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ph109InjectButtons);
  else ph109InjectButtons();
  setInterval(ph109InjectButtons, 1500);

  console.log('[ph109] 인쇄/PDF/Excel/Word 다운로드 4종 초기화 완료');
})();
