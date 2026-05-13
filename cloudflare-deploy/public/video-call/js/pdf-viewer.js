/**
 * pdf-viewer.js – 교재(PDF/JPEG/PNG) 업로드 + 렌더링 + 페이지 동기화 (Native WebSocket)
 *
 * 지원 포맷:
 *   - PDF → PDF.js로 페이지별 렌더링
 *   - JPEG/PNG → <img> 엘리먼트로 표시 (단일 이미지 공유)
 *
 * 서버 엔드포인트: /api/video-call/upload-pdf (파일 종류 자동 감지)
 *   응답: { success, url, mimeType, kind: 'pdf' | 'image' }
 */
let pdfDoc = null;
let pdfCurrentPage = 1;
let pdfTotalPages = 0;
let pdfScale = 1.5;
let isSharing = false;
let currentKind = null; // 'pdf' | 'image'

// 재사용 가능한 DOM 참조
const $uploadPdf   = document.getElementById('material-upload-pdf');
const $uploadJpeg  = document.getElementById('material-upload-jpeg');
const $uploadPng   = document.getElementById('material-upload-png');
const $pdfCanvas   = document.getElementById('pdf-canvas');
const $pdfCtx      = $pdfCanvas.getContext('2d');
const $pdfPrev     = document.getElementById('pdf-prev');
const $pdfNext     = document.getElementById('pdf-next');
const $pdfPageInfo = document.getElementById('pdf-page-info');
const $pdfNav      = document.getElementById('pdf-nav');
const $materialStop = document.getElementById('material-stop');
const $pdfPlaceholder = document.getElementById('pdf-placeholder');
const $pdfContainer   = document.getElementById('pdf-container');
const $pdfFit         = document.getElementById('pdf-fit');
const $materialImage  = document.getElementById('material-image');

// ── 공통 업로드 처리 ──
async function uploadMaterial(file) {
  if (!file) return;

  const formData = new FormData();
  // 서버가 'pdf' key를 읽음(이미지도 동일 파라미터명 사용)
  formData.append('pdf', file);

  try {
    const res = await fetch('/api/video-call/upload-pdf', { method: 'POST', body: formData });
    const data = await res.json();
    if (!data.success) {
      console.error('업로드 실패:', data);
      alert('업로드에 실패했습니다: ' + (data.error || '알 수 없는 오류'));
      return;
    }
    const kind = data.kind || guessKindByMime(data.mimeType, file.name);
    if (kind === 'pdf') {
      await loadPdf(data.url);
      sendWsMessage({ type: 'pdf-share', data: { url: data.url, kind: 'pdf', currentPage: 1 } });
    } else {
      await loadImage(data.url);
      sendWsMessage({ type: 'pdf-share', data: { url: data.url, kind: 'image' } });
    }
    isSharing = true;
    $materialStop.classList.remove('hidden');
  } catch (err) {
    console.error('교재 업로드 실패:', err);
    alert('교재 업로드에 실패했습니다.');
  }
}

function guessKindByMime(mime, name) {
  if (!mime && name) {
    const lower = name.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image';
    if (lower.endsWith('.png')) return 'image';
  }
  if (mime === 'application/pdf') return 'pdf';
  if (mime && mime.startsWith('image/')) return 'image';
  return 'pdf';
}

// 업로드 버튼별 핸들러
[$uploadPdf, $uploadJpeg, $uploadPng].forEach((inp) => {
  if (!inp) return;
  inp.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadMaterial(file);
    e.target.value = '';
  });
});

// ── PDF 로드 ──
async function loadPdf(url) {
  try {
    currentKind = 'pdf';
    pdfDoc = await pdfjsLib.getDocument(url).promise;
    pdfTotalPages = pdfDoc.numPages;
    pdfCurrentPage = 1;

    $pdfPlaceholder.classList.add('hidden');
    $materialImage.classList.add('hidden');
    $pdfCanvas.classList.remove('hidden');
    $pdfNav.classList.remove('hidden');

    await renderPdfPage(pdfCurrentPage);
  } catch (err) {
    console.error('PDF 로드 실패:', err);
    alert('PDF 로드에 실패했습니다.');
  }
}

// ── 이미지 로드 (JPEG/PNG) ──
async function loadImage(url) {
  currentKind = 'image';
  pdfDoc = null;
  pdfTotalPages = 0;
  pdfCurrentPage = 1;

  $pdfPlaceholder.classList.add('hidden');
  $pdfCanvas.classList.add('hidden');
  $pdfNav.classList.add('hidden');
  $materialImage.src = url;
  $materialImage.classList.remove('hidden');
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
  if (currentKind !== 'pdf') return;
  if (pdfCurrentPage > 1) {
    renderPdfPage(pdfCurrentPage - 1);
    if (isSharing) sendWsMessage({ type: 'pdf-page-change', data: { pageNum: pdfCurrentPage } });
  }
});

$pdfNext.addEventListener('click', () => {
  if (currentKind !== 'pdf') return;
  if (pdfCurrentPage < pdfTotalPages) {
    renderPdfPage(pdfCurrentPage + 1);
    if (isSharing) sendWsMessage({ type: 'pdf-page-change', data: { pageNum: pdfCurrentPage } });
  }
});

document.addEventListener('keydown', (e) => {
  if (!pdfDoc) return;
  const materialsTab = document.getElementById('tab-materials');
  if (!materialsTab || !materialsTab.classList.contains('active')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') $pdfPrev.click();
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') $pdfNext.click();
});

$pdfFit.addEventListener('click', () => { if (pdfDoc) renderPdfPage(pdfCurrentPage); });

// ── 공유 중지 ──
$materialStop.addEventListener('click', () => {
  stopPdfShare();
  sendWsMessage({ type: 'pdf-stop-share' });
});

function stopPdfShare() {
  pdfDoc = null;
  isSharing = false;
  pdfCurrentPage = 1;
  pdfTotalPages = 0;
  currentKind = null;
  $pdfCanvas.classList.add('hidden');
  $pdfNav.classList.add('hidden');
  $materialStop.classList.add('hidden');
  $materialImage.classList.add('hidden');
  $materialImage.src = '';
  $pdfPlaceholder.classList.remove('hidden');
}

// ── WebSocket 핸들러 ──
function handlePdfSync(data) {
  if (!data || !data.url) return;
  const kind = data.kind || guessKindByMime(null, data.url);
  if (kind === 'image') {
    loadImage(data.url);
  } else {
    loadPdf(data.url).then(() => {
      if (data.currentPage) return renderPdfPage(data.currentPage);
    });
  }
  $materialStop.classList.remove('hidden');
  isSharing = false;
}

function handlePdfPageChange({ pageNum }) {
  if (pdfDoc) renderPdfPage(pageNum);
}

// 전역 노출 (app.js에서 사용)
window.handlePdfSync = handlePdfSync;
window.handlePdfPageChange = handlePdfPageChange;
window.stopPdfShare = stopPdfShare;
window.renderPdfPage = renderPdfPage;
