/**
 * whiteboard.js – Canvas API 기반 실시간 칠판 (Native WebSocket)
 * 도구: 펜, 지우개, 직선, 사각형, 원
 */
let wbCanvas, wbCtx;
let wbDrawing = false;
let wbTool = 'pen';
let wbColor = '#000000';
let wbSize = 3;
let wbStartX, wbStartY;
let wbSnapshot = null;

function initWhiteboard() {
  wbCanvas = document.getElementById('whiteboard-canvas');
  wbCtx = wbCanvas.getContext('2d');
  resizeWhiteboard();

  // ── 마우스 이벤트 ──
  wbCanvas.addEventListener('mousedown', wbMouseDown);
  wbCanvas.addEventListener('mousemove', wbMouseMove);
  wbCanvas.addEventListener('mouseup', wbMouseUp);
  wbCanvas.addEventListener('mouseleave', wbMouseUp);

  // ── 터치 이벤트 ──
  wbCanvas.addEventListener('touchstart', wbTouchStart, { passive: false });
  wbCanvas.addEventListener('touchmove', wbTouchMove, { passive: false });
  wbCanvas.addEventListener('touchend', wbMouseUp);

  // ── 도구 선택 ──
  document.querySelectorAll('.wb-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.wb-tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      wbTool = btn.dataset.tool;
      wbCanvas.style.cursor = wbTool === 'eraser' ? 'cell' : 'crosshair';
    });
  });

  // ── 색상 & 굵기 ──
  document.getElementById('wb-color').addEventListener('input', (e) => { wbColor = e.target.value; });
  document.getElementById('wb-size').addEventListener('input', (e) => {
    wbSize = parseInt(e.target.value);
    document.getElementById('wb-size-label').textContent = wbSize + 'px';
  });

  // ── 전체 지우기 ──
  document.getElementById('wb-clear').addEventListener('click', () => {
    wbCtx.fillStyle = '#ffffff';
    wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
    sendWsMessage({ type: 'whiteboard-clear' });
  });

  // ── 이미지 저장 ──
  document.getElementById('wb-save').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `칠판_${new Date().toLocaleString('ko')}.png`;
    link.href = wbCanvas.toDataURL();
    link.click();
  });
}

function resizeWhiteboard() {
  if (!wbCanvas) return;
  const container = wbCanvas.parentElement;
  const prevData = wbCtx ? wbCanvas.toDataURL() : null;

  wbCanvas.width = container.clientWidth;
  wbCanvas.height = container.clientHeight;

  // 배경 흰색
  wbCtx.fillStyle = '#ffffff';
  wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);

  // 이전 내용 복원
  if (prevData) {
    const img = new Image();
    img.onload = () => wbCtx.drawImage(img, 0, 0);
    img.src = prevData;
  }
}

function getPos(e) {
  const rect = wbCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (wbCanvas.width / rect.width),
    y: (e.clientY - rect.top) * (wbCanvas.height / rect.height)
  };
}

function wbMouseDown(e) {
  wbDrawing = true;
  const pos = getPos(e);
  wbStartX = pos.x;
  wbStartY = pos.y;

  if (wbTool === 'pen' || wbTool === 'eraser') {
    wbCtx.beginPath();
    wbCtx.moveTo(pos.x, pos.y);
  } else {
    wbSnapshot = wbCtx.getImageData(0, 0, wbCanvas.width, wbCanvas.height);
  }
}

function wbMouseMove(e) {
  if (!wbDrawing) return;
  const pos = getPos(e);

  if (wbTool === 'pen' || wbTool === 'eraser') {
    drawLine(wbStartX, wbStartY, pos.x, pos.y, wbTool === 'eraser' ? '#ffffff' : wbColor, wbTool === 'eraser' ? wbSize * 4 : wbSize);
    sendWsMessage({ type: 'whiteboard-draw', data: {
      type: 'line',
      x1: wbStartX / wbCanvas.width,
      y1: wbStartY / wbCanvas.height,
      x2: pos.x / wbCanvas.width,
      y2: pos.y / wbCanvas.height,
      color: wbTool === 'eraser' ? '#ffffff' : wbColor,
      size: wbTool === 'eraser' ? wbSize * 4 : wbSize
    } });
    wbStartX = pos.x;
    wbStartY = pos.y;
  } else {
    wbCtx.putImageData(wbSnapshot, 0, 0);
    drawShape(wbTool, wbStartX, wbStartY, pos.x, pos.y, wbColor, wbSize);
  }
}

function wbMouseUp(e) {
  if (!wbDrawing) return;
  wbDrawing = false;

  if (wbTool !== 'pen' && wbTool !== 'eraser' && e && e.clientX !== undefined) {
    const pos = getPos(e);
    sendWsMessage({ type: 'whiteboard-draw', data: {
      type: wbTool,
      x1: wbStartX / wbCanvas.width,
      y1: wbStartY / wbCanvas.height,
      x2: pos.x / wbCanvas.width,
      y2: pos.y / wbCanvas.height,
      color: wbColor,
      size: wbSize
    } });
  }
  wbSnapshot = null;
}

function wbTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY });
  wbCanvas.dispatchEvent(mouseEvent);
}

function wbTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY });
  wbCanvas.dispatchEvent(mouseEvent);
}

function drawLine(x1, y1, x2, y2, color, size) {
  wbCtx.strokeStyle = color;
  wbCtx.lineWidth = size;
  wbCtx.lineCap = 'round';
  wbCtx.lineJoin = 'round';
  wbCtx.beginPath();
  wbCtx.moveTo(x1, y1);
  wbCtx.lineTo(x2, y2);
  wbCtx.stroke();
}

function drawShape(type, x1, y1, x2, y2, color, size) {
  wbCtx.strokeStyle = color;
  wbCtx.lineWidth = size;
  wbCtx.lineCap = 'round';

  switch (type) {
    case 'line':
      wbCtx.beginPath();
      wbCtx.moveTo(x1, y1);
      wbCtx.lineTo(x2, y2);
      wbCtx.stroke();
      break;
    case 'rect':
      wbCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      break;
    case 'circle':
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      wbCtx.beginPath();
      wbCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      wbCtx.stroke();
      break;
  }
}

function drawRemote(data) {
  const w = wbCanvas.width;
  const h = wbCanvas.height;
  const x1 = data.x1 * w;
  const y1 = data.y1 * h;
  const x2 = data.x2 * w;
  const y2 = data.y2 * h;

  if (data.type === 'line') {
    drawLine(x1, y1, x2, y2, data.color, data.size);
  } else {
    drawShape(data.type, x1, y1, x2, y2, data.color, data.size);
  }
}

function handleWhiteboardClear() {
  wbCtx.fillStyle = '#ffffff';
  wbCtx.fillRect(0, 0, wbCanvas.width, wbCanvas.height);
}
