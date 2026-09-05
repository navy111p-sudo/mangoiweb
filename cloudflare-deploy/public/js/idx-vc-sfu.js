/* ═══════════════════════════════════════════════════════════════════════════════
   📡 idx-vc-sfu.js — 화상수업을 «서버 경유(SFU)» 로 받는 길  (2026-09-04, C안 2단계)

   [왜 만들었나 — 잰 것]
   2026-09-04 21:06~21:11 KST `mangoi-class` 실측(D1 `vc_quality`, #794 의 경로 칸):
     · 그날 18:05 이후 기록된 **46건 전부·사용자 6명 전부가 `relay`** — 직접(P2P) 0건
     · TURN 프로토콜을 볼 수 있는 35건이 **전부 `tcp`**, `udp` 0건
     · 그런데 RTT 는 113~324ms 로 «나쁘지 않았고», 그래도 얼굴만 계속 얼어붙었다
       (받는 소리 끊김 4~12% · 영상 멈춤 분당 3~9회)
   ⟹ 원인은 «회선이 느리다» 가 아니라 **TCP 중계**다. TCP 는 순서를 반드시 지키므로
      한 조각이 늦으면 뒤가 전부 줄을 선다 → 소리(30kbps)는 메워서 들리고,
      얼굴(1.2Mbps)은 얼어붙었다 풀렸다 한다. 사장님 제보와 정확히 같은 지문이다.

   [SFU 가 그것을 어떻게 줄이나 — 그리고 «못 고치는 것»]
   ⛔ 먼저: SFU 도 WebRTC 다. **UDP 가 막힌 망에서는 SFU 에 붙는 것도 TURN/TCP 로 떨어진다.**
      「SFU 로 바꾸면 다 해결」은 사실이 아니다. 그래도 크게 좋아지는 이유는 둘이다 —
        ① 지금은 **이중 중계**(양쪽 다 relay)로 긴 TCP 한 줄이 태평양을 건넌다.
           SFU 는 «각자 가까운 Cloudflare 엣지까지» 만 TCP 다. TCP 가 멈추는 시간은 왕복지연에
           비례하므로 구간이 짧아지면 멈춤도 짧아진다.
        ② SFU 는 늦은 프레임을 **버릴 수 있다.** 지금 TCP 는 못 버린다(그래서 언다).
   ⚠️ 위 ①②는 «구조상 그렇다» 이지 이 저장소에서 **잰 값이 아니다.** 실제 효과는
      Farrah 회선에서 켜 보고 `vc_quality` 로 재야 확정된다.

   [⛔ 기본은 꺼짐 — 켜는 방법은 셋 다 «사람이 켜는» 것뿐]
     · 서버 시크릿(REALTIME_APP_ID·REALTIME_APP_TOKEN)이 없으면 `enabled:false` 라 여기서 끝난다
     · 그 위에 주소에 `?sfu=1` 이 있거나 localStorage `mangoi_sfu`='1' 일 때만 시도한다
   즉 시크릿을 넣어도 «아무 일도» 안 일어난다. 켠 사람의 탭에서만 동작한다.
   👉 이 환경은 프록시가 rtc.live.cloudflare.com 을 막아 **진짜 SFU 와 맞춰 본 적이 없다.**
      그래서 기본을 끄고, 실패하면 조용히 mesh 로 되돌아가게 짰다.

   [무엇을 «안» 건드리나]
     ⛔ `js/idx-main.js`(blocking 849KB, 첫 화면 예산 여유 ~100B) 를 한 줄도 안 고친다 —
        전역(`vcCreatePeer`·`vcAddRemoteVideo`)을 밖에서 감싸거나 부르기만 한다
        (CLAUDE.md 2장 「blocking 파일을 못 고칠 때」). 그 이름이 바뀌면 조용히 헛돈다 —
        하니스 ⑨가 «그 이름이 아직 있는가» 를 대조한다.
     ⛔ 상주 `setInterval`·body class `MutationObserver` 를 두지 않는다(홈이 통째로 멎은 전력 2회).
        타이머는 수업에 들어간 뒤에만 살고 `vc-in-call` 이 없으면 스스로 끈다.
     ⛔ `vcRemovePeer(id,'left')` 를 부르지 않는다 — 학생 화면에 「수업이 끝났어요」가 뜬다(1-4).

   [되돌아가는 길이 항상 열려 있다]
   mesh PeerConnection 은 «살려 둔 채» 영상 트랙만 `replaceTrack(null)` 로 멈춘다
   (재협상이 필요 없는 표준 동작). SFU 프레임이 5초 넘게 안 오거나, 카메라 트랙이 바뀌거나
   (화면공유·가상배경·장치교체), 어디서든 예외가 나면 **원래 트랙을 되돌려 놓고** 끝낸다.
   ⛔ 소리는 mesh 에 그대로 둔다 — 사장님 제보가 「음성은 괜찮다」였고, 소리까지 옮기면
      SFU 가 죽는 순간 수업이 통째로 끊긴다. 옮기는 것은 «문제가 난 쪽» 뿐이다.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var S = window.__vcSfu = {
        state: 'off',      // off | probe | pub | sub | live | fallback
        why: '',           // 왜 그 상태인지 — 진단용
        sid: '',           // 올리기 세션
        subSid: '',        // 받기 세션
        pubPc: null,
        subPc: null,
        myVideoTrack: '',  // 올린 영상 트랙 이름(= track.id). 이게 바뀌면 손을 뗀다
        myAudioTrack: '',
        peers: {},         // peerId -> { sid, a, v, name }
        streams: {},       // peerId -> SFU 로 받은 MediaStream
        gotAt: {},         // peerId -> 마지막으로 «영상 프레임이 늘어난» 시각
        seenFrames: {},    // peerId -> 마지막으로 본 framesDecoded
        meshSaved: [],     // [{ sender, track }] — 되돌리기용
        meshCut: false,
        timer: 0,
        started: false
    };

    var POLL_MS = 3000;        // 명단 확인 주기. 2인 수업이라 이 정도면 충분하다
    var STALL_MS = 6000;       // 이만큼 프레임이 안 늘면 «죽었다» 로 보고 mesh 로 되돌린다
    var GRACE_MS = 12000;      // 붙는 데 주는 시간(TCP 중계면 첫 연결이 느리다)

    function log() {
        try { console.log.apply(console, ['[vc-sfu]'].concat([].slice.call(arguments))); } catch (_) {}
    }

    /* 켜졌는가 — «사람이 켠 탭» 에서만. ⛔ 기본값을 true 로 바꾸지 말 것(위 머리말). */
    function wanted() {
        try {
            if (window.__vcSfuForceOff) return false;
            if (/[?&]sfu=1\b/.test(location.search)) return true;
            if (localStorage.getItem('mangoi_sfu') === '1') return true;
        } catch (_) {}
        return false;
    }

    /* 학생은 토큰, 강사·관리자는 쿠키. 둘 다 실어 보낸다(서버가 순서대로 본다). */
    function tok() {
        try { return localStorage.getItem('mango_token') || ''; } catch (_) { return ''; }
    }
    function api(op, body) {
        body = body || {};
        var t = tok(); if (t) body.token = t;
        return fetch('/api/class/sfu/' + op, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
    }
    function peersApi(body) {
        var t = tok(); if (t) body.token = t;
        return fetch('/api/class/sfu-peers', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
    }

    /* ICE 는 mesh 와 «같은 것» 을 쓴다 — UDP 가 막힌 망에서는 SFU 에 붙는 데도 TURN 이 필요하다.
       ⚠️ `window.ICE_SERVERS` 로 읽지 말 것: idx-main.js 의 선언이 `let` 이라 window 에 안 붙는다
          (CLAUDE.md 2장 「let 은 window 에 속성을 만들지 않는다」). 최상위 classic script 끼리는
          어휘 바인딩을 공유하므로 «맨 이름» 으로 읽는다. */
    function iceCfg() {
        var list = [{ urls: 'stun:stun.cloudflare.com:3478' }];
        try {
            if (typeof ICE_SERVERS !== 'undefined' && ICE_SERVERS && ICE_SERVERS.iceServers) {
                list = ICE_SERVERS.iceServers;
            }
        } catch (_) {}
        return { iceServers: list, bundlePolicy: 'max-bundle' };
    }

    function myRoom() { try { return (typeof vcRoomId !== 'undefined' && vcRoomId) || ''; } catch (_) { return ''; } }
    function myId()   { try { return (typeof vcUserId !== 'undefined' && vcUserId) || ''; } catch (_) { return ''; } }
    function myStream() { try { return (typeof vcLocalStream !== 'undefined' && vcLocalStream) || null; } catch (_) { return null; } }
    function amObserver() { try { return !!(typeof vcIsObserver !== 'undefined' && vcIsObserver); } catch (_) { return false; } }
    function inCall() { try { return document.body.classList.contains('vc-in-call'); } catch (_) { return false; } }

    /* 연결될 때까지 기다린다. ⛔ 영원히 기다리지 않는다 — 안 되면 mesh 로 돌아가야 한다. */
    function waitIce(pc, ms) {
        return new Promise(function (res, rej) {
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return res();
            var done = false;
            var t = setTimeout(function () { if (!done) { done = true; cleanup(); rej(new Error('ice_timeout')); } }, ms);
            function h() {
                var st = pc.iceConnectionState;
                if (st === 'connected' || st === 'completed') { if (!done) { done = true; clearTimeout(t); cleanup(); res(); } }
                else if (st === 'failed') { if (!done) { done = true; clearTimeout(t); cleanup(); rej(new Error('ice_failed')); } }
            }
            function cleanup() { try { pc.removeEventListener('iceconnectionstatechange', h); } catch (_) {} }
            pc.addEventListener('iceconnectionstatechange', h);
        });
    }

    /* ═══ 1) 내 영상·소리를 SFU 에 «올린다» ═══════════════════════════════════════
       Cloudflare Realtime SFU 규약(2026-09-04 cloudflare/realtime-examples `echo/index.html` 확인):
         POST sessions/new                      → { sessionId }
         POST sessions/{id}/tracks/new
              { sessionDescription:{sdp,type:'offer'},
                tracks:[{ location:'local', mid, trackName }] }   → { sessionDescription: answer }
       ⛔ 트랙 «이름» 은 우리가 정하지 않고 `sender.track.id` 를 그대로 쓴다 — 받는 쪽이
          명단에서 그 이름을 보고 끌어간다. 이름을 지어내면 양쪽이 어긋난다. */
    async function publish() {
        var stream = myStream();
        if (!stream) throw new Error('no_local_stream');
        var r = await api('session-new', { room_id: myRoom() });
        if (!r || r.ok === false) throw new Error('session_new_failed');
        if (r.enabled === false) { S.why = r.reason || 'disabled'; return false; }   // 시크릿 없음 = 정상적인 «꺼짐»
        S.sid = (r.sfu && r.sfu.sessionId) || '';
        if (!S.sid) throw new Error('no_session_id');

        var pc = S.pubPc = new RTCPeerConnection(iceCfg());
        var tx = [];
        stream.getTracks().forEach(function (t) {
            if (t.kind !== 'audio' && t.kind !== 'video') return;
            tx.push(pc.addTransceiver(t, { direction: 'sendonly' }));
        });
        if (!tx.length) throw new Error('no_tracks');

        var offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        var pr = await api('tracks-new', {
            room_id: myRoom(), session_id: S.sid,
            payload: {
                sessionDescription: { sdp: offer.sdp, type: 'offer' },
                tracks: tx.map(function (t) {
                    return { location: 'local', mid: t.mid, trackName: t.sender && t.sender.track && t.sender.track.id };
                })
            }
        });
        if (!pr || pr.ok === false || !pr.sfu || !pr.sfu.sessionDescription) throw new Error('push_failed');
        await pc.setRemoteDescription(new RTCSessionDescription(pr.sfu.sessionDescription));
        await waitIce(pc, GRACE_MS);

        tx.forEach(function (t) {
            var tr = t.sender && t.sender.track; if (!tr) return;
            if (tr.kind === 'video') S.myVideoTrack = tr.id;
            if (tr.kind === 'audio') S.myAudioTrack = tr.id;
        });
        log('올리기 성공', S.sid, 'v=' + S.myVideoTrack);
        return true;
    }

    /* ═══ 2) 남의 것을 «받는다» ═════════════════════════════════════════════════
         POST sessions/{sub}/tracks/new
              { tracks:[{ location:'remote', trackName, sessionId }] }
              → { requiresImmediateRenegotiation, sessionDescription: offer, tracks:[{mid}] }
         PUT  sessions/{sub}/renegotiate { sessionDescription:{sdp,type:'answer'} }
       ⛔ 받기 전용 PC 를 «따로» 둔다 — 올리기 PC 와 섞으면 재협상이 서로를 밟는다
          (Cloudflare 예제도 세션을 나눈다). */
    async function ensureSubSession() {
        if (S.subSid && S.subPc) return;
        var r = await api('session-new', { room_id: myRoom() });
        if (!r || r.ok === false || r.enabled === false) throw new Error('sub_session_failed');
        S.subSid = (r.sfu && r.sfu.sessionId) || '';
        if (!S.subSid) throw new Error('sub_no_session_id');
        S.subPc = new RTCPeerConnection(iceCfg());
    }

    async function pull(peerId, info) {
        await ensureSubSession();
        var pc = S.subPc;
        var want = [];
        if (info.a) want.push({ location: 'remote', trackName: info.a, sessionId: info.sid });
        if (info.v) want.push({ location: 'remote', trackName: info.v, sessionId: info.sid });
        if (!want.length) return;

        var r = await api('tracks-new', { room_id: myRoom(), session_id: S.subSid, payload: { tracks: want } });
        if (!r || r.ok === false || !r.sfu) throw new Error('pull_failed');
        var got = r.sfu.tracks || [];

        /* mid 로 «어느 트랙인지» 를 가른다 — 응답 순서가 곧 요청 순서다.
           ontrack 리스너를 **재협상 «전»** 에 걸어야 한다(먼저 걸지 않으면 놓친다). */
        var waiting = got.map(function (g) {
            return new Promise(function (res) {
                var t = setTimeout(function () { pc.removeEventListener('track', h); res(null); }, GRACE_MS);
                function h(ev) {
                    if (!ev.transceiver || ev.transceiver.mid !== g.mid) return;
                    clearTimeout(t); pc.removeEventListener('track', h); res(ev.track);
                }
                pc.addEventListener('track', h);
            });
        });

        if (r.sfu.requiresImmediateRenegotiation && r.sfu.sessionDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(r.sfu.sessionDescription));
            var ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            var rr = await api('renegotiate', {
                room_id: myRoom(), session_id: S.subSid,
                payload: { sessionDescription: { sdp: ans.sdp, type: 'answer' } }
            });
            if (!rr || rr.ok === false) throw new Error('renegotiate_failed');
        }

        var tracks = (await Promise.all(waiting)).filter(Boolean);
        if (!tracks.length) throw new Error('no_tracks_arrived');

        var ms = S.streams[peerId] || (S.streams[peerId] = new MediaStream());
        tracks.forEach(function (t) {
            try { if (!ms.getTracks().some(function (x) { return x.id === t.id; })) ms.addTrack(t); } catch (_) {}
        });
        log('받기 성공', peerId, tracks.length + '트랙');
    }

    /* ═══ 3) 화면에 붙이기 — 타일은 기존 함수가 그린다 ═════════════════════════════
       `vcAddRemoteVideo(userId, name, stream)` 는 그 타일이 이미 있으면 **srcObject 만 갈아끼운다**
       (보조 오디오까지 함께 갱신한다). 그래서 우리는 스트림만 넘기면 된다 —
       타일 만들기·유령 청소·이름표를 우리가 다시 구현하지 않는다. */
    function paint(peerId, stream) {
        try {
            if (typeof vcAddRemoteVideo !== 'function') return false;
            var nm = (S.peers[peerId] && S.peers[peerId].name) || peerId;
            vcAddRemoteVideo(peerId, nm, stream);
            return true;
        } catch (e) { log('타일 갈아끼우기 실패', e && e.message); return false; }
    }

    /* mesh 로 되돌리기 — «원래 흐르던 스트림» 을 다시 붙인다.
       ⚠️ vcRemoteStreams 도 `let` 이라 맨 이름으로 읽는다. */
    function repaintMesh(peerId) {
        try {
            var m = (typeof vcRemoteStreams !== 'undefined' && vcRemoteStreams) ? vcRemoteStreams[peerId] : null;
            if (m) paint(peerId, m);
        } catch (_) {}
    }

    /* ═══ 4) mesh 영상 송신 끄기 / 되돌리기 ═══════════════════════════════════════
       [왜 영상만] 사장님 제보가 「음성은 괜찮은데 얼굴이 문제」였다. 소리까지 옮기면 SFU 가
         죽는 순간 수업이 통째로 끊긴다. 옮기는 것은 «문제가 난 쪽» 뿐이다.
       [왜 replaceTrack(null)] 재협상이 필요 없다 — 되돌리기가 한 줄이고 즉시다.
       ⛔ PeerConnection 을 닫지 않는다. 닫으면 되돌아갈 길이 없어진다. */
    /* 🔴 ⛔ `replaceTrack(null)` 로 끄지 말 것 — 함정 대조 검사가 잡은 실제 결함이다.
       `idx-main.js` 는 영상 sender 를 **전부** `getSenders().find(s => s.track && s.track.kind === 'video')`
       로 찾는다(화면공유 시작·중지 · 가상배경 · 카메라 재시도·교체 · applyStep · vcAdaptiveQuality 등 9곳).
       track 을 null 로 만들면 그 find 가 `undefined` 가 되어 **적응 화질이 통째로 멈추고
       화면공유가 상대에게 안 간다 — 그런데 에러가 안 난다.**
       ✅ 대신 «인코딩만» 끈다(`encodings[].active=false`). track 은 그대로라 그 9곳이 계속 동작하고,
          되돌리기는 저장해 둔 파라미터를 다시 넣는 것뿐이다. */
    function cutMeshVideo() {
        if (S.meshCut) return;
        var pcs = null;
        try { pcs = (typeof vcPeerConnections !== 'undefined') ? vcPeerConnections : null; } catch (_) {}
        if (!pcs) return;
        Object.keys(pcs).forEach(function (id) {
            var pc = pcs[id]; if (!pc || !pc.getSenders) return;
            pc.getSenders().forEach(function (s) {
                if (!s || !s.track || s.track.kind !== 'video' || !s.getParameters) return;
                var prm;
                try { prm = s.getParameters(); } catch (_) { return; }
                if (!prm || !prm.encodings || !prm.encodings.length) return;
                var before = prm.encodings.map(function (e) { return { active: e.active }; });
                S.meshSaved.push({ sender: s, track: s.track, before: before });
                try {
                    prm.encodings.forEach(function (e) { e.active = false; });
                    s.setParameters(prm);
                } catch (_) {}
            });
        });
        if (!S.meshSaved.length) return;               // 끌 것이 없으면 «껐다» 고 적지 않는다
        S.meshCut = true;
        log('mesh 영상 송신 중단(인코딩 끔) — 갈래 ' + S.meshSaved.length + '개');
    }
    function restoreMeshVideo() {
        if (!S.meshCut) return;
        S.meshSaved.forEach(function (x) {
            try {
                var prm = x.sender.getParameters();
                if (prm && prm.encodings) {
                    prm.encodings.forEach(function (e, i) { e.active = x.before[i] ? x.before[i].active !== false : true; });
                    x.sender.setParameters(prm);
                }
            } catch (_) {}
        });
        S.meshSaved = [];
        S.meshCut = false;
        log('mesh 영상 송신 복구');
    }
    /* 우리가 끈 sender 의 트랙이 «바뀌었다» = 화면공유·가상배경·장치교체가 일어났다.
       그쪽이 주인공이 되어야 하므로 SFU 는 손을 뗀다. ⛔ 함수 «이름» 을 감시하지 않는다 —
       그 이름들이 전역이 아니라 조용히 헛돌 수 있다. sender 를 직접 본다. */
    function meshSenderChanged() {
        for (var i = 0; i < S.meshSaved.length; i++) {
            var x = S.meshSaved[i];
            try { if (x.sender.track !== x.track) return true; } catch (_) {}
        }
        return false;
    }

    /* ═══ 5) 되돌리기 — 어디서 실패하든 여기로 온다 ══════════════════════════════ */
    function fallback(why) {
        if (S.state === 'fallback' || S.state === 'off') return;
        S.state = 'fallback'; S.why = why || '';
        log('mesh 로 되돌립니다 —', S.why);
        restoreMeshVideo();
        Object.keys(S.streams).forEach(repaintMesh);
        S.streams = {}; S.gotAt = {}; S.seenFrames = {};
        try { if (S.pubPc) S.pubPc.close(); } catch (_) {}
        try { if (S.subPc) S.subPc.close(); } catch (_) {}
        S.pubPc = S.subPc = null;
        if (S.timer) { clearInterval(S.timer); S.timer = 0; }
        /* 명단에서 내 줄을 지운다 — 남이 «있는데 안 오는» 세션을 끌어가지 않게. */
        try { if (S.sid) peersApi({ room_id: myRoom(), session_id: S.sid, peer_id: myId(), leave: 1 }); } catch (_) {}
    }

    /* ═══ 6) 살아 있는지 확인 — «프레임이 실제로 늘고 있나» ═══════════════════════
       ⛔ `track.readyState === 'live'` 로 판정하지 말 것 — 원격 트랙은 상대가 사라져도
          계속 'live' 다(CLAUDE.md 2장 「연결이 계속 쌓임」에서 실측). 프레임 수를 센다. */
    function checkAlive() {
        if (!S.subPc || !S.subPc.getReceivers) return;
        var now = Date.now();
        S.subPc.getReceivers().forEach(function (r) {
            if (!r || !r.track || r.track.kind !== 'video' || !r.getStats) return;
            r.getStats().then(function (st) {
                st.forEach(function (s) {
                    if (s.type !== 'inbound-rtp') return;
                    var f = s.framesDecoded || 0;
                    var key = r.track.id;
                    if (f > (S.seenFrames[key] || 0)) { S.seenFrames[key] = f; S.gotAt[key] = now; }
                });
            }).catch(function () {});
        });
        /* 한 번이라도 프레임을 본 뒤에 STALL_MS 넘게 멈추면 되돌린다.
           ⚠️ «한 번도 못 본» 경우는 여기서 판정하지 않는다 — 붙는 중일 수 있다(GRACE_MS 는 위에서 봤다). */
        var keys = Object.keys(S.gotAt);
        if (!keys.length) return;
        var newest = 0;
        keys.forEach(function (k) { if (S.gotAt[k] > newest) newest = S.gotAt[k]; });
        if (now - newest > STALL_MS) fallback('sfu_stalled');
    }

    /* 카메라 트랙이 바뀌면(화면공유·가상배경·장치교체) 우리가 올린 것과 어긋난다 → 손을 뗀다.
       ⛔ 여기서 «다시 올리기» 를 하지 않는다 — 수업 중에 재협상을 반복하는 것이 더 위험하다. */
    function trackChanged() {
        try {
            var st = myStream(); if (!st) return true;
            var v = (st.getVideoTracks() || [])[0];
            if (!v) return false;                       // 카메라 끔은 track.enabled 라 id 가 그대로다
            return !!(S.myVideoTrack && v.id !== S.myVideoTrack);
        } catch (_) { return false; }
    }

    /* ═══ 7) 한 바퀴 — 명단 올리고, 새 사람 끌어오고, 살아 있는지 본다 ══════════ */
    async function tick() {
        if (!inCall()) { fallback('left_call'); return; }
        if (trackChanged()) { fallback('local_track_changed'); return; }
        if (meshSenderChanged()) { fallback('mesh_sender_changed'); return; }   // 화면공유·가상배경 등

        var r;
        try {
            r = await peersApi({
                room_id: myRoom(), session_id: S.sid, peer_id: myId(),
                audio_track: S.myAudioTrack, video_track: S.myVideoTrack,
                name: (function () { try { return document.getElementById('vc-local-box') ? (document.querySelector('#vc-local-box .video-label') || {}).textContent || '' : ''; } catch (_) { return ''; } })(),
                role: (function () { try { return window.vcMyRole || ''; } catch (_) { return ''; } })()
            });
        } catch (e) { return; }                       // 한 번 실패는 넘긴다(다음 틱에 다시)
        /* ⚠️ 첫 틱은 KV 최종일관성 때문에 `not_your_session` 403 이 날 수 있다(세션을 만든 직후 읽는다).
           한 번의 실패로 영구히 손을 떼면 「켰는데 아무 일도 안 일어난다」가 된다 — 연속 3회일 때만. */
        if (!r || r.ok === false || r.enabled === false) {
            S.peerFail = (S.peerFail || 0) + 1;
            if (r && r.enabled === false) { fallback('peers_off'); return; }
            if (S.peerFail >= 3) { fallback('peers_' + ((r && r.error) || 'off')); }
            return;
        }
        S.peerFail = 0;

        var list = r.peers || [];
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            var pid = String(p.peer_id || '');
            if (!pid || pid === myId()) continue;
            var info = { sid: String(p.session_id || ''), a: String(p.audio_track || ''), v: String(p.video_track || ''), name: String(p.name || '') };
            if (!info.sid || (!info.a && !info.v)) continue;
            var was = S.peers[pid];
            S.peers[pid] = info;
            /* 같은 세션·같은 트랙이면 다시 끌지 않는다 — 재협상이 쌓인다. */
            if (was && was.sid === info.sid && was.a === info.a && was.v === info.v && S.streams[pid]) continue;
            try {
                await pull(pid, info);
                if (S.streams[pid] && paint(pid, S.streams[pid])) {
                    S.state = 'live';
                    cutMeshVideo();                   // ✅ SFU 트랙이 «실제로 도착한 뒤에만» mesh 를 끈다
                }
            } catch (e) {
                fallback('pull_' + (e && e.message ? e.message : 'error'));
                return;
            }
        }
        checkAlive();
    }

    /* ═══ 8) 시작 — 수업에 들어간 뒤 «한 번만» ═══════════════════════════════════ */
    async function start() {
        if (S.started) return;
        S.started = true;
        if (!wanted()) { S.state = 'off'; S.why = 'not_enabled'; return; }
        if (amObserver()) { S.state = 'off'; S.why = 'observer'; return; }   // 참관자는 올릴 것이 없다
        if (!myRoom() || !myId() || !myStream()) { S.state = 'off'; S.why = 'not_ready'; return; }

        S.state = 'pub';
        try {
            var ok = await publish();
            if (!ok) { S.state = 'off'; return; }      // 서버가 «꺼짐» 이라고 함 = 정상
        } catch (e) {
            S.state = 'off'; S.why = 'publish_' + (e && e.message ? e.message : 'error');
            log('올리기 실패 — mesh 그대로', S.why);
            try { if (S.pubPc) S.pubPc.close(); } catch (_) {}
            S.pubPc = null;
            return;                                    // ⛔ 아직 mesh 를 안 껐으므로 되돌릴 것이 없다
        }
        S.state = 'sub';
        S.timer = setInterval(function () { tick().catch(function (e) { log('틱 오류', e && e.message); }); }, POLL_MS);
        tick().catch(function () {});
    }

    /* 수업에 들어간 순간을 «감시하지 않고» 안다 — vcCreatePeer 가 불리면 그때가 그때다.
       ⛔ body class MutationObserver 금지(홈 전체 정지 전력). ⛔ 상주 setInterval 금지. */
    function wrap() {
        if (window.__vcSfuWrapped) return;
        var orig = window.vcCreatePeer;
        if (typeof orig !== 'function') return;        // 아직 안 실렸으면 아래 지연 재시도가 맡는다
        window.__vcSfuWrapped = true;
        window.vcCreatePeer = function (userId, username) {
            var pc = orig.apply(this, arguments);
            try { if (username && userId) { S.peers[userId] = S.peers[userId] || { sid: '', a: '', v: '', name: String(username) }; } } catch (_) {}
            try { start(); } catch (e) { log('시작 실패', e && e.message); }
            return pc;
        };
        log('준비됨 (켜짐: ' + wanted() + ')');
    }

    /* 이 파일이 idx-main.js «뒤» 에 오지만, defer 순서가 바뀌어도 죽지 않게 몇 번만 재시도한다. */
    var tries = 0;
    (function arm() {
        wrap();
        if (window.__vcSfuWrapped || tries++ > 20) return;
        setTimeout(arm, 300);
    })();

    /* 📏 효과 측정 — ⚠️ `vc_quality` 로는 못 잽니다.
       mesh 영상 인코딩을 끄면 보내는 표본이 0이 되어 그 표에는 «영상 없음(novideo)» 으로 찍히고,
       받는 쪽 통계(rx_freeze·concealed)는 mesh PC 에만 붙어 있어 SFU 로 온 것을 안 봅니다.
       그래서 시험할 때는 콘솔에서 `__vcSfu.stats()` 를 부르세요 — SFU 로 «실제로» 받은
       멈춤 횟수·끊긴 소리 비율을 그 자리에서 찍습니다. (mesh 와 나란히 놓고 비교하는 것은 별건) */
    S.stats = function () {
        if (!S.subPc || !S.subPc.getReceivers) { log('SFU 수신 없음 — state=' + S.state + ' why=' + S.why); return; }
        S.subPc.getReceivers().forEach(function (r) {
            if (!r || !r.track || !r.getStats) return;
            r.getStats().then(function (st) {
                st.forEach(function (x) {
                    if (x.type !== 'inbound-rtp') return;
                    if (r.track.kind === 'video') {
                        log('📹 SFU 영상 — 프레임', x.framesDecoded, '· 멈춤', x.freezeCount,
                            '· 폭', x.frameWidth, '· 손실', x.packetsLost);
                    } else {
                        var c = x.concealedSamples || 0, t = x.totalSamplesReceived || 0;
                        log('🔊 SFU 소리 — 끊긴 비율', t ? (100 * c / t).toFixed(2) + '%' : '모름', '· 손실', x.packetsLost);
                    }
                });
            }).catch(function () {});
        });
    };

    /* 수업을 나갈 때 명단에서 내 줄을 지운다(남이 죽은 세션을 끌어가지 않게). */
    window.addEventListener('pagehide', function (ev) {
        try {
            if (ev && ev.persisted) return;            // 앱 전환·화면잠금은 «나간 것» 이 아니다(1-4)
            if (S.sid && navigator.sendBeacon) {
                navigator.sendBeacon('/api/class/sfu-peers', new Blob([JSON.stringify({
                    room_id: myRoom(), session_id: S.sid, peer_id: myId(), leave: 1, token: tok()
                })], { type: 'application/json' }));
            }
        } catch (_) {}
    });
})();
