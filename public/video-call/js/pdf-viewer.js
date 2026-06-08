/**
 * pdf-viewer.js – PDF 업로드 + PDF.js 렌더링 + 페이지 동기화
 * [통합] 업로드 경로: /api/video-call/upload-pdf
 */
let pdfDoc = null;
let pdfCurrentPage = 1;
let pdfTotalPages = 0;
let pdfScale = 1.5;
let isSharing = false;

const $pdfUpload   = document.getElementById('pdf-upload');
const $pdfCanvas   = document.getElementById('pdf-canvas');
const $pdfCtx      = $pdfCanvas.getContext('2d');
const $pdfPrev     = document.getElementById('pdf-prev');
const $pdfNext     = document.getElementById('pdf-next');
const $pdfPageInfo = document.getElementById('pdf-page-info');
const $pdfNav      = document.getElementById('pdf-nav');
const $pdfStop     = document.getElementById('pdf-stop');
const $pdfPlaceholder = document.getElementById('pdf-placeholder');
const $pdfContainer   = document.getElementById('pdf-container');
const $pdfFit         = document.getElementById('pdf-fit');

// ── PDF 업로드 (통합 API 경로) ──
$pdfUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('pdf', file);

  try {
    const res = await fetch('/api/video-call/upload-pdf', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) {
      await loadPdf(data.url);
      isSharing = true;
      socket.emit('pdf-share', { url: data.url, currentPage: 1 });
      $pdfStop.classList.remove('hidden');
    }
  } catch (err) {
    console.error('PDF 업로드 실패:', err);
    alert('PDF 업로드에 실패했습니다.');
  }
  e.target.value = '';
});

// ── PDF 로드 ──
async function loadPdf(url) {
  try {
    pdfDoc = await pdfjsLib.getDocument(url).promise;
    pdfTotalPages = pdfDoc.numPages;
    pdfCurrentPage = 1;

    $pdfPlaceholder.classList.add('hidden');
    $pdfCanvas.classList.remove('hidden');
    $pdfNav.classList.remove('hidden');

    await renderPdfPage(pdfCurrentPage);
  } catch (err) {
    console.error('PDF 로드 실패:', err);
  }
}

// ── PDF 페이지 렌더링 ──
async function renderPdfPage(pageNum) {
  if (!pdfDoc) return;
  pageNum = Math.max(1, Math.min(pageNum, pdfTotalPages));
  pdfCurrentPage = pageNum;
  window.currentPdfPage = pageNum;

  const page = await pdfDoc.getPage(pageNum);
  const containerRect = $pdfContainer.getBoundingClientRect();
  const viewport = page.getViewport({ scale: 1 });
  const scaleW = (containerRect.width - 40) / viewport.width;
  const scaleH = (containerRect.height - 20) / viewport.height;
  pdfScale = Math.min(scaleW, scaleH, 2.5);

  const scaledViewport = page.getViewport({ scale: pdfScale });
  $pdfCanvas.width = scaledViewport.width;
  $pdfCanvas.height = scaledViewport.height;

  await page.render({ canvasContext: $pdfCtx, viewport: scaledViewport }).promise;
  $pdfPageInfo.textContent = `${pdfCurrentPage} / ${pdfTotalPages}`;
  $pdfPrev.disabled = pdfCurrentPage <= 1;
  $pdfNext.disabled = pdfCurrentPage >= pdfTotalPages;
}

// ── 페이지 네비게이션 ──
$pdfPrev.addEventListener('click', () => {
  if (pdfCurrentPage > 1) {
    renderPdfPage(pdfCurrentPage - 1);
    if (isSharing) socket.emit('pdf-page-change', pdfCurrentPage);
  }
});

$pdfNext.addEventListener('click', () => {
  if (pdfCurrentPage < pdfTotalPages) {
    renderPdfPage(pdfCurrentPage + 1);
    if (isSharing) socket.emit('pdf-page-change', pdfCurrentPage);
  }
});

document.addEventListener('keydown', (e) => {
  if (!pdfDoc) return;
  const pdfTab = document.getElementById('tab-pdf');
  if (!pdfTab.classList.contains('active')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') $pdfPrev.click();
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') $pdfNext.click();
});

$pdfFit.addEventListener('click', () => { if (pdfDoc) renderPdfPage(pdfCurrentPage); });

// ── 공유 중지 ──
$pdfStop.addEventListener('click', () => {
  stopPdfShare();
  socket.emit('pdf-stop-share');
});

function stopPdfShare() {
  pdfDoc = null; isSharing = false; pdfCurrentPage = 1; pdfTotalPages = 0;
  $pdfCanvas.classList.add('hidden');
  $pdfNav.classList.add('hidden');
  $pdfStop.classList.add('hidden');
  $pdfPlaceholder.classList.remove('hidden');
}

// ── 소켓: PDF 동기화 수신 ──
socket.on('pdf-sync', async (data) => {
  if (data && data.url) {
    await loadPdf(data.url);
    if (data.currentPage) await renderPdfPage(data.currentPage);
    $pdfStop.classList.remove('hidden');
    isSharing = false;
  }
});

socket.on('pdf-page-change', (pageNum) => { if (pdfDoc) renderPdfPage(pageNum); });
socket.on('pdf-stop-share', () => { stopPdfShare(); });
