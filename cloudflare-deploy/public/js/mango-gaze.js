/**
 * mango-gaze.js — MediaPipe FaceLandmarker 기반 시선(집중) 점수 자동 집계
 *
 * 역할
 *  - 로컬 비디오(<video id="vc-local-video">)를 대상으로 3~5fps 로 얼굴 랜드마크를 추출
 *  - 얼굴 변환 행렬(facialTransformationMatrixes) 에서 yaw/pitch 를 구해
 *    "정면 응시" 여부를 판정 → forwardFrames / totalFrames × 100 = gaze_score
 *  - 10초마다 /api/gaze-score 로 전송, 언로드 시 navigator.sendBeacon 으로 최종 flush
 *
 * 로딩 순서 (index.html)
 *    mango.js → mango-rec.js → mango-attendance.js → mango-gaze.js
 *    mango.js 의 MangoV3.userId 와 mango-attendance.js 의 body.vc-in-call 신호에 의존.
 *
 * 비활성화
 *    localStorage.setItem('mango_gaze_disabled', '1')  → 완전히 꺼짐
 *    관찰자 모드(vcIsObserver === true) 면 자동 skip
 *
 * 장애 대응
 *    MediaPipe WASM/모델 로드 실패, 카메라 미접속, WebGL 미지원 등은 조용히 비활성화.
 *    (네트워크 제약이 있는 환경에서도 수업 자체는 멈추지 않도록 함.)
 */
(function () {
  'use strict';

  // ── 설정 ────────────────────────────────────────────────
  // 점수 측정 주기: 250ms 마다 1회 감지(=4fps) → 10초에 40 샘플
  const DETECT_INTERVAL_MS = 250;
  // 서버 전송 주기 — 🟢 (2026-07-24 비용절감) 10초 → 30초.
  //   시선 샘플은 아래에서 session_* 누적값으로 보내므로, 전송 주기를 늘려도 최종 점수는 동일하다.
  //   (250ms 감지는 그대로라 정확도 무손실. D1 쓰기만 3배 감소.)
  const REPORT_INTERVAL_MS = 30_000;
  // 최소 샘플 수(미만이면 점수 전송 스킵) — 8 → 4 로 완화.
  // 10초 윈도우에 최소 1초 분량(=4 샘플) 얼굴이 잡혔으면 집계.
  const MIN_SAMPLES_TO_REPORT = 4;
  // 카메라 꺼짐 감지 timeout (ms) — 이 시간 동안 video readyState<2 유지되면
  // /api/gaze-score 에 camera_off=true 신호를 한 번 보내 admin 에서 "—" 원인 구분 가능하게.
  const CAMERA_OFF_SIGNAL_MS = 15_000;
  // 준비 폴링
  const READY_POLL_MS = 500;
  const READY_MAX_WAIT_MS = 30_000;
  // 정면 판정 임계값 (도 단위, 절대값)
  const YAW_THRESHOLD_DEG = 30;   // 좌우
  const PITCH_THRESHOLD_DEG = 25; // 상하

  // MediaPipe 모델 경로 (공개 CDN)
  // 1차: jsdelivr, 2차(폴백): unpkg. 한쪽이 CSP/네트워크에서 막혀도 다른 쪽에서 로드되도록.
  const MEDIAPIPE_BUNDLES = [
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
    'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs'
  ];
  const MEDIAPIPE_WASMS = [
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    'https://unpkg.com/@mediapipe/tasks-vision@0.10.14/wasm'
  ];
  const FACE_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

  // ── 상태 ────────────────────────────────────────────────
  let landmarker = null;
  let detectTimer = null;
  let reportTimer = null;
  let videoEl = null;
  let stopped = true;
  let lastContextKey = null;   // 직전 세션의 room:user (중복 start 방지)
  /* 🧑‍🏫 «역할이 늦게 와서 교사로 밝혀지는» 경우를 잡는 창. 0 이면 더 안 본다(끝이 있는 확인). */
  let roleRecheckUntil = 0;

  // 누적 카운터 (매 보고 후 리셋)
  let totalSamples = 0;
  let forwardSamples = 0;
  // 세션 전체 누적 (최종 flush 시 사용)
  let sessionTotal = 0;
  let sessionForward = 0;

  let lastRoomId = null;
  let lastUserId = null;

  // 카메라 OFF 상태 추적
  let videoReadyStartTs = 0;   // videoEl.readyState>=2 로 바뀐 시점
  let cameraOffSignaledAt = 0; // camera_off=true 마지막 전송 시각 (중복 방지)

  // ── 헬퍼 ────────────────────────────────────────────────
  function log(...args) { console.log('[gaze]', ...args); }
  function warn(...args) { console.warn('[gaze]', ...args); }

  function isDisabled() {
    try { return localStorage.getItem('mango_gaze_disabled') === '1'; } catch (_) { return false; }
  }

  /* 🧑‍🏫 (2026-09-07 사장님 지시) 교사 기기에서는 시선 측정을 하지 않는다.
     ─────────────────────────────────────────────────────────────────
     [왜] 이 지표는 «학생이 집중했나» 를 보려고 만든 것이고, 읽는 쪽이 전부 학생만 본다:
       · 학생 랭킹  — api-admin.ts 의 집계 SQL 이 `AND COALESCE(role,'student') = 'student'`
       · 녹화 추천  — api-mango.ts 가 그 학생(uid)의 행만 조회
     그런데 이 모듈에는 역할 분기가 없어서(참관자만 skip) **교사 기기에서도 똑같이
     250ms마다 MediaPipe 얼굴 추론이 돌고 있었다.** 2026-09-07 실측: 실접속 교사 292행 중
     242행(83%)에 점수가 쌓여 있었고, 그 값을 읽는 곳은 한 곳도 없다 → 순수한 낭비다.
     ⟹ 끄면 «잃는 것이 0» 인 유일한 자리라 여기만 끈다(학생 측정은 그대로).

     [무엇이 줄어드나 — 부풀리지 말 것]
       · CPU/GPU: 4fps 얼굴 랜드마크 추론이 수업 내내 사라진다 ← 이쪽이 실익
       · 트래픽: 수업 중 나가는 것은 30초마다 작은 JSON 하나라 «거의 안 준다».
         대신 캐시가 빈 기기의 첫 수업에서 모델 3.58MB(face_landmarker.task, 실측)와
         MediaPipe wasm 런타임을 안 받는다. ⚠️ wasm 크기는 이 저장소에서 못 쟀다.
       ⛔ 「트래픽이 줄어든다」로 요약하지 말 것 — 매 수업 반복되는 트래픽은 거의 그대로다.

     [판정] 정본 window.vcIsTeacherRole() 하나만 본다.
       ⛔ 이름 휴리스틱을 여기서 다시 만들지 말 것 — 그 함수가 이미 «로그인이 아예 없을 때만»
          이라는 조건까지 들고 있다(idx-main.js).
       ✅ **모르면 «측정한다»** — 여기서 안전한 실패는 «학생 지표를 잃지 않는» 쪽이다.
          (250kbps 상한과 방향이 반대다. 거기는 «교사 송신을 깎지 않는» 쪽이 안전했다.)

     [역할이 늦게 온다] 입장 직후에는 vcIsTeacherRole() 이 아직 false 일 수 있다.
       그래서 시작한 뒤 ROLE_RECHECK_MS 동안만 다시 보고, 교사로 밝혀지면 그 자리에서
       **전송 없이** 멈춘다(모은 샘플도 버린다 — 안 버리면 pagehide 비콘이 교사 점수를 보낸다).
       ⛔ 끝없이 다시 보지 않는다. ⛔ 상주 setInterval 을 새로 만들지 않는다 —
          이미 도는 검출 루프 안에서 «끝이 있는» 확인만 한다.

     [되돌리는 길] localStorage.setItem('mango_gaze_teacher','on')  → 교사도 다시 측정 */
  const GAZE_TEACHER_KEY = 'mango_gaze_teacher';
  const ROLE_RECHECK_MS = 30_000;
  function teacherOptedIn() {
    try { return localStorage.getItem(GAZE_TEACHER_KEY) === 'on'; } catch (_) { return false; }
  }
  function isTeacherDevice() {
    if (teacherOptedIn()) return false;
    try {
      if (typeof window.vcIsTeacherRole === 'function') return !!window.vcIsTeacherRole();
    } catch (_) {}
    return false;                 // 모르면 측정한다(학생 지표를 잃지 않는 쪽)
  }

  // 메인 페이지의 top-level `let` 바인딩 (vcRoomId 등) 은 Global Environment 의
  // DeclarativeRecord 에 공유된다. typeof 로 guard 한 뒤 bare name 으로 읽는다.
  function readVcCtx() {
    const ctx = {};
    try { ctx.roomId   = (typeof vcRoomId   !== 'undefined') ? vcRoomId   : (window.vcRoomId   || null); } catch (_) { ctx.roomId = window.vcRoomId || null; }
    try { ctx.userId   = (typeof vcUserId   !== 'undefined') ? vcUserId   : (window.vcUserId   || null); } catch (_) { ctx.userId = window.vcUserId || null; }
    try { ctx.stream   = (typeof vcLocalStream !== 'undefined') ? vcLocalStream : (window.vcLocalStream || null); } catch (_) { ctx.stream = window.vcLocalStream || null; }
    try { ctx.observer = (typeof vcIsObserver !== 'undefined') ? vcIsObserver : !!window.vcIsObserver; } catch (_) { ctx.observer = !!window.vcIsObserver; }
    if (!ctx.userId && window.MangoV3 && window.MangoV3.userId) ctx.userId = window.MangoV3.userId;
    return ctx;
  }

  // MediaPipe 동적 import — jsdelivr 실패 시 unpkg 로 폴백.
  // 한 CDN 이 CSP/차단돼도 시선 점수가 살아남도록 함.
  async function loadLandmarker() {
    if (landmarker) return landmarker;

    let lastErr = null;
    for (let i = 0; i < MEDIAPIPE_BUNDLES.length; i++) {
      const bundleUrl = MEDIAPIPE_BUNDLES[i];
      const wasmUrl = MEDIAPIPE_WASMS[i];
      try {
        log('MediaPipe 로드 시도:', bundleUrl);
        const vision = await import(bundleUrl);
        const { FaceLandmarker, FilesetResolver } = vision;
        const fileset = await FilesetResolver.forVisionTasks(wasmUrl);
        landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: FACE_MODEL_URL,
            delegate: 'GPU' // WebGL 미지원이면 자동으로 CPU fallback
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: true
        });
        log('MediaPipe 로드 성공 via', new URL(bundleUrl).host);
        return landmarker;
      } catch (e) {
        lastErr = e;
        warn('MediaPipe 로드 실패 @', bundleUrl, e && e.message);
      }
    }
    throw lastErr || new Error('MediaPipe 로드: 모든 CDN 실패');
  }

  // 4x4 column-major transformation matrix → yaw/pitch (도)
  // MediaPipe 는 YXZ Euler (yaw·pitch·roll) 를 쓴다.
  // m 은 16-length Float32Array, column-major: m[col*4 + row]
  //   col 0 (right) : m[0..3]
  //   col 1 (up)    : m[4..7]
  //   col 2 (front) : m[8..11]
  function matrixToYawPitch(m) {
    // yaw   = atan2(m[8], m[10])  → Y 축 회전
    // pitch = asin(-m[9])         → X 축 회전
    const rad2deg = 180 / Math.PI;
    let pitchArg = -m[9];
    if (pitchArg > 1) pitchArg = 1;
    if (pitchArg < -1) pitchArg = -1;
    return {
      yaw:   Math.atan2(m[8], m[10]) * rad2deg,
      pitch: Math.asin(pitchArg) * rad2deg
    };
  }

  function isForward(yaw, pitch) {
    return Math.abs(yaw) <= YAW_THRESHOLD_DEG && Math.abs(pitch) <= PITCH_THRESHOLD_DEG;
  }

  function findLocalVideo() {
    // index.html 기준 내 로컬 비디오 id
    return document.getElementById('vc-local-video') ||
           document.querySelector('#vc-local .video-wrapper video') ||
           document.querySelector('video[data-local="1"]');
  }

  // camera_off 를 서버에 한 번 알려준다 (15초 주기로 중복 방지).
  // admin UI 는 gaze_samples=0 이면 "카메라 OFF" 배지를 띄울 수 있음.
  function signalCameraOffIfNeeded() {
    if (stopped || !lastRoomId || !lastUserId) return;
    const now = Date.now();
    if (now - cameraOffSignaledAt < CAMERA_OFF_SIGNAL_MS) return;
    cameraOffSignaledAt = now;
    try {
      fetch('/api/gaze-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: lastRoomId,
          user_id: lastUserId,
          samples: 0,
          forward_samples: 0,
          session_samples: sessionTotal,
          session_forward_samples: sessionForward,
          session_score: null,
          camera_off: true
        }),
        keepalive: true
      }).catch(() => {});
    } catch (_) {}
  }

  // ── 감지 루프 ──────────────────────────────────────────
  async function detectOnce() {
    if (stopped || !landmarker || !videoEl) return;
    /* 🧑‍🏫 역할이 늦게 와서 «교사» 로 밝혀지면 그 자리에서 멈춘다(위 isTeacherDevice 주석).
       ⚠️ 창이 «끝이 있어야» 한다 — 안 그러면 매 250ms 마다 판정을 계속 부른다. */
    if (roleRecheckUntil && Date.now() < roleRecheckUntil) {
      if (isTeacherDevice()) { abortForTeacher(); return; }
    } else if (roleRecheckUntil) {
      roleRecheckUntil = 0;
    }
    if (videoEl.readyState < 2 || videoEl.paused || videoEl.ended) {
      // 카메라가 오래 꺼져 있으면 서버에 신호
      signalCameraOffIfNeeded();
      videoReadyStartTs = 0;
      return;
    }
    if (videoReadyStartTs === 0) videoReadyStartTs = Date.now();
    const now = performance.now();
    let result;
    try {
      result = landmarker.detectForVideo(videoEl, now);
    } catch (e) {
      // WebGL 손실 등은 루프만 멈추고 다음 tick 에 복구 시도
      return;
    }
    if (!result) return;

    // 얼굴이 안 잡힌 프레임도 전체 샘플로 계산(=정면 아님)
    totalSamples++;
    sessionTotal++;

    const matrices = result.facialTransformationMatrixes;
    if (matrices && matrices.length > 0 && matrices[0].data) {
      const { yaw, pitch } = matrixToYawPitch(matrices[0].data);
      if (isForward(yaw, pitch)) {
        forwardSamples++;
        sessionForward++;
      }
    }
  }

  function startDetectLoop() {
    stopDetectLoop();
    detectTimer = setInterval(detectOnce, DETECT_INTERVAL_MS);
  }
  function stopDetectLoop() {
    if (detectTimer) { clearInterval(detectTimer); detectTimer = null; }
  }

  // ── 서버 전송 ──────────────────────────────────────────
  async function reportTick() {
    if (stopped) return;
    if (!lastRoomId || !lastUserId) return;
    if (totalSamples < MIN_SAMPLES_TO_REPORT) return;
    const payload = {
      room_id: lastRoomId,
      user_id: lastUserId,
      samples: totalSamples,
      forward_samples: forwardSamples,
      gaze_score: Math.round((forwardSamples / totalSamples) * 1000) / 10 // 0.0~100.0
    };
    // 누적 리셋 (서버는 단순 덮어쓰기이므로 세션 누적값을 따로 보냄)
    payload.session_samples = sessionTotal;
    payload.session_forward_samples = sessionForward;
    payload.session_score = sessionTotal > 0
      ? Math.round((sessionForward / sessionTotal) * 1000) / 10
      : null;

    // 리포트 후 단기 윈도우는 리셋
    totalSamples = 0;
    forwardSamples = 0;

    try {
      await fetch('/api/gaze-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      });
    } catch (e) { /* 네트워크 실패는 조용히 무시 */ }
  }

  function sendFinalBeacon() {
    if (!lastRoomId || !lastUserId) return;
    if (sessionTotal === 0) return;
    const payload = {
      room_id: lastRoomId,
      user_id: lastUserId,
      samples: totalSamples,
      forward_samples: forwardSamples,
      session_samples: sessionTotal,
      session_forward_samples: sessionForward,
      session_score: Math.round((sessionForward / sessionTotal) * 1000) / 10,
      gaze_score: totalSamples > 0
        ? Math.round((forwardSamples / totalSamples) * 1000) / 10
        : null,
      final: true
    };
    try {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/gaze-score', blob);
    } catch (_) {
      // beacon 미지원 시 keepalive fetch 로 재시도
      try {
        fetch('/api/gaze-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        });
      } catch (__) {}
    }
  }

  // ── 라이프사이클 ───────────────────────────────────────
  /* 교사로 밝혀졌을 때의 정지 — «전송 없이» 멈춘다.
     ⚠️ 모은 샘플을 반드시 0 으로 되돌린다. 안 그러면 pagehide 의 sendFinalBeacon 이
        sessionTotal>0 을 보고 교사 점수를 서버에 보낸다(그 함수의 유일한 가드가 그것이다). */
  function abortForTeacher() {
    roleRecheckUntil = 0;
    stopped = true;
    stopDetectLoop();
    if (reportTimer) { clearInterval(reportTimer); reportTimer = null; }
    totalSamples = 0; forwardSamples = 0;
    sessionTotal = 0; sessionForward = 0;
    lastContextKey = null;
    log('역할이 교사로 확인됨 → 시선 측정 중단 (전송 없음)');
  }

  async function start() {
    if (isDisabled()) { log('비활성화됨(localStorage.mango_gaze_disabled=1)'); return; }
    /* 🧑‍🏫 교사 기기는 여기서 끝 — MediaPipe 로드(모델 3.58MB)조차 하지 않는다 */
    if (isTeacherDevice()) { log('교사 기기 → 시선 측정 skip (되돌리기: mango_gaze_teacher=on)'); return; }

    const ctx = readVcCtx();
    if (ctx.observer) { log('관찰자 모드 → skip'); return; }
    if (!ctx.roomId || !ctx.userId) { log('roomId/userId 미준비 → skip'); return; }

    const key = ctx.roomId + ':' + ctx.userId;
    if (!stopped && lastContextKey === key) return; // 이미 같은 세션에서 가동 중
    if (!stopped) await stop(); // 다른 세션으로 전환

    videoEl = findLocalVideo();
    if (!videoEl) { warn('로컬 비디오 element 없음 → skip'); return; }

    // MediaPipe 로드
    try {
      await loadLandmarker();
    } catch (e) {
      warn('MediaPipe 로드 실패 → 시선 점수 비활성', e && e.message);
      landmarker = null;
      return;
    }

    lastRoomId = ctx.roomId;
    lastUserId = ctx.userId;
    lastContextKey = key;
    totalSamples = 0;
    forwardSamples = 0;
    sessionTotal = 0;
    sessionForward = 0;
    stopped = false;
    roleRecheckUntil = Date.now() + ROLE_RECHECK_MS;   // 늦게 오는 역할을 이 창 동안만 다시 본다

    startDetectLoop();
    reportTimer = setInterval(reportTick, REPORT_INTERVAL_MS);
    log('시선 점수 집계 시작', { room: lastRoomId, user: lastUserId });
  }

  async function stop() {
    if (stopped) return;
    stopped = true;
    roleRecheckUntil = 0;
    stopDetectLoop();
    if (reportTimer) { clearInterval(reportTimer); reportTimer = null; }
    // 마지막 구간 + 세션 총계 전송
    sendFinalBeacon();
    lastContextKey = null;
    log('시선 점수 집계 종료');
  }

  // ── 트리거: mango-attendance 와 동일 신호 (body.vc-in-call) ─
  async function waitReadyAndStart() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < READY_MAX_WAIT_MS) {
      const ctx = readVcCtx();
      if (ctx.roomId && ctx.userId && !ctx.observer) {
        // 비디오가 DOM 에 붙은 상태인지 확인
        if (findLocalVideo()) {
          await start();
          return;
        }
      }
      await new Promise(r => setTimeout(r, READY_POLL_MS));
    }
    warn('start 전 대기 타임아웃 — 시선 점수 skip');
  }

  function observeLifecycle() {
    const body = document.body;
    if (!body) return;
    // 초기 상태가 이미 vc-in-call 이면 즉시 시작
    if (body.classList.contains('vc-in-call')) {
      waitReadyAndStart();
    }
    const mo = new MutationObserver(() => {
      const inCall = body.classList.contains('vc-in-call');
      if (inCall && stopped) {
        waitReadyAndStart();
      } else if (!inCall && !stopped) {
        stop();
      }
    });
    mo.observe(body, { attributes: true, attributeFilter: ['class'] });
  }

  // 언로드 안전망
  window.addEventListener('pagehide', () => { sendFinalBeacon(); }, { capture: true });
  window.addEventListener('beforeunload', () => { sendFinalBeacon(); }, { capture: true });

  // DOM 준비 후 옵저버 장착
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeLifecycle);
  } else {
    observeLifecycle();
  }

  // 외부 수동 제어
  window.MangoGaze = {
    start, stop,
    status() {
      return {
        running: !stopped,
        roomId: lastRoomId,
        userId: lastUserId,
        totalSamples, forwardSamples,
        sessionTotal, sessionForward,
        sessionScore: sessionTotal > 0
          ? Math.round((sessionForward / sessionTotal) * 1000) / 10
          : null
      };
    }
  };
})();
