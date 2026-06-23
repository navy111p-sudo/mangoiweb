/**
 * media-utils.js — 미디어/피어 설정 순수 헬퍼
 * ------------------------------------------------------------------
 * DOM·전역 상태에 의존하지 않는 순수 함수만 모았다.
 * 브라우저에서는 <script> 로 불러와 전역(window)에 노출되고,
 * 테스트 하네스(Node)에서는 require 로 그대로 검증할 수 있다.
 *
 *   E. 하울링/에코 방지 + 영상 상한      → buildMediaConstraints()
 *   F. 송신 비트레이트/프레임 상한        → capSenderBitrate(pc, isMobile, peerCount)
 *      └ 참가자 수에 따른 적응형 비트레이트 → pickVideoBitrate(isMobile, peerCount)
 *   G. ICE 실패 시 자동 재시작            → attachIceRestart(pc)
 *   +  NAT 통과용 STUN+TURN 구성           → buildIceServers()
 * ------------------------------------------------------------------
 */
(function (factory) {
  'use strict';
  var api = factory();
  if (typeof window !== 'undefined') {
    Object.keys(api).forEach(function (k) { window[k] = api[k]; });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(function () {
  'use strict';

  // [버그 E] 에코 제거/노이즈 억제/자동게인 + 영상 해상도·프레임 상한.
  function buildMediaConstraints() {
    return {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: {
        width: { ideal: 1280, max: 1280 },
        height: { ideal: 720, max: 720 },
        frameRate: { ideal: 24, max: 30 },
        facingMode: 'user',
      },
    };
  }

  // 카메라 거부/실패 시 "오디오만이라도" 확보하기 위한 폴백 제약.
  function buildAudioOnlyConstraints() {
    return { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false };
  }

  function isMobileUA(ua) {
    return /Android|iPhone|iPad|iPod/i.test(ua || '');
  }

  // ── 적응형 비트레이트 정책 ──
  // mesh(서로 직접 연결)에서는 보내는 상대가 늘수록 총 업로드가 곱으로 늘어난다.
  // 특히 1:4 수업의 "교사"가 병목(영상 4벌 업로드)이므로, 상대 수가 늘면
  // 스트림당 비트레이트를 낮춰 총 업로드를 예산 안에 묶는다.
  //   - peerCount = 내가 영상을 보내는 상대(원격 피어) 수
  //   - 데스크탑: 스트림당 최대 1.2Mbps, 총 예산 2.4Mbps
  //   - 모바일:   스트림당 최대 0.6Mbps, 총 예산 1.2Mbps
  //   - 하한 200kbps (그 이하는 사실상 식별 불가)
  var FLOOR_KBPS = 200;
  function pickVideoBitrate(isMobile, peerCount) {
    var base = isMobile ? 600 : 1200;       // 스트림당 상한
    var budget = isMobile ? 1200 : 2400;    // 총 업로드 예산
    var n = Math.max(1, peerCount || 1);
    var perStream = Math.min(base, Math.floor(budget / n));
    return Math.max(FLOOR_KBPS, perStream);
  }

  // [버그 F] 영상 송신 트랙의 최대 비트레이트/프레임 제한 (적응형).
  function capSenderBitrate(pc, isMobile, peerCount) {
    var maxKbps = pickVideoBitrate(isMobile, peerCount);
    pc.getSenders().forEach(function (sender) {
      if (!sender.track || sender.track.kind !== 'video') return;
      var params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = maxKbps * 1000;
      params.encodings[0].maxFramerate = 30;
      try {
        var ret = sender.setParameters(params);
        if (ret && typeof ret.catch === 'function') ret.catch(function () {});
      } catch (_) { /* 무시 */ }
    });
    return pc;
  }

  // [버그 G] ICE 연결이 'failed' 가 되면 즉시 restartIce() 로 복구를 시도한다.
  function attachIceRestart(pc) {
    pc.oniceconnectionstatechange = function () {
      if (pc.iceConnectionState === 'failed') {
        try { pc.restartIce(); } catch (_) { /* 구형 브라우저 무시 */ }
      }
    };
    return pc;
  }

  // 서버(/api/turn-config)에서 ICE 설정을 받아온다(Cloudflare 동적 자격증명).
  // 실패하면 정적 폴백(buildIceServers)으로 안전하게 떨어진다.
  async function loadIceServers(fetchImpl, url) {
    var f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    var endpoint = url || '/api/turn-config';
    if (!f) return buildIceServers();
    try {
      var res = await f(endpoint);
      if (!res || !res.ok) throw new Error('http');
      var json = await res.json();
      var list = json && json.iceServers;
      if (!list || !list.length) throw new Error('empty');
      return { iceServers: list };
    } catch (_) {
      return buildIceServers();
    }
  }

  // [개선] STUN 만으로는 대칭형 NAT/방화벽 환경에서 연결이 안 될 수 있다.
  // TURN(릴레이)을 함께 제공해 까다로운 네트워크에서도 통화가 성사되게 한다.
  //   ※ openrelay.metered.ca 는 무료 공개 TURN(개발/테스트용).
  //     운영 환경에서는 전용 TURN(coturn/Cloudflare/Twilio 등 + 동적 자격증명)
  //     사용을 권장한다.
  function buildIceServers() {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ],
    };
  }

  return {
    buildMediaConstraints: buildMediaConstraints,
    buildAudioOnlyConstraints: buildAudioOnlyConstraints,
    isMobileUA: isMobileUA,
    pickVideoBitrate: pickVideoBitrate,
    capSenderBitrate: capSenderBitrate,
    attachIceRestart: attachIceRestart,
    buildIceServers: buildIceServers,
    loadIceServers: loadIceServers,
  };
});
