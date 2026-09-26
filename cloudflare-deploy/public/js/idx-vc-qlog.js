/* ═══════════════════════════════════════════════════════════════════════════
   📶 idx-vc-qlog.js — 화상수업 «회선품질 로깅» (2026-08-26 분리)

   [무엇] 4초마다 도는 적응 루프(idx-main.js)가 잰 손실률·RTT 를 여기서 누적했다가
          60초에 한 번 요약 1건을 /api/vc/quality-log 로 보낸다(fire-and-forget).
          통화 경로와 무관하다 — 이 파일이 통째로 죽어도 수업은 그대로 돈다.

   [왜 idx-main.js 에서 빼냈나]
     ① 첫 화면 예산. idx-main.js 는 849KB blocking 이고 학생 29,000명 전원이
        첫 화면에서 받는다. 2026-08-26 실측 여유가 **351바이트**였다.
        이 함수(1.7KB)를 defer 로 내리니 예산이 오히려 늘었다.
     ② 수업에 들어가야 처음 불린다. 첫 페인트에 있을 이유가 없다.
     ⚠️ 부르는 쪽 3곳은 전부 try/catch 안이라, 이 파일이 아직 안 왔어도 그냥 넘어간다.
        (수업 시작은 페이지 로드보다 한참 뒤라 실제로 놓치는 표본은 없다.)

   [🔴 왜 고쳤나 — 2026-08-26 「끊기는 원인 찾아줘」]
     적응 루프에 이런 줄이 있다(idx-main.js):
         if (dSent + dLost < 25) return;   // 표본 부족 → 판단 보류
     그 return 이 vcQualityAcc() «앞» 이라, **영상 표본이 없는 사람은 기록이 통째로
     남지 않았다.** 카메라를 껐거나 영상이 죽은 사람 — 즉 «왜 안 보이나» 를 알아야 할
     바로 그 사람들이다. 8/26 하루 예상 ~2,900건 중 실제 기록은 25건(약 1%)이었다.

     ✅ 이제 그런 틱은 loss = -1 로 들어와 `novideo` 로 «세기만» 한다.
        ⛔ 손실률 평균에는 넣지 않는다 — 표본이 없는 것과 손실 0%는 다른 사실이다.
           0 으로 넣으면 «영상이 죽은 사람» 이 «회선이 제일 좋은 사람» 으로 보인다.
        ✅ 대신 표본이 하나도 없어도(novideo 만 있어도) 요약은 보낸다. 그게 핵심이다.

   [🔴 왜 또 고쳤나 — 2026-09-01 class-1015 「화면이 흐리고 소리가 끊긴다」]
     이 파일 머리말은 «강사 회선이 대체로 어떤가» 를 보는 용도라고 적혀 있는데,
     운영 D1 실측 결과 **vc_quality 742건이 전부 학생(8명)이고 강사는 0건**이었다.
     관리자 메뉴 「📶 강사 회선품질」 화면은 개설 이래 강사 데이터가 한 건도 없다.

     [원인 ①] 아이디를 `getCurrentUser()` 로만 만들었다. 그 함수는 학생 전용 키
       (`mangoi_logged_user`)를 읽는데, **강사·본사는 쿠키 세션**이라 늘 null 이다
       (CLAUDE.md 2장 「로그인했는데 또 로그인하래요」와 같은 뿌리).
       그래서 uid 가 빈 문자열이 되고, 서버가 `if (!b.uid) return` 으로 조용히 버렸다.
       ✅ 이제 `mangoi_admin_session`(관리자 쿠키 세션의 화면쪽 사본) → 화면 이름표
          순으로 떨어진다. ⛔ 그렇다고 학생 키를 강사에게 만들어 주면 안 된다
          (학생 전용 기능이 통째로 열린다 — CLAUDE.md 1장). 여기서는 «로그에 적을
          이름» 만 가져온다.

     [원인 ②] 적응 루프도 이 파일도 `sender.getStats()` 만 본다 = **«내가 보내는 것»**
       만 잰다. 그런데 「화면이 흐리다」·「소리가 끊긴다」는 전부 **«내가 받는 것»**
       이야기다. 그 숫자가 데이터에 아예 없어서 매번 추측으로 끝났다.
       ✅ 이제 수신(receiver) 통계도 함께 잰다 — 받은 영상 손실·오디오 손실·
          **영상이 멈춘 횟수(freezeCount)**·**소리가 메워진 비율(concealedSamples)**.
          concealed 는 «끊겨서 브라우저가 메꾼 소리» 라 「소리가 끊긴다」의 직접 지표다.
     [원인 ③] 평균만 남겼다. 1분 평균 1.9% 는 «양호» 로 보이는데 그 안에 20~27%
       스파이크가 들어 있었다. ✅ p95(상위 5%)를 함께 남긴다.
     [원인 ④] 동시에 붙어 있던 상대 수를 안 남겼다. 표본 수가 두 배로 나오는데
       그것이 «유령 연결» 인지 «진짜 두 명» 인지 가릴 수가 없었다. ✅ peers 로 남긴다.

   ⚠️ `vcRoomId` 는 **bare 식별자로만** 읽는다. idx-main.js 의 `let vcRoomId` 라
      `window.vcRoomId` 는 영원히 undefined 다(CLAUDE.md 2장 — 한 달간 방 번호가
      99.7% 비어 있던 사고의 원인). classic script 끼리는 전역 어휘 바인딩을 공유한다.

   ⚠️ 수신 계측 타이머는 **수업 중에만** 산다. 첫 vcQualityAcc() 호출(=수업 중)에서
      켜지고, `body.vc-in-call` 이 사라지면 스스로 꺼진다.
      ⛔ 상주 setInterval 도, body class MutationObserver 도 쓰지 않는다 —
         둘 다 이 저장소에서 홈 전체를 멎게 한 전력이 있다(CLAUDE.md 2장).

   [🔔 2026-09-01 «사람에게 알려 주기» — 사장님 「박주형 학생 회선 문제는 어떻게 알려주지?」]
     🔴 자동 문자·알림톡은 **구조적으로 불가능**하다. D1 실측(2026-09-01): 학생 29,461명 전원
        `student_phone`·`phone`·`parent_phone`·`kakao_id`·`parent_kakao_id` 가 **전부 0건**이고
        학부모 계정 연결(`parent_user_id`)도 0건이다. 번호는 카페24 원본에만 있다.
        ⛔ 「번호가 없으니 0명에게 보냈다」를 성공으로 보고하지 말 것(CLAUDE.md 2장).
     ✅ 그래서 **연락처 없이 바로 닿는 유일한 길 = 화면**이다. 두 가지를 여기서 한다:
        ① 내 회선이 나쁘면 **나에게** 안내 토스트(학생·강사 공통)
        ② 상대 회선이 나쁘면 **강사에게만** 그 타일에 표시(강사가 말을 천천히 하거나
           카메라를 끄게 안내할 수 있다. 학생 화면에는 안 띄운다 — 어린 학생에게
           「상대가 문제」는 도움이 안 되고 서로 탓하게 된다)
     ⚠️ 이 파일은 defer 라 첫 화면 예산(blocking)에 잡히지 않는다. idx-main.js 에 넣지 말 것.
     ⛔ 자주 띄우면 아무도 안 읽는다 — 지속(연속 4틱=16초) + 재공지 간격(3분) 을 둔다.

   🟢 (2026-07-24 비용절감) 30초 → 60초. 이 값은 «강사 회선이 대체로 어떤가» 를 보는
      용도라 1분 요약으로 충분하다. D1 쓰기 2배 감소.
   ═══════════════════════════════════════════════════════════════════════════ */

/* 🪪 로그에 적을 «누구» — 학생 키 → 관리자 세션 → 화면 이름표 순으로 떨어진다.
   ⚠️ 셋 다 실패하면 uid 가 비고 서버가 그 로그를 버린다. 그게 8/26~9/1 의 사각지대였다. */
function vcqWho() {
    var out = { uid: '', name: '', role: '' };
    try {
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (u && u.uid) return { uid: String(u.uid), name: String(u.name || u.uid), role: String(u.role || '') };
    } catch (_) {}
    try {
        var a = JSON.parse(localStorage.getItem('mangoi_admin_session') || 'null');
        if (a && a.uid) return { uid: String(a.uid), name: String(a.name || a.uid), role: String(a.role || a.server_role || '') };
    } catch (_) {}
    /* 마지막 수단 — 화면 이름표. 아이디가 아니라 표시 이름이라 집계는 거칠지만,
       «아무 기록도 안 남는» 것보다는 낫다. 이름만 있는 행은 uid 와 name 이 같다. */
    try {
        var el = document.getElementById('vc-local-label');
        var nm = (el && el.textContent || '').replace(/\s*\((?:나|Me)\)\s*$/i, '').trim();
        if (nm) return { uid: nm, name: nm, role: '' };
    } catch (_) {}
    return out;
}

/* 📥 수신 통계 — «내가 받는 화면·소리» 를 잰다(원인 ② 참고).
   ⚠️ 델타 기준값(__vcRxPrev)은 60초 전송으로 초기화되는 Q 와 따로 둔다.
      Q 안에 두면 전송 직후 한 틱이 통째로 버려진다. */
/* Fast receive recovery shares vcqRxTick's reports. No timer, observer or extra getStats.
   A confirmed incident owns each level once; a recovered incident has a 30s cooldown.
   AAO hysteresis and peer liveness remain separate and unchanged. */
function vcRecoveryLog(event, id, pc, R, level) {
    try {
        var tr = R && R.video && R.video.track;
        if (!tr && pc && pc.getReceivers) { var rv = pc.getReceivers().find(function (r) { return r.track && r.track.kind === 'video'; }); tr = rv && rv.track; }
        console.log('[vc-recovery] ' + event, {
            roomId: typeof vcRoomId === 'undefined' ? '' : vcRoomId,
            peerId: id, role: window.vcMyRole || vcqWho().role || '',
            iceState: pc && pc.iceConnectionState, connectionState: pc && pc.connectionState,
            audioPacketsDelta: R && R.audio ? R.audio.dr : null,
            videoPacketsDelta: R && R.video ? R.video.dr : null,
            framesDecodedDelta: R && R.video ? R.video.dfr : null,
            track: { readyState: tr ? tr.readyState : null, enabled: tr ? tr.enabled : null },
            elapsedMs: R && R.started ? Date.now() - R.started : 0,
            recoveryLevel: level == null ? (R && R.level || 0) : level,
            path: R && R.path || 'sender'
        });
    } catch (_) {}
}
function vcRecoveryOwnsPeer(id, pc) {
    if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return false;
    var R = (window.__vcRxRecovery || {})[id];
    return !!(R && (R.pc === pc || R.rebuilding) && R.managed && !vcAaoSfuCut());
}
function vcRecoverySend(id, action, token) {
    try {
        if (!vcConn || !vcConn.ws || vcConn.ws.readyState !== 1) return false;
        vcConn.send({ type: 'video-recovery', data: { targetUserId: id, action: action, token: token } });
        return true;
    } catch (_) { return false; }
}
function vcRecoveryVideoWanted(pc) {
    var s = pc && pc.getSenders && pc.getSenders().find(function (x) { return x.track && x.track.kind === 'video'; });
    if (!s || s.track.readyState !== 'live' || s.track.enabled === false || vcAaoSfuCut()) return null;
    if (!window.__vcScreenSharing && ((typeof vcCamOn !== 'undefined' && vcCamOn === false)
        || (window.__vcAAO && window.__vcAAO.active))) return null;
    return s;
}
async function vcRecoveryMessage(data) {
    if (!data || !document.body || !document.body.classList.contains('vc-in-call')) return;
    var id = data.fromUserId, pc = (window.vcPeerConnections || {})[id];
    if (!pc || pc.connectionState === 'closed' || vcAaoSfuCut()) return;
    var R = (window.__vcRxRecovery || {})[id];
    if (data.action === 'ready') {
        if (R && R.token === data.token) { pc.__vcRecoveryCapable = true; }
        return;
    }
    if (data.action === 'camera-off' || data.action === 'aao') {
        if (!R || R.token !== data.token) return;
        (window.vcRemoteCamOff || (window.vcRemoteCamOff = {}))[id] = data.action === 'aao' ? 'aao' : 'user';
        pc.__vcRecoveryCapable = true;
        if (data.action === 'camera-off' || R.path !== 'media-path-dead') {
            vcRecoveryCancel(R); R.bad = 0; R.started = 0; R.level = -1;
        }
        try { window.vcApplyRemoteCamHint(id); } catch (_) {}
        return;
    }
    if (!['sender-reapply', 'renegotiate', 'ice-restart'].includes(data.action)) return;
    var sender = vcRecoveryVideoWanted(pc);
    var current = pc.getSenders && pc.getSenders().find(function (x) { return x.track && x.track.kind === 'video'; });
    var manualOff = !window.__vcScreenSharing && ((typeof vcCamOn !== 'undefined' && vcCamOn === false)
        || (current && current.track.enabled === false));
    var aaoOff = !window.__vcScreenSharing && window.__vcAAO && window.__vcAAO.active;
    if (manualOff || (aaoOff && data.action !== 'ice-restart')) {
        vcRecoverySend(id, manualOff ? 'camera-off' : 'aao', data.token);
        return; // Missing/ended sender is NOT evidence that a person turned the camera off.
    }
    var seen = pc.__vcRecoveryCommands || (pc.__vcRecoveryCommands = {});
    var last = seen[data.action];
    if (last && (last.token === data.token || Date.now() - last.at < 12000)) return;
    seen[data.action] = { token: data.token, at: Date.now() };
    pc.__vcRecoveryCapable = true;
    if (data.action === 'sender-reapply') {
        try {
            if (!sender) throw new Error('No live video sender');
            var p = sender.getParameters();
            if (!p.encodings || !p.encodings.length) p.encodings = [{}];
            // Keep current adaptive bitrate, fps and scale; never restore high-quality defaults.
            p.encodings[0].active = true;
            await sender.setParameters(p);
            vcRecoveryLog('sender-reapply', id, pc, R, 0);
        } catch (_) {} // The v15 4s reapply remains the retry path.
        if ((window.vcPeerConnections || {})[id] === pc) vcRecoverySend(id, 'ready', data.token);
    } else {
        // Only the smaller ID offers. The other endpoint requests that owner to negotiate.
        if (typeof vcUserId !== 'undefined' && String(vcUserId) < String(id)) {
            await vcRecoveryNegotiate(id, pc, data.action === 'ice-restart', R, true);
        }
    }
}
async function vcRecoveryNegotiate(id, pc, ice, R, requested) {
    if (!pc.__vcRecoveryCapable || pc.__vcRecoveryOffering || pc.signalingState !== 'stable') return false;
    if ((window.vcPeerConnections || {})[id] !== pc || !vcConn || !vcConn.ws || vcConn.ws.readyState !== 1) return false;
    var off = (window.vcRemoteCamOff || {})[id];
    if ((off && !(ice && off === 'aao')) || vcAaoSfuCut()) return false;
    if (pc.__vcRecoveryNegoAt && Date.now() - pc.__vcRecoveryNegoAt < 12000) return false;
    if (ice && !(pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.connectionState === 'failed')) return false;
    if (ice && R && R.audio && R.audio.dr > 0) return false;
    if (!ice && !requested && typeof vcUserId !== 'undefined' && String(vcUserId) > String(id)) {
        return vcRecoverySend(id, ice ? 'ice-restart' : 'renegotiate', R.token);
    }
    pc.__vcRecoveryOffering = true;
    pc.__vcRecoveryNegoAt = Date.now();
    try {
        if (ice) pc.restartIce();
        var offer = await pc.createOffer(ice ? { iceRestart: true } : undefined);
        // An incoming offer may have won while createOffer was pending. Do not overwrite it.
        if (pc.signalingState !== 'stable' || (window.vcPeerConnections || {})[id] !== pc || ((window.vcRemoteCamOff || {})[id] && !(ice && (window.vcRemoteCamOff || {})[id] === 'aao'))) return false;
        if (typeof vcTuneAudioSdp === 'function') offer.sdp = vcTuneAudioSdp(offer.sdp);
        await pc.setLocalDescription(offer);
        if ((window.vcPeerConnections || {})[id] !== pc) return false;
        vcConn.send({ type: 'offer', data: { targetUserId: id, sdp: pc.localDescription, recovery: true } });
        vcRecoveryLog(ice ? 'ice-restart' : 'renegotiate', id, pc, R, ice ? 3 : 2);
        return true;
    } catch (_) { return false; }
    finally { pc.__vcRecoveryOffering = false; }
}
function vcRecoveryCancel(R) {
    if (R && R.frameVideo && R.frameCallback != null && R.frameVideo.cancelVideoFrameCallback) {
        try { R.frameVideo.cancelVideoFrameCallback(R.frameCallback); } catch (_) {}
    }
    if (R) { R.frameCallback = null; R.frameVideo = null; }
}
function vcRecoveryClearOverlay(id) {
    if ((window.vcRemoteCamOff || {})[id] === 'user') return;
    var box = document.getElementById('vc-video-' + id);
    var off = window.vcRemoteCamOff || {};
    if (off[id] === 'aao') {
        delete off[id];
        try { window.vcApplyRemoteCamHint(id); } catch (_) {}
    }
    if (!box || !box.querySelector) return;
    if (box.querySelector('.vc-aao-still') || box.querySelector('.vc-aao-freeze')
        || (box.classList && box.classList.contains('vc-aao-on'))) {
        try { vcAaoFreeze(box, id, false); } catch (_) {}
    }
    ['.vc-black-hint', '.vc-camoff-hint'].forEach(function (sel) { var e = box.querySelector(sel); if (e) e.remove(); });
}
function vcRecoveryRecovered(id, pc, R) {
    if ((window.vcRemoteCamOff || {})[id] === 'user') return;
    vcRecoveryClearOverlay(id);
    if (R.started) {
        vcRecoveryLog('recovered', id, pc, R);
        R.cooldown = Date.now() + 30000;
    }
    vcRecoveryCancel(R);
    R.bad = 0; R.dead = 0; R.started = 0; R.level = -1; R.done = {}; R.rebuilding = false;
    R.negoPending = null; R.negoRetryAt = 0;
}
function vcRecoveryElement(id, pc, R) {
    var tr = R.video && R.video.track;
    var box = document.getElementById('vc-video-' + id), v = box && box.querySelector && box.querySelector('video');
    if (!tr || tr.readyState !== 'live' || !v || (window.vcRemoteCamOff || {})[id]) return false;
    var s = v.srcObject;
    if (!s || !s.getVideoTracks || !s.getVideoTracks().some(function (t) { return t === tr; })) {
        if (typeof MediaStream === 'undefined') return false;
        if (!s || !s.addTrack) s = new MediaStream();
        s.getVideoTracks().forEach(function (t) { if (t !== tr) s.removeTrack(t); });
        s.addTrack(tr); v.srcObject = s;
    }
    try { var p = v.play && v.play(); if (p && p.catch) p.catch(function () {}); } catch (_) {}
    vcRecoveryLog('video-element-recover', id, pc, R, 1);
    return true;
}
function vcRecoveryWatchFrame(id, pc, R) {
    if (R.frameCallback != null) return;
    var box = document.getElementById('vc-video-' + id), v = box && box.querySelector && box.querySelector('video');
    if (!v || !v.requestVideoFrameCallback) return;
    R.frameVideo = v;
    R.frameCallback = v.requestVideoFrameCallback(function () {
        R.frameCallback = null;
        if ((window.__vcRxRecovery || {})[id] !== R || (window.vcPeerConnections || {})[id] !== pc) return;
        if ((window.vcRemoteCamOff || {})[id]) return; // AAO needs a later stats sample, not a buffered old callback.
        vcRecoveryRecovered(id, pc, R);
    });
}

function vcqRxRecoverySample(id, kind, sample, pc, receiver, seq) {
    try {
        if (!id || !sample) return;
        var all = window.__vcRxRecovery || (window.__vcRxRecovery = {});
        var R = all[id];
        if (!R || (R.pc !== pc && !R.rebuilding)) {
            vcRecoveryCancel(R);
            R = all[id] = { pc: pc, seq: -1, bad: 0, dead: 0, level: -1, done: {}, aaoSeenSeq: -1 };
        }
        R.pc = pc;
        if (seq < R.seq) return;
        if (R.seq !== seq) {
            if (R.seq >= 0 && (seq !== R.seq + 1 || R.consumed !== R.seq)) { R.bad = 0; R.dead = 0; }
            R.seq = seq; R.video = null; R.audio = null;
        }
        if (kind === 'video') R.video = { dr: sample.dr, dfr: sample.dfr, known: sample.known,
            stalledKnown: sample.stalledKnown == null ? sample.known : sample.stalledKnown,
            progress: sample.progress == null ? sample.dfr : sample.progress, packetsKnown: sample.packetsKnown !== false, track: receiver && receiver.track };
        else if (kind === 'audio') R.audio = { dr: sample.dr, known: sample.known !== false };
        var off = window.vcRemoteCamOff || {}, why = off[id];
        if (why === 'user') { vcRecoveryCancel(R); R.bad = 0; R.dead = 0; R.started = 0; return; }
        var tr = R.video && R.video.track;
        var box = document.getElementById('vc-video-' + id), v = box && box.querySelector && box.querySelector('video');
        var total = v && v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality().totalVideoFrames : null;
        var displayed = kind === 'video' && v === R.lastVideo && typeof total === 'number' && typeof R.total === 'number' && total > R.total;
        if (kind === 'video') { R.lastVideo = v; R.total = total; }
        var fresh = kind === 'video' && ((sample.known && sample.dfr > 0) || displayed);
        if (why === 'aao') {
            if (R.aaoSeenSeq < 0) R.aaoSeenSeq = seq;
            if (fresh && seq > R.aaoSeenSeq) { vcRecoveryRecovered(id, pc, R); why = off[id]; }
            else { R.bad = 0; } // Intentional video pause; a failed audio+video transport still needs ICE recovery.
        } else R.aaoSeenSeq = -1;
        var connected = pc && pc.connectionState === 'connected'
            && (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed');
        if (fresh && why !== 'aao') {
            vcRecoveryRecovered(id, pc, R);
            // Decoding can be healthy while the video element lost its track.
            var attached = v && v.srcObject && v.srcObject.getVideoTracks && v.srcObject.getVideoTracks().includes(tr);
            if (connected && tr && tr.readyState === 'live' && (!attached || v.paused)
                && (!R.attachAt || Date.now() - R.attachAt >= 12000)) {
                R.attachAt = Date.now(); vcRecoveryElement(id, pc, R);
            }
        }
        if (!R.video || !R.audio || R.consumed === seq) return;
        R.consumed = seq;
        tr = R.video.track;
        R.managed = R.rebuilding || !!(tr && tr.readyState === 'live' && R.video.stalledKnown && R.audio.known);
        if ((typeof vcIsObserver !== 'undefined' && vcIsObserver) || !R.managed || tr.enabled === false || vcAaoSfuCut()) { R.bad = 0; R.dead = 0; return; }
        if (R.video.progress > 0 || displayed) { R.bad = 0; R.dead = 0; return; }
        var videoOnly = !why && connected && R.audio.dr > 0;
        var transportDead = (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.connectionState === 'failed')
            && R.audio.dr === 0 && R.video.packetsKnown && R.video.dr === 0;
        R.bad = videoOnly ? R.bad + 1 : 0;
        R.dead = transportDead ? R.dead + 1 : 0;
        if (!videoOnly && !transportDead) return; // Silence/DTX on connected ICE is not a dead path.
        if (R.cooldown && Date.now() < R.cooldown) return;
        if (!R.started) {
            R.started = Date.now(); R.token = id + ':' + R.started; R.done = {}; R.level = 0;
            R.path = videoOnly ? 'video-only' : 'media-path-dead';
            if (vcRecoverySend(id, 'sender-reapply', R.token)) vcRecoveryLog('sender-reapply', id, pc, R, 0);
            vcRecoveryWatchFrame(id, pc, R);
        }
        if (R.bad >= 2 && !R.done[1]) {
            R.path = 'VIDEO_STALLED'; R.level = 1; R.done[1] = Date.now();
            vcRecoveryLog('video-stalled', id, pc, R);
            vcRecoveryElement(id, pc, R);
            vcRecoveryWatchFrame(id, pc, R);
        } else if (R.bad >= 3 && R.done[1] && !R.done[2] && !R.negoPending
            && (!R.negoRetryAt || Date.now() >= R.negoRetryAt)
            && pc.__vcRecoveryCapable && pc.signalingState === 'stable') {
            // A closed signaling socket, cooldown or rejected offer is not a sent offer.
            // Retry on the existing tick, bounded to 12s; successful stages still run once.
            var attempt = { token: R.token };
            R.level = 2; R.negoPending = attempt; R.negoRetryAt = Date.now() + 12000;
            vcRecoveryNegotiate(id, pc, false, R).then(function (sent) {
                if (R.negoPending !== attempt) return;
                R.negoPending = null;
                if (sent && R.started && R.token === attempt.token
                    && (window.__vcRxRecovery || {})[id] === R
                    && (window.vcPeerConnections || {})[id] === pc) R.done[2] = Date.now();
            });
        }
        if (R.dead >= 2 && !R.done[3] && !R.icePending && pc.__vcRecoveryCapable && pc.signalingState === 'stable') {
            R.path = 'media-path-dead'; R.level = 3; R.icePending = true;
            vcRecoveryNegotiate(id, pc, true, R).then(function (sent) {
                R.icePending = false;
                if (sent && R.started) R.done[3] = Date.now();
            });
        } else if (R.dead >= 2 && R.done[3] && !R.done[4] && Date.now() - R.done[3] >= 12000) {
            if (typeof __vcReconnectAt !== 'undefined' && __vcReconnectAt[id] && Date.now() - __vcReconnectAt[id] < 8000) return;
            R.level = 4; R.done[4] = Date.now(); R.rebuilding = true;
            (window.__vcForceRelay || (window.__vcForceRelay = {}))[id] = true;
            vcRecoveryLog('peer-rebuild', id, pc, R);
            if (typeof vcReconnectPeer === 'function') vcReconnectPeer(id);
        }
    } catch (_) {}
}

function vcqRxTick() {
    var Q = window.__vcQ; if (!Q) return;
    var pcs = window.vcPeerConnections || {};
    var ids = Object.keys(pcs);
    Q.p.push(ids.length);
    var prevAll = window.__vcRxPrev || (window.__vcRxPrev = {});
    var recovery = window.__vcRxRecovery || {};
    Object.keys(recovery).forEach(function (id) {
        if (!pcs[id] && (!recovery[id].rebuilding || Date.now() - recovery[id].done[4] > 30000)) { vcRecoveryCancel(recovery[id]); delete recovery[id]; }
    });
    var rxSeq = (window.__vcRxSeq = (window.__vcRxSeq || 0) + 1);
    try { vcqLowQSelf(); } catch (_) {}   // 📶 내가 저화질로 보내는 중이면 내 타일에 배지
    try { vcqDupTabWatch(); } catch (_) {}   // 👥 같은 계정 둘째 탭(③)
    try { vcqWrapCreatePeer(); } catch (_) {}   // ② 로드 순서상 아직 못 감쌌으면 여기서
    try { vcqWrapAAONotify(); } catch (_) {}    // ④ 같은 이유
    ids.forEach(function (id) {
        var pc = pcs[id];
        try { vcqPathProbe(id, pc); } catch (_) {}   // 🛰 이 연결이 중계인지 직접인지(아래 vcqPathProbe)
        if (!pc || !pc.getReceivers) return;
        pc.getReceivers().forEach(function (r) {
            if (!r || !r.track || !r.getStats || r.__vcRxReading) return;
            var kind = r.track.kind;
            if (kind !== 'video' && kind !== 'audio') return;
            r.__vcRxReading = true;
            Promise.resolve().then(function () { return r.getStats(); }).then(function (st) {
                if ((window.vcPeerConnections || {})[id] !== pc) return;
                st.forEach(function (s) {
                    if (s.type !== 'inbound-rtp' || ((s.kind || s.mediaType) && (s.kind || s.mediaType) !== kind)) return;
                    var key = id + ':' + kind;
                    var prev = prevAll[key];
                    var sameMedia = prev && prev.pc === pc && prev.statId === s.id && prev.trackId === r.track.id;
                    var lost = s.packetsLost || 0, rec = s.packetsReceived || 0;
                    var dl = Math.max(0, lost - ((prev && prev.lost) || 0));
                    var dr = Math.max(0, rec - ((prev && prev.rec) || 0));
                    /* 💀 이 종류(영상/오디오)가 «조용한» 틱을 센다(위 vcPeerNoMedia 참고).
                       ⚠️ 첫 틱은 기준값이 없어 세지 않는다 — 안 그러면 막 붙은 상대가 죽은 것이 된다. */
                    if (prev) {
                        var SIL = window.__vcPeerSilence || (window.__vcPeerSilence = {});
                        var sp = SIL[id] || (SIL[id] = {});
                        sp[kind] = (dr > 0) ? 0 : (sp[kind] || 0) + 1;
                    }
                    if (kind === 'video') {
                        try { vcLowQRemote(id, s.frameWidth || 0, dr > 0); } catch (_) {}   // 📶 저화질로 받는 중이면 그 타일에 배지
                        var fz = s.freezeCount || 0;
                        var frKnown = (typeof s.framesDecoded === 'number');
                        var fr = frKnown ? s.framesDecoded : 0;
                        var frameKnown = !!(sameMedia && frKnown && typeof prev.fr === 'number' && fr >= prev.fr);
                        var dfr = frameKnown ? fr - prev.fr : 0;
                        var receivedKnown = !!(sameMedia && typeof s.framesReceived === 'number' && typeof prev.received === 'number' && s.framesReceived >= prev.received);
                        var progress = frKnown ? dfr : receivedKnown ? s.framesReceived - prev.received : 0;
                        if (prev) {
                            if (dl + dr >= 25) {
                                var lp = 100 * dl / (dl + dr);
                                Q.rxv.push(lp);
                                /* 🔔 이 상대에게서 오는 영상이 계속 깨지면 = 그 사람 업링크가 나쁘다.
                                   연속 3번(약 12초) 이어질 때만 표시하고, 회복되면 곧바로 뗀다. */
                                var B = window.__vcRxBad || (window.__vcRxBad = {});
                                B[id] = (lp >= 8) ? (B[id] || 0) + 1 : 0;
                                vcNetPeerMark(id, (B[id] || 0) >= 3);
                            }
                            Q.rxf += Math.max(0, fz - (prev.fz || 0));
                        }
                        prevAll[key] = { pc: pc, statId: s.id, trackId: r.track.id, lost: lost, rec: rec, fz: fz, fr: frKnown ? fr : null, received: s.framesReceived };
                        try { vcqRxRecoverySample(id, 'video', { dr: dr, dfr: dfr, known: frameKnown, stalledKnown: frKnown ? frameKnown : receivedKnown, progress: progress, packetsKnown: !!sameMedia && typeof s.packetsReceived === 'number' && rec >= prev.rec }, pc, r, rxSeq); } catch (_) {}
                    } else {
                        var cs = s.concealedSamples || 0, ts = s.totalSamplesReceived || 0;
                        if (prev) {
                            if (dl + dr >= 8) Q.rxa.push(100 * dl / (dl + dr));
                            var dcs = Math.max(0, cs - (prev.cs || 0)), dts = Math.max(0, ts - (prev.ts || 0));
                            /* 메워진 소리 비율 — «끊겨서 브라우저가 만들어 낸 소리» 다.
                               표본이 너무 적으면(무음·DTX) 비율이 튀므로 버린다. */
                            if (dts >= 4000) Q.rxc.push(100 * dcs / dts);
                        }
                        prevAll[key] = { pc: pc, statId: s.id, trackId: r.track.id, lost: lost, rec: rec, cs: cs, ts: ts };
                        try { vcqRxRecoverySample(id, 'audio', { dr: dr, known: !!sameMedia && typeof s.packetsReceived === 'number' && rec >= prev.rec }, pc, r, rxSeq); } catch (_) {}
                    }
                });
            }).catch(function () {}).finally(function () { r.__vcRxReading = false; });
        });
    });
}

/* 🛰 연결 «경로» — 중계(TURN)로 가는가, 직접(P2P)으로 가는가 (2026-09-03)
   [왜] class-1016 Farrah↔ysyt01 · meet-123 Farrah↔Karl: RTT 가 600~1,700ms 였다가 15:06 에
     60~85ms 로 «뚝» 떨어졌다. 같은 두 사람·같은 PC 인데 2분 사이에 경로가 바뀐 것인지, 회선이 풀린 것인지
     가릴 데이터가 «없었다» — 이 표는 손실·RTT 만 담고 «어떤 길로 갔는가» 는 한 칸도 없었다.
     그래서 Globe 회선인지·TURN 중계인지·Cloudflare 어느 서버인지를 매번 추측으로 끝냈다(CLAUDE.md 2장
     「원인을 «찾았다» 고 보고했는데 알고 보니 추론이었음」과 같은 뿌리).
   [무엇] 4초마다 선택된 candidate-pair 를 읽어 local/remote 후보 종류를 본다.
     · 한쪽이라도 relay 면 «중계», 둘 다 host/srflx/prflx 면 «직접». 아직 선택 전이면 «모름»(안 센다).
     · 내 쪽이 relay 면 그 TURN 서버 주소(host:port)와 relayProtocol(udp/tcp/tls)도 적는다 —
       Cloudflare 인지 무료 openrelay 폴백인지가 여기서 갈린다(X-Turn-Source 는 «발급» 이지 «실제 사용» 이 아니다).
     · 상대 쪽만 relay 면 서버 주소는 알 수 없다(그건 상대의 TURN 이다) — 빈 값으로 둔다. 지어내지 않는다.
   ⛔ «모름» 을 «직접» 으로 적지 말 것 — 연결 전·getStats 없음(옛 브라우저)은 path_ticks 0 으로 남겨
      서버·화면이 «—» 로 그린다. 0 ticks 를 «직접 100%» 로 읽으면 이 칸을 만든 이유가 사라진다.
   ⚠️ 이 탐침은 통화 경로와 무관하다 — getStats 가 던져도 catch 로 삼키고, 아무것도 안 바꾼다.
   감시: vc_quality_blindspot_harness ⑬ */
function vcqTurnHost(url) {
    try {
        var u = String(url || '').replace(/^turns?:/i, '').replace(/^stuns?:/i, '');
        return u.split('?')[0].slice(0, 80);
    } catch (_) { return ''; }
}
function vcqPathProbe(id, pc) {
    if (!pc || typeof pc.getStats !== 'function') return;
    var Q = window.__vcQ; if (!Q) return;
    pc.getStats().then(function (st) {
        var byId = {}, selId = null, pair = null;
        st.forEach(function (s) {
            if (!s || !s.id) return;
            byId[s.id] = s;
            if (s.type === 'transport' && s.selectedCandidatePairId) selId = s.selectedCandidatePairId;
        });
        if (selId && byId[selId]) pair = byId[selId];
        if (!pair) st.forEach(function (s) { if (!pair && s && s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
        if (!pair) return;                                   // 아직 연결 전 — «모름», 세지 않는다
        var lc = byId[pair.localCandidateId] || {}, rc = byId[pair.remoteCandidateId] || {};
        var relay = (lc.candidateType === 'relay' || rc.candidateType === 'relay');
        var turn = (lc.candidateType === 'relay') ? vcqTurnHost(lc.url) : '';
        var proto = (lc.candidateType === 'relay') ? String(lc.relayProtocol || '') : '';
        var P = window.__vcPath || (window.__vcPath = {});
        var prev = P[id];
        var cur = { relay: relay, turn: turn, proto: proto, kinds: (lc.candidateType || '?') + '/' + (rc.candidateType || '?') };
        if (!prev || prev.relay !== cur.relay || prev.turn !== cur.turn) {
            try { console.log('[vc-path]', id, relay ? '중계(TURN)' : '직접(P2P)', cur.kinds, turn ? (turn + ' ' + proto) : ''); } catch (_) {}
        }
        P[id] = cur;
        Q.pt = (Q.pt || 0) + 1;
        if (relay) Q.pr = (Q.pr || 0) + 1;
        if (turn) { Q.turn = turn; Q.proto = proto; }
    }).catch(function () {});
}

/* ═══ 2026-09-03 «2층 2·3·4번» — 사장님 「진행해줘」(Farrah 1초 RTT 사고 후속) ═══
   ② 낮게 시작해서 올라가기(vcqStartStep·vcqWrapCreatePeer)
   ③ 같은 계정 둘째 탭 경고(vcqDupTabWatch)
   ④ 안내 문구에 «왜» 를 싣기(vcqWhyLine·vcAAONotify 감싸기)
   ⚠️ 셋 다 idx-main.js(blocking 849KB, 첫 화면 예산 여유 ~100B)를 한 줄도 안 건드린다 —
      전역 함수(vcCreatePeer·vcAAONotify)를 «밖에서 감싸는» 방식이다(CLAUDE.md 2장 「blocking 파일을 못 고칠 때」).
      그 이름이 바뀌면 조용히 헛돈다 — 하니스 ⑭가 «그 이름이 아직 있는가» 를 대조한다. */

/* ② «낮게 시작» — 회선의 «평소 RTT» 를 알면 첫 연결부터 한두 단계 아래서 시작한다.
   [왜] 적응 루프는 «상한에서 시작해 나빠지면 내린다». Farrah 회선(RTT 600~1,200ms)에서는 첫 16초 동안
     상한(1.2Mbps)으로 쏘다가 업로드가 줄을 서고, 그 줄이 곧 RTT 1초다. 낮게 시작하면 줄이 «애초에» 안 쌓인다.
   [근거] 이 세션의 기준 RTT(vcNetSelfWatch 가 «좋은 틱» 에서만 배운 값) → 없으면 지난 수업이 남긴 값(7일).
   [문턱] 300ms 이상 → 1단계(0.6배) · 450ms 이상 → 2단계(0.35배). ⚠️ 화질 모드가 '저'(기본, 이미 360p·400kbps)면
     최대 1단계까지만 — 2단계면 1/4 해상도(160px)라 얼굴이 안 보인다.
   ⛔ 모르면 0(=지금과 같음). 국내 130ms 회선은 아무것도 안 바뀐다. 올라오는 것은 기존 «32초 조용함» 규칙 그대로. */
var VCQ_RTTBASE_KEY = 'mangoi_vc_rttbase';
var VCQ_RTTBASE_TTL = 7 * 86400000;
function vcqKnownRttBase() {
    try { var W = window.__vcNetSelf; if (W && typeof W.rttBase === 'number' && W.rttBase > 0) return W.rttBase; } catch (_) {}
    try {
        var j = JSON.parse(localStorage.getItem(VCQ_RTTBASE_KEY) || 'null');
        if (j && typeof j.rtt === 'number' && j.rtt > 0 && (Date.now() - (j.at || 0)) < VCQ_RTTBASE_TTL) return j.rtt;
    } catch (_) {}
    return 0;
}
function vcqSaveRttBase() {
    try {
        var W = window.__vcNetSelf;
        if (!W || typeof W.rttBase !== 'number' || !(W.rttBase > 0)) return;
        localStorage.setItem(VCQ_RTTBASE_KEY, JSON.stringify({ rtt: Math.round(W.rttBase), at: Date.now() }));
    } catch (_) {}
}
function vcqStartStep() {
    var base = vcqKnownRttBase();
    if (!(base >= 300)) return 0;
    var step = base >= 450 ? 2 : 1;
    try { if (typeof window.vcGetQuality === 'function' && window.vcGetQuality() === 'low') step = Math.min(step, 1); } catch (_) {}
    return step;
}
function vcqWrapCreatePeer() {
    try {
        var orig = window.vcCreatePeer;
        if (typeof orig !== 'function' || orig.__vcqWrapped) return;
        var wrapped = function () {
            var pc = orig.apply(this, arguments);
            try {
                var obs = (typeof vcIsObserver !== 'undefined') && !!vcIsObserver;   // 참관자는 보내는 영상이 없다
                var st = obs ? 0 : vcqStartStep();
                if (pc && st > 0 && !(pc.__qStep > st)) {
                    pc.__qStep = st;   // 적응 루프의 첫 틱(__qInit)이 이 단계로 applyStep 한다
                    console.log('[vc-startlow] 평소 RTT ' + Math.round(vcqKnownRttBase()) + 'ms → ' + st + '단계로 시작');
                }
            } catch (_) {}
            return pc;
        };
        wrapped.__vcqWrapped = true;
        window.vcCreatePeer = wrapped;
    } catch (_) {}
}
vcqWrapCreatePeer();

/* ③ 같은 계정 둘째 탭 — «내 이름과 같은 상대» 가 붙어 있으면 나에게 알린다.
   [왜] class-1016(2026-09-03)에서 학생 세션이 «둘» 동시에 열려 있었고(둘째는 수업 뒤 15:00 까지 생존)
     mesh 라 그 순간 업로드가 두 갈래였다. 끊지는 않는다 — 가족 공용 계정이 실재해 자동으로 끊으면
     서로를 쫓아낸다(idx-vc-dupghost.js 의 «무한 킥» 경고). 5분에 한 번만, 살아 있는 연결만(죽은 유령은 dupghost 몫). */
function vcqNormName(s) {
    return String(s || '').replace(/\s*\((?:나|Me)\)\s*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
function vcqDupTabWatch() {
    try {
        var el = document.getElementById('vc-local-label');
        var me = vcqNormName(el && el.textContent);
        if (!me) return;
        var pcs = window.vcPeerConnections || {}, dup = false;
        Object.keys(pcs).forEach(function (id) {
            var pc = pcs[id]; if (!pc || !pc.__username) return;
            var cs = pc.connectionState || pc.iceConnectionState || '';
            if (cs === 'closed' || cs === 'failed') return;
            if (vcqNormName(pc.__username) === me) dup = true;
        });
        var D = window.__vcDupTab || (window.__vcDupTab = { at: 0 });
        if (!dup) return;
        if (Date.now() - (D.at || 0) < 300000) return;
        D.at = Date.now();
        vcNetNotify('👥 <b>같은 계정이 다른 탭·기기에서도 들어와 있어요.</b><br>' +
            '<span style="font-weight:500">수업 탭은 <b>하나만</b> 열어 주세요 — 둘이면 인터넷을 두 배로 씁니다. (가족이 함께 들어온 것이면 무시)</span><br>' +
            '<span style="font-size:12px;opacity:.85">This account is open in another tab/device — keep only one class tab.</span>');
    } catch (_) {}
}

/* ④ 안내에 «왜» — 숫자와 «업로드가 막힌 모양» 을 함께 적는다. 강사가 자기 PC 를 의심하지 않고 정확히 제보하게. */
function vcqWhyLine() {
    try {
        var W = window.__vcNetSelf || {};
        var rtt = (typeof W.lastRtt === 'number') ? Math.round(W.lastRtt) : 0;
        var loss = (typeof W.lastLoss === 'number' && W.lastLoss >= 0) ? W.lastLoss : -1;
        var base = (typeof W.rttBase === 'number') ? Math.round(W.rttBase) : 0;
        if (!rtt && loss < 0) return '';
        var parts = [];
        if (rtt) parts.push('지연 ' + rtt + 'ms' + (base ? '(평소 ' + base + 'ms)' : ''));
        if (loss >= 0) parts.push('손실 ' + loss.toFixed(1) + '%');
        var why = '';
        if (rtt && (loss < 0 || loss < 4) && rtt >= Math.max(400, base + 200)) why = ' · 업로드가 꽉 찬 모양입니다 — 이 회선의 다른 기기·백업·탭을 확인하세요';
        else if (loss >= 4) why = ' · 패킷이 빠집니다 — 와이파이면 유선으로, 유선이면 회선 자체를 확인하세요';
        return '<span style="font-size:11.5px;opacity:.8">' + parts.join(' · ') + why + '</span>';
    } catch (_) { return ''; }
}
function vcqWrapAAONotify() {
    try {
        var orig = window.vcAAONotify;
        if (typeof orig !== 'function' || orig.__vcqWrapped) return;
        var wrapped = function (html) {
            try { if (/audio only|음성만/.test(String(html))) { var w = vcqWhyLine(); if (w) html = String(html) + '<br>' + w; } } catch (_) {}
            return orig.apply(this, arguments);
        };
        wrapped.__vcqWrapped = true;
        window.vcAAONotify = wrapped;
    } catch (_) {}
}
vcqWrapAAONotify();

/* 수업 중에만 사는 타이머. 첫 vcQualityAcc() 에서 켜지고 수업이 끝나면 스스로 꺼진다. */
function vcqRxStart() {
    if (window.__vcRxT) return;
    try {
        window.__vcRxT = setInterval(function () {
            if (!document.body || !document.body.classList.contains('vc-in-call')) {
                try { clearInterval(window.__vcRxT); } catch (_) {}
                Object.keys(window.__vcRxRecovery || {}).forEach(function (id) { vcRecoveryCancel(window.__vcRxRecovery[id]); });
                window.__vcRxRecovery = {};
                window.__vcRxT = null; window.__vcRxPrev = {}; window.__vcPeerSilence = {}; window.__vcLowQ = {}; window.__vcPath = {}; __vcAaoSince = {};
                /* 회선 경고의 기준 RTT·연속카운트도 함께 비운다 — 안 비우면 앞 수업의 기준값이
                   다음 수업으로 넘어간다(위 «나쁜 틱에서는 안 올린다» 때문에 «나쁨» 상태도 넘어간다). */
                try { vcqSaveRttBase(); } catch (_) {}   // ② 다음 수업의 «낮게 시작» 근거(7일)
                window.__vcNetSelf = null;
                return;
            }
            try { vcqRxTick(); } catch (_) {}
            try { vcAaoTick(); } catch (_) {}
        }, 4000);
    } catch (_) {}
}

/* 💀 (2026-09-01 유령 연결 실사고) «이 상대에게서 패킷이 아예 안 온 시간(초)».
   [왜 이게 필요한가] 화면 쪽 유령 청소기는 여태 `track.readyState === 'live'` 로 «살아 있나» 를
     판정했다. 그런데 **원격 트랙은 상대가 사라져도 계속 'live' 다**(ended 는 트랙을 실제로 끝낼 때만).
     그래서 «한 번 붙었다가 신호가 끊긴» 상대는 영원히 «정상» 으로 보였고, 아무도 못 치웠다.
   [실측] class-1070-20260901(2026-09-01) — 출석은 학생1·강사1 두 명뿐인데 학생 브라우저의
     연결 수가 26분에 걸쳐 1→9 로 단조 증가했다(그중 8개가 유령). 학생이 같은 영상을 최대 9벌로
     올리느라 업링크가 포화돼 손실 스파이크가 났다. 그날 저녁 7개 방 중 5개가 같은 모양이었다.
     ⟹ 「학생 인터넷이 나쁘다」로 보이던 것이 실은 우리 코드였다.
   [판정] 오직 «패킷이 오는가» 만 믿는다. 오디오·영상 **둘 다** 조용할 때만 센다 —
     카메라만 끈 사람은 오디오가 흐르므로 죽은 것이 아니다.
   ⚠️ 이 값만으로 지우지 않는다. 지우는 것은 idx-vc-dupghost.js 이고, 거기서
      «같은 이름의 다른 타일이 실제로 받고 있다» 는 비대칭 확인을 그대로 통과해야 한다. */
function vcPeerNoMedia(id) {
    try {
        var S = window.__vcPeerSilence && window.__vcPeerSilence[id];
        if (!S) return 0;
        var ks = Object.keys(S);
        if (!ks.length) return 0;
        var min = Infinity;
        for (var i = 0; i < ks.length; i++) if (S[ks[i]] < min) min = S[ks[i]];
        return (min === Infinity) ? 0 : min * 4;      // 틱 한 번이 4초
    } catch (_) { return 0; }
}
window.vcPeerNoMedia = vcPeerNoMedia;

/* 🔔 안내 토스트 — idx-main.js 의 vcAAONotify 와 «같은 모양, 다른 상자» 다.
   ⛔ 같은 id 를 쓰면 음성전용 안내와 서로 덮어쓴다(둘은 다른 사실을 말한다). */
var __vcNetToastT = null;
function vcNetNotify(html) {
    try {
        var el = document.getElementById('vc-netlow-toast');
        if (!el) {
            el = document.createElement('div'); el.id = 'vc-netlow-toast';
            el.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:99999;max-width:86vw;' +
                'background:rgba(120,53,15,.95);color:#fff7ed;border:1px solid rgba(251,191,36,.55);border-radius:12px;' +
                'padding:10px 16px;font-size:14px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.5);text-align:center;' +
                'opacity:0;transition:opacity .2s;pointer-events:none';
            document.body.appendChild(el);
        }
        el.innerHTML = html; el.style.opacity = '1';
        if (__vcNetToastT) clearTimeout(__vcNetToastT);
        __vcNetToastT = setTimeout(function () { el.style.opacity = '0'; }, 6000);
    } catch (_) {}
}

/* ① 내 회선이 나쁘다 — 학생·강사 모두에게. 판정은 «내가 보내는 것» 의 손실·RTT 다(그게 곧 내 업링크다).

   🔴 2026-09-02 class-849 실측 — 이 함수가 «제일 나쁜 틱» 을 통째로 건너뛰고 있었다.
   사장님이 19분 수업 내내 토스트를 한 번도 못 보셨고, 원인이 둘이었다.
   ① `if (loss === -1) return;` 이 첫 줄이었다. loss === -1 은 «영상 표본이 없던 4초» 이지
      «RTT 를 모른다» 가 아니다 — idx-main.js 는 그 틱에도 `vcQualityAcc(-1, rtt)` 로
      **측정된 RTT 를 그대로 넘긴다**(5060행). 그런데 RTT 가 제일 높았던 두 창이
      19:30:44 RTT 440(novideo 13/15) · 19:34:37 RTT 435(novideo 11/15) 로, 틱의 대부분이
      바로 그 건너뛰는 틱이었다. ⇒ 손실만 보류하고 RTT 는 계속 본다.
   ② 문턱이 절대값 400ms 였다. 중국 회선은 평소가 360~440ms 라(같은 수업 실측)
      떴더라도 «공유기 가까이 가세요» 라는 **틀린 안내**가 된다(지리적 거리는 사람이 못 고친다).
      거꾸로 기준이 130ms 인 국내 학생은 400 이 너무 느슨해 진짜 막힘을 놓친다.
      ⇒ idx-main.js 가 #771 에서 쓴 것과 **같은 방식**으로 «이 회선의 기준값» 대비로 잰다.
         기준값 = 그동안 본 최소 RTT(위로는 틱당 2% 씩만 따라감), 상한 500.
   ⛔ 손실 문턱(8%)은 안 건드린다 — 손실은 «나쁜» 신호라 절대값이 맞고,
      RTT 는 «막힌» 신호라 기준 대비 증가분이 맞다(#771 주석과 같은 구분).
   ⚠️ 기준값은 여기서 따로 잰다 — idx-main.js 는 blocking 849KB 라 첫 화면 예산 때문에
      인자를 늘리지 않았다. 상대가 여럿이면 틱마다 다른 상대의 RTT 가 섞여 들어오는데,
      그건 이 함수가 이미 loss·rtt 를 단일값으로 받던 것과 같은 성질이다(1:1 이 정상 사용). */
function vcNetSelfWatch(loss, rtt) {
    var W = window.__vcNetSelf || (window.__vcNetSelf = { bad: 0, notifiedAt: 0, rttBase: null });
    var rb = Math.min(W.rttBase || 0, 500);
    var rttBad = Math.max(400, rb + 200);                     // 기준 200 미만 회선은 예전 숫자 그대로
    /* ⛔ loss === -1 은 «손실을 모른다» 일 뿐이다. RTT 판정은 그대로 진행한다. */
    var lossBad = (loss !== -1) && (typeof loss === 'number' && loss >= 8);
    var bad = lossBad || (typeof rtt === 'number' && rtt >= rttBad);
    /* 🔴 기준 RTT 는 «나쁘지 않은 틱» 에서만 위로 따라간다.
       그냥 매 틱 올리면 계속 나쁜 회선이 «자기 나쁜 값» 을 평소로 학습해 스스로 정상이 된다 —
       실측(기준 130ms 회선이 410ms 에 계속 머무는 경우): 16틱(약 64초) 만에 문턱이 410 위로 올라가
       **토스트가 사실상 1회만 뜨고 만다**(3분 쿨다운이 끝날 무렵엔 이미 «정상» 이라 두 번째가 없다).
       옛 절대값(400) 때는 3분마다 반복해서 알렸으니 그건 «되던 것» 을 깨는 것이다.
       ⚠️ 여기가 #771(화질 회복)과 갈리는 자리다 — 그쪽은 지연이 높은 회선도 «언젠가 화질을 올려야»
       하므로 계속 따라가는 것이 맞지만, 이쪽은 «네 평소보다 나쁘다» 를 사람에게 말하는 것이라
       평소는 «좋았던 때» 에서만 배워야 한다. ⛔ 이 조건을 지우면 위 1회 문제가 그대로 돌아온다. */
    W.lastRtt = (typeof rtt === 'number' && rtt > 0) ? rtt : W.lastRtt; W.lastLoss = (typeof loss === 'number') ? loss : -1;   // ④ 안내에 «왜» 를 적을 때 쓴다
    if (typeof rtt === 'number' && rtt > 0) {
        if (W.rttBase == null || rtt < W.rttBase) W.rttBase = rtt;      // 내려가는 쪽은 언제나 따라간다
        else if (!bad) W.rttBase = W.rttBase + (rtt - W.rttBase) * 0.02; // 올라가는 쪽은 «괜찮은 틱» 에서만
    }
    if (!bad) { W.bad = 0; return; }
    W.bad++;
    if (W.bad < 4) return;                                    // 연속 4틱(약 16초) — 스파이크 한 번으로는 안 띄운다
    if (Date.now() - (W.notifiedAt || 0) < 180000) return;    // 3분에 한 번만
    W.notifiedAt = Date.now(); W.bad = 0;
    vcNetNotify('📶 <b>인터넷 연결이 불안정합니다.</b><br>' +
        '<span style="font-weight:500">공유기 가까이 가거나, 유선(랜선)으로 연결하면 좋아집니다.</span><br>' +
        '<span style="font-size:12px;opacity:.85">Your internet looks unstable — move closer to the router or use a cable.</span>' +
        (function () { var w = vcqWhyLine(); return w ? '<br>' + w : ''; })());
}

/* ② 상대 회선이 나쁘다 — **강사 화면에만** 그 사람 타일에 띄운다(위 머리말 참고).
   ⚠️ 타일 id 는 `vc-video-<userId>` 다. 유령 타일(`vcghost-…`)에는 안 붙는다. */
function vcNetPeerMark(userId, bad) {
    try {
        if (!(typeof vcIsTeacherRole === 'function' && vcIsTeacherRole())) return;
        var box = document.getElementById('vc-video-' + userId);
        if (!box) return;
        var hint = box.querySelector('.vc-netlow-hint');
        if (!bad) { if (hint) hint.remove(); return; }
        if (hint) return;
        hint = document.createElement('div');
        hint.className = 'vc-netlow-hint';
        /* ⚠️ 「상대 소리가 안 와요」(.vc-noaudio-hint, bottom:8px) 와 겹치지 않게 위쪽에 둔다 */
        hint.textContent = '📶 이 학생 인터넷이 불안정해요 / Weak connection';
        hint.style.cssText = 'position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:9;'
            + 'background:rgba(180,83,9,.9);color:#fff;font-size:11.5px;font-weight:700;'
            + 'padding:4px 10px;border-radius:999px;white-space:nowrap;pointer-events:none;';
        box.style.position = 'relative';
        box.appendChild(hint);
    } catch (_) {}
}

/* ③ 저화질 배지 — «왜 흐린지» 를 그 타일에 적는다(2026-09-02 사장님 「2번 배지도 만들어줘」).
   [배경] class-849: 화질이 최저 단계(해상도 1/4·5fps)에 굳어 교사 얼굴이 흐렸는데 화면은 아무 말도 안 했다.
     사장님이 「화면이 커서 그런가」·「연결 나쁘면 자동으로 작게」를 물으셨고, 둘 다 아니다 —
     P2P 라 받는 쪽 타일 크기는 인코더에 안 가고(대역폭 0바이트 절감), 자동 축소는 수업 중 화면만 움직인다.
     그래서 **크기는 손대지 않고** 이유만 적는다(CLAUDE.md 2장 「화질이 한번 흐려지면」 줄).
   [보내는 쪽] 적응 루프 단계(pc.__qStep, idx-main.js STEPS) 가 3 이상인 상대가 하나라도 있으면 내 타일에.
   [받는 쪽] inbound-rtp frameWidth 로. ⚠️ 절대값 하나로는 안 된다 — PC 는 1280 으로, 폰은 640 으로 보내므로
     «430 이하» 로 두면 폰은 1단계(640/1.5=427)부터 걸린다(함정 대조 검사 지적). 그래서 «이 상대에게서 본 최대 폭»
     대비 1/2.5 이하(=SCALE 3 이상)일 때만 «저화질» 로 보고, 최대 폭을 아직 못 본 경우를 위해 240px 이하는 절대값으로 잡는다
     (어느 카메라도 그보다 좁게 «정상» 으로 보내지 않는다).
     모든 화면에 띄운다 — 문구가 «저화질로 받는 중» 이라 상대를 탓하지 않는다
     (위 ② 의 «이 학생 인터넷이 불안정» 은 탓하는 말이라 강사에게만 — 다른 이유다).
   ⚠️ 2틱(8초) 이어질 때만 붙이고 회복되면 곧바로 뗀다. DOM 은 «바뀔 때만» 만진다(깜빡임·관찰자 발화 방지).
   ⚠️ 음성전용(AAO) 중에는 «보내는 중» 배지를 안 붙인다 — 영상을 아예 안 보내는데 «저화질» 이라 말하면 거짓이고, AAO 는 자기 안내가 있다.
   ⚠️ 위치는 bottom 58px — 「상대 소리가 안 와요」(.vc-noaudio-hint, bottom 8px)·「🔇 소리 없음·눌러서 고치기」(.vc-nosound-badge,
      bottom 34px, 강사에게는 버튼)·이름표 «위» 다. CSS 로 읽어 정한 값이고 브라우저 실측은 아직 없다(elementsFromPoint 로 사람이 잴 것).
   ⛔ 타일 크기·레이아웃은 건드리지 않는다. 감시: vc_quality_blindspot_harness ⑪ */
var VC_LOWQ_STEP = 3;    // idx-main.js STEPS[3] = 0.2 — 여기부터 사람 눈에 «흐림» 이 보인다(하니스가 STEPS 와 대조)
var VC_LOWQ_RATIO = 2.5; // 받는 영상 가로폭이 «본 최대 폭» 의 1/2.5 이하 = SCALE[3]=3 부터(2단계 1/2 는 안 잡음)
var VC_LOWQ_ABS = 240;   // 최대 폭을 아직 못 봤을 때의 절대 하한(px)
/* 🔕 (2026-09-15) 사장님 「"저화질로 받는 중" 글자 안나오게 해줘」 — 배지를 «화면에 그리지 않는다».
   [왜 껐나] 이 배지는 얼굴 타일 «위에» 얹히는 글자다. 회선이 나쁠수록 오래 떠 있으므로
     정작 상대 얼굴이 제일 안 보일 때 그 얼굴을 가장 크게 가린다(2026-09-15 사장님 화면 실측:
     교사 타일의 «받는 중» 과 내 타일의 «보내는 중» 이 동시에 떠 있었다).
   ⛔ 판정은 한 줄도 안 바꾼다 — L.self·L[id] 카운터도, vc_quality 로그(화질·단계·경로)도 그대로 쌓인다.
      «왜 흐린지» 는 관리자 「📶 강사 회선품질」 화면에서 그대로 읽는다.
   ⚠️ «보내는 중»(내 타일)도 함께 껐다 — 같은 함수가 그리는 같은 배지이고, 하나만 남기면
      얼굴은 여전히 가려진다. 한쪽만 되살리려면 그 호출부에서 정하는 것이 아니라 여기서 정한다.
   ✅ 되돌리는 길: 콘솔에서 `window.__vcLowQBadge = true` (그 자리에서 다시 붙는다).
   ⛔ 이 게이트를 지워서 되살리지 마세요 — 사장님 지시로 끈 것입니다. 감시: vc_quality_blindspot_harness ⑪ */
function vcLowQBadgeOn() { try { return window.__vcLowQBadge === true; } catch (_) { return false; } }
function vcLowQMark(box, on, text) {
    try {
        if (!box) return;
        var el = box.querySelector('.vc-lowq-hint');
        /* 🔕 꺼짐이 기본. «이미 붙어 있던 것»(옛 사본이 붙였을 수 있다)도 이 자리에서 뗀다. */
        if (!on || !vcLowQBadgeOn()) { if (el) el.remove(); return; }
        if (el) return;
        el = document.createElement('div');
        el.className = 'vc-lowq-hint';
        el.textContent = text;
        el.style.cssText = 'position:absolute;left:50%;bottom:58px;transform:translateX(-50%);z-index:9;'
            + 'background:rgba(15,23,42,.78);color:#fde68a;font-size:11px;font-weight:700;line-height:1.2;'
            + 'padding:3px 9px;border-radius:999px;white-space:nowrap;pointer-events:none;max-width:92%;overflow:hidden;text-overflow:ellipsis;';
        box.style.position = 'relative';
        box.appendChild(el);
    } catch (_) {}
}
function vcqLowQSelf() {
    var pcs = window.vcPeerConnections || {}, worst = 0;
    Object.keys(pcs).forEach(function (id) { var st = pcs[id] && pcs[id].__qStep; if (typeof st === 'number' && st > worst) worst = st; });
    var L = window.__vcLowQ || (window.__vcLowQ = {});
    var aao = !!(window.__vcAAO && window.__vcAAO.active);   // 음성전용 중 = 영상을 안 보냄 → «저화질» 이 아니다
    L.self = (worst >= VC_LOWQ_STEP && !aao) ? (L.self || 0) + 1 : 0;
    vcLowQMark(document.getElementById('vc-local-box'), L.self >= 2, '📶 저화질로 보내는 중 · Sending low quality');
}
function vcLowQRemote(id, frameWidth, flowing) {
    var L = window.__vcLowQ || (window.__vcLowQ = {});
    var M = L.max || (L.max = {});
    if (flowing && frameWidth > (M[id] || 0)) M[id] = frameWidth;        // 이 상대에게서 본 최대 폭 = 그 카메라의 «정상»
    var low = !!flowing && frameWidth > 0
        && (frameWidth * VC_LOWQ_RATIO <= (M[id] || 0) || frameWidth <= VC_LOWQ_ABS);   // 영상이 안 오면(카메라 끔·AAO) «모름» → 뗀다
    L[id] = low ? (L[id] || 0) + 1 : 0;
    vcLowQMark(document.getElementById('vc-video-' + id), L[id] >= 2, '📶 저화질로 받는 중 · Receiving low quality');
}

function vcQualityAcc(loss, rtt) {
    var Q = window.__vcQ || (window.__vcQ = { s: [], r: [], n: 0, rxv: [], rxa: [], rxc: [], rxf: 0, p: [], pt: 0, pr: 0, turn: '', proto: '', sentAt: Date.now() });
    vcqRxStart();
    try { vcNetSelfWatch(loss, rtt); } catch (_) {}   // 🔔 내 회선이 나쁘면 나에게 알린다
    /* loss === -1 은 «영상 표본이 아예 없던 4초» 라는 뜻(위 머리말). 평균에 섞지 않고 센다. */
    if (loss === -1) Q.n = (Q.n || 0) + 1;
    else if (typeof loss === 'number' && isFinite(loss)) Q.s.push(loss);
    if (typeof rtt === 'number' && isFinite(rtt) && rtt > 0) Q.r.push(rtt);
    /* ⚠️ 예전엔 `!Q.s.length` 였다 = 영상 표본이 없으면 영영 안 보냄. 그게 사각지대였다.
       이제 «받는 쪽» 표본만 있어도 보낸다 — 내 카메라가 꺼져 있어도 남의 영상은 받고 있다. */
    if (Date.now() - Q.sentAt < 60000 || !(Q.s.length || Q.n || Q.rxv.length || Q.rxa.length)) return;
    try {
        var avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };
        /* p95 — 평균이 가리는 스파이크를 남긴다. 표본이 적을 땐 그냥 최댓값에 가깝게 나온다. */
        var pct = function (a, q) {
            if (!a.length) return 0;
            var b = a.slice().sort(function (x, y) { return x - y; });
            return b[Math.min(b.length - 1, Math.floor(q * b.length))];
        };
        var w = vcqWho();
        var isT = (typeof vcIsTeacherRole === 'function') && vcIsTeacherRole();
        var A = window.__vcAAO || {};
        var body = JSON.stringify({
            room: (vcRoomId || ''),
            uid: w.uid, name: w.name,
            role: isT ? 'teacher' : (w.role || 'student'),
            /* ⚠️ Math.max.apply(null, []) 는 -Infinity 이고 JSON 에서 null 이 된다.
               표본이 없을 때는 계산하지 않는다(«최대 손실 0%» 라는 거짓말도 하지 않게 novideo 와 함께 읽는다). */
            avg_loss: +avg(Q.s).toFixed(1), max_loss: Q.s.length ? +Math.max.apply(null, Q.s).toFixed(1) : 0,
            p95_loss: Q.s.length ? +pct(Q.s, 0.95).toFixed(1) : 0,
            avg_rtt: Math.round(avg(Q.r)), aao: A.active ? 1 : 0,
            samples: Q.s.length, novideo: (Q.n || 0),
            /* 📥 받는 쪽 — 여기가 「흐리다·끊긴다」의 실제 지표다. 표본이 없으면 -1(= «모름»).
               ⛔ 0 으로 적지 말 것. 표본이 없는 것과 «손실 0%» 는 다른 사실이다. */
            rx_loss: Q.rxv.length ? +avg(Q.rxv).toFixed(1) : -1,
            rx_aloss: Q.rxa.length ? +avg(Q.rxa).toFixed(1) : -1,
            rx_conceal: Q.rxc.length ? +avg(Q.rxc).toFixed(2) : -1,
            rx_freeze: (Q.rxf || 0),
            peers: Q.p.length ? Math.max.apply(null, Q.p) : 0,
            /* 🛰 경로 — 이 1분 동안 «중계» 였던 틱 / 경로를 «안» 틱. 하나도 못 쟀으면 path 는 빈 값(«모름»)이다.
               ⛔ 빈 값을 '직접' 으로 바꾸지 말 것(위 vcqPathProbe 주석). */
            path: (Q.pt || 0) ? ((Q.pr || 0) === 0 ? 'direct' : ((Q.pr || 0) === Q.pt ? 'relay' : 'mixed')) : '',
            relay_ticks: (Q.pr || 0), path_ticks: (Q.pt || 0),
            turn: Q.turn ? (Q.turn + (Q.proto ? ' ' + Q.proto : '')) : ''
        });
        if (navigator.sendBeacon) navigator.sendBeacon('/api/vc/quality-log', new Blob([body], { type: 'application/json' }));
        else fetch('/api/vc/quality-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (_) {}
    window.__vcQ = { s: [], r: [], n: 0, rxv: [], rxa: [], rxc: [], rxf: 0, p: [], pt: 0, pr: 0, turn: '', proto: '', sentAt: Date.now() };
}

/* ═══ ⑤ 음성전용(AAO) «화면 멈춤» ═══════════════════════════════════════════════════
   2026-09-10 사장님 「선생님 얼굴이 안 보이게 하는 것보단 차라리 화면 멈춤으로 하면 어떨까」

   [무엇이 문제였나] 회선이 무너지면 소리를 살리려고 영상을 끈다(AAO — idx-main.js vcAAOApply).
     그 판단은 옳다: class-850-20260910 실측에서 강사 송신 손실이 19.7~21.4%(최대 65.5%)였고
     같은 시각 학생이 받은 소리의 40~43%가 끊겨 있었다. 영상을 안 껐으면 소리까지 무너졌다.
     문제는 «끈 뒤 화면이 하는 말» 이었다 — 받는 쪽 타일을 불투명도 82% 상자(.vc-camoff-hint)로
     통째로 덮어 얼굴이 아예 사라졌다. 30일 실측 50개 방 중 16개(32%), 최장 12분 연속.

   [왜 «덮개만 걷으면» 안 되나 — 잰 것 2026-09-10, Chromium 1194 WebRTC 루프백, 30ms 픽셀 측정]
     · track.enabled = false (옛 방식)   → 받는 쪽이 49ms 만에 «완전 검정»(밝기 0). 마지막 장면이 안 남는다.
                                           게다가 검은 프레임을 계속 보낸다 — 실측 약 10 kbps.
     · encodings[0].active = false (지금) → 받는 쪽이 «마지막 장면에서 멈춘다»(7초 뒤까지 픽셀 동일).
                                           보내는 바이트 정확히 0. 재협상 0회. 복구 96ms.
     ⟹ «신호를 받고 나서» 마지막 장면을 붙잡는 것은 원리상 불가능하다(영상 49ms 대 cam-state 는 WS 두 홉).
        끄는 «방법» 자체를 바꾸는 것이 유일한 길이었다.

   [왜 replaceTrack(null) 이 아니라 active=false 인가]
     replaceTrack(null) 도 같은 «멈춤» 을 준다(실측). 그런데 sender.track 이 비어서, 이 저장소에서
     영상 sender 를 `s.track && s.track.kind==='video'` 로 찾는 코드 10곳 넘게가 조용히 헛돈다.
     특히 화면공유 시작은 sender 를 못 찾으면 addTrack + 재협상으로 빠진다(대역폭 위기에 최악).
     active=false 는 트랙을 그대로 두므로 그 코드들이 전부 그대로 산다.
     덤: 가상배경·얼굴꾸미기는 sender 가 «캔버스 트랙» 을 쥐고 있는데 이 방식은 무엇을 쥐고 있든
     상관하지 않는다. AAO 중에 배경을 바꿔도 vcSwapVideoTrack 이 정상 동작하고,
     그 함수가 getParameters→수정→setParameters 라서 active=false 를 그대로 물고 간다.

   ⛔ 화면공유 중에는 손대지 않는다 — 그때 sender 가 쥔 것은 «화면» 이라 끄면 교재가 사라진다.
      (옛 코드도 결과적으로 그랬다: enabled=false 는 카메라 트랙에 걸렸고 sender 는 화면 트랙이었다.)
   ⛔ track.enabled=false 를 «함께» 쓰지 않는다 — 검은 프레임 한 장이 먼저 나가면 그 검정에서 얼어붙는다.
   ⛔ reason==='user'(사람이 일부러 끔)에는 절대 적용하지 않는다 — 껐는데 얼굴이 남으면 프라이버시 사고다.
   ⚠️ 멈춘 그림이 «지금» 으로 오인되면 이 저장소가 가장 나쁘다고 못 박은 방향이 된다(모르는 것을
      그럴듯하게 채우기). 그래서 셋을 함께 붙인다 — 지워지지 않는 띠 + 흑백 + «N초 전» 경과 시간.
   ⚠️ 이제 강사 자기 미리보기는 살아 있다(카메라를 끄지 않으므로). 그대로 두면 «내 쪽은 멀쩡한데?» 가
      되므로 자기 타일에도 «지금 상대에게 안 나갑니다» 를 적는다.
   ⚠️ 늦게 들어온 상대의 sender 는 active 가 켜진 채로 만들어진다 — 아래 vcAaoTick() 이 4초마다 다시 건다.
   감시: test-harness/aao_freeze_harness.mjs
   ══════════════════════════════════════════════════════════════════════════════════ */

/* 화면공유 때문에 «끄기» 가 뒤집힌 상태인가 — 뒤집힘이 바뀔 때만 상대에게 다시 알린다 */
var __vcAaoOver = false;
/* 🎥 마지막으로 «영상 보내기» 를 되살린 시각(0 = 없음). 아래 vcAaoVerify 가 그 뒤 30초만 확인한다. */
var __vcAaoOnAt = 0;
/* 상대별 마지막 framesSent 와 «안 늘어난 틱» 수 */
var __vcAaoTx = {};

/* SFU 가 mesh 영상 송신을 끊어 둔 상태인가(idx-vc-sfu.js cutMeshVideo).
   ⚠️ 그쪽은 «같은» vcPeerConnections 의 영상 sender 에 encodings[].active=false 를 건다.
      그 동안 여기서 켜면 영상이 두 갈래(mesh+SFU)로 나간다 — 켜는 쪽만 손을 뗀다. */
function vcAaoSfuCut() {
    try { return !!(window.__vcSfu && window.__vcSfu.meshCut); } catch (_) { return false; }
}

/* 영상 «보내기» 만 멈추거나 되살린다. 트랙은 건드리지 않는다. on=0 끔 / on=1 켬 */
function vcAAOVideo(on) {
    /* 🖥 화면공유 중에는 «언제나 보낸다» — 그때 sender 가 쥔 것은 카메라가 아니라 교재 화면이다.
       ⛔ 여기서 그냥 `return` 하면 «켜기» 까지 막혀 영상이 영영 안 돌아옵니다. `active=true` 로
          되돌리는 코드는 저장소에 이 함수 한 곳뿐이고 `vcAAOVideo(1)` 을 부르는 곳도 한 곳뿐이라,
          회복 시점에 공유 중이면 그 뒤로 아무도 되살리지 않습니다(함정 대조가 잡은 실제 결함).
          «상태를 지정» 하는 방식이라 공유가 시작·종료되는 순간도 4초 타이머가 저절로 따라잡습니다. */
    var want = window.__vcScreenSharing ? true : !!on;
    var pcs = window.vcPeerConnections || {};
    Object.keys(pcs).forEach(function (id) {
        try {
            var pc = pcs[id];
            var s = pc && pc.getSenders && pc.getSenders().find(function (x) { return x.track && x.track.kind === 'video'; });
            if (!s || !s.getParameters) return;
            var p = s.getParameters();
            if (!p.encodings || !p.encodings.length) p.encodings = [{}];
            var cur = p.encodings[0].active !== false;      // 값이 없으면 «보내는 중» 이 기본이다
            if (cur === want) return;                       // 바뀔 때만 — 불필요한 setParameters 는 인코더를 흔든다
            p.encodings[0].active = want;
            if (want) __vcAaoOnAt = Date.now();             // 🎥 «켰다» 를 적어 둔다 — 아래 vcAaoVerify 가 그 뒤 «실제로 나가는가» 를 본다
            /* ⛔ 실패를 삼키지 말 것 — 이 거절 하나가 «소리는 오는데 얼굴이 멈춘 채» 를 수업 끝까지 만든다.
               아래 4초 재적용이 다시 걸어 주지만, «왜 한 번 거절됐나» 는 이 줄로만 남는다. */
            try { if (want) vcRecoveryLog('sender-reapply', id, pc, (window.__vcRxRecovery || {})[id], 0); } catch (_) {}
            s.setParameters(p).catch(function (e) {
                try { console.warn('[vc-aao] setParameters 거절 — uid', id, want ? '켜기' : '끄기', (e && e.message) || e); } catch (_) {}
            });
        } catch (_) {}
    });
    /* 공유가 시작·끝나 «실제로 보내는가» 가 뒤집히면 상대에게 다시 알린다 — 안 그러면
       살아 움직이는 교재 위에 «N초 전 모습» 이 얹히고(거짓말), 반대로 멈춘 화면에 아무 안내도 없게 된다. */
    var over = (want !== !!on);
    if (over !== __vcAaoOver) {
        __vcAaoOver = over;
        try { if (typeof vcBroadcastCamState === 'function') vcBroadcastCamState(want, 'aao'); } catch (_) {}
    }
    try { vcAaoSelfMark(!want); } catch (_) {}
}
window.vcAAOVideo = vcAAOVideo;

/* 「N초 전」의 기준 시각 — 상대 uid 별로 «멈춘 순간» */
var __vcAaoSince = {};

/* 📷 (2026-09-15) 「마지막 모습」 — uid → dataURL 한 장.
   사장님 「음성만 나올 땐 화면은 교사의 얼굴이 멈춤 상태라도 나오게 해줘. 검게 하지 말고
   반드시 마지막 모습이 계속 나오게 할 수 있지??」

   [무엇이 문제였나] encodings.active=false 로 끄면 «대개» <video> 가 마지막 프레임에서 멈춘다(위 ⑤ 실측).
     그런데 그 «대개» 가 아닌 경우가 실제로 있었다 — 트랙이 죽거나(회선 붕괴·재협상) 첫 프레임이
     아직 한 장도 안 왔으면 videoWidth 가 0 이고, 아래 게이트가 옛 전면 덮개(.vc-camoff-hint,
     불투명 82%)로 떨어져 **얼굴이 통째로 사라진다.** 2026-09-15 사장님 화면(class-848, 05:54)이
     정확히 그 상태였다: 교사 자리가 「연결이 약해 지금은 음성만 전송 중이에요」 글자만 남고 새까맸다.
   [고침] 영상이 살아 있는 동안 4초마다 한 장을 떠 두고, 검어지면 그 그림을 깐다.
     한 번이라도 얼굴이 온 상대라면 그 뒤로는 무엇이 끊겨도 마지막 모습이 남는다.
   ⚠️ 한 프레임도 안 온 상대는 원리상 보여 줄 것이 없다 — 그때는 옛 전면 안내가 «사실» 이라 그대로 둔다.
   🔒 사람이 카메라를 «일부러» 끈 상대(cam-state 'user')의 그림은 갖고 있지 않는다 —
      껐는데 얼굴이 남으면 프라이버시 사고다(⑤ 머리말의 ⛔ 와 같은 줄기).
   ⚠️ 새 타이머를 만들지 않는다 — 이미 있는 4초 틱(vcqRxStart→vcAaoTick)에 얹는다(홈이 멎은 전력 2회).
   💰 [비용 — 잰 것 2026-09-15, 이 컨테이너 헤드리스(소프트웨어 렌더)] 1280x720 을 320폭으로 뜨는 데
      **한 장 5.03ms**(1:1 이면 4초마다 그만큼 = 약 0.13%), **4명이면 16.76ms**(약 0.42%), 메모리 4명에 26KB.
      «공짜가 아닙니다» — 화상수업 CPU 는 영상 인코더와 경쟁합니다(녹화 fps 를 60→10 으로 낮춘 것과 같은 자리).
      1:1 이 정상 사용이라 그대로 두었지만, 그룹이 커지면 «한 틱에 한 명씩 돌아가며» 뜨는 쪽을 먼저 보세요. */
var __vcAaoStill = {};
var VC_AAO_STILL_W = 320;   // 떠 두는 폭(px). 얼굴 칸은 크게 잡아야 400px 안팎이라 이만하면 눈에 같다

/* 살아 있는 영상에서 한 장을 뜬다. ⚠️ toDataURL 은 tainted canvas 에서 던진다 —
   WebRTC 스트림은 same-origin 이라 안 걸리지만, 걸려도 «고치기 전»(덮개)으로 떨어지게 감싼다. */
function vcAaoSnapOne(id, v) {
    try {
        if (!v || !v.videoWidth || !v.videoHeight) return;
        var w = Math.min(VC_AAO_STILL_W, v.videoWidth);
        var h = Math.round(v.videoHeight * (w / v.videoWidth));
        if (!w || !h) return;
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        __vcAaoStill[id] = c.toDataURL('image/jpeg', 0.7);
    } catch (_) {}
}

/* 떠 둔 한 장을 타일에 깐다 — <video> 가 «검어졌을 때만».
   멈춘 영상이 살아 있으면(videoWidth>0) 손대지 않는다: 같은 그림이라 덧그릴 이유가 없다.
   ⚠️ z-index 2 = 영상 위 · 이름표(.video-label 은 3)와 멈춤 띠(9) 아래. 그 둘을 가리면 안 된다. */
function vcAaoStill(box, id, on) {
    try {
        if (!box) return;
        var img = box.querySelector('.vc-aao-still');
        var url = on ? __vcAaoStill[id] : '';
        if (!url) { if (img) img.remove(); return; }
        if (!img) {
            img = document.createElement('img');
            img.className = 'vc-aao-still';
            img.alt = '';
            img.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;'
                + 'z-index:2;filter:grayscale(1);pointer-events:none;';
            box.style.position = 'relative';
            box.appendChild(img);
        }
        if (img.getAttribute('src') !== url) img.setAttribute('src', url);
        /* 🔎 «어떻게 맞출지» 는 내가 정하지 않고 «그 영상» 에게서 베낀다.
           [왜] 정본 vcSmartFitVideo(js/idx-main.js)가 타일마다 cover/contain 을 따로 정한다 —
             내 타일의 가상배경은 contain(턱·목 잘림 방지 2026-07-13), 화면공유도 contain(좌우 잘림 방지),
             폰 세로의 상대 타일은 cover(2026-07-14 사장님 지시). 여기에 cover 를 박아 두면
             **멈추는 순간 그림이 확 커지거나 잘려** «방금 보던 그 화면» 이 아니게 된다.
           ✅ 그 함수는 videoWidth 가 0 이면 첫 줄에서 돌아가므로, 검어진 뒤에도 인라인 값은
             «살아 있던 마지막 판정» 그대로 남아 있다 — 그것을 그대로 쓴다.
           ⚠️ 모르면 예전처럼 cover 로 둔다(빈 값·엉뚱한 값에 화면이 깨지지 않게). */
        try {
            var lv = box.querySelector('video');
            var fit = lv && lv.style ? lv.style.objectFit : '';
            if (!fit && lv && window.getComputedStyle) fit = getComputedStyle(lv).objectFit || '';
            img.style.objectFit = (fit === 'contain' || fit === 'cover') ? fit : 'cover';
            if (lv && window.getComputedStyle) {
                var pos = getComputedStyle(lv).objectPosition || '';
                if (pos) img.style.objectPosition = pos;
            }
        } catch (_) {}
    } catch (_) {}
}

/* 띠가 덮는 자리를 그 타일의 «위쪽 모서리 버튼» 에게 비켜 준다.
   ⚠️ 처음에는 이 줄이 없었고, 브라우저 실측에서 ⭐ 칭찬 버튼과 개별채팅 버튼이 **픽셀 단위로 통째로**
      띠에 덮여 있었다(390px 폰 · 별버튼 중앙 픽셀이 띠의 갈색 rgb(121,53,15)). 띠가 pointer-events:none
      이라 «눌리기는 하는데 안 보이는» 상태였다 — 1P=1원 포인트를 주는 버튼이라 반경이 작지 않다.
   ✅ 버튼을 «띠 높이만큼» 내린다. 높이는 타일 폭에 따라 1~2줄로 달라지므로 CSS 에 숫자를 박지 않고
      vcAaoFreeze 가 잰 값을 --aao-h 로 넘긴다. 클래스는 «버튼» 이 아니라 «타일» 에 붙으므로
      vcRefreshPraiseUI 가 버튼을 다시 그려도 살아남는다.
   ⚠️ !important 가 필요하다 — #vc-local-box .vc-star-btn{top:6px}(id 포함)이 특이성으로 이긴다. */
function vcAaoStyleOnce() {
    if (document.getElementById('vc-aao-css')) return;
    var st = document.createElement('style');
    st.id = 'vc-aao-css';
    /* ⚠️ «위쪽 모서리» 는 한 칸이 아니라 «세로로 쌓인 칸» 이다 — 하나만 내리면 그 밑칸에 올라탄다.
       실측(2026-09-11, 타일 위에서 잰 값): ⭐6 · ⇱분리6 · 바구니6 · 🖥배지6 · 💬8 · 📶경고8 · 🎛40 · +1P토스트48 · vpb-fly48.
       처음에 ⭐·💬 만 내렸다가 💬 가 🎛(장치 도우미) 위에 얹혀 «가려진 것을 옮겨 또 가리는» 상태가 됐고,
       그다음 판에서도 ⇱분리(z-index 5)와 📶경고(z-index 9·pointer-events:none)가 빠져 그대로 덮여 있었다.
       ⛔ 목록을 줄이지 말 것. 새 모서리 조각을 만들면 여기에 함께 적는다.
       ⚠️ «눌리는 것» 만 적으면 안 된다 — 배지처럼 pointer-events:none 이거나 띠와 z-index 가 같은
          조각은 «겹침» 검사에 안 걸린다. 그래서 브라우저 검사가 «띠와 겹친 조각이 전부 자기 색으로
          칠해졌는가» 를 픽셀로 따로 본다(그 검사가 이 둘을 잡았다). */
    st.textContent = '.video-box.vc-aao-on .vc-star-btn,.video-box.vc-aao-on .vc-point-basket,'
        + '.video-box.vc-aao-on .vc-ss-badge,.video-box.vc-aao-on .video-detach-btn'
        + '{top:calc(6px + var(--aao-h,0px))!important}'
        + '.video-box.vc-aao-on .vc-dm-btn,.video-box.vc-aao-on .vc-netlow-hint'
        + '{top:calc(8px + var(--aao-h,0px))!important}'
        + '.video-box.vc-aao-on .vc-devhelp-btn{top:calc(40px + var(--aao-h,0px))!important}'
        + '.video-box.vc-aao-on .vc-star-toast,.video-box.vc-aao-on .vpb-fly'
        + '{top:calc(48px + var(--aao-h,0px))!important}';
    /* ⚠️ 한계 — base 는 «첫 정의» 한 값이다. 같은 조각에 모드별 override 가 있으면 그것까지는 안 본다
       (실측 예: mg-uni-on 통합바에서 #vc-local-box .vc-star-toast 는 44px 이라 여기서는 4px 더 내려간다.
        해롭지 않아 그대로 두지만, 그런 override 를 새로 만들 때는 이 줄을 함께 보라). */
    (document.head || document.documentElement).appendChild(st);
}

/* 멈춤 띠. 타일 «위쪽» 에 붙인다 — 아래쪽은 이름표·소리 안내·저화질 배지가 이미 쓴다(bottom 8/34/58px).
   ⛔ display:flex 를 쓰지 않는다 — 짧은 문장이 좁은 타일에서 낱글자로 쪼개진다(CLAUDE.md 2장). */
function vcAaoStripEl(box) {
    vcAaoStyleOnce();
    var el = box.querySelector('.vc-aao-freeze');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'vc-aao-freeze';
    el.style.cssText = 'position:absolute;left:0;right:0;top:0;z-index:9;display:block;text-align:center;'
        + 'padding:5px 8px;background:rgba(120,53,15,.92);color:#fff7ed;font-size:11px;font-weight:700;'
        + 'line-height:1.25;white-space:normal;overflow:hidden;pointer-events:none;';
    box.style.position = 'relative';
    box.appendChild(el);
    return el;
}

/* 글자를 다시 쓴다. ⚠️ data-ko/data-en 도 함께 갱신해야 🌐 를 눌러도 따라온다(CLAUDE.md 2장
   「JS 로 그린 라벨」). 이 요소는 글자만 담으므로 두 i18n 엔진이 textContent 를 갈아도 안전하다. */
function vcAaoLabel(el, id) {
    var t0 = __vcAaoSince[id] || Date.now();
    var sec = Math.max(0, Math.round((Date.now() - t0) / 1000));
    /* 🌐 한/영을 «한 문자열에» 함께 적는다 — 2026-08-08 「상대 타일 안내도 병기」 지시.
       ⛔ 언어로 «갈라» 쓰면 안 된다: 폰 언어가 EN 인 한국인 원장님이 영어만 받은 것이
       9/10 제보의 뿌리였다(idx-main.js 의 vcApplyRemoteCamHint 가 같은 이유로 병기다).
       ⛔ <i> 자식으로 두 줄을 만들지도 말 것 — 두 i18n 엔진이 이 요소의 textContent 를
       통째로 갈아끼워 자식이 사라진다(CLAUDE.md 2장 「아이콘 버튼에 달았더니」).
       ⚠️ 그래서 data-ko 와 data-en 이 «같은 값» 이다 — 🌐 를 눌러도 두 말이 다 남는다. */
    var both = '📶 영상 멈춤 · 소리 정상 · ' + sec + '초 전 / Video paused · audio OK';
    el.setAttribute('data-ko', both);
    el.setAttribute('data-en', both);
    el.textContent = both;
}

/* 상대 타일을 «멈춤» 으로 만들거나 되돌린다. */
function vcAaoFreeze(box, id, on) {
    if (!box) return;
    var v = box.querySelector('video');
    if (!on) {
        delete __vcAaoSince[id];
        var old = box.querySelector('.vc-aao-freeze'); if (old) old.remove();
        try { box.classList.remove('vc-aao-on'); box.style.removeProperty('--aao-h'); } catch (_) {}
        try { if (v) v.style.filter = ''; } catch (_) {}
        vcAaoStill(box, id, false);        // 📷 깔아 둔 마지막 모습을 걷는다(살아 있는 영상이 다시 보여야 한다)
        return;
    }
    if (!__vcAaoSince[id]) __vcAaoSince[id] = Date.now();
    /* 흑백 — «지금» 으로 오인되지 않게. 멈춘 그림이라 새로 그리지 않으므로 비용이 거의 없다. */
    try { if (v) v.style.filter = 'grayscale(1)'; } catch (_) {}
    /* 📷 영상이 검어졌으면(트랙이 죽었거나 첫 프레임 전) 떠 둔 마지막 모습을 깐다.
       ⚠️ videoWidth 가 살아 있으면 안 깐다 — 그 경우 <video> 자신이 이미 마지막 장면을 붙잡고 있다. */
    vcAaoStill(box, id, !(v && v.videoWidth));
    var el = vcAaoStripEl(box);
    vcAaoLabel(el, id);
    vcAaoShift(box, el);
}

/* 잰 띠 높이를 타일에 넘겨 위쪽 버튼을 그만큼 내린다.
   ⚠️ 「줄 수가 바뀌면」 높이도 바뀐다(「9초 전」 → 「12초 전」에 줄이 늘 수 있다) — 매 틱 다시 잰다.
   ⚠️ 타일이 아직 안 그려졌으면(offsetHeight 0) 아무것도 하지 않는다 — 0 을 넣으면 «안 비킨» 것과 같다. */
function vcAaoShift(box, el) {
    try {
        var h = el && el.offsetHeight;
        if (!h) return;
        box.style.setProperty('--aao-h', h + 'px');
        box.classList.add('vc-aao-on');
    } catch (e) {
        /* 실패해도 «고치기 전»(버튼이 덮인 상태)으로 떨어질 뿐이라 새 위험은 없다.
           다만 조용하면 「⭐ 가 안 보인다」가 영영 안 밝혀지므로 한 번은 남긴다. */
        if (!vcAaoShift._warned) { vcAaoShift._warned = 1; try { console.warn('[vc-aao] shift 실패 — 위쪽 버튼이 띠에 가릴 수 있습니다', e); } catch (_) {} }
    }
}

/* 내 타일 — 내가 «음성만» 을 보내는 동안. 흑백은 안 입힌다(내 미리보기는 실제로 살아 움직인다). */
function vcAaoSelfMark(on) {
    try {
        var box = document.getElementById('vc-local-box');
        if (!box) return;
        var el = box.querySelector('.vc-aao-freeze');
        if (!on) {
            if (el) el.remove();
            /* ⚠️ (2026-09-15) 4초 타이머가 «켜기» 도 다시 걸게 되면서 이 갈래가 «평상시에도» 매 틱 돈다.
               CLAUDE.md 실측: «없는 토큰 remove() 도 class 속성을 다시 써서 관찰자를 1회 깨운다»
               (mango-worldclock.js 가 documentElement 에 subtree 로 걸려 있어 그 대상이다).
               무한루프는 아니지만(그 콜백은 toggle(t, force) 라 상태가 같으면 0회) 수업 중 4초마다
               남의 관찰자를 깨울 이유가 없다 — 홈이 두 번 멎은 뿌리가 이 계열이다. 바뀔 때만 쓴다. */
            if (box.classList.contains('vc-aao-on')) box.classList.remove('vc-aao-on');
            if (box.style.getPropertyValue('--aao-h')) box.style.removeProperty('--aao-h');
            return;
        }
        el = vcAaoStripEl(box);
        var ko = '📶 영상 안 나감';          // ⚠️ PIP 는 폰에서 130px — 길면 핵심이 잘린다
        var en = '📶 Video not sent';
        el.setAttribute('data-ko', ko); el.setAttribute('data-en', en);
        el.textContent = (typeof miIsEn === 'function' && miIsEn()) ? en : ko;
        vcAaoShift(box, el);
    } catch (_) {}
}

/* 받는 쪽 안내 갈아끼우기 — idx-main.js 의 vcApplyRemoteCamHint 를 «밖에서» 덮는다.
   그 함수는 최상위 함수 선언이라 window 속성이고, 부르는 쪽(cam-state 핸들러·vcRemoteBlackWatch)이
   맨이름으로 부르므로 여기서 덮으면 그쪽까지 따라온다(CLAUDE.md 2장 「blocking 파일을 못 고칠 때」).
   ⚠️ 그 이름이 바뀌면 조용히 헛돈다 — 하니스가 «그 이름이 아직 있는가» 를 대조한다.
   ⛔ 'user'(사람이 껐음)는 원본 그대로 — 전면 덮개가 맞다. */
var __vcHintOrig = window.vcApplyRemoteCamHint;
window.vcApplyRemoteCamHint = function (userId) {
    try {
        var box = document.getElementById('vc-video-' + userId);
        var why = (window.vcRemoteCamOff || {})[userId];
        if (why !== 'aao') {                                   // 카메라를 껐거나 다시 켰다 → 옛 동작
            vcAaoFreeze(box, userId, false);
            if (__vcHintOrig) __vcHintOrig(userId);
            return;
        }
        var v = box && box.querySelector('video');
        /* 보여 줄 «마지막 장면» 이 애초에 없으면(한 프레임도 안 온 상대) 옛 전면 안내가 맞다 —
           검은 바탕에 «영상 멈춤» 이라고 적으면 거짓말이 된다.
           📷 (2026-09-15) 영상이 «검어졌어도» 떠 둔 한 장이 있으면 그것으로 보여 준다 —
              예전에는 여기서 곧바로 전면 덮개로 떨어져 교사 얼굴이 통째로 사라졌다(위 __vcAaoStill 머리말). */
        if (!(v && v.videoWidth) && !__vcAaoStill[userId]) { vcAaoFreeze(box, userId, false); if (__vcHintOrig) __vcHintOrig(userId); return; }
        var cover = box.querySelector('.vc-camoff-hint'); if (cover) cover.remove();
        var black = box.querySelector('.vc-black-hint'); if (black) black.remove();
        vcAaoFreeze(box, userId, true);
        vcqRxStart();                                          // 「N초 전」을 세어 줄 타이머(수업 중에만 산다)
    } catch (_) {}
};

/* 🎥 (2026-09-15) «켰다» 와 «나간다» 는 다르다 — 되살린 뒤 프레임이 실제로 다시 늘어나는지 본다.
   [왜] active=true 로 되돌려도 인코더가 안 살아나거나 트랙이 죽어 있으면 받는 쪽은 여전히 멈춘 그림이다.
        그런데 그 상태는 소리가 멀쩡해서 «수업은 되는데 얼굴만 안 돌아온다» 로만 보이고, 아무 데도 안 남는다.
   ⛔ 여기서 재협상·restartIce 를 걸지 말 것 — 이 자리는 «회선이 방금 나빴던» 곳이라
      연결을 다시 맺는 것이 최악이다(idx-main.js 화면공유 주석과 같은 이유).
      되살리는 일은 아래 4초 재적용이 이미 한다. 여기는 «안 돌아온다» 를 «말하는» 자리다.
   ⚠️ 사람이 카메라를 끈 경우·죽은 트랙·통계 없음은 보지 않는다 — 거짓 경보가 더 나쁘다. */
function vcAaoVerify() {
    if (!__vcAaoOnAt || Date.now() - __vcAaoOnAt > 30000) { __vcAaoTx = {}; return; }
    var pcs = window.vcPeerConnections || {};
    Object.keys(pcs).forEach(function (id) {
        try {
            var pc = pcs[id];
            var s = pc && pc.getSenders && pc.getSenders().find(function (x) { return x.track && x.track.kind === 'video'; });
            if (!s || !s.getStats) return;
            if (s.track.readyState !== 'live' || s.track.enabled === false) return;
            s.getStats().then(function (st) {
                var f = -1;
                st.forEach(function (r) { if (r.type === 'outbound-rtp' && typeof r.framesSent === 'number') f = Math.max(f, r.framesSent); });
                if (f < 0) return;                                   // 통계가 없으면 «모름» — 단정하지 않는다
                var prev = __vcAaoTx[id];
                var stuck = (prev && f <= prev.f) ? (prev.stuck || 0) + 1 : 0;
                __vcAaoTx[id] = { f: f, stuck: stuck };
                if (stuck === 3) {                                   // 3틱 ≈ 12초
                    try { console.warn('[vc-aao] 영상을 되살린 뒤 12초 동안 프레임이 안 나갑니다 — uid', id, '· framesSent', f); } catch (_) {}
                }
            }).catch(function () {});
        } catch (_) {}
    });
}

/* 4초 타이머(vcqRxStart)가 부른다. ⛔ 여기서 새 setInterval 을 만들지 않는다(홈이 멎은 전력 2회). */
function vcAaoTick() {
    var A = window.__vcAAO;
    /* 🔴 (2026-09-15) «끄기» 만 4초마다 다시 걸고 «켜기» 는 한 번뿐이면, 그 한 번이 거절됐을 때
       영상이 수업 끝까지 안 돌아온다. active=true 로 되돌리는 코드는 저장소에 vcAAOVideo 한 곳뿐이고
       vcAAOVideo(1) 을 부르는 곳도 vcAAOApply 의 복구 갈래(idx-main.js) 한 곳뿐이기 때문이다.
       하필 그 한 번은 «회선이 회복된 그 틱» 에 일어나는데, 같은 4초 주기의 applyStep 도
       같은 sender 에 getParameters→setParameters 를 건다 → 스냅샷이 어긋나면 한쪽이 거절되고,
       그 거절은 조용하다(에러도 화면도 없다).
       ⟹ vcAAOVideo 가 스스로 적어 둔 설계(«상태를 지정»)대로 양방향을 4초마다 다시 건다.
          바뀔 때만 실제로 쓰므로(cur === want 조기반환) 평소에는 아무 일도 하지 않는다.
       ⛔ 켜는 쪽을 되돌리지 말 것 — 되돌리면 「소리는 오는데 얼굴이 멈춘 채」가 그대로 재현된다.
       ⚠️ SFU 가 mesh 를 끊어 둔 동안에는 «켜지» 않는다(vcAaoSfuCut) — 그쪽이 일부러 끈 것이다. */
    var want = (A && A.active) ? 0 : 1;
    if (!(want && vcAaoSfuCut())) { try { vcAAOVideo(want); } catch (_) {} }
    try { vcAaoVerify(); } catch (_) {}
    /* 📷 살아 있는 상대 영상에서 «마지막 모습» 을 한 장씩 떠 둔다(2026-09-15 — 위 __vcAaoStill 머리말).
       ⛔ 멈춤 중인 타일(__vcAaoSince)은 건너뛴다 — 뜰 것이 없고, 뜨면 멈춘 그림을 다시 떠 덮어쓴다.
       🔒 사람이 카메라를 «일부러» 끈 상대('user')의 그림은 그 자리에서 버린다 — 껐는데 얼굴이 남으면 사고다. */
    try {
        var grid = document.getElementById('vc-video-grid');
        if (grid) {
            var live = {}, off = (window.vcRemoteCamOff || {});
            grid.querySelectorAll('.video-box').forEach(function (b) {
                var pid = (b.id || '').replace('vc-video-', '');
                if (!pid || b.id === 'vc-local-box') return;
                live[pid] = 1;
                if (off[pid] === 'user') { delete __vcAaoStill[pid]; return; }
                if (!__vcAaoSince[pid]) vcAaoSnapOne(pid, b.querySelector('video'));
            });
            Object.keys(__vcAaoStill).forEach(function (pid) { if (!live[pid]) delete __vcAaoStill[pid]; });
        }
    } catch (_) {}
    Object.keys(__vcAaoSince).forEach(function (id) {
        var box = document.getElementById('vc-video-' + id);
        var el = box && box.querySelector('.vc-aao-freeze');
        if (el) {
            vcAaoLabel(el, id); vcAaoShift(box, el);            // ⚠️ 줄 수가 바뀔 수 있으니 높이도 다시 잰다
            /* 📷 영상이 «뒤늦게» 검어질 수 있다(멈춘 줄 알았던 트랙이 죽는다) — 그때 떠 둔 한 장으로 바꿔 깐다. */
            var vv = box.querySelector('video');
            vcAaoStill(box, id, !(vv && vv.videoWidth));
        }
        else { delete __vcAaoSince[id]; delete __vcAaoStill[id]; }   // 타일이 사라졌다 = 그 상대가 나갔다
    });
}
