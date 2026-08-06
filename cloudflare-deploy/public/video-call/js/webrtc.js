/**
 * webrtc.js – WebRTC 피어 연결 관리 (Native WebSocket)
 * 핵심 수정: onnegotiationneeded를 addTrack 전에 설정 (레이스 컨디션 방지)
 */
const peerConnections = new Map();
// fix (2026-07-05) — remoteDescription 설정 전에 도착한 ICE 후보 버퍼(피어별).
//   기존: 후보를 즉시 addIceCandidate → offer/answer 보다 먼저 오면 예외로 유실 → 간헐 연결 실패.
//   수정: remoteDescription 이 없으면 여기 담아뒀다가 setRemoteDescription 직후 flush.
const pendingCandidates = new Map();

// remoteDescription 이 준비된 뒤 버퍼링된 ICE 후보를 일괄 투입
function flushPendingCandidates(userId, pc) {
  const queue = pendingCandidates.get(userId);
  if (!queue || !queue.length) return;
  console.log('[webrtc] 버퍼된 ICE 후보 flush:', userId, queue.length + '개');
  queue.forEach((c) => {
    pc.addIceCandidate(c).catch((e) => console.warn('[webrtc] flush ICE 실패:', e && e.name));
  });
  pendingCandidates.delete(userId);
}

/* 🔴 (2026-08-05) 이 화면은 «무료 공개 TURN(openrelay.metered.ca)» 을 쓰고 있었다.
   정식 화면은 /api/turn-config 로 Cloudflare TURN(엣지·전용 자격증명)을 받아 쓰는데, 이쪽만 옛 설정이
   그대로 남아 있었다. 무료 공개 TURN 은 혼잡·속도제한이 있어, 직접 연결이 막히는 필리핀 가정 회선에서
   «참여자는 2명인데 영상이 검은» 상태로 오래 머무는 원인이 된다.
   → 정식 화면과 같은 /api/turn-config 를 쓴다. 실패하면 공개 TURN 으로 폴백(연결 자체는 절대 포기 안 함).
   Cloudflare TURN 에는 turns:443/tcp 가 있어 가정·회사 방화벽도 대개 통과한다. */
const ICE_FALLBACK = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ]
};
let ICE_SERVERS = ICE_FALLBACK;      // 아직 못 받았으면 이걸로라도 시작한다
let _icePromise = null;

function ensureIceServers() {
  if (_icePromise) return _icePromise;
  _icePromise = fetch('/api/turn-config', { credentials: 'omit' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (j && Array.isArray(j.iceServers) && j.iceServers.length) {
        ICE_SERVERS = { iceServers: j.iceServers };
        console.log('[webrtc] Cloudflare TURN 적용:', j.iceServers.length + '개');
      } else {
        console.warn('[webrtc] turn-config 응답이 비어 폴백 유지');
      }
      return ICE_SERVERS;
    })
    .catch(function (e) {
      console.warn('[webrtc] turn-config 실패 → 공개 TURN 폴백:', e && e.message);
      return ICE_SERVERS;
    });
  return _icePromise;
}
/* 입장 흐름을 막지 않도록 페이지가 뜨자마자 미리 받아 둔다(선반입) */
try { ensureIceServers(); } catch (e) {}

function handleExistingUsers(data) {
  console.log('[webrtc] existing-users 수신:', JSON.stringify(data).substring(0, 200));
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.users) ? data.users : []);
  console.log('[webrtc] 기존 사용자 수:', list.length);
  list.forEach(({ userId, username: name }) => {
    console.log('[webrtc] 기존 사용자 연결(initiator):', userId, name);
    ensureRemoteTile(userId, name);      // 내가 나중에 들어온 경우 — 먼저 있던 사람 타일도 바로 만든다
    createPeerConnection(userId, name, true);
  });
  if (data && data.pdfState && typeof handlePdfSync === 'function') {
    try { handlePdfSync(data.pdfState); } catch (_) {}
  }
}

/* ── 상대 타일은 «사람이 들어오면» 만든다 (2026-08-05) ──
   🔴 예전엔 ontrack(영상 트랙 도착)에서만 만들었다. 그래서 학생이 카메라를 못 켜면
      — 권한 거부·웹캠 없음·회선이 나빠 영상이 늦음 — 강사 화면에 타일이 아예 안 생겼고,
      타일이 없으니 «칭찬 별점 버튼» 도 줄 수가 없었다. 실제로 2명이 들어와 있는데
      상대 칸이 비어 있는 상태를 라이브에서 확인했다.
   → 참가자가 들어온 시점에 빈 타일부터 만든다. 영상은 나중에 그 안으로 들어온다.
      (정식 화면이 vcEnsureParticipantBox 로 쓰던 것과 같은 방식이다) */
function ensureRemoteTile(userId, peerName) {
  let wrapper = document.getElementById('video-' + userId);
  if (wrapper) return wrapper;
  const grid = document.getElementById('video-grid');
  if (!grid) return null;
  wrapper = document.createElement('div');
  wrapper.className = 'video-item remote';
  wrapper.id = 'video-' + userId;
  wrapper.innerHTML = '<video autoplay playsinline></video>' +
                      '<span class="video-label">' + (peerName || 'Participant') + '</span>' +
                      '<span class="lite-waiting" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);' +
                      'color:#94a3b8;font-size:13px;white-space:nowrap">📷 Connecting… · 연결 중…</span>';
  wrapper.style.position = 'relative';
  grid.appendChild(wrapper);
  if (typeof updateGridCount === 'function') updateGridCount();
  try { if (typeof praiseButtonFor === 'function') praiseButtonFor(wrapper, userId); } catch (e) {}
  armTileWatchdog(userId, wrapper);
  return wrapper;
}

/* ⏱️ (2026-08-05) «연결 중…» 이 영원히 안 없어지는 것을 막는다.
   좀비 소켓 상대로는 offer/answer 가 오가지 않아 ICE 가 시작조차 못 한다. 그러면 pc 는
   'failed' 로도 안 가고 'new' 에 머물러서, 기존 실패 복구(oniceconnectionstatechange)가
   한 번도 안 불린다 → 타일이 「📷 Connecting…」 인 채로 영원히 남는다. 실제로 라이브에서
   3명 중 하나가 이 상태였다.
   ⚠️ 여기서 타일을 «자동으로 지우지 않는다». 필리핀 가정 회선은 진짜로 늦게 붙는 일이 있고,
      멀쩡히 들어와 있는 사람을 화면에서 지워버리는 쪽이 더 나쁘다.
      → 25초: 조용히 한 번 재시도(restartIce). 75초: 사실대로 «연결 안 됨» 이라고 쓰고,
        치울지 말지는 사람이 ✕ 로 정한다. */
function tileIsLive(userId) {
  const pc = peerConnections.get(userId);
  if (pc && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' ||
             pc.iceConnectionState === 'completed')) return true;
  const el = document.getElementById('video-' + userId);
  const v = el && el.querySelector('video');
  return !!(v && v.srcObject);            // 영상이 들어왔으면 살아있는 것
}

function armTileWatchdog(userId, wrapper) {
  if (wrapper.__wd) return;               // 이미 걸려 있으면 중복으로 안 건다
  wrapper.__wd = [
    setTimeout(function () {
      if (tileIsLive(userId)) return;
      const pc = peerConnections.get(userId);
      if (!pc) return;
      console.warn('[webrtc] 25초째 연결 없음 → restartIce:', userId);
      try { pc.restartIce(); } catch (e) {}
    }, 25000),
    setTimeout(function () {
      if (tileIsLive(userId)) return;
      const w = wrapper.querySelector('.lite-waiting');
      if (!w) return;
      console.warn('[webrtc] 75초째 연결 없음 → 유령 타일로 표시:', userId);
      w.style.color = '#f59e0b';
      w.textContent = '⚠ Not connected · 연결 안 됨';
      const x = document.createElement('button');
      x.textContent = '✕';
      x.title = 'Remove this tile · 이 칸 치우기';
      x.setAttribute('style', 'position:absolute;right:6px;top:6px;z-index:5;width:26px;height:26px;' +
        'border:0;border-radius:8px;background:rgba(15,23,42,.75);color:#e2e8f0;font-size:13px;cursor:pointer');
      x.onclick = function () {
        // 화면에서만 치운다. 상대를 방에서 내보내지 않는다 — 다시 들어오면 타일도 다시 생긴다.
        try { const pc = peerConnections.get(userId); if (pc) { pc.close(); peerConnections.delete(userId); } } catch (e) {}
        wrapper.remove();
        if (typeof updateGridCount === 'function') updateGridCount();
      };
      wrapper.appendChild(x);
    }, 75000)
  ];
}

function clearTileWatchdog(userId) {
  const el = document.getElementById('video-' + userId);
  if (el && el.__wd) { el.__wd.forEach(clearTimeout); el.__wd = null; }
}

function handleUserJoined({ userId, username: name, userCount: count }) {
  console.log('[webrtc] user-joined:', userId, name);
  if (count) userCount = count;
  else userCount++;
  updateUserCount();
  ensureRemoteTile(userId, name);      // 영상이 오기 전에도 칭찬을 줄 수 있게
  createPeerConnection(userId, name, false);
}

function handleOfferMessage(data) {
  const from = data.fromUserId || data.from;
  const offer = data.sdp || data.offer;
  const name = data.fromUsername || '';
  console.log('[webrtc] offer 수신 from:', from);
  if (!from || !offer) { console.warn('[webrtc] Invalid offer', data); return; }
  const pc = peerConnections.get(from) || createPeerConnection(from, name, false);
  pc.setRemoteDescription(offer).then(() => {
    console.log('[webrtc] remoteDesc 설정 → answer 생성');
    flushPendingCandidates(from, pc); // 먼저 도착해 버퍼된 ICE 후보 투입
    return pc.createAnswer();
  }).then((answer) => {
    return pc.setLocalDescription(answer).then(() => answer);
  }).then((answer) => {
    console.log('[webrtc] answer 전송 →', from);
    sendWsMessage({ type: 'answer', data: { targetUserId: from, sdp: answer } });
  }).catch(e => console.error('[webrtc] Offer handle error:', e));
}

function handleAnswerMessage(data) {
  const from = data.fromUserId || data.from;
  const answer = data.sdp || data.answer;
  console.log('[webrtc] answer 수신 from:', from);
  if (!from || !answer) { console.warn('[webrtc] Invalid answer', data); return; }
  const pc = peerConnections.get(from);
  if (pc) {
    pc.setRemoteDescription(answer)
      .then(() => {
        console.log('[webrtc] answer 적용 완료');
        flushPendingCandidates(from, pc); // 먼저 도착해 버퍼된 ICE 후보 투입
      })
      .catch(e => console.error('[webrtc] Answer error:', e));
  } else {
    console.warn('[webrtc] answer 수신 but PC 없음:', from);
  }
}

function handleIceCandidateMessage(data) {
  const from = data.fromUserId || data.from;
  const candidate = data.candidate;
  const pc = peerConnections.get(from);
  if (!pc || !candidate) return;
  // remoteDescription 이 아직 없으면 즉시 추가하면 예외로 유실 → 버퍼에 담아뒀다 flush
  if (!pc.remoteDescription || !pc.remoteDescription.type) {
    const queue = pendingCandidates.get(from) || [];
    queue.push(candidate);
    pendingCandidates.set(from, queue);
    return;
  }
  pc.addIceCandidate(candidate).catch((e) => console.warn('[webrtc] ICE candidate error:', e && e.name));
}

/* ═══════════════════════════════════════════════════════════════════════════
   🚚 자동 변속기 (2026-08-05 사장님 지시)
   ───────────────────────────────────────────────────────────────────────────
   비유대로다. 오르막·빙판이면 짐을 줄이고 저단으로, 평지면 고단으로 올린다.
   운전자(강사)는 아무것도 안 한다.

   [왜 필요한가] 이 화면은 어제까지 «400kbps 고정» 이었다. 나쁜 길에는 맞지만
                 평지에서도 2단으로 기어갔다. 반대로 예전 정식 화면 값(1200kbps)은
                 오르막에서 짐을 지고 올라가려다 큐가 밀려 오히려 끊겼다.
   [속도계] 4초마다 getStats() — 패킷 손실률과 왕복지연(RTT).
   [변속 규칙] 내려갈 땐 «즉시», 올라갈 땐 «3번 연속 좋을 때만».
               경계선에서 화면이 오르내리며 떨리는 것을 막는다.
   [출발 단수] 1단이 아니라 «2단(step 1)» 에서 출발한다. 필리핀 가정 회선은
               오르막일 확률이 높다. 좋으면 곧 올라간다 — 나쁜데 높게 출발해
               10초간 깨져 보이는 것보다 낫다.
   ⚠️ 변속에 재협상(renegotiation)을 쓰지 않는다. setParameters 와 track.enabled 만
      건드린다. 그래야 기어를 바꾸는 동안에도 수업이 끊기지 않는다.
   ⚠️ 소리는 어느 단에서도 건드리지 않는다. 마지막까지 지켜야 할 것이 소리다.
   ═══════════════════════════════════════════════════════════════════════════ */
const GEAR_MOBILE   = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const GEAR_BASE_KBPS = GEAR_MOBILE ? 500 : 800;   // 평지(최고단) 상한
const GEAR_BASE_FPS  = GEAR_MOBILE ? 20 : 24;
const GEAR_MUL   = [1.0, 0.6, 0.35, 0.2];         // 단수별 비트레이트 배율
const GEAR_SCALE = [1, 1.5, 2, 3];                // 단수별 해상도 축소 — 낮은 비트레이트에선
                                                  // 픽셀을 줄여야 «블록 깨짐» 대신 «선명한 저해상도» 가 된다
const GEAR_FPS   = [GEAR_BASE_FPS, 20, 15, 12];
const GEAR_START = 1;                             // 오르막 출발
const GEAR_NAME  = ['5단 · High', '4단 · Normal', '2단 · Low', '1단 · Minimum'];

function applyGear(pc, step) {
  step = Math.max(0, Math.min(GEAR_MUL.length - 1, step | 0));
  pc.__gear = step;
  pc.getSenders().forEach((sender) => {
    if (!sender.track || sender.track.kind !== 'video') return;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].maxBitrate = Math.round(GEAR_BASE_KBPS * GEAR_MUL[step]) * 1000;
    params.encodings[0].maxFramerate = GEAR_FPS[step];
    params.encodings[0].scaleResolutionDownBy = GEAR_SCALE[step];
    params.degradationPreference = 'maintain-framerate';  // 또렷함보다 «안 끊기는 것»
    sender.setParameters(params).catch((e) => console.warn('[gear] 적용 실패:', e && e.name));
  });
  showGear(step);
}
/* 새 연결이 붙을 때 현재 단수로 맞춰 준다(이름은 예전 호출부와 맞춰 그대로 둔다) */
function capSenderBitrate(pc) { applyGear(pc, typeof pc.__gear === 'number' ? pc.__gear : GEAR_START); }

/* 강사가 «왜 화질이 낮지?» 하고 신고하지 않도록 지금 몇 단인지 항상 보여 준다(한/영) */
function showGear(step) {
  try {
    let el = document.getElementById('gear-badge');
    if (!el) {
      const host = document.querySelector('.toolbar-left');
      if (!host) return;
      el = document.createElement('span');
      el.id = 'gear-badge';
      el.style.cssText = 'margin-left:8px;font-size:12px;padding:3px 8px;border-radius:999px;' +
                         'background:rgba(255,255,255,.12);color:#cbd5e1;white-space:nowrap';
      host.appendChild(el);
    }
    /* 어느 쪽이 약한지도 같이 보여 준다 — 조치가 달라지기 때문이다.
       내 쪽이 약하면 «내» 카메라를 끄면 되고, 상대가 약하면 상대에게 말해야 한다. */
    const side = window.__liteWeakSide;
    el.textContent = '⚡ ' + GEAR_NAME[step] + (side ? ' · ' + side.tag : '');
    el.title = (step === 0 && !side)
      ? 'Connection is good — full quality · 회선이 좋아 최고 화질입니다'
      : ((side ? side.why + '\n' : '') +
         'Protecting your connection — video quality lowered so the class never drops · 회선을 보호하려고 화질을 낮췄습니다');
  } catch (e) {}
}

/* ── 변속 루프 ── 4초마다 각 연결의 손실률·RTT 를 보고 단수를 정한다 */
setInterval(function () {
  peerConnections.forEach(function (pc, id) {
    if (!pc) return;
    const st = pc.iceConnectionState;
    if (st !== 'connected' && st !== 'completed') return;
    if (!pc.getStats) return;
    /* ── 양쪽 회선을 «합쳐» 판단한다 (2026-08-05 사장님 지시) ──
       한 번의 getStats() 에 두 방향이 다 들어 있다.
         ① remote-inbound-rtp : «상대가 나를 받은» 결과를 상대가 되돌려 준 보고서 → 내 올림길 상태
         ② inbound-rtp        : «내가 상대를 받은» 결과                          → 내 내림길 상태
       ①만 보면 «내가 보내는 길» 만 고친다. 그런데 가정 회선은 올림·내림이 같은 관을 쓴다.
       내가 받는 게 나쁠 때 내가 계속 올려 보내면 그 관을 더 좁힌다.
       → 둘 중 «나쁜 쪽» 을 기준으로 단수를 정한다. 트럭이 짐칸과 엔진 중 약한 쪽에 맞추는 것과 같다.

       ⚠️ 상대에게 «내가 못 받고 있다» 고 알려 주는 방식은 쓸 수 없다. 서버 중계가 정해진 메시지
          종류만 넘기고, 그 파일(video-call-room.ts)은 손대면 안 되는 금지구역이다.
          대신 ①이 이미 «상대의 보고서» 라서, 상대 쪽 문제도 상당 부분 여기에 잡힌다. */
    pc.getStats().then(function (stats) {
      let outLost = 0, outSent = 0, rtt = 0;      // ① 내가 보내는 길
      let inLost = 0, inRecv = 0;                 // ② 내가 받는 길
      stats.forEach(function (r) {
        if (r.type === 'remote-inbound-rtp' && r.kind === 'video') {
          outLost = r.packetsLost || 0;
          if (typeof r.roundTripTime === 'number') rtt = r.roundTripTime * 1000;
        }
        if (r.type === 'outbound-rtp' && r.kind === 'video') outSent = r.packetsSent || 0;
        if (r.type === 'inbound-rtp' && r.kind === 'video') {
          inLost = r.packetsLost || 0;
          inRecv = r.packetsReceived || 0;
        }
      });
      const p = pc.__gPrev || { oL: 0, oS: 0, iL: 0, iR: 0 };
      pc.__gPrev = { oL: outLost, oS: outSent, iL: inLost, iR: inRecv };

      const dOL = Math.max(0, outLost - p.oL), dOS = Math.max(0, outSent - p.oS);
      const dIL = Math.max(0, inLost - p.iL),  dIR = Math.max(0, inRecv - p.iR);
      const upPct   = (dOS + dOL >= 25) ? (100 * dOL / (dOS + dOL)) : -1;   // -1 = 표본 부족
      const downPct = (dIR + dIL >= 25) ? (100 * dIL / (dIR + dIL)) : -1;
      if (upPct < 0 && downPct < 0) return;       // 양쪽 다 표본 부족 → 판단 보류

      const worst = Math.max(upPct, downPct);     // 나쁜 쪽에 맞춘다
      /* 어느 쪽이 약한지 기록 — 화면 표시와 조치 안내가 달라진다 */
      if (worst > 6) {
        window.__liteWeakSide = (downPct >= upPct)
          ? { tag: 'peer', why: "The other side's line is weak · 상대 회선이 약합니다" }
          : { tag: 'mine', why: 'Your line is weak · 내 회선이 약합니다' };
      } else if (worst >= 0 && worst < 1.5) {
        window.__liteWeakSide = null;
      }

      let step = (typeof pc.__gear === 'number') ? pc.__gear : GEAR_START;
      if (worst > 6 || rtt > 450) {               // 오르막 — 즉시 한 단 내린다
        pc.__gGood = 0;
        if (step < GEAR_MUL.length - 1) step++;
      } else if (worst >= 0 && worst < 1.5 && (rtt === 0 || rtt < 250)) {
        pc.__gGood = (pc.__gGood || 0) + 1;       // 평지 — 세 번 연속 좋을 때만 올린다
        if (pc.__gGood >= 3 && step > 0) { step--; pc.__gGood = 0; }
      } else {
        pc.__gGood = 0;
      }
      if (step !== pc.__gear) {
        console.warn('[gear] 올림 ' + upPct.toFixed(1) + '% · 내림 ' + downPct.toFixed(1) +
                     '% · RTT ' + Math.round(rtt) + 'ms → ' + GEAR_NAME[pc.__gear] + ' → ' + GEAR_NAME[step]);
        applyGear(pc, step);
      } else {
        showGear(step);                           // 단수는 그대로여도 «어느 쪽이 약한지» 는 갱신한다
      }
    }).catch(function () {});

    /* ── 비상 기어(빙판) — 소리까지 깨지면 영상을 끈다 ──
       오디오 손실 12%↑ 또는 RTT 600ms↑ 가 «세 번 연속(약 12초)» 이면 망이 무너진 것이다.
       이때는 화질을 낮추는 정도로는 안 되고 영상을 내려놓아야 소리가 산다.
       ⚠️ 트랙 enabled 만 토글한다(재협상 없음) → 수업은 끊기지 않는다.
       ⚠️ 강사가 «직접» 카메라를 꺼둔 경우엔 관여하지 않는다. */
    try {
      const aS = pc.getSenders && pc.getSenders().find(function (s) { return s.track && s.track.kind === 'audio'; });
      if (aS && aS.getStats) aS.getStats().then(function (ast) {
        let al = 0, ap = 0, art = 0;
        ast.forEach(function (r) {
          if (r.type === 'remote-inbound-rtp') { al = r.packetsLost || 0; if (typeof r.roundTripTime === 'number') art = r.roundTripTime * 1000; }
          if (r.type === 'outbound-rtp') ap = r.packetsSent || 0;
        });
        const apv = pc.__aPrev || { l: 0, p: 0 }; pc.__aPrev = { l: al, p: ap };
        const adl = Math.max(0, al - apv.l), adp = Math.max(0, ap - apv.p);
        if (adp + adl < 8) return;               // 무음/DTX → 판단 보류
        const alp = 100 * adl / (adp + adl);
        const A = window.__liteAAO || (window.__liteAAO = { active: false, sev: 0, good: 0 });
        if (alp > 12 || art > 600) { A.sev++; A.good = 0; }
        else if (alp < 3) { A.good++; if (A.sev > 0) A.sev--; }
        else { A.good = 0; }
        applyAudioOnly();
      }).catch(function () {});
    } catch (e) {}
  });
}, 4000);

/* 소리만 모드 진입/복구 — 진입 sev>=3(약 12초), 복구 good>=2(약 8초) */
function applyAudioOnly() {
  const A = window.__liteAAO; if (!A) return;
  const vids = (typeof localStream !== 'undefined' && localStream && localStream.getVideoTracks)
    ? localStream.getVideoTracks() : [];
  if (!vids.length) return;
  if (window.__liteCamOff === true) return;      // 사용자가 직접 끈 상태 — 건드리지 않는다
  if (!A.active && A.sev >= 3) {
    A.active = true; A.good = 0;
    vids.forEach(function (t) { t.enabled = false; });
    console.warn('[gear] 빙판 — 소리만 모드로 내려간다');
    showAudioOnly(true);
  } else if (A.active && A.good >= 2) {
    A.active = false; A.sev = 0;
    vids.forEach(function (t) { t.enabled = true; });
    console.warn('[gear] 회복 — 영상 복구');
    showAudioOnly(false);
  }
}
function showAudioOnly(on) {
  try {
    const el = document.getElementById('gear-badge');
    if (!el) return;
    if (on) {
      el.textContent = '🔊 Audio only · 소리만';
      el.style.background = '#c0392b'; el.style.color = '#fff';
      el.title = 'Connection is very weak — video paused so the voice stays clear. It comes back automatically. · 회선이 매우 약해 영상을 잠시 껐습니다. 좋아지면 자동 복구됩니다.';
    } else {
      el.style.background = 'rgba(255,255,255,.12)'; el.style.color = '#cbd5e1';
    }
  } catch (e) {}
}

/* ── 붙는 데 오래 걸리면 흔들어 준다 ──
   (2026-08-05) 어제 «참여자 2명 · P2P 탐색중» 상태로 오래 머물렀다. 직접 연결이 막힌 회선에서
   브라우저가 안 되는 경로를 계속 두드리느라 시간을 버린 것이다. 6초·12초에 restartIce 로 흔들면
   중계(TURN) 후보로 다시 붙는다. 이미 붙었으면 아무 일도 하지 않는다. */
function nudgeIfStalled(pc, userId) {
  [6000, 12000].forEach(function (ms) {
    setTimeout(function () {
      try {
        const st = pc.iceConnectionState;
        if (st === 'connected' || st === 'completed' || st === 'closed') return;
        console.warn('[webrtc] ' + (ms / 1000) + '초째 ' + st + ' → restartIce:', userId);
        pc.restartIce();
      } catch (e) {}
    }, ms);
  });
}

function createPeerConnection(userId, peerName, isInitiator) {
  if (peerConnections.has(userId)) return peerConnections.get(userId);
  console.log('[webrtc] createPC:', userId, peerName, 'initiator:', isInitiator);
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peerConnections.set(userId, pc);

  // --- 이벤트 핸들러 ---
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      sendWsMessage({ type: 'ice-candidate', data: { targetUserId: userId, candidate: event.candidate } });
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('[webrtc] ICE(' + userId + '):', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') {
      console.warn('[webrtc] ICE 실패 → restartIce');
      pc.restartIce();
    }
    if (pc.iceConnectionState === 'disconnected') {
      setTimeout(() => {
        if (pc.iceConnectionState === 'disconnected') {
          console.warn('[webrtc] 장시간 끊김 → restartIce');
          pc.restartIce();
        }
      }, 5000);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('[webrtc] conn(' + userId + '):', pc.connectionState);
  };

  pc.ontrack = (event) => {
    console.log('[webrtc] ★ ontrack! userId:', userId, 'streams:', event.streams.length, 'track:', event.track.kind);
    /* 타일은 이미 입장 시점에 만들어져 있다(ensureRemoteTile). 없으면 여기서 만든다 —
       한 곳에서만 만들어야 «별 버튼이 두 개» 같은 사고가 안 난다. */
    const videoEl = ensureRemoteTile(userId, peerName);
    if (!videoEl) return;
    /* 영상이 실제로 왔으니 «연결 중…» 안내는 치운다 */
    try { const w = videoEl.querySelector('.lite-waiting'); if (w) w.remove(); } catch (e) {}
    try { clearTileWatchdog(userId); } catch (e) {}   // 붙었으니 «연결 안 됨» 표시가 뜨면 안 된다
    const videoTag = videoEl.querySelector('video');
    if (event.streams && event.streams[0]) {
      videoTag.srcObject = event.streams[0];
    } else {
      // fallback: 스트림 없이 트랙만 올 경우
      let stream = videoTag.srcObject;
      if (!stream) stream = new MediaStream();
      stream.addTrack(event.track);
      videoTag.srcObject = stream;
    }
    // ★ 스피커 보장: 원격 비디오는 반드시 음소거 해제 + 재생 시도
    videoTag.muted = false;
    videoTag.volume = 1.0;
    const tryPlay = () => {
      const p = videoTag.play();
      if (p && typeof p.catch === 'function') {
        p.catch((err) => {
          console.warn('[webrtc] autoplay 차단됨, 사용자 제스처 필요:', err && err.name);
          // 사용자 클릭 한번으로 언블록 (iOS Safari 대응)
          const unlock = () => { videoTag.play().catch(()=>{}); document.removeEventListener('click', unlock); };
          document.addEventListener('click', unlock, { once: true });
        });
      }
    };
    tryPlay();
    console.log('[webrtc] 원격 비디오 srcObject 설정 + 오디오 언뮤트 완료');

    // ★ 플로팅 비디오에도 미러링 (다른 탭에서도 상대 영상 보이게)
    updateFloatingVideo(userId, peerName, event.streams[0] || videoTag.srcObject);
  };

  // ★ 핵심 수정: onnegotiationneeded를 addTrack 전에 설정!
  // addTrack이 negotiationneeded를 트리거하는데, 핸들러가 뒤에 있으면 이벤트를 놓칠 수 있음
  if (isInitiator) {
    pc.onnegotiationneeded = () => {
      console.log('[webrtc] negotiationneeded → offer 생성:', userId);
      pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer).then(() => offer);
      }).then((offer) => {
        console.log('[webrtc] offer 전송:', userId);
        sendWsMessage({ type: 'offer', data: { targetUserId: userId, sdp: offer } });
      }).catch(e => console.error('[webrtc] Offer create error:', e));
    };
  }

  // ★ addTrack은 반드시 onnegotiationneeded 설정 후에 호출
  if (localStream) {
    const tracks = localStream.getTracks();
    console.log('[webrtc] 로컬 트랙 추가:', tracks.length, '개');
    tracks.forEach(track => pc.addTrack(track, localStream));
    capSenderBitrate(pc); // [수정] 송신 비트레이트 상한 → 버벅임/대역폭 절감
  } else {
    console.warn('[webrtc] localStream 없음!');
  }

  nudgeIfStalled(pc, userId);   // 오래 «탐색중» 이면 중계 경로로 다시 붙게 흔든다

  // ★ 안전장치: initiator인데 1.5초 후에도 offer가 안 갔으면 강제 생성
  if (isInitiator) {
    setTimeout(() => {
      if (pc.signalingState === 'stable' && !pc.remoteDescription) {
        console.log('[webrtc] negotiationneeded 미발생 → 강제 offer:', userId);
        pc.createOffer().then((offer) => {
          return pc.setLocalDescription(offer).then(() => offer);
        }).then((offer) => {
          sendWsMessage({ type: 'offer', data: { targetUserId: userId, sdp: offer } });
        }).catch(e => console.error('[webrtc] Forced offer error:', e));
      }
    }, 1500);
  }

  return pc;
}

// ★ 플로팅 원격 비디오: 다른 탭에서도 상대방 영상 표시
function updateFloatingVideo(userId, peerName, stream) {
  const container = document.getElementById('floating-remote-videos');
  if (!container) return;
  let el = document.getElementById('float-' + userId);
  if (!el) {
    el = document.createElement('div');
    el.className = 'floating-video-item';
    el.id = 'float-' + userId;
    el.innerHTML = '<video autoplay playsinline muted></video><span class="floating-video-label">' + (peerName || 'Participant') + '</span>';
    container.appendChild(el);
  }
  if (stream) el.querySelector('video').srcObject = stream;
}

function removeFloatingVideo(userId) {
  const el = document.getElementById('float-' + userId);
  if (el) el.remove();
}

// ★ 앱 전환 후 복귀 시 모든 원격 video의 play 강제 재시도 (화면 멈춤 해결)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    document.querySelectorAll('video').forEach(v => {
      if (v.paused) {
        v.play().catch(() => {
          const unlock = () => { v.play().catch(()=>{}); document.removeEventListener('click', unlock); };
          document.addEventListener('click', unlock, { once: true });
        });
      }
    });
    // 연결이 disconnected라면 복구 시도
    if (typeof peerConnections !== 'undefined') {
      peerConnections.forEach((pc, uid) => {
        try {
          if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            console.log('[webrtc] visibility 복귀 → ICE restart:', uid);
            pc.restartIce();
          }
        } catch (_) {}
      });
    }
  }
});
