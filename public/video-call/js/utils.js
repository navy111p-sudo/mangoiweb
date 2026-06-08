/**
 * utils.js – 화상통화+ 클라이언트 공용 유틸리티
 * (다른 스크립트보다 먼저 로드되어야 함)
 */

// HTML 이스케이프: textContent 경유로 안전하게 변환
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text == null ? '' : String(text);
  return div.innerHTML;
}
