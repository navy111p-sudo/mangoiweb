/**
 * mango-attendance.js — WebRTC 수업 중 출석 자동 등록 + 발화시간 자동 집계
 *
 * 왜 필요한가?
 *   관리자 대시보드(admin.html)의 "말하기 점수" 는 D1 의 attendance 테이블에서
 *     (total_active_ms / total_session_ms) * 100 을 평균내어 계산한다.
 *   그런데 기존 프론트엔드(index.html, video-call/*.js) 어디에서도
 *   /api/attendance/* 엔드포인트를 호출하지 않아 attendance 행이 비어 있었고,
 *   그 결과 모든 녹화의 말하기 점수가 NULL 로 표시되었다.
 *
 * 동작 개요
 *   1. body.vc-in-call 클래스가 켜지면 추적 시작
 *      (index.html 의 vcJoinRoom / vcLeaveRoom 이 이 클래스를 토글)
 *   2. 로컬 오디오 트랙에 AnalyserNode 연결 → 200ms 간격으로 RMS 측정
 *      음성 임계값을 넘고 마이크가 켜져 있으면 active_ms 누적, 세션 전체는 session_ms 에 누적
 *   3. 10초마다 /api/speaking-time 로 누적 ms 전송 (+ /api/attendance/heartbeat 로 KV ping)
 *   4. 수업 종료/페이지 언로드 시 /api/attendance/leave 로 최종 ms 확정 (sendBeacon 우선)
 *
 * 주의
 *   - 관찰자 모드(vcIsObserver === true)는 추적하지 않음
 *   - localStorage 에 mango_role 이 'teacher' 로 저장되어 있으면 교사로 join, 아니면 'student'
 *   - 오디오 임계값(VOICE_THRESHOLD) 은 Web Audio getByteFrequencyData 기준 (0~255)
 */
(function () {
  if (window.MangoAttendance) return;

  // --- 설정값 --------------------------------------------------------------
  const HEARTBEAT_INTERVAL_MS = 10_000;   // 10초마다 서버에 누적 ms 전송
  const TICK_INTERVAL_MS      = 200;      // 200ms 주기 오디오 샘플링
  // 평균 주파수 크기(0~255)가 이 이상이면 발화 중.
  // 과거 20 → 실제 수업에서 말하는데도 0.0% 로 나오는 케이스가 관측돼 10 으로 완화.
  // (너무 낮추면 배경 소음까지 잡히므로 10 이 환경 잡음 대비 적정치)
  const VOICE_THRESHOLD       = 10;
  const READY_POLL_MS         = 500;      // vc-in-call 이후 stream 준비 폴링 간격
  const READY_MAX_WAIT_MS     = 30_000;   // stream 이 안 오면 30초 후 포기

  // --- 내부 상태 -----------------------------------------------------------
  let state = null;   // 추적 중이면 객체, 아니면 null

  // --- 유틸 ----------------------------------------------------------------
  function nowMs() { return Date.now(); }

  /**
   * index.html 의 inline <script> 에서 선언된 let vcRoomId / vcUserId / ...
   * 는 동일 realm 의 Global Environment Record · DeclarativeRecord 에 들어가
   * 이후 로드되는 classic script 에서도 bare name 으로 접근 가능하다.
   * 단, CSP 또는 번들링 변화에 대비해 typeof 가드 + window.* 폴백을 함께 둔다.
   * (eval 은 unsafe-eval 금지 정책에서 막힐 수 있어 사용하지 않음.)
   */
  function getVcCtx() {
    const ctx = { roomId: '', userId: '', username: '', stream: null, isObserver: false };
    try { ctx.roomId     = (typeof vcRoomId      !== 'undefined') ? vcRoomId      : window.vcRoomId; }      catch (_) { ctx.roomId     = window.vcRoomId; }
    try { ctx.userId     = (typeof vcUserId      !== 'undefined') ? vcUserId      : window.vcUserId; }      catch (_) { ctx.userId     = window.vcUserId; }
    try { ctx.username   = (typeof vcUsername    !== 'undefined') ? vcUsername    : window.vcUsername; }    catch (_) { ctx.username   = window.vcUsername; }
    try { ctx.stream     = (typeof vcLocalStream !== 'undefined') ? vcLocalStream : window.vcLocalStream; } catch (_) { ctx.stream     = window.vcLocalStream; }
    try { ctx.isObserver = (typeof vcIsObserver  !== 'undefined') ? vcIsObserver  : window.vcIsObserver; }  catch (_) { ctx.isObserver = window.vcIsObserver; }
    return ctx;
  }

  async function apiPost(path, body, opts) {
    opts = opts || {};
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        keepalive: !!opts.keepalive,    // 언로드 시에도 전송되게
        body: JSON.stringify(body)
      });
      return res.ok;
    } catch (e) {
      if (!opts.silent) console.warn('[attendance] POST', path, '실패:', e);
      return false;
    }
  }

  function sendBeaconJson(path, body) {
    try {
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
        return navigator.sendBeacon(path, blob);
      }
    } catch (_) { /* noop */ }
    return false;
  }

  // --- 오디오 분석 ---------------------------------------------------------
  function setupAudioAnalysis(stream) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !stream || stream.getAudioTracks().length === 0) return null;
      const ctx = new AC();
      const tryResume = () => {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      };
      // 즉시 시도 + 사용자 제스처(클릭/터치/키입력)에서 재시도
      // → Chrome autoplay 정책으로 입장 직후 suspended 로 남는 문제 방지
      tryResume();
      const gestureEvents = ['click', 'touchstart', 'keydown', 'pointerdown'];
      const unlock = () => {
        tryResume();
        if (ctx.state === 'running') {
          gestureEvents.forEach(e => window.removeEventListener(e, unlock, true));
        }
      };
      gestureEvents.forEach(e => window.addEventListener(e, unlock, { capture: true, passive: true }));

      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      src.connect(analyser);
      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      return { ctx, analyser, dataArr };
    } catch (e) {
      console.warn('[attendance] 오디오 분석 설정 실패:', e);
      return null;
    }
  }

  function tick() {
    if (!state) return;
    const now = nowMs();
    const delta = now - state.lastTickTs;
    state.lastTickTs = now;
    if (delta <= 0 || delta > 5000) return;  // 탭 백그라운드로 인한 큰 간격은 버림(세션 시간 과장 방지)

    state.sessionMs += delta;

    if (state.analyser) {
      state.analyser.getByteFrequencyData(state.dataArr);
      let sum = 0;
      const arr = state.dataArr;
      for (let i = 0; i < arr.length; i++) sum += arr[i];
      const avg = sum / arr.length;

      const audioTrack = state.stream && state.stream.getAudioTracks && state.stream.getAudioTracks()[0];
      const micOn = audioTrack && audioTrack.enabled && !audioTrack.muted;

      if (micOn && avg > VOICE_THRESHOLD) {
        state.activeMs += delta;
      }
    }
  }

  // --- 서버 통신 -----------------------------------------------------------
  async function joinAttendance() {
    if (!state || state.joined) return;
    const role = (function () {
      try { return (localStorage.getItem('mango_role') || '').trim() || 'student'; }
      catch (_) { return 'student'; }
    })();
    state.role = role;
    const ok = await apiPost('/api/attendance/join', {
      room_id:  state.roomId,
      user_id:  state.userId,
      username: state.username || '',
      role
    });
    state.joined = true;
    console.log('[attendance] join →', ok ? 'ok' : 'failed',
      { room: state.roomId, user: state.userId, role });
  }

  async function sendHeartbeat() {
    if (!state || !state.joined) return;
    // 진단 스냅샷 — 값이 0.0 으로 들어가는 원인이 마이크 OFF / analyser 미설정 / 조용함
    // 중 어느 쪽인지 서버에서 구별 가능하도록 함께 전송
    const track = state.stream && state.stream.getAudioTracks && state.stream.getAudioTracks()[0];
    const payload = {
      room_id:          state.roomId,
      user_id:          state.userId,
      total_active_ms:  Math.round(state.activeMs),
      total_session_ms: Math.round(state.sessionMs),
      has_analyser:     !!state.analyser,
      mic_enabled:      !!(track && track.enabled && !track.muted),
      ac_state:         state.audioCtx ? state.audioCtx.state : 'none'
    };
    // 발화 시간 업데이트 — attendance.total_active_ms / total_session_ms 반영
    apiPost('/api/speaking-time', payload, { silent: true });
    // heartbeat KV ping (60초 TTL) — 온라인 상태 표시용
    apiPost('/api/attendance/heartbeat', {
      room_id: state.roomId,
      user_id: state.userId
    }, { silent: true });
  }

  function sendLeave(useBeacon) {
    if (!state || !state.joined) return;
    const payload = {
      room_id:          state.roomId,
      user_id:          state.userId,
      total_active_ms:  Math.round(state.activeMs),
      total_session_ms: Math.round(state.sessionMs),
      status:           'left'
    };
    const path = '/api/attendance/leave';
    let sent = false;
    if (useBeacon) sent = sendBeaconJson(path, payload);
    if (!sent) {
      // keepalive fetch 폴백 — 언로드 중에도 전송 시도
      apiPost(path, payload, { keepalive: true, silent: true });
    }
    console.log('[attendance] leave 전송:',
      sent ? '(beacon)' : '(keepalive fetch)', payload);
  }

  // --- 공개 API ------------------------------------------------------------
  function start(opts) {
    opts = opts || {};
    if (state) stop({ silent: true });

    const mango = window.MangoV3;
    const vc    = getVcCtx();
    const userId   = opts.userId   || (mango && mango.userId) || vc.userId || null;
    const roomId   = opts.roomId   || vc.roomId;
    const stream   = opts.stream   || vc.stream;
    const username = opts.username || vc.username || '';

    if (!roomId || !userId) {
      console.warn('[attendance] roomId/userId 없음 → 추적 생략', { roomId, userId });
      return false;
    }
    // 관찰자는 추적 대상 아님
    if (opts.role === 'observer' || vc.isObserver === true) {
      console.log('[attendance] observer 모드 → 추적 생략');
      return false;
    }

    const audio = stream ? setupAudioAnalysis(stream) : null;

    state = {
      roomId:    String(roomId),
      userId:    String(userId),
      username:  username,
      role:      opts.role || 'student',
      stream:    stream || null,
      joinedAt:  nowMs(),
      lastTickTs: nowMs(),
      activeMs:  0,
      sessionMs: 0,
      audioCtx:  audio ? audio.ctx : null,
      analyser:  audio ? audio.analyser : null,
      dataArr:   audio ? audio.dataArr : null,
      tickTimer: null,
      hbTimer:   null,
      joined:    false
    };

    joinAttendance();
    state.tickTimer = setInterval(tick, TICK_INTERVAL_MS);
    state.hbTimer   = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    console.log('[attendance] 추적 시작:', {
      roomId: state.roomId, userId: state.userId, hasAudio: !!audio
    });
    return true;
  }

  function stop(opts) {
    if (!state) return;
    opts = opts || {};
    if (state.tickTimer) clearInterval(state.tickTimer);
    if (state.hbTimer)   clearInterval(state.hbTimer);
    if (!opts.silent) sendLeave(opts.useBeacon !== false);
    try { if (state.audioCtx) state.audioCtx.close(); } catch (_) {}
    state = null;
    console.log('[attendance] 추적 종료');
  }

  function status() {
    if (!state) return { active: false };
    return {
      active:       true,
      roomId:       state.roomId,
      userId:       state.userId,
      role:         state.role,
      activeMs:     Math.round(state.activeMs),
      sessionMs:    Math.round(state.sessionMs),
      activeRatio:  state.sessionMs > 0
        ? (state.activeMs / state.sessionMs * 100).toFixed(1) + '%'
        : '—'
    };
  }

  // --- 자동 연동 (body.vc-in-call 감지) -----------------------------------
  function waitForStreamAndStart() {
    const startedAt = nowMs();
    (function poll() {
      if (!document.body.classList.contains('vc-in-call')) return;
      if (state) return;                  // 이미 시작됨

      const vc = getVcCtx();
      if (vc.isObserver === true) return; // 관찰자는 skip

      const hasAudio = vc.stream && vc.stream.getAudioTracks && vc.stream.getAudioTracks().length > 0;

      // stream 의 오디오 트랙이 실제로 들어올 때까지 대기
      if (vc.roomId && hasAudio) {
        start({
          roomId:   vc.roomId,
          stream:   vc.stream,
          username: vc.username || ''
        });
        return;
      }
      // roomId 만 있고 audio 가 아직이면 조금 더 기다림
      if (nowMs() - startedAt > READY_MAX_WAIT_MS) {
        // 오디오가 끝내 없어도(마이크 권한 거부) 출석만이라도 기록
        if (vc.roomId) {
          start({
            roomId:   vc.roomId,
            stream:   null,
            username: vc.username || ''
          });
        } else {
          console.warn('[attendance] vcRoomId 를 찾지 못해 추적 포기');
        }
        return;
      }
      setTimeout(poll, READY_POLL_MS);
    })();
  }

  const bodyObserver = new MutationObserver(function () {
    const inCall = document.body.classList.contains('vc-in-call');
    if (inCall && !state) {
      waitForStreamAndStart();
    } else if (!inCall && state) {
      stop();
    }
  });
  // body 에 class 가 붙는 시점까지 기다렸다가 관찰 시작
  function bootObserver() {
    if (!document.body) { setTimeout(bootObserver, 100); return; }
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // 스크립트 로드 시점에 이미 vc-in-call 이면 즉시 시작
    if (document.body.classList.contains('vc-in-call')) waitForStreamAndStart();
  }
  bootObserver();

  // --- 언로드 안전망 -------------------------------------------------------
  window.addEventListener('pagehide',    function () { if (state) sendLeave(true); });
  window.addEventListener('beforeunload', function () { if (state) sendLeave(true); });

  // --- 공개 ----------------------------------------------------------------
  window.MangoAttendance = { start, stop, status };

  console.log('[attendance] mango-attendance.js 로드 완료');
})();
