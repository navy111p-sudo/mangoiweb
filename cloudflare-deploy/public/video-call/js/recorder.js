/**
 * recorder.js v3 — 자동 녹화 + R2 스트리밍 업로드
 *
 * R2 multipart upload의 최소 파트 크기(5MB)를 준수하기 위해,
 * 5초마다 생성되는 MediaRecorder 청크를 클라이언트에서 5MB까지 버퍼링한 후 업로드.
 * 페이지 이탈 시에도 이미 업로드된 파트는 R2에 보존됨.
 *
 * 엔드포인트:
 *   POST /api/recordings/start          — DB 메타 생성
 *   POST /api/recordings/upload/create   — R2 multipart 시작
 *   PUT  /api/recordings/upload/part     — 파트 업로드 (>=5MB, 마지막 파트 예외)
 *   POST /api/recordings/upload/complete — multipart 마무리
 *   POST /api/recordings/upload/abort    — 비정상 종료 정리
 *   POST /api/recordings/stop            — DB 메타 종료 (폴백)
 */

var _mediaRecorder = null;
var _recordingStream = null;
var _recordingStartedAt = 0;
var _recordingMime = '';
var _recordingId = null;

// R2 multipart 상태
var _r2Key = null;
var _r2UploadId = null;
var _r2Parts = [];
var _r2PartNumber = 0;
var _r2TotalBytes = 0;
var _r2UploadQueue = Promise.resolve();
var _r2InitDone = false;

// 청크 버퍼 (5MB 이상 모이면 하나의 파트로 업로드)
var _chunkBuffer = [];
var _chunkBufferSize = 0;
var MIN_PART_SIZE = 5 * 1024 * 1024; // 5MB — R2 multipart 최소 크기

// 녹화 상태 배지
var _recBadge = null;
var _recTimer = null;

var RECORDING_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm',
  'video/mp4'
];

function pickSupportedMime() {
  for (var i = 0; i < RECORDING_MIME_CANDIDATES.length; i++) {
    var m = RECORDING_MIME_CANDIDATES[i];
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function startRecording(options) {
  options = options || {};
  if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
    console.warn('[recorder] 이미 녹화 중입니다.');
    return false;
  }

  var stream = options.stream || (typeof localStream !== 'undefined' ? localStream : null);
  if (!stream || stream.getTracks().length === 0) {
    console.error('[recorder] 녹화할 스트림이 없습니다.');
    return false;
  }

  var mimeType = pickSupportedMime();
  if (!mimeType) {
    console.error('[recorder] MediaRecorder를 지원하지 않습니다.');
    return false;
  }

  _initAndStart(stream, mimeType, options);
  return true;
}

async function _initAndStart(stream, mimeType, options) {
  var rid = (typeof roomId !== 'undefined' && roomId) ? roomId : 'default';
  var uname = (typeof username !== 'undefined' && username) ? username : '';

  try {
    // 1) DB에 녹화 메타 생성
    var startRes = await fetch('/api/recordings/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: rid,
        teacher_id: uname || rid,
        teacher_name: uname,
        participant_ids: [],
        participant_names: []
      })
    }).then(function(r) { return r.json(); });

    if (!startRes.ok) {
      console.error('[recorder] 녹화 메타 생성 실패:', startRes);
      return;
    }
    _recordingId = startRes.recording_id;
    console.log('[recorder] DB 메타 생성 완료, recording_id:', _recordingId);

    // 2) R2 multipart 업로드 시작
    var createRes = await fetch('/api/recordings/upload/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recording_id: _recordingId,
        room_id: rid
      })
    }).then(function(r) { return r.json(); });

    if (!createRes.ok) {
      console.error('[recorder] R2 multipart 생성 실패:', createRes);
      _callStop(_recordingId, 0, 0, 'R2_CREATE_FAIL');
      _recordingId = null;
      return;
    }
    _r2Key = createRes.key;
    _r2UploadId = createRes.upload_id;
    _r2Parts = [];
    _r2PartNumber = 0;
    _r2TotalBytes = 0;
    _r2UploadQueue = Promise.resolve();
    _r2InitDone = true;
    _chunkBuffer = [];
    _chunkBufferSize = 0;
    console.log('[recorder] R2 multipart 시작:', { key: _r2Key, uploadId: _r2UploadId });

    // 3) MediaRecorder 시작
    _mediaRecorder = new MediaRecorder(stream, {
      mimeType: mimeType,
      videoBitsPerSecond: options.videoBitsPerSecond || 2500000,
      audioBitsPerSecond: options.audioBitsPerSecond || 128000
    });
    _recordingStream = stream;
    _recordingStartedAt = Date.now();
    _recordingMime = mimeType;

    _mediaRecorder.ondataavailable = function(e) {
      if (e.data && e.data.size > 0) {
        _bufferChunk(e.data);
      }
    };
    _mediaRecorder.onerror = function(e) {
      console.error('[recorder] MediaRecorder 에러:', e);
    };

    // 5초마다 청크 생성 → ondataavailable → 버퍼링 → 5MB 이상이면 업로드
    _mediaRecorder.start(options.timeslice || 5000);

    // beforeunload 등록 (탭 종료 시 sendBeacon으로 complete/abort 전송)
    window.addEventListener('beforeunload', _onBeforeUnload);

    console.log('[recorder] 녹화 시작', { recordingId: _recordingId, mime: mimeType });
    _showRecBadge();
    _dispatch('recording:started', { mimeType: mimeType, recordingId: _recordingId });
  } catch (err) {
    console.error('[recorder] 초기화 실패:', err);
  }
}

/**
 * MediaRecorder 청크를 버퍼에 추가.
 * 버퍼가 5MB 이상이면 하나의 R2 파트로 업로드.
 */
function _bufferChunk(blob) {
  if (!_r2InitDone) return;
  _chunkBuffer.push(blob);
  _chunkBufferSize += blob.size;

  if (_chunkBufferSize >= MIN_PART_SIZE) {
    _flushBuffer();
  }
}

/**
 * 버퍼를 하나의 Blob으로 합쳐서 R2 파트로 업로드
 */
function _flushBuffer() {
  if (_chunkBuffer.length === 0) return;
  var combined = new Blob(_chunkBuffer, { type: _recordingMime.split(';')[0] || 'video/webm' });
  _chunkBuffer = [];
  _chunkBufferSize = 0;
  _enqueuePart(combined);
}

/**
 * 하나의 파트를 직렬 큐에 넣어 순서대로 R2에 업로드
 */
function _enqueuePart(blob) {
  if (!_r2InitDone || !_r2Key || !_r2UploadId) {
    console.warn('[recorder] R2 미초기화, 파트 무시');
    return;
  }
  _r2PartNumber += 1;
  var pn = _r2PartNumber;
  _r2TotalBytes += blob.size;

  _r2UploadQueue = _r2UploadQueue.then(async function() {
    var url = '/api/recordings/upload/part?key=' + encodeURIComponent(_r2Key) +
              '&upload_id=' + encodeURIComponent(_r2UploadId) +
              '&part=' + pn;
    try {
      var res = await fetch(url, { method: 'PUT', body: blob });
      if (!res.ok) {
        console.error('[recorder] 파트 업로드 실패:', pn, res.status);
        return;
      }
      var data = await res.json();
      _r2Parts.push({ partNumber: pn, etag: data.etag });
      console.log('[recorder] 파트 업로드 완료:', pn, '크기:', (blob.size / 1048576).toFixed(1) + 'MB', '누적:', (_r2TotalBytes / 1048576).toFixed(1) + 'MB');
    } catch (err) {
      console.error('[recorder] 파트 업로드 에러:', pn, err);
    }
  });
}

/**
 * 녹화 중지 — MediaRecorder 정지 → 잔여 버퍼 flush → 큐 대기 → R2 complete → DB 업데이트
 */
function stopRecording() {
  return new Promise(function(resolve) {
    if (!_mediaRecorder || _mediaRecorder.state === 'inactive') {
      resolve({ success: false, error: '녹화 중이 아닙니다.' });
      return;
    }

    var savedRecordingId = _recordingId;
    var savedStartedAt = _recordingStartedAt;
    var savedKey = _r2Key;
    var savedUploadId = _r2UploadId;

    _mediaRecorder.onstop = async function() {
      var durationMs = Date.now() - savedStartedAt;
      console.log('[recorder] MediaRecorder 정지. 잔여 버퍼 flush 중...');

      // 남은 버퍼 flush (마지막 파트는 5MB 미만 OK)
      if (_chunkBuffer.length > 0) {
        var lastBlob = new Blob(_chunkBuffer, { type: _recordingMime.split(';')[0] || 'video/webm' });
        _chunkBuffer = [];
        _chunkBufferSize = 0;
        _enqueuePart(lastBlob);
      }

      // 큐에 쌓인 모든 파트 업로드 완료 대기
      try {
        await _r2UploadQueue;
      } catch (e) {
        console.warn('[recorder] 큐 대기 중 에러:', e);
      }

      console.log('[recorder] 업로드 큐 완료. 파트 수:', _r2Parts.length, '총 크기:', (_r2TotalBytes / 1048576).toFixed(1) + 'MB');

      // R2 multipart complete
      if (_r2Parts.length > 0 && savedKey && savedUploadId) {
        try {
          _r2Parts.sort(function(a, b) { return a.partNumber - b.partNumber; });

          var completeRes = await fetch('/api/recordings/upload/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recording_id: savedRecordingId,
              key: savedKey,
              upload_id: savedUploadId,
              parts: _r2Parts,
              duration_ms: durationMs,
              size_bytes: _r2TotalBytes
            })
          }).then(function(r) { return r.json(); });

          console.log('[recorder] R2 complete 결과:', completeRes);

          if (completeRes.ok) {
            // DB 종료 메타 업데이트
            await fetch('/api/recordings/stop', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recording_id: savedRecordingId,
                duration_ms: durationMs,
                size_bytes: _r2TotalBytes
              })
            });

            _dispatch('recording:uploaded', {
              success: true,
              key: savedKey,
              recordingId: savedRecordingId,
              size: _r2TotalBytes,
              durationMs: durationMs
            });
            resolve({ success: true, key: savedKey, recordingId: savedRecordingId, size: _r2TotalBytes });
          } else {
            console.error('[recorder] R2 complete 실패:', completeRes);
            _callStop(savedRecordingId, durationMs, _r2TotalBytes, 'COMPLETE_FAIL:' + JSON.stringify(completeRes));
            resolve({ success: false, error: 'R2 complete failed' });
          }
        } catch (err) {
          console.error('[recorder] R2 complete 에러:', err);
          _callStop(savedRecordingId, durationMs, _r2TotalBytes, 'COMPLETE_ERR:' + (err.message || err));
          resolve({ success: false, error: err.message });
        }
      } else {
        // 파트가 없는 경우 (아주 짧은 녹화) — 버퍼의 데이터를 단일 업로드로 시도
        console.warn('[recorder] 업로드된 파트 없음. 단일 업로드 시도...');
        _callStop(savedRecordingId, durationMs, 0, 'NO_PARTS');
        resolve({ success: false, error: 'No parts uploaded' });
      }

      // 상태 정리
      _resetState();
    };

    // MediaRecorder 정지 (마지막 dataavailable 이벤트 발생 후 onstop)
    try {
      _mediaRecorder.stop();
    } catch (e) {
      console.warn('[recorder] stop 에러:', e);
      _resetState();
      resolve({ success: false, error: e.message });
    }
  });
}

/**
 * beforeunload 핸들러 — sendBeacon으로 complete 또는 abort 전송
 * sendBeacon은 페이지 언로드 중에도 전송을 보장함
 */
function _onBeforeUnload() {
  if (!_r2Key || !_r2UploadId || !_recordingId) return;

  // 파트가 업로드된 게 있으면 complete 시도
  if (_r2Parts.length > 0) {
    try {
      _r2Parts.sort(function(a, b) { return a.partNumber - b.partNumber; });
      navigator.sendBeacon('/api/recordings/upload/complete',
        new Blob([JSON.stringify({
          recording_id: _recordingId,
          key: _r2Key,
          upload_id: _r2UploadId,
          parts: _r2Parts,
          duration_ms: Date.now() - _recordingStartedAt,
          size_bytes: _r2TotalBytes
        })], { type: 'application/json' })
      );
      console.log('[recorder] sendBeacon: complete 전송');
    } catch (e) {
      // complete 실패 시 abort
      try {
        navigator.sendBeacon('/api/recordings/upload/abort',
          new Blob([JSON.stringify({
            recording_id: _recordingId,
            key: _r2Key,
            upload_id: _r2UploadId
          })], { type: 'application/json' })
        );
      } catch (_) {}
    }
  } else {
    // 파트 없으면 abort
    try {
      navigator.sendBeacon('/api/recordings/upload/abort',
        new Blob([JSON.stringify({
          recording_id: _recordingId,
          key: _r2Key,
          upload_id: _r2UploadId
        })], { type: 'application/json' })
      );
    } catch (_) {}
  }
}

/**
 * DB 종료 처리 (업로드 실패 시 폴백) — 에러 원인도 DB에 기록
 */
function _callStop(recId, durationMs, sizeBytes, errorInfo) {
  if (!recId) return;
  fetch('/api/recordings/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recording_id: recId,
      duration_ms: durationMs || 0,
      size_bytes: sizeBytes || 0,
      file_url: 'CLIENT_ERR:' + (errorInfo || 'unknown'),
      storage: 'error'
    })
  }).catch(function(e) { console.error('[recorder] stop 폴백 실패:', e); });
}

/**
 * 내부 상태 초기화
 */
function _resetState() {
  window.removeEventListener('beforeunload', _onBeforeUnload);
  _mediaRecorder = null;
  _recordingId = null;
  _r2Key = null;
  _r2UploadId = null;
  _r2Parts = [];
  _r2PartNumber = 0;
  _r2TotalBytes = 0;
  _r2UploadQueue = Promise.resolve();
  _r2InitDone = false;
  _chunkBuffer = [];
  _chunkBufferSize = 0;
  _hideRecBadge();
}

/**
 * 녹화 상태 배지 표시 — 최소화 버전 (뒤에 있는 버튼/기능이 보이도록)
 * - 기본: 작고 반투명한 빨간 점만 표시 (호버 시 REC + 시간 표시)
 * - 클릭 시: 최소화 ↔ 확장 토글 가능
 * 실제 스타일은 style.css의 #rec-badge 규칙이 담당.
 */
function _showRecBadge() {
  if (_recBadge) return;
  _recBadge = document.createElement('div');
  _recBadge.id = 'rec-badge';
  _recBadge.classList.add('rec-min'); // 기본은 최소화 상태
  _recBadge.title = '녹화 중 (클릭하여 확장/최소화)';
  _recBadge.innerHTML = '<span class="rec-dot"></span><span class="rec-text" id="rec-time">REC 00:00</span>';
  document.body.appendChild(_recBadge);

  // 클릭 시 최소화/확장 토글
  _recBadge.addEventListener('click', function(ev) {
    ev.stopPropagation();
    _recBadge.classList.toggle('rec-min');
  });

  _recTimer = setInterval(function() {
    var t = document.getElementById('rec-time');
    if (!t || !_recordingStartedAt) return;
    var elapsed = Math.floor((Date.now() - _recordingStartedAt) / 1000);
    var mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    var ss = String(elapsed % 60).padStart(2, '0');
    t.textContent = 'REC ' + mm + ':' + ss;
  }, 1000);
}

function _hideRecBadge() {
  if (_recBadge) { _recBadge.remove(); _recBadge = null; }
  if (_recTimer) { clearInterval(_recTimer); _recTimer = null; }
}

function pauseRecording() {
  if (_mediaRecorder && _mediaRecorder.state === 'recording') { _mediaRecorder.pause(); _dispatch('recording:paused'); return true; }
  return false;
}
function resumeRecording() {
  if (_mediaRecorder && _mediaRecorder.state === 'paused') { _mediaRecorder.resume(); _dispatch('recording:resumed'); return true; }
  return false;
}
function isRecording() { return !!_mediaRecorder && _mediaRecorder.state !== 'inactive'; }
function getRecordingStream() { return _recordingStream; }
function _dispatch(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (_) {} }

// 전역 함수 노출
window.startRecording = startRecording;
window.stopRecording = stopRecording;
window.pauseRecording = pauseRecording;
window.resumeRecording = resumeRecording;
window.isRecording = isRecording;
window.getRecordingStream = getRecordingStream;
