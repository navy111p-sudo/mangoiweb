// idx-main.js — index.html 의 가장 큰 인라인 <script> 를 그대로 옮긴 것 (2026-08-09)
//
// 왜 옮겼나
//   이 블록 하나가 762KB · 12,616줄로, index.html 인라인 전체(1,320KB)의 58% 였다.
//   인라인이면 **배포할 때마다 다시 받는다** — deploy.ps1 이 캐시 무효화를 위해
//   모든 HTML 에 BUILD 스탬프를 새로 박기 때문에 index.html 은 매번 새 파일이 된다.
//   외부 파일로 빼면 내용이 그대로일 때 브라우저가 다시 받지 않는다.
//
// ⚠️ 원본을 **한 글자도 바꾸지 않았다**. classic script 를 같은 자리에 두므로
//    실행 순서와 전역 스코프가 그대로다(defer 를 붙이면 안 된다 — 아래 코드가 이 전역을 쓴다).
// ⚠️ 고칠 때는 이 파일을 고친다. index.html 로 되돌리지 말 것.
// ⚠️ 내용을 바꾸면 태그의 ?v= 를 반드시 올린다(asset_version_harness 가 막는다).

/* 🌐 (2026-08-14) 언어 판정의 «정본» — miIsEn()
   ══════════════════════════════════════════════════════════════════
   [왜 필요한가] index.html 에는 i18n 엔진이 두 개다. 나중에 로드되는 js/mango-i18n.js 가
      setLang/getLang/toggleLang 을 덮어쓰는데, **인라인 엔진의 전역 currentLang 은 안 건드린다.**
      그래서 강사가 🌐 를 눌러 영어로 바꿔도 currentLang 은 'ko' 인 채로 남는다.
      이 파일이 currentLang 을 직접 읽던 23곳은 그동안 «영어로 안 바뀌는 자리» 였다 —
      페이지 목록·영상 플레이어·카메라 꺼짐 표시·채팅 입력칸 등. 필리핀 강사에게만 나는 문제다.
      (CLAUDE.md 「언어 판정」 함정에 적혀 있는 그것이다.)
   [고침] 판정을 여기 하나로 모은다. getLang() → localStorage → currentLang 순으로 본다.
   ⚠️ 새 코드에서 currentLang 을 직접 읽지 말 것. miIsEn() 을 쓴다. */
function miIsEn(){
    try { if (typeof getLang === 'function') return getLang() === 'en'; } catch (_) {}
    try { var ls = localStorage.getItem('mangoi_lang'); if (ls) return ls === 'en'; } catch (_) {}
    try { if (typeof currentLang !== 'undefined') return currentLang === 'en'; } catch (_) {}
    return false;
}
window.miIsEn = miIsEn;

/* ================================================================
   1. 뷰(화면) 전환 시스템
   ──────────────────────────────────────────────────────────────────
   SPA(Single Page Application)의 핵심 원리:
   - 모든 "화면"은 하나의 HTML 안에 있는 <div>입니다.
   - showView()를 호출하면 모든 뷰에서 'active'를 제거하고,
     원하는 뷰에만 'active'를 추가합니다.
   - 이렇게 하면 브라우저가 새 페이지를 로드하지 않아 빠릅니다.
================================================================ */
function showView(viewId) {
    // 1) 모든 뷰에서 'active' 클래스를 제거 (= 모든 화면 숨김)
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    // 2) 선택한 뷰에만 'active' 추가 (= 해당 화면만 표시)
    document.getElementById(viewId).classList.add('active');
}

/* ================================================================
   2. WebSocket 연결 & 재연결 로직
   ──────────────────────────────────────────────────────────────────
   WebSocket은 서버와 "실시간 양방향 통신"을 하기 위한 기술입니다.
   HTTP와 달리 한번 연결하면 서버에서도 클라이언트로 메시지를 보낼 수 있습니다.

   createWebSocket() 함수는 연결이 끊어졌을 때 자동으로 재연결을
   시도하는 "방어 로직"을 포함합니다.
================================================================ */

/**
 * WebSocket을 생성하고 재연결 로직을 설정합니다.
 *
 * @param {string} path - 연결할 WebSocket 경로 (예: '/ws/signaling?roomId=abc')
 * @param {function} onMessage - 메시지 수신 시 호출될 콜백
 * @param {function} onOpen - 연결 성공 시 콜백
 * @param {function} onClose - 연결 종료 시 콜백
 * @returns {object} { ws, close() } - WebSocket 인스턴스와 수동 종료 함수
 */
function createWebSocket(path, onMessage, onOpen, onClose) {
    // ── 재연결 설정 ──
    let ws = null;
    let reconnectAttempts = 0;       // 현재 재연결 시도 횟수
    const MAX_RECONNECT = 10;        // 최대 재연결 시도 횟수 (5→10)
    let reconnectTimer = null;       // 재연결 타이머 ID
    let intentionalClose = false;    // 사용자가 의도적으로 닫았는지 여부
    let terminated = false;          // 서버가 '재접속해도 소용없음' 을 통보(정원초과·강제종료) — 되돌리지 않는다
    let pingInterval = null;         // keepalive ping 타이머

    /* 🇵🇭 (2026-07-24) pong 워치독 — "끊겼는데 끊긴 줄 모르는" 반열림(half-open) 소켓 대응.
       필리핀 강사 튕김의 1순위 원인이었다. CGNAT·모바일 기지국 전환은 TCP RST 없이 조용히
       경로만 끊는데, 그러면 브라우저는 readyState 를 계속 OPEN 으로 유지한다.
       → onclose 가 영영 안 오고, 이 파일에 쌓아 둔 재연결·복구 장치가 단 하나도 발동하지 않는다.
         (강사 화면은 붙어 있는 것처럼 보이는데 신호는 아무것도 오가지 않는 상태)
       예전엔 pong 을 받아도 그냥 버렸다(`if (data.type === 'pong') return;`). 이제 답이 왔는지 확인하고,
       연속으로 답이 없으면 죽은 것으로 보고 강제로 close 한다.
       ⚠️ 여기서 close 하는 것이 '끊는' 게 아니다. 이미 끊어진 것을 '알아채서' 기존 재연결 경로에
          태우는 것이다. 허용치를 줄이면 지연이 큰 회선에서 멀쩡한 연결을 끊게 되므로 넉넉히 잡는다. */
    let pongMissed = 0;              // 연속으로 답이 없었던 ping 횟수
    let pingSentAt = 0;              // 답을 기다리는 중인 ping 의 발신 시각(0 = 기다리는 것 없음)
    /* 🔴 (2026-07-24 재점검) 허용치를 반드시 2회 이상으로 둘 것.
       처음엔 "20초 안에 답이 없으면 끊기"로 짰는데, **판정 주기가 25초라 20초는 항상 초과**였다.
       즉 값과 무관하게 'pong 한 번만 늦어도 즉시 절단' 이 되어, 지연이 잦은 필리핀 회선에서는
       이 워치독이 오히려 멀쩡한 수업을 끊을 수 있었다(고치려던 증상과 사용자 눈에 구분 불가).
       → 시간이 아니라 **연속 미응답 횟수**로 판정한다. 2회 = 약 50초 무응답. */
    const PONG_MAX_MISS = 2;
    function startPing() {
        stopPing();
        pingInterval = setInterval(() => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            if (pingSentAt) {                 // 직전 ping 의 답이 아직 안 옴
                pongMissed++;
                if (pongMissed >= PONG_MAX_MISS) {
                    console.warn('[WebSocket] pong 연속 무응답 ' + pongMissed + '회 → 죽은 연결로 보고 재연결');
                    resetPongState();
                    try { ws.close(4002, 'pong-timeout'); } catch(_) {}
                    return;   // onclose 가 기존 재연결 로직을 태운다
                }
            }
            try { ws.send(JSON.stringify({ type: 'ping' })); pingSentAt = Date.now(); } catch(_) {}
        }, 25000); // 25초마다 ping (Cloudflare 유휴 타임아웃 방지)
    }
    function stopPing() {
        if (pingInterval) { clearInterval(pingInterval); pingInterval = null; }
        resetPongState();
    }
    /* 🔴 백그라운드 복귀·즉시재연결 직후에는 반드시 이걸 부를 것.
       탭이 얼어 있는 동안 '답을 기다리는 중' 상태가 그대로 남아 있으면,
       복귀 첫 틱에 멀쩡한 소켓을 죽은 것으로 오판한다. */
    function resetPongState() { pingSentAt = 0; pongMissed = 0; }

    function connect() {
        // 🔴 (2026-07-24 재점검) 새 소켓을 만들기 전에 pong 대기상태를 반드시 비운다.
        //   낡은 소켓의 onclose 는 'sock !== ws' 가드에 걸려 stopPing() 을 못 부르는 경우가 있는데,
        //   그러면 살아남은 인터벌이 옛 pingSentAt 을 든 채 '갓 붙은 새 소켓' 을 죽인다.
        resetPongState();
        // wss:// (암호화된 WebSocket) 프로토콜 사용
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${location.host}${path}`;

        /* 🔒 (2026-07-21) 소켓 증식 방지 — 핸들러를 '자기 소켓'에만 묶는다.
           예전 문제: 핸들러가 클로저 변수 ws 를 그대로 참조해, 이미 버려진 소켓의 onclose 가
           나중에 실행되면서 (a) stopPing() 으로 살아있는 새 소켓의 keepalive 를 꺼버리고
           (b) 재연결을 한 번 더 예약해 소켓이 2개, 4개로 늘어났다.
           reconnectNow() 는 readyState 가 CLOSING/CLOSED 면 바로 connect() 를 부르는데,
           onclose 이벤트는 그보다 늦게 큐에서 실행되므로 이 순서가 실제로 발생한다.
           증식이 시작되면 onopen 의 '재연결 감지' 분기가 매번 vcCleanupAllPeers() 를 돌려
           수업 내내 화면이 끊겼다 붙었다 한다. */
        const sock = new WebSocket(url);
        if (ws && ws !== sock) {
            try { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; } catch (_) {}
            try { ws.close(); } catch (_) {}
        }
        ws = sock;

        // ── 연결 성공 시 ──
        sock.onopen = () => {
            if (sock !== ws) return;   // 낡은 소켓의 이벤트 → 무시
            console.log('[WebSocket] 연결 성공! reconnectAttempts:', reconnectAttempts);
            const isReconnect = reconnectAttempts > 0;
            reconnectAttempts = 0;  // 재연결 카운터 초기화
            startPing(); // keepalive 시작

            // 🔁 (2026-07-24) ★ 재연결 시 기존 PeerConnection 정리를 '여기서 즉시' 하지 않고 보류한다.
            //   room-joined 응답의 userId 가 직전과 같으면(=서버가 정체성을 물려줌) 살아있는 연결을 보존하고,
            //   다르면(스위치 off 또는 첫 입장) 그때 정리한다. 판단은 vcHandleMessage 의 room-joined 에서.
            //   ⚠️ 스위치 off 서버는 항상 '새 userId' 를 주므로 room-joined 에서 반드시 정리된다 = 예전과 동일.
            window.__vcWasReconnect = isReconnect;
            // 🛟 안전망: room-joined 가 오지 않는 경로(관찰자 등)에서도 예전처럼 정리되도록 4초 후 폴백.
            //   (정상 경로는 room-joined 가 즉시 도착해 이 폴백 전에 __vcWasReconnect 를 false 로 만든다.)
            if (isReconnect) {
                setTimeout(function(){
                    if (window.__vcWasReconnect && typeof vcCleanupAllPeers === 'function') {
                        window.__vcWasReconnect = false;
                        console.log('[vc] 재연결 폴백 정리(room-joined 미수신)');
                        vcCleanupAllPeers();
                    }
                }, 4000);
            }

            if (onOpen) onOpen(ws);
            try { if (typeof vcEvalReconnecting === 'function') vcEvalReconnecting(); } catch(_) {}
        };

        // ── 메시지 수신 시 ──
        sock.onmessage = (event) => {
            if (sock !== ws) return;   // 낡은 소켓의 이벤트 → 무시
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'pong') { resetPongState(); return; }   // 🇵🇭 살아있음 확인(위 pong 워치독)
                // 🚫 (2026-07-24) 정원초과·강제종료는 재접속해도 똑같이 거절당한다.
                //   예전엔 이 두 메시지를 아무도 처리하지 않아, 서버가 close(1000) 해도
                //   intentionalClose 가 false 라 곧바로 재연결 → join → 거절 → 재연결 무한루프가 돌았다.
                //   ⚠️ (재점검) intentionalClose 만으로는 부족하다 — reconnectNow() 가 그 값을 false 로
                //      되돌리므로, 관리자가 강제종료한 뒤 학생이 탭을 한 번 전환하면 조용히 재입장한다.
                //      되돌릴 수 없는 종료는 별도 플래그(terminated)로 못박는다.
                if (data.type === 'room-full' || data.type === 'force_end' || data.type === 'force-end') {
                    terminated = true;
                    intentionalClose = true;
                    try { stopPing(); } catch(_) {}
                    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
                    // 아무 안내도 없이 조용히 멈추면 "그냥 튕겼다"로 보인다 → 이유를 보여준다(한/영)
                    try {
                        const _en = miIsEn();
                        const _full = (data.type === 'room-full');
                        /* 🚪 (2026-08-06) 정원 숫자를 서버가 알려 준 값으로 표시한다.
                           예전엔 '10명' 이 하드코딩돼 있었는데, 방 종류별로 정원이 달라졌으므로
                           그대로 두면 4명 정원 방에서 "정원(10명)이 찼다"는 거짓 안내가 나간다. */
                        const _lim = (data.data && Number(data.data.limit)) || 10;
                        const _msg = _full
                            ? (_en ? ('This room is full (' + _lim + ' people). Please contact your manager.')
                                   : ('이 방은 정원(' + _lim + '명)이 가득 찼어요. 매니저에게 알려 주세요.'))
                            : (_en ? 'The class was ended by the administrator.'
                                   : '관리자가 수업을 종료했습니다.');
                        let _n = document.getElementById('vc-conn-notice');
                        if (!_n) {
                            _n = document.createElement('div');
                            _n.id = 'vc-conn-notice';
                            _n.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:99999;max-width:92vw;'
                                + 'background:rgba(15,23,42,.96);color:#fde68a;border:1px solid rgba(251,191,36,.5);border-radius:14px;'
                                + 'padding:13px 18px;font-size:14px;font-weight:700;line-height:1.5;text-align:center;box-shadow:0 12px 34px rgba(0,0,0,.5)';
                            document.body.appendChild(_n);
                        }
                        _n.textContent = (_full ? '🚪 ' : '⏹ ') + _msg;
                    } catch(_) {}
                }
                if (onMessage) onMessage(data, ws);
            } catch (e) {
                console.error('[WebSocket] 메시지 파싱 오류:', e);
            }
        };

        // ── 연결 종료 시 ──
        sock.onclose = (event) => {
            if (sock !== ws) return;   // 이미 교체된 낡은 소켓 → keepalive·재연결 건드리지 않음
            console.log('[WebSocket] 연결 종료: code=' + event.code + ' reason=' + event.reason);
            stopPing();
            if (onClose) onClose(event);

            // 의도적 종료가 아니면 자동 재연결 시도
            // 🔒 수업 중(vc-in-call)에는 횟수 제한 없이 계속 재시도 — "수업 절대 안 끊김" 원칙.
            //   (예전엔 10회 소진 후 영구 포기 → 긴 터널·와이파이 불안정 시 앱을 껐다 켜야만 복구됐음.
            //    지수 백오프는 16초에서 캡되므로 무한 재시도여도 서버 부담은 분당 최대 ~4회.)
            const inCall = document.body.classList.contains('vc-in-call');
            if (!intentionalClose && (reconnectAttempts < MAX_RECONNECT || inCall)) {
                try { if (inCall && typeof vcShowReconnecting === 'function') vcShowReconnecting(); } catch(_) {}
                reconnectAttempts++;
                const delay = Math.min(1000 * Math.pow(2, Math.min(reconnectAttempts - 1, 10)), 16000);
                console.log(`[WebSocket] ${delay/1000}초 후 재연결 시도... (${reconnectAttempts}${inCall ? '/∞(수업중)' : '/' + MAX_RECONNECT})`);
                reconnectTimer = setTimeout(connect, delay);
            }
        };

        // ── 에러 발생 시 ──
        sock.onerror = (error) => {
            if (sock !== ws) return;
            console.error('[WebSocket] 에러:', error);
        };
    }

    connect(); // 최초 연결

    // fix (2026-07-13) — 재연결 중 공유 메시지(교재/동영상) 유실 방지 큐.
    //   예전엔 연결 끊김 상태에서 send() 하면 그냥 버림 → 교사가 튼 동영상/교재 신호가
    //   사라져 학생이 폴링/재입장 때까지 못 봤음. 시그널링(offer/ice 등)은 재연결 시
    //   어차피 새로 시작하므로 큐잉하지 않고, '내용 공유' 타입만 큐에 담아 재연결 즉시 재전송.
    const QUEUEABLE_TYPES = { 'pdf-share':1, 'pdf-sync':1, 'pdf-page-change':1, 'pdf-stop-share':1, 'video-share':1, 'video-sync':1, 'video-stop-share':1, 'file-share':1, 'tab-sync':1, 'bg-lock':1, 'mic-lock':1, 'focus-lock':1, 'pdf-drawlock':1 };
    let sendQueue = [];   // [{type,...}] 최대 20개 — 같은 type 은 마지막 것만 유지
    function flushQueue() {
        if (!ws || ws.readyState !== WebSocket.OPEN || !sendQueue.length) return;
        const q = sendQueue; sendQueue = [];
        q.forEach(d => { try { ws.send(JSON.stringify(d)); } catch(e){} });
        console.log('[WebSocket] 재연결 후 대기 메시지 재전송:', q.length + '건');
    }
    const _origOnOpenFlush = onOpen;
    onOpen = function(sock){ try { flushQueue(); } catch(e){} if (_origOnOpenFlush) _origOnOpenFlush(sock); };

    // 외부에서 사용할 수 있는 인터페이스 반환
    return {
        get ws() { return ws; },

        send(data) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            } else if (data && QUEUEABLE_TYPES[data.type]) {
                sendQueue = sendQueue.filter(d => d.type !== data.type);   // 같은 타입은 최신만
                if (sendQueue.length < 20) sendQueue.push(data);
                console.warn('[WebSocket] 연결 끊김 → 재연결 시 재전송 예약:', data.type);
            } else {
                console.warn('[WebSocket] 전송 실패: 연결 끊김 상태');
            }
        },

        /** 🔴 앱 복귀 시 반드시 호출 — 탭이 얼어 있는 동안 '답 기다리는 중' 상태가 그대로
         *  남아 있으면, 복귀 첫 틱에 멀쩡한 소켓을 죽은 것으로 오판한다. */
        notePongResume() { resetPongState(); },

        /** 앱 복귀 등 즉시 재연결이 필요할 때 호출 */
        reconnectNow() {
            // 🚫 (2026-07-24 재점검) 관리자 강제종료·정원초과로 끝난 세션은 되살리지 않는다.
            //   이 가드가 없으면 학생이 탭을 한 번 전환하는 것만으로 조용히 재입장해,
            //   "관리자가 수업을 종료했습니다" 안내가 떠 있는데 방에는 들어가 있는 모순이 된다.
            if (terminated) { console.log('[WebSocket] 종료된 세션 — 재연결하지 않음'); return; }
            resetPongState();   // 복귀 직후 첫 틱이 멀쩡한 소켓을 죽이지 않게
            if (ws && (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING)) {
                console.log('[WebSocket] reconnectNow: 즉시 재연결 시도');
                clearTimeout(reconnectTimer);
                reconnectAttempts = 0;
                intentionalClose = false;
                connect();
            } else if (!ws || ws.readyState === WebSocket.CONNECTING) {
                // 연결 중이면 그대로 두고, 필요 시 재연결은 onclose에서 처리
            }
        },

        close() {
            intentionalClose = true;
            stopPing();
            clearTimeout(reconnectTimer);
            // ⚠️ 코드 1000(정상 종료) 명시 — 인자 없이 close() 하면 서버(DO)에는 1005(no status)로
            //   도착해 '네트워크 끊김(dropped)'으로 분류되고, 다른 참가자들이 60초 재연결 유예를
            //   기다리게 된다. 의도적 종료는 반드시 1000 으로 알린다.
            if (ws) { try { ws.close(1000, 'client-close'); } catch(_) { try { ws.close(); } catch(__){} } }
        }
    };
}

/* ================================================================
   3. ICE 서버 설정 (STUN / TURN)
   ──────────────────────────────────────────────────────────────────
   WebRTC에서 피어(peer)끼리 직접 연결하려면 서로의 "공인 IP 주소"를
   알아야 합니다. 하지만 대부분의 컴퓨터는 NAT(공유기) 뒤에 있어서
   자신의 공인 IP를 모릅니다.

   ⭐ STUN 서버: "너의 공인 IP는 이거야"라고 알려주는 서버
      → 무료로 사용 가능 (Google STUN 서버 등)
      → NAT가 단순한 경우 이것만으로 연결 가능

   ⭐ TURN 서버: NAT가 복잡하거나 방화벽이 있을 때
      미디어 데이터를 중계(relay)해주는 서버
      → 직접 연결이 안 될 때 최후의 수단
      → 보통 유료 (트래픽 비용 발생)

   아래 설정에서 TURN 서버 주소/계정을 입력하면 됩니다.
================================================================ */
// ICE_SERVERS: 서버에서 동적으로 TURN 자격증명을 가져와서 설정
// (Cloudflare TURN이 설정되면 동적 자격증명, 아니면 공개 STUN/TURN 폴백)
let ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
    ]
};

// 서버에서 최신 ICE 서버 설정을 가져옴 (TURN 포함)
let __vcIceLoadedAt = 0;      // TURN 자격증명 발급 시각
let __vcIceHasTurn  = false;  // relay(TURN) 서버 확보 여부
let __vcIcePromise  = null;   // 중복 fetch 방지 공유 promise
async function fetchIceServers() {
    try {
        const resp = await fetch('/api/turn-config');
        if (resp.ok) {
            const data = await resp.json();
            if (data.iceServers && data.iceServers.length > 0) {
                ICE_SERVERS = { iceServers: data.iceServers };
                __vcIceLoadedAt = Date.now();
                __vcIceHasTurn = data.iceServers.some(s => {
                    const u = Array.isArray(s.urls) ? s.urls.join(' ') : String(s.urls || '');
                    return u.indexOf('turn:') >= 0 || u.indexOf('turns:') >= 0;
                });
                console.log('[ICE] 서버에서 ICE 설정 로드 완료:', ICE_SERVERS.iceServers.length, '개 서버, TURN:', __vcIceHasTurn);
            }
        }
    } catch (e) {
        console.warn('[ICE] 서버 설정 로드 실패, 기본값 사용:', e);
    }
}
/* TURN 자격증명 준비 보장 — 연결(offer/answer/재연결) 직전에 호출.
   자동입장(vc_autojoin)은 페이지 로드 fetch가 끝나기 전에 연결을 만들 수 있어
   STUN만으로 시도 → 모바일/공유기 뒤에서는 연결 실패·잦은 끊김의 주원인.
   4시간 지난 자격증명도 재발급. 서버가 3초 내 응답 없으면 기존 설정으로 진행(수업 지연 금지). */
function vcEnsureIceServers() {
    const stale = !__vcIceHasTurn || (Date.now() - __vcIceLoadedAt > 4 * 3600 * 1000);
    if (!stale) return Promise.resolve();
    if (!__vcIcePromise) {
        __vcIcePromise = fetchIceServers().finally(() => { __vcIcePromise = null; });
    }
    return Promise.race([__vcIcePromise, new Promise(r => setTimeout(r, 3000))]);
}
// 페이지 로드 시 즉시 ICE 설정 가져오기
fetchIceServers();

/**
 * getUserMedia 에러를 사용자 친화적인 한국어 메시지로 변환합니다.
 */
function describeMediaError(err) {
    if (!err) return '알 수 없는 오류';
    const name = err.name || '';
    const detail = err.message ? ' (' + err.message + ')' : '';
    switch (name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            return '마이크/카메라 사용 권한이 거부되었습니다. 브라우저 주소창의 🔒 아이콘 → 카메라/마이크 → "허용"으로 변경한 후 새로고침하세요.' + detail;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return '마이크 또는 카메라 장치를 찾을 수 없습니다. OS 사운드 설정에서 입력 장치가 활성화되어 있는지 확인하세요.' + detail;
        case 'NotReadableError':
        case 'TrackStartError':
            return '다른 앱이 마이크/카메라를 점유 중입니다. Zoom, Teams, Discord, 다른 브라우저 탭 등을 종료한 후 다시 시도하세요.' + detail;
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
            return '요청한 미디어 설정이 장치에서 지원되지 않습니다.' + detail;
        case 'SecurityError':
            return '보안 정책에 의해 미디어 접근이 차단되었습니다. (HTTPS 필요)' + detail;
        case 'TypeError':
            return '브라우저가 미디어 API를 지원하지 않습니다.' + detail;
        default:
            return (name ? '[' + name + '] ' : '') + (err.message || '미디어 접근 실패');
    }
}

/**
 * 카메라/마이크를 안정적으로 획득합니다.
 * - 데스크탑에서 기본 장치 선택이 실패하는 경우 대비: 전체 → 제약 완화 → 오디오 전용 fallback
 * - 에코 제거/노이즈 억제/자동 게인을 명시적으로 활성화해 데스크탑 통화 품질 개선
 */
async function acquireLocalMedia({ video = true, audio = true } = {}) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const e = new Error('이 브라우저는 getUserMedia를 지원하지 않습니다.');
        e.name = 'TypeError';
        throw e;
    }

    const _savedMic = (function(){ try { return localStorage.getItem('mangoi_vc_mic_id') || ''; } catch(e){ return ''; } })();
    const audioConstraints = audio ? Object.assign({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: { ideal: 48000 }
    }, _savedMic ? { deviceId: { ideal: _savedMic } } : {}) : false;

    // 🔥 모바일 발열 최소화 — 휴대폰은 VGA(640x480)·15fps 로, PC는 HD·24fps 로 캡처
    var _isMobileCam = window.matchMedia('(max-width: 920px)').matches
                       || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    /* 📷 (2026-08-06) 마이크와 달리 카메라는 '저번에 고른 장치'를 기억하지 않아, USB 웹캠을 골라도
       다음 수업에 다시 노트북 내장 카메라로 돌아가 있었다. 마이크와 같은 규약(ideal)으로 맞춘다.
       exact 가 아니라 ideal 인 이유: 그 USB 캠을 빼고 들어와도 수업은 내장 캠으로 정상 시작해야 한다. */
    const _savedCam = (function(){ try { return localStorage.getItem('mangoi_vc_cam_id') || ''; } catch(e){ return ''; } })();
    const videoConstraints = video ? Object.assign(_isMobileCam ? {
        facingMode: 'user',
        width:  { ideal: 640,  max: 1280 },
        height: { ideal: 480,  max: 720 },
        frameRate: { ideal: 15, max: 20 }   // 30→15fps : CPU·발열 절반
    } : {
        // 📶 PC도 720p 로 하드캡(max) — 일부 카메라의 1080p 캡처 방지. 발화 위주 수업엔 화질 손실 없이 CPU·업로드 절감.
        width:  { ideal: 1280, max: 1280 },
        height: { ideal: 720,  max: 720 },
        frameRate: { ideal: 24, max: 30 }
    }, _savedCam ? { deviceId: { ideal: _savedCam } } : {}) : false;

    const _sleep = (ms) => new Promise(r => setTimeout(r, ms));
    // getUserMedia 재시도 헬퍼 — 카메라가 '사용 중(NotReadableError)'이면 잠깐 뒤 몇 번 더.
    //   (다른 앱/탭이 카메라를 놓는 중이거나, PC 카메라가 켜지는 데 시간이 걸리는 경우 대응)
    async function _gum(constraints, retries) {
        for (let i = 0; ; i++) {
            try {
                const _s = await navigator.mediaDevices.getUserMedia(constraints);
                try { window.vcApplyContentHints && window.vcApplyContentHints(_s); } catch (_) {}
                return _s;
            }
            catch (e) {
                var busy = (e && (e.name === 'NotReadableError' || e.name === 'TrackStartError' || e.name === 'AbortError'));
                if (i < (retries || 0) && busy) { console.warn('[media] 장치 사용중, ' + (i+1) + '차 재시도:', e.name); await _sleep(600); continue; }
                throw e;
            }
        }
    }

    // 1차: 통합 획득(고급 제약) — 카메라 사용중이면 최대 2회 재시도
    try {
        const stream = await _gum({ video: videoConstraints, audio: audioConstraints }, 2);
        // 오디오 트랙이 0개인데 요청은 했다면 최소 제약으로 재시도
        if (audio && stream.getAudioTracks().length === 0) {
            console.warn('[media] 고급 제약으로는 오디오 트랙 0 → 최소 제약 재시도');
            try { stream.getTracks().forEach(t => t.stop()); } catch(_) {}
            try { return await _gum({ video, audio: true }, 1); } catch(_) {}
        }
        // 비디오를 요청했는데 트랙이 없으면 아래 '분리 획득'으로 내려감
        if (!(video && stream.getVideoTracks().length === 0)) return stream;
        console.warn('[media] 통합 획득에 비디오 트랙 없음 → 분리 획득 시도');
        try { stream.getTracks().forEach(t => t.stop()); } catch(_) {}
    } catch (e1) {
        console.warn('[media] 통합(고급) 실패:', e1 && e1.name);
        // 2차: 통합(최소 제약)
        try {
            const s2 = await _gum({ video: video ? true : false, audio: audio ? true : false }, 1);
            if (!(video && s2.getVideoTracks().length === 0)) return s2;
            try { s2.getTracks().forEach(t => t.stop()); } catch(_) {}
        } catch (e2) {
            console.warn('[media] 통합(최소) 실패:', e2 && e2.name);
        }
    }

    // 3차: 🔑 비디오/오디오 '분리 획득' — 한쪽 장치가 막혀 있어도 다른 쪽은 확보.
    //   (예: 마이크가 다른 앱에 잡혀 있어 통합 요청이 통째로 실패해도, 카메라는 따로 살림)
    let _vStream = null, _aStream = null, _lastErr = null;
    if (video) {
        try { _vStream = await _gum({ video: videoConstraints }, 2); }
        catch (ev) { _lastErr = ev; try { _vStream = await _gum({ video: true }, 2); } catch (ev2) { _lastErr = ev2; console.warn('[media] 비디오 단독 실패:', ev2 && ev2.name); } }
    }
    if (audio) {
        try { _aStream = await _gum({ audio: audioConstraints }, 1); }
        catch (ea) { try { _aStream = await _gum({ audio: true }, 1); } catch (ea2) { console.warn('[media] 오디오 단독 실패:', ea2 && ea2.name); } }
    }
    if (_vStream || _aStream) {
        const merged = new MediaStream();
        if (_vStream) _vStream.getVideoTracks().forEach(t => merged.addTrack(t));
        if (_aStream) _aStream.getAudioTracks().forEach(t => merged.addTrack(t));
        if (merged.getTracks().length) return merged;
    }
    // 4차: 완전 실패 — 마지막 오류를 그대로 던져 상위에서 안내/오디오전용 폴백
    throw (_lastErr || new Error('미디어 장치 접근 실패'));
}


/* ================================================================
   5. 다자간 화상통화
   ──────────────────────────────────────────────────────────────────
   1:1과 비슷하지만, 여러 명이 참여하므로
   각 참가자마다 별도의 RTCPeerConnection을 생성합니다.
   (Mesh 토폴로지: 모든 참가자끼리 직접 연결)
================================================================ */

let vcConn = null;              // WebSocket 연결
// fix (2026-06-01) — 교재 공유 전용 전송 함수. selectFromTextbookLibrary(다른 스코프)가 window.vcConn 타이밍에
//   의존하지 않고, 여기 '지역 vcConn'을 직접 써서 확실히 전송. 교사 화면에 전송 확인 토스트도 표시.
window.vcShareTextbook = function(pdfId, url, kind, name, quiet){
  try {
    var shareUrl = url || '';
    if (shareUrl && shareUrl.charAt(0) === '/') shareUrl = location.origin + shareUrl;
    if (vcConn && typeof vcConn.send === 'function') {
      vcConn.send({ type: 'pdf-share', data: { pdfId: pdfId, url: shareUrl, currentPage: 1, kind: kind || '', name: name || '' } });
      // 교사 자신은 이미 교재를 보고 있으므로, 폴링이 재로드하지 않도록 표시 키/URL 을 맞춰둠
      try { var _abs = (shareUrl && shareUrl.charAt(0)==='/') ? location.origin+shareUrl : shareUrl; window._vcShownPdfUrl = _abs; window._vcShownPdfKey = _abs + '|1'; window._vcShownPdfName = name || window._vcShownPdfName || ''; } catch(_){}
      console.log('[vcShareTextbook] ✅ 전송:', shareUrl, kind);
      if (!quiet) { try { if (typeof showToast === 'function') showToast('📤 교재 공유 전송됨 → 학생'); } catch(_){} }
      return true;
    }
    // quiet=입장 자동 공유의 재시도 경로 — WS 가 아직 안 열린 정상 타이밍이므로 경고 토스트 생략
    console.warn('[vcShareTextbook] ❌ vcConn 연결 없음' + (quiet ? ' (자동 공유 재시도 예정)' : ' — 방에 입장했는지 확인'));
    if (!quiet) { try { if (typeof showToast === 'function') showToast('⚠️ 화상수업 연결이 없어 교재 공유 못함(방 재입장 필요)'); } catch(_){} }
    return false;
  } catch(e){ console.warn('[vcShareTextbook] 예외', e); return false; }
};

// fix (2026-06-02) — 교재 표시 '안전장치(폴링)':
//   학생이 실시간 WebSocket pdf-sync 메시지를 놓쳐도(연결 끊김/재연결/타이밍),
//   방 상태(/api/room-status/{room}.pdfState)를 3초마다 확인해 교사가 올린 교재를 무조건 띄움.
//   → "반드시 학생이 교재를 본다" 보장.
window._vcShownPdfKey = '';            // 현재 표시 중인 교재 키 (url|page) — 중복 로드 방지
window._vcShownPdfUrl = '';            // 현재 표시 중인 교재 URL (같은 교재면 페이지 이동만)
window._vcShownPdfName = '';           // 현재 교재 이름 "[교재] 레슨 / 파일" — 화살표 시퀀스 재구성용
window._vcPdfPollTimer = null;
/* @param fromTeacherPush  교사가 «지금» 교재를 연 신호(pdf-share)면 true.
                           주기 폴링으로 상태를 복원하는 경우는 false/생략. */
window.vcApplySharedPdf = function(sUrl, sKind, currentPage, sPid, sName, fromTeacherPush){
  try {
    if (!sUrl) return;
    if (/^blob:/i.test(sUrl)) return;  // 로컬 blob 은 다른 기기에서 열 수 없음
    // 🥭 (2026-07-13) 교사가 교재를 공유 → 세로폰에서 '내용 크게(pip)'로 자동 전환.
    window.__vcPdfShared = true;
    try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}

    /* 🔴 (2026-08-08 마이마이 ⑤) 「교사가 교재를 열었는데 학생은 교재 버튼을 눌러야 보인다」
       [원인] 탭 전환(vcSwitchTab('pdf'))이 이 함수 **한참 아래**에 있어서, 밑의 두 조기반환
              ─ ①「이미 같은 교재/페이지」 ②「같은 교재, 페이지만 다름」 ─ 에 걸리면
              **통째로 건너뛰어졌다.** 학생은 입장할 때 폴링(pdfState)이 이미 그 교재를 받아
              키를 세워 두는 일이 많아, 정작 교사가 교재를 열면 «이미 갖고 있다» 며 아무 일도
              일어나지 않았다 — 화면은 얼굴만 그대로.
       [수정] 교사가 «지금 연» 신호일 때는 조기반환보다 **먼저** 교재를 앞으로 가져온다.
              탭 전환은 idempotent 하고 비용이 없다. 아래 가드의 목적은 «PDF 재로드 방지» 지
              «보여주지 않기» 가 아니었다.
       ⚠️ 폴링에서는 하지 않는다 — 학생이 칠판·게임을 보는 중에 3초마다 교재로 끌려간다. */
    if (fromTeacherPush) {
      try { if (typeof vcSwitchTab === 'function') vcSwitchTab('pdf'); } catch(_){}
      try { if (typeof showToast === 'function') showToast('👩‍🏫 선생님이 교재를 열었어요'); } catch(_){}
    }

    if (sUrl.charAt(0) === '/') sUrl = location.origin + sUrl;
    // 교재 이름("[교재] 레슨 / 파일")을 기억 — 화살표가 시퀀스를 서버에서 재구성할 때 책 이름으로 사용
    if (sName) window._vcShownPdfName = sName;
    // 이미 시퀀스를 갖고 있으면 현재 위치도 같이 맞춰둠 (다른 기기가 넘긴 뒤 인덱스 어긋남 방지)
    try { if (typeof pdfSyncSeqIdx === 'function') pdfSyncSeqIdx(sUrl); } catch(_){}
    var pg = currentPage || 1;
    var key = sUrl + '|' + pg;
    if (key === window._vcShownPdfKey) return;  // 이미 같은 교재/페이지 표시 중
    // 같은 교재인데 페이지만 다르면 → 전체 재로드 없이 페이지 이동만(깜빡임 방지)
    if (sUrl === window._vcShownPdfUrl) {
      /* 🔒 (2026-07-29) 방금 내가 넘긴 직후라면 폴링이 끌어가지 못하게 한다.
         [문제] 넘긴 내용이 서버에 아직 반영되지 않았거나 전송이 막힌 경우, 3초 폴링이
                옛 페이지(대개 1페이지)로 되돌려 버렸다. 강사가 "넘겨도 첫 페이지만 보인다"고
                한 증상. 내가 조작 중일 때는 내 화면이 우선이다(5초). */
      if (Date.now() - (window._vcPdfLocalNavAt || 0) < 5000) {
        try { window._pdfSyncShownKey && window._pdfSyncShownKey(); } catch(_){}   // 다른 <script> 블록이라 window 경유
        return;
      }
      window._vcShownPdfKey = key;
      try { if (typeof pdfGoToPage === 'function') pdfGoToPage(pg); else { if (typeof pdfPageNum !== 'undefined') pdfPageNum = pg; if (typeof pdfRender === 'function') pdfRender(); } } catch(_){}
      return;
    }
    var k = sKind || '';
    if (!k) {
      if (/textbook-files|\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(sUrl)) k = 'image';
      else if (/\.pdf(\?|$)/i.test(sUrl)) k = 'pdf';
    }
    window._vcShownPdfKey = key;
    try { if (typeof pdfCurrentId !== 'undefined') pdfCurrentId = sPid || sUrl; } catch(_){}
    try { if (typeof vcSwitchTab === 'function') vcSwitchTab('pdf'); } catch(_){}
    try { if (typeof showToast === 'function') showToast('📥 교재 수신 — 여는 중 (' + (k || '자동') + ')'); } catch(_){}
    Promise.resolve(pdfLoad(sUrl, k || undefined)).then(function(){
      window._vcShownPdfUrl = sUrl;  // 현재 교재 URL 기록 (이후 페이지 이동은 재로드 없이)
      try { if (typeof pdfPageNum !== 'undefined') pdfPageNum = currentPage || 1; } catch(_){}
      try { if (typeof pdfRender === 'function') pdfRender(); } catch(_){}
      try { if (typeof showToast === 'function') showToast('✅ 교재 표시됨'); } catch(_){}
    }).catch(function(){
      var alt = (k === 'image') ? 'pdf' : 'image';
      Promise.resolve(pdfLoad(sUrl, alt)).then(function(){
        window._vcShownPdfUrl = sUrl;
        try { if (typeof pdfPageNum !== 'undefined') pdfPageNum = currentPage || 1; } catch(_){}
        try { if (typeof pdfRender === 'function') pdfRender(); } catch(_){}
        try { if (typeof showToast === 'function') showToast('✅ 교재 표시됨(재시도)'); } catch(_){}
      }).catch(function(e2){
        window._vcShownPdfKey = '';  // 실패 시 키 초기화 → 다음 폴링에서 재시도
        try { if (typeof showToast === 'function') showToast('❌ 교재 로드 실패: ' + (e2 && e2.message || e2)); } catch(_){}
      });
    });
  } catch(e){ console.warn('[vcApplySharedPdf]', e); }
};
window.vcStartPdfPoll = function(){
  try {
    // fix (2026-06-02) — 입장할 때마다 '표시 상태'를 초기화. 안 하면 이전 세션의 _vcShownPdfUrl 이 남아
    //   같은 교재가 '이미 표시 중'으로 잘못 판단돼 페이지 이동만 하고 실제 로드를 건너뜀(학생 흰 화면 회귀).
    window._vcShownPdfKey = '';
    window._vcShownPdfUrl = '';
    window._vcShownVideoUrl = '';
    window._vcJoinedRoomId = '';   // ★ (2026-07-20) room-joined 수신 전엔 폴링 미적용 (아래 참조)
    if (window._vcPdfPollTimer) clearInterval(window._vcPdfPollTimer);
    // 입장 직후 즉시 1회 확인(3초 기다리지 않고 바로 교재 표시)
    var _pollOnce = function(){
      try {
        if (!vcRoomId) return;
        // ★ (2026-07-20) WS 입장(room-joined)이 완료되기 전엔 방 미디어 상태를 적용하지 않는다.
        //   서버(DO)가 '첫 입장 시 지난 수업 잔존 pdf/video 상태 정리'를 room-joined 전에 수행하므로,
        //   그 전에 폴링이 먼저 닿으면 이미 지워질 낡은 유튜브/교재가 첫 화면을 한 번 차지할 수 있음.
        if (window._vcJoinedRoomId !== vcRoomId) return;
        // fix (2026-07-13) — /api/room-status 는 보안 잠금(관리자 전용)으로 학생에게 401.
        //   참가자용 공개 미디어 상태 엔드포인트(/api/room-media, PII 없음)로 폴링.
        fetch('/api/room-media/' + encodeURIComponent(vcRoomId), { cache: 'no-store' })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){
            if (d && d.pdfState && d.pdfState.url) {
              window.vcApplySharedPdf(d.pdfState.url, d.pdfState.kind, d.pdfState.currentPage, d.pdfState.pdfId, d.pdfState.name);
            }
            // 🎬 공유 중인 동영상도 폴링으로 복구 (WS 메시지를 놓친 학생 자가복구)
            if (d && d.videoState && d.videoState.url) {
              window.vcApplySharedVideo(d.videoState.url);
            }
          }).catch(function(){});
      } catch(_){}
    };
    setTimeout(_pollOnce, 800);
    window._vcPdfPollTimer = setInterval(_pollOnce, 3000);
    console.log('[vcPdfPoll] 시작 — 입장 직후 + 3초마다 방 교재 상태 확인');
  } catch(e){}
};
window.vcStopPdfPoll = function(){
  try { if (window._vcPdfPollTimer) { clearInterval(window._vcPdfPollTimer); window._vcPdfPollTimer = null; } } catch(_){}
};

/* 🎯 (2026-08-11 강사 피드백 — "영상이 멈춘다", "렉") 트랙에 «무엇을 찍고 있는지» 를 알려 준다.
   인코더는 이 힌트가 없으면 «화질을 지킬지, 초당 장수를 지킬지» 를 스스로 짐작한다.
   수업 영상은 사람 얼굴·입모양이라 **초당 장수가 먼저**다 — 잠깐 흐려지는 것보다 멈추는 게 나쁘다.
     · 카메라  → 'motion' : 부하가 걸리면 화질을 먼저 낮추고 프레임을 지킨다(끊김 방지)
     · 마이크  → 'speech' : 음악이 아니라 말이라고 알려 주면 잡음억제·인코딩이 대화에 맞춰진다
     · 화면공유는 여기서 건드리지 않는다 — 글자가 뭉개지면 안 되므로 'detail'(vcShareMyScreen 참조)
   ⚠️ 표준 속성이라 미지원 브라우저에서는 그냥 무시된다(예외 없음). */
window.vcApplyContentHints = function (stream) {
    try {
        if (!stream || !stream.getTracks) return;
        stream.getTracks().forEach(function (t) {
            try {
                if (!('contentHint' in t)) return;
                if (t.kind === 'video') { if (!t.contentHint) t.contentHint = 'motion'; }
                else if (t.kind === 'audio') { if (!t.contentHint) t.contentHint = 'speech'; }
            } catch (_) {}
        });
    } catch (_) {}
};
let vcLocalStream = null;       // 내 미디어 스트림
let vcPeerConnections = {};     // { userId: RTCPeerConnection } 맵

/* 🔴🔴 (2026-08-06) `let` 은 window 프로퍼티를 만들지 않는다 — 이걸 몰라서 기능 여러 개가
   "코드는 있는데 한 번도 실행되지 않은" 상태로 방치돼 있었다.
     · vcHealLocalMic / vcHealLocalVideo  → `if (!window.vcLocalStream) return;` 에서 매번 즉시 반환
       = 마이크·카메라 자가치유가 단 한 번도 돈 적이 없다.
     · vcMicLockApply(선생님 전체 음소거) → `if (window.vcLocalStream)` 이 거짓이라 track.enabled 를
       실제로 끄지 못했다. 화면의 아이콘만 음소거로 바뀌고 소리는 그대로 나갔다.
     · vcShareMyScreen / vcStopMyScreen  → `Object.values(window.vcPeerConnections || {})` 가 항상 빈
       객체라 sender.replaceTrack 이 아무에게도 안 갔다 = 화면공유가 내 화면에만 보였다.
   같은 함정이 4158줄 주석에도 남아 있다(그때는 호출부만 고침). 근본은 '전역이 window 에 없다' 이므로
   여기서 접근자를 걸어 두 이름을 window 에서도 읽고 쓸 수 있게 한다. 기존 코드는 한 줄도 안 고쳐도 된다.
   ⚠️ 지우지 말 것 — 지우는 순간 위 4가지가 다시 조용히 죽는다. */
try {
    Object.defineProperty(window, 'vcLocalStream', {
        configurable: true,
        get: function(){ return vcLocalStream; },
        set: function(v){ vcLocalStream = v; }
    });
    Object.defineProperty(window, 'vcPeerConnections', {
        configurable: true,
        get: function(){ return vcPeerConnections; },
        set: function(v){ vcPeerConnections = v; }
    });
} catch (e) { console.warn('[vc] window 전역 노출 실패:', e); }
let vcPendingCandidates = {};   // fix (2026-07-05) { userId: [candidate...] } — remoteDescription 전에 온 ICE 후보 버퍼(유실 방지)
let vcRemoteStreams = {};       // fix (2026-06-01) { userId: MediaStream } — 트랙별 ontrack 누적용 (원격 영상 검게 나오던 문제)
let vcRoomId = '';
let vcUsername = '';
let vcUserId = '';              // 서버가 부여한 내 ID

/* ── Wake Lock (화면 꺼짐 방지) & 백그라운드 복귀 재연결 ──
   fix (2026-07-13) — 예전엔 딱 한 번 요청하고 끝. 시스템이 도로 풀면(탭 전환·알림·절전 등
   아주 흔함) 다시 안 잡아서 수업 중 화면이 꺼졌음. 이제:
   ① 풀리면(release 이벤트) 자동 재획득  ② 5초 감시 인터벌에서 수업 중 항상 보유 확인
   ③ Wake Lock API 미지원/실패 기기 → 무음 마이크로 비디오 루프 폴백(재생 중엔 화면 안 꺼짐) */
let wakeLock = null;
let __wakeLockPending = false;
async function requestWakeLock() {
    if (__wakeLockPending || wakeLock) return;
    __wakeLockPending = true;
    try {
        if ('wakeLock' in navigator) {
            const wl = await navigator.wakeLock.request('screen');
            wakeLock = wl;
            wl.addEventListener('release', () => {
                if (wakeLock === wl) wakeLock = null;
                console.warn('[wakeLock] 시스템이 해제함 → 재획득 예약');
                // 수업 중 + 화면 보이는 상태면 즉시 다시 잡기 (숨김 상태에선 어차피 불가 → 5초 감시가 잡음)
                if (document.body.classList.contains('vc-in-call') && document.visibilityState === 'visible') {
                    setTimeout(() => { requestWakeLock(); }, 400);
                }
            });
            console.log('[wakeLock] 화면 꺼짐 방지 활성화');
            __wakeLockPending = false;
            return;
        }
    } catch (err) { console.warn('[wakeLock] 실패(폴백 가동):', err && err.message); }
    __wakeLockPending = false;
    startWakeVideoFallback();   // API 없음/거부 → 비디오 루프 폴백
}
/* Wake Lock 폴백 — 캔버스 스트림을 문서 구석의 초소형 비디오로 계속 재생.
   재생 중인 비디오가 있으면 모바일 브라우저가 화면을 끄지 않는 성질(NoSleep 기법) 이용. */
let __wakeVideo = null;
function startWakeVideoFallback() {
    try {
        if (__wakeVideo) return;
        const cv = document.createElement('canvas');
        cv.width = 64; cv.height = 64;
        const cx = cv.getContext('2d');
        const stream = cv.captureStream ? cv.captureStream(1) : null;
        if (!stream) return;
        // 1초에 한 번 픽셀을 살짝 바꿔 '살아있는 영상'으로 유지
        __wakeVideo = document.createElement('video');
        __wakeVideo.muted = true; __wakeVideo.setAttribute('muted', '');
        __wakeVideo.setAttribute('playsinline', '');
        __wakeVideo.loop = true; __wakeVideo.autoplay = true;
        __wakeVideo.srcObject = stream;
        __wakeVideo.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1;';
        document.body.appendChild(__wakeVideo);
        let t = 0;
        __wakeVideo.__timer = setInterval(() => {
            t = (t + 1) % 2;
            cx.fillStyle = t ? '#000001' : '#000002';
            cx.fillRect(0, 0, 64, 64);
        }, 1000);
        const p = __wakeVideo.play(); if (p && p.catch) p.catch(() => {});
        console.log('[wakeLock] 비디오 루프 폴백 가동');
    } catch (e) { console.warn('[wakeLock] 폴백 실패:', e); }
}
function stopWakeVideoFallback() {
    try {
        if (!__wakeVideo) return;
        clearInterval(__wakeVideo.__timer);
        __wakeVideo.srcObject = null;
        __wakeVideo.remove();
        __wakeVideo = null;
    } catch (_) {}
}
/** 모든 비디오 엘리먼트를 다시 재생 (visibilitychange/pageshow/resume에서 공통 호출) */
function vcResumeAllVideos() {
    document.querySelectorAll('video').forEach(v => {
        if (v.srcObject && v.paused) {
            const p = v.play();
            if (p && p.catch) p.catch(err => {
                console.warn('[resume] video.play() 실패:', err && err.name);
                // 모바일 무음 자동재생 차단 → 일단 muted 로라도 재생해 검은 화면 방지,
                // 첫 화면 터치 시 원격 음소거 해제(소리 복구)
                try {
                    v.muted = true;
                    const p2 = v.play();
                    if (p2 && p2.catch) p2.catch(()=>{});
                    if (typeof vcArmGestureUnmute === 'function') vcArmGestureUnmute();
                } catch(_) {}
            });
        }
    });
}

/* ──────────────────────────────────────────────────────────────
   🎤 내 마이크 자가치유 (2026-07-14) — "학생 소리가 안 들려요" 근본 대책 (송신측)
   문제: 모바일에서 앱 전환/화면 꺼짐 시 OS 가 마이크 트랙을 강제 종료(ended)시키는데,
        기존엔 "복구 불가" 로그만 남기고 방치 → 그 뒤로 상대에게 내 소리가 영영 안 감.
   해결: 오디오 트랙이 전부 죽어 있으면 마이크를 다시 획득해 모든 피어의 sender 에
        replaceTrack — 재협상 없이 즉시 소리 복구. (앱 복귀 시 + 5초 감시에서 호출)
   ────────────────────────────────────────────────────────────── */
let __vcMicHealAt = 0;
async function vcHealLocalMic() {
    try {
        if (!document.body.classList.contains('vc-in-call')) return;
        if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;   // 관찰자는 마이크 없음
        if (!window.vcLocalStream) return;
        const tracks = vcLocalStream.getAudioTracks();
        if (tracks.some(t => t.readyState === 'live')) return;             // 살아있는 트랙 있음 = 정상
        if (!tracks.length) return;                                        // 애초에 마이크가 없던 입장(빈 스트림) — vcToggleMic 경로에 맡김
        const now = Date.now();
        if (now - __vcMicHealAt < 8000) return;                            // 8초 쿨다운(권한 팝업 도배 방지)
        __vcMicHealAt = now;
        console.warn('[mic-heal] 오디오 트랙 전부 ended → 마이크 재획득 시도');
        const base = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        const saved = (typeof vcSavedMicId === 'function') ? vcSavedMicId() : '';
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: saved ? Object.assign({ deviceId: { ideal: saved } }, base) : base });
        } catch (e1) {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        const newTrack = stream.getAudioTracks()[0];
        if (!newTrack) return;
        newTrack.enabled = ((typeof vcMicOn === 'undefined' || vcMicOn === null) ? true : !!vcMicOn)
            && !(window.__vcMicLockedByTeacher && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin');   // 음소거·전체음소거 잠금 존중
        // 죽은 트랙 정리 후 교체
        tracks.forEach(old => { try { old.stop(); } catch(_){} try { vcLocalStream.removeTrack(old); } catch(_){} });
        vcLocalStream.addTrack(newTrack);
        Object.values(vcPeerConnections || {}).forEach(pc => {
            try {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                if (sender) sender.replaceTrack(newTrack).catch(()=>{});
                else pc.addTrack(newTrack, vcLocalStream);
            } catch (e) { console.warn('[mic-heal] sender 교체 실패:', e); }
        });
        // 🔁 (2026-07-24) audio sender 가 아예 없던 피어(권한 없이 입장)는 위 addTrack 만으론
        //   재협상이 일어나지 않아 소리가 계속 안 간다 → 그 피어만 재협상.
        try { window.vcRenegotiateMissing && window.vcRenegotiateMissing('audio'); } catch (_) {}
        console.warn('[mic-heal] ✅ 마이크 자동 복구 완료');
        try { vcAddChatSystem('🎤 마이크가 자동으로 다시 연결됐어요.'); } catch(_) {}
    } catch (e) {
        console.warn('[mic-heal] 재획득 실패(다음 감시 틱에 재시도):', e && e.name);
    }
}

/* ──────────────────────────────────────────────────────────────
   📷 내 카메라 자가치유 (2026-07-14) — "상대가 내 얼굴이 안 보여요 / 검은 화면" 근본 대책 (송신측)
   문제: 로컬 미리보기(내 얼굴)는 멀쩡한데, OS/브라우저가 송출 카메라 트랙을 muted(프레임 0)
        또는 ended 로 만들면 → 상대에겐 '검은 영상'만 감. 연결·ontrack 은 정상이라
        기존 복구 로직(연결/트랙 '유무'만 봄)이 이를 못 잡고 검은 타일로 방치했다.
   해결: 송출 비디오 트랙이 ended, 또는 live 인데 muted 가 지속되면 카메라를 다시 획득해
        모든 피어 sender 에 replaceTrack — 재협상 없이 즉시 복구. (vcHealLocalMic 의 영상판)
   안전장치: 관찰자 / 카메라 OFF / 가상배경 ON 이면 건너뜀(정상 상태). muted 는 3틱(~15초)
        지속 시에만 발동, 10초 쿨다운으로 권한팝업·플리커 폭주 방지.
   ────────────────────────────────────────────────────────────── */
let __vcCamHealAt = 0;
let __vcCamMutedTicks = 0;
async function vcHealLocalVideo() {
    try {
        if (!document.body.classList.contains('vc-in-call')) { __vcCamMutedTicks = 0; return; }
        if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;          // 관찰자는 카메라 없음
        /* 🖥 (2026-07-30) 화면 공유 중에는 개입 금지 — 지금 보내는 트랙은 '화면'이므로
           카메라가 죽은 것으로 오인해 갈아끼우면 공유가 카메라로 되돌아가 버린다. */
        if (window.__vcScreenSharing) { __vcCamMutedTicks = 0; return; }
        if (!window.vcLocalStream) return;
        if (typeof vcCamOn !== 'undefined' && !vcCamOn) { __vcCamMutedTicks = 0; return; }  // 사용자가 카메라 끔 = 정상
        // 가상배경 켜져 있으면 송출은 합성 캔버스(정상) — 원본 카메라로 갈아끼우면 배경이 깨짐
        if (typeof vcBg !== 'undefined' && vcBg && vcBg.mode && vcBg.mode !== 'off') { __vcCamMutedTicks = 0; return; }
        const tracks = vcLocalStream.getVideoTracks();
        if (!tracks.length) return;                                              // 애초에 카메라 없이 입장
        const live = tracks.find(t => t.readyState === 'live');
        let bad = false;
        if (!live) bad = true;                                                   // 전부 ended = 즉시 복구
        else if (live.muted) { __vcCamMutedTicks++; if (__vcCamMutedTicks >= 3) bad = true; }  // 프레임0 지속
        else { __vcCamMutedTicks = 0; return; }                                  // 정상(프레임 흐름) = 개입 금지
        if (!bad) return;
        const now = Date.now();
        if (now - __vcCamHealAt < 10000) return;                                 // 10초 쿨다운
        __vcCamHealAt = now; __vcCamMutedTicks = 0;
        console.warn('[cam-heal] 송출 영상 트랙 이상(ended/muted) → 카메라 재획득 시도');
        let stream;
        // 📷 (2026-08-06) 사용자가 고른 카메라를 존중한다. 그냥 {video:true} 로 다시 잡으면
        //   자가치유가 돌 때마다 USB 웹캠 → 노트북 내장 카메라로 되돌아간다(사용자 눈엔 '설정이 안 먹음').
        const _pickedCam = (function(){ try { return localStorage.getItem('mangoi_vc_cam_id') || ''; } catch(_){ return ''; } })();
        try { stream = await navigator.mediaDevices.getUserMedia({ video: _pickedCam ? { deviceId: { ideal: _pickedCam } } : true }); }
        catch (e1) { console.warn('[cam-heal] getUserMedia 실패:', e1 && e1.name); return; }
        const newTrack = stream.getVideoTracks()[0];
        if (!newTrack) return;
        newTrack.enabled = (typeof vcCamOn === 'undefined') ? true : !!vcCamOn;   // 카메라 on/off 상태 존중
        // 죽은 트랙 정리 후 교체
        tracks.forEach(old => { try { old.stop(); } catch(_){} try { vcLocalStream.removeTrack(old); } catch(_){} });
        vcLocalStream.addTrack(newTrack);
        // 로컬 미리보기 갱신
        try {
            const lv = document.getElementById('vc-local-video');
            if (lv) { lv.srcObject = vcLocalStream; const p = lv.play(); if (p && p.catch) p.catch(()=>{}); }
        } catch(_){}
        // 모든 피어 sender 교체 (재협상 없이 즉시 복구)
        Object.values(vcPeerConnections || {}).forEach(pc => {
            try {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                if (sender) sender.replaceTrack(newTrack).catch(()=>{});
                else pc.addTrack(newTrack, vcLocalStream);
            } catch (e) { console.warn('[cam-heal] sender 교체 실패:', e); }
        });
        console.warn('[cam-heal] ✅ 카메라 자동 복구 완료');
        try { vcAddChatSystem('📷 카메라가 자동으로 다시 연결됐어요.'); } catch(_){}
    } catch (e) {
        console.warn('[cam-heal] 재획득 실패(다음 틱 재시도):', e && e.name);
    }
}

/* ──────────────────────────────────────────────────────────────
   🖥 내 컴퓨터 화면 공유 (2026-07-30, 강사 피드백 Kaye 4번)
   지적: "화면 공유가 다른 앱처럼 내 컴퓨터 화면을 보여 주는 게 아니라 화면을 나누는 것뿐이다"
   확인: 실제로 getDisplayMedia(브라우저 화면 공유) 를 쓰는 코드가 한 곳도 없었다 = 기능 자체가 없었음.
   방식: 카메라 자가치유(vcHealLocalVideo) 와 똑같이 sender.replaceTrack 으로 갈아끼운다.
        재협상이 없어 학생 쪽에서 끊김 없이 바로 화면이 바뀐다.
   안전: ① 공유 중에는 카메라 자가치유가 개입하지 않게 __vcScreenSharing 플래그를 세운다
             (그대로 두면 '카메라가 죽었다'고 오인해 화면공유를 카메라로 되돌려 버린다)
         ② 사용자가 브라우저 '공유 중지'를 누르면(track.onended) 카메라로 자동 복귀
         ③ 교사·관리자만 사용(학생이 자기 화면을 반 전체에 띄우는 사고 방지)
   ────────────────────────────────────────────────────────────── */
window.__vcScreenSharing = false;
window.__vcCamTrackBackup = null;
window.vcShareMyScreen = async function(){
    var en = (typeof getLang === 'function' && getLang() === 'en');
    try {
        /* 🎭 (2026-08-07 Kaye 5번) 칩 노출 판정과 «같은» 정본을 쓴다.
           예전엔 노출은 vcIsTeacherRole 을 OR 로 봤는데 여기는 vcMyRole 정확일치라,
           로비 입장 강사에게는 버튼이 보여도 누르면 "선생님만 쓸 수 있어요"가 떴다. */
        if (!(typeof vcIsStaffNow === 'function' ? vcIsStaffNow()
              : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'))) {
            alert(en ? 'Only teachers can share the screen.' : '화면 공유는 선생님만 사용할 수 있어요.');
            return;
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            alert(en ? 'This browser cannot share the screen. Please use Chrome or Edge on a computer.'
                     : '이 브라우저는 화면 공유를 지원하지 않아요. 컴퓨터의 크롬이나 엣지에서 사용해 주세요.');
            return;
        }
        if (window.__vcScreenSharing) { window.vcStopMyScreen(); return; }   // 다시 누르면 중지

        /* 🔊 (2026-08-12 Melca 피드백) audio:true — "유튜브를 공유하면 그림만 가고 소리는 안 간다".
           탭 공유는 «탭 소리 공유» 체크, 전체 화면 공유는 Windows 에서 시스템 소리를 준다.
           강사가 체크를 안 하면 오디오 트랙이 없을 뿐, 영상 공유는 그대로 된다. */
        var ds = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        var st = ds.getVideoTracks()[0];
        if (!st) return;
        /* 🎯 (2026-08-11) 화면 공유만은 «글자 선명함» 이 먼저다 — 카메라와 정반대.
           'detail' 을 주면 인코더가 부하 시 초당 장수를 먼저 줄이고 해상도를 지킨다.
           (카메라는 'motion' — 얼굴은 멈추면 안 되고, 화면은 글자가 뭉개지면 안 된다) */
        try { if ('contentHint' in st) st.contentHint = 'detail'; } catch (_) {}

        // 지금 보내고 있는 카메라 트랙을 보관(복귀용)
        try {
            var cur = (window.vcLocalStream && vcLocalStream.getVideoTracks()[0]) || null;
            window.__vcCamTrackBackup = cur || null;
        } catch(_){}

        window.__vcScreenSharing = true;
        window.__vcScreenTrack = st;   // 🖥 공유 «이후» 입장한 사람에게도 이 트랙을 준다 (vcCreatePeer)

        /* 🔊 시스템 소리가 있으면 «마이크 + 화면 소리» 를 WebAudio 로 섞어 하나의 오디오 트랙으로.
           마이크 sender 를 통째로 화면 소리로 갈아끼우면 강사 목소리가 사라지므로 반드시 믹스.
           마이크 음소거(track.enabled=false)는 믹스 안에서도 그대로 침묵이 되어 존중된다. */
        try {
            var sysA = ds.getAudioTracks()[0] || null;
            if (sysA) {
                var _AC = window.AudioContext || window.webkitAudioContext;
                var ac = new _AC();
                var dest = ac.createMediaStreamDestination();
                ac.createMediaStreamSource(new MediaStream([sysA])).connect(dest);
                var micT = null;
                try { micT = (window.vcLocalStream && vcLocalStream.getAudioTracks().find(function(t){ return t.readyState === 'live'; })) || null; } catch(_){}
                if (micT) ac.createMediaStreamSource(new MediaStream([micT])).connect(dest);
                var mixed = dest.stream.getAudioTracks()[0];
                window.__vcScreenAudio = { ctx: ac, mixed: mixed, micBackup: micT, sys: sysA };
                Object.values(window.vcPeerConnections || {}).forEach(function(pc){
                    try {
                        var aSender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'audio'; });
                        if (aSender) aSender.replaceTrack(mixed).catch(function(e){ console.warn('[screen-share] 오디오 믹스 교체 실패:', e); });
                    } catch(_){}
                });
                console.log('[screen-share] 시스템 소리 믹스 전송 시작');
            } else {
                window.__vcScreenAudio = null;
                console.log('[screen-share] 시스템 소리 없음(공유 창 선택 시 «소리 공유» 체크 안 함) — 영상만 공유');
            }
        } catch(e){ window.__vcScreenAudio = null; console.warn('[screen-share] 시스템 소리 믹스 실패(영상은 계속):', e); }
        /* 🖥 (2026-08-11 강사 Shas 2번) "공유하면 강사 자신에게만 보이고 학생에게는 안 나타난다"
           [원인 ①] 카메라가 «꺼져 있거나 없는» 강사에게는 보낼 비디오 sender 가 없다.
             그때 예전 코드는 `pc.addTrack(...)` 만 하고 끝냈다. 그런데 이 앱에는
             onnegotiationneeded 핸들러가 없다(1286행 주석) = **재협상을 아무도 안 한다.**
             트랙은 추가됐지만 상대에게는 그 트랙이 있다는 사실조차 전달되지 않는다 → 영영 안 보임.
             내 미리보기는 로컬 스트림을 직접 붙이므로 «나만 보이는» 정확히 그 증상이 된다.
           [원인 ②] `replaceTrack(...).catch(function(){})` 로 실패를 삼켰다. 한 명에게 못 갔는지
             전원에게 못 갔는지 강사는 알 방법이 없었고, 화면엔 «공유 중» 이라고만 떴다.
           [수정] 새 트랙을 추가한 연결은 반드시 offer 를 다시 보낸다(재협상).
             그리고 몇 명에게 실제로 갔는지 세어, 아무에게도 못 갔으면 강사에게 알린다. */
        var _peers = Object.entries(window.vcPeerConnections || {});
        var _ok = 0, _fail = 0, _nego = [];
        _peers.forEach(function(ent){
            var uid = ent[0], pc = ent[1];
            try {
                var sender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'video'; });
                if (sender) {
                    sender.replaceTrack(st).then(function(){ _ok++; })
                        .catch(function(e){ _fail++; console.warn('[screen-share] replaceTrack 실패:', uid, e); });
                } else {
                    pc.addTrack(st, ds);
                    _nego.push([uid, pc]);        // ← 재협상 없이는 상대가 못 받는다
                }
            } catch(e){ _fail++; console.warn('[screen-share] sender 교체 실패:', uid, e); }
        });
        /* 트랙을 «새로» 붙인 연결만 재협상한다. replaceTrack 은 재협상이 필요 없다(그게 장점). */
        _nego.forEach(function(ent){
            var uid = ent[0], pc = ent[1];
            (async function(){
                try {
                    var off = await pc.createOffer();
                    try { off.sdp = vcTuneAudioSdp(off.sdp); } catch(_){}
                    await pc.setLocalDescription(off);
                    vcConn.send({ type: 'offer', data: { targetUserId: uid, sdp: pc.localDescription } });
                    _ok++;
                    console.log('[screen-share] 재협상 offer 전송 →', uid);
                } catch(e){ _fail++; console.warn('[screen-share] 재협상 실패:', uid, e); }
            })();
        });
        /* 결과를 강사에게 말해 준다 — «공유 중» 이라고만 뜨고 학생은 못 보는 상태를 없앤다.
           ✅ (2026-08-12 강사 Shas 2번) 성공했을 때도 말해 준다 — "공유가 되고 있는지 몰라서
           학생에게 «내 화면 보여요?» 라고 물어봐야 했다. 확인 메시지를 띄워 달라." */
        setTimeout(function(){
            try {
                if (!window.__vcScreenSharing) return;
                if (_peers.length === 0) {
                    if (typeof showToast === 'function') showToast(en
                        ? '⚠ Nobody is in the class yet — they will see it when they join.'
                        : '⚠ 아직 수업에 아무도 없어요 — 들어오면 보이게 됩니다.');
                } else if (_ok === 0) {
                    if (typeof showToast === 'function') showToast(en
                        ? '⚠ The screen could not be sent to the student. Please stop and start sharing again.'
                        : '⚠ 학생에게 화면이 전달되지 않았어요. 공유를 멈췄다가 다시 눌러 주세요.');
                } else {
                    if (typeof showToast === 'function') showToast(en
                        ? '✅ Students can now see your shared screen (' + _ok + ')'
                        : '✅ 학생이 지금 선생님의 공유 화면을 보고 있어요 (' + _ok + '명)');
                }
            } catch(_){}
        }, 2500);
        /* 📣 (2026-08-12 Melca) 학생에게도 시작을 알린다 — 예전엔 채팅 안내가 «내 화면 전용»
           (vcAddChatSystem 은 로컬 표시만) 이라 학생은 예고 없이 얼굴 타일이 화면으로 바뀌었다. */
        try { if (vcConn) vcConn.send({ type: 'screen-share-state', data: { on: true } }); } catch(_){}
        // 내 화면 미리보기도 공유 화면으로
        try {
            var lv = document.getElementById('vc-local-video');
            if (lv) { lv.srcObject = ds; var p = lv.play(); if (p && p.catch) p.catch(function(){}); }
        } catch(_){}

        st.onended = function(){ try { window.vcStopMyScreen(); } catch(_){} };   // 브라우저 '공유 중지'
        if (typeof vcRenderScreenShareChip === 'function') vcRenderScreenShareChip();
        try { if (typeof showToast === 'function') showToast(en ? 'Sharing your screen' : '내 화면을 공유하고 있어요'); } catch(_){}
        try { vcAddChatSystem(en ? 'The teacher started sharing the screen.' : '선생님이 화면 공유를 시작했어요.'); } catch(_){}
    } catch (e) {
        window.__vcScreenSharing = false;
        if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return;   // 사용자가 취소 = 정상
        console.warn('[screen-share] 실패:', e);
        alert(en ? 'Could not start screen sharing.' : '화면 공유를 시작할 수 없었어요.');
    }
};
window.vcStopMyScreen = async function(){
    var en = (typeof getLang === 'function' && getLang() === 'en');
    try {
        window.__vcScreenSharing = false;
        window.__vcScreenTrack = null;
        /* 🔊 (2026-08-12 Melca) 시스템 소리 믹스를 마이크 단독으로 되돌린다 */
        try {
            var sa = window.__vcScreenAudio;
            if (sa) {
                var micBack = (sa.micBackup && sa.micBackup.readyState === 'live') ? sa.micBackup
                    : ((window.vcLocalStream && vcLocalStream.getAudioTracks().find(function(t){ return t.readyState === 'live'; })) || null);
                Object.values(window.vcPeerConnections || {}).forEach(function(pc){
                    try {
                        var aSender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'audio'; });
                        if (aSender && micBack) aSender.replaceTrack(micBack).catch(function(){});
                    } catch(_){}
                });
                try { if (sa.sys) sa.sys.stop(); } catch(_){}
                try { if (sa.ctx) sa.ctx.close(); } catch(_){}
                window.__vcScreenAudio = null;
            }
        } catch(_){}
        /* 📣 학생에게도 종료를 알린다 */
        try { if (vcConn) vcConn.send({ type: 'screen-share-state', data: { on: false } }); } catch(_){}
        /* 카메라로 되돌릴 트랙을 3단으로 찾는다 —
           ① 공유 시작 때 보관한 트랙 ② 지금 내 스트림의 카메라 ③ 둘 다 죽었으면 카메라를 새로 획득.
           [왜] 되돌릴 트랙을 못 찾으면 sender 가 '끝난 화면 트랙'을 계속 붙잡아
                학생 화면이 멈춘 그림에 머문다. 자가치유(vcHealLocalVideo)는 내 스트림의 카메라가
                살아 있으면 '정상'으로 보고 넘어가므로 이 경우를 못 고친다. */
        var cam = window.__vcCamTrackBackup;
        if (!cam || cam.readyState !== 'live') {
            try { cam = (window.vcLocalStream && vcLocalStream.getVideoTracks().find(function(t){ return t.readyState === 'live'; })) || null; } catch(_) { cam = null; }
        }
        if (!cam || cam.readyState !== 'live') {
            try {
                var fresh = await navigator.mediaDevices.getUserMedia({ video: true });
                cam = fresh.getVideoTracks()[0] || null;
                if (cam && window.vcLocalStream) {
                    try { vcLocalStream.getVideoTracks().forEach(function(o){ try{ o.stop(); }catch(_){} try{ vcLocalStream.removeTrack(o); }catch(_){} }); } catch(_){}
                    try { vcLocalStream.addTrack(cam); } catch(_){}
                }
            } catch(_) { /* 권한 거부 등 — 아래 자가치유가 다음 틱에 재시도 */ }
        }
        if (cam) { try { cam.enabled = (typeof vcCamOn === 'undefined') ? true : !!vcCamOn; } catch(_){} }
        Object.values(window.vcPeerConnections || {}).forEach(function(pc){
            try {
                var sender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'video'; });
                if (sender && cam && cam.readyState === 'live') sender.replaceTrack(cam).catch(function(){});
                /* 🖥 (2026-08-11) 되돌릴 카메라가 아예 없는 강사(카메라 없음·권한 거부)를 위한 마무리.
                   그냥 두면 sender 가 «끝난 화면 트랙» 을 계속 붙잡아 학생 화면에 마지막 장면이
                   얼어붙은 채로 남는다. null 로 갈아끼우면 깔끔히 비어 «카메라 꺼짐» 으로 보인다. */
                else if (sender && !cam) sender.replaceTrack(null).catch(function(){});
            } catch(_){}
        });
        try {
            var lv = document.getElementById('vc-local-video');
            if (lv && window.vcLocalStream) { lv.srcObject = vcLocalStream; var p = lv.play(); if (p && p.catch) p.catch(function(){}); }
        } catch(_){}
        if (typeof vcRenderScreenShareChip === 'function') vcRenderScreenShareChip();
        try { if (typeof showToast === 'function') showToast(en ? 'Screen sharing stopped' : '화면 공유를 멈췄어요'); } catch(_){}
        try { vcAddChatSystem(en ? 'The teacher stopped sharing the screen.' : '선생님이 화면 공유를 멈췄어요.'); } catch(_){}
        if (typeof vcHealLocalVideo === 'function') setTimeout(function(){ try{ vcHealLocalVideo(); }catch(_){} }, 800);
    } catch(e){ console.warn('[screen-share] 중지 실패:', e); }
};
/* 버튼 모양 갱신 — 공유 중이면 빨강 */
window.vcRenderScreenShareChip = function(){
    var btn = document.getElementById('vc-screenshare-btn');
    if (!btn) return;
    var isT = false;
    try {
        isT = (typeof _vcBgLockIsStaff === 'function' && _vcBgLockIsStaff())
           || (typeof vcIsTeacherRole === 'function' && vcIsTeacherRole())
           || window.vcMyRole === 'teacher' || window.vcMyRole === 'admin';
    } catch(_) { isT = (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'); }
    btn.style.display = isT ? 'inline-flex' : 'none';
    var on = !!window.__vcScreenSharing;
    var en = (typeof _vcBgLockEn === 'function') ? _vcBgLockEn() : false;
    btn.style.background = on ? '#dc2626' : '#0ea5e9';
    /* 🌐 필기 잠금 칩과 같은 이유로 data-ko/data-en 을 함께 남긴다 (언어 전환 시 applyLang 이 복원) */
    var _sKo = on ? '화면 공유 중지' : '내 화면 공유';
    var _sEn = on ? 'Stop sharing'  : 'Share my screen';
    btn.setAttribute('data-ko', _sKo); btn.setAttribute('data-en', _sEn);
    btn.textContent = en ? _sEn : _sKo;
};

/** 앱 복귀 시: 트랙 enable + 비디오 재생 + ICE/WebSocket 복구 */
async function vcOnAppResume(reason) {
    console.log('[app-resume] 복귀 감지:', reason);
    // 🔴 (2026-07-24 재점검) 가장 먼저 pong 대기상태를 비운다.
    //   화면이 꺼져 있는 동안 setInterval 이 얼어 'ping 보내고 답 기다리는 중' 으로 남아 있으면,
    //   복귀 직후 첫 틱이 살아있는 연결을 끊어버린다(=내가 만든 워치독이 스스로 사고를 냄).
    try { if (vcConn && typeof vcConn.notePongResume === 'function') vcConn.notePongResume(); } catch(_) {}
    try { await requestWakeLock(); } catch(_) {}

    // 1) 로컬 트랙 다시 enable + 상태 확인 (죽은 마이크는 자가치유)
    /* 🔒 (2026-07-28 강사 피드백) 여기서 예전에는 t.enabled = true 를 '무조건' 했다.
       그래서 강사 피드백 두 건이 동시에 생겼다:
         · Kaye 5번 "카메라를 껐는데 다른 탭 갔다 오면 다시 켜진다(버튼은 꺼진 상태)"
           → 이 함수가 visibilitychange 에서 불려 꺼둔 카메라를 되살렸다. vcCamOn 은 false 그대로라
             화면의 버튼만 꺼진 것처럼 보였다.
         · Kaye 10번 "전체 음소거를 눌러도 학생 소리가 들린다"
           → 학생이 탭을 옮겼다 돌아오면 이 줄이 학생 마이크를 되살려 음소거가 풀렸다.
       원래 의도는 '브라우저가 백그라운드에서 죽인 트랙을 되살리기' 이므로,
       사용자가 스스로 끈 상태와 강사의 전체 음소거는 그대로 존중해야 한다.
       (아래 판정은 vcResumeClassSession 의 기존 가드와 같은 방식) */
    if (vcLocalStream) {
        var _micLocked = window.__vcMicLockedByTeacher && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin';
        var _wantCam = (typeof vcCamOn === 'undefined' || vcCamOn === null) ? true : !!vcCamOn;
        var _wantMic = (typeof vcMicOn === 'undefined' || vcMicOn === null) ? true : !!vcMicOn;
        if (_micLocked) _wantMic = false;                       // 강사가 전체 음소거를 걸어 둔 상태
        vcLocalStream.getTracks().forEach(t => {
            if (t.kind === 'video') t.enabled = _wantCam;
            else if (t.kind === 'audio') t.enabled = _wantMic;
            else t.enabled = true;
            if (t.readyState === 'ended') {
                console.warn('[app-resume] 트랙 ended 상태:', t.kind, t.kind === 'audio' ? '→ 마이크 자가치유 시도' : '');
            }
        });
        try { vcHealLocalMic(); } catch(_) {}   // 🎤 백그라운드에서 죽은 마이크 즉시 복구
        try { vcHealLocalVideo(); } catch(_) {} // 📷 백그라운드에서 죽은/검은 카메라 즉시 복구
    }

    // 2) 모든 비디오 엘리먼트 play() 재호출 (모바일 브라우저가 일시정지한 경우 대응)
    vcResumeAllVideos();

    // 3) WebSocket 끊겨 있으면 자동 재연결 로직이 이미 타이머로 돌지만,
    //    수동으로도 즉시 깨워서 재연결을 앞당김
    try {
        if (vcConn && vcConn.ws && vcConn.ws.readyState !== WebSocket.OPEN && typeof vcConn.reconnectNow === 'function') {
            vcConn.reconnectNow();
        }
    } catch(_) {}

    // 4) 피어 연결 중 disconnected/failed 면 실제 재연결(PC 재생성 + offer 재전송)
    for (const userId of Object.keys(vcPeerConnections)) {
        const pc = vcPeerConnections[userId];
        const s = pc.iceConnectionState;
        if (s === 'disconnected' || s === 'failed') {
            console.log('[app-resume] 피어 재연결:', s, userId);
            try { pc.restartIce(); } catch(_) {}
            vcReconnectPeer(userId);
        }
    }

    // 5) 한 번 더 500ms 뒤에 play 재시도 (iOS Safari가 play() 거부 후 바로 다시 부르면 성공하는 경우 있음)
    setTimeout(vcResumeAllVideos, 500);
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        vcOnAppResume('visibilitychange');
    }
});
// ★ bfcache(브라우저 뒤로가기·앱 스위치 후 복귀) 전용: pageshow의 persisted=true 케이스
window.addEventListener('pageshow', (e) => {
    if (e.persisted) vcOnAppResume('pageshow-bfcache');
    else vcResumeAllVideos(); // 일반 복귀에서도 play 재시도
});
// ★ 모바일 Chrome/Safari의 tab freeze 해제 이벤트
window.addEventListener('resume', () => vcOnAppResume('resume'));
window.addEventListener('focus',  () => vcResumeAllVideos());

/* ──────────────────────────────────────────────────────────────
   📶 이동 중(운전·지하철 등) 끊김 자동 복구
   문제: LTE 기지국 전환/터널 등으로 P2P가 disconnected/failed 되면
         restartIce() 만으로는 새 offer 재협상이 안 일어나 영영 복구 안 됨
         → 화면이 검게/소리 끊김. 아래에서 "PC 재생성 + offer 재전송"으로 복구.
   glare 방지: userId 가 작은 쪽만 offer 주체, 큰 쪽은 잠시 대기 후 백업 offer.
   ────────────────────────────────────────────────────────────── */
/* ──────────────────────────────────────────────────────────────
   "재연결 중…" 배너 — 이동 중 끊김 시 사용자 안심용 표시
   show: P2P/WebSocket 끊김 감지 시  ·  hide: 연결 복구되면 자동
   ────────────────────────────────────────────────────────────── */
(function ensureReconnectBanner(){
    if (document.getElementById('vc-reconnect-banner')) return;
    var add = function(){
        if (document.getElementById('vc-reconnect-banner')) return;
        var style = document.createElement('style');
        style.textContent =
            '#vc-reconnect-banner{position:fixed;top:14px;left:50%;transform:translateX(-50%) translateY(-140%);'
          + 'z-index:2147483646;display:flex;align-items:center;gap:9px;padding:9px 16px;border-radius:999px;'
          + 'background:rgba(15,23,42,.92);color:#fde68a;border:1px solid #fbbf24;font-size:14px;font-weight:600;'
          + 'box-shadow:0 8px 28px rgba(0,0,0,.45);opacity:0;pointer-events:none;'
          + 'transition:transform .35s ease,opacity .35s ease;backdrop-filter:blur(4px);}'
          + '#vc-reconnect-banner.show{transform:translateX(-50%) translateY(0);opacity:1;}'
          + '#vc-reconnect-banner .spin{width:15px;height:15px;border:2px solid rgba(251,191,36,.35);'
          + 'border-top-color:#fbbf24;border-radius:50%;animation:vcReconnSpin .8s linear infinite;}'
          + '@keyframes vcReconnSpin{to{transform:rotate(360deg);}}';
        document.head.appendChild(style);
        var el = document.createElement('div');
        el.id = 'vc-reconnect-banner';
        el.innerHTML = '<span class="spin"></span><span>재연결 중… 잠시만요</span>';
        document.body.appendChild(el);
    };
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
function vcShowReconnecting(){
    if (!document.body.classList.contains('vc-in-call')) return;  // 수업 중에만
    var el = document.getElementById('vc-reconnect-banner');
    if (el) el.classList.add('show');
}
function vcHideReconnecting(){
    var el = document.getElementById('vc-reconnect-banner');
    if (el) el.classList.remove('show');
}
/* 전체 연결 상태를 보고 배너 표시/숨김을 결정 */
function vcEvalReconnecting(){
    if (!document.body.classList.contains('vc-in-call')) { vcHideReconnecting(); return; }
    var recovering = false;
    try {
        var ws = vcConn && vcConn.ws;
        if (ws && (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED)) recovering = true;
    } catch(_){}
    try {
        Object.keys(vcPeerConnections).forEach(function(id){
            var s = vcPeerConnections[id] && vcPeerConnections[id].iceConnectionState;
            if (s === 'failed' || s === 'disconnected') recovering = true;
        });
    } catch(_){}
    // __vcPeerGraceWait: 강사(원격 피어) 끊김 재연결 유예 중 — 평가 폴링이 배너를 소유하므로 유지
    if (recovering || window.__vcPeerGraceWait) vcShowReconnecting(); else vcHideReconnecting();
}

const __vcReconnectAt = {};   // userId → 마지막 재연결 시각(쿨다운)
/* 🔄 (2026-07-23) 상단 '영상 재연결' 버튼 — 사장님 지시.
   화면이 멈추거나 검게 나올 때 **새로고침 없이** 영상 연결만 다시 맺는다.
   새로고침하면 수업에서 나갔다 들어와야 하고(입장 권한 팝업·채팅·교재 상태가 날아감),
   무엇보다 [[vc-join-permission-race]] 처럼 재입장이 막히는 사고가 있었다. 그래서 연결만 되살린다.
   ① 내 카메라·마이크 트랙이 죽어 있으면 먼저 살리고(재협상 없이 교체)
   ② 붙어 있는 상대 전원에게 재연결(사용자가 직접 누른 것이므로 8초 쿨다운은 무시). */
/* 🔄 (2026-08-07 Kaye 4번) "재연결 버튼을 눌러도 재연결이 안 되고 화면 그대로이며 시스템도 인식 못 한다"
   [예전 동작] 이 함수는 «이미 맺어져 있는 PeerConnection» 만 다시 세웠다. 그래서
     ① 신호 회선(WebSocket)이 죽어 있으면 — 가장 흔한 경우 — 아무것도 하지 않았다.
        상대 목록 자체가 서버에서 오는데 그 통로가 끊긴 상태라 vcPeerConnections 가 비어 있고,
        빈 배열을 돌면 «성공적으로 아무 일도 안 일어난다».
     ② 진행/결과를 한 줄도 알려 주지 않아, 눌러도 «반응이 없는 버튼»으로 보였다.
   [지금] 회선부터 살리고 → 내 장치 자가치유 → 상대 재연결 순서로 가고, 매 단계를 한/영으로 알린다. */
async function vcManualReconnect() {
    if (!document.body.classList.contains('vc-in-call')) return;
    const btn = document.getElementById('vc-btn-resync');
    if (btn) { if (btn.dataset.busy === '1') return; btn.dataset.busy = '1'; btn.style.opacity = '0.5'; btn.textContent = '⏳'; }
    const _en = (typeof getLang === 'function' && getLang() === 'en');
    const say = function (msg) { try { if (typeof showToast === 'function') showToast(msg); } catch (_) {} };
    say(_en ? '🔄 Reconnecting…' : '🔄 다시 연결하는 중…');
    try {
        // ① 신호 회선(WebSocket) — 이게 죽어 있으면 아래 어떤 것도 상대에게 닿지 않는다
        let _sock = null;
        try { _sock = vcConn && vcConn.ws; } catch (_) {}
        if (!_sock || _sock.readyState !== 1) {
            console.warn('[vc-resync] 신호 회선이 끊겨 있음 → 회선부터 재연결');
            try { if (vcConn && vcConn.notePongResume) vcConn.notePongResume(); } catch (_) {}
            try { if (vcConn && vcConn.reconnectNow) vcConn.reconnectNow(); } catch (_) {}
            await new Promise(function (r) { setTimeout(r, 1500); });   // room-joined 회신 여유
        }
        // ② 내 카메라·마이크 자가치유
        try { await vcHealLocalVideo(); } catch (_) {}
        try { await vcHealLocalMic(); } catch (_) {}
        // ③ 상대와의 영상 연결 재수립
        const ids = Object.keys(vcPeerConnections || {});
        ids.forEach(function (id) { try { delete __vcReconnectAt[id]; } catch (_) {} });   // 수동 요청은 쿨다운 면제
        ids.forEach(function (id) { try { vcReconnectPeer(id); } catch (_) {} });
        console.warn('[vc-resync] 사용자가 영상 재연결 요청 — 상대', ids.length + '명');

        // ④ 결과 보고 — «했는데 어떻게 됐는지» 를 반드시 말해 준다
        setTimeout(function () {
            let live = 0, total = 0;
            try {
                Object.values(vcPeerConnections || {}).forEach(function (pc) {
                    total++;
                    try { if (pc.getReceivers().some(function (r) { return r.track && r.track.readyState === 'live'; })) live++; } catch (_) {}
                });
            } catch (_) {}
            let ok = false;
            try { ok = !!(vcConn && vcConn.ws && vcConn.ws.readyState === 1); } catch (_) {}
            if (!ok) say(_en ? '⚠ Still offline — check your internet, the class will resume by itself when it is back.'
                             : '⚠ 아직 연결이 안 됐어요 — 인터넷을 확인해 주세요. 회복되면 수업은 저절로 이어집니다.');
            else if (total === 0) say(_en ? '✅ Line restored. Waiting for the other person to join.'
                                         : '✅ 회선이 다시 연결됐어요. 상대가 들어오기를 기다리는 중입니다.');
            else if (live > 0) say(_en ? '✅ Reconnected (' + live + '/' + total + ')' : '✅ 다시 연결됐어요 (' + live + '/' + total + '명)');
            else say(_en ? '⏳ Still connecting to the other person… trying again automatically.'
                         : '⏳ 상대와 연결 중이에요… 자동으로 계속 시도합니다.');
        }, 3500);
    } catch (e) { console.warn('[vc-resync] 실패', e); }
    setTimeout(function () {
        if (btn) { btn.dataset.busy = ''; btn.style.opacity = ''; btn.textContent = '🔄'; }
    }, 2500);
}
window.vcManualReconnect = vcManualReconnect;

function vcReconnectPeer(userId) {
    if (!userId) return;
    if (!document.body.classList.contains('vc-in-call')) return;   // 수업 중일 때만
    const now = Date.now();
    if (__vcReconnectAt[userId] && now - __vcReconnectAt[userId] < 8000) return;  // 8초 쿨다운
    __vcReconnectAt[userId] = now;
    vcShowReconnecting();   // "재연결 중…" 배너 노출

    const old = vcPeerConnections[userId];
    let username = (old && old.__username) || '참가자';
    try {
        const lbl = document.querySelector('#vc-video-' + userId + ' .video-label');
        if (lbl && lbl.textContent) username = lbl.textContent;
    } catch(_) {}

    console.warn('[vc-recover] 피어 재연결 시도:', userId, username);
    try { if (old) old.close(); } catch(_) {}
    delete vcPeerConnections[userId];

    // 재연결은 TURN 자격증명을 새로 받아서 시도 (연결 실패 원인이 STUN-only/만료 자격증명일 수 있음)
    const _iceReady = vcEnsureIceServers().catch(() => {});

    // 두 단말이 동시에 offer 를 보내면 glare → ID 작은 쪽만 즉시 offer
    const iAmOfferer = (vcUserId && userId) ? (String(vcUserId) < String(userId)) : true;
    if (iAmOfferer) {
        _iceReady.then(() => {
            try { vcCreatePeerAndOffer(userId, username); } catch(e) { console.warn('[vc-recover] offer 실패:', e); }
        });
    } else {
        // 상대(작은 ID)가 offer 를 보낼 것 → 4초 대기, 그래도 복구 안 되면 내가 백업 offer
        setTimeout(() => {
            if (!vcPeerConnections[userId] && document.body.classList.contains('vc-in-call')) {
                console.warn('[vc-recover] 상대 offer 미수신 → 백업 offer:', userId);
                try { vcCreatePeerAndOffer(userId, username); } catch(_) {}
            }
        }, 4000);
    }
}

/* ──────────────────────────────────────────────────────────────
   🔌 (2026-07-14) "📷 연결 중…" 고착 자동 복구 — "상대방이 안 보여요"(휴대폰↔PC) 근본 대책.
   ───────────────────────────────────────────────────────────────
   근본원인: 이 앱은 최초 offer/answer 이후 '재협상(renegotiation)'을 하지 않는다
     (onnegotiationneeded 핸들러 없음). 그래서 한쪽이 offer 를 만드는 순간 카메라·마이크가
     아직 준비 전이거나(휴대폰 권한 대기·느린 카메라) 거부되면 → 그 SDP 에 미디어 m-line 이
     하나도 없이 협상이 'stable' 로 끝나버린다 → 상대의 ontrack 이 영영 안 불려 원격 박스가
     '연결 중…' 에서 멈춘다(라이브 진단으로 확인: sig=stable, m-line 0, receivers 0).
   해결: 원격 박스가 N초 넘게 '연결 중'(=수신 트랙 0)이면 vcReconnectPeer 로 PC 를 '지금의'
     트랙으로 다시 세운다. 양쪽 다 이 코드를 실행하므로, 상대 미디어가 빠진 쪽이 재연결을
     걸면 재빌드 시점엔 카메라가 준비돼 미디어가 흐른다 → 양방향 자동 치유.
   안전장치: 피어별 최대 2회 + vcReconnectPeer 자체 8초 쿨다운 → 재연결 폭주 방지.
     실제 수신 트랙이 하나라도 살아있으면(정상 통화) 절대 개입하지 않음. */
(function vcStuckPeerWatch(){
  if (window.__vcStuckWatch) return; window.__vcStuckWatch = true;
  var firstSeen = {};   // userId → '고착' 최초 관측 시각
  var tries = {};       // userId → 복구 시도 횟수
  var STUCK_MS = 9000;  // 이 시간 넘게 '연결 중'이면 고착으로 판단(초기 협상 여유 확보)
  var MAX_TRIES = 4;    // (2026-07-24) 2→4. 상대가 뒤늦게 권한을 허용하는 경우가 실제로 있어
                        //   2회로는 그 전에 소진돼 영영 안 붙었다. 피어당 8초 쿨다운이 있어 안전.
  setInterval(function(){
    try {
      if (!document.body || !document.body.classList.contains('vc-in-call')) { firstSeen = {}; tries = {}; return; }
      var grid = document.getElementById('vc-video-grid'); if (!grid) return;
      var now = Date.now();
      var seen = {};
      grid.querySelectorAll('.video-box').forEach(function(box){
        var bid = box.id || '';
        if (bid.indexOf('vc-video-') !== 0) return;            // 내 박스(vc-local-box) 등 제외
        var id = bid.slice('vc-video-'.length);
        if (!id || id === 'pane' || (typeof vcUserId !== 'undefined' && id === vcUserId)) return;
        if (!box.querySelector('.vc-connecting-hint')) { delete firstSeen[id]; return; }  // 힌트 없음 = 정상
        // 실제 수신 트랙이 하나라도 살아 있으면 '고착' 아님(힌트 잔재는 무시, 통화 방해 금지)
        var pc = vcPeerConnections[id], gotTrack = false;
        try { gotTrack = !!(pc && pc.getReceivers().some(function(r){ return r.track && r.track.readyState === 'live'; })); } catch(_){}
        if (gotTrack) { delete firstSeen[id]; return; }
        seen[id] = true;
        if (!firstSeen[id]) { firstSeen[id] = now; return; }   // 이번에 처음 관측 — 다음 틱부터 시간 카운트
        if (now - firstSeen[id] < STUCK_MS) return;
        if ((tries[id] || 0) >= MAX_TRIES) return;
        tries[id] = (tries[id] || 0) + 1;
        var name = (box.querySelector('.video-label') || {}).textContent || '참가자';
        /* 📶 (2026-08-22) 두 번째 시도부터는 TURN 릴레이를 강제한다.
           [빠져 있던 것] 이 워치독은 4번을 재시도하면서 **4번 다 «직접 연결» 로만** 걸었다.
             직접 경로가 원천적으로 막힌 회선(사무실 대칭NAT·기업 방화벽)에서는 네 번이 전부
             같은 이유로 실패하고, **릴레이는 한 번도 안 써 보고 포기**한다.
             릴레이를 켜 주는 길이 두 개 있었지만 둘 다 여기까지 안 온다 —
             ① ICE 가 'failed' 로 떨어질 때(그 판정까지 수십 초, 그 전에 이 워치독이 소진된다)
             ② 참관자 전용 워치독(vcObserverRetryStalled) — 학생·강사에겐 안 돈다.
           [왜 1회는 직접으로 두나] MAX_TRIES 를 2→4 로 올린 이유가 «상대가 뒤늦게 권한을
             허용하는 경우» 라, 첫 실패는 경로 문제가 아니라 미디어 문제일 때가 많다.
             첫 판은 그대로 두고, 그래도 안 되면 경로를 의심한다.
           [비용] 릴레이 중계는 돈이 든다. 그래서 «전부 릴레이» 가 아니라 **이미 두 번 실패한
             연결만** 릴레이로 보낸다 — 집에서 잘 붙는 강사는 예전과 완전히 같다.
           ⛔ 여기서 __vcRelayAlways(전역)를 켜지 마세요 — 그건 서버가 세션별로 정하는 값이고,
              전역으로 켜면 그 뒤 «직접 시도» 가 아예 없어져 스스로 회복할 길이 사라집니다.
              피어별 __vcForceRelay 는 붙는 순간 지워집니다(vcCreatePeer 의 ICE connected). */
        /* ⚠️ `__vcIceHasTurn` 은 이 파일 최상단의 `let` 이다 — **window 에 속성이 생기지 않는다.**
           `window.__vcIceHasTurn` 으로 읽으면 언제나 undefined 라 조건이 무의미해진다
           (2026-08-21 회선품질 로그가 `window.vcRoomId` 로 같은 함정을 밟았다). 이름으로 직접 읽는다. */
        if (tries[id] >= 2 && __vcIceHasTurn) {
          try { (window.__vcForceRelay = window.__vcForceRelay || {})[id] = true; } catch (_) {}
        }
        console.warn('[vc-stuck] 상대 영상 미도착 ' + Math.round((now - firstSeen[id]) / 1000) + '초 → 복구 시도 ' + tries[id] + (tries[id] >= 2 ? ' (릴레이 강제)' : '') + ':', id, name);
        firstSeen[id] = now + 5000;   // 재협상에 시간을 주기 위해 다음 판정을 뒤로 미룸
        try {
          if (pc) vcReconnectPeer(id);                 // PC 있음 → 지금 트랙으로 재빌드+재offer
          else vcCreatePeerAndOffer(id, name);         // PC 아예 없음(시그널 유실) → 새로 offer
        } catch(e){ console.warn('[vc-stuck] 복구 호출 실패:', e); }
      });
      Object.keys(firstSeen).forEach(function(id){ if (!seen[id]) delete firstSeen[id]; });  // 사라진 박스 정리
    } catch(_){}
  }, 3000);
})();

/* ──────────────────────────────────────────────────────────────
   📷 (2026-07-14) 원격 '검은 영상' 감지 — "상대가 연결됐는데 검게만 보여요" 대책 (수신측).
   ───────────────────────────────────────────────────────────────
   #19 고착 워치독은 '수신 트랙 유무'만 봐서, 트랙이 live 라도 muted(프레임 0)로 도착하는
   '검은 영상'은 정상으로 오인해 방치했다(vcAddRemoteVideo 가 '연결 중' 힌트도 지워버림).
   여기서 연결(ICE connected)됐는데 상대 영상 프레임이 없으면(videoWidth 0 또는 트랙 muted):
     (1) 타일에 '상대 영상 준비 중 — 카메라 확인' 안내를 띄워 검은 화면의 이유를 알리고,
     (2) 최대 3회 재협상(vcReconnectPeer)으로 상대가 트랙을 다시 세우도록 유도한다.
   상대가 애초에 영상 트랙을 안 보냄(오디오전용/관찰자)이면 개입 금지. 프레임이 도착하면
   (videoWidth>0) 안내를 즉시 제거. 무한 재협상 방지 = 피어당 3회 상한 후엔 안내만 유지. */
/* 📷 (2026-07-24) 상대 타일에 '카메라 꺼짐' 안내를 붙이거나 뗀다.
   ⚠️ 이 안내가 필요한 이유: attachStreamMonitor 의 .cam-off 덮개는 **내 타일 전용**이라
      상대가 카메라를 꺼도 수신측에는 아무 설명 없이 검은 화면만 남는다(=고장으로 인식).
   상태 근거는 상대가 보내 준 cam-state 신호(window.vcRemoteCamOff)뿐 — 추측하지 않는다. */
function vcApplyRemoteCamHint(userId) {
    try {
        var box = document.getElementById('vc-video-' + userId);
        if (!box) return;
        var why = (window.vcRemoteCamOff || {})[userId];
        var el = box.querySelector('.vc-camoff-hint');
        if (!why) { if (el) el.remove(); return; }
        if (!el) {
            el = document.createElement('div');
            el.className = 'vc-camoff-hint';
            el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;'
                + 'background:rgba(15,23,42,.82);color:#cbd5e1;font-size:13px;font-weight:700;text-align:center;line-height:1.35;padding:8px;z-index:4;pointer-events:none;';
            if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
            box.appendChild(el);
        }
        var en = miIsEn();
        el.innerHTML = (why === 'aao')
            ? '📶<span>' + (en ? 'Weak connection — audio only for now.<br>The class continues.'
                               : '연결이 약해 지금은 <b>음성만</b> 전송 중이에요.<br>수업은 계속됩니다.') + '</span>'
            : '📷<span>' + (en ? 'Camera is off' : '상대가 카메라를 껐어요') + '</span>';
        // 예전 '영상 준비 중' 안내가 남아 있으면 중복이므로 제거
        var old = box.querySelector('.vc-black-hint'); if (old) old.remove();
    } catch (_) {}
}
window.vcApplyRemoteCamHint = vcApplyRemoteCamHint;

(function vcRemoteBlackWatch(){
  if (window.__vcBlackWatch) return; window.__vcBlackWatch = true;
  var blackSince = {}, tries = {};
  var GRACE_MS = 7000, MAX_TRIES = 5;   // (2026-07-24) 3→5 — 늦은 권한 허용 회복 여유
  setInterval(function(){
    try {
      if (!document.body || !document.body.classList.contains('vc-in-call')) { blackSince = {}; tries = {}; return; }
      var grid = document.getElementById('vc-video-grid'); if (!grid) return;
      var now = Date.now(), seen = {};
      grid.querySelectorAll(':scope > .video-box').forEach(function(box){
        var id = (box.id || '').replace('vc-video-', '');
        if (!id || box.id === 'vc-local-box' || (typeof vcUserId !== 'undefined' && id === vcUserId)) return;
        var pc = vcPeerConnections[id];
        var connected = pc && (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed' || pc.connectionState === 'connected');
        var hint = box.querySelector('.vc-black-hint');
        if (!connected) { delete blackSince[id]; if (hint) hint.remove(); return; }   // 아직 연결 전 = #19 워치독 담당
        var rv = pc.getReceivers().find(function(r){ return r.track && r.track.kind === 'video'; });
        if (!rv || !rv.track) { delete blackSince[id]; if (hint) hint.remove(); return; }  // 상대가 영상 안 보냄 = 개입 금지
        var v = box.querySelector('video');
        var hasFrames = v && v.videoWidth > 0 && !rv.track.muted;
        if (hasFrames) { delete blackSince[id]; tries[id] = 0; if (hint) hint.remove(); return; }  // 정상 도착
        /* 🎥 (2026-07-24, 재점검으로 판정 방식 교체) '상대가 카메라를 일부러 끈 것' 을 장애로 오인하지 않는다.
           예전엔 6초마다 vcReconnectPeer()(=PC 통째로 close 후 재협상)를 5번까지 돌려, 카메라를 끈
           동안 양쪽 화면이 계속 검게 됐다 돌아오고 "재연결 중" 배너가 깜빡였다.
           🔴 처음엔 "소리는 오는데 영상만 muted 면 상대가 끈 것" 이라는 휴리스틱을 썼는데 틀렸다:
              ① 회선이 나빠 '비디오만 굶어 죽은' 진짜 장애도 수신측에서는 똑같이 보인다
                 → 그 경우 자가복구가 통째로 막혀 수업 끝까지 검은 화면으로 방치됐다.
              ② 마이크가 없는 참가자(권한 거부·관찰자)는 audioAlive 가 false 라 정작 가드가 안 걸렸다.
           → 추측을 버리고 상대가 보내 준 cam-state 신호로 확정 판정한다. 신호가 없으면
              예전 동작(자가복구 시도)을 그대로 유지한다 — 안전한 쪽으로 기운다. */
        var camOff = (window.vcRemoteCamOff || {})[id];
        if (camOff) {
          delete blackSince[id]; tries[id] = 0;
          // 재협상은 금지하되 '왜 검은지' 는 반드시 알려 준다(안내까지 지우면 사용자는 고장으로 인식).
          vcApplyRemoteCamHint(id);
          return;
        }
        seen[id] = true;
        if (!blackSince[id]) { blackSince[id] = now; return; }        // 이번에 처음 관측 — 다음 틱부터 카운트
        if (now - blackSince[id] < GRACE_MS) return;                  // 초기 협상 유예
        if (!hint) {
          hint = document.createElement('div');
          hint.className = 'vc-black-hint';
          hint.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:rgba(15,23,42,.82);color:#fde68a;font-size:13px;font-weight:700;text-align:center;line-height:1.35;padding:8px;z-index:4;pointer-events:none;';
          hint.innerHTML = '📷<span>상대 영상 준비 중…<br>(상대방 카메라를 확인해 주세요)</span>';
          if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
          box.appendChild(hint);
        }
        if ((tries[id] || 0) < MAX_TRIES && typeof vcReconnectPeer === 'function') {
          tries[id] = (tries[id] || 0) + 1;
          blackSince[id] = now + 6000;                               // 재협상에 시간 주기 위해 다음 판정 미룸
          console.warn('[vc-black] 원격 검은 영상 ' + id + ' → 복구 시도 ' + tries[id] + '/' + MAX_TRIES);
          try { vcReconnectPeer(id); } catch(e){}
        }
      });
      Object.keys(blackSince).forEach(function(id){ if (!seen[id]) { delete blackSince[id]; delete tries[id]; } });
    } catch(_){}
  }, 3000);
})();

/* ──────────────────────────────────────────────────────────────
   🔊 소리 보장 시스템 (2026-07-13) — "소리가 안 들려요" 근본 대책
   구성: ① vcEnsureRemoteAudio  : 모든 원격 소리 살리기(볼륨1·unmute·play 재시도)
        ② vcSpawnAuxAudio      : <video> 소리가 정책에 막히면 숨은 <audio>로 우회
        ③ vcAudioWatchdog      : 3초마다 실제 오디오 수신량(getStats)을 재서
                                 "소리는 오는데 재생이 막힘"을 감지 → 우회+버튼
        ④ 수업 중 아무 터치/키 → 즉시 소리 살리기 (자동재생 정책의 정석 해법)
   ────────────────────────────────────────────────────────────── */
/* 🔊 출력 음량 — 사연·정본은 js/idx-vc-outputvolume.js(defer) 머리말. 기본(1)이면 예전과 같다. */
function vcOutVol() { try { const v = parseFloat(localStorage.getItem('mangoi_vc_out_vol')); return (v >= 0 && v <= 1) ? v : 1; } catch (_) { return 1; } }
function vcEnsureRemoteAudio() {
    if (window.vcOutBoost) return;   // 🔊 증폭 중 — 소리는 WebAudio 가 낸다
    Object.keys(vcPeerConnections).forEach(id => {
        const v = document.querySelector('#vc-video-' + id + ' video');
        if (!v) return;
        const aux = document.getElementById('vc-aud-' + id);
        try {
            v.volume = vcOutVol();
            if (aux) {
                // 보조 오디오 경로 가동 중 — 소리는 aux 전담, 비디오는 계속 음소거(이중재생 방지)
                v.muted = true;
                aux.volume = vcOutVol(); aux.muted = false;
                if (aux.paused) { const ap = aux.play(); if (ap && ap.catch) ap.catch(()=>{}); }
                if (v.paused) { const vp = v.play(); if (vp && vp.catch) vp.catch(()=>{}); }
                return;
            }
            v.muted = false;
            if (v.paused) { const p = v.play(); if (p && p.catch) p.catch(()=>{}); }
        } catch(_) {}
    });
}
/* 예전 이름 호환 — 기존 호출부(제스처 언뮤트 등)는 그대로 동작 */
function vcUnmuteRemotes() { vcEnsureRemoteAudio(); }

/* <video>의 소리가 브라우저 정책/WebView 버그로 막혔을 때: 오디오 트랙만 뽑아
   숨은 <audio> 엘리먼트로 재생(우회). 비디오는 영구 음소거로 바꿔 이중재생 방지. */
function vcSpawnAuxAudio(id) {
    try {
        if (document.getElementById('vc-aud-' + id)) return;
        const v = document.querySelector('#vc-video-' + id + ' video');
        const stream = v && v.srcObject;
        if (!stream || !stream.getAudioTracks) return;
        const at = stream.getAudioTracks();
        if (!at.length) return;
        const a = document.createElement('audio');
        a.id = 'vc-aud-' + id;
        a.autoplay = true;
        a.setAttribute('playsinline', '');
        a.srcObject = new MediaStream(at);
        a.style.display = 'none';
        try { vcApplySavedSink(a); } catch(e){}   // 🔊 보조 오디오도 고른 스피커로
        document.body.appendChild(a);
        v.muted = true;   // 소리는 aux 전담
        const p = a.play(); if (p && p.catch) p.catch(()=>{});
        console.warn('[vc-audio] 🔀 보조 오디오 경로 가동:', id);
    } catch(e) { console.warn('[vc-audio] aux 실패:', e); }
}

/* 큰 "🔊 소리 켜기" 버튼 — 터치가 필요할 때만 표시. 누르면 모든 원격 소리 살림 */
function vcToggleSoundBanner(show) {
    let b = document.getElementById('vc-sound-banner');
    if (!show) { if (b) b.remove(); return; }
    if (b) return;
    if (!document.getElementById('vc-sound-banner-style')) {
        const st = document.createElement('style');
        st.id = 'vc-sound-banner-style';
        st.textContent = '@keyframes vcSndPulse{0%,100%{transform:translateX(-50%) scale(1);}50%{transform:translateX(-50%) scale(1.07);}}';
        document.head.appendChild(st);
    }
    b = document.createElement('button');
    b.id = 'vc-sound-banner';
    b.textContent = '🔊 소리 켜기';
    b.style.cssText = 'position:fixed;bottom:96px;left:50%;transform:translateX(-50%);z-index:2147483646;'
        + 'padding:13px 26px;font-size:18px;font-weight:800;background:#f59e0b;color:#1f2937;border:none;'
        + 'border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.5);cursor:pointer;animation:vcSndPulse 1.2s ease-in-out infinite;';
    b.onclick = function() { vcEnsureRemoteAudio(); b.remove(); };
    document.body.appendChild(b);
}

/* 오디오 감시견 — 3초마다:
   · 원격 오디오 수신 바이트가 늘고 있는데 출력이 막혀 있으면(음소거/정지) 2틱 연속 시 우회+버튼
   · 상대 스트림에 오디오 트랙이 아예 없으면 "상대 마이크 꺼짐" 안내 라벨
   · 매 틱 소리 자동 살리기(vcEnsureRemoteAudio) — 터치 없이 되는 환경이면 이것만으로 복구 */
(function vcAudioWatchdog() {
    if (window.__vcAudioWatch) return; window.__vcAudioWatch = true;
    ['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
        document.addEventListener(ev, function() {
            if (!document.body.classList.contains('vc-in-call')) return;
            try { vcEnsureRemoteAudio(); } catch(_) {}
            try { vcToggleSoundBanner(false); } catch(_) {}
        }, { passive: true }));
    setInterval(async function() {
        if (!document.body.classList.contains('vc-in-call')) { vcToggleSoundBanner(false); return; }
        let needTap = false;
        for (const id of Object.keys(vcPeerConnections)) {
            const pc = vcPeerConnections[id];
            const box = document.getElementById('vc-video-' + id);
            const v = box && box.querySelector('video');
            if (!pc || !v) continue;
            let bytes = 0, hasAudioTrack = false;
            try {
                const stream = v.srcObject;
                hasAudioTrack = !!(stream && stream.getAudioTracks && stream.getAudioTracks().length);
                const stats = await pc.getStats();
                stats.forEach(r => {
                    if (r.type === 'inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio')) {
                        bytes = Math.max(bytes, r.bytesReceived || 0);
                    }
                });
            } catch(_) {}
            const prev = pc.__audPrev || { bytes: 0, blocked: 0, noTrack: 0 };
            const flowing = bytes > prev.bytes;
            // ── 상대 마이크 자체가 없음/꺼짐 → 우리 쪽에선 못 고침, 안내만
            //   false-alarm guard(2026-08-20): js/idx-vc-dupghost.js
            let hint = box.querySelector('.vc-noaudio-hint');
            if (!hasAudioTrack || (!flowing && bytes === 0)) {
                prev.noTrack = (prev.noTrack || 0) + 1;
                if (prev.noTrack >= 3 && !hint) {
                    hint = document.createElement('div');
                    hint.className = 'vc-noaudio-hint';
                    hint.textContent = '🎤 상대 소리가 안 와요 (상대방 마이크 확인)';
                    hint.style.cssText = 'position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:9;'
                        + 'background:rgba(220,38,38,.88);color:#fff;font-size:12px;font-weight:700;'
                        + 'padding:4px 10px;border-radius:999px;white-space:nowrap;pointer-events:none;';
                    box.style.position = 'relative';
                    box.appendChild(hint);
                }
            } else {
                prev.noTrack = 0;
                if (hint) hint.remove();
            }
            // ── 소리는 오는데 출력이 막힘 → 우회 + 버튼
            const aux = document.getElementById('vc-aud-' + id);
            //   🔊 증폭 중 음소거는 «막힘» 이 아니다(WebAudio 가 소리를 낸다)
            const outputBlocked = window.vcOutBoost ? false : (aux ? (aux.muted || aux.paused) : (v.muted || v.paused));
            if (flowing && outputBlocked) {
                prev.blocked = (prev.blocked || 0) + 1;
                if (prev.blocked >= 2) {
                    if (!aux) vcSpawnAuxAudio(id);
                    needTap = true;
                    console.warn('[vc-audio] 소리 수신 중인데 재생 막힘:', id, 'aux:', !!aux);
                }
            } else {
                prev.blocked = 0;
            }
            prev.bytes = bytes;
            pc.__audPrev = prev;
            // 매 틱 자동 복구 시도 (🔊 증폭 중엔 건너뛴다 — 위 주석)
            try {
                if (!window.vcOutBoost) {
                    v.volume = vcOutVol();
                    if (aux) { aux.volume = vcOutVol(); if (aux.paused) aux.play().catch(()=>{}); }
                    else if (v.muted || v.paused) { v.muted = false; if (v.paused) v.play().catch(()=>{}); }
                }
            } catch(_) {}
        }
        vcToggleSoundBanner(needTap);
    }, 3000);
})();

/* 📺 영상 정지(프리즈) 감시견 (2026-07-13) — "화면이 꺼졌다/멈췄다" 대책.
   4초마다 각 피어의 framesDecoded(실제로 그려진 프레임 수)를 비교:
   · 데이터는 오는데(트랙 live·not muted) 2틱(8초) 프레임이 안 늘면 → 소프트 복구(스트림 재부착+play)
   · 그래도 2틱 더 멈춰 있으면 → 진짜 재연결(vcReconnectPeer, 내부 8초 쿨다운)
   상대가 데이터 송신을 멈춘 경우(track.muted)는 연결 문제 → ICE 감시가 처리하므로 여기선 손대지 않음
   (오디오만 살아있는 수업을 재연결로 끊어먹지 않기 위한 가드) */
(function vcVideoFreezeWatch() {
    if (window.__vcVidWatch) return; window.__vcVidWatch = true;
    setInterval(async function() {
        if (!document.body.classList.contains('vc-in-call')) return;
        for (const id of Object.keys(vcPeerConnections)) {
            const pc = vcPeerConnections[id];
            const box = document.getElementById('vc-video-' + id);
            const v = box && box.querySelector('video');
            if (!pc || !v || !v.srcObject) continue;
            const st = pc.iceConnectionState;
            if (st !== 'connected' && st !== 'completed') { pc.__vfz = null; continue; }
            const vt = (v.srcObject.getVideoTracks ? v.srcObject.getVideoTracks() : [])[0];
            const receiving = vt && vt.readyState === 'live' && !vt.muted;
            if (!receiving) { pc.__vfz = null; continue; }
            let frames = -1;
            try {
                const stats = await pc.getStats();
                stats.forEach(r => {
                    if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) {
                        frames = Math.max(frames, r.framesDecoded || 0);
                    }
                });
            } catch (_) {}
            if (frames < 0) continue;
            const z = pc.__vfz || { frames: -1, stall: 0, soft: false };
            if (frames > z.frames) {
                z.stall = 0; z.soft = false;
            } else {
                z.stall++;
                if (z.stall === 2 && !z.soft) {
                    console.warn('[vc-freeze] 영상 8초 멈춤 → 소프트 복구:', id);
                    try { const s = v.srcObject; v.srcObject = null; v.srcObject = s; const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (_) {}
                    z.soft = true;
                } else if (z.stall >= 4) {
                    console.warn('[vc-freeze] 영상 계속 멈춤 → 피어 재연결:', id);
                    z.stall = 0; z.soft = false;
                    try { vcReconnectPeer(id); } catch (_) {}
                }
            }
            z.frames = frames;
            pc.__vfz = z;
        }
    }, 4000);
})();
let __vcGestureArmed = false;
function vcArmGestureUnmute() {
    if (__vcGestureArmed) return; __vcGestureArmed = true;
    const h = () => {
        __vcGestureArmed = false;
        vcUnmuteRemotes();
        ['touchstart','pointerdown','click','keydown'].forEach(e => document.removeEventListener(e, h));
    };
    ['touchstart','pointerdown','click','keydown'].forEach(e => document.addEventListener(e, h, { passive: true }));
}

/* 주기적 감시: 끊긴 피어 재연결 + 일시정지된 영상 재생 + 화면 꺼짐 방지 보유 확인 (수업 중에만) */
setInterval(() => {
    if (!document.body.classList.contains('vc-in-call')) return;
    // 🔒 화면 꺼짐 방지 — 수업 중인데 WakeLock이 풀려 있으면 다시 잡는다 (화면 보일 때만 가능)
    if (!wakeLock && document.visibilityState === 'visible') { try { requestWakeLock(); } catch(_) {} }
    Object.keys(vcPeerConnections).forEach(id => {
        const pc = vcPeerConnections[id]; if (!pc) return;
        const s = pc.iceConnectionState;
        if (s === 'failed') { vcReconnectPeer(id); pc.__discSince = 0; }
        else if (s === 'disconnected') {
            pc.__discSince = pc.__discSince || Date.now();
            if (Date.now() - pc.__discSince > 6000) { vcReconnectPeer(id); pc.__discSince = 0; }
        } else { pc.__discSince = 0; }
    });
    try { vcResumeAllVideos(); } catch(_) {}
    try { vcHealLocalMic(); } catch(_) {}       // 🎤 죽은 마이크 자동 복구 (상대에게 내 소리 보장)
    try { vcHealLocalVideo(); } catch(_) {}     // 📷 죽은/검은 카메라 자동 복구 (상대에게 내 얼굴 보장)
    // 🖼 (2026-07-14) 레이아웃/모드 전환 뒤 남은 숨김 잔존 복구 — 솔로 모드가 아닌데
    //   원격 박스에 inline display:none 이 남아 "화면이 나왔다 안 나왔다" 하던 것 자가치유.
    try {
        if (!window.vcSoloMode) {
            document.querySelectorAll('#vc-video-grid > .video-box').forEach(b => {
                if (b.id && b.id !== 'vc-local-box' && b.style.display === 'none') b.style.display = '';
            });
        }
    } catch(_) {}
    try { vcEvalReconnecting(); } catch(_) {}   // 배너 상태 갱신(복구되면 자동 숨김)
}, 5000);

/* 네트워크 복귀(online) — 이동 중 끊겼다 돌아올 때 즉시 복구 */
window.addEventListener('online', () => {
    console.warn('[vc-recover] 네트워크 복귀(online)');
    if (!document.body.classList.contains('vc-in-call')) return;
    try { if (vcConn && vcConn.ws && vcConn.ws.readyState !== WebSocket.OPEN && typeof vcConn.reconnectNow === 'function') vcConn.reconnectNow(); } catch(_) {}
    Object.keys(vcPeerConnections).forEach(id => {
        const st = vcPeerConnections[id] && vcPeerConnections[id].iceConnectionState;
        if (st !== 'connected' && st !== 'completed') vcReconnectPeer(id);
    });
    try { vcResumeAllVideos(); } catch(_) {}
});
window.addEventListener('offline', () => { console.warn('[vc-recover] 네트워크 끊김(offline) — 복귀 대기'); try { vcShowReconnecting(); } catch(_) {} });

/** WebSocket 재연결 시 기존 PeerConnection 모두 정리 (전역 함수 — createWebSocket에서 호출) */
function vcCleanupAllPeers() {
    console.log('[vc] vcCleanupAllPeers: 기존 PC', Object.keys(vcPeerConnections).length, '개 정리');
    Object.keys(vcPeerConnections).forEach(id => {
        try { vcPeerConnections[id].close(); } catch(_) {}
        const el = document.getElementById(`vc-video-${id}`);
        if (el) el.remove();
    });
    vcPeerConnections = {};
    vcRemoteStreams = {};
    // 🇵🇭 (2026-07-24) 순단으로 남겨 둔 '재연결 중' 유령 타일도 함께 정리
    //   (유령은 id 가 vcghost-* 로 바뀌어 있어 위의 vc-video-* 루프에 안 걸린다)
    try { vcSweepGhostTiles(); } catch(_) {}
}
let vcMicOn = true;
let vcCamOn = true;
// 하단 독(vc-dock.js)은 window 값을 본다 — 선언과 동시에 한 벌 더 맞춰 둔다 (2026-07-24)
window.vcMicOn = true;
window.vcCamOn = true;
let vcIsObserver = false;       // 관찰자 모드 (수신 전용)

/** 🔒 자동저장 / 🔁 자동로그인 — localStorage 키 */
const VC_AUTH_KEYS = {
  saveId:    'mangoi_vc_save_id',
  autoLogin: 'mangoi_vc_auto_login',
  uid:       'mangoi_vc_uid',
  pw:        'mangoi_vc_pw',
};

/** 체크박스 상태 변경 핸들러 */
window.vcOnSaveIdChange = function() {
  const ck = document.getElementById('vc-save-id');
  const al = document.getElementById('vc-auto-login');
  try {
    if (ck && ck.checked) {
      localStorage.setItem(VC_AUTH_KEYS.saveId, '1');
    } else {
      localStorage.removeItem(VC_AUTH_KEYS.saveId);
      localStorage.removeItem(VC_AUTH_KEYS.uid);
      localStorage.removeItem('mangoi_vc_roomcode');
      // 자동로그인은 자동저장이 꺼지면 같이 꺼짐
      localStorage.removeItem(VC_AUTH_KEYS.autoLogin);
      localStorage.removeItem(VC_AUTH_KEYS.pw);
      if (al) al.checked = false;
    }
  } catch {}
};

window.vcOnAutoLoginChange = function() {
  const al = document.getElementById('vc-auto-login');
  const sv = document.getElementById('vc-save-id');
  try {
    if (al && al.checked) {
      localStorage.setItem(VC_AUTH_KEYS.autoLogin, '1');
      // 자동로그인 켜면 아이디 저장도 자동으로 켜짐
      if (sv && !sv.checked) { sv.checked = true; vcOnSaveIdChange(); }
    } else {
      localStorage.removeItem(VC_AUTH_KEYS.autoLogin);
      localStorage.removeItem(VC_AUTH_KEYS.pw);
    }
  } catch {}
};

/** 🔊 로비 환영 음성 — 작은 볼륨으로 자동 재생 + 음소거 토글 + 상태 기억 */
const LOBBY_AUDIO_VOL = 0.35;                            // 작은 볼륨 (0.0 ~ 1.0)
const LOBBY_AUDIO_KEY = 'mangoi_lobby_audio_muted';      // localStorage 키
function lobbyAudioApplyState() {
    const audio = document.getElementById('lobby-welcome-audio');
    const icon  = document.getElementById('lobby-audio-icon');
    const label = document.getElementById('lobby-audio-label');
    const btn   = document.getElementById('lobby-audio-toggle');
    if (!audio) return;
    let muted = false;
    try { muted = localStorage.getItem(LOBBY_AUDIO_KEY) === '1'; } catch(e) {}
    audio.volume = LOBBY_AUDIO_VOL;
    audio.muted  = muted;
    if (icon)  icon.textContent  = muted ? '🔇' : '🔊';
    if (label) {
        const isEn = miIsEn();
        label.textContent = muted ? (isEn ? 'Audio OFF' : '음성 OFF') : (isEn ? 'Audio ON' : '음성 ON');
        label.setAttribute('data-ko', muted ? '음성 OFF' : '음성 ON');
        label.setAttribute('data-en', muted ? 'Audio OFF' : 'Audio ON');
    }
    if (btn) btn.style.background = muted ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.18)';
}
/* fix (2026-07-13) — "수업 중인데 환영 멘트가 자꾸 들림" 수정.
   ① 수업 중(body.vc-in-call)에는 어떤 경로로도 재생하지 않음.
   ② 자동재생 차단 폴백(다음 클릭에서 재생)이 수업 입장 '후' 첫 클릭에서
      30초 멘트를 틀던 문제 — 발화 시점에 로비 화면인지 재검사 + 로비를 떠나면 리스너 해제. */
function lobbyWelcomeAllowed() {
    try {
        if (document.body.classList.contains('vc-in-call')) return false;   // 수업 중 금지
        const lobby = document.getElementById('view-videocall-lobby');
        if (!lobby) return false;
        // 로비 화면이 실제로 보일 때만 (다른 뷰로 이동했으면 금지)
        return lobby.classList.contains('active') || (lobby.offsetParent !== null && lobby.style.display !== 'none');
    } catch(e) { return false; }
}
window._lobbyWelcomePendingUnlock = null;   // 자동재생 차단 폴백 리스너 (해제용)
function lobbyClearPendingUnlock() {
    const fn = window._lobbyWelcomePendingUnlock;
    if (!fn) return;
    window._lobbyWelcomePendingUnlock = null;
    try { document.removeEventListener('click', fn, true); } catch(e){}
    try { document.removeEventListener('touchstart', fn, true); } catch(e){}
}
function lobbyPlayWelcome() {
    const audio = document.getElementById('lobby-welcome-audio');
    if (!audio) return;
    lobbyAudioApplyState();
    if (audio.muted) return;                              // 음소거면 재생 자체를 안 함
    if (!lobbyWelcomeAllowed()) return;                   // 수업 중/로비 아님 → 재생 안 함
    try {
        audio.currentTime = 0;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
            // 브라우저 자동재생 정책 차단 시 — 사용자 첫 클릭 시 한 번 재생 (로비에 있을 때만)
            p.catch(() => {
                lobbyClearPendingUnlock();
                const onceClick = () => {
                    lobbyClearPendingUnlock();
                    if (!lobbyWelcomeAllowed()) return;   // 수업에 들어갔으면 재생하지 않음
                    try { audio.play().catch(()=>{}); } catch(e){}
                };
                window._lobbyWelcomePendingUnlock = onceClick;
                document.addEventListener('click', onceClick, true);
                document.addEventListener('touchstart', onceClick, true);
            });
        }
    } catch (e) { /* 무시 */ }
}
function lobbyStopWelcome() {
    lobbyClearPendingUnlock();                            // 대기 중이던 '클릭 시 재생' 예약도 취소
    const audio = document.getElementById('lobby-welcome-audio');
    if (!audio) return;
    try { audio.pause(); audio.currentTime = 0; } catch(e){}
}
function lobbyToggleAudio() {
    const audio = document.getElementById('lobby-welcome-audio');
    if (!audio) return;
    let muted = false;
    try { muted = localStorage.getItem(LOBBY_AUDIO_KEY) === '1'; } catch(e){}
    muted = !muted;
    try { localStorage.setItem(LOBBY_AUDIO_KEY, muted ? '1' : '0'); } catch(e){}
    audio.muted = muted;
    if (muted) {
        lobbyStopWelcome();
    } else {
        // 토글로 다시 켰을 때 즉시 재생
        lobbyPlayWelcome();
    }
    lobbyAudioApplyState();
}

/** 🌌 로비 우주 배경 — 별 + 별똥별 생성 (홈 화면 스타일 동일) */
function lobbyInitStarfield() {
    const sf = document.getElementById('lobby-starfield');
    if (!sf || sf.dataset.inited === '1') return;
    sf.dataset.inited = '1';
    // 반짝이는 별 70개
    for (let i = 0; i < 70; i++) {
        const s = document.createElement('div');
        s.className = 'star';
        const size = Math.random() * 2.4 + 0.8;
        s.style.cssText = `width:${size}px;height:${size}px;top:${Math.random()*100}%;left:${Math.random()*100}%;--dur:${Math.random()*1.5+0.8}s;--min-o:${Math.random()*0.15+0.05};--max-o:${Math.random()*0.5+0.5};animation-delay:${Math.random()*3}s;`;
        sf.appendChild(s);
    }
    // 별똥별 주기적 생성
    // 🔴 (2026-07-31) 홈 별똥별(5727행)과 같은 누수 수정. 두 군데를 같은 방식으로 맞춘다.
    //   · 기존 가드는 `lobbyView.style.display === 'none'` 을 봤지만, 화면 전환은 .view/.active
    //     '클래스'로 하므로 인라인 style.display 는 거의 항상 빈 문자열이었다 → 가드가 사실상 무효.
    //     → offsetParent 로 '실제로 렌더되는지' 를 본다.
    //   · lite-mode 는 animation 을 죽여 animationend 가 안 온다 → 만들지 않는다.
    //   · 그래도 안전망(강제 삭제)을 함께 둔다.
    const spawn = () => {
        if (!document.body.contains(sf)) return;
        // 로비 화면이 보일 때만 별똥별 생성 (성능 보호)
        if (!sf.offsetParent && getComputedStyle(sf).position !== 'fixed') return;
        if (document.documentElement.classList.contains('lite-mode')) return;
        const ss = document.createElement('div');
        ss.className = 'shooting-star';
        ss.style.top = Math.random() * 60 + '%';
        ss.style.right = '-80px';
        const dur = Math.random() * 0.6 + 0.7;
        ss.style.animation = `shoot ${dur}s linear forwards`;
        sf.appendChild(ss);
        let done = false;
        const kill = () => { if (done) return; done = true; ss.remove(); };
        ss.addEventListener('animationend', kill, { once: true });
        setTimeout(kill, dur * 1000 + 1500);
    };
    setInterval(() => { spawn(); setTimeout(spawn, 300 + Math.random() * 400); }, 2400);
}

/* 🧪 (2026-08-07 강사 건의 2) 번호가 붙은 연습·데모 방으로 바로 입장.
   실제 수업 방(class-*)과 이름 공간이 겹치지 않아 예약 검증·자동녹화 어디에도 걸리지 않는다. */
window.vcJoinPracticeRoom = function (n) {
  try {
    var ri = document.getElementById('vc-roomcode-input');
    if (ri) ri.value = 'demo-' + (n || 1);
    var ni = document.getElementById('vc-name-input');
    if (ni && !ni.value.trim()) {
      var _pu = (window.getCurrentUser ? window.getCurrentUser() : null);
      if (_pu && _pu.name) ni.value = _pu.name;
    }
    if (typeof vcJoinRoom === 'function') vcJoinRoom();
  } catch (e) { console.warn('[practice-room]', e); }
};
/* 강사·관리자에게만 연습방 입구를 보여 준다 — 학생 로비를 어지럽히지 않는다. */
window.vcSyncPracticeEntry = function () {
  try {
    var w = document.getElementById('vc-practice-wrap');
    if (!w) return;
    var staff = (typeof vcIsStaffNow === 'function') ? vcIsStaffNow()
              : (typeof vcIsTeacherRole === 'function' ? vcIsTeacherRole() : false);
    w.style.display = staff ? 'block' : 'none';
  } catch (_) {}
};

/** 페이지 로드 시 — 저장된 ID/PW/방번호 복원 + 자동로그인 처리 */
function vcRestoreCredentials() {
  lobbyInitStarfield();
  try { window.vcSyncPracticeEntry(); } catch (_) {}
  try {
    const saveId    = localStorage.getItem(VC_AUTH_KEYS.saveId) === '1';
    const autoLogin = localStorage.getItem(VC_AUTH_KEYS.autoLogin) === '1';
    const uid       = localStorage.getItem(VC_AUTH_KEYS.uid) || '';
    const pw        = localStorage.getItem(VC_AUTH_KEYS.pw) || '';
    const roomCode  = localStorage.getItem('mangoi_vc_roomcode') || '';

    const idInput   = document.getElementById('vc-name-input');
    const pwInput   = document.getElementById('vc-room-input');
    const roomInput = document.getElementById('vc-roomcode-input');
    const ckSave    = document.getElementById('vc-save-id');
    const ckAuto    = document.getElementById('vc-auto-login');

    if (ckSave) ckSave.checked = saveId;
    if (ckAuto) ckAuto.checked = autoLogin;
    // 저장된 값들을 자동으로 채워주기만 하고 — 자동 입장은 하지 않음 (사용자가 입장 버튼을 눌러야 진입)
    if (saveId && uid && idInput) idInput.value = uid;
    // fix (2026-06-01) — 예전에 저장된 'room-랜덤' 코드는 복원하지 않음(각자 다른 방으로 갈라지는 원인).
    //   사용자가 직접 입력한 코드만 복원. 비어 있으면 공용 수업방(mangoi-class)으로 입장됨.
    // 🆕 방코드 자동복원 제거 — 옛 코드가 몰래 채워져 교사·학생이 서로 다른 방에 들어가던 문제 차단.
    //    비워 두면 모두 공용 수업방(mangoi-class)에서 자동으로 만난다.
    if (roomInput) roomInput.value = '';
    if (autoLogin && pw && pwInput) pwInput.value = pw;
    // ⛔ 자동 입장 제거 — 사용자가 직접 [입장] 버튼을 눌러야만 입장하도록
  } catch (e) { /* localStorage 차단 환경 — 무시 */ }
}
// 페이지 준비 완료 시·로비 진입 시 복원
document.addEventListener('DOMContentLoaded', vcRestoreCredentials);
// showView('view-videocall-lobby') 후에도 복원 (메인→로비 이동 케이스)
// + 🔊 로비 진입 시 환영 음성 자동 재생, 다른 뷰 이동 시 정지
const _origShowView_vc = window.showView;
if (typeof _origShowView_vc === 'function') {
  window.showView = function(id) {
    _origShowView_vc.apply(this, arguments);
    if (id === 'view-videocall-lobby') {
        setTimeout(vcRestoreCredentials, 50);
        setTimeout(lobbyPlayWelcome, 80);              // ⏱ DOM 렌더 후 재생
        // 🆕 이미 홈페이지에서 로그인했으면 로비를 건너뛰고 바로 수업 입장 (두 번 로그인 방지)
        setTimeout(function(){
          try {
            if (window.__vcLobbyAutoJoined) return;
            var raw = localStorage.getItem('mangoi_logged_user');
            if (!raw || raw === 'null' || raw === '{}') return;
            var u; try { u = JSON.parse(raw); } catch(_) { return; }
            if (!(u && (u.uid || u.id) && u.name)) return;   // 로그인 안돼있으면 로비 그대로
            var ni = document.getElementById('vc-name-input');
            var pw = document.getElementById('vc-room-input');
            if (ni && !ni.value) ni.value = u.name;
            if (pw && !pw.value) pw.value = '0000';
            window.__vcLobbyAutoJoined = true;
            if (typeof vcJoinRoom === 'function') vcJoinRoom();   // 바로 수업 화면으로
          } catch(e){ console.warn('[auto-enter]', e); }
        }, 220);
    } else {
        // 로비에서 다른 화면으로 떠날 때 자동 정지 + 자동입장 플래그 리셋
        lobbyStopWelcome();
        window.__vcLobbyAutoJoined = false;
    }
  };
}
/* 🎭 (2026-08-08 강사 피드백 — Teacher Ana ①)
   「강사보다 먼저 들어온 학생이 자동으로 강사 역할을 받는다」
   ───────────────────────────────────────────────────────────────────────────────
   [원인] 역할을 `localStorage['mangoi_user_role']` 에 **주인 없이** 저장하고 있었다.
     한 번 강사가 들어간 브라우저에는 그 값이 영구히 남는다. 그 다음에 그 PC 로 들어온
     사람은 — 학생이든 누구든 — 계정 역할을 못 읽는 순간(자동입장·소셜로그인 직후·
     세션 만료) 그 낡은 'teacher' 를 자기 역할로 집어 든다.
     서버(DO)는 클라이언트가 말한 role 을 그대로 믿으므로, 그 학생은 방 전체에 «강사» 로
     기록된다 → 교재 넘기기·전체 음소거·필기 잠금까지 손에 쥔다.
   [왜 «먼저 들어오면» 인가] 학원·가정의 공용 PC 에서 강사가 시연/점검하고 나간 뒤
     학생이 먼저 들어오는 순서가 가장 흔했다. 순서가 원인이 아니라 «남아 있던 값» 이 원인이다.
   [해결] 저장한 역할에 **주인(uid)** 을 함께 적는다. 지금 로그인한 사람과 주인이 다르면
     그 값은 없는 것으로 본다. 로그인 자체가 없으면 예전처럼 쓴다(자동입장 경로 보호).
   🔑 원칙: **역할은 «올리는» 쪽으로만 추측하지 않는다.** 계정이 학생이라고 말하면
      과거 값이 무엇이든 학생이다(내림은 언제나 안전, 올림은 사고). */
window.vcRoleRemember = function(role){
    try {
        if (!role) return;
        localStorage.setItem('mangoi_user_role', role);
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        var uid = (u && (u.uid || u.id)) ? String(u.uid || u.id) : '';
        if (uid) localStorage.setItem('mangoi_user_role_uid', uid);
        else localStorage.removeItem('mangoi_user_role_uid');   // 주인 모름 = 다음 사람이 물려받지 않게
    } catch (_) {}
};
/** 저장된 역할 — 지금 로그인한 사람의 것일 때만 돌려준다. 아니면 '' */
window.vcRoleStored = function(){
    try {
        var v = localStorage.getItem('mangoi_user_role') || '';
        if (!v) return '';
        var owner = localStorage.getItem('mangoi_user_role_uid') || '';
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        var uid = (u && (u.uid || u.id)) ? String(u.uid || u.id) : '';
        // 로그인 중인데 주인이 다르면(또는 주인이 안 적혀 있으면) 남의 역할이다 → 버린다
        if (uid && owner !== uid) return '';
        return v;
    } catch (_) { return ''; }
};

// fix (2026-06-01) — 자동 입장 (관리자 '수업입장' iframe 임베드용)
//   /?vc_autojoin=1&vc_room=mangoi-class&vc_name=교사 홍길동  → 로비 자동 채움 + 입장 시도
(function vcAutoJoinFromParams(){
  function run(){
    try {
      var sp = new URLSearchParams(location.search);
      if (sp.get('vc_autojoin') !== '1') return;
      var room = sp.get('vc_room') || 'mangoi-class';
      var name = sp.get('vc_name') || '교사';
      // 🌟 (2026-07-05) 역할 명시 — 관리자 임베드 URL 에 &vc_role=teacher 를 붙이면 확정적으로 강사로 입장.
      //   (없으면 vcIsTeacherRole 의 이름 휴리스틱이 백업으로 동작)
      var role = (sp.get('vc_role') || '').trim().toLowerCase();
      if (role === 'teacher' || role === 'admin' || role === 'student') {
        window.vcMyRole = role;
        /* 🎭 URL 로 명시된 역할은 «확정» 이다 — vcJoinRoom 의 재판정이 이걸 뒤집지 않게 표시해 둔다.
           이 화면(관리자 임베드)에는 계정 세션이 없을 수 있어, 다시 재면 학생으로 내려간다. */
        window.__vcRoleFromUrl = true;
        // 🔒 역할 확정 직후 수업 통제 칩(전체 음소거/집중 모드) 노출 갱신 — 강사/관리자만 보임
        try { setTimeout(function(){ if (typeof vcClassLockChipsRender === 'function') vcClassLockChipsRender(); }, 300); } catch(_){}
        window.vcRoleRemember(role);   // 🎭 주인(uid)까지 함께 적는다 — 다음 사람이 물려받지 않게
      }
      (function tryJoin(attempt){
        if (typeof showView !== 'function') { if (attempt < 40) return setTimeout(function(){ tryJoin(attempt+1); }, 150); return; }
        /* 🔒 (2026-07-21) 이중 입장 방지 — showView('view-videocall-lobby') 는 로비 자동입장
           타이머(+220ms)를 깨우는데, 이 경로(+350ms)도 따로 vcJoinRoom() 을 부른다.
           그러면 소켓이 2개 열리고, 220ms 쪽은 방코드 입력칸이 아직 비어 있어(+50ms 에
           vcRestoreCredentials 가 비움) 기본방 'mangoi-class' 로 들어가 유령 참가자로 남았다.
           먼저 플래그를 세워 로비 경로가 스스로 빠지게 한다. */
        window.__vcLobbyAutoJoined = true;
        try { showView('view-videocall-lobby'); } catch(_){}
        setTimeout(function(){
          var ni = document.getElementById('vc-name-input');
          var ri = document.getElementById('vc-roomcode-input');
          if (ni) ni.value = name;
          if (ri) ri.value = room;
          if (typeof vcJoinRoom === 'function') { try { vcJoinRoom(); } catch(e){ console.warn('[vc-autojoin] join 실패(로비에서 수동 입장 가능):', e); } }
        }, 350);
      })(0);
    } catch(e){}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();

// 페이지가 보이지 않게 되면(탭 전환) 음성 일시 정지 — 매너 모드
document.addEventListener('visibilitychange', () => {
    if (document.hidden) lobbyStopWelcome();
});

// ═══════════════════════════════════════════════════════════════
// 🎓 Phase RM — 예약 기반 '항상 같은 방' 입장 (엇갈림 차단 + 시간 게이트)
//   서버 /api/class/sessions/today 가 예약(schedule.id)에서 결정론적 room_id 를 계산.
//   선생님·학생이 같은 예약을 참조하면 room_id 가 반드시 동일 → 서로 다른 방에 들어갈 수 없음.
//   시작 10분 전 이전이면 대기(카운트다운) 후 입장창이 열리면 자동 연결 → 너무 일찍/늦게 방지.
// ═══════════════════════════════════════════════════════════════
async function vcJoinMyClass() {
    var u = (window.getCurrentUser ? window.getCurrentUser() : null);
    var uid = u && u.uid;
    var typed = ((document.getElementById('vc-name-input') || {}).value || '').trim();
    var name = (u && u.name) || typed || '학생';
    var role = (u && u.role) || ((typeof vcIsTeacherRole === 'function' && vcIsTeacherRole()) ? 'teacher' : 'student');
    if (!uid && !typed) { alert('아이디를 입력하거나 로그인 후 이용하세요.'); return; }

    var btn = document.getElementById('vc-join-myclass');
    if (btn) { btn.disabled = true; btn.dataset._t = btn.textContent; btn.textContent = '수업 찾는 중…'; }
    try {
        var qs = 'role=' + encodeURIComponent(role);
        if (uid) qs += '&user_id=' + encodeURIComponent(uid);
        if (typed) qs += '&student_name=' + encodeURIComponent(typed);
        var r = await fetch('/api/class/sessions/today?' + qs, { credentials: 'include' });
        var d = await r.json();
        var sessions = (d && d.sessions) || [];
        var current = d && d.current;
        if (d) window.__vcRelayAlways = !!d.net_relay;
        if (!sessions.length) {
            alert('오늘 예약된 수업이 없어요. 🗓️\n예약이 있는데도 안 보이면 아래 "방 코드 직접 입력"으로 입장해 주세요.');
            return;
        }
        // 교사가 오늘 여러 수업이고 지금 바로 들어갈 것이 애매하면 → 목록에서 선택
        if ((role === 'teacher' || role === 'admin') && sessions.length > 1 && !current) {
            vcShowSessionPicker(sessions, name, role); return;
        }
        var target = current || sessions[0];
        if (target.status === 'early') { vcShowClassGate(target, name, role); return; }
        if (target.status === 'ended') { alert('오늘 수업은 이미 종료되었어요.'); return; }
        vcEnterResolvedRoom(target, name, role);
    } catch (e) {
        console.warn('[vcJoinMyClass] err', e);
        alert('수업 정보를 불러오지 못했어요. 아래 "방 코드 직접 입력"으로 입장해 주세요.');
    } finally {
        if (btn) { btn.disabled = false; if (btn.dataset._t) btn.textContent = btn.dataset._t; }
    }
}

/** 결정론적 room_id 로 실제 입장 (기존 vcJoinRoom 흐름 재사용) */
function vcEnterResolvedRoom(session, name, role) {
    if (role === 'teacher' || role === 'admin' || role === 'student') {
        window.vcMyRole = role;
        // 🔒 역할 확정 직후 수업 통제 칩(전체 음소거/집중 모드) 노출 갱신 — 강사/관리자만 보임
        try { setTimeout(function(){ if (typeof vcClassLockChipsRender === 'function') vcClassLockChipsRender(); }, 300); } catch(_){}
        window.vcRoleRemember(role);   // 🎭 주인(uid)까지 함께 적는다
    }
    var ni = document.getElementById('vc-name-input');
    var ri = document.getElementById('vc-roomcode-input');
    if (ni && name) ni.value = name;
    if (ri) ri.value = session.room_id;          // ← 예약에서 계산된 방 = 반드시 상대와 동일
    window.vcCurrentSession = session;           // 대기실/알림(Phase2)용 메타
    if (typeof vcJoinRoom === 'function') vcJoinRoom();
    try { vcStartWaitingMonitor(session, role); } catch (e) {}
}

/** ⏰ 입장 시간 게이트 — 시작 10분 전이 되기 전엔 대기, 열리면 자동 입장 */
function vcShowClassGate(session, name, role) {
    var ov = document.getElementById('vc-class-gate');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'vc-class-gate';
        ov.style.cssText = 'position:fixed;inset:0;z-index:11000;display:flex;align-items:center;justify-content:center;background:rgba(8,12,24,.86);backdrop-filter:blur(6px);font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif';
        document.body.appendChild(ov);
    }
    function fmt(ms) { ms = Math.max(0, ms); var s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60); s = s % 60; m = m % 60; return (h > 0 ? h + '시간 ' : '') + m + '분 ' + String(s).padStart(2, '0') + '초'; }
    var startLabel = new Date(session.start_ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    function render() {
        var now = Date.now();
        var toOpen = session.open_at_ts - now;
        if (toOpen <= 0) { clearInterval(ov.__t); ov.remove(); vcEnterResolvedRoom(session, name, role); return; }
        ov.innerHTML = '<div style="max-width:420px;width:90%;background:linear-gradient(160deg,#1e293b,#0f172a);border:1px solid rgba(148,163,184,.25);border-radius:24px;padding:34px 28px;text-align:center;color:#e2e8f0;box-shadow:0 30px 80px -20px rgba(0,0,0,.7)">'
            + '<div style="font-size:44px;margin-bottom:6px">⏰</div>'
            + '<div style="font-size:19px;font-weight:800;margin-bottom:6px">아직 입장 시간이 아니에요</div>'
            + '<div style="font-size:14px;color:#94a3b8;margin-bottom:18px">수업 시작 <b style="color:#fbbf24">' + startLabel + '</b> · 시작 10분 전부터 입장할 수 있어요</div>'
            + '<div style="font-size:13px;color:#cbd5e1;margin-bottom:4px">입장 가능까지</div>'
            + '<div style="font-size:30px;font-weight:900;letter-spacing:-1px;color:#7dd3fc;margin-bottom:22px">' + fmt(toOpen) + '</div>'
            + '<div style="font-size:13px;color:#64748b;margin-bottom:18px">🎓 ' + (session.student_name || '') + ' · 강사 ' + (session.teacher_name || '미배정') + '</div>'
            + '<button id="vc-gate-close" style="background:rgba(148,163,184,.15);color:#e2e8f0;border:none;border-radius:12px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer">닫기</button>'
            + '<div style="font-size:11px;color:#475569;margin-top:14px">입장 시간이 되면 자동으로 연결됩니다</div></div>';
        var c = document.getElementById('vc-gate-close'); if (c) c.onclick = function () { clearInterval(ov.__t); ov.remove(); };
    }
    render(); ov.__t = setInterval(render, 1000);
}

/** 👩‍🏫 교사용 — 오늘 여러 수업 중 선택 (선택 → 학생과 같은 방으로 연결) */
function vcShowSessionPicker(sessions, name, role) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:11000;display:flex;align-items:center;justify-content:center;background:rgba(8,12,24,.86);backdrop-filter:blur(6px);font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif';
    var items = sessions.map(function (s) {
        var t = new Date(s.start_ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        var badge = s.status === 'live' ? '<span style="color:#34d399">● 진행중</span>' : s.status === 'open' ? '<span style="color:#7dd3fc">입장 가능</span>' : s.status === 'ended' ? '<span style="color:#64748b">종료</span>' : '<span style="color:#fbbf24">' + t + ' 예정</span>';
        var dis = s.status === 'ended';
        return '<button class="vc-pick" data-room="' + s.room_id + '" ' + (dis ? 'disabled' : '') + ' style="display:flex;justify-content:space-between;align-items:center;width:100%;background:rgba(148,163,184,.1);border:1px solid rgba(148,163,184,.2);border-radius:14px;padding:14px 16px;margin-bottom:10px;color:#e2e8f0;cursor:' + (dis ? 'not-allowed' : 'pointer') + ';opacity:' + (dis ? '.5' : '1') + '"><span style="font-weight:700">' + t + ' · ' + (s.student_name || '학생') + '</span><span style="font-size:12px">' + badge + '</span></button>';
    }).join('');
    ov.innerHTML = '<div style="max-width:440px;width:92%;background:linear-gradient(160deg,#1e293b,#0f172a);border:1px solid rgba(148,163,184,.25);border-radius:24px;padding:28px 24px;color:#e2e8f0;box-shadow:0 30px 80px -20px rgba(0,0,0,.7)"><div style="font-size:18px;font-weight:800;margin-bottom:4px">오늘 수업 선택</div><div style="font-size:13px;color:#94a3b8;margin-bottom:18px">입장할 수업을 선택하면 학생과 같은 방으로 연결됩니다</div>' + items + '<button id="vc-pick-close" style="width:100%;background:transparent;color:#64748b;border:none;padding:10px;font-size:13px;cursor:pointer;margin-top:4px">닫기</button></div>';
    document.body.appendChild(ov);
    ov.querySelectorAll('.vc-pick').forEach(function (b) {
        b.onclick = function () {
            var room = b.getAttribute('data-room');
            var s = sessions.find(function (x) { return x.room_id === room; });
            ov.remove();
            if (s) { if (s.status === 'early') vcShowClassGate(s, name, role); else vcEnterResolvedRoom(s, name, role); }
        };
    });
    var c = ov.querySelector('#vc-pick-close'); if (c) c.onclick = function () { ov.remove(); };
}

// ═══════════════════════════════════════════════════════════════
// ⏳ Phase RM 2단계 — 방 안 '상대 입장 대기' 표시 + 5분 노쇼 알림
//   Phase RM 로 입장(vcEnterResolvedRoom)한 세션에서만 동작. window.vcPeerRoles 를 폴링해
//   상대(내가 학생/관찰=선생님 대기, 내가 선생님=학생 대기) 입장 여부를 판단(기존 핸들러 미변경).
// ═══════════════════════════════════════════════════════════════
var vcWaitTimer = null;
function vcStopWaitingMonitor() {
    try { if (vcWaitTimer) { clearInterval(vcWaitTimer); vcWaitTimer = null; } } catch (e) {}
    try { if (window.__vcDemoTeacherTimer) { clearTimeout(window.__vcDemoTeacherTimer); window.__vcDemoTeacherTimer = null; } } catch (e) {}
    try { vcRemoveDemoTeacher(); } catch (e) {}
    /* 🪪 (2026-08-12) id 를 vc-wait-toast 로 분리 — 예전엔 vc-wait-card 를 썼는데,
       그 id 는 index.html 의 «교재 여는 중» 정적 카드가 이미 쓰고 있었다.
       ① if(!card) 가 항상 거짓이라 토스트 전용 스타일(fixed·bottom:88px)이 한 번도 안 붙고
          inset:0 짜리 교재 카드가 «기다리는 중…» 판때기로 교재 패널 전면을 덮었고
       ② 여기 remove() 가 교재 대기 카드를 DOM 에서 영구 삭제해 다시는 못 뜨게 했다. */
    var c = document.getElementById('vc-wait-toast'); if (c) c.remove();
}
function vcStartWaitingMonitor(session, myRole) {
    vcStopWaitingMonitor();
    if (!session) return;
    myRole = myRole || window.vcMyRole || 'student';
    if (myRole === 'observer') return;
    var waitingFor = (myRole === 'teacher' || myRole === 'admin') ? 'student' : 'teacher';
    var waitingLabel = waitingFor === 'teacher' ? '선생님' : '학생';
    var startedAt = Date.now();
    var NOSHOW_MS = 5 * 60 * 1000;
    var noShowSent = false;
    var calledTeacher = false;   // 🆕 학생 입장 즉시 담당 선생님 1회 호출
    var isDemo = false;          // 🆕 데모 계정 → 실제 강사 미입장 시 시연용 선생님 자동 등장
    try { isDemo = !!(typeof demoStudents !== 'undefined' && session.student_uid && demoStudents[session.student_uid]) || /[?&]demoteacher=1/.test(location.search) || (localStorage.getItem('mangoi_demo_teacher') === '1'); } catch (e) {}

    if (!document.getElementById('vc-wait-kf')) { var st = document.createElement('style'); st.id = 'vc-wait-kf'; st.textContent = '@keyframes vcPulse{0%,100%{opacity:1}50%{opacity:.35}}'; document.head.appendChild(st); }
    var card = document.getElementById('vc-wait-toast');
    if (!card) {
        card = document.createElement('div');
        card.id = 'vc-wait-toast';
        card.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:9800;background:rgba(15,23,42,.92);border:1px solid rgba(148,163,184,.3);border-radius:16px;padding:12px 18px;color:#e2e8f0;font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif;box-shadow:0 16px 40px -12px rgba(0,0,0,.6);display:flex;align-items:center;gap:12px;max-width:92vw';
        document.body.appendChild(card);
    }
    function counterpartPresent() {
        try {
            var roles = window.vcPeerRoles || {};
            for (var id in roles) {
                var r = roles[id];
                if (waitingFor === 'teacher' && (r === 'teacher' || r === 'admin')) return true;
                if (waitingFor === 'student' && r === 'student') return true;
            }
            var boxes = document.querySelectorAll('[id^="vc-video-"]');
            for (var i = 0; i < boxes.length; i++) {
                if (boxes[i].id === 'vc-local-box') continue;
                var rr = boxes[i].dataset ? boxes[i].dataset.role : '';
                if (waitingFor === 'teacher' && (rr === 'teacher' || rr === 'admin')) return true;
                if (waitingFor === 'student' && rr === 'student') return true;
            }
        } catch (e) {}
        return false;
    }
    function elapsed() { var s = Math.floor((Date.now() - startedAt) / 1000), m = Math.floor(s / 60); s = s % 60; return m + ':' + String(s).padStart(2, '0'); }   // 3:07 — 한/영 공용 표기
    function paint(state) {
        if (!card) return;
        /* 🌐 (2026-08-12) 필리핀 강사도 보는 토스트 — 언어 판정은 반드시 getLang() (CLAUDE.md) */
        var en = false; try { en = (typeof getLang === 'function') && getLang() === 'en'; } catch (e) {}
        var who = waitingFor === 'teacher' ? (en ? 'teacher' : '선생님') : (en ? 'student' : '학생');
        if (state === 'met') {
            var metMsg = en ? ('The ' + who + ' joined! You can start the class.') : (who + '이 입장했어요! 수업을 시작하세요.');
            card.innerHTML = '<span style="font-size:20px">🎉</span><span style="font-size:14px;font-weight:700">' + metMsg + '</span>';
            setTimeout(vcStopWaitingMonitor, 3500);
            return;
        }
        var callLabel = (calledTeacher && waitingFor === 'teacher')
            ? (en ? 'Calling the teacher…' : '선생님을 부르는 중…')
            : (en ? ('Waiting for the ' + who + '…') : (who + '을 기다리는 중…'));
        var sent = (calledTeacher && waitingFor === 'teacher')
            ? '<div style="font-size:11px;color:#34d399;margin-top:2px">📣 ' + (en ? 'Teacher has been called — joining soon' : '선생님을 호출했어요 — 곧 입장하십니다') + '</div>'
            : (noShowSent ? '<div style="font-size:11px;color:#fbbf24;margin-top:2px">📣 ' + (en ? 'We sent them a reminder to join' : '상대에게 입장 알림을 보냈어요') + '</div>' : '');
        card.innerHTML = '<span style="width:10px;height:10px;border-radius:50%;background:#fbbf24;box-shadow:0 0 0 4px rgba(251,191,36,.2);animation:vcPulse 1.4s infinite;flex:0 0 auto"></span>'
            + '<div><div style="font-size:14px;font-weight:700">' + callLabel + ' <span style="color:#94a3b8;font-weight:500">(' + elapsed() + ')</span></div>'
            + '<div style="font-size:11px;color:#94a3b8">' + (en ? 'Disappears when they join' : '입장하면 자동으로 사라져요') + '</div>' + sent + '</div>'
            + '<button onclick="vcStopWaitingMonitor()" style="background:rgba(148,163,184,.15);border:0;color:#cbd5e1;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer;flex:0 0 auto">' + (en ? 'Close' : '닫기') + '</button>';
    }
    paint('waiting');
    // 🆕 (A) 학생이 들어오면 담당 선생님 즉시 호출(1회) — 이미 선생님이 있으면 생략
    if (waitingFor === 'teacher' && !calledTeacher && !counterpartPresent()) {
        calledTeacher = true;
        try { vcCallTeacherNow(session); } catch (e) {}
        paint('waiting');
    }
    // 🆕 (C) 데모: 실제 선생님이 안 들어오면 시연용 선생님 자동 등장 (실제 수업엔 영향 없음)
    if (waitingFor === 'teacher' && isDemo) {
        try { if (window.__vcDemoTeacherTimer) clearTimeout(window.__vcDemoTeacherTimer); } catch (e) {}
        window.__vcDemoTeacherTimer = setTimeout(function () {
            if (!document.body.classList.contains('vc-in-call')) return;
            if (counterpartPresent()) return;   // 진짜 선생님이 이미 입장했으면 시연 생략
            try { vcInjectDemoTeacher(session); } catch (e) {}
        }, 5200);
    }
    vcWaitTimer = setInterval(function () {
        if (!document.body.classList.contains('vc-in-call')) { vcStopWaitingMonitor(); return; }
        if (counterpartPresent()) { paint('met'); clearInterval(vcWaitTimer); vcWaitTimer = null; return; }
        if (!noShowSent && (Date.now() - startedAt) >= NOSHOW_MS) { noShowSent = true; vcSendNoShow(session, waitingFor); }
        paint('waiting');
    }, 2000);
}
function vcSendNoShow(session, waitingFor) {
    try {
        var s = (typeof demoStudents !== 'undefined' && session.student_uid) ? demoStudents[session.student_uid] : null;
        fetch('/api/notify/no-show', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: session.room_id,
                schedule_id: session.schedule_id,
                waiting_for: waitingFor,
                student_name: session.student_name,
                teacher_name: session.teacher_name,
                lesson_title: (s && s.lesson_title) || '영어 수업',
                student_uid: session.student_uid,
                teacher_uid: session.teacher_id,
                student_phone: s && s.phone, parent_phone: s && s.parent_phone, teacher_phone: s && s.teacher_phone,
                waited_minutes: 5,
            })
        }).catch(function () {});
    } catch (e) { console.warn('[vcSendNoShow]', e); }
}

// 🆕 학생 입장 즉시 담당 선생님 호출(푸시/카톡) — no-show 엔드포인트 재사용, 대기 0분(즉시)
function vcCallTeacherNow(session){
    try {
        var s = (typeof demoStudents !== 'undefined' && session.student_uid) ? demoStudents[session.student_uid] : null;
        fetch('/api/notify/no-show', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: session.room_id, schedule_id: session.schedule_id,
                waiting_for: 'teacher', student_name: session.student_name, teacher_name: session.teacher_name,
                lesson_title: (s && s.lesson_title) || '영어 수업',
                student_uid: session.student_uid, teacher_uid: session.teacher_id,
                student_phone: s && s.phone, parent_phone: s && s.parent_phone, teacher_phone: s && s.teacher_phone,
                waited_minutes: 0, reason: 'student_entered'
            })
        }).catch(function(){});
    } catch (e) { console.warn('[vcCallTeacherNow]', e); }
}
// 🆕 시연용 선생님 타일 (실제 강사 미입장 시 데모용). dataset.role='teacher' 라 대기카드가 자동으로 '입장' 처리
function vcInjectDemoTeacher(session){
    if (document.getElementById('vc-video-demoteacher')) return;
    var grid = document.getElementById('vc-video-grid'); if (!grid) return;
    var tname = (session && session.teacher_name) || '원어민 선생님';
    var box = document.createElement('div');
    box.className = 'video-box'; box.id = 'vc-video-demoteacher';
    box.dataset.role = 'teacher'; box.dataset.demo = '1';
    box.innerHTML = '<video autoplay playsinline loop muted></video><span class="video-label">' + escHtml(tname) + ' (시연)</span>';
    var vid = box.querySelector('video');
    vid.src = '/video/callcenter-teacher.mp4';
    vid.play().then(function(){ setTimeout(function(){ try { vid.muted = false; } catch(e){} }, 600); }).catch(function(){});
    // 🧑‍🏫 시연 선생님도 내 타일보다 위 (vcInsertBoxTeacherFirst 는 뒤 스크립트에서 정의 — 런타임엔 존재)
    if (typeof vcInsertBoxTeacherFirst === 'function') vcInsertBoxTeacherFirst(grid, box); else grid.appendChild(box);
    try { vcUpdateGridCount(); } catch (e) {}
    try { window.vcApplySpotlight && window.vcApplySpotlight(); } catch (e) {}
    try { vcRefreshPraiseUI(); } catch (e) {}
    try { vcAddChatSystem('🎉 ' + tname + '이(가) 입장했어요'); } catch (e) {}
}
function vcRemoveDemoTeacher(){
    var b = document.getElementById('vc-video-demoteacher');
    if (b) { b.remove(); try { vcUpdateGridCount(); } catch (e) {} }
}

/* ──────────────────────────────────────────────────────────────
   🎥 (2026-07-24) 입장 전 카메라·마이크 권한 선확보 — "선생님이 안 보여요" 근본 대책.
   ───────────────────────────────────────────────────────────────
   근본원인: 이 앱은 최초 offer/answer 이후 재협상을 하지 않는다(vcStuckPeerWatch 주석 참고).
     그런데 자동입장 링크(?vc_autojoin=1)·저장된 로그인 자동입장은 권한 팝업이 아직 떠 있는
     상태에서 그대로 vcJoinRoom() 을 호출한다 → 카메라·마이크 없이 SDP 가 확정되고
     m-line 0 으로 협상이 끝나 상대에게 영상·소리가 영영 가지 않는다.
     (2026-07-23 실수업에서 12분간 재현 — 양쪽 원격 타일 모두 '상대 영상 준비 중')
   해결: 입장 직전에 getUserMedia 를 한 번 호출해 권한 팝업을 '먼저' 끝낸다.
     거부·미지원이어도 절대 입장을 막지 않는다(fail-open — 수업이 최우선). */
window.__vcPermReady = false;
/* ⚡ (2026-08-22 필리핀 강사 입장속도) 여기서 연 카메라를 «버리지 않고» 입장에 그대로 넘긴다.
   [예전] bare {video:true,audio:true} 로 열고 곧바로 stop() → vcJoinRoom 이 처음부터 다시 열었다.
     ① 카메라를 두 번 여는 셈이라 그 시간이 통째로 입장 지연이 된다(저사양 노트북일수록 크다).
     ② bare 제약은 해상도 상한이 없어 웹캠이 1080p 로 열리는 일까지 있었다 — 곧 버릴 스트림에
        CPU·발열을 쓰고, 그 사이 입장이 더 늦어진다.
   [지금] 처음부터 acquireLocalMedia 의 튜닝된 제약(에코제거·PC 720p/모바일 VGA 상한·기억한 장치)으로
     한 번만 열고 재사용한다. 권한 팝업을 «먼저» 끝낸다는 이 함수의 목적은 그대로다.
   ⚠️ 소비되지 않으면 카메라 불이 켜진 채로 남는다 — 입장이 도중에 멈추는 길이 있다
      (대기화면 vcShowClassGate·방 검증 차단·오늘 수업 없음). 그래서 20초 안에 아무도
      가져가지 않으면 스스로 놓는다. */
window.__vcPermStream = null;
window.vcReleasePermStream = function () {
    var s = window.__vcPermStream; window.__vcPermStream = null;
    try { if (s && s.getTracks) s.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
};
/** 방금 확보한 스트림을 «한 번만» 가져간다. 살아 있지 않으면 null(호출자가 정상 획득으로 내려감). */
window.vcTakePermStream = function () {
    var s = window.__vcPermStream;
    if (!s || typeof s.getTracks !== 'function') return null;
    window.__vcPermStream = null;
    try { clearTimeout(window.__vcPermRelT); } catch (_) {}
    var live = false;
    try { live = s.getTracks().some(function (t) { return t.readyState === 'live'; }); } catch (_) {}
    if (!live) { try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {} return null; }
    return s;
};
window.vcEnsureMediaPermission = async function () {
    if (window.__vcPermReady && window.__vcPermStream) return true;
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
        var s = null;
        try { s = await acquireLocalMedia({ video: true, audio: true }); }
        catch (e) {
            if (e && e.name === 'NotAllowedError') throw e;      // 사용자가 거부 → 재요청 안 함
            s = await acquireLocalMedia({ video: false, audio: true });  // 카메라만 막힌 경우 소리라도 확보
        }
        window.vcReleasePermStream();
        window.__vcPermStream = s;
        try { window.__vcPermRelT = setTimeout(window.vcReleasePermStream, 20000); } catch (_) {}
        window.__vcPermReady = true;
        return true;
    } catch (e) {
        console.warn('[vc-perm] 권한 선확보 실패(입장은 계속 진행):', e && e.name);
        return false;
    }
};

/* 🔁 (2026-07-24) 늦게 허용된 미디어 자동 재협상.
   replaceTrack 은 '이미 만들어진 sender' 가 있을 때만 통한다. 권한 없이 입장했던 피어에는
   해당 kind 의 sender 자체가 없어(m-line 0) 기존 자가치유가 조용히 무력화된다.
   → sender 가 없는 피어만 골라 vcReconnectPeer 로 '지금의 트랙'으로 다시 세운다.
   (vcReconnectPeer 자체가 8초 쿨다운 + glare 회피를 갖고 있어 폭주하지 않음) */
window.vcRenegotiateMissing = function (kind) {
    try {
        if (!document.body.classList.contains('vc-in-call')) return 0;
        var n = 0;
        Object.keys(vcPeerConnections || {}).forEach(function (id) {
            var pc = vcPeerConnections[id];
            if (!pc) return;
            var has = false;
            try { has = pc.getSenders().some(function (x) { return x.track && x.track.kind === kind; }); } catch (_) {}
            if (!has) {
                n++;
                console.warn('[vc-reneg] ' + kind + ' sender 없음 → 재협상:', id);
                try { vcReconnectPeer(id); } catch (_) {}
            }
        });
        return n;
    } catch (_) { return 0; }
};

/** 다자간 통화 방 입장 */
async function vcJoinRoom(skipUI) {
    vcIsObserver = false; // 일반 입장 모드 확인
    window._vcObserverMode = false;   // ★ (2026-07-20) 별도 스크립트(입장 자동 교재 로드)에서 참조용 미러
    vcUsername = document.getElementById('vc-name-input').value.trim();
    if (!vcUsername) { alert('아이디를 입력하세요.'); return; }

    /* 🎭 (2026-08-07 Kaye 피드백 1·2·5번) 역할을 «소켓을 열기 전에» 확정한다.
       [실제 사고] window.vcMyRole 은 마이페이지 입장(vcEnterResolvedRoom)과 관리자 임베드
       (?vc_role=teacher) 두 경로에서만 세팅됐다. 로비에서 그냥 로그인해 들어오면 undefined 로
       남고, 그 상태로 join-room 을 role:'student' 로 보낸다. 그러면 «강사가 서버에 학생으로
       기록»되어 다음이 한꺼번에 조용히 죽는다:
         · 강사 전용 칩(내 화면 공유·학생 필기 잠금·교재 고르기)이 숨은 채로 남고
         · 교재 페이지 넘기기 화살표(vcMyRole 정확일치 게이트)가 먹지 않고
         · 전체 음소거·집중 모드·필기 잠금이 서버 role 검증에서 버려진다.
       Kaye 화면이 공용방(mangoi-class)이었던 것이 바로 이 경로다(방코드 없이 로비 입장).
       ⚠️ 이름 휴리스틱(vcIsTeacherRole)은 «계정 역할이 아예 없을 때»만 쓴다 — 로그인한
          학생을 이름만 보고 강사로 올리면 교재를 반 전체에 넘겨버릴 수 있다. */
    try {
      /* 🎭 (2026-08-08 Ana ①) 예전엔 `vcMyRole` 이 이미 'teacher' 면 **여기를 통째로 건너뛰었다.**
         이 페이지는 SPA 라 로그아웃·계정 전환을 해도 그 전역이 그대로 남는다 → 한 번 강사였던
         창에서는 누가 들어와도 영원히 강사였다. 계정이 «학생» 이라고 말하면 내려야 한다.
         ⚠️ 관리자 임베드(?vc_role=teacher)만은 예외로 지킨다 — 그건 URL 로 명시된 확정 역할이고,
            그 화면에는 계정 세션이 아예 없을 수 있다. */
      if (!window.__vcRoleFromUrl) {
        var _ru = (window.getCurrentUser ? window.getCurrentUser() : null);
        var _rr = (_ru && _ru.role) || '';
        var _hadAccount = !!_rr;                       // 계정이 역할을 «분명히» 말해 줬는가
        // 🔒 주인(uid)이 맞을 때만 돌려준다. 함수가 아직 없으면(스크립트 순서) 저장값을 쓰지 않는다 —
        //    여기서 예외가 나면 바깥 try 가 삼켜 «역할 판정 전체» 가 조용히 사라진다.
        if (!_rr) { _rr = (typeof window.vcRoleStored === 'function') ? window.vcRoleStored() : ''; }
        if (!_rr) { try { _rr = (window.MangoV3 && MangoV3.user && MangoV3.user.role) || ''; } catch (_) {} }
        _rr = String(_rr).toLowerCase();
        /* 역할 표기가 경로마다 다르다 — 마이페이지는 'teacher', 홈 통합로그인 폴백은 'hq_teacher'.
           정확일치로 보면 hq_teacher 강사가 또 학생 취급을 받는다(2026-08-06 같은 함정). */
        /* 🎛 (2026-08-12 사장님·IT담당자) 관리자 콘솔 로그인(mangoi_admin_session)을 역할 판정에 넣는다.
           [실제 사고] IT 담당자가 관리자로 로그인한 브라우저에서 수업에 들어가 장치 도우미로 강사
           장치를 봐 줘야 하는데, 이 사슬이 관리자 세션을 안 봐서 재입장 때마다 «학생» 으로
           떨어졌다 → 🎛·칭찬이 전부 사라지고, 서버도 장치 명령을 거부(role=student).
           [안전선] ① 계정이 «학생» 이라고 분명히 말하면 조용히 올리지 않는다 — 물어본다
           (Ana ①·Melca 6 과 같은 원칙: 명시된 역할을 침묵으로 뒤집지 않는다. 공용 PC 에
           남은 관리자 세션으로 학생이 승격되는 길을 confirm 한 겹으로 막는다).
           ② 관리자 세션이 없으면 이 블록은 아무것도 바꾸지 않는다 = 기존과 100% 동일. */
        var _admUid = '';
        try { _admUid = String((JSON.parse(localStorage.getItem('mangoi_admin_session') || '{}') || {}).uid || '').trim(); } catch (_) {}
        if (/teacher|tutor/.test(_rr)) window.vcMyRole = 'teacher';
        else if (/^admin$|^hq$|^hq_admin$/.test(_rr)) window.vcMyRole = 'admin';
        else if (_rr) {
          window.vcMyRole = 'student';
          if (_admUid) {
            var _admEn = false; try { _admEn = (typeof getLang === 'function' && getLang() === 'en'); } catch (_) {}
            if (confirm(_admEn
                ? 'Admin console login detected (' + _admUid + ').\nEnter this class as STAFF (device helper / praise tools)?\nCancel = enter as student.'
                : '이 브라우저에 관리자 로그인(' + _admUid + ')이 있습니다.\n스태프(장치 도우미·칭찬 도구)로 입장할까요?\n취소 = 학생으로 입장')) {
              window.vcMyRole = 'admin';
            }
          }
        }
        /* 관리자 세션이 있고 계정 역할이 «비어» 있으면 — 물을 것도 없다, 그 사람이 관리자다.
           (이름 휴리스틱보다 훨씬 강한 근거라서 그 앞에 둔다) */
        else if (_admUid) window.vcMyRole = 'admin';
        /* 🚫 이름 휴리스틱(«아이디에 teacher 가 들어있다»)으로 **올리는** 길을 닫는다.
           로그인한 사람에게 쓰면 «Teacher_Kim 이라는 아이디의 학생» 이 반 전체 교재를 넘긴다.
           로그인이 아예 없는 경우(관리자 임베드·데모)에만 예전처럼 백업으로 둔다. */
        else if (!_ru && typeof vcIsTeacherRole === 'function' && vcIsTeacherRole()) window.vcMyRole = 'teacher';
        else window.vcMyRole = 'student';              // 아무 근거도 없으면 «학생» — 모르면 낮은 쪽이 안전하다
        if ((_hadAccount || window.vcMyRole === 'student') && typeof window.vcRoleRemember === 'function') {
          window.vcRoleRemember(window.vcMyRole);
        }
      }
    } catch (_) {}
    // 🎥 (2026-07-24) 권한 팝업을 입장보다 '먼저' 끝낸다 — 미디어 없는 SDP 고착 방지.
    //   모든 입장 경로(수동 입력·?room=·vc_autojoin·오늘 내 수업)가 이 한 곳을 지난다.
    /* 📶 TURN 발급을 여기서 «걸어만» 둔다 — 카메라 권한 팝업·오늘수업 조회와 겹쳐서 진행된다.
       실제 대기(await)는 피어를 만들기 직전 한 곳에서 한다(아래 «TURN 확보» 주석).
       vcEnsureIceServers 는 진행 중 promise 를 공유하므로 두 번 불러도 fetch 는 한 번이다. */
    try { vcEnsureIceServers(); } catch(_) {}
    try { await window.vcEnsureMediaPermission(); } catch (_) {}
    // 비밀번호 (vc-room-input)는 인증용으로 저장만 함 (실 운영 시 백엔드 검증)
    const vcPassword = document.getElementById('vc-room-input').value.trim();
    // 방번호: 새 필드(vc-roomcode-input)
    // fix (2026-06-01) — 비우면 '랜덤 방'이 아니라 '공용 수업방'으로 입장.
    //   기존엔 비우면 room-랜덤6자리가 생성돼 교사·학생이 서로 다른 방에 들어가 못 만났음.
    //   이제 비우면 모두가 같은 방(mangoi-class)으로 모여 서로 보임. (반/수업별로 나누려면 같은 코드를 입력)
    const roomCodeEl = document.getElementById('vc-roomcode-input');
    const VC_DEFAULT_ROOM = 'mangoi-class';
    let vcTypedRoom = roomCodeEl ? roomCodeEl.value.trim() : '';

    // 🧭 (2026-07-22) 학부모 컴플레인 #4 — 학생이 방코드 없이 입장하면 공용방(mangoi-class)에서
    //    혼자 기다리는 문제. 빈칸 + 학생 + 오늘 예약이 있으면 예약 방으로 자동 교정.
    /* 🚪 (2026-08-06 동시접속 진단) 학생은 «절대» 공용방으로 흘려보내지 않는다.
       [실측] 한 방 정원은 10명(MAX_USERS)이고 전 방 공통이다. 50명이 공용방에 몰리면
              10명만 들어가고 40명이 room-full 로 즉시 거절당한다(운영에서 재현 확인).
       [기존 사고] join_open 이 거짓(=시작 10분 전보다 이르거나 끝난 뒤)이면 아래 폴백으로 떨어져
              학생이 «아무 안내도 없이» 공용방에 들어갔다. 경고 배너는 교사에게만 있었다.
              2026-07-28 19:36 KST 공용방 동시 12명 = 이미 정원을 넘긴 기록이 있다.
       [해결] 학생은 ① 입장창이 열렸으면 예약방 ② 아직 이르면 카운트다운 대기화면
              (vcShowClassGate — 이미 만들어져 있었고 이 경로에서 호출만 안 되고 있었다)
              ③ 예약이 없거나 조회 실패면 안내 후 정지. 어느 경우에도 공용방으로 가지 않는다.
       ⚠️ 교사는 지금처럼 공용 연습방을 계속 쓴다(시연·연습). 대신 정원을 따로 낮췄다(video-call-room.ts). */
    if (!vcTypedRoom) {
      var _stopJoin = false;
      try {
        var _ju = (window.getCurrentUser ? window.getCurrentUser() : null);
        var _jrole = (window.vcMyRole || (_ju && _ju.role) || ((typeof vcIsTeacherRole === 'function' && vcIsTeacherRole()) ? 'teacher' : 'student'));
        /* 🔒 (2026-07-28 강사 피드백) "내 방에 다른 선생님이 들어온다" (Shas·Kaye/mangoi_162)
           [원인] 이 자동 교정이 학생일 때만 돌아서, 교사는 방코드가 빈 채로 아래 공용방(mangoi-class)에
                  들어갔다. 로비는 순간만 보여 방코드를 넣을 방법도 사실상 없다 → 교사 전원이 같은 방에 모임.
           [해결] 교사·관리자도 같은 방식으로 '오늘 내 예약 방'으로 교정한다.
           ⚠️ (2026-08-06) 정확일치로 보면 안 된다 — 역할 표기가 경로마다 다르다.
              마이페이지는 'teacher', 홈 통합로그인 폴백은 'hq_teacher' 를 쓴다(tryAdminLoginFallback).
              예전엔 (_jrole==='teacher') 라 hq_teacher 강사가 «학생» 취급을 받았다. */
        var _isT = /teacher|admin/i.test(String(_jrole));
        var _jq = 'role=' + (_isT ? 'teacher' : 'student');
        if (_ju && _ju.uid) _jq += '&user_id=' + encodeURIComponent(_ju.uid);
        if (vcUsername) _jq += '&student_name=' + encodeURIComponent(vcUsername);
        var _jd = await fetch('/api/class/sessions/today?' + _jq, { credentials: 'include' }).then(function (x) { return x.json(); }).catch(function () { return null; });
        var _jss = (_jd && _jd.sessions) || [];
        var _js = _jd && (_jd.current || _jss.filter(function (s) { return s.join_open; })[0]);
        // 게이트 상태를 기억해 둔다 — 조회가 실패한 다음 번에도 «막을지 말지» 를 알아야 한다.
        if (_jd && _jd.student_gate) window.__vcStudentGate = _jd.student_gate;
        if (_jd) window.__vcRelayAlways = !!_jd.net_relay;

        if (_js && _js.room_id && _js.join_open) {
          vcTypedRoom = _js.room_id;
          if (roomCodeEl) roomCodeEl.value = vcTypedRoom;
          console.log('[vc] 빈 방코드 → 오늘 예약 방으로 자동 교정:', vcTypedRoom, '(role=' + _jrole + ')');
        } else if (_isT) {
          /* 오늘 예약이 없는 교사(연습·시연)는 공용방으로 간다 — 이때는 다른 사람이 들어올 수 있음을
             분명히 알려 준다. 예약된 실제 수업은 위에서 각자 방으로 갈리므로 겹치지 않는다. */
          window.__vcSharedRoomNotice = 'teacher';
        } else if (_jd && _jd.student_gate !== 'on') {
          /* 🚪 게이트 꺼짐(기본) = 예전과 100% 동일하게 공용방으로 폴백한다.
             ⛔ 지금 켜면 안 되는 이유: class_schedules 663건 중 «실제 학생 예약» 은 6건뿐이다.
                518건은 학생이 없는 강사 시간표 점유(user_id='lms', student_name=NULL), 140건은 시드.
                이 상태로 켜면 대다수 학생이 "예약된 수업이 없어요" 를 만나 입장 자체를 못 한다.
                카페24 수업을 실제 학생 예약으로 옮긴 뒤 wrangler.toml 의
                VC_STUDENT_ROOM_GATE 를 'on' 으로 바꾸면 아래 차단이 살아난다.
             ⚠️ (2026-08-24) 그래도 학생에게는 «몰래» 들여보내지 않는다 — 폴백 자체(입장 가능함)는
                그대로 두고, 교사와 같은 사후 알림 배너(__vcSharedRoomNotice)만 학생용 문구로 띄운다.
                가로막지 않는 이유: 이 분기로 오는 학생 대부분은 «아직 예약 이관이 안 된» 실제
                수강생이라 여기서 막으면 그 학생들이 수업에 못 들어간다(위 주석과 같은 사정). */
          console.log('[vc] student_gate=off → 예전 폴백 유지(공용방, 학생에게는 안내 배너)');
          window.__vcSharedRoomNotice = 'student';
        } else {
          // ── 학생: 공용방 폴백 금지 (게이트 켜짐) ──
          var _early = _jss.filter(function (s) { return s.status === 'early'; })
                           .sort(function (a, b) { return a.start_ts - b.start_ts; })[0];
          if (_early && typeof vcShowClassGate === 'function') {
            // 아직 이르다 → 카운트다운 대기. 시간이 되면 자동으로 «내» 예약방에 들어간다.
            vcShowClassGate(_early, vcUsername || '학생', 'student');
            _stopJoin = true;
          } else if (_jss.length) {
            /* 🌐 한/영을 «둘 다» 보여 준다. 언어 설정 하나로 갈라 두면, 설정이 어긋난 학생이나
               필리핀 매니저가 대신 봐 줄 때 읽지 못한다(사장님 지시: 무조건 한/영 병기). */
            alert('오늘 수업은 이미 끝났어요. ⏹\n그래도 들어가야 한다면 매니저에게 방 번호를 받아 아래에 입력해 주세요.\n\n'
              + "Today's class has already ended.\nIf you still need to join, ask your manager for the room code and enter it below.");
            _stopJoin = true;
          } else {
            alert('오늘 예약된 수업이 없어요. 🗓️\n예약이 있는데도 이렇게 나오면, 매니저에게 방 번호를 받아 아래에 입력해 주세요.\n\n'
              + 'You have no class booked for today.\nIf you believe this is wrong, ask your manager for the room code and enter it below.');
            _stopJoin = true;
          }
        }
      } catch (e) {
        /* 🔴 조회 실패. 게이트가 켜져 있을 때만 학생을 멈춘다.
           예전에는 무조건 «공용방 폴백 유지» 였고, 그게 학생을 남의 방에 밀어 넣던 길이다.
           단 게이트가 꺼진 동안에는 그 예전 동작을 그대로 지켜야 한다(dormant 보장).
           게이트 값은 직전 성공 응답에서 기억해 둔 것을 쓴다 — 지금은 물어볼 수 없으므로. */
        console.warn('[vc] 오늘 수업 조회 실패', e);
        if (window.__vcStudentGate === 'on' && !/teacher|admin/i.test(String(window.vcMyRole || ''))) {
          alert('수업 정보를 불러오지 못했어요. 📶\n잠시 후 다시 시도하거나, 매니저에게 받은 방 번호를 아래에 입력해 주세요.\n\nCould not load your class. Please retry, or enter the room code you were given.');
          _stopJoin = true;
        }
      }
      if (_stopJoin) return;
    }

    // 🗓️ (2026-07-22) 컴플레인 #4 — 지난 날짜가 박힌 링크(class-…-어제) 재사용 시 빈 방 입장 차단.
    //    room_id 에 날짜가 포함되므로 어제 링크로 들어오면 아무도 없는 방에서 기다리게 된다.
    //    오늘 날짜가 아니면 '오늘 내 수업' 자동 해석으로 넘긴다.
    {
      var _staleM = /^class-\d+-(\d{8})$/.exec(vcTypedRoom || '');
      if (_staleM) {
        var _kk = new Date(Date.now() + 9 * 3600 * 1000);
        var _p2 = function (n) { return (n < 10 ? '0' : '') + n; };
        var _tymd = '' + _kk.getUTCFullYear() + _p2(_kk.getUTCMonth() + 1) + _p2(_kk.getUTCDate());
        if (_staleM[1] !== _tymd) {
          alert('⚠️ 이 수업 링크는 지난 날짜의 링크예요.\n오늘 예약된 수업으로 다시 연결할게요.');
          if (roomCodeEl) roomCodeEl.value = '';
          if (typeof vcJoinMyClass === 'function') { vcJoinMyClass(); return; }
          return;
        }
      }
    }

    vcRoomId = vcTypedRoom || VC_DEFAULT_ROOM;

    // 🔒 Phase RM 3단계 — 예약제 방(class-*)에 '남의 방'으로 잘못 들어가는 것 차단.
    //   정상 예약자·담당 교사·관리자는 통과, 예약 없음/신원 불명이면 통과(fail-open) → 정상수업 방해 금지.
    if (/^class-\d+-\d{8}$/.test(vcRoomId)) {
      try {
        var _vu = (window.getCurrentUser ? window.getCurrentUser() : null);
        var _vrole = (window.vcMyRole || (_vu && _vu.role) || 'student');
        var _vq = 'room_id=' + encodeURIComponent(vcRoomId) + '&role=' + encodeURIComponent(_vrole);
        if (_vu && _vu.uid) _vq += '&user_id=' + encodeURIComponent(_vu.uid);
        if (vcUsername) _vq += '&student_name=' + encodeURIComponent(vcUsername);
        var _vres = await fetch('/api/class/verify-room?' + _vq, { credentials: 'include' }).then(function (x) { return x.json(); }).catch(function () { return null; });

        /* 🎭 (2026-08-08 강사 피드백 Teacher Ana ① 「먼저 들어온 학생이 강사 역할을 받는다」)
           ─────────────────────────────────────────────────────────────────────────────
           여기까지의 역할 판정은 전부 «이 브라우저가 기억하는 것» 이다. 그 기억이 남의 것이면
           (공용 PC 에 강사가 다녀간 뒤) 학생이 강사로 입장하고, 서버 로스터에도 그렇게 박힌다.
           이 게이트는 이미 예약(class_schedules)을 읽어 «이 사람이 학생인지 교사인지» 를 안다.
           그 답을 여기서 쓴다 — 서버가 «학생» 이라고 확인해 주면 브라우저 기억보다 그쪽이 옳다.

           🔑 «내리는» 데만 쓴다. 올리는 데 쓰면 이름 매칭이 한 번 어긋난 것으로 학생이 강사가 되어
              지금 고치는 사고를 반대 방향으로 다시 만든다(서버도 그래서 teacher 는 null 로 둔다).
           🔑 입장은 막지 않는다 — 이 게이트의 1원칙(수업 방해 금지)은 그대로다. 역할만 바로잡는다.
           ⚠️ 참관(observer)만 privileged 로 먼저 빠진다. 관리자는 2026-08-26 부터 받는다. */
        try {
          if (_vres && _vres.resolved_role === 'student' &&
              (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin')) {
            console.warn('[vc-role] 서버 확인 결과 이 예약의 «학생» → 강사 주장 취소 (이전 값: ' + window.vcMyRole + ')');
            window.vcMyRole = 'student';
            if (typeof window.vcRoleRemember === 'function') window.vcRoleRemember('student');
            var _dmEn = false;
            try { _dmEn = (localStorage.getItem('mangoi_lang') || '') === 'en'; } catch (e2) {}
            if (typeof mangoToast === 'function') {
              mangoToast(_dmEn ? 'Joining as a student for this class.' : '이 수업에는 학생으로 입장합니다.');
            }
          }
        } catch (e3) {}
        /* 🌐 (2026-07-28 실사고) 안내 문구를 역할별로 나누고 한/영 병기.
           [문제] 차단 문구가 학생 전제로만 쓰여 있어 "🎓 오늘 내 수업 바로 입장 버튼으로 들어가세요" 라고
                  안내했는데, 그 버튼은 학생 화면에만 있고 강사 화면에는 없다 → 없는 버튼을 찾게 만들었다.
                  게다가 한국어 전용이라 외국인 강사는 브라우저 번역을 켜야 읽을 수 있었다(강사 다수가 외국인). */
        var _vEn = false;
        try { _vEn = (localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang')) === 'en'; } catch (e) {}
        /* role 표기가 경로마다 다르다 — 마이페이지 입장 버튼은 'teacher', 홈 통합로그인 폴백은 'hq_teacher'.
           정확일치로 보면 새 경로에서 강사가 학생용 안내(없는 버튼)를 보게 된다. */
        var _vIsTeacher = /teacher/.test(String(_vrole)) || _vrole === 'admin';
        /* 🔒 (2026-07-28) 담당 지정이 어긋난 강사는 '막지 않고 알리기만' 한다 — 수업 방해 금지 원칙.
           서버가 authorized:'unknown' + reason:'teacher_not_assigned' 로 돌려준다. */
        if (_vres && _vres.reason === 'teacher_not_assigned') {
          alert(_vEn
            ? ('⚠️ This class is booked under ' + (_vres.owner_name || 'another student')
               + ', and you are not listed as its assigned teacher.\nYou can still enter now — the class will not be blocked.\nPlease ask the office to link your account to this booking.')
            : ('⚠️ 이 수업은 ' + (_vres.owner_name || '다른 학생') + '님 예약인데, 담당 강사로 등록돼 있지 않아요.\n'
               + '그래도 지금 바로 입장할 수 있어요 — 수업은 막지 않습니다.\n수업 후 관리자에게 담당 강사 연결을 요청해 주세요.'));
          /* 막지 않고 계속 진행 */
        } else if (_vres && _vres.authorized === false) {
          if (_vIsTeacher) {
            alert(_vEn
              ? ('⚠️ This room belongs to ' + (_vres.owner_name || 'another student') + "'s booked class.\n"
                 + 'Open "🎥 Enter Class" on your My Page, or type the room code you were given.')
              : ('⚠️ 이 방은 ' + (_vres.owner_name || '다른 학생') + '님의 예약 수업이에요.\n'
                 + '마이페이지의 "🎥 수업 입장" 을 누르시거나, 전달받은 방 번호를 직접 입력해 주세요.'));
          } else {
            alert(_vEn
              ? ('⚠️ This room belongs to ' + (_vres.owner_name || 'another student') + "'s booked class.\n"
                 + 'Please use the "🎓 Enter My Class Now" button to join your own class.')
              : ('⚠️ 이 방은 ' + (_vres.owner_name || '다른 학생') + '님의 예약 수업이에요.\n'
                 + '회원님 수업은 "🎓 오늘 내 수업 바로 입장" 버튼으로 들어가 주세요.'));
          }
          return;
        }
      } catch (e) { /* 검증 실패 시 통과(정상 수업 방해 금지) */ }
    }


    // 🔒 자동저장 처리 — 체크 상태에 따라 저장/제거
    try {
      const ckSave = document.getElementById('vc-save-id');
      const ckAuto = document.getElementById('vc-auto-login');
      if (ckSave && ckSave.checked) {
        localStorage.setItem(VC_AUTH_KEYS.saveId, '1');
        localStorage.setItem(VC_AUTH_KEYS.uid, vcUsername);
        // 방번호도 함께 저장 (편의)
        try { localStorage.setItem('mangoi_vc_roomcode', vcRoomId); } catch{}
      }
      if (ckAuto && ckAuto.checked) {
        localStorage.setItem(VC_AUTH_KEYS.autoLogin, '1');
        localStorage.setItem(VC_AUTH_KEYS.pw, vcPassword);
      }
    } catch {}

    showView('view-videocall-call');
    document.body.classList.add('vc-in-call');
    try{ window.vcApplyLiteDefault && window.vcApplyLiteDefault(); }catch(e){}   // ⚡ 수업 입장 = 가벼운 모드 기본
    document.getElementById('vc-room-name').textContent = vcRoomId;
    // 🖥 (2026-07-23) 수업에 들어오면 전체화면 — 설정에서 껐으면 건너뛴다.
    //    브라우저가 사용자 조작 없는 요청을 막으면, 다음 터치 때 한 번 더 시도한다.
    try { window.vcGoFullscreen && window.vcGoFullscreen(); } catch(e){}
    /* 🔒 (2026-07-28, 2026-08-24 학생 추가) 오늘 예약이 없어 '공용 연습방'으로 들어온 사람에게 알린다 —
       "내 방에 다른 선생님이 들어왔다"(Shas·Kaye)의 실제 이유가 이것이다. 학생 쪽은 더 심각하다 —
       실수로 이 방에서 «수업처럼» 진행하면 다른 학생·강사와 뒤섞인다. 값은 'teacher'|'student'.
       ※ 이 블록은 위 전체화면 호출보다 뒤에 둔다 — 하니스가 'vc-in-call 추가 → 전체화면 호출'
         인접(400자)을 검사하므로, 사이에 코드를 넣으면 그 보장이 깨진다. */
    try {
      if (window.__vcSharedRoomNotice) {
        var _sharedWho = window.__vcSharedRoomNotice;
        window.__vcSharedRoomNotice = false;
        var _en0 = (typeof getLang === 'function' && getLang() === 'en');
        var _nm = document.getElementById('vc-room-name');
        if (_nm && _nm.parentNode) {
          var _tag = document.createElement('span');
          _tag.textContent = _en0 ? '  (shared practice room - others may join)' : '  (공용 연습방 · 다른 사람도 들어올 수 있어요)';
          _tag.style.cssText = 'font-size:11.5px;font-weight:700;color:#fbbf24;margin-left:6px';
          _nm.parentNode.insertBefore(_tag, _nm.nextSibling);
        }
        setTimeout(function(){
          if (_sharedWho === 'student') {
            alert(_en0
              ? "You don't have a class booked for today, so you entered a SHARED practice room — not your real classroom.\n\nOther students/teachers may also be here. Please don't start a lesson here. Check the home screen for your class days/times, and use \"Enter My Class\" when it's actually time."
              : '오늘 예약된 수업이 없어서, 실제 수업방이 아닌 "공용 연습방"으로 들어왔어요.\n\n다른 학생·강사도 이 방에 있을 수 있어요. 여기서 수업을 진행하지 마세요.\n홈 화면에서 내 수업 요일·시간을 확인하고, 수업 시간이 되면 "오늘 내 수업 바로 입장"을 이용해 주세요.');
          } else {
            alert(_en0
              ? 'You have no class booked for today, so you entered the shared practice room.\n\nOther teachers can also enter this room. For a real class, enter from your booked class - then you get your own room.'
              : '오늘 예약된 수업이 없어 공용 연습방으로 들어왔어요.\n\n이 방에는 다른 선생님도 들어올 수 있습니다.\n실제 수업은 예약된 수업으로 입장하시면 선생님만의 방으로 들어갑니다.');
          }
        }, 900);
      }
    } catch(e){}
    try { if (window.mangoiClassEntryNotice) setTimeout(window.mangoiClassEntryNotice, 600); } catch(e){}
    /* 🔒 (2026-08-07) 역할이 정해졌으니 강사 전용 칩을 여기서 «반드시» 한 번 그린다.
       예전엔 vcEnterResolvedRoom·?vc_role= 두 경로에서만 불렀다 = 로비 입장 강사는 영영 못 봤다.
       칩은 정적 HTML 이라 DOM 생성 대기가 필요 없지만, 다른 스크립트가 늦게 로드되는 경우가
       있어 짧은 재시도 2번만 둔다(타이머 상주 없음 = 수업 중 부하 0). */
    try {
      var _chipTick = function(){ try { if (typeof vcClassLockChipsRender === 'function') vcClassLockChipsRender(); } catch(_){} };
      _chipTick(); setTimeout(_chipTick, 900); setTimeout(_chipTick, 3000);
    } catch(e){}
    requestWakeLock(); // 화면 꺼짐 방지 활성화

    // 📱 모바일에서 가로 모드 자동 시도 (지원 시) — 사용자 제스처 직후라 가능
    try {
      const isMobile = window.matchMedia('(max-width: 920px)').matches;
      if (isMobile && screen.orientation && typeof screen.orientation.lock === 'function') {
        // Fullscreen + Lock 조합 (안 되면 silently 실패)
        const el = document.documentElement;
        const fsP = (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen)
          ? (el.requestFullscreen ? el.requestFullscreen() : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : el.mozRequestFullScreen()))
          : Promise.resolve();
        Promise.resolve(fsP).then(() => {
          try { screen.orientation.lock('landscape').catch(() => {}); } catch(e){}
        }).catch(() => {});
      }
      // 모바일 가로모드일 때 하단 액션 바 + 그립 핸들 표시
      function _vcUpdateBottomBar(){
        const bar = document.getElementById('vc-bottom-actions');
        const grip = document.getElementById('vc-bottom-grip');
        if (!bar) return;
        const isMobile = window.matchMedia('(max-width: 920px)').matches;
        const isLandscape = window.matchMedia('(orientation: landscape)').matches;
        const active = isMobile && isLandscape && document.body.classList.contains('vc-in-call');
        bar.style.display = active ? 'flex' : 'none';
        if (grip) grip.style.display = active ? 'flex' : 'none';
      }
      _vcUpdateBottomBar();
      window.addEventListener('resize', _vcUpdateBottomBar);
      window.addEventListener('orientationchange', _vcUpdateBottomBar);

      // ════════════════════════════════════════════════
      // 🎬 하단 액션바 — 자동 숨김 + 손가락 스와이프 토글
      //   1) 입장 직후 3초 노출 → 자동 슬라이드 다운
      //   2) 그립 핸들 위로 살짝 밀면 슬라이드 업
      //   3) 액션바 빈 공간 또는 그립 아래로 스와이프 → 다시 슬라이드 다운
      //   4) 액션바 보일 때 8초 동안 조작 없으면 자동 숨김
      // ════════════════════════════════════════════════
      let _vcAutoHideTimer = null;
      window.vcBottomActionsToggle = function(forceShow){
        const bar = document.getElementById('vc-bottom-actions');
        if (!bar) return;
        const shouldShow = (typeof forceShow === 'boolean') ? forceShow : !bar.classList.contains('show');
        bar.classList.toggle('show', shouldShow);
        document.body.classList.toggle('vc-actions-open', shouldShow);
        clearTimeout(_vcAutoHideTimer);
        if (shouldShow) {
          // 8초 동안 아무 조작 없으면 자동 숨김
          _vcAutoHideTimer = setTimeout(() => {
            bar.classList.remove('show');
            document.body.classList.remove('vc-actions-open');
          }, 8000);
        }
      };
      // 액션바 버튼 누르면 자동 숨김 타이머 리셋
      const _barEl = document.getElementById('vc-bottom-actions');
      if (_barEl) {
        _barEl.addEventListener('click', () => {
          if (_barEl.classList.contains('show')) vcBottomActionsToggle(true);
        });
      }
      // 입장 직후 3초만 노출 → 자동 숨김
      setTimeout(() => { vcBottomActionsToggle(true); }, 200);
      setTimeout(() => { vcBottomActionsToggle(false); }, 3500);

      // 🤚 그립 핸들 스와이프 처리
      const _grip = document.getElementById('vc-bottom-grip');
      if (_grip) {
        let gripStartY = 0, gripDeltaY = 0;
        _grip.addEventListener('touchstart', (e) => {
          gripStartY = e.touches[0].clientY;
          gripDeltaY = 0;
        }, { passive: true });
        _grip.addEventListener('touchmove', (e) => {
          gripDeltaY = e.touches[0].clientY - gripStartY;
        }, { passive: true });
        _grip.addEventListener('touchend', () => {
          if (gripDeltaY < -20) vcBottomActionsToggle(true);   // 위로 ↑
          else if (gripDeltaY > 20) vcBottomActionsToggle(false); // 아래로 ↓
          else vcBottomActionsToggle();                          // 짧은 탭 → 토글
        });
      }
      // 액션바를 아래로 스와이프하면 숨김
      if (_barEl) {
        let barStartY = 0;
        _barEl.addEventListener('touchstart', (e) => {
          barStartY = e.touches[0].clientY;
        }, { passive: true });
        _barEl.addEventListener('touchend', (e) => {
          const dy = (e.changedTouches[0]?.clientY || 0) - barStartY;
          if (dy > 30) vcBottomActionsToggle(false);
        });
      }
    } catch(e){}

    // 📱 모바일 가로모드 액션 헬퍼들 (안전한 폴백 — 기존 함수가 있으면 그것을 호출)
    window.vcMobileTabSwitch = window.vcMobileTabSwitch || function(name){
      // 기존 탭 시스템 검색해서 클릭 시뮬레이트
      const map = { whiteboard:'칠판', material:'교재', video:'동영상', pronunciation:'발음연습', game:'학생게임', bg:'배경화면', warmup:'AI 웜업' };
      const ko = map[name] || name;
      const tabs = document.querySelectorAll('.tab-bar > *, .vc-tab, [data-tab]');
      for (const t of tabs) {
        if ((t.textContent || '').includes(ko)) { try { t.click(); } catch(e){} return; }
      }
    };
    window.vcMobileToggleMic = function(){
      // 실제 헤더의 마이크 토글 호출
      if (typeof vcToggleMic === 'function') { try { vcToggleMic(); return; } catch(e){} }
      const btn = document.getElementById('vc-btn-mic') || document.querySelector('[onclick*="vcToggleMic"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcMobileToggleCam = function(){
      if (typeof vcToggleCam === 'function') { try { vcToggleCam(); return; } catch(e){} }
      const btn = document.getElementById('vc-btn-cam') || document.querySelector('[onclick*="vcToggleCam"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcMobileToggleChat = function(){
      if (typeof vcToggleChat === 'function') { try { vcToggleChat(); return; } catch(e){} }
      const btn = document.getElementById('vc-btn-chat') || document.querySelector('[onclick*="vcToggleChat"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcMobileDiagnoseMic = function(){
      if (typeof vcDiagnoseMic === 'function') { try { vcDiagnoseMic(); return; } catch(e){} }
      const btn = document.querySelector('[onclick*="vcDiagnoseMic"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcMobileScreenshot = function(){
      const btn = document.querySelector('[onclick*="screenshot"], [onclick*="capture"], #vc-screenshot-btn');
      if (btn) try { btn.click(); } catch(e){}
      else if (typeof wbSave === 'function') try { wbSave(); } catch(e){}
    };

    // 📤 교재 폴더용 헬퍼들 — 모두 기존 함수에 위임 (안전한 폴백 포함)
    window.vcMobileUploadPDF = function(){
      // PDF 탭으로 먼저 전환한 뒤 file input 클릭
      if (typeof vcSwitchTab === 'function') try { vcSwitchTab('pdf'); } catch(e){}
      setTimeout(() => {
        const el = document.getElementById('pdf-upload');
        if (el) el.click();
        else alert('교재 업로드 버튼을 찾지 못했습니다');
      }, 120);
    };
    window.vcMobileOpenLibrary = function(){
      if (typeof openTextbookLibrary === 'function') try { openTextbookLibrary(); return; } catch(e){}
      const btn = document.querySelector('[onclick*="openTextbookLibrary"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcMobileTabSwitch = function(name){
      // 🎯 집중 모드 — 학생 탭 이탈 차단 (모바일 경로)
      if (window.__vcFocusLockedByTeacher && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin') {
        try { if (typeof showToast === 'function') showToast((localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang')) === 'en' ? '🎯 Focus mode — follow your teacher' : '🎯 집중 모드예요 — 선생님 화면을 따라가요'); } catch(e){}
        return;
      }
      if (typeof vcSwitchTab === 'function') try { vcSwitchTab(name); } catch(e){}
    };
    window.vcMobilePdfPrev = function(){
      if (typeof pdfPrevPage === 'function') try { pdfPrevPage(); } catch(e){}
    };
    window.vcMobilePdfNext = function(){
      if (typeof pdfNextPage === 'function') try { pdfNextPage(); } catch(e){}
    };
    window.vcMobilePdfZoomIn = function(){
      if (typeof pdfZoomIn === 'function') try { pdfZoomIn(); } catch(e){}
    };
    window.vcMobilePdfZoomOut = function(){
      if (typeof pdfZoomOut === 'function') try { pdfZoomOut(); } catch(e){}
    };
    window.vcMobilePdfZoomReset = function(){
      if (typeof pdfZoomReset === 'function') try { pdfZoomReset(); } catch(e){}
    };
    window.vcMobilePdfTwoPage = function(){
      if (typeof pdfSetPagesPerView === 'function') try { pdfSetPagesPerView(2, null); } catch(e){}
    };
    window.vcMobilePdfClearAnno = function(){
      if (typeof pdfClearAnno === 'function') try { pdfClearAnno(); } catch(e){}
    };
    window.vcMobilePdfStopShare = function(){
      if (typeof pdfStopShare === 'function') try { pdfStopShare(); } catch(e){}
    };

    // 🤚 PDF/칠판 터치 드래그 — 모든 모바일 환경에서 손가락 한 손가락으로 상하/좌우 이동
    (function setupPdfTouchPan(){
      const setup = () => {
        const wrap = document.getElementById('pdf-scroll-wrap');
        if (!wrap || wrap.dataset.touchPanReady === '1') return;
        wrap.dataset.touchPanReady = '1';
        let startX = 0, startY = 0, scrollX = 0, scrollY = 0, dragging = false;
        wrap.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) return;
          // 그리기 모드면 패스 (펜으로 그리는 중)
          const annoActive = document.querySelector('.pdf-anno.active');
          if (annoActive) return;
          const t = e.touches[0];
          startX = t.clientX; startY = t.clientY;
          scrollX = wrap.scrollLeft; scrollY = wrap.scrollTop;
          dragging = true;
          wrap.classList.add('dragging');
        }, { passive: true });
        wrap.addEventListener('touchmove', (e) => {
          if (!dragging || e.touches.length !== 1) return;
          const t = e.touches[0];
          wrap.scrollLeft = scrollX - (t.clientX - startX);
          wrap.scrollTop  = scrollY - (t.clientY - startY);
        }, { passive: true });
        const end = () => { dragging = false; wrap.classList.remove('dragging'); };
        wrap.addEventListener('touchend', end);
        wrap.addEventListener('touchcancel', end);

        // 마우스 드래그도 동일하게 지원 (태블릿/노트북 터치패드)
        let mDown = false;
        wrap.addEventListener('mousedown', (e) => {
          const annoActive = document.querySelector('.pdf-anno.active');
          if (annoActive) return;
          mDown = true; startX = e.clientX; startY = e.clientY;
          scrollX = wrap.scrollLeft; scrollY = wrap.scrollTop;
          wrap.classList.add('dragging');
        });
        wrap.addEventListener('mousemove', (e) => {
          if (!mDown) return;
          wrap.scrollLeft = scrollX - (e.clientX - startX);
          wrap.scrollTop  = scrollY - (e.clientY - startY);
        });
        const mEnd = () => { mDown = false; wrap.classList.remove('dragging'); };
        wrap.addEventListener('mouseup', mEnd);
        wrap.addEventListener('mouseleave', mEnd);

        // 좌우 스와이프 → 페이지 넘김 (수평 이동이 크고 스크롤이 가장자리일 때만)
        let swStartX = 0, swStartY = 0, swStartTime = 0;
        wrap.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) return;
          swStartX = e.touches[0].clientX;
          swStartY = e.touches[0].clientY;
          swStartTime = Date.now();
        }, { passive: true });
        wrap.addEventListener('touchend', (e) => {
          if (!e.changedTouches.length) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - swStartX;
          const dy = t.clientY - swStartY;
          const dt = Date.now() - swStartTime;
          if (dt > 500) return; // 천천히 드래그한 건 페이지 넘김 아님
          if (Math.abs(dx) < 100 || Math.abs(dx) < Math.abs(dy) * 2) return;
          const atLeftEdge = wrap.scrollLeft <= 1;
          const atRightEdge = wrap.scrollLeft >= (wrap.scrollWidth - wrap.clientWidth - 1);
          if (dx > 100 && atLeftEdge && typeof pdfPrevPage === 'function') {
            try { pdfPrevPage(); } catch(e){}
          } else if (dx < -100 && atRightEdge && typeof pdfNextPage === 'function') {
            try { pdfNextPage(); } catch(e){}
          }
        });
        // ph260: 📏 Pinch-to-zoom + 더블탭 reset
        let pinchStartDist = 0;
        let pinchStartZoom = 1;
        let pinching = false;
        function dist(t1, t2){
          var dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
          return Math.sqrt(dx*dx + dy*dy);
        }
        wrap.addEventListener('touchstart', function(e){
          if (e.touches.length === 2) {
            pinching = true;
            pinchStartDist = dist(e.touches[0], e.touches[1]);
            pinchStartZoom = (typeof window.pdfGetZoom === 'function') ? window.pdfGetZoom() : 1;
            dragging = false;
          }
        }, { passive: true });
        wrap.addEventListener('touchmove', function(e){
          if (!pinching || e.touches.length !== 2) return;
          e.preventDefault();
          var d = dist(e.touches[0], e.touches[1]);
          var ratio = d / (pinchStartDist || 1);
          var newZoom = pinchStartZoom * ratio;
          if (newZoom < 0.05) newZoom = 0.05;
          if (newZoom > 5) newZoom = 5;
          if (typeof window._pinchRaf !== 'undefined') cancelAnimationFrame(window._pinchRaf);
          window._pinchRaf = requestAnimationFrame(function(){
            if (typeof window.pdfSetZoom === 'function') window.pdfSetZoom(newZoom);   // 렌더까지 함께
            else if (typeof window.pdfRender === 'function') window.pdfRender();
          });
        }, { passive: false });
        wrap.addEventListener('touchend', function(e){
          if (pinching && e.touches.length < 2) {
            pinching = false;
            console.log('[ph260] pinch end — zoom=' + Math.round(((window.pdfGetZoom && window.pdfGetZoom())||1)*100) + '%');
          }
        });

        // 더블탭 → 100% reset (pinch zoom 후 빠르게 원상복구)
        var lastTap = 0;
        wrap.addEventListener('touchend', function(e){
          if (e.changedTouches.length !== 1) return;
          var now = Date.now();
          if (now - lastTap < 300) {
            // 더블탭 감지
            if (typeof window.pdfSetZoom === 'function') window.pdfSetZoom(1);
            else if (typeof window.pdfRender === 'function') window.pdfRender();
            console.log('[ph260] 더블탭 → zoom 100% reset');
            lastTap = 0;
            e.preventDefault && e.preventDefault();
          } else {
            lastTap = now;
          }
        });

        console.log('[vc] PDF touch pan + swipe + ph260 pinch zoom ready');
      };
      // DOM 이 아직 안 만들어졌을 수 있어 약간 지연
      setTimeout(setup, 300);
      setTimeout(setup, 1500);
      setTimeout(setup, 3000);
    })();
    window.vcMobileToggleMore = function(){
      const m = document.getElementById('vc-more-menu');
      if (m) m.classList.toggle('show');
    };
    // 바깥 클릭 시 더보기 메뉴 닫기
    document.addEventListener('click', (e) => {
      const m = document.getElementById('vc-more-menu');
      if (!m || !m.classList.contains('show')) return;
      if (m.contains(e.target)) return;
      if (e.target.closest('[onclick*="vcMobileToggleMore"]')) return;
      m.classList.remove('show');
    });

    // ════════════════════════════════════════════════════
    // 📂 모바일 가로모드 폴더 시스템 — 5개 큰 폴더 + 펼침 시트
    // ════════════════════════════════════════════════════
    const VC_FOLDERS = {
      write: {
        title: '✏️ 필기도구 (칠판)',
        items: [
          { icon:'✏️', label:'펜', onclick:`vcCanvasTool('pen')` },
          { icon:'🧽', label:'지우개', onclick:`vcCanvasTool('eraser')` },
          { icon:'📏', label:'선', onclick:`vcCanvasTool('line')` },
          { icon:'⬜', label:'사각형', onclick:`vcCanvasTool('rect')` },
          { icon:'⭕', label:'원', onclick:`vcCanvasTool('circle')` },
          { icon:'🔴', label:'빨강', onclick:`vcCanvasColor('#ef4444')` },
          { icon:'🟢', label:'초록', onclick:`vcCanvasColor('#10b981')` },
          { icon:'🔵', label:'파랑', onclick:`vcCanvasColor('#3b82f6')` },
          { icon:'⚫', label:'검정', onclick:`vcCanvasColor('#000000')` },
          { icon:'🟡', label:'노랑', onclick:`vcCanvasColor('#fbbf24')` },
          { icon:'🗑', label:'전체 지우기', onclick:`vcCanvasClear()` },
          { icon:'💾', label:'저장', onclick:`vcCanvasSave()` },
        ],
      },
      material: {
        title: '📄 교재',
        items: [
          { icon:'📤', label:'교재 업로드', onclick:`vcMobileUploadPDF()` },
          { icon:'📚', label:'라이브러리', onclick:`vcMobileOpenLibrary()` },
          { icon:'📄', label:'교재 열기', onclick:`vcMobileTabSwitch('pdf')` },
          { icon:'◀ ', label:'이전 페이지', onclick:`vcMobilePdfPrev()` },
          { icon:'▶ ', label:'다음 페이지', onclick:`vcMobilePdfNext()` },
          { icon:'🔍+', label:'확대', onclick:`vcMobilePdfZoomIn()` },
          { icon:'🔍−', label:'축소', onclick:`vcMobilePdfZoomOut()` },
          { icon:'1:1', label:'원래 크기', onclick:`vcMobilePdfZoomReset()` },
          { icon:'📑', label:'2페이지 보기', onclick:`vcMobilePdfTwoPage()` },
          { icon:'🗑', label:'주석 지우기', onclick:`vcMobilePdfClearAnno()` },
          { icon:'❌', label:'공유 중지', onclick:`vcMobilePdfStopShare()` },
          { icon:'📷', label:'화면 캡처', onclick:`vcMobileScreenshot()` },
        ],
      },
      learn: {
        title: '📚 학습도구',
        items: [
          { icon:'🎬', label:'동영상', onclick:`vcMobileTabSwitch('video')` },
          { icon:'🎲', label:'학생게임', onclick:`vcMobileTabSwitch('game')` },
          { icon:'🎨', label:'배경화면', onclick:`vcMobileTabSwitch('bg')` },
          { icon:'🗣️', label:'AI 웜업', onclick:`vcMobileTabSwitch('warmup')` },
          { icon:'📝', label:'칠판', onclick:`vcMobileTabSwitch('whiteboard')` },
        ],
      },
      // 채팅·음성 폴더 삭제 — 동일 기능이 상단 헤더에 있어 중복

      screen: {
        title: '🖥️ 화면 공유 · 화면 분할',
        items: [
          /* 🖥 (2026-08-07 Kaye 5번) "화면 공유 버튼이 또 사라졌다"
             [실제] 하단 독의 [화면공유] 버튼은 이 시트를 여는데, 시트 안엔 «화면 분할»밖에
                    없었다. 진짜 화면 공유(getDisplayMedia)는 상단 탭바 칩에만 있었고 그 칩은
                    역할 미확정으로 숨어 있었다 → 강사 입장에선 «없어진» 것이 맞다.
             누르는 자리에 진짜 기능을 둔다. 학생이 눌러도 vcShareMyScreen 이 스스로 막는다. */
          { icon:'🖥️', label:'내 컴퓨터 화면 공유 (Share my screen)', onclick:`vcShareMyScreen()` },
          /* 🖼 이름은 크기바(.vsb-seg)와 **한 벌** — 고치면 아래 toast labels 도 함께.
             📜 왜 이 이름인지: docs/작업기록/260825_얼굴크기컨트롤_그림4칸_2안.md */
          { icon:'🟦', label:'교재 크게 (Material)', onclick:`vcScreenSet('quarter')` },
          { icon:'🟦', label:'기본 (Standard)', onclick:`vcScreenSet('half')` },
          { icon:'🟦', label:'얼굴 크게 (Faces)', onclick:`vcScreenSet('threequarter')` },
          { icon:'👥', label:'모두 보기 (Gallery)', onclick:`vcScreenSet('full')` },
          { icon:'📌', label:'교재 전체 + 작은 얼굴 (PIP)', onclick:`vcScreenSet('pip')` },
          /* ⛔ '솔로'라 부르지 말 것 — ⋯ 메뉴의 vcToggleSolo(='내 얼굴만')와 **반대 동작**이다.
             이쪽은 video-solo 라 얼굴이 통째로 사라지고 교재만 남는다. */
          { icon:'👤', label:'영상 끄고 교재만 (Video off)', onclick:`vcScreenSet('solo')` },
          { icon:'📝', label:'칠판만 크게 (Board only)', onclick:`vcScreenSet('boardonly')` },
          { icon:'📖', label:'교재만 크게 (Book only)', onclick:`vcScreenSet('bookonly')` },
        ],
      },
    };

    window.vcFolderOpen = function(key) {
      const folder = VC_FOLDERS[key];
      if (!folder) return;
      const sheet = document.getElementById('vc-folder-sheet');
      const grid = document.getElementById('vc-folder-grid');
      const title = document.getElementById('vc-folder-title');
      if (!sheet || !grid || !title) return;
      // 토글: 같은 버튼(폴더)이 이미 열려 있으면 다시 누르면 닫힘
      if (sheet.classList.contains('show') && sheet.dataset.folderKey === key) {
        vcFolderClose();
        return;
      }
      sheet.dataset.folderKey = key;
      title.textContent = folder.title;
      grid.innerHTML = folder.items.map(it => `
        <button onclick="${it.onclick};vcFolderClose()">
          <span class="ficon">${it.icon}</span>
          <span>${it.label}</span>
        </button>`).join('');
      sheet.classList.add('show');
    };
    window.vcFolderClose = function() {
      const sheet = document.getElementById('vc-folder-sheet');
      if (sheet) { sheet.classList.remove('show'); sheet.dataset.folderKey = ''; }
    };

    // 폴더 시스템용 헬퍼들 — (2026-06-19) 모바일 칠판 도구가 안 먹던 문제 수정.
    //   기존엔 [onclick*="clear"] 처럼 소문자로 찾아 wbClear()(대문자 C)와 매칭 실패 → 동작 안 함.
    //   이제 전역 함수(wbSetTool/wbClear/wbSave)를 직접 호출하고, 실패 시에만 버튼 클릭으로 폴백.
    window.vcCanvasTool = function(tool){
      // wbSetTool 은 event.target 을 쓰므로 직접 호출 대신 정확한 칠판 버튼을 클릭(이벤트 제공)
      var btn = document.querySelector(`.wb-toolbar button[onclick*="'${tool}'"]`)
             || document.querySelector(`[onclick*="wbSetTool('${tool}')"]`);
      if (btn) { try { btn.click(); return; } catch(e){} }
      try { if (typeof wbSetTool === 'function') wbSetTool(tool); } catch(e){}
    };
    window.vcCanvasColor = function(color){
      const input = document.getElementById('wb-color') || document.querySelector('input[type="color"]');
      if (input) { input.value = color; input.dispatchEvent(new Event('input', {bubbles:true})); }
    };
    window.vcCanvasClear = function(){
      try { if (typeof wbClear === 'function') { wbClear(); return; } } catch(e){}
      const btn = document.querySelector('[onclick*="wbClear"], [onclick*="전체"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    window.vcCanvasSave = function(){
      try { if (typeof wbSave === 'function') { wbSave(); return; } } catch(e){}
      const btn = document.querySelector('[onclick*="wbSave"], [onclick*="저장"]');
      if (btn) try { btn.click(); } catch(e){}
    };
    // 🔧 화면 분할 — 모바일 PIP 모드 6종 + 데스크탑 호환
    window.vcScreenSet = function(mode){
      const row = document.querySelector('.vc-main-row');
      if (!row) {
        console.warn('[vcScreenSet] .vc-main-row not found');
        return;
      }
      // 모든 모드 클래스 초기화
      row.classList.remove('video-quarter','video-half','video-threequarter','video-full','video-pip','video-solo','video-facepip');
      // 새 모드 적용
      if (mode === 'quarter')         row.classList.add('video-quarter');
      else if (mode === 'half')       row.classList.add('video-half');
      else if (mode === 'threequarter') row.classList.add('video-threequarter');
      else if (mode === 'full')       row.classList.add('video-full');
      else if (mode === 'pip')        row.classList.add('video-pip');
      else if (mode === 'facepip')    row.classList.add('video-facepip');
      else if (mode === 'solo')       row.classList.add('video-solo');
      // 🙈 (2026-07-14) 얼굴 화면 숨기기 — 솔로 레이아웃 재활용(내 화면만, 송출은 계속)
      else if (mode === 'hidefaces') {
        row.classList.add('video-solo');
        try { if (typeof vcSetContentCollapsed === 'function') vcSetContentCollapsed(false); } catch(e){}
      }
      // 📝/📖 (2026-07-13 항목6) 칠판만·교재만 — 영상 숨김(솔로 레이아웃 재활용) + 해당 탭으로
      else if (mode === 'boardonly' || mode === 'bookonly') {
        row.classList.add('video-solo');
        try { if (typeof vcSetContentCollapsed === 'function') vcSetContentCollapsed(false); } catch(e){}
        if (mode === 'boardonly') { try { vcSwitchTab('whiteboard'); } catch(e){} }
        else { try { vpOpenTextbook(); } catch(e){} }   // 교재 없으면 내부에서 칠판 폴백
      }
      // 칠판/PDF 캔버스 리사이즈
      setTimeout(() => {
        if (typeof wbResize === 'function') try { wbResize(); } catch(e){}
        if (typeof pdfResize === 'function') try { pdfResize(); } catch(e){}
        if (typeof pdfRenderCurrent === 'function') try { pdfRenderCurrent(); } catch(e){}
        // 🖼 (2026-07-14) 화면 모드 전환 직후 일시정지된 원격 영상 즉시 재생 재시도
        //   ("화면 이동하면 영상이 나왔다 안 나왔다" 대책 — 5초 감시를 기다리지 않음)
        if (typeof vcResumeAllVideos === 'function') try { vcResumeAllVideos(); } catch(e){}
      }, 280);
      // 🙉 (2026-08-12 마이마이 ⑩) 얼굴이 사라지는 모드는 hidefaces 만이 아니다 —
      //    솔로·칠판만·교재만도 video-solo 로 얼굴을 통째로 숨긴다. 예전 코드는 이 세 모드에서
      //    복귀 칩까지 꺼 버려서, 되돌리는 길이 «화면분할 시트를 다시 여는 것» 뿐이었다.
      //    얼굴이 안 보이는 모드에서는 칩을 띄우고, 보이는 모드로 바뀌면 숨긴다.
      try {
        const facesGone = (mode === 'hidefaces' || mode === 'solo' || mode === 'boardonly' || mode === 'bookonly');
        if (!facesGone) {
          window.__vcFacesHidden = false;   // 얼굴이 보이는 모드로 바뀌면 숨김 상태 해제
          const chip = document.getElementById('vc-faces-restore');
          if (chip) chip.style.display = 'none';
        } else if (mode !== 'hidefaces' && typeof window.vcFacesEnsureRestoreChip === 'function') {
          // hidefaces 는 vcFacesHide() 가 칩을 직접 띄운다 — 중복 호출 방지
          window.vcFacesEnsureRestoreChip();
        }
      } catch(e){}
      // 사용자 피드백 토스트
      // ⚠️ 위 VC_FOLDERS.screen 의 label 과 **같은 말**이어야 한다.
      const labels = { quarter:'교재 크게', half:'기본', threequarter:'얼굴 크게', full:'모두 보기', pip:'교재 전체 + 작은 얼굴', facepip:'얼굴 전체 + 작은 교재', solo:'영상 끄고 교재만', boardonly:'칠판만 크게', bookonly:'교재만 크게', hidefaces:'얼굴 숨김 (수업은 계속 참여 중)' };
      try {
        const t = document.createElement('div');
        t.textContent = '🖥️ 화면 모드: ' + (labels[mode] || mode);
        t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.92);color:#fff;padding:8px 16px;border-radius:20px;z-index:9999;font-size:13px;border:1px solid rgba(99,102,241,0.5);';
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 1800);
      } catch(e){}
      console.log('[vcScreenSet] applied mode:', mode);
    };

    // 🙈/🙉 (2026-07-14 사장님 지시) 얼굴 화면 숨기기·다시 보기
    //   - 내 타일 🙈 버튼 → 얼굴 영역 전체 숨김(video-solo 재활용), 칠판·동영상·학생게임이 전체 차지
    //   - 내 화면에서만 숨김 — 카메라 송출은 계속되므로 상대(교사/학생)는 그대로 봄
    //   - 숨김 동안 우상단 🙉 복귀 칩 표시 → 누르면 이전 화면 모드로 복귀
    window.vcFacesHide = function(){
      const row = document.querySelector('.vc-main-row');
      if (!row) return;
      // 복귀용: 현재 화면 모드 기억
      const modeMap = { 'video-quarter':'quarter', 'video-half':'half', 'video-threequarter':'threequarter', 'video-full':'full', 'video-pip':'pip', 'video-facepip':'facepip' };
      window.__vcFacesPrevMode = null;
      for (const cls in modeMap) {
        if (row.classList.contains(cls)) { window.__vcFacesPrevMode = modeMap[cls]; break; }
      }
      vcScreenSet('hidefaces');
      window.__vcFacesHidden = true;   // 세로폰 자동 레이아웃(공유 재평가 포함)이 되돌리지 못하게 표시
      vcFacesEnsureRestoreChip();
    };
    /* 🙂✕ 복귀 칩 생성·표시 — (2026-08-12 마이마이 ⑩) vcFacesHide 전용이던 것을 분리.
       화면분할의 솔로·칠판만·교재만도 얼굴을 통째로 숨기는데(video-solo 재활용)
       거기엔 복귀 버튼이 하나도 없어서 「비디오가 사라졌는데 되살리는 게 안 보인다」
       신고가 왔다. 얼굴이 사라지는 모든 모드가 이 칩을 공유한다. */
    window.vcFacesEnsureRestoreChip = function(){
      let chip = document.getElementById('vc-faces-restore');
      if (!chip) {
        chip = document.createElement('button');
        chip.id = 'vc-faces-restore';
        chip.type = 'button';
        chip.addEventListener('click', function(){ try { vcFacesShow(); } catch(e){} });
        document.body.appendChild(chip);
      }
      const en = (typeof getLang === 'function') ? (getLang() === 'en')
               : miIsEn();
      chip.innerHTML = '<span class="fr-face">🙂</span><span class="fr-x">✕</span>';
      /* 🌐 툴팁도 언어를 따라오게 두 벌로 남긴다 (얼굴을 숨긴 동안 계속 떠 있는 칩이라 굳으면 눈에 띈다) */
      chip.setAttribute('data-ko-title', '얼굴 화면 꺼짐 — 누르면 다시 보여요');
      chip.setAttribute('data-en-title', 'Faces hidden — tap to show again');
      chip.title = en ? 'Faces hidden — tap to show again' : '얼굴 화면 꺼짐 — 누르면 다시 보여요';
      chip.setAttribute('aria-label', chip.title);
      chip.style.display = 'flex';
    };
    window.vcFacesShow = function(){
      window.__vcFacesHidden = false;
      const chip = document.getElementById('vc-faces-restore');
      if (chip) chip.style.display = 'none';
      const prev = window.__vcFacesPrevMode;
      window.__vcFacesPrevMode = null;
      if (prev) { vcScreenSet(prev); return; }
      // 기억된 모드가 없으면(입장 기본 레이아웃이었으면) solo 클래스만 해제해 원래대로
      const row = document.querySelector('.vc-main-row');
      if (row) row.classList.remove('video-solo');
      setTimeout(() => {
        if (typeof wbResize === 'function') try { wbResize(); } catch(e){}
        if (typeof pdfResize === 'function') try { pdfResize(); } catch(e){}
        if (typeof vcResumeAllVideos === 'function') try { vcResumeAllVideos(); } catch(e){}
      }, 280);
    };

    // ESC 키로 폴더 시트 닫기
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const sheet = document.getElementById('vc-folder-sheet');
        if (sheet && sheet.classList.contains('show')) vcFolderClose();
      }
    });

    // 🔐 Phase RT-3 — 백그라운드에서 JWT 토큰 자동 발급 (실패해도 화상수업은 정상 작동)
    //   - 발급된 토큰은 sessionStorage 에 저장 → 시그널링 연결 시 자동 사용 (RT-4 활성화 시)
    //   - 403(not_invited) 오면 allow_open=true 폴백으로 재시도 (기존 화상수업 호환)
    (async function _rt3_silentJoin() {
      try {
        if (!window._rtTokenStore) window._rtTokenStore = {};
        const body = { user_id: vcUsername, role: 'student', allow_open: true };
        const r = await fetch('/api/rooms/' + encodeURIComponent(vcRoomId) + '/join', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const d = await r.json().catch(() => ({}));
        if (d && d.ok && d.room_token) {
          window._rtTokenStore[vcRoomId] = d.room_token;
          try { sessionStorage.setItem('mangoi_room_token_' + vcRoomId, d.room_token); } catch(e){}
          console.log('[RT-3] room token issued for', vcRoomId, '(role=' + d.role + ', exp=' + d.expires_in + 's)');
        } else {
          console.warn('[RT-3] join skipped:', d && d.error);
        }
      } catch (e) {
        console.warn('[RT-3] join request failed (non-fatal):', e && e.message);
      }
    })();
    // 칠판 캔버스가 보이는 시점에 실제 크기로 리사이즈 (display:none → flex 직후)
    setTimeout(() => { if (typeof wbResize === 'function') wbResize(); }, 100);

    /* 📶 TURN 확보 — 위에서 미리 걸어 둔 발급을 여기서 기다린다.
       ⛔ 예전엔 fetchIceServers() 를 무조건 한 번 더 불렀다. 위에서 이미 받아 놓은 자격증명이
          있어도 매 입장마다 HTTP 왕복이 한 번 더 나갔다 — 필리핀 회선에서 그대로 입장 지연이다.
          vcEnsureIceServers 는 «TURN 이 없거나 4시간 지났을 때만» 실제로 받아 오고,
          그 경우에도 3초에서 끊어 수업을 지연시키지 않는다. */
    await vcEnsureIceServers();

    try {
        /* ⚡ 권한 선확보 때 이미 연 카메라가 있으면 그것을 그대로 쓴다(카메라 두 번 열지 않기).
           없거나 이미 죽었으면 예전처럼 새로 연다 — 어느 쪽이든 입장은 계속된다. */
        vcLocalStream = (window.vcTakePermStream && window.vcTakePermStream())
                        || await acquireLocalMedia({ video: true, audio: true });
        document.getElementById('vc-local-video').srcObject = vcLocalStream;
        document.getElementById('vc-local-label').textContent = vcUsername + (miIsEn() ? ' (Me)' : ' (나)');
        attachStreamMonitor(document.getElementById('vc-local-box'), vcLocalStream);
        vcAddDetachButton(document.getElementById('vc-local-box'));
        try { vcRefreshPraiseUI(); } catch(e){}
        vcUpdateGridCount();
        const vCount = vcLocalStream.getVideoTracks().length;
        const aCount = vcLocalStream.getAudioTracks().length;
        console.log('[vc] 미디어 접근 성공: video:', vCount, 'audio:', aCount);
        // 트랙별 누락 표시 + 자동 재시도(카메라가 잠깐 사용중이었던 경우 스스로 복구)
        if (vCount === 0) {
            vcShowLocalPlaceholder('camera-off', '카메라 연결 중… 잠시만요');
            setTimeout(function(){ try { if (typeof vcRetryCamera === 'function') vcRetryCamera(); } catch(e){} }, 1800);
        }
        if (aCount === 0) {
            alert('⚠️ 마이크가 감지되지 않았습니다.\n\n• 우측 하단 [🛠] 진단 버튼을 눌러 자동 복구를 시도해 주세요.\n• 브라우저 주소창의 🎤 아이콘을 확인하세요.\n• OS 사운드 설정 → 입력 장치를 확인하세요.\n• 다른 앱(Zoom, Teams 등)이 마이크를 점유 중이면 종료하세요.');
        } else {
            // 통화 시작 시 자동 레벨 미터 표시 (마이크가 진짜 작동하는지 확인)
            setTimeout(() => { try { startMicLevelMeter(); } catch{} }, 500);
        }
    } catch (err) {
        const msg = describeMediaError(err);
        console.error('[vc] 미디어 접근 실패:', err);
        // 카메라/마이크 없이도 계속 진행 (오디오만 or 빈 스트림)
        try {
            vcLocalStream = await acquireLocalMedia({ video: false, audio: true });
            document.getElementById('vc-local-video').srcObject = vcLocalStream;
            document.getElementById('vc-local-label').textContent = vcUsername + (miIsEn() ? ' (Me)' : ' (나)');
            attachStreamMonitor(document.getElementById('vc-local-box'), vcLocalStream);
            vcAddDetachButton(document.getElementById('vc-local-box'));
            try { vcRefreshPraiseUI(); } catch(e){}
            vcUpdateGridCount();
            console.log('[vc] 오디오만 접근 성공');
            vcShowLocalPlaceholder('camera-fail', msg);
            // 자동 재시도(카메라가 잠깐 다른 앱/탭에 잡혀 있던 경우 스스로 복구)
            setTimeout(function(){ try { if (typeof vcRetryCamera === 'function') vcRetryCamera(); } catch(e){} }, 2000);
        } catch(e2) {
            vcLocalStream = new MediaStream();
            console.warn('[vc] 미디어 완전 실패, 빈 스트림 사용');
            vcShowLocalPlaceholder('all-fail', describeMediaError(e2));
        }
    }

    // 🎙 마이크 선택 드롭다운 채우기 (권한 확보 후 라벨이 보임)
    setTimeout(function(){ try { vcPopulateMicSelect(); } catch(e){} }, 600);

    /* 🔒 (2026-07-21) 새 연결을 열기 전에 기존 연결을 반드시 닫는다.
       두 경로가 겹쳐 vcJoinRoom 이 두 번 불리면 예전엔 앞선 소켓이 닫히지 않고 남아,
       다른 방(기본방 mangoi-class)에 '유령 참가자'로 접속된 채 정원 한 자리를 계속 차지했다.
       입장을 막는 게 아니라 닫기만 하므로 '수업 안 끊김' 원칙에 안전하다. */
    try { if (vcConn && typeof vcConn.close === 'function') vcConn.close(); } catch (_) {}

    vcConn = createWebSocket(
        `/ws/video-call?roomId=${encodeURIComponent(vcRoomId)}`,
        vcHandleMessage,
        (ws) => {
            setStatusDot('vc-status-dot', 'connected');
            // clientId = 이 브라우저 탭의 안정 식별자. 재연결/새로고침/모바일 끊김에도 동일 →
            //   서버가 같은 clientId의 옛 좀비 소켓을 닫아 "교사 화면 중복(유령 타일)"을 막는다.
            ws.send(JSON.stringify({ type: 'join-room', data: { username: vcUsername, role: (window.vcMyRole || 'student'), clientId: vcClientId() } }));
        },
        () => setStatusDot('vc-status-dot', 'disconnected')
    );
    window.vcConn = vcConn;   // fix (2026-06-01) — 라이브러리 교재 공유(selectFromTextbookLibrary)가 window.vcConn 을 쓰므로 노출
    try { window.vcStartPdfPoll && window.vcStartPdfPoll(); } catch(_){}  // fix (2026-06-02) 교재 표시 안전장치
    // 🔧 (2026-07-12) 입장 기본 크기 — 가로(landscape)에서만 3/4 적용. 세로(portrait)는 phero의
    //   'pip(교재 크게)' 기본이 담당한다. 예전엔 여기서 세로에서도 무조건 vcSetVideoSize('threequarter')를
    //   호출해 phero가 붙인 video-pip 위에 video-threequarter 가 겹쳐(조합) '영상 12px 짜리 깨진 화면'이 됐다.
    try { window.__vcAutoHalfDone=false; setTimeout(function(){ try{
      var _isPortrait = window.matchMedia && window.matchMedia('(max-width:920px) and (orientation:portrait)').matches;
      if(!_isPortrait){ var _tb=document.querySelector('.video-size-bar button[onclick*="threequarter"]'); window.vcSetVideoSize && window.vcSetVideoSize('threequarter', _tb); }
    }catch(_){} window.vcApplyDefaultVideoSize && window.vcApplyDefaultVideoSize(); }, 500); } catch(_){}  // 가로:3/4 / 세로:phero pip(교재 크게)
    setStatusDot('vc-status-dot', 'connecting');

    // 🛡 최후의 안전망 — 입장 3초 후에도 비디오 트랙이 없거나 video.videoWidth=0 이면
    //   강제로 placeholder 띄움 (어떤 분기를 타든 검은 화면 절대 보이지 않게)
    setTimeout(() => {
        try {
            const v = document.getElementById('vc-local-video');
            const box = document.getElementById('vc-local-box');
            if (!v || !box) return;
            const hasPlaceholder = !!box.querySelector('.vc-local-placeholder');
            const stream = v.srcObject;
            const tracks = stream && stream.getVideoTracks ? stream.getVideoTracks() : [];
            const trackOK = tracks.length > 0 && tracks[0].readyState === 'live' && tracks[0].enabled;
            const sizeOK  = v.videoWidth > 0 && v.videoHeight > 0;
            if (!hasPlaceholder && (!trackOK || !sizeOK)) {
                console.warn('[vc] 입장 3초 후에도 본인 영상 없음 → placeholder 강제 표시', { trackOK, sizeOK, tracks: tracks.length });
                if (typeof vcShowLocalPlaceholder === 'function') {
                    vcShowLocalPlaceholder(
                        tracks.length === 0 ? 'camera-off' : 'camera-fail',
                        tracks.length === 0 ? '비디오 트랙 0개' : '카메라 트랙은 있지만 영상이 안 들어옴'
                    );
                }
            }
        } catch(e) { console.warn('[vc] 안전망 placeholder 체크 실패:', e); }
    }, 3000);

    // ── 자동 녹화 ──
    // mango-rec.js 내부 폴링(2초 간격)이 vc-in-call 클래스를 감지해
    // 3초 지연 후 startRecording({auto:true})을 자동 호출함.
    // 여기서 중복 호출하면 R2 multipart 세션이 두 번 열리므로 트리거하지 않음.

    // 🎁 Phase P5 — 출석 + 제시간 입장 자동 적립 (학생 본인 로그인 + 화상수업 입장 직후)
    //   ▶ attendance: 무조건 호출 (쿨다운 6h + 일일 1회는 서버에서 자동 차단)
    //   ▶ on_time: 가장 가까운 예정 수업과 현재시각 비교 → 5분 이내면 추가 적립
    setTimeout(() => { try { vcAutoEarnAttendance(); } catch(e) { console.warn('[vc-p5] attendance earn skip:', e); } }, 2500);
    // 💬 (2026-07-24) 채팅 이력 자동 로드 중단 — 기본값 = '기록 없는 빈 채팅'
    //   사장님 지시: 로그아웃→로그인→수업 입장 후 채팅창을 열면 아무것도 안 보여야 한다.
    //   이전엔 입장 1.5초 뒤 vcLoadChatHistory() 가 지난 대화 200개를 끌어와 붙였다
    //   ('─ 이전 채팅 N개 불러옴 ─' 구분선). 상담 내용이 다음 수업에 그대로 남는 문제.
    //   서버 기록 자체는 지우지 않는다(감사/분쟁 대비). 화면에 안 불러올 뿐이다.
    //   되살리려면 콘솔에서 vcLoadChatHistory() 를 직접 호출하면 된다.
    if (window.__vcChatAutoLoadHistory === true) {
        setTimeout(() => { try { vcLoadChatHistory(); } catch(e) { console.warn('[vc-k1] chat load:', e); } }, 1500);
    }
    // 📲 Phase K2 — 수업 시작 알림톡 (학생 본인 + 학부모 + 강사에게)
    setTimeout(() => { try { vcNotifyLessonStarted(); } catch(e) { console.warn('[vc-k2] start notify:', e); } }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// 📲 Phase K2~K3 — 수업 시작/종료/요약 자동 알림톡 트리거
// ═══════════════════════════════════════════════════════════════
function vcNotifyLessonStarted() {
    if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;  // 관찰자 제외
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!u || !u.uid) return;
    // 학생 본인 전화 (데모는 demoStudents 에서)
    const s = (typeof demoStudents !== 'undefined') ? demoStudents[u.uid] : null;
    if (!s || !s.phone) { console.log('[k2] phone 없음 → 알림 건너뜀'); return; }
    fetch('/api/notify/lesson-started', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            room_id: vcRoomId, student_name: u.name, student_phone: s.phone,
            parent_phone: s.parent_phone, lesson_title: s.lesson_title || '영어 수업',
            teacher_name: s.teacher || '강사', room_url: location.origin + '/?room=' + vcRoomId,
        })
    }).then(r=>r.json()).then(d => {
        if (d.ok) console.log('[k2] 수업 시작 알림 발송:', d.mode);
        else console.log('[k2] 알림 건너뜀:', d.message || d.error);
    }).catch(()=>{});
    // 입장 시각 기록 (종료 시 duration 계산)
    window.__vcStartedAt = Date.now();
    window.__vcInitialChatCount = 0;
}

// 수업 종료 시 호출 (closeVideoCall 등에서 트리거)
window.vcNotifyLessonEnded = function() {
    if (!vcRoomId) return;
    if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!u || !u.uid) return;
    const s = (typeof demoStudents !== 'undefined') ? demoStudents[u.uid] : null;
    if (!s) return;
    const durationMin = window.__vcStartedAt ? Math.round((Date.now() - window.__vcStartedAt) / 60000) : 0;
    const msgCount = document.querySelectorAll('#vc-chat-messages .chat-msg').length;
    // 1) 수업 종료 알림 (학생/학부모/강사)
    fetch('/api/notify/lesson-ended', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            room_id: vcRoomId, student_name: u.name,
            student_phone: s.phone, parent_phone: s.parent_phone, teacher_phone: s.teacher_phone,
            lesson_title: s.lesson_title || '영어 수업',
            duration_minutes: durationMin, message_count: msgCount,
        })
    }).catch(()=>{});
    // 2) 채팅 요약 알림 (학생/학부모)
    setTimeout(() => {
        fetch('/api/notify/chat-summary', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: vcRoomId, student_name: u.name,
                student_phone: s.phone, parent_phone: s.parent_phone,
                lesson_title: s.lesson_title || '영어 수업',
            })
        }).catch(()=>{});
    }, 1500);
};

// ═══════════════════════════════════════════════════════════════
// 🎁 Phase P5 — 화상수업 입장 → 자동 적립 (attendance + on_time)
// ═══════════════════════════════════════════════════════════════
async function vcAutoEarnAttendance() {
    // 🚪 (2026-07-29) 회의방(meet-*)은 수업이 아니다 → 출석 포인트를 적립하지 않는다.
    //    갑자기 잡힌 회의·비상수업이 정규 수업 출석으로 둔갑하면 안 된다.
    if (window.__vcIsMeetingRoom && window.__vcIsMeetingRoom()) { console.log('[vc-p5] 회의방 → 적립 건너뜀'); return; }
    // 학생 로그인 상태에서만 동작 (강사/관찰자/익명 제외)
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!u || !u.uid) { console.log('[vc-p5] 비로그인 → 적립 건너뜀'); return; }
    // 관찰자 모드는 vcIsObserver=true 이므로 건너뜀
    if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;

    // 1) attendance 적립
    let attResult = null;
    try {
        const r = await fetch('/api/points/earn-by-rule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: u.uid, token: (function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })(), student_name: u.name, rule_code: 'attendance',
                meta: { room_id: vcRoomId, source: 'vc_entry' }
            })
        });
        attResult = await r.json();
        if (attResult.ok) {
            vcShowEarnToast(`📍 출석 체크 +${attResult.rule?.amount || 10}P`);
        } else if (attResult.error === 'cooldown' || attResult.error === 'daily_cap_reached') {
            // 이미 오늘 출석함 → 조용히 무시
            console.log('[vc-p5] attendance:', attResult.error);
        } else {
            console.warn('[vc-p5] attendance 실패:', attResult);
        }
    } catch (e) {
        console.warn('[vc-p5] attendance fetch err:', e);
    }

    // 2) on_time 검사 — 현재 시각과 가장 가까운 예정 수업 비교
    try {
        const now = Date.now();
        const r = await fetch('/api/admin/class-schedules?user_id=' + encodeURIComponent(u.uid), { credentials: 'include' });
        const d = await r.json();
        const rows = (d && (d.items || d.rows)) || [];
        // 오늘 날짜
        const today = new Date(now);
        const todayY = today.getFullYear(), todayM = today.getMonth(), todayD = today.getDate();
        const todayDow = today.getDay(); // 0=일 ~ 6=토
        let nearestMinDiff = Infinity;
        for (const s of rows) {
            if (s.status === 'cancelled') continue;
            // 시작 시각 후보 결정
            let target = null;
            if (s.scheduled_date) {
                // YYYY-MM-DD
                const [y, m, day] = s.scheduled_date.split('-').map(Number);
                if (y === todayY && (m - 1) === todayM && day === todayD) {
                    const [h, mi] = (s.start_time || '00:00').split(':').map(Number);
                    target = new Date(y, m - 1, day, h, mi, 0).getTime();
                }
            } else if (s.day_of_week != null) {
                // 반복 수업: 오늘이 그 요일이면
                if (Number(s.day_of_week) === todayDow) {
                    const [h, mi] = (s.start_time || '00:00').split(':').map(Number);
                    target = new Date(todayY, todayM, todayD, h, mi, 0).getTime();
                }
            }
            if (target == null) continue;
            const diff = Math.abs(now - target);
            if (diff < nearestMinDiff) nearestMinDiff = diff;
        }
        const FIVE_MIN = 5 * 60 * 1000;
        if (nearestMinDiff <= FIVE_MIN) {
            const r2 = await fetch('/api/points/earn-by-rule', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: u.uid, token: (function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })(), student_name: u.name, rule_code: 'on_time',
                    meta: { diff_ms: nearestMinDiff, room_id: vcRoomId }
                })
            });
            const ot = await r2.json();
            if (ot.ok) vcShowEarnToast(`⏱ 제시간 입장 +${ot.rule?.amount || 5}P`);
        }
    } catch (e) {
        console.warn('[vc-p5] on_time check err:', e);
    }

    // 잔액 칩 갱신 (적립 직후 → 강제 갱신)
    if (typeof refreshPointsChip === 'function') refreshPointsChip(true);
}

// 적립 토스트 (화면 상단 중앙에 잠시 표시)
function vcShowEarnToast(msg) {
    let t = document.getElementById('vc-earn-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'vc-earn-toast';
        t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-80px);z-index:10500;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1a1a1a;padding:12px 22px;border-radius:99px;font-size:14px;font-weight:800;box-shadow:0 12px 40px -8px rgba(245,158,11,.6),0 0 0 4px rgba(255,255,255,.1);transition:transform .35s cubic-bezier(.34,1.56,.64,1);pointer-events:none;font-family:MangoiHanSC,"Noto Sans KR",Malgun Gothic,맑은 고딕,sans-serif;letter-spacing:-.3px;display:flex;align-items:center;gap:8px';
        document.body.appendChild(t);
    } else {
        t.style.transitionDuration = '0s';
        t.style.transform = 'translateX(-50%) translateY(-80px)';
    }
    t.textContent = msg;
    void t.offsetWidth; // reflow
    t.style.transitionDuration = '.35s';
    t.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(t.__hideT);
    t.__hideT = setTimeout(() => {
        t.style.transform = 'translateX(-50%) translateY(-80px)';
    }, 3000);
}

/** 관찰자 모드로 입장 (관리자 전용 — 미디어 없이 수신만) */
async function vcJoinAsObserver(roomId) {
    vcIsObserver = true;
    window._vcObserverMode = true;   // ★ 관찰자는 입장 자동 교재 로드/공유 금지 (수신 전용)
    vcUsername = '관찰자';
    vcRoomId = roomId;

    showView('view-videocall-call');
    document.body.classList.add('vc-in-call');
    try{ window.vcApplyLiteDefault && window.vcApplyLiteDefault(); }catch(e){}   // ⚡ 수업 입장 = 가벼운 모드 기본
    document.getElementById('vc-room-name').textContent = roomId + ' (관찰 중)';

    // ICE 서버 설정
    await fetchIceServers();

    // 관찰자는 로컬 미디어 없음 — 빈 스트림
    vcLocalStream = new MediaStream();
    const localBox = document.getElementById('vc-local-box');
    if (localBox) localBox.style.display = 'none'; // 로컬 비디오 숨김

    // 하단 툴바 숨김 (관찰자는 마이크/카메라/채팅 등 불필요)
    const toolbar = document.getElementById('vc-bottom-toolbar');
    if (toolbar) toolbar.style.display = 'none';

    // 관찰자 표시 배너
    const roomHeader = document.getElementById('vc-room-name');
    if (roomHeader) {
        roomHeader.innerHTML = `🔍 <span style="color:#f59e0b">${roomId}</span> 수업 관찰 중`;
    }

    /* 🔒 (2026-07-21) 관찰 입장도 동일 — 기존 연결이 남아 유령이 되지 않도록 먼저 닫는다. */
    try { if (vcConn && typeof vcConn.close === 'function') vcConn.close(); } catch (_) {}

    vcConn = createWebSocket(
        `/ws/video-call?roomId=${encodeURIComponent(vcRoomId)}`,
        vcHandleMessage,
        (ws) => {
            setStatusDot('vc-status-dot', 'connected');
            ws.send(JSON.stringify({ type: 'join-observe', data: { username: '관찰자' } }));
        },
        () => setStatusDot('vc-status-dot', 'disconnected')
    );
    window.vcConn = vcConn;   // fix (2026-06-01) — window.vcConn 노출
    /* 👁 (2026-08-11 SID ③ "고스트가 안 눌리고 로딩도 안 됐다")
       서버가 join-observe 를 버리던 문제는 고쳐졌지만, «실패했을 때 화면이 아무 말도 안 하는» 것은
       그대로였다. 붙지 못해도, 방이 비어 있어도, 화면은 똑같이 «연결 중…» 이라 관리자는
       고장인지 기다리면 되는 건지 알 수 없었다. 결과를 반드시 글자로 말해 준다. */
    try { vcObserverWatch(); } catch(_){}
    try { window.vcStartPdfPoll && window.vcStartPdfPoll(); } catch(_){}  // fix (2026-06-02) 교재 표시 안전장치
    // 🔧 (2026-07-12) 입장 기본 크기 — 가로(landscape)에서만 3/4 적용. 세로(portrait)는 phero의
    //   'pip(교재 크게)' 기본이 담당한다. 예전엔 여기서 세로에서도 무조건 vcSetVideoSize('threequarter')를
    //   호출해 phero가 붙인 video-pip 위에 video-threequarter 가 겹쳐(조합) '영상 12px 짜리 깨진 화면'이 됐다.
    try { window.__vcAutoHalfDone=false; setTimeout(function(){ try{
      var _isPortrait = window.matchMedia && window.matchMedia('(max-width:920px) and (orientation:portrait)').matches;
      if(!_isPortrait){ var _tb=document.querySelector('.video-size-bar button[onclick*="threequarter"]'); window.vcSetVideoSize && window.vcSetVideoSize('threequarter', _tb); }
    }catch(_){} window.vcApplyDefaultVideoSize && window.vcApplyDefaultVideoSize(); }, 500); } catch(_){}  // 가로:3/4 / 세로:phero pip(교재 크게)
    setStatusDot('vc-status-dot', 'connecting');
}

/* 👁 (2026-08-11 SID ③) 참관 결과를 «글자로» 말해 준다.
   [고치는 것] 예전에는 붙든 못 붙든 화면이 「연결 중…」 하나였다. 관리자는 고장인지, 기다리면
   되는 건지, 방이 원래 빈 건지 구분할 방법이 없었다. 「안 눌린다 / 로딩이 안 된다」 는 신고의
   절반은 이 «말 없음» 이다.
   [판정] 서버가 보내 주는 사실만 쓴다 — 새로 재지 않는다.
     · existing-users 를 받았고 사람이 있다  → 붙었다(배너 없음, 화면이 곧 뜬다)
     · existing-users 를 받았는데 0명        → 방은 살아 있는데 아무도 없다(고장 아님)
     · 8초가 지나도 아무 응답이 없다          → 참관 자체가 실패 = 다시 시도할 것
   ⚠️ 배너는 «참관 모드에서만» 띄운다. 일반 수업 화면에 뜨면 학생이 겁먹는다. */
function vcObserverBanner(kind, extra) {
    var old = document.getElementById('vc-observe-note');
    if (old) old.remove();
    if (!kind) return;
    var en = false;
    try { en = (typeof getLang === 'function' && getLang() === 'en'); } catch (_) {}
    var msg = kind === 'empty'
        ? (en ? '👀 Nobody is in this room yet. The screen will appear when someone joins.'
              : '👀 이 방에는 아직 아무도 없습니다. 누군가 들어오면 화면이 나타납니다.')
        /* 👁 (2026-08-12) 세 번째 상태 — «붙기는 했는데 영상이 안 온다» (사장님 실제 증상).
           로스터가 정상이면 예전 판정은 «성공» 이라 화면이 영영 침묵했다. vcObserverMediaWatch 참조. */
        : kind === 'nomedia'
        ? (en ? '⚠ Joined the class, but no participant video is arriving.'
              : '⚠ 수업에는 붙었지만 참가자 영상이 오지 않습니다.')
        /* 🔁 (2026-08-12) 자동 재시도 중 — nomedia 확정 전 12초 동안 뜨는 중간 안내 */
        : kind === 'retry'
        ? (en ? '🔄 No video yet — reconnecting automatically…'
              : '🔄 영상이 아직 안 와서 자동으로 다시 연결하는 중…')
        : (en ? '⚠ Could not join as observer. Please close this tab and press Ghost again.'
              : '⚠ 참관에 연결하지 못했습니다. 이 탭을 닫고 [Ghost] 를 다시 눌러 주세요.');
    var box = document.createElement('div');
    box.id = 'vc-observe-note';
    box.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483000;'
        + 'max-width:min(560px,92vw);padding:12px 18px;border-radius:12px;text-align:center;'
        + 'font-size:13.5px;font-weight:700;line-height:1.55;box-shadow:0 12px 32px -8px rgba(0,0,0,.45);'
        + (kind === 'empty'
            ? 'background:#0c2a4a;border:1px solid #38bdf8;color:#bae6fd'
            : (kind === 'nomedia' || kind === 'retry')
            /* 호박색 — «고장(빨강)» 과 «정상(파랑)» 사이. 붙긴 했으니 빨강은 과하다 */
            ? 'background:#3a2a06;border:1px solid #f59e0b;color:#fde68a'
            : 'background:#3b1111;border:1px solid #f87171;color:#fecaca');
    box.textContent = msg + (extra ? ' (' + extra + ')' : '');
    document.body.appendChild(box);
}

function vcObserverWatch() {
    if (!window._vcObserverMode) return;
    window.__vcObserveSawUsers = false;
    setTimeout(function () {
        try {
            if (!window._vcObserverMode) return;
            if (window.__vcObserveSawUsers) return;          // 붙었다 — 아무 말도 하지 않는다
            var open = false;
            try { open = !!(window.vcConn && vcConn.ws && vcConn.ws.readyState === 1); } catch (_) {}
            vcObserverBanner('fail', open ? 'no reply' : 'not connected');
        } catch (_) {}
    }, 8000);
}

/* 👁 (2026-08-12) 두 번째 감시 — «붙었는데 영상이 안 온다».
   [무엇이 빠져 있었나] 위의 vcObserverWatch 는 existing-users 를 받은 순간 «성공» 으로 보고
   입을 닫는다(`__vcObserveSawUsers` → return). 그런데 사장님이 실제로 겪은 것은 그 다음 칸이다:
   참가자 타일은 생겼는데(=로스터 정상) 영상이 영영 안 와서 타일이 「📷 연결 중…」 에 멈춘 상태.
   로스터가 왔으니 «실패» 도 아니고, 영상이 없으니 «성공» 도 아닌데, 어느 배너도 이 칸을 맡지
   않아 화면이 통째로 침묵했다 → 「눌러도 아무 일도 안 일어난다」 로 보인다.
   [판정] 새로 재지 않는다 — 브라우저가 이미 아는 사실(피어별 signalingState·ICE)만 읽는다.
     · have-local-offer 에서 멈춤   → 상대가 answer 를 안 보냄 (시그널링에서 끊김)
     · stable 인데 ICE checking/failed → 연결 경로를 못 찾음 (TURN·방화벽 쪽)
     · ICE connected 인데 트랙 없음   → 붙었는데 미디어가 안 옴 (협상은 됐으나 송신이 없음)
   왜 10초인가 — 8초짜리 첫 감시(붙었나)보다 뒤에 와야 한다. 그리고 필리핀 회선의 TURN 경유
   연결이 실제로 5~7초까지 걸리는 것을 봤다. 그보다 짧으면 «정상인데 늦은 것» 을 고장이라 부른다.
   ⚠️ 참관 모드에서만. 영상이 하나라도 살아 있으면 아무 말도 하지 않는다. */
function vcObserverMediaWatch() {
    if (!window._vcObserverMode) return;
    // existing-users 는 재연결 때 다시 온다 — 감시는 한 번만 건다
    if (window.__vcObserveMediaWatching) return;
    window.__vcObserveMediaWatching = true;
    setTimeout(function () {
        try {
            if (!window._vcObserverMode) return;
            if (vcObserverHasLiveVideo()) return;        // 영상이 왔다 — 조용히
            /* 🔁 (2026-08-12 사장님 실측 «ice-stuck x1») 보고만 하지 말고 한 번은 스스로 고쳐 본다.
               참가자들이 쓰는 복구(vcReconnectPeer)와 같은 길인데, 참관자는 ICE 가 'failed' 로
               넘어가기 전(checking 고착)에는 아무도 안 불러 줬다 — 여기서 강제로 부른다.
               재시도는 TURN 릴레이 강제(__vcForceRelay) — 직접 경로가 안 되는 상황이므로. */
            vcObserverBanner('retry', vcObserverStallReason());
            vcObserverRetryStalled();
            setTimeout(function () {
                try {
                    if (!window._vcObserverMode) return;
                    if (vcObserverHasLiveVideo()) return;   // 재시도 성공 — 배너는 vcAddRemoteVideo 가 걷었다
                    vcObserverBanner('nomedia', vcObserverStallReason());
                } catch (_) {}
            }, 12000);
        } catch (_) {}
    }, 10000);
}

/** 🔁 영상을 못 주는 피어 목록 — 재시도 대상 선정. (감시 판정과 같은 기준: «살아있는 비디오 트랙») */
function vcObserverStalledPeerIds() {
    var out = [];
    try {
        Object.keys(vcPeerConnections || {}).forEach(function (id) {
            var live = false;
            try {
                var s = (typeof vcRemoteStreams !== 'undefined') && vcRemoteStreams[id];
                if (s && s.getVideoTracks) live = s.getVideoTracks().some(function (t) { return t.readyState === 'live'; });
            } catch (_) {}
            if (!live) out.push(id);
        });
    } catch (_) {}
    return out;
}

/** 🔁 멈춘 피어를 «한 번만» 자동 복구 — TURN 릴레이 강제 + 참가자용 복구 루틴 재사용.
 *  한 번만인 이유: 두 번째도 실패하는 연결은 세 번째도 실패한다. 반복하면 상대(강사) 쪽
 *  업로드에 offer 폭탄만 던지는 꼴이라, 최종 배너를 남기고 사람에게 넘기는 쪽이 맞다. */
function vcObserverRetryStalled() {
    if (window.__vcObserveRetried) return;
    window.__vcObserveRetried = true;
    var ids = vcObserverStalledPeerIds();
    console.warn('[vc-observer] 🔁 영상 미수신 자동 재시도 (relay 강제):', ids.join(', ') || '(피어 없음)');
    ids.forEach(function (id, i) {
        try { (window.__vcForceRelay = window.__vcForceRelay || {})[id] = true; } catch (_) {}
        /* 400ms 간격 — 동시 offer 폭주 방지(existing-users 의 300ms 간격과 같은 이유) */
        setTimeout(function () { try { vcReconnectPeer(id); } catch (_) {} }, i * 400);
    });
}

/** 참관 화면에 «실제로 재생 중인» 원격 영상이 하나라도 있는가 */
function vcObserverHasLiveVideo() {
    try {
        var vids = document.querySelectorAll('.video-box video');
        for (var i = 0; i < vids.length; i++) {
            var s = vids[i].srcObject;
            if (!s || !s.getVideoTracks) continue;
            var tr = s.getVideoTracks();
            for (var j = 0; j < tr.length; j++) {
                if (tr[j].readyState === 'live') return true;
            }
        }
    } catch (_) {}
    return false;
}

/** 피어 상태를 읽어 «어느 단계에서 멈췄는지» 를 한 줄로 — 배너 괄호 안에 그대로 붙는다.
 *  콘솔을 못 여는 사람도 이 한 줄만 찍어서 보내면 원인 분류가 된다. */
function vcObserverStallReason() {
    var ids = [];
    try { ids = Object.keys(vcPeerConnections || {}); } catch (_) {}
    if (!ids.length) return 'no-peer';                   // offer 를 아예 못 보냄
    var noAnswer = 0, iceStuck = 0, noTrack = 0, states = [];
    ids.forEach(function (id) {
        var pc = null;
        try { pc = vcPeerConnections[id]; } catch (_) {}
        if (!pc) return;
        var ss = pc.signalingState, ice = pc.iceConnectionState;
        states.push(ss + '/' + ice);
        if (ss === 'have-local-offer') noAnswer++;
        else if (ice === 'connected' || ice === 'completed') noTrack++;
        else iceStuck++;
    });
    var head = noAnswer ? ('no-answer x' + noAnswer)
             : iceStuck ? ('ice-stuck x' + iceStuck)
             : ('no-track x' + noTrack);
    return head + ' · ' + states.join(', ');
}

/** 다자간 통화 메시지 처리 */
function vcHandleMessage(msg) {
    switch (msg.type) {
        case 'room-joined': {
            // 🔁 (2026-07-24) 무중단 재연결 판단 — onopen 에서 보류한 '기존 연결 정리'를 여기서 결정한다.
            //   재연결인데 서버가 '같은 userId' 를 돌려줬다 = 정체성 유지 = 살아있는 PeerConnection 을 그대로 둔다.
            //   userId 가 바뀌었다(스위치 off/첫 입장) = 예전처럼 전부 정리한다(안전한 쪽, 기존 동작 그대로).
            const _prevUserId = vcUserId;
            const _wasReconnect = !!window.__vcWasReconnect;
            window.__vcWasReconnect = false;
            if (_wasReconnect && typeof vcCleanupAllPeers === 'function') {
                if (msg.data.userId !== _prevUserId) {
                    console.log('[vc] 재연결 — 정체성 바뀜 → 기존 PeerConnection 정리(기존 동작)');
                    vcCleanupAllPeers();
                } else {
                    console.log('[vc] 재연결 — 정체성 유지 → 살아있는 연결 보존(무중단)');
                }
            }
            vcUserId = msg.data.userId;
            window._vcJoinedRoomId = msg.data.roomId || vcRoomId;   // ★ 이때부터 room-media 폴링 적용 허용
            updateUserCount(msg.data.userCount);
            // 🌟 학생이면 (방·피어ID → 내 계정 uid) 를 서버에 등록 → 선생님이 별 누르면 서버가 내 계정에 확실히 적립.
            try { vcRegisterRosterIdentity(); setTimeout(vcRegisterRosterIdentity, 3000); } catch(e){}
            break;
        }

        case 'existing-users':
            // 기존 사용자 각각에 대해 P2P 연결 시작 (내가 Offer를 보냄)
            console.log('[vc] existing-users:', msg.data.users.length, '명');
            /* 👁 (2026-08-11 SID ③) 참관은 여기서 «붙었다» 가 확정된다 — 서버가 방 사람 목록을 준 순간.
               사람이 0명이면 고장이 아니라 «빈 방» 이다. 그 둘을 화면에서 갈라 준다. */
            if (window._vcObserverMode) {
                window.__vcObserveSawUsers = true;
                try { vcObserverBanner((msg.data.users || []).length ? '' : 'empty'); } catch (_) {}
                /* 👁 (2026-08-12) 사람이 있는데도 영상이 안 오는 칸을 여기서부터 감시한다.
                   빈 방이면 걸지 않는다 — 안 오는 게 정상이고 위에서 이미 그렇게 말했다. */
                if ((msg.data.users || []).length) {
                    try { vcObserverMediaWatch(); } catch (_) {}
                }
            }
            msg.data.users.forEach((user, idx) => {
                try { (window.vcPeerRoles = window.vcPeerRoles || {})[user.userId] = user.role || 'student'; } catch(e){}
                try { vcEnsureParticipantBox(user.userId, user.username); } catch(e){}   // 영상 전이라도 박스 미리 생성
                // 🔁 (2026-07-24) 이미 연결된 상대에게는 offer 를 다시 쏘지 않는다 — 무중단 재연결로 살려 둔
                //   PeerConnection 을 스스로 부수면 이 작업의 목적이 무너진다. (정리된 경우엔 pc 가 없어 정상 offer)
                var _epc = vcPeerConnections[user.userId];
                if (_epc && (_epc.connectionState === 'connected' || _epc.iceConnectionState === 'connected' || _epc.iceConnectionState === 'completed')) {
                    return;
                }
                // 각 사용자에 대해 약간의 지연을 주어 동시 offer 폭주 방지
                setTimeout(() => vcCreatePeerAndOffer(user.userId, user.username), idx * 300);
            });
            try { window.vcApplySpotlight && window.vcApplySpotlight(); } catch(e){}
            // PDF/이미지 공유 동기화 (늦게 입장한 학생도 현재 교재가 보이게)
            // fix (2026-06-01) — 서버/절대 URL 은 직접 로드 (예전 pdfLoadRemote 는 라이브러리 교재 흰화면 원인)
            if (msg.data.pdfState && msg.data.pdfState.url) {
                // 🥭 늦게 입장했는데 교사가 이미 교재 공유 중 → 세로폰 '내용 크게'로 시작
                window.__vcPdfShared = true;
                try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}
                var jUrl = msg.data.pdfState.url;
                var jKind = msg.data.pdfState.kind || '';
                if (!jKind) {
                    if (/textbook-files|\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(jUrl)) jKind = 'image';
                    else if (/\.pdf(\?|$)/i.test(jUrl)) jKind = 'pdf';
                }
                if (/^blob:/i.test(jUrl)) { /* 로컬 blob 은 다른 기기에서 못 엶 — 무시 */ }
                else if (/^https?:\/\//i.test(jUrl) || jUrl.charAt(0) === '/') {
                    pdfCurrentId = jUrl;
                    vcSwitchTab('pdf');
                    Promise.resolve(pdfLoad(jUrl, jKind || undefined)).then(function(){ pdfPageNum = msg.data.pdfState.currentPage || 1; pdfRender(); }).catch(function(e){
                        var alt = (jKind === 'image') ? 'pdf' : 'image';
                        Promise.resolve(pdfLoad(jUrl, alt)).then(function(){ pdfPageNum = msg.data.pdfState.currentPage || 1; pdfRender(); }).catch(function(){});
                    });
                } else {
                    var epdfId = msg.data.pdfState.pdfId || jUrl.replace('/api/video-call/pdf/', '');
                    if (epdfId) pdfLoadRemote(epdfId, msg.data.pdfState.currentPage, jKind);
                }
            }
            break;

        // 📷 (2026-07-24) 상대의 카메라 on/off 통보 — 검은 화면의 '이유' 를 확정해 준다.
        case 'cam-state': {
            const _csId = msg.data && msg.data.userId;
            if (_csId) {
                window.vcRemoteCamOff = window.vcRemoteCamOff || {};
                if (msg.data.camOn) delete window.vcRemoteCamOff[_csId];
                else window.vcRemoteCamOff[_csId] = (msg.data.reason === 'aao') ? 'aao' : 'user';
                try { vcApplyRemoteCamHint(_csId); } catch(_) {}
            }
            break;
        }

        case 'user-joined':
            console.log('[vc] user-joined:', msg.data.userId, msg.data.username);
            // 🇵🇭 (2026-07-24 재점검) 새 참가자가 들어왔다 = 끊겼던 사람이 새 id 로 돌아온 것일 수 있다.
            //   여기서 유령 타일을 먼저 치우지 않으면 아래 vcEnsureParticipantBox 가 박스를 하나 더
            //   만들어, 1:1 수업인데 타일이 3개가 되고(그리드가 세로 3분할로 축소) PIP 주화면이
            //   '정지된 유령' 으로 선택되는 사고가 난다. 영상 도착(vcAddRemoteVideo)까지 기다리면 늦다.
            try { vcSweepGhostTiles(); } catch(e){}
            // 📷 내 카메라가 꺼져 있다면 새로 들어온 사람에게도 알려 준다.
            //   안 알리면 그 사람 화면에서는 '이유 없는 검은 화면' 이 되고 워치독이 재협상을 시도한다.
            try { if (window.vcCamOn === false) vcBroadcastCamState(false, 'user'); } catch(e){}
            // 🖥 (2026-08-27) 공유 «중» 에 들어온(재접속 포함) 사람은 screen-share-state 를 못 받아
            //   타일에 .vc-ss-badge 가 없다 → 공유 화면이 cover 로 좌우가 크게 잘린다
            //   (idx-vc-mobilefix ⑧의 예외가 배지로 판별). DO 는 이 상태를 저장하지 않으므로
            //   공유자가 입장을 보고 한 번 더 알린다. 4초 지연 = 새 사람 화면에 내 타일이
            //   만들어질 시간. resync 표시는 받는 쪽이 토스트 없이 배지만 다시 단다.
            try {
                if (window.__vcScreenSharing) setTimeout(function(){
                    try { if (window.__vcScreenSharing && vcConn) vcConn.send({ type: 'screen-share-state', data: { on: true, resync: true } }); } catch(_){}
                }, 4000);
            } catch(e){}
            try { (window.vcPeerRoles = window.vcPeerRoles || {})[msg.data.userId] = msg.data.role || 'student'; window.vcApplySpotlight && window.vcApplySpotlight(); } catch(e){}
            try { vcEnsureParticipantBox(msg.data.userId, msg.data.username); } catch(e){}   // 영상 전이라도 박스 미리 생성
            updateUserCount(msg.data.userCount);
            vcAddChatSystem(`${msg.data.username} 님이 입장했습니다.`);
            // 새 사용자가 offer를 보내오면 vcHandleOffer에서 PC 생성됨
            // 하지만 안전장치로 5초 후 PC가 없으면 직접 offer 시도
            if (msg.data.userId && !vcPeerConnections[msg.data.userId]) {
                setTimeout(() => {
                    if (!vcPeerConnections[msg.data.userId]) {
                        console.log('[vc] 안전장치: offer 미수신 → 직접 연결 시도:', msg.data.userId);
                        vcCreatePeerAndOffer(msg.data.userId, msg.data.username);
                    }
                }, 3000);
            }
            break;

        case 'user-left':
            updateUserCount(msg.data.userCount);
            // reason: 'left'=의도적 퇴장(나가기 버튼/정상 종료), 'dropped'=네트워크 끊김·재연결 교체.
            //   'dropped'는 같은 사람이 곧 재입장할 가능성이 높으므로 수업 종료로 즉시 오인하면
            //   안 된다(2026-07-13 실사용 신고: 수업 도중 갑자기 수업 종료됨).
            vcRemovePeer(msg.data.userId, msg.data.reason);
            vcAddChatSystem(msg.data.reason === 'dropped'
                ? `${msg.data.username} 님과 연결이 잠시 끊겼습니다. 재연결을 기다리는 중…`
                : `${msg.data.username} 님이 퇴장했습니다.`);
            try { vcRefreshChatTargets(); } catch(e){}   // 🔒 나간 사람이 개별채팅 대상이면 전체로 복귀
            /* 🎛 장치 도우미 대상 학생이 «완전히» 나가면 패널을 닫는다.
               dropped(순단)는 곧 재입장 가능성이 높지만 재입장 시 userId 가 새로 발급돼
               옛 uid 로는 어차피 못 만진다 → 혼란을 남기지 말고 둘 다 닫는 게 정직하다. */
            try { if (window.__vcDevHelp && window.__vcDevHelp.uid === msg.data.userId) vcDevHelpClose(); } catch(e){}
            break;

        // WebRTC 시그널링
        case 'offer':
            vcHandleOffer(msg.data);
            break;
        case 'answer':
            vcHandleAnswer(msg.data);
            break;
        case 'ice-candidate':
            vcHandleIce(msg.data);
            break;

        // 채팅
        case 'chat-message':
            vcReceiveChat(msg.data);
            break;

        // 🌟 실시간 칭찬 포인트 — 브로드캐스트 후 대상 학생 본인만 반응
        case 'point-award':
            if (msg.data && msg.data.targetUserId === vcUserId) {
                vcCelebratePoint(msg.data.awardId, msg.data.fromName);
            }
            break;
        case 'point-award-ack':
            try {
                var _pend = window._vcPendingAwards && window._vcPendingAwards[msg.data.awardId];
                if (_pend) {
                    var _t = _pend.toast;
                    if (msg.data.ok) {
                        // ✅ 이 학생 누적 개수 +1 → 얼굴 버튼 + 로스터 칩 배지 양쪽 갱신
                        window._vcAwardCounts = window._vcAwardCounts || {};
                        window._vcAwardCounts[_pend.targetUserId] = (window._vcAwardCounts[_pend.targetUserId] || 0) + 1;
                        vcSyncAwardUI(_pend.targetUserId);
                        if (_pend.btn) {
                            _pend.btn.classList.add('vc-star-pop');
                            setTimeout(function(){ _pend.btn.classList.remove('vc-star-pop'); }, 460);
                        }
                        vcShowStarToast(_t, '⭐ +1P! (이 학생 누적 ' + window._vcAwardCounts[_pend.targetUserId] + '개)');
                    }
                    else if (msg.data.error === 'cooldown') vcShowStarToast(_t, '잠깐만요, 쿨다운 중');
                    else if (msg.data.error === 'daily_cap_reached') vcShowStarToast(_t, '오늘 한도 도달');
                    else vcShowStarToast(_t, '전달 실패 :(');
                    delete window._vcPendingAwards[msg.data.awardId];
                }
            } catch(e){}
            break;

        // 칠판
        case 'whiteboard-draw':
            wbReceiveDraw(msg.data);
            break;
        case 'whiteboard-clear':
            wbReceiveClear();
            break;
        case 'whiteboard-text':
            wbReceiveText(msg.data);
            break;
        case 'whiteboard-pointer':      // 🔴 칠판 레이저 포인터
            wbReceivePointer(msg.data);
            break;
        case 'whiteboard-shape':
            wbReceiveShape(msg.data);
            break;
        case 'whiteboard-stroke':
            wbReceiveStroke(msg.data);
            break;
        /* 🖍 (2026-08-08 Ana③ · Kes①) 입장 시 서버가 돌려주는 «지금까지의 칠판».
           예전엔 칠판이 «연결돼 있는 동안만» 중계돼, 강사가 학생보다 늦게 들어오면
           학생이 그려 둔 것이 하나도 안 보였다. 교재(pdf-sync)와 같은 취급으로 맞춘다. */
        case 'whiteboard-replay':
            try {
                var _ops = (msg.data && msg.data.ops) || [];
                wbClearOps();
                for (var _i = 0; _i < _ops.length; _i++) {
                    var _o = _ops[_i]; if (!_o || !_o.d) continue;
                    if (_o.t === 'whiteboard-draw')        wbRecord({ k: 'seg',    d: _o.d });
                    else if (_o.t === 'whiteboard-stroke') wbRecord({ k: 'stroke', d: _o.d });
                    else if (_o.t === 'whiteboard-shape')  wbRecord({ k: 'shape',  d: _o.d });
                    else if (_o.t === 'whiteboard-text')   wbRecord({ k: 'text',   d: _o.d });
                }
                // 칠판 탭이 아직 안 열려 있으면 크기가 0 이라 지금 그릴 수 없다 —
                // 기록만 남기고, 탭이 열리는 순간 wbFitCanvas → wbRedrawAll 이 그린다.
                if (typeof wbFitCanvas === 'function') wbFitCanvas();
                wbRedrawAll();
            } catch(e){ console.warn('[wb-replay]', e); }
            break;

        /* 🙋 (2026-08-12 Shas 5-b·5-c) 수업 안 복습퀴즈 잇기 —
           quiz-share: 강사 → 학생 «이 퀴즈를 같이 풀자» (id 만)
           quiz-pick / quiz-done: 학생 → 강사 «지금 이걸 골랐어요 / 제출했어요»
           처리는 전부 idx-x8.js(rqvOnClassMsg)가 한다 — 퀴즈 상태(st)가 거기 있다. */
        case 'quiz-share':
        case 'quiz-pick':
        case 'quiz-done':
            try { if (typeof window.rqvOnClassMsg === 'function') window.rqvOnClassMsg(msg.type, msg.data); } catch(_){}
            break;

        /* 🪞 (2026-08-12 Shas 1번) 학생의 웜업 대화 — 강사 화면에만 비춘다.
           서버는 방 전체에 뿌리므로(다른 학생도 받는다) 여기서 강사만 그린다. */
        case 'warmup-echo':
            try {
                if (window.vcCanControlTextbook && window.vcCanControlTextbook()
                    && typeof window.vcWarmupMirror === 'function') {
                    window.vcWarmupMirror(msg.data && msg.data.who, msg.data && msg.data.text);
                }
            } catch(_){}
            break;

        /* ✋ (2026-07-28 Kaye 9번) 교사의 '학생 필기 잠금' 신호 — 학생 쪽에 잠금 상태를 알린다.
           교사가 새로 들어온 학생에게도 알릴 수 있게, 잠금은 켤 때마다 방송한다. */
        case 'pdf-drawlock':
            try {
                /* 서버는 { on, locked } 를 함께 보낸다 — 한쪽 이름만 보면 조용히 «항상 해제»가 된다 */
                var _dlPrev = !!window.__pdfStudentDrawLock;
                window.__pdfStudentDrawLock = !!(msg.data && (msg.data.on || msg.data.locked));
                if (typeof vcRenderDrawLockChip === 'function') vcRenderDrawLockChip();
                var _dl = (typeof getLang === 'function' && getLang() === 'en');
                /* (2026-08-12 Melca) 입장 시 서버가 «꺼짐» 상태도 내려보내므로(stale 잠금 방지)
                   토스트는 값이 실제로 바뀔 때만 — 안 그러면 입장마다 「다시 필기할 수 있어요」 헛토스트 */
                if (_dlPrev !== window.__pdfStudentDrawLock
                    && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin' && typeof mangoToast === 'function') {
                    mangoToast(window.__pdfStudentDrawLock
                        ? (_dl ? 'The teacher locked drawing.' : '선생님이 필기를 잠갔어요.')
                        : (_dl ? 'You can draw again.' : '이제 다시 필기할 수 있어요.'));
                }
            } catch(e){}
            break;

        // 교재(PDF) 위 실시간 양방향 판서
        case 'pdf-anno-start':
            pdfReceiveAnnoStart(msg.data);
            break;
        case 'pdf-anno-point':
            pdfReceiveAnnoPoint(msg.data);
            break;
        case 'pdf-anno-text':
            pdfReceiveAnnoText(msg.data);
            break;
        case 'pdf-anno-clear':
            pdfReceiveAnnoClear(msg.data);
            break;
        case 'pdf-anno-undo':
            pdfReceiveAnnoUndo(msg.data);
            break;
        case 'pdf-anno-shape':
            pdfReceiveAnnoShape(msg.data);
            break;
        /* ✍️ (2026-08-12 Melca) 늦게 들어온·새로고침한 쪽에 지금까지의 교재 판서를 재생.
           칠판(whiteboard-replay)은 2026-08-08 에 생겼는데 교재 판서만 빠져 있었다 —
           "학생 필기가 강사 화면에 안 보인다" 신고의 한 갈래. 서버가 획 단위로 압축해 보낸다. */
        case 'pdf-anno-replay': {
            try {
                window.__pdfAnnoReplaying = true;   // 재생 중에는 «다른 페이지 필기» 알림을 끈다
                var _parOps = (msg.data && msg.data.ops) || [];
                _parOps.forEach(function(op){
                    try {
                        if (op.t === 'stroke') {
                            var _ps = op.d || {};
                            var _pts = _ps.points || [];
                            if (!_pts.length) return;
                            /* 재접속(스티키)으로 이미 갖고 있는 획은 건너뛴다 — 이중 그리기 방지 */
                            if (_ps.id != null && typeof _pdfRemoteStrokes !== 'undefined' && _pdfRemoteStrokes[_ps.id]) return;
                            var _mine = (pdfAnnotations[_ps.page] || []).some(function(st){ return st && st._id === _ps.id; });
                            if (_ps.id != null && _mine) return;
                            pdfReceiveAnnoStart({ page: _ps.page, tool: _ps.tool, color: _ps.color, size: _ps.size, id: _ps.id, point: _pts[0] });
                            for (var _pi = 1; _pi < _pts.length; _pi++) pdfReceiveAnnoPoint({ id: _ps.id, page: _ps.page, point: _pts[_pi] });
                        }
                        else if (op.t === 'pdf-anno-text')  pdfReceiveAnnoText(op.d);
                        else if (op.t === 'pdf-anno-shape') pdfReceiveAnnoShape(op.d);
                        else if (op.t === 'pdf-anno-clear') pdfReceiveAnnoClear(op.d);
                        else if (op.t === 'pdf-anno-undo')  pdfReceiveAnnoUndo(op.d);
                    } catch(_){}
                });
                console.log('[pdf-anno] 교재 판서 재생:', _parOps.length, '개 op');
            } catch(_){}
            window.__pdfAnnoReplaying = false;
            break;
        }
        case 'pdf-pointer':
            pdfReceivePointer(msg.data);
            break;

        // PDF
        case 'pdf-sync':
        case 'pdf-share': {
            // fix (2026-06-01) — 라이브러리/서버 교재는 받은 url 을 '직접' 로드해야 다른 기기에서 보임.
            //   (예전엔 무조건 /api/video-call/pdf/{pdfId} 로 불러서 라이브러리 교재가 흰 화면이 됐음)
            var sUrl = msg.data.url || '';
            var sPid = msg.data.pdfId || '';
            try { if (typeof showToast === 'function') showToast('📡 교재 신호 수신 (' + msg.type + ')'); } catch(_){}
            console.log('[pdf-share] 수신:', msg.type, 'url=', sUrl, 'pdfId=', sPid, 'kind=', msg.data.kind);
            if (sUrl && /^blob:/i.test(sUrl)) {
                // 로컬(blob) 교재는 상대 기기에서 열 수 없음 — 서버 교재를 써야 함
                console.warn('[pdf-share] 로컬(blob) 교재는 공유 불가:', sUrl);
                if (typeof showToast === 'function') { try { showToast('⚠️ 이 교재는 서버에 없어 화면 공유가 안 됩니다. 관리자 페이지에서 교재를 서버로 업로드해 주세요.'); } catch(_){} }
                break;
            }
            if (sUrl && (/^https?:\/\//i.test(sUrl) || sUrl.charAt(0) === '/')) {
                // 서버/절대 URL — 통합 함수로 직접 로드 (cross-device). 폴링과 동일 경로라 중복 로드 없음.
                // ← 마지막 true = «교사가 지금 연 것». 학생 화면을 교재로 데려온다(위 함수 주석 참고)
                window.vcApplySharedPdf(sUrl, msg.data.kind, msg.data.currentPage, sPid, msg.data.name, true);
                break;
            }
            // 화상수업 업로드 PDF (PDF_STORE) — 서버 엔드포인트로 로드
            var syncPdfId = sPid || (sUrl ? sUrl.replace('/api/video-call/pdf/', '') : null);
            if (syncPdfId) {
                pdfLoadRemote(syncPdfId, msg.data.currentPage, msg.data.kind);
                vcSwitchTab('pdf');
                window.__vcPdfShared = true;   // 🥭 세로폰 '내용 크게' 자동 전환
                try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}
            }
            break;
        }
        // 📡 (2026-07-14) 교사 탭 동기화 수신 — 교사가 칠판/동영상/교재 등으로 바꾸면 따라감.
        //   학생만 따라감(교사·관리자가 다른 교사 방송을 받아도 무시 → 서로 덮어쓰기 방지).
        case 'tab-sync': {
            try {
                var _tsTab = msg.data && msg.data.tab;
                if (_tsTab && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin') {
                    // 🧑‍🎓 (2026-08-12 Melca) 강사가 웜업 탭을 열어 주면 «강사 주도 웜업» 허가,
                    //   다른 탭으로 옮기면 허가 종료 (수업 중 학생 단독 웜업 차단의 예외 스위치)
                    window.__vcWarmupTeacherLed = (_tsTab === 'warmup');
                    window._vcTabSyncApplying = true;
                    /* 🔴 (2026-08-10 마이마이) 「교사가 칠판·교재로 옮겨도 학생은 얼굴 화면 그대로」
                       vcSwitchTab 은 .active 클래스만 바꾼다 — 학생이 탭을 두 번 눌러 콘텐츠를
                       «접어» 둔 상태(vc-content-collapsed)면 숨겨진 칸에서만 탭이 바뀌어
                       화면상 아무 일도 일어나지 않았다. 교사가 화면을 바꾸면 반드시 펼친다. */
                    try { if (typeof vcSetContentCollapsed === 'function') vcSetContentCollapsed(false); } catch(_){}
                    try { vcSwitchTab(_tsTab); } finally { window._vcTabSyncApplying = false; }
                    console.log('[tab-sync] 교사 탭 따라감:', _tsTab);
                    try { if (typeof showToast === 'function') showToast('👩‍🏫 선생님이 화면을 바꿨어요'); } catch(_){}
                }
            } catch(_){ window._vcTabSyncApplying = false; }
            break;
        }
        // 📢 귓속말 — 그리기는 /js/idx-whisper.js(defer). 아직 안 왔으면 큐에 담아 둔다.
        case 'admin-whisper':
        case 'admin-whisper-ack': {
            try {
                if (typeof window.vcWhisperOn === 'function') window.vcWhisperOn(msg.type, msg.data);
                else { (window.__vcWhisperQ = window.__vcWhisperQ || []).push([msg.type, msg.data]); }
            } catch(_){}
            break;
        }
        // 🖥 (2026-08-12 Melca) 화면 공유 시작/종료 알림 — 예전엔 학생은 예고 없이
        //   선생님 얼굴 타일이 갑자기 컴퓨터 화면으로 바뀌었다. 토스트 + 타일에 «화면 공유 중» 배지.
        case 'screen-share-state': {
            try {
                var _ssOn = !!(msg.data && msg.data.on);
                var _ssUid = msg.data && msg.data.fromUserId;
                var _ssEn = (typeof getLang === 'function' && getLang() === 'en');
                // resync(늦입장자용 재알림)는 조용히 배지만 — 토스트를 또 띄우면 방 전체가 시끄럽다
                if (!(msg.data && msg.data.resync) && typeof showToast === 'function') showToast(_ssOn
                    ? (_ssEn ? '🖥 The teacher is sharing their screen.' : '🖥 선생님이 화면 공유를 시작했어요.')
                    : (_ssEn ? '🖥 Screen sharing ended.' : '🖥 화면 공유가 끝났어요.'));
                var _ssBox = _ssUid ? document.getElementById('vc-video-' + _ssUid) : null;
                if (_ssBox) {
                    var _ssOld = _ssBox.querySelector('.vc-ss-badge');
                    if (_ssOld) _ssOld.remove();
                    if (_ssOn) {
                        var _ssB = document.createElement('span');
                        _ssB.className = 'vc-ss-badge';
                        _ssB.setAttribute('data-ko', '🖥 화면 공유 중');
                        _ssB.setAttribute('data-en', '🖥 Screen sharing');
                        _ssB.textContent = _ssEn ? '🖥 Screen sharing' : '🖥 화면 공유 중';
                        _ssB.style.cssText = 'position:absolute;top:6px;left:6px;z-index:8;padding:3px 8px;border-radius:999px;background:rgba(14,165,233,.92);color:#fff;font-size:11px;font-weight:800;pointer-events:none';
                        _ssBox.appendChild(_ssB);
                    }
                }
            } catch(_){}
            break;
        }
        // 🔒 (2026-07-20) 강사의 학생 배경 변경 잠금/해제 수신 — 서버(DO)가 강사 role 검증 후 릴레이.
        //   학생/관찰자만 적용, 강사·관리자(공동 진행 등)는 자기 버튼 상태만 동기화.
        case 'bg-lock': {
            try {
                var _bgLk = !!(msg.data && msg.data.locked);
                if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') {
                    window.__vcBgLockOn = _bgLk;
                    if (typeof vcBgLockBtnRender === 'function') vcBgLockBtnRender();
                } else if (typeof vcBgLockApply === 'function') {
                    vcBgLockApply(_bgLk);
                }
            } catch(_){}
            break;
        }
        // 🎤/🎯 (2026-07-21) 전체 음소거·집중 모드 수신 — bg-lock 과 동일 구조(서버가 강사 role 검증 후 릴레이)
        case 'mic-lock': {
            try {
                var _micLk = !!(msg.data && msg.data.locked);
                if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') {
                    window.__vcMicLockOn = _micLk;
                    if (typeof vcClassLockChipsRender === 'function') vcClassLockChipsRender();
                } else if (typeof vcMicLockApply === 'function') {
                    vcMicLockApply(_micLk);
                }
            } catch(_){}
            break;
        }
        case 'focus-lock': {
            try {
                var _fcLk = !!(msg.data && msg.data.locked);
                if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') {
                    window.__vcFocusLockOn = _fcLk;
                    if (typeof vcClassLockChipsRender === 'function') vcClassLockChipsRender();
                    /* 다른 강사가 걸었거나 새로고침으로 다시 들어온 경우 — 띠도 함께 맞춘다 */
                    try { window.vcFocusBadge(_fcLk, true); } catch(_){}
                } else if (typeof vcFocusLockApply === 'function') {
                    vcFocusLockApply(_fcLk);
                }
            } catch(_){}
            break;
        }
        /* 🎧 (2026-08-07 강사 건의 1) 강사 → 이 학생: "마이크를 다시 잡아 주세요"
           서버는 방 전체에 뿌리므로 targetUserId 로 나를 골라낸다. 마이크 트랙만 다시 얻는다
           — 화면·연결은 건드리지 않아 수업이 끊기지 않는다. 전체 음소거 중이면 존중해서 건너뛴다. */
        case 'device-fix': {
            try {
                if (!msg.data || msg.data.targetUserId !== vcUserId) break;
                if (window.__vcMicLockedByTeacher) break;      // 강사가 전체 음소거 중 = 의도된 무음
                var _dfEn = (typeof getLang === 'function' && getLang() === 'en');
                try { if (typeof mangoToast === 'function') mangoToast(_dfEn ? '🎧 Checking your microphone…' : '🎧 마이크를 다시 확인하고 있어요…'); } catch(_){}
                Promise.resolve()
                    .then(function(){ return (typeof vcHealLocalMic === 'function') ? vcHealLocalMic() : null; })
                    .then(function(){
                        var t = null, label = '';
                        try { t = window.vcLocalStream && vcLocalStream.getAudioTracks()[0]; } catch(_){}
                        if (t) label = t.label || '';
                        /* 🔐 학생이 «스스로» 마이크를 끈 상태(vcMicOn === false)면 켜지 않는다.
                           고장과 «본인이 끈 것»은 다른 일이고, 남의 마이크를 원격으로 켜는 것은
                           해서는 안 되는 일이다. 대신 그 사실을 강사에게 그대로 알려 준다 —
                           강사가 알고 싶은 것도 결국 «왜 소리가 없는가» 이다. */
                        var selfMuted = (window.vcMicOn === false);
                        if (t && !selfMuted) { try { t.enabled = true; } catch(_){} }
                        try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-report', data: { fromUserId: vcUserId, ok: !!t && !selfMuted, muted: selfMuted, label: String(label).slice(0, 60) } }); } catch(_){}
                    })
                    .catch(function(){
                        try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-report', data: { fromUserId: vcUserId, ok: false, label: '' } }); } catch(_){}
                    });
            } catch(_){}
            break;
        }
        /* 🎧 학생 → 강사: 결과 보고. 강사 화면에 한/영으로 한 줄 알린다. */
        case 'device-report': {
            try {
                if (!(typeof vcIsStaffNow === 'function' && vcIsStaffNow())) break;
                var _drEn = (typeof getLang === 'function' && getLang() === 'en');
                var _drNm = '';
                try {
                    var _drBox = document.getElementById('vc-video-' + (msg.data && msg.data.fromUserId));
                    var _drL = _drBox && _drBox.querySelector('.video-label');
                    _drNm = (_drL && _drL.textContent) ? _drL.textContent.trim() : '';
                } catch(_){}
                var _drOk = !!(msg.data && msg.data.ok);
                var _drMuted = !!(msg.data && msg.data.muted);
                if (typeof showToast === 'function') showToast(
                    _drMuted
                        ? (_drEn ? '🔇 ' + (_drNm || 'Student') + ' turned their microphone off themselves — ask them to turn it back on.'
                                 : '🔇 ' + (_drNm || '학생') + ' 이(가) 스스로 마이크를 껐어요 — 다시 켜 달라고 말해 주세요.')
                    : _drOk
                        ? (_drEn ? '✅ ' + (_drNm || 'Student') + ' — mic picked up again' + (msg.data.label ? ' (' + msg.data.label + ')' : '')
                                 : '✅ ' + (_drNm || '학생') + ' — 마이크를 다시 잡았어요' + (msg.data.label ? ' (' + msg.data.label + ')' : ''))
                        : (_drEn ? '⚠ ' + (_drNm || 'Student') + ' — could not pick up the mic. Ask them to allow microphone permission.'
                                 : '⚠ ' + (_drNm || '학생') + ' — 마이크를 못 잡았어요. 학생에게 마이크 권한 허용을 부탁하세요.'));
            } catch(_){}
            break;
        }
        /* 🎛 (2026-08-10 장치 도우미 — BODA의 원격 장치설정을 웹으로) 강사 → 나: "장치 목록 보내줘"
           목록만 보낸다 — 아무것도 바꾸지 않는다. 몰래 이뤄지지 않도록 학생 화면에 토스트를 띄운다. */
        case 'device-list-req': {
            try {
                if (!msg.data || msg.data.targetUserId !== vcUserId) break;
                var _dlEn = (typeof getLang === 'function' && getLang() === 'en');
                var _dlNow = Date.now();
                if (!window.__vcDevHelpToastAt || _dlNow - window.__vcDevHelpToastAt > 60000) {
                    window.__vcDevHelpToastAt = _dlNow;
                    /* 🎛 (2026-08-12) 도움받는 쪽이 «강사» 일 수도 있다(재택 강사 지원) —
                       강사에게 「선생님이 도와주고 있어요」 는 어색해서 역할에 맞춰 말한다. */
                    var _dlStaff = (typeof vcIsStaffNow === 'function' && vcIsStaffNow());
                    try { if (typeof showToast === 'function') showToast(_dlStaff
                        ? (_dlEn ? '🎛 A staff member is checking your device setup with you.' : '🎛 다른 강사·관리자가 장치 설정을 함께 보고 있어요.')
                        : (_dlEn ? '🎛 Your teacher is helping with your device setup.' : '🎛 선생님이 장치 설정을 도와주고 있어요.')); } catch(_){}
                }
                vcDevHelpSendList();
            } catch(_){}
            break;
        }
        /* 🎛 강사 → 나: "이 장치로 바꿔줘". 이미 검증된 전환 함수(vcSwitchMic/vcSetCamDevice)를 그대로 탄다.
           음소거 해제는 절대 하지 않는다 — 장치를 바꿔도 켬/끔 상태(vcMicOn·강사 잠금)는 그대로 존중. */
        case 'device-set': {
            (async () => {
                try {
                    if (!msg.data || msg.data.targetUserId !== vcUserId) return;
                    var kind = msg.data.kind, devId = msg.data.deviceId;
                    if (!devId || (kind !== 'cam' && kind !== 'mic' && kind !== 'spk')) return;
                    var _dsEn = (typeof getLang === 'function' && getLang() === 'en');
                    var ok = false, reason = '';
                    if (kind === 'cam') {
                        var rc = await window.vcSetCamDevice(devId);
                        if (rc === 'deferred') { ok = true; reason = 'deferred'; }   // 화면 공유 중 → 끝나면 적용
                        else ok = (rc === true);
                    } else if (kind === 'mic') {
                        ok = (await vcSwitchMic(devId)) === true;
                        /* 강사가 전체 음소거 중이면 새 트랙도 무음이어야 한다 — 잠금이 장치 교체로 풀리면 안 됨 */
                        if (window.__vcMicLockedByTeacher) { try { vcLocalStream.getAudioTracks().forEach(function(t){ t.enabled = false; }); } catch(_){} }
                    } else {
                        ok = (await window.vcSetSpkDevice(devId)) === true;
                        if (!ok && !('setSinkId' in HTMLMediaElement.prototype)) reason = 'nosink';
                    }
                    var label = '';
                    try {
                        if (kind === 'cam') label = (vcLocalStream.getVideoTracks()[0] || {}).label || '';
                        else if (kind === 'mic') label = (vcLocalStream.getAudioTracks()[0] || {}).label || '';
                    } catch(_){}
                    /* 목록을 먼저, 결과를 나중에 — 강사 패널에서 최종 상태줄이 «결과»로 남게 하기 위한 순서다 */
                    try { await vcDevHelpSendList(); } catch(_){}
                    try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-set-result', data: { fromUserId: vcUserId, kind: kind, ok: ok, reason: reason, label: String(label).slice(0, 60) } }); } catch(_){}
                    if (ok && reason !== 'deferred') {
                        try { if (typeof showToast === 'function') showToast(_dsEn ? '🎛 Your teacher adjusted your device settings.' : '🎛 선생님이 장치 설정을 바꿔 줬어요.'); } catch(_){}
                    }
                } catch(e) { console.warn('[dev-help] set 실패:', e); }
            })();
            break;
        }
        /* 🎛 학생 → 강사: 장치 목록/교체 결과 — 패널이 열려 있으면 갱신 (staff 만) */
        case 'device-list': {
            try {
                if (!(typeof vcIsStaffNow === 'function' && vcIsStaffNow())) break;
                if (typeof vcDevHelpOnList === 'function') vcDevHelpOnList(msg.data || {});
            } catch(_){}
            break;
        }
        case 'device-set-result': {
            try {
                if (!(typeof vcIsStaffNow === 'function' && vcIsStaffNow())) break;
                if (typeof vcDevHelpOnResult === 'function') vcDevHelpOnResult(msg.data || {});
            } catch(_){}
            break;
        }
        case 'pdf-page-change':
            pdfGoToPage(msg.data.currentPage || msg.data.pageNum);
            break;
        case 'pdf-stop-share':
            pdfClearRemote();
            // 🥭 공유 종료 → 세로폰은 다시 '선생님 크게'로 복귀
            window.__vcPdfShared = false;
            // 🥭 (2026-08-06) 공유가 끊기면 화면엔 교재가 없다 → 대기 카드가 다시 나와야 한다.
            //   _vcCurrentPdfUrl 은 '지금 보고 있는 교재'의 유일한 흔적이라 여기서 같이 비운다.
            try { window._vcShownPdfUrl = ''; window._vcShownPdfKey = ''; window._vcCurrentPdfUrl = ''; } catch(_){}
            try { window.vcWaitCardSync && window.vcWaitCardSync(); } catch(_){}
            try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}
            break;

        // 📎 상대가 공유한 파일(워드/엑셀/PPT 등) — 다운로드 카드로 표시
        case 'file-share': {
            try {
                if (msg.data && msg.data.url && typeof fileShareNotice === 'function') fileShareNotice(msg.data, false);
                if (typeof showToast === 'function') showToast('📎 파일을 받았어요: ' + ((msg.data && msg.data.name) || ''));
            } catch(_){}
            break;
        }

        // 동영상 공유 — 양쪽 타입 모두 수신 (sender='video-share' 였음)
        // ⚠ 옛 코드는 sender 가 'video-share' 인데 receiver 는 'video-sync' 만 처리해서
        //    참가자 화면에 URL 이 영영 도달하지 못한 버그. 양쪽 다 받아 호환성 보장.
        case 'video-sync':
        case 'video-share': {
            const vUrl = msg.data.url;
            if (vUrl) window.vcApplySharedVideo(vUrl);   // 폴링과 동일 경로 — 중복 로드 없음
            break;
        }
        case 'video-stop-share':
            vpClearRemote();
            break;

        // 관찰자 전용 메시지: 새 참가자가 입장 → 관찰자가 offer 전송
        case 'observer-user-joined':
            if (vcIsObserver && msg.data.userId) {
                console.log('[vc-observer] 새 참가자 감지, offer 전송:', msg.data.userId);
                /* 👁 (2026-08-11) 빈 방이라 띄워 둔 «아직 아무도 없습니다» 를 여기서 걷는다.
                   사람이 들어왔는데 그 안내가 남아 있으면 그게 더 헷갈린다. */
                try { vcObserverBanner(''); } catch (_) {}
                vcCreatePeerAndOffer(msg.data.userId, msg.data.username);
            }
            break;

        // 관찰자 전용 메시지: 참가자 퇴장
        case 'observer-user-left':
            if (vcIsObserver && msg.data.userId) {
                console.log('[vc-observer] 참가자 퇴장:', msg.data.userId);
                vcRemovePeer(msg.data.userId);
            }
            break;
    }
}

/** 특정 사용자에 대한 P2P 연결을 생성하고 Offer를 보냅니다. */
async function vcCreatePeerAndOffer(userId, username) {
    try {
        // 이미 연결이 있으면 건너뜀 (중복 방지)
        if (vcPeerConnections[userId]) {
            console.log('[vc-webrtc] createPeerAndOffer: 이미 PC 존재 →', userId, '건너뜀');
            return;
        }
        console.log('[vc-webrtc] createPeerAndOffer →', userId, username);
        try { await vcEnsureIceServers(); } catch(_) {}   // TURN 자격증명 보장(없으면 3초 내 포기)
        const pc = vcCreatePeer(userId, username);
        const offer = await pc.createOffer();
        offer.sdp = vcTuneAudioSdp(offer.sdp);            // 🔊 Opus FEC — 패킷 손실에도 소리 유지
        await pc.setLocalDescription(offer);
        console.log('[vc-webrtc] offer 전송 →', userId, 'SDP type:', offer.type);
        vcConn.send({ type: 'offer', data: { targetUserId: userId, sdp: pc.localDescription } });
    } catch (e) {
        console.error('[vc-webrtc] createPeerAndOffer 에러:', e);
    }
}

/* 🔥🔋 모바일 발열 최소화 — 송신 비디오 코덱·비트레이트·fps 상한 + 백그라운드 절전
   · H.264/VP8(하드웨어 가속 코덱) 우선 → 인코딩을 칩이 대신 처리 = CPU·발열↓
   · 비트레이트·fps 상한 → 인코더가 풀가동하지 않게 함 (발열의 핵심 주범)
   · 휴대폰일 때만 강하게 적용, PC는 화질 우선                                   */
function vcApplyLowPower(pc) {
  var isMobile = window.matchMedia('(max-width: 920px)').matches
                 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

  // 1) 코덱 우선순위: H.264 → VP8 (offer 만들기 전에 적용해야 효과)
  try {
    if (window.RTCRtpReceiver && RTCRtpReceiver.getCapabilities) {
      var caps = RTCRtpReceiver.getCapabilities('video');
      if (caps && caps.codecs) {
        var pref = [], rest = [];
        ['video/H264', 'video/VP8'].forEach(function(m){
          caps.codecs.forEach(function(c){ if (c.mimeType.toLowerCase() === m.toLowerCase()) pref.push(c); });
        });
        caps.codecs.forEach(function(c){ if (pref.indexOf(c) < 0) rest.push(c); });
        var ordered = pref.concat(rest);
        pc.getTransceivers().forEach(function(tr){
          if (tr.sender && tr.sender.track && tr.sender.track.kind === 'video' && tr.setCodecPreferences) {
            try { tr.setCodecPreferences(ordered); } catch(_){}
          }
        });
      }
    }
  } catch(e){ console.warn('[lowpower codec]', e); }

  // 2) 송신 비트레이트·fps 상한 (모바일만 강하게)
  try {
    var sender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'video'; });
    if (sender && sender.getParameters) {
      var params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate   = (isMobile ? 500 : 1200) * 1000; // 모바일 500kbps
      params.encodings[0].maxFramerate = isMobile ? 15 : 24;
      /* 🎞 (2026-08-11) 'balanced' → 'maintain-framerate'.
         balanced 는 부하가 걸리면 «초당 장수» 도 함께 깎는다 → 강사가 신고한 "영상이 멈춘다".
         수업은 얼굴·입모양을 보는 일이라 잠깐 흐려지는 편이 멈추는 것보다 낫다. */
      params.degradationPreference = 'maintain-framerate';
      sender.setParameters(params).catch(function(e){ console.warn('[lowpower params]', e); });
    }
  } catch(e){ console.warn('[lowpower bitrate]', e); }

  // 3) 🔊 음성 우선 — 회선이 혼잡해도 영상보다 소리가 먼저 살아남게 (수업은 소리가 생명)
  try {
    var aSender = pc.getSenders().find(function(s){ return s.track && s.track.kind === 'audio'; });
    if (aSender && aSender.getParameters) {
      var ap = aSender.getParameters();
      if (!ap.encodings || !ap.encodings.length) ap.encodings = [{}];
      ap.encodings[0].priority = 'high';
      ap.encodings[0].networkPriority = 'high';
      aSender.setParameters(ap).catch(function(){});
    }
  } catch(e){ console.warn('[lowpower audio-prio]', e); }
}

/* 백그라운드(탭 전환·화면 끔)일 때 내 카메라 인코딩 정지 → 발열·배터리 절약.
   소리는 유지(수업 끊김 방지). 화면 돌아오면 자동 재개. 한 번만 등록.

   🔴 (2026-08-08 마이마이 지적 1·3·6번) 「구글을 열 때마다 / 교재를 열 때마다 / 카톡을 쓸 때마다
      교사 화면이 black-out 된다」— 세 증상은 서로 다른 버그가 아니라 **이 함수 하나** 였다.
      탭이 가려지는 순간 카메라 트랙을 꺼 버리니, 학생 화면에서 선생님 얼굴 자리가
      «설명 없는 검은 사각형» 이 됐다.
      원래 의도는 «학생 휴대폰» 의 발열·배터리 절약이다. 그런데 교사는 수업 중에 구글·카톡·교재를
      끊임없이 오간다 — 학생 폰에서 옳은 절약이 교사 PC 에서는 «선생님이 사라지는» 사고가 된다.
      → 강사·관리자는 이 절약에서 **제외**한다. 학생 모바일 절약은 그대로 둔다.
   ⚠️ 남는 한계: 가상배경을 켠 강사는 트랙을 살려 둬도 브라우저가 백그라운드 탭의
      requestAnimationFrame 을 멈추므로 화면이 **얼어붙을** 수 있다(검게 되지는 않는다).
      가상배경 쓰는 강사가 「멈춘다」고 하면 그때 원본 카메라로 갈아끼우는 처리를 넣을 것. */
(function vcBackgroundThrottle(){
  if (window.__vcBgThrottle) return; window.__vcBgThrottle = true;

  // 강사·관리자 판정은 정본 하나만 쓴다(vcIsStaffNow). 여기서 역할을 다시 추측하지 않는다.
  function staffNow(){
    try { return (typeof vcIsStaffNow === 'function') && !!vcIsStaffNow(); } catch(_){ return false; }
  }

  function setVideo(on){
    try {
      /* 🔒 되켤 때는 «원래 켜져 있던 사람» 만 켠다.
         예전엔 무조건 enabled = true 라, 카메라를 손수 꺼 둔 사람이 탭만 다녀오면
         **카메라가 저절로 다시 켜졌다**(동의 없는 재점등). 저대역 음성전용(AAO)이 끈 것도
         여기서 되살리면 안 된다 — 그건 회선이 회복될 때 AAO 가 스스로 복구한다. */
      if (on) {
        if (typeof vcCamOn !== 'undefined' && vcCamOn === false) return;
        if (window.__vcAAO && window.__vcAAO.active) return;
      }
      if (window.vcLocalStream) vcLocalStream.getVideoTracks().forEach(function(t){ t.enabled = on; });
      // 가상배경 ML 루프도 함께 정지/재개 (백그라운드 발열 차단)
      if (window.vcBg && vcBg.isProcessing !== undefined) {
        if (!on) { vcBg._wasProcessing = vcBg.isProcessing; vcBg.isProcessing = false; }
        else if (vcBg._wasProcessing) { vcBg.isProcessing = true; if (typeof vcBgRenderLoop === 'function') vcBgRenderLoop(); vcBg._wasProcessing = false; }
      }
      /* 📢 상대에게 «왜 꺼졌는지» 를 알린다. AAO 는 처음부터 이렇게 하고 있었다
         (그 주석: 안 알리면 상대 화면에서 «검은 영상 = 장애» 로 오인해 재협상이 돈다).
         이 절약만 조용히 꺼 왔던 탓에, 학생이 잠깐 탭을 옮기면 강사 화면엔
         이유 없는 검은 사각형만 남았다. 같은 신고가 반대 방향으로 또 오지 않게 여기서도 알린다. */
      try { if (typeof vcBroadcastCamState === 'function') vcBroadcastCamState(on, 'bgthrottle'); } catch(_){}
    } catch(_){}
  }

  /* 🔴 (2026-08-12 마이마이 재신고 「탭을 열 때마다 강사 영상이 꺼진다」)
     «강사가 아니면 끈다»(!staffNow) 로는 부족했다 — 역할이 아직 확정되지 않은 강사가
     «학생» 으로 오판돼 카메라가 꺼졌다. → 절약은 «확실한 학생»(정본 vcIsStudentNow)일 때만.
     ⚠️ 역할 추측을 여기서 하지 않는다 — 판정은 전부 정본(vcIsStaffNow/vcIsStudentNow)에 있다. */
  function studentNow(){
    try { if (typeof vcIsStudentNow === 'function') return !!vcIsStudentNow(); } catch(_){}
    return !staffNow();   // 정본이 없는 옛 환경에서는 종전 동작(강사 아님=학생) 유지
  }
  // 수업 중 + «확실한 학생»일 때만 동작 (강사는 탭을 옮겨도 얼굴이 계속 나간다)
  function active(){ return document.body.classList.contains('vc-in-call') && studentNow(); }

  document.addEventListener('visibilitychange', function(){
    if (!active()) return;
    setVideo(document.visibilityState === 'visible');
  });
  window.addEventListener('pagehide', function(){ if (active()) setVideo(false); });
  window.addEventListener('pageshow', function(){ if (active()) setVideo(true); });

  /* 🧊 (2026-08-08 강사 피드백 — HT Ness ③ 「카메라가 갑자기 꺼지고 · 영상이 멈춘다」)
     ─────────────────────────────────────────────────────────────────────────────
     여태 «남는 한계» 로만 적어 두고 손대지 않았던 것을 여기서 끝낸다.
     [원인] 가상배경을 켜면 송출 소스가 카메라가 아니라 **합성 캔버스**(captureStream)다.
       그 캔버스는 requestAnimationFrame 으로 그려지는데, 브라우저는 창이 가려지면
       rAF 를 멈춘다. 트랙은 살아 있으니 «꺼짐» 은 아니고 **마지막 프레임에서 얼어붙는다.**
       강사는 수업 중 구글·교재·카톡을 끊임없이 오간다 → 학생 화면에서 «선생님이 멈췄다».
       트랙이 살아 있으므로 어떤 워치독도 이걸 장애로 잡지 못한다(그래서 오래 남아 있었다).
     [해결] 가려지는 동안만 **원본 카메라 트랙**으로 갈아끼운다. 카메라는 백그라운드에서도
       프레임을 계속 낸다 → 배경만 잠깐 사라지고 얼굴은 계속 움직인다. 돌아오면 되돌린다.
     ⚠️ 재협상(renegotiation)은 하지 않는다 — replaceTrack 뿐이라 연결이 끊기지 않는다.
        (대역폭이 나쁜 상황에서 연결을 다시 맺는 것은 최악이다 — AAO 주석과 같은 이유)
     ⚠️ 얼굴꾸미기(vcFx)가 켜져 있으면 손대지 않는다 — 최종 송신 소스가 fx 캔버스라
        여기서 트랙을 바꾸면 vcFx 와 서로 sender 를 뺏는다. */
  (function vcBgFreezeGuard(){
    var swapped = false;
    function bgLive(){
      try { return !!(window.vcBg && vcBg.isProcessing && vcBg.originalVideoTrack
                      && vcBg.processedStream && !(window.vcFx && window.vcFx.active)); } catch(_){ return false; }
    }
    function toRaw(){
      if (swapped || !bgLive()) return;
      var t = vcBg.originalVideoTrack;
      if (!t || t.readyState !== 'live') return;
      swapped = true;
      try { vcSwapVideoTrack(t); } catch(_){ swapped = false; }
    }
    function toProcessed(){
      if (!swapped) return;
      swapped = false;
      try {
        var pt = vcBg.processedStream && vcBg.processedStream.getVideoTracks()[0];
        if (pt) vcSwapVideoTrack(pt);
        // rAF 가 멈춰 있던 동안 루프가 죽었을 수 있다 → 다시 돌린다(중복 호출은 rafId 로 막힌다)
        if (vcBg.isProcessing && !vcBg.rafId && typeof vcBgRenderLoop === 'function') vcBgRenderLoop();
      } catch(_){}
    }
    document.addEventListener('visibilitychange', function(){
      if (!document.body.classList.contains('vc-in-call')) return;
      if (document.hidden) toRaw(); else toProcessed();
    });
  })();
})();

/* 🔊 Opus 오디오 SDP 튜닝 — "소리가 잘 안 들려요" 대책.
   · useinbandfec=1 : 패킷 손실 시 다음 패킷에 실린 복원 데이터로 소리 재생(끊김·뭉개짐 大감소)
   · maxaveragebitrate=40000 : 음성 명료도 확보(기본 32k보다 여유), 대역폭 부담은 미미
   offer/answer 양쪽 setLocalDescription 직전에 적용. 실패해도 원본 SDP 그대로 반환. */
function vcTuneAudioSdp(sdp) {
    try {
        if (!sdp) return sdp;
        const m = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
        if (!m) return sdp;
        const pt = m[1];
        const fmtpRe = new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]*)');
        if (fmtpRe.test(sdp)) {
            sdp = sdp.replace(fmtpRe, function(_line, params) {
                let p = params;
                if (!/useinbandfec/.test(p)) p += ';useinbandfec=1';
                if (!/maxaveragebitrate/.test(p)) p += ';maxaveragebitrate=40000';
                if (!/usedtx/.test(p)) p += ';usedtx=1';   // 📶 무음 구간 전송 중단 → 저대역(필리핀) 업로드 절감
                return 'a=fmtp:' + pt + ' ' + p;
            });
        } else {
            sdp = sdp.replace(m[0], m[0] + '\r\na=fmtp:' + pt + ' useinbandfec=1;maxaveragebitrate=40000;usedtx=1');
        }
    } catch (e) { console.warn('[vc-sdp] 오디오 튜닝 실패(원본 사용):', e); }
    return sdp;
}

/* 📶 네트워크 적응 화질 조절기 — "화면이 깨졌다 꺼졌다 해요" 대책.
   4초마다 송신 통계(패킷 손실률·RTT)를 재서
   · 나쁘면(손실 >6% 또는 RTT >450ms) 비트레이트·fps 한 단계 하향 → 깨짐 대신 부드러운 저화질
   · 좋은 상태가 3틱(12초) 연속이면 한 단계 상향 복구 (진동 방지)
   단계: 100% → 60% → 35% → 20% (바닥 150kbps/10fps 보장) */
/* 🎛 (2026-07-23) 수업 화면 기본값 — 사장님 지시
   ① 영상 화질 기본 = '저'.  ⚠️ 그동안 설정의 화질 버튼(자동/고/저)은 **아무 동작도 하지 않았다**
      — vc-dock 이 window.vcSetQuality() 를 부르는데 그 함수가 아예 없어서 버튼 색만 바뀌었다.
   ② 전체화면 = 수업에 들어가면 자동. 설정에서 끄면 그 선택을 기억한다.
   화질은 '상한'만 정한다. 회선이 나빠지면 아래의 적응 로직이 더 낮출 수 있어야 하므로
   (수업이 끊기지 않는 것이 최우선) 위로만 막고 아래로는 열어 둔다. */
const VC_Q_KEY = 'mangoi_vc_quality', VC_FS_KEY = 'mangoi_vc_fullscreen';
function vcQualityMode() {
    try { const v = localStorage.getItem(VC_Q_KEY); if (v === 'auto' || v === 'high' || v === 'low') return v; } catch (_) {}
    return 'low';                       // 기본값 = 저화질 (데이터·CPU 절약, 필리핀 회선 고려)
}
/** 모드별 기본 상한 — 적응 로직은 이 값을 기준으로 더 낮추기만 한다.
    '저'는 화상수업 표준인 **360p·15fps** 를 노린다. 얼굴 위주 수업에서는 이 정도면 충분히 또렷하고,
    데이터는 자동(720p)의 1/3 수준으로 떨어진다.
    ⚠️ 더 낮추면(예: 10fps) 눈에 띄게 뚝뚝 끊겨 보인다 — 화질보다 '움직임'이 먼저 상한다. */
function vcQualityCaps() {
    const mobile = window.matchMedia('(max-width: 920px)').matches
                   || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    if (vcQualityMode() === 'low') return { br: (mobile ? 250 : 400) * 1000, fps: 15, scale: 2 };
    return { br: (mobile ? 500 : 1200) * 1000, fps: mobile ? 15 : 24, scale: 1 };
}
window.vcQualityCaps = vcQualityCaps;
/** 설정 팝업이 부르는 함수 (자동/고/저) */
window.vcSetQuality = function (mode) {
    if (mode !== 'auto' && mode !== 'high' && mode !== 'low') mode = 'auto';
    try { localStorage.setItem(VC_Q_KEY, mode); } catch (_) {}
    // 연결돼 있는 상대 모두에게 새 상한을 즉시 다시 적용 (단계는 그대로 두고 기준값만 바뀐다)
    try {
        Object.keys(vcPeerConnections || {}).forEach(function (id) {
            const pc = vcPeerConnections[id];
            if (!pc) return;
            if (window.__vcApplyStep) window.__vcApplyStep(pc, pc.__qStep || 0);
        });
    } catch (_) {}
    const c = vcQualityCaps();
    console.log('[vc-quality] 화질 모드 →', mode, Math.round(c.br / 1000) + 'kbps,', c.fps + 'fps, 해상도 1/' + c.scale);
};
window.vcGetQuality = vcQualityMode;

/* 🖥 전체화면 — 기본 켜짐. 설정에서 끄면 기억한다. */
window.vcWantFullscreen = function () {
    try { return localStorage.getItem(VC_FS_KEY) !== '0'; } catch (_) { return true; }
};
window.vcSetFullscreenPref = function (on) { try { localStorage.setItem(VC_FS_KEY, on ? '1' : '0'); } catch (_) {} };
window.vcGoFullscreen = function () {
    if (!window.vcWantFullscreen()) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;                   // iOS 사파리는 문서 전체화면을 지원하지 않는다 — 조용히 넘어감
    try {
        const p = req.call(el);
        if (p && p.catch) p.catch(vcArmFullscreenRetry);
    } catch (_) { vcArmFullscreenRetry(); }
};
/* 사용자 조작 없이 요청하면 브라우저가 막는다 → 다음 터치/클릭 때 한 번만 다시 시도 */
function vcArmFullscreenRetry() {
    if (window.__vcFsArmed) return; window.__vcFsArmed = true;
    const h = function () {
        document.removeEventListener('pointerdown', h, true);
        window.__vcFsArmed = false;
        setTimeout(function () { try { window.vcGoFullscreen(); } catch (_) {} }, 0);
    };
    document.addEventListener('pointerdown', h, true);
}

(function vcAdaptiveQuality() {
    if (window.__vcAdaptive) return; window.__vcAdaptive = true;
    const STEPS = [1.0, 0.6, 0.35, 0.2, 0.08];   // 4단계=얼굴만 (vc_lowstep_relay_harness)
    // 🎛 설정(자동/고/저)이 정한 기준 상한을 그대로 쓴다 — '저'면 처음부터 360p·15fps 로 시작한다
    function baseCaps() {
        try { if (window.vcQualityCaps) return window.vcQualityCaps(); } catch (_) {}
        const mobile = window.matchMedia('(max-width: 920px)').matches
                       || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
        return { br: (mobile ? 500 : 1200) * 1000, fps: mobile ? 15 : 24, scale: 1 };
    }
    const SCALE = [1, 1.5, 2, 3, 4];   // 단계별 해상도 축소 — 낮은 비트레이트에선 픽셀 수를 줄여야 깨짐(블록화) 대신 선명한 저해상도가 됨

    /* 🕐 (2026-08-11 강사 피드백 — "오디오 지연", "렉", "버퍼링")
       [빠져 있던 것] 보내는 쪽은 오래 다듬어 왔다(비트레이트 적응·Opus FEC/DTX·AAO).
         그런데 «받는 쪽» 은 한 번도 손대지 않았다. 브라우저의 지터버퍼는 회선이 한 번 흔들리면
         지연을 크게 잡고, 회선이 좋아져도 한동안 그 지연을 물고 있는다(수백 ms).
         강사가 말하는 "소리가 늦게 온다"의 상당 부분이 이 «물고 있는 지연» 이다.
       [왜 그냥 0 으로 낮추면 안 되나] 손실이 있는 회선(필리핀)에서 버퍼를 깎으면
         소리가 끊기고 튄다. 지연을 없애려다 «끊김»을 만드는 것 — 더 나쁜 교환이다.
       [그래서] 이 연결이 «지금 실제로 좋다»고 측정됐을 때만 낮추고, 나빠지면 즉시 손을 뗀다
         (null = 브라우저의 적응 알고리즘에 그대로 돌려줌). 판단 근거는 바로 아래 루프가
         이미 재고 있는 손실률·RTT 다 — 새로 재지 않는다.
       ⚠️ 두 API 모두 크롬 계열에만 있다. 없으면 아무 일도 하지 않는다(기능 감지). */
    function tuneReceiveLatency(pc, good) {
        try {
            if (!pc || !pc.getReceivers) return;
            if (pc.__rxLowLat === good) return;          // 상태가 그대로면 건드리지 않는다(불필요한 재설정 = 소리 튐)
            pc.__rxLowLat = good;
            pc.getReceivers().forEach(function (r) {
                if (!r || !r.track) return;
                var isAudio = r.track.kind === 'audio';
                /* 목표 지연(ms). 오디오는 대화라 최대한 낮추고, 영상은 조금 여유를 둔다
                   — 영상이 튀는 것보다 20~30ms 늦는 편이 수업에 낫다. */
                try { if ('jitterBufferTarget' in r) r.jitterBufferTarget = good ? (isAudio ? 0 : 100) : null; } catch (_) {}
                try { if ('playoutDelayHint' in r) r.playoutDelayHint = good ? 0 : null; } catch (_) {}
            });
            console.log('[vc-latency] 수신 지연', good ? '낮춤(회선 양호)' : '브라우저 자동(회선 불안정)');
        } catch (_) {}
    }
    window.__vcTuneReceiveLatency = tuneReceiveLatency;   // 하니스·진단에서 부를 수 있게

    function applyStep(pc, step) {
        try {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (!sender || !sender.getParameters) return;
            const caps = baseCaps();
            const mult = STEPS[step];
            const lo = step >= 4;   // 4단계만 하한을 낮춘다(앞 단계는 그대로)
            const params = sender.getParameters();
            if (!params.encodings || !params.encodings.length) params.encodings = [{}];
            params.encodings[0].maxBitrate   = Math.max(lo ? 60000 : 150000, Math.round(caps.br * mult));
            params.encodings[0].maxFramerate = Math.max(lo ? 5 : 10, Math.round(caps.fps * mult));
            params.encodings[0].scaleResolutionDownBy = (caps.scale || 1) * (SCALE[step] || 1);
            sender.setParameters(params).catch(() => {
                // 일부 구형 브라우저는 scaleResolutionDownBy 를 거부 → 해상도 축소 없이 비트레이트 상한만이라도 재적용
                try {
                    const p2 = sender.getParameters();
                    if (!p2.encodings || !p2.encodings.length) p2.encodings = [{}];
                    p2.encodings[0].maxBitrate   = Math.max(lo ? 60000 : 150000, Math.round(caps.br * mult));
                    p2.encodings[0].maxFramerate = Math.max(lo ? 5 : 10, Math.round(caps.fps * mult));
                    delete p2.encodings[0].scaleResolutionDownBy;
                    sender.setParameters(p2).catch(() => {});
                } catch (_) {}
            });
            console.log('[vc-adapt] 화질 단계', step, '→', Math.round(caps.br * mult / 1000) + 'kbps, 해상도 1/' + ((caps.scale || 1) * (SCALE[step] || 1)));
        } catch (_) {}
    }
    window.__vcApplyStep = applyStep;   // 설정의 화질 버튼(vcSetQuality)이 즉시 반영할 때 씀
    setInterval(function() {
        if (!document.body.classList.contains('vc-in-call')) return;
        Object.keys(vcPeerConnections).forEach(function(id) {
            const pc = vcPeerConnections[id];
            if (!pc || (pc.connectionState !== 'connected' && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed')) return;
            /* 🎛 설정에서 고른 상한을 새로 연결된 상대에게도 한 번 걸어 준다 */
            try { if (!pc.__qInit) { pc.__qInit = 1; applyStep(pc, pc.__qStep || 0); } } catch (_) {}
            const sender = pc.getSenders && pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (!sender || !sender.getStats) return;
            sender.getStats().then(function(stats) {
                let lost = 0, sent = 0, rtt = 0;
                stats.forEach(function(r) {
                    if (r.type === 'remote-inbound-rtp') {
                        lost = r.packetsLost || 0;
                        if (typeof r.roundTripTime === 'number') rtt = r.roundTripTime * 1000;
                    }
                    if (r.type === 'outbound-rtp') sent = r.packetsSent || 0;
                });
                const prev = pc.__qPrev || { lost: 0, sent: 0 };
                pc.__qPrev = { lost: lost, sent: sent };
                const dLost = Math.max(0, lost - prev.lost);
                const dSent = Math.max(0, sent - prev.sent);
                if (dSent + dLost < 25) { try { vcQualityAcc(-1, rtt); } catch (_) {} return; }  // 표본 부족(영상 꺼짐/죽음) — 화질 판단은 보류, 기록은 «영상 없음» 으로 남긴다(js/idx-vc-qlog.js)
                const lossPct = 100 * dLost / (dSent + dLost);
                let step = pc.__qStep || 0;
                /* 📉 (2026-09-01 class-1015 「처음과 뒷부분은 계속 흐리고 중간에 잠깐 좋았다」)
                   [무엇이 문제였나] 내려가는 데 최대 16초(4틱), 올라오는 데 12초(3틱)였다.
                     그런데 그 수업의 실측은 «1분에 한 번꼴로 20~27% 스파이크» 였다(D1 vc_quality 20건,
                     20분 중 17분이 최대손실 16%↑, 최악 60.6%). 그래서 내려가다 올라오기를 반복하는
                     «진동» 이 됐고, 사람 눈에는 「흐렸다 잠깐 좋았다 다시 흐림」으로 보였다.
                     1분 평균은 1.9% 라 어느 화면에서도 «양호» 였다 — 평균이 사고를 가린 것이다.
                   [고침] 회복을 «오래 조용했을 때만» 허용한다 — 연속 8틱(32초) + 마지막 스파이크로부터 30초.
                     ⛔ 내려가는 쪽은 그대로 둔다(빠르게 내려가는 것은 옳다).
                     ⛔ 숫자를 더 키우지 말 것 — 회선이 정말 좋아졌는데도 흐린 채로 남는다. */
                /* 🌏 (2026-09-02 class-849 강선생님 「흐려진 뒤 안 돌아온다」) RTT 문턱은 «이 연결의 기준값» 에 상대로 잰다.
                   중국 회선은 RTT 가 늘 360ms 안팎이라(D1 vc_quality 19분 내내 360~435ms, 손실 1% 미만) «250 미만» 회복
                   조건이 영영 안 맞았고, 450 초과 스파이크 한 번에 내려간 화질이 수업 끝까지 바닥에 남았다.
                   기준값 = 그 연결에서 본 최소 RTT(위로는 틱당 2% 씩만 따라감). 기준 150 미만 회선은 옛 숫자 그대로다.
                   ⛔ 손실 문턱은 안 건드린다 — «나쁜» 신호는 손실, RTT 는 «막힌» 신호라 기준 대비 증가분이 맞다.
                   ⛔ 기준 상한 500 을 풀지 말 것 — 풀면 어떤 회선이든 «막힘» 을 영영 못 본다. 감시: vc_quality_blindspot_harness ④-2 */
                if (rtt > 0) { const b = pc.__qRttBase; pc.__qRttBase = (b == null || rtt < b) ? rtt : b + (rtt - b) * 0.02; }
                const rb = Math.min(pc.__qRttBase || 0, 500);
                const rttDown = Math.max(450, rb + 200), rttUp = Math.max(250, rb + 100);
                if (lossPct > 6 || rtt > rttDown) {
                    pc.__qGood = 0; pc.__qBadAt = Date.now();
                    if (step < STEPS.length - 1) step++;
                } else if (lossPct < 1.5 && (rtt === 0 || rtt < rttUp)) {
                    pc.__qGood = (pc.__qGood || 0) + 1;
                    if (pc.__qGood >= 8 && Date.now() - (pc.__qBadAt || 0) > 30000 && step > 0) { step--; pc.__qGood = 0; }
                } else if (lossPct >= 1.5) {
                    pc.__qGood = 0;   // 손실이 있으면 «조용함» 을 처음부터 다시 센다. 손실 없이 RTT 만 애매(rttUp~rttDown)하면 지우지 않고 멈춘다 — 28초마다 흔들리는 회선이 영영 못 올라오던 것(④-2)
                }
                if (step !== (pc.__qStep || 0)) {
                    console.warn('[vc-adapt] 손실률', lossPct.toFixed(1) + '%, RTT', Math.round(rtt) + 'ms(기준 ' + Math.round(rb) + ') → 단계', pc.__qStep || 0, '→', step);
                    pc.__qStep = step;
                    applyStep(pc, step);
                }
                /* 🕐 받는 쪽 지연 — «지금 좋다»고 측정된 연결에서만 낮춘다(위 함수 주석 참조).
                   기준은 손실 1.5% 미만 + RTT 150ms 미만(절대값 — «정말 좋은 회선» 판정이라 기준 대비로 안 잰다).
                   한 번이라도 나빠지면 즉시 브라우저 자동으로 되돌아간다 = 끊김이 지연보다 우선. */
                /* 🔊 (2026-09-01) 「소리가 끊긴다」에 이 줄이 직접 걸린다.
                   기준이 «지금 이 4초가 좋다» 였다. 그런데 RTT 가 52~210ms 로 요동치는 회선에서는
                   스파이크 사이의 조용한 4초마다 이 값이 켜졌다 꺼졌다 한다 — 위 tuneReceiveLatency
                   주석이 스스로 경고하는 «불필요한 재설정 = 소리 튐» 이 1분에 몇 번씩 일어난 것이다.
                   ✅ 이제 화질 회복과 «같은 근거» 를 쓴다: 32초 연속 양호 + 스파이크 후 30초 + RTT 150ms 미만.
                      그만큼 조용한 적이 없는 회선에서는 아예 안 켜지고 브라우저의 적응 버퍼가 그대로 쓰인다
                      — 그게 손실 있는 회선에서 옳은 기본값이다(같은 주석의 «지연보다 끊김이 우선»). */
                try { tuneReceiveLatency(pc, step === 0 && (pc.__qGood || 0) >= 8 && Date.now() - (pc.__qBadAt || 0) > 30000 && lossPct < 1.5 && (rtt === 0 || rtt < 150)); } catch (_) {}
                try { vcQualityAcc(lossPct, rtt); } catch (_) {}   // 📶 회선품질 로깅 누적(fire-and-forget)
            }).catch(function() {});

            // 📶 저대역 자동 음성전용(AAO) — 오디오 손실 기준 판정(영상을 꺼도 오디오는 흐르므로 회복 감지가 신뢰됨).
            //   연결 재협상 없음(트랙 enabled 토글만) → 수업 절대 안 끊김. 오디오 손실 심하게 지속 → 영상 끔, 회복 → 복구.
            try {
                const aS = pc.getSenders && pc.getSenders().find(function(s){ return s.track && s.track.kind === 'audio'; });
                if (aS && aS.getStats) aS.getStats().then(function(ast) {
                    let al = 0, ap = 0, art = 0;
                    ast.forEach(function(r) {
                        if (r.type === 'remote-inbound-rtp') { al = r.packetsLost || 0; if (typeof r.roundTripTime === 'number') art = r.roundTripTime * 1000; }
                        if (r.type === 'outbound-rtp') ap = r.packetsSent || 0;
                    });
                    const apv = pc.__aPrev || { l: 0, p: 0 }; pc.__aPrev = { l: al, p: ap };
                    const adl = Math.max(0, al - apv.l), adp = Math.max(0, ap - apv.p);
                    if (adp + adl < 8) return;                              // 표본 부족(무음/DTX 등) → 판단 보류
                    const alp = 100 * adl / (adp + adl);
                    const A = window.__vcAAO || (window.__vcAAO = { active: false, sev: 0, good: 0 });
                    /* 🔊 (2026-09-01) 문턱 12% → 8%. class-1015 실측에서 이 구제장치가 20분 내내 «0회» 였다.
                       소리가 끊겨 말을 못 알아듣는데도 영상을 계속 보내고 있었다는 뜻이다.
                       ⛔ 더 낮추지 말 것 — 필리핀·중국 회선에서 멀쩡한 수업의 영상이 자꾸 꺼진다.
                          진입은 여전히 sev 3틱(12초) 연속이라 스파이크 한 번으로는 안 걸린다. */
                    if (alp > 8 || art > 600) { A.sev++; A.good = 0; }      // 오디오 8%↑ 손실/RTT 600ms↑ = 망 붕괴
                    else if (alp < 3) { A.good++; if (A.sev > 0) A.sev--; } // 회복
                    else { A.good = 0; }
                    /* 📉 두 판정이 같은 4초 주기라, 급격한 붕괴에선 AAO(3틱)가 최저 화질(4틱)보다
                       먼저 와서 «얼굴만» 단계가 한 번도 안 쓰인다. 2틱째에 미리 내려 8초를 벌어 준다. */
                    if (A.sev >= 2 && (pc.__qStep || 0) < STEPS.length - 1) { pc.__qStep = STEPS.length - 1; applyStep(pc, pc.__qStep); }
                    A.floor = (pc.__qStep || 0) >= STEPS.length - 1;
                    vcAAOApply();
                    // 📶 AAO 중엔 영상 통계가 없다 — 오디오 값으로 이어 적는다
                    if (A.active) { try { vcQualityAcc(alp, art); } catch (_) {} }
                }).catch(function(){});
            } catch (_) {}
        });
    }, 4000);
})();

/* 📶 저대역 자동 음성전용(AAO) 적용/복구 — vcLocalStream 영상트랙 enabled 토글(재협상 없음, vcBackgroundThrottle 와 동일 안전패턴).
   사용자가 수동으로 카메라를 꺼둔 경우(vcCamOn===false)엔 관여하지 않는다. sev>=3(≈12초)에서 진입, good>=8(≈32초)에서 복구.
   🔁 (2026-09-03 class-1016 Farrah↔ysyt01 「화면이 나왔다 안 나왔다」) 잰 것: D1 vc_quality 21분에 aao 칸이 0/1 을
      6번 교차(60초 점 표본이라 하한), RTT 600~1,200ms. [추론] 복구가 good>=2(8초)라 회선이 계속 흔들리면
      «끔 → 8초 뒤 켬 → 다시 끔» 이 된다 — 코드상 성립하는 기전이고 D1 로 증명된 것은 아니다.
      복구는 화질 회복(위 __qGood>=8)과 같은 틱 수(8틱=32초 연속 조용함)로 — 한 번 음성만으로 갔으면 안정될 때까지 머문다.
      ⚠️ 맞바꿈: 머무는 동안 영상 통계가 없어 화질 단계도 바닥에 머무므로, 복구 뒤 얼굴이 선명해지기까지는 전보다 길다.
      ⛔ 진입(sev>=3)은 그대로 — 더 빠르게 끄면 스파이크 한 번에 영상이 꺼진다. 감시: vc_quality_blindspot_harness ⑫ */
function vcAAOApply() {
    const A = window.__vcAAO; if (!A) return;
    if (typeof vcCamOn === 'undefined') return;
    if (!A.active && A.sev >= 3 && (A.floor || A.sev >= 5) && vcCamOn !== false) {
        A.active = true; A.good = 0;
        try { if (window.vcLocalStream) vcLocalStream.getVideoTracks().forEach(function(t){ t.enabled = false; }); } catch (_) {}
        try { if (window.vcBg && vcBg.isProcessing) { vcBg._aaoWas = true; vcBg.isProcessing = false; } } catch (_) {}
        /* 🌐 (2026-08-08 Ness ③ 「카메라가 갑자기 꺼진다」) 강사 다수가 필리핀이다.
           이 안내가 한국어뿐이라, 회선이 나빠 **일부러** 끈 것을 «고장» 으로 신고해 왔다.
           한/영을 함께 적는다 — 라벨만 영어이고 내용이 한국어면 읽을 수 없다(사장님 지시). */
        vcAAONotify('📶 <b>Your internet is weak — sending audio only for a moment.</b> The class continues; video returns automatically.<br>인터넷이 약해 잠시 <b>음성만</b> 전송합니다 — 수업은 계속되고, 회복되면 영상이 자동으로 돌아옵니다.');
        // 상대에게도 알린다. 안 알리면 상대 화면에서 '검은 영상 = 장애' 로 오인해 재협상이 돈다
        // (대역폭 위기 중에 연결을 다시 맺는 것은 최악의 선택이다).
        vcBroadcastCamState(false, 'aao');
        console.warn('[vc-aao] 음성전용 진입 (오디오 손실 지속)');
    } else if (A.active && A.good >= 8) {
        A.active = false; A.sev = 0;
        try { if (vcCamOn !== false && window.vcLocalStream) vcLocalStream.getVideoTracks().forEach(function(t){ t.enabled = true; }); } catch (_) {}
        try { if (window.vcBg && vcBg._aaoWas) { vcBg.isProcessing = true; if (typeof vcBgRenderLoop === 'function') vcBgRenderLoop(); vcBg._aaoWas = false; } } catch (_) {}
        vcAAONotify('📶 <b>Connection recovered — video is back on.</b><br>연결이 회복되어 <b>영상을 다시 켭니다</b>');
        vcBroadcastCamState(vcCamOn !== false, 'aao');   // 사용자가 따로 꺼 둔 상태면 그건 존중
        console.warn('[vc-aao] 영상 복구');
    }
}
var __vcAAOtoastT = null;
function vcAAONotify(html) {
    try {
        let el = document.getElementById('vc-aao-toast');
        if (!el) {
            el = document.createElement('div'); el.id = 'vc-aao-toast';
            el.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:99999;max-width:86vw;' +
                'background:rgba(15,23,42,.94);color:#e6edff;border:1px solid rgba(125,211,252,.45);border-radius:12px;' +
                'padding:10px 16px;font-size:14px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.5);text-align:center;' +
                'opacity:0;transition:opacity .2s;pointer-events:none';
            document.body.appendChild(el);
        }
        el.innerHTML = html; el.style.opacity = '1';
        if (__vcAAOtoastT) clearTimeout(__vcAAOtoastT);
        __vcAAOtoastT = setTimeout(function () { el.style.opacity = '0'; }, 4000);
    } catch (_) {}
}

/* 📶 회선품질 로깅 vcQualityAcc() 는 js/idx-vc-qlog.js (defer) 로 옮겼다 — 첫 화면 예산. 부르는 곳 3군데는 전부 try/catch 안이다. */

/** RTCPeerConnection을 생성합니다 (다자간 통화용). */
function vcCreatePeer(userId, username) {
    // 기존 PC가 있으면 정리 후 새로 생성
    if (vcPeerConnections[userId]) {
        console.log('[vc-webrtc] 기존 PC 정리:', userId);
        try { vcPeerConnections[userId].close(); } catch(_) {}
        delete vcPeerConnections[userId];
        delete vcPendingCandidates[userId];   // fix (2026-07-05) 재생성 시 오래된 후보 버퍼 폐기
    }

    console.log('[vc-webrtc] createPeer:', userId, username, 'ICE서버:', ICE_SERVERS.iceServers.length, '개');
    // 📶 연결 수립 시간 단축 설정 — 후보 사전수집(pool) + 단일 번들(포트 1개)로 ICE 검사쌍 최소화.
    //   iceCandidatePoolSize: PC 생성 즉시 후보를 미리 모아 offer/answer 후 곧바로 연결 검사 시작.
    // 📶 직접(P2P) 연결에 실패해 재연결하는 경우엔 TURN 릴레이만 강제 → restrictive 망(필리핀 모바일/CGNAT) 복구율↑.
    //   최초/건강한 연결엔 영향 없음(플래그 미설정). 성공 시 해제되어 다음엔 다시 직접부터 시도.
    const _pcCfg = {
        iceServers: ICE_SERVERS.iceServers,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceCandidatePoolSize: 2
    };
    if (__vcIceHasTurn && (window.__vcRelayAlways || (window.__vcForceRelay && window.__vcForceRelay[userId]))) {
        _pcCfg.iceTransportPolicy = 'relay';
        console.warn('[vc-webrtc] 🔁 relay 강제:', userId);
    }
    const pc = new RTCPeerConnection(_pcCfg);
    vcPeerConnections[userId] = pc;
    pc.__username = username;   // 이동 중 끊김 → 재연결 시 이름 복원용

    if (vcIsObserver) {
        // 관찰자: 미디어 전송 안 함, recvonly transceiver 추가
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        console.log('[vc-webrtc] 관찰자 모드: recvonly transceiver 추가');
    } else if (vcLocalStream) {
        const tracks = vcLocalStream.getTracks();
        console.log('[vc-webrtc] addTrack:', tracks.length, '개 (video:', vcLocalStream.getVideoTracks().length, ', audio:', vcLocalStream.getAudioTracks().length, ')');
        /* 🖥 (2026-08-12 Melca) 화면 공유 «도중» 입장한 사람에게는 카메라 대신 지금 공유 중인
           화면(그리고 소리 믹스)을 준다 — 예전엔 늦게 온 학생만 카메라를 받아
           "들어오면 보이게 됩니다" 안내와 반대로 영영 화면을 못 봤다. */
        tracks.forEach(t => {
            if (t.kind === 'video' && window.__vcScreenSharing
                && window.__vcScreenTrack && window.__vcScreenTrack.readyState === 'live') {
                pc.addTrack(window.__vcScreenTrack, vcLocalStream);
            } else if (t.kind === 'audio' && window.__vcScreenSharing
                && window.__vcScreenAudio && window.__vcScreenAudio.mixed && window.__vcScreenAudio.mixed.readyState === 'live') {
                pc.addTrack(window.__vcScreenAudio.mixed, vcLocalStream);
            } else {
                pc.addTrack(t, vcLocalStream);
            }
        });
        // 🔥 발열 최소화 — 송신 비디오에 효율 코덱(H.264/VP8) 우선 + 비트레이트·fps 상한
        try { vcApplyLowPower(pc); } catch(e) { console.warn('[lowpower]', e); }
    } else {
        console.warn('[vc-webrtc] ⚠ localStream 없음! 상대방에게 미디어가 전송되지 않음');
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('[vc-webrtc] ICE candidate 전송:', userId, event.candidate.type || 'unknown', event.candidate.protocol || '');
            vcConn.send({ type: 'ice-candidate', data: { targetUserId: userId, candidate: event.candidate } });
        } else {
            console.log('[vc-webrtc] ICE gathering 완료:', userId);
        }
    };

    pc.onicegatheringstatechange = () => {
        console.log('[vc-webrtc] ICE gathering(' + userId + '):', pc.iceGatheringState);
    };

    pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        console.log('[vc-webrtc] ICE(' + userId + '):', st);
        // 화면에 ICE 상태 표시
        const iceEl = document.getElementById('vc-ice-status');
        if (iceEl) {
            const labels = { 'new':'🔄연결중','checking':'🔍탐색중','connected':'✅연결됨','completed':'✅완료','failed':'❌실패','disconnected':'⚠끊김','closed':'🔒닫힘' };
            iceEl.textContent = 'v2.1 P2P:' + (labels[st] || st);
            iceEl.style.color = (st==='connected'||st==='completed') ? '#4CAF50' : st==='failed' ? '#f44336' : '#ff9800';
        }
        if (st === 'connected' || st === 'completed') {
            console.log('[vc-webrtc] ✅ ICE 연결 성공:', userId);
            try { if (window.__vcForceRelay) delete window.__vcForceRelay[userId]; } catch(_) {}   // 성공 → 다음엔 다시 직접연결부터 시도
        }
        if (st === 'failed') {
            console.warn('[vc-webrtc] ❌ ICE 실패 → 재연결:', userId);
            try { (window.__vcForceRelay || (window.__vcForceRelay = {}))[userId] = true; } catch(_) {}   // 다음 재연결은 TURN 릴레이 강제(직접 실패 → 릴레이가 더 확실)
            try { pc.restartIce(); } catch(_) {}      // 가벼운 시도 먼저
            vcReconnectPeer(userId);                   // 실제 복구(PC 재생성 + offer 재전송)
        }
        if (st === 'disconnected') {
            console.warn('[vc-webrtc] ⚠ ICE 끊김:', userId, '5초 후 재시도');
            try { pc.restartIce(); } catch(_) {}      // 일시적 끊김은 restartIce 로 회복될 수도
            setTimeout(() => {
                if (vcPeerConnections[userId] === pc && pc.iceConnectionState === 'disconnected') {
                    console.warn('[vc-webrtc] ICE 여전히 끊김 → 재연결:', userId);
                    vcReconnectPeer(userId);
                }
            }, 5000);
        }
    };

    pc.onconnectionstatechange = () => {
        console.log('[vc-webrtc] conn(' + userId + '):', pc.connectionState);
        if (pc.connectionState === 'connected') {
            console.log('[vc-webrtc] ✅ P2P 연결 완료!', userId);
        }
        if (pc.connectionState === 'failed') {
            console.error('[vc-webrtc] ❌ P2P 연결 실패:', userId);
            /* 🔧 (2026-07-21) 예전엔 로그만 남기고 복구를 안 했다.
               복구 로직이 전부 iceConnectionState 에만 걸려 있어서, ICE 는 붙었는데
               그 뒤 DTLS 단계에서 깨지는 경우(connectionState=failed, ice 는 connected 유지)
               아무도 손대지 않아 그 학생 화면만 수업 내내 죽어 있었다.
               vcReconnectPeer 는 8초 쿨다운·수업중 가드가 있어 반복 호출에 안전하다. */
            try { pc.restartIce && pc.restartIce(); } catch (_) {}
            try { vcReconnectPeer(userId); } catch (_) {}
        }
    };

    pc.ontrack = (event) => {
        console.log('[vc-webrtc] ★ ontrack!', userId, event.track.kind, 'streams:', event.streams.length);
        // fix (2026-06-01) — ontrack 은 오디오/비디오 트랙마다 따로 호출됨.
        //   브라우저가 묶어준 streams[0] 이 있으면 그걸 쓰고, 없으면 유저별 영속 스트림에 트랙을 누적.
        //   (예전엔 트랙마다 new MediaStream 을 만들어 비디오가 누락 → 원격 화면이 검게 나왔음)
        let stream = event.streams && event.streams[0];
        if (!stream) {
            stream = vcRemoteStreams[userId];
            if (!stream) { stream = new MediaStream(); vcRemoteStreams[userId] = stream; }
            try { if (!stream.getTracks().some(t => t.id === event.track.id)) stream.addTrack(event.track); } catch(_){}
        } else {
            vcRemoteStreams[userId] = stream;
        }
        vcAddRemoteVideo(userId, username, stream);
        /* 🔊 (2026-08-08 마이마이 ④) 「처음 입장하면 학생이 소리가 안 들린다 — 조금 기다리니 들렸다」
           [원인] 오디오 트랙이 도착하는 이 자리에서 «소리 살리기»(vcEnsureRemoteAudio)를
                  **한 번도 부르지 않았다.** 원격 <video> 는 붙자마자 muted/paused 인 채라,
                  3초마다 도는 오디오 워치독이 뒤늦게 살려낼 때까지 몇 초 동안 조용했다.
                  「소리 켜기」 버튼이 안 뜬 것도 같은 이유 — 그건 «정책에 막혔을 때» 뜨는 것이지
                  «아직 아무도 재생을 시도하지 않은» 상태에는 뜨지 않는다.
           [수정] 트랙이 오는 그 순간 바로 살린다. 300ms 뒤 한 번 더 — <video> 에 srcObject 가
                  붙는 타이밍이 기기마다 조금씩 달라, 첫 시도가 빈 엘리먼트를 만날 수 있다.
           ⛔ 자동재생 정책에 막히는 경우까지 여기서 해결되지는 않는다(그건 사용자 터치가 필요).
              그 경로는 기존 워치독·배너가 그대로 담당한다 — 여기서는 «막히지도 않았는데
              그냥 조용했던» 몇 초를 없앤다. */
        if (event.track && event.track.kind === 'audio') {
            try { vcEnsureRemoteAudio(); } catch(_){}
            setTimeout(function(){ try { vcEnsureRemoteAudio(); } catch(_){} }, 300);
        }
        // 트랙이 늦게 도착(예: 비디오)해도 화면 갱신되도록 약간 뒤 한 번 더 시도
        // ⚠️ (2026-07-24) 예전엔 unmute 마다 vcAddRemoteVideo() 전체를 다시 돌렸다. 그런데 상대가
        //   마이크/카메라를 껐다 켤 때마다 unmute 가 뜨므로, 그때마다 타일 재부착·감시루프 재등록·
        //   채팅 대상칩 전체 재생성(innerHTML='')이 일어나 화면이 번쩍였다.
        //   → 이미 영상이 붙어 있으면 재생만 보장하고, 진짜로 비어 있을 때만 전체를 다시 그린다.
        try {
            event.track.onunmute = function(){
                try {
                    // 🔊 (2026-08-08 ④) 상대가 마이크를 껐다 켠 경우도 같은 구멍이었다 — 여기서도 살린다.
                    if (event.track.kind === 'audio') { try { vcEnsureRemoteAudio(); } catch(_){} }
                    var _box = document.getElementById('vc-video-' + userId);
                    var _v = _box && _box.querySelector('video');
                    if (_v && _v.srcObject) { var _p = _v.play(); if (_p && _p.catch) _p.catch(function(){}); return; }
                    vcAddRemoteVideo(userId, username, vcRemoteStreams[userId] || stream);
                } catch(_){}
            };
        } catch(_){}
        // 🆕 교사(원격 참가자) 영상 도착 → 자동 이등분(1/2)
        if (event.track && event.track.kind === 'video' && !window.__vcAutoHalfDone) {
            window.__vcAutoHalfDone = true;
            setTimeout(function(){ try{ var _hb=document.querySelector('.video-size-bar button[onclick*="half"]'); window.vcSetVideoSize && window.vcSetVideoSize('half', _hb); }catch(_){} }, 800);
        }
    };

    return pc;
}

/** Offer 수신 처리 (글레어 방지 포함) */
async function vcHandleOffer(data) {
    try {
        const fromId = data.fromUserId;
        const fromName = data.fromUsername || '참가자';
        console.log('[vc-webrtc] offer 수신 from:', fromId, fromName);

        // 글레어(Glare) 처리: 양쪽이 동시에 offer를 보낸 경우
        // → userId가 작은 쪽이 offer를 취소하고 answer로 응답
        const existingPc = vcPeerConnections[fromId];
        if (existingPc && existingPc.signalingState === 'have-local-offer') {
            // 양쪽 다 offer를 보낸 상태 (글레어)
            if (vcUserId < fromId) {
                // 내 ID가 작으면: 내 offer를 취소하고, 상대 offer에 answer
                console.log('[vc-webrtc] 글레어 감지! 내 offer 취소, 상대 offer 수락:', fromId);
                await existingPc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                vcFlushPendingIce(fromId, existingPc);
                const answer = await existingPc.createAnswer();
                answer.sdp = vcTuneAudioSdp(answer.sdp);   // 🔊 Opus FEC
                await existingPc.setLocalDescription(answer);
                vcConn.send({ type: 'answer', data: { targetUserId: fromId, sdp: existingPc.localDescription } });
                return;
            } else {
                // 내 ID가 크면: 상대 offer 무시 (내 offer가 우선)
                console.log('[vc-webrtc] 글레어 감지! 내 offer 유지, 상대 offer 무시:', fromId);
                return;
            }
        }

        // 기존 PC가 있으면 정리
        try { await vcEnsureIceServers(); } catch(_) {}   // TURN 자격증명 보장(없으면 3초 내 포기)
        const pc = vcCreatePeer(fromId, fromName);
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        vcFlushPendingIce(fromId, pc);
        const answer = await pc.createAnswer();
        answer.sdp = vcTuneAudioSdp(answer.sdp);          // 🔊 Opus FEC — 패킷 손실에도 소리 유지
        await pc.setLocalDescription(answer);
        console.log('[vc-webrtc] answer 전송 →', fromId, 'SDP type:', answer.type);
        vcConn.send({ type: 'answer', data: { targetUserId: fromId, sdp: pc.localDescription } });
    } catch (e) {
        console.error('[vc-webrtc] handleOffer 에러:', e);
    }
}

/** Answer 수신 처리 */
async function vcHandleAnswer(data) {
    try {
        console.log('[vc-webrtc] answer 수신 from:', data.fromUserId);
        const pc = vcPeerConnections[data.fromUserId];
        if (pc) {
            if (pc.signalingState !== 'have-local-offer') {
                console.warn('[vc-webrtc] answer 수신 but signalingState:', pc.signalingState, '→ 무시');
                return;
            }
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            vcFlushPendingIce(data.fromUserId, pc);
            console.log('[vc-webrtc] ✅ answer 적용 완료:', data.fromUserId);
        } else {
            console.warn('[vc-webrtc] answer 수신 but PC 없음:', data.fromUserId);
        }
    } catch (e) {
        console.error('[vc-webrtc] handleAnswer 에러:', e);
    }
}

/** remoteDescription 준비 후 버퍼된 ICE 후보 일괄 투입 */
function vcFlushPendingIce(userId, pc) {
    const q = vcPendingCandidates[userId];
    if (!q || !q.length) return;
    console.log('[vc-webrtc] 버퍼된 ICE 후보 flush:', userId, q.length + '개');
    q.forEach((c) => { pc.addIceCandidate(c).catch((e) => console.warn('[vc-webrtc] flush ICE 실패:', e && e.name)); });
    delete vcPendingCandidates[userId];
}

/** ICE Candidate 수신 처리 */
async function vcHandleIce(data) {
    const pc = vcPeerConnections[data.fromUserId];
    if (!pc || !data.candidate) {
        if (!pc) console.warn('[vc-webrtc] ICE candidate 수신 but PC 없음:', data.fromUserId);
        return;
    }
    // fix (2026-07-05) — remoteDescription 이 아직 없으면 즉시 addIceCandidate 하면 예외로 유실됨.
    //   버퍼에 담아뒀다가 offer/answer 적용 직후 vcFlushPendingIce 로 투입 → 간헐 연결 실패 방지.
    if (!pc.remoteDescription || !pc.remoteDescription.type) {
        (vcPendingCandidates[data.fromUserId] = vcPendingCandidates[data.fromUserId] || []).push(data.candidate);
        return;
    }
    try {
        await pc.addIceCandidate(data.candidate);
    } catch(e) {
        console.warn('[vc-webrtc] ICE candidate 추가 실패:', data.fromUserId, e.message);
    }
}

/** 원격 참가자의 비디오를 화면에 추가 */
// 🥭 (2026-07-05) 참가자가 방에 들어오면 '영상이 오기 전이라도' 이름표가 있는 박스를 미리 만든다.
//   → 학생이 카메라를 못 켜거나 P2P가 늦어도, 강사 화면에 학생이 보이고 칭찬 버튼/바구니가 즉시 뜬다.
//   실제 영상은 나중에 vcAddRemoteVideo(ontrack)가 이 박스의 <video>에 srcObject 만 채운다.
function vcEnsureParticipantBox(userId, username){
    if (!userId || userId === vcUserId) return null;
    if (userId !== 'demoteacher') { try { vcRemoveDemoTeacher(); } catch (e) {} }   // 🆕 진짜 참가자 입장 → 시연 선생님 제거
    var existing = document.getElementById('vc-video-' + userId);
    if (existing) {
        var lbl0 = existing.querySelector('.video-label'); if (lbl0 && username) lbl0.textContent = username;
        try { existing.dataset.role = (window.vcPeerRoles && window.vcPeerRoles[userId]) || existing.dataset.role || 'student'; } catch(e){}
        return existing;
    }
    var grid = document.getElementById('vc-video-grid'); if (!grid) return null;
    var box = document.createElement('div');
    box.className = 'video-box';
    box.id = 'vc-video-' + userId;
    try { box.dataset.role = (window.vcPeerRoles && window.vcPeerRoles[userId]) || 'student'; } catch(e){}
    box.innerHTML = '<video autoplay playsinline muted></video>' +
        '<span class="video-label">' + escHtml(username || '참가자') + '</span>' +
        '<div class="vc-connecting-hint">📷 연결 중…</div>';
    if (window.vcSoloMode) box.style.display = 'none';
    vcInsertBoxTeacherFirst(grid, box);   // 🧑‍🏫 상대 타일은 항상 내 타일 위
    try { vcUpdateGridCount(); } catch(e){}
    try { window.vcApplySpotlight && window.vcApplySpotlight(); } catch(e){}
    try { vcRefreshPraiseUI(); } catch(e){}   // 별 버튼/로스터 즉시 반영
    try { vcAddDmButton(box, userId); vcRefreshChatTargets(); } catch(e){}   // 🔒 개별채팅 버튼/칩
    return box;
}
/* 🧑‍🏫 (2026-07-14 사장님 지시) 학생 입장 시 '교사 얼굴이 맨 위 + 크게'.
   원격(상대) 타일을 항상 내 박스(#vc-local-box) 앞에 삽입해 어떤 레이아웃에서도
   상대가 위에 오게 한다. (CSS order 규칙과 이중 안전장치) */
function vcInsertBoxTeacherFirst(grid, box) {
    try {
        const lb = document.getElementById('vc-local-box');
        if (lb && lb.parentNode === grid) { grid.insertBefore(box, lb); return; }
    } catch (_) {}
    grid.appendChild(box);
}
function vcAddRemoteVideo(userId, username, stream) {
    if (userId !== 'demoteacher') { try { vcRemoveDemoTeacher(); } catch (e) {} }   // 🆕 진짜 원격영상 도착 → 시연 선생님 제거
    // 🇵🇭 (2026-07-24) 원격 영상이 들어왔다 = 상대가 (새 userId 로) 돌아왔다
    //   → 순단 때 남겨 둔 '재연결 중' 유령 타일을 즉시 치운다. 안 치우면 타일이 두 개로 보인다.
    try { if (document.querySelector('.video-box[data-vc-ghost="1"]')) vcSweepGhostTiles(); } catch (_) {}
    /* 👁 (2026-08-12) 영상이 늦게라도 도착하면 «영상이 안 온다» 배너를 걷는다.
       10초 감시가 이미 띄운 뒤에 TURN 경유로 붙는 경우가 있다 — 그때 경고가 남아 있으면 거짓말이 된다.
       ⚠️ 이 블록을 위의 vcSweepGhostTiles() «앞» 으로 옮기지 말 것 — vc_chat_blink_drop_harness 가
          「function vcAddRemoteVideo 뒤 400자 안에 vcSweepGhostTiles()」 로 검사한다(실제로 한 번 깨뜨림). */
    try { if (window._vcObserverMode) vcObserverBanner(''); } catch (_) {}
    // 이미 존재하는 비디오가 있으면 스트림만 교체 (미리 만든 placeholder 박스 포함)
    const existing = document.getElementById(`vc-video-${userId}`);
    if (existing) {
        const existingVid = existing.querySelector('video');
        if (existingVid) {
            // fix (2026-06-01) — 같은 스트림이어도 항상 play() 한번 더 호출(늦게 온 비디오 트랙 렌더 보장)
            if (existingVid.srcObject !== stream) existingVid.srcObject = stream;
            existingVid.play().catch(e => console.warn('[vc] 기존 비디오 play 실패:', e && e.name));
            // 🔊 보조 오디오 경로 사용 중이면 새 스트림의 오디오 트랙으로 갱신(재연결 후 무음 방지)
            try {
                const aux0 = document.getElementById('vc-aud-' + userId);
                if (aux0) {
                    const at0 = stream.getAudioTracks ? stream.getAudioTracks() : [];
                    if (at0.length) { aux0.srcObject = new MediaStream(at0); const ap0 = aux0.play(); if (ap0 && ap0.catch) ap0.catch(()=>{}); }
                }
            } catch(_) {}
        }
        var hint0 = existing.querySelector('.vc-connecting-hint'); if (hint0) hint0.remove();   // 영상 도착 → "연결 중" 제거
        try { attachStreamMonitor(existing, stream); } catch(e){}
        try { vcRefreshPraiseUI(); } catch(e){}
        try { vcAddDmButton(existing, userId); vcRefreshChatTargets(); } catch(e){}   // 🔒 개별채팅 버튼/칩
        return;
    }
    const grid = document.getElementById('vc-video-grid');
    const box = document.createElement('div');
    box.className = 'video-box';
    box.id = `vc-video-${userId}`;
    try { box.dataset.role = (window.vcPeerRoles && window.vcPeerRoles[userId]) || 'student'; } catch(e){}
    box.innerHTML = `<video autoplay playsinline muted></video><span class="video-label">${escHtml(username)}</span>`;
    const vid = box.querySelector('video');
    vid.srcObject = stream;
    try { vcApplySavedSink(vid); } catch(e){}   // 🔊 장치 도우미로 고른 스피커를 새 타일도 물려받음
    // fix (2026-06-01) — 메타데이터 로드/트랙 도착 시 재생 재시도(원격 영상 검게 나오던 문제 보강)
    vid.onloadedmetadata = () => { vid.play().catch(()=>{}); };
    // 🧑‍🏫 (2026-07-14 사장님 지시) 상대(교사) 타일은 항상 내 타일보다 '위' — 내 박스 앞에 삽입
    vcInsertBoxTeacherFirst(grid, box);
    vcUpdateGridCount();
    try { window.vcApplySpotlight && window.vcApplySpotlight(); } catch(e){}
    // fix — 솔로 모드 중 새로 입장한 참가자도 숨겨, "솔로인데 일부만 보이는" 반쪽 상태 방지
    if (window.vcSoloMode) box.style.display = 'none';
    // 모바일 자동재생 정책 대응: muted로 시작 → 재생 후 unmute
    // fix (2026-07-13) — 예전엔 500ms 뒤 '딱 한 번'만 음소거 해제 → 정책이 조용히 막으면 영원히 무음.
    //   재시도 사다리(0.4s/1.2s/2.8s/5s) + volume=1 강제 + unmute가 재생을 멈추면 즉시 play 재시도.
    vid.play().then(() => {
        const tryUnmute = (n) => {
            // 🔊 증폭 중(vcOutBoost)엔 이 타일 소리가 WebAudio 게인으로 나간다(요소는 일부러
            //    muted). 여기서 되살리면 같은 트랙이 요소+게인으로 «두 번» 재생돼 최대 4배가
            //    되고, 다시 음소거해 줄 계기가 없다 — 재접속·강제 재연결마다 재현(2026-08-27).
            //    vcEnsureRemoteAudio(1598행)·vcAudioWatchdog 과 같은 규칙.
            if (window.vcOutBoost) return;
            try {
                vid.volume = vcOutVol();
                vid.muted = false;
                if (vid.paused) vid.play().catch(() => {});
            } catch(_) {}
            if (n < 3 && (vid.muted || vid.paused)) setTimeout(() => tryUnmute(n + 1), 800 * (n + 1));
        };
        setTimeout(() => tryUnmute(0), 400);
        console.log('[vc] 원격 비디오 재생 시작:', userId);
    }).catch(e => {
        console.warn('[vc] 원격 비디오 자동재생 실패:', e.message);
        // 자동재생 실패 시 유저 클릭으로 재생하도록 안내
        const playBtn = document.createElement('button');
        playBtn.textContent = '▶ 재생';
        playBtn.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;padding:8px 16px;font-size:16px;background:#4CAF50;color:#fff;border:none;border-radius:8px;cursor:pointer;';
        playBtn.onclick = () => { vid.muted = false; vid.play(); playBtn.remove(); };
        box.style.position = 'relative';
        box.appendChild(playBtn);
    });
    attachStreamMonitor(box, stream);
    vcAddDetachButton(box);
    try { vcAddStarButton(box, userId); } catch(e){}
    try { vcAddDevBtn(box, userId); } catch(e){}   // 🎛 장치 도우미 (강사 화면에서만 붙음)
    try { vcAddDmButton(box, userId); vcRefreshChatTargets(); } catch(e){}   // 🔒 개별채팅 버튼/칩
}

// 🌟 (2026-07-04) 실시간 칭찬 포인트 — 강사 화면에서만, 학생(원격) 비디오 박스마다 별 버튼을 붙임
// 🔧 (2026-07-05) 강사 판별 강화 — 로그인 role 뿐 아니라 URL 파라미터(vc_role), localStorage,
//   MangoV3, 그리고 자동입장처럼 로그인이 없을 때를 대비해 '이름 휴리스틱(교사/강사/선생님/teacher)'
//   까지 함께 본다. 하나라도 강사로 판단되면 강사 UI(별 버튼)를 보여준다.
function vcIsTeacherRole(){
    try {
        var r = '';
        var _u0 = null;
        try { _u0 = (typeof getCurrentUser === 'function') ? getCurrentUser() : null; if (_u0 && _u0.role) r = _u0.role; } catch(e){}
        // 🎭 (2026-08-08 Ana ①) 저장된 역할은 «주인이 맞을 때만» 쓴다 — 공용 PC 에 남은 강사 역할이
        //    다음 학생에게 넘어가던 경로. 자세한 이유는 vcRoleStored 주석 참고.
        if (!r) { try { r = window.vcRoleStored ? window.vcRoleStored() : ''; } catch(e){} }
        if (!r) { try { if (window.MangoV3 && window.MangoV3.user && window.MangoV3.user.role) r = window.MangoV3.user.role; } catch(e){} }
        if (!r) r = window.vcMyRole || '';
        if (r === 'teacher' || r === 'admin') return true;
        /* 🚫 (2026-08-12 Melca 6번 「학생 화면에 자물쇠 아이콘이 보인다」)
           역할이 **이미 정해져 있으면** 이름 추측을 쓰지 않는다.
           이름 휴리스틱은 «아무 정보도 없을 때» 쓰는 마지막 수단인데, 아래 두 경우에
           정해진 답을 덮어써 학생에게 강사 칩(🔒 필기 잠금·🔒 배경 잠금 등)을 보여 줬다.
             ① ?vc_role=student 로 «학생» 이라고 URL 이 명시했는데도 이름에 teacher 가 있어 승격
             ② 서버가 «이 예약의 학생» 이라 판정해 vcMyRole 을 student 로 내렸는데(2627행)
                로그인이 없어 여기서 다시 올라감 — 서버의 결정이 조용히 뒤집혔다
           🔑 «내리는» 쪽으로만 작동하므로 진짜 강사가 못 들어오는 일은 없다.
              역할이 아직 비어 있으면(r === '') 예전처럼 이름으로 백업 판정한다. */
        if (r === 'student' || r === 'observer') return false;
        if (window.__vcRoleFromUrl) return false;
        /* 🚫 이름 휴리스틱은 «로그인이 아예 없을 때» 만. 로그인한 사람에게 쓰면
           아이디에 teacher 가 들어간 학생이 강사 권한을 갖는다(반 전체 교재를 넘길 수 있다). */
        if (_u0) return false;
        // 로그인 없이 자동입장한 경우: 이름에 교사/강사/선생님/teacher 등이 있으면 강사로 간주
        var name = ((typeof vcUsername !== 'undefined' && vcUsername) || '') + '';
        if (/교사|강사|선생님|teacher|tutor/i.test(name)) return true;
    } catch(e){}
    return false;
}
/* 🎭 (2026-08-07) 강사·관리자 판정의 «정본» — 강사 전용 기능은 전부 이걸 쓴다.
   [왜 하나로 묶는가] 예전엔 곳곳이 제각각이었다. 칩 노출은 vcIsTeacherRole 을 OR 로 봤는데
   실제 동작(화면공유 실행·교재 페이지 넘김)은 window.vcMyRole 정확일치만 봤다.
   그래서 «버튼은 보이는데 누르면 선생님만 쓸 수 있다고 거절당하는» 어긋남이 났다. */
window.vcIsStaffNow = function(){
    try {
        if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') return true;
        return (typeof vcIsTeacherRole === 'function') ? !!vcIsTeacherRole() : false;
    } catch(e){ return false; }
};
/* 🎭 (2026-08-13) 학생 판정의 «정본» — 배터리 절전 등 «학생일 때만» 거는 기능은 전부 이걸 쓴다.
   [왜 별도로 두는가] «강사가 아니면 학생»(!vcIsStaffNow) 판정은 역할이 아직 확정되지 않은
   강사(로그인은 됐지만 role 이 빈 값, vcMyRole 미설정 입장 경로)를 학생으로 오판해
   탭 전환마다 강사 카메라를 꺼 버렸다(필리핀 매니저 재신고 8/10).
   → «확실한 학생»만 true. 역할이 불확실하면 false — 학생 배터리를 조금 못 아끼는 것이
   강사 얼굴이 검게 되는 사고보다 싸다. 역할 추측은 이 정본 안에서만 한다. */
window.vcIsStudentNow = function(){
    try {
        if (window.vcIsStaffNow && window.vcIsStaffNow()) return false;
        if (window.vcMyRole === 'student' || window.vcMyRole === 'observer') return true;
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (u && String(u.role || '').toLowerCase() === 'student') return true;
    } catch(e){}
    return false;
};

/* 🪞 (2026-08-12 강사 Shas 1번) AI 웜업 — 학생의 대화를 강사 화면에 비춰 준다.
   [무엇이 오해였나] Shas 선생님은 「텍스트 상자로 서로 대화하는 기능」으로 보고,
   보내도 상대에게 안 간다고 하셨다. 실제로 웜업의 대화 상대는 **AI** 다(학생이 영어로
   말하고 AI 가 받아 준다). 그래서 서로에게 안 가는 것이 설계다.
   [그래도 진짜 빈 곳] 강사가 «학생이 지금 뭘 하고 있는지» 확인할 길이 아예 없었다.
   → 학생 화면의 웜업 한 줄 한 줄을 강사에게 중계해 읽기 전용으로 비춘다.
     양방향 채팅을 새로 만들지 않는 이유: 수업 채팅이 이미 그 일을 한다. */
window.vcWarmupMirror = function(who, text){
  try {
    var box = document.getElementById('vc-warmup-mirror');
    var log = document.getElementById('vc-warmup-mirror-log');
    if (!box || !log) return;
    box.style.display = 'block';
    var row = document.createElement('div');
    row.style.cssText = 'margin-bottom:3px;word-break:break-word';
    var tag = document.createElement('b');
    tag.style.color = (who === 'ai') ? '#fbbf24' : '#7dd3fc';
    tag.textContent = (who === 'ai') ? '🥭 Mango: ' : '🙋 학생: ';
    row.appendChild(tag);
    row.appendChild(document.createTextNode(String(text || '')));   // textContent — HTML 주입 차단
    log.appendChild(row);
    /* 길어지면 앞쪽을 버린다 — 한 수업 내내 쌓이면 강사 화면이 무거워진다 */
    while (log.childNodes.length > 60) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  } catch(_){}
};
/* 웜업 iframe → 부모. 학생이면 강사에게 중계하고, 강사면(자기 연습) 아무것도 하지 않는다. */
try {
  window.addEventListener('message', function(ev){
    try {
      if (ev.origin !== location.origin) return;            // 같은 오리진만
      var d = ev.data;
      if (!d || d.__mangoiWarmup !== 1) return;
      if (window.vcCanControlTextbook && window.vcCanControlTextbook()) return;  // 강사 자기 연습은 안 보냄
      if (typeof vcConn === 'undefined' || !vcConn) return;
      vcConn.send({ type: 'warmup-echo', data: { who: d.who, text: d.text } });
    } catch(_){}
  });
} catch(_){}

/* 📚 (2026-08-12 Melca 7·8번) 「교재를 누가 조종할 수 있는가」의 정본.
   [무엇이 문제였나] 상단 탭바의 강사 전용 칩은 잘 숨겨져 있었는데, **교재도구 바
   (.pdf-controls) 는 학생에게도 통째로 열려 있었다.** 그래서 학생이
     · 📁 교재·📎 파일을 올려 반 전체에 띄우고
     · 📚 라이브러리에서 다른 교재를 골라 수업 교재를 갈아치우고
     · ◀▶ 로 반 전체의 페이지를 넘기고 (첫 페이지에서 ◀ 를 누르면 «이전 파일»로
       통째로 이동하며 vcShareTextbook 까지 쏜다)
     · 📋 그림을 붙여넣어 업로드·공유하고 (Melca 8번)
     · 🖱 파일을 끌어다 놓아 업로드할 수 있었다.
   강사가 「펜 권한을 주면 제어권을 잃는다」(Melca 7번)고 느낀 것도 이 때문이다 —
   권한을 «준» 것이 아니라, 학생이 처음부터 갖고 있던 조작권으로 강사의 페이지를
   되돌려 버린 것이다(pdf-page-change 는 보내는 쪽 검사가 없다).
   ⚠️ 학생의 «내 화면에서만» 보기(확대·다운로드·페이지 넘겨보기)는 막지 않는다.
      막는 것은 **반 전체에 영향을 주는 조작**뿐이다. */
window.vcCanControlTextbook = function(){
    try { return (typeof vcIsStaffNow === 'function') ? !!vcIsStaffNow()
                 : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'); }
    catch(e){ return false; }
};
/* 학생이 눌렀을 때 «왜 안 되는지» 한 줄로 말해 준다 — 조용히 무시하면 고장으로 읽힌다.
   4초에 한 번만(연타·드래그로 도배되지 않게). */
window.vcTextbookDenied = function(){
    try {
        if (window.__vcTbDenyAt && Date.now() - window.__vcTbDenyAt < 4000) return;
        window.__vcTbDenyAt = Date.now();
        var en = (typeof getLang === 'function' && getLang() === 'en');
        if (typeof mangoToast === 'function') mangoToast(en
            ? 'Only the teacher can change the textbook for the class.'
            : '교재는 선생님만 바꿀 수 있어요.');
    } catch(_){}
};
/* 🙈 반 전체를 움직이는 버튼은 학생에게 아예 보이지 않게 한다.
   (동작 게이트와 «둘 다» 둔다 — 필기 잠금과 같은 이중 방어. 버튼을 지워도 콘솔·단축키로
    함수를 부를 수 있고, 반대로 게이트만 두면 «눌리는데 거절당하는» 버튼이 남는다.) */
window.vcRenderTextbookControls = function(){
    try {
        var bar = document.querySelector('#tab-pdf .pdf-controls');
        if (!bar) return;
        var staff = window.vcCanControlTextbook();
        var SEL = ['button[onclick*="triggerUpload"]',
                   'button[onclick*="openTextbookLibrary"]',
                   'button[onclick*="pdfStopShare"]'];
        /* 🔴 (2026-08-28) `b.style.display='none'` 로는 **안 숨겨진다.**
           index.html 의 `.pdf-controls > button{display:inline-flex !important}` 가
           작성자 !important 라 인라인 style 을 이긴다(CLAUDE.md 「CSS 를 JS 로 덮었는데
           안 먹음」). 그래서 이 이중 방어의 «버튼 숨기기» 절반이 죽어 있었고, 학생에게
           📁교재 업로드·📎파일 업로드·📚라이브러리·공유 중지가 그대로 보였다 —
           누르면 게이트가 거절하므로 「보이는데 안 눌리는 버튼」이 됐다(사장님 제보).
           ⚠️ 확인은 코드가 아니라 브라우저 getComputedStyle 로 할 것 — 인라인엔
              display:none 이 들어가 있는데 계산값이 flex 다. */
        SEL.forEach(function(sel){
            bar.querySelectorAll(sel).forEach(function(b){
                if (staff) b.style.removeProperty('display');
                else b.style.setProperty('display', 'none', 'important');
            });
        });
    } catch(_){}
};
/* 🎬 (2026-08-12 Melca 피드백) 동영상 툴바도 교재와 같은 이중 방어.
   "학생이 영상을 빨리감기·되감기 할 수 있다 — BODA 처럼 강사만 재생을 제어하게 해 달라."
   학생에게 숨기는 것: URL 입력·▶ YouTube·🔗 URL 재생·📁 파일 업로드·🗑 닫기(반 전체에 영향).
   남기는 것: 📚 바로 수업으로(자기 화면 탈출)·📌 미니(자기 화면 배치만 바꿈). */
window.vcRenderVideoControls = function(){
    try {
        var bar = document.querySelector('#tab-video .vp-controls');
        if (!bar) return;
        var staff = window.vcCanControlTextbook();
        var SEL = ['#vp-url',
                   'button[onclick*="vpOpenYouTube"]',
                   'button[onclick*="vpLoadUrl"]',
                   '.vp-file-btn',
                   'button[onclick*="vpClear"]'];
        SEL.forEach(function(sel){
            bar.querySelectorAll(sel).forEach(function(b){
                b.style.display = staff ? '' : 'none';
            });
        });
    } catch(_){}
};
// 🔍 (2026-07-05) 이 원격 박스가 '학생'인지 판별 — 다른 선생님/강사/관찰자는 칭찬 대상에서 제외.
//   역할(dataset.role / vcPeerRoles) + 이름 휴리스틱(교사/강사/선생님/teacher) 둘 다로 거른다.
function vcBoxIsStudent(box){
    if (!box || !box.id || box.id === 'vc-local-box') return false;
    var uid = box.id.replace('vc-video-', '');
    var role = box.dataset.role || (window.vcPeerRoles && window.vcPeerRoles[uid]) || 'student';
    if (role === 'teacher' || role === 'admin' || role === 'observer') return false;
    var lbl = box.querySelector('.video-label');
    var nm = (lbl && lbl.textContent) ? lbl.textContent : '';
    if (/교사|강사|선생님|teacher|tutor/i.test(nm)) return false;
    return true;
}
// 🥭 (2026-07-05) 학생별 이번 수업 누적 지급 개수 (강사 화면 표시용) — targetUserId 별로 셈.
window._vcAwardCounts = window._vcAwardCounts || {};
function vcSyncStarCount(btn, uid){
    if (!btn) return;
    var c = (window._vcAwardCounts && window._vcAwardCounts[uid]) || 0;
    var el = btn.querySelector('.vsb-count');
    if (el){ el.textContent = c > 0 ? c : ''; el.style.display = c > 0 ? 'inline-flex' : 'none'; }
}
// uid 한 명의 누적 개수를 얼굴 버튼 배지 + 로스터 칩 배지 양쪽에 반영.
function vcSyncAwardUI(uid){
    var c = (window._vcAwardCounts && window._vcAwardCounts[uid]) || 0;
    var fb = document.querySelector('#vc-video-' + uid + ' .vc-star-btn .vsb-count');
    if (fb){ fb.textContent = c > 0 ? c : ''; fb.style.display = c > 0 ? 'inline-flex' : 'none'; }
    document.querySelectorAll('.vc-roster-chip').forEach(function(ch){
        if (ch.dataset && ch.dataset.uid === uid){
            var rc = ch.querySelector('.vrc-count');
            if (rc){ rc.textContent = c > 0 ? c : ''; rc.style.display = c > 0 ? 'inline-flex' : 'none'; }
        }
    });
}
// 🌟 강사 전용 "칭찬 주기" 바 — 영상 레이아웃과 무관하게 학생별 지급 버튼을 항상 노출.
function vcUpdatePraiseRoster(){
    try {
        var pane = document.getElementById('vc-video-pane');
        var roster = document.getElementById('vc-praise-roster');
        if (!vcIsTeacherRole() || !pane){ if (roster) roster.style.display = 'none'; return; }
        if (!roster){
            roster = document.createElement('div'); roster.id = 'vc-praise-roster';
            roster.innerHTML = '<span class="vpr-title">⭐ 칭찬 주기</span>';
            // 로스터 칩 공용 안내 말풍선
            var rt = document.createElement('span'); rt.className = 'vc-star-toast'; rt.id = 'vc-roster-toast';
            rt.style.left = '8px';
            // ★ 겹침 방지: 영상 그리드 '앞'의 일반 줄로 삽입 — 그리드가 로스터 아래에서 시작
            var grid0 = pane.querySelector('#vc-video-grid');
            if (grid0) pane.insertBefore(roster, grid0); else pane.appendChild(roster);
            pane.appendChild(rt);
        }
        // 과거 오버레이 방식 잔재 정리 + 그리드 앞 위치 보정(그리드가 늦게 생긴 경우)
        var grid = pane.querySelector('#vc-video-grid');
        if (grid && roster.nextElementSibling !== grid && roster.parentNode === pane) {
            try { pane.insertBefore(roster, grid); } catch(e){}
        }
        // 현재 학생(원격) 박스 목록 수집 — 다른 선생님/관찰자는 제외(학생만)
        var boxes = Array.prototype.slice.call(document.querySelectorAll('#vc-video-grid .video-box'))
            .filter(function(b){ return b.id && b.id !== 'vc-local-box' && vcBoxIsStudent(b); });
        if (!boxes.length){ roster.style.display = 'none'; return; }
        roster.style.display = 'flex';
        // 좁은 영상 칸에선 제목을 감춰 한 줄로 유지
        try { roster.classList.toggle('vpr-narrow', pane.getBoundingClientRect().width < 300); } catch(e){}
        // 안내 말풍선은 로스터 줄 '바로 아래'에 표시
        var rt2 = document.getElementById('vc-roster-toast');
        if (rt2){ try { rt2.style.top = (roster.offsetTop + roster.offsetHeight + 4) + 'px'; } catch(e){ rt2.style.top = '48px'; } }
        var wanted = {};
        boxes.forEach(function(box){
            var uid = box.id.replace('vc-video-', '');
            var lbl = box.querySelector('.video-label');
            var nm = (lbl && lbl.textContent ? lbl.textContent : uid).replace(/\s*\(.*\)\s*$/, '').trim() || uid;
            wanted[uid] = nm;
        });
        // 나간 학생 칩 제거
        Array.prototype.slice.call(roster.querySelectorAll('.vc-roster-chip')).forEach(function(ch){
            if (!wanted[ch.dataset.uid]) ch.remove();
        });
        // 추가/갱신
        Object.keys(wanted).forEach(function(uid){
            var chip = null;
            roster.querySelectorAll('.vc-roster-chip').forEach(function(c){ if (c.dataset.uid === uid) chip = c; });
            if (!chip){
                chip = document.createElement('button'); chip.type = 'button'; chip.className = 'vc-roster-chip'; chip.dataset.uid = uid;
                chip.innerHTML = '<span class="vrc-star">⭐</span><span class="vrc-name"></span><span class="vrc-count"></span>';
                chip.title = '이 학생에게 칭찬 포인트 +1';
                chip.addEventListener('click', function(e){
                    e.stopPropagation();
                    var rt = document.getElementById('vc-roster-toast');
                    vcAwardPoint(uid, chip, rt);
                });
                roster.appendChild(chip);
            }
            chip.querySelector('.vrc-name').textContent = wanted[uid];
            vcSyncAwardUI(uid);
        });
    } catch(e){}
}
function vcAddStarButton(box, targetUserId){
    if (!box || !vcIsTeacherRole() || box.querySelector('.vc-star-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'vc-star-btn';
    btn.type = 'button';
    btn.title = '⭐ 칭찬 포인트 주기 — 이 학생이 잘했을 때 누르면 이 학생 바구니에 +1P';
    btn.setAttribute('aria-label', '이 학생에게 칭찬 포인트 주기');
    btn.innerHTML = '<span class="vsb-ic">⭐</span><span class="vsb-lbl">칭찬</span><span class="vsb-count"></span>';
    const toast = document.createElement('span');
    toast.className = 'vc-star-toast';
    box.style.position = box.style.position || 'relative';
    btn.addEventListener('click', (e) => { e.stopPropagation(); vcAwardPoint(targetUserId, btn, toast); });
    box.appendChild(btn);
    box.appendChild(toast);
    vcSyncStarCount(btn, targetUserId);   // 재접속/재렌더 시에도 누적 개수 복원
    try { vcApplyPraiseCompact(); } catch(e){}
}
// 🔁 (2026-07-05) 역할이 늦게 정해지거나 박스가 먼저 생겨도 항상 맞도록 —
//   강사면: 내 박스의 바구니 제거 + 모든 원격(학생) 박스에 별 버튼. 학생이면: 별 제거 + 내 박스에 바구니.
function vcRefreshPraiseUI(){
    try {
        var teacher = vcIsTeacherRole();
        var localBox = document.getElementById('vc-local-box');
        if (teacher) {
            // 강사 본인 화면엔 바구니 X
            if (localBox) { var lb = localBox.querySelector('.vc-point-basket'); if (lb) lb.remove(); }
            // 학생(원격) 박스마다 별 버튼 — 다른 선생님/관찰자 박스에는 붙이지 않고, 잘못 붙었으면 제거.
            document.querySelectorAll('#vc-video-grid .video-box').forEach(function(box){
                if (box.id === 'vc-local-box') return;
                var uid = (box.id || '').replace('vc-video-', '');
                /* 🎛 장치 도우미 — 별(칭찬)과 달리 «모든 원격 박스» 에 붙는다(2026-08-12 재택 강사 지원).
                   학생 체크 안에 두면 강사 타일은 역할이 늦게 확정될 때 영영 버튼을 못 받는다. */
                if (uid) { try { vcAddDevBtn(box, uid); } catch(e){} }
                if (uid && vcBoxIsStudent(box)) {
                    vcAddStarButton(box, uid);
                } else {
                    var s = box.querySelector('.vc-star-btn'); if (s) s.remove();
                    var t = box.querySelector('.vc-star-toast'); if (t) t.remove();
                    /* 🎛 (2026-08-12) 여기서 .vc-devhelp-btn 을 지우지 말 것.
                       위 vcAddDevBtn 이 «모든 원격 박스» 에 붙이는 게 새 의도(abf53d893 — 강사 타일에도)인데,
                       이 옛 정리줄이 남아 «붙임→즉시 제거» 를 매 스윕 반복 — 강사 타일만 버튼이 영영 없었다
                       (사장님 실측: 학생 타일 🎛 O · 강사 타일 X). 별(칭찬)은 학생 전용이 맞으니 그대로 둔다. */
                }
            });
        } else {
            // 학생: 별 버튼 제거 + 내 박스에 바구니
            document.querySelectorAll('.vc-star-btn, .vc-star-toast').forEach(function(el){ el.remove(); });
            var rr = document.getElementById('vc-praise-roster'); if (rr) rr.style.display = 'none';
            vcEnsurePointBasket();
        }
        // 박스 폭에 따라 컴팩트(아이콘만) 여부 결정 — 좁으면 글자 감춰 겹침 방지
        vcApplyPraiseCompact();
        // 강사 전용 "칭찬 주기" 바 갱신 (영상 레이아웃 무관하게 항상 지급 가능)
        vcUpdatePraiseRoster();
    } catch(e){}
}
// 얼굴 박스가 좁으면(<170px) 별/바구니를 아이콘만 남기는 원형으로 축소해 다른 배지와 안 겹치게.
// + 칭찬 UI(좌상단)가 있는 박스는 분리버튼(원래 좌상단)을 숨겨 좌상단 충돌을 없앤다.
function vcApplyPraiseCompact(){
    try {
        document.querySelectorAll('.vc-star-btn, .vc-point-basket').forEach(function(el){
            var box = el.closest('.video-box');
            var w = box ? box.getBoundingClientRect().width : 999;
            el.classList.toggle('vc-star-compact', w > 0 && w < 170);
        });
        document.querySelectorAll('.video-box').forEach(function(box){
            var detach = box.querySelector('.video-detach-btn');
            if (!detach) return;
            var hasPraise = box.querySelector('.vc-star-btn, .vc-point-basket');
            detach.style.display = hasPraise ? 'none' : '';
        });
    } catch(e){}
}
// 안전장치: 수업 중일 때 2초마다 칭찬 UI를 상태에 맞게 재정렬(늦은 role/박스 생성 대비)
setInterval(function(){
    try { if (document.body && document.body.classList.contains('vc-in-call')) vcRefreshPraiseUI(); } catch(e){}
}, 2000);
function vcShowStarToast(toast, text){
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 1600);
}
// 강사가 별 버튼 클릭 → 대상 학생에게만 실시간 신호 전송(브로드캐스트 + targetUserId 필터링).
//   실제 포인트 적립은 "받는 쪽(학생 본인 브라우저)"이 자기 uid로 직접 호출 — 강사 쪽에서
//   학생 계정 uid 를 알 필요가 없어 통화 시그널링 구조를 안 건드리고 안전하게 구현.
// 🌟 (2026-07-05) 학생 입장 시 — (방·피어ID → 내 계정 uid) 서버 등록.
//   선생님이 별을 누르면 서버가 이 매핑으로 대상 학생의 진짜 계정을 찾아 적립하므로,
//   학생 브라우저가 신호를 놓치거나 순간적으로 로그인 정보를 못 읽어도 "전체 포인트"에 확실히 쌓인다.
// 🪪 이 브라우저 탭의 안정 식별자 (재연결/새로고침/모바일 끊김에도 동일).
//   로그인 계정 uid 우선(가장 안정) → 없으면 탭 단위 sessionStorage 랜덤(같은 탭이면 유지).
//   서버 dedup 의 키. 진짜 다른 참가자/다른 기기/다른 탭은 서로 다른 값이라 절대 안 닫힌다.
function vcClientId(){
    // 🔧 (2026-07-14) 탭 단위 식별자로 변경 — 예전 'acct:<uid>' 방식은 같은 계정으로
    //   두 기기/두 탭이 같은 방에 들어오면 서버 dedup 이 서로의 소켓을 번갈아 닫아
    //   "화면이 자꾸 튕기는" 무한 킥 루프가 됐다(가족 공용 계정·교사 PC+폰 동시접속 등).
    //   sessionStorage 는 같은 탭의 새로고침·재연결에는 그대로 유지되므로
    //   원래 잡으려던 '유령 타일(좀비 소켓)' dedup 은 계속 동작하고,
    //   다른 탭/다른 기기와는 절대 겹치지 않는다.
    try {
        var k = sessionStorage.getItem('mangoi_vc_client_id');
        if (!k) { k = 'tab:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('mangoi_vc_client_id', k); }
        return k;
    } catch(e){}
    // sessionStorage 불가 환경 폴백 — 페이지 수명 동안만 유지되는 메모리 id (계정 id 는 절대 사용 금지)
    if (!window.__vcMemClientId) window.__vcMemClientId = 'mem:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return window.__vcMemClientId;
}
function vcRegisterRosterIdentity(){
    try {
        if (typeof vcIsObserver !== 'undefined' && vcIsObserver) return;   // 👁 참관자는 로스터에 안 올린다(칭찬 적립 대상 아님)
        if (vcIsTeacherRole()) return;                 // 학생만 등록(선생님 X)
        if (!vcUserId || !vcRoomId) return;
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        if (!u || !u.uid) return;                      // 로그인 안 된 게스트는 등록 불가(적립 대상 계정이 없음)
        fetch('/api/vc/roster', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: vcRoomId, peer_id: vcUserId, account_uid: u.uid, token: (function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })(), name: u.name || vcUsername || '', role: 'student' })
        }).catch(function(){});
    } catch(e){}
}
function vcAwardPoint(targetUserId, btn, toast){
    if (btn && btn.classList.contains('vc-star-cooldown')) return;
    const awardId = 'pt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7);
    try { vcConn && vcConn.send({ type: 'point-award', data: { targetUserId, awardId, fromName: vcUsername || '선생님' } }); } catch(e){}
    // 🌟 서버측 확실 적립 — 학생 브라우저 상태와 무관하게, 입장 때 등록된 계정으로 서버가 직접 적립(멱등).
    //   학생-자기적립 경로와 같은 awardId 를 써서 중복 적립되지 않는다(먼저 도착한 쪽만 1점).
    try {
        fetch('/api/points/award-praise', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room: vcRoomId, target_peer_id: targetUserId, award_id: awardId, from_name: vcUsername || '선생님' })
        }).catch(function(){});
    } catch(e){}
    if (btn){
        btn.classList.add('vc-star-pop');
        setTimeout(() => btn.classList.remove('vc-star-pop'), 460);
        btn.classList.add('vc-star-cooldown');
        setTimeout(() => btn.classList.remove('vc-star-cooldown'), 1200); // 1.2초(서버 쿨다운 1초와 맞춤) — 연속 지급 원활
    }
    vcShowStarToast(toast, '⭐ 전송 중…');
    window._vcPendingAwards = window._vcPendingAwards || {};
    window._vcPendingAwards[awardId] = { toast: toast, btn: btn, targetUserId: targetUserId };
}

// 🧺 (2026-07-04) 학생 화면 전용 — 이번 수업에서 받은 포인트 바구니 (본인 로컬 비디오 박스에 표시)
window._vcSessionPoints = window._vcSessionPoints || 0;
// 📱 fix (2026-07-13) — 세로 모바일에선 참가자 2명 이상이면 내 영상 박스가 숨겨져(display:none !important)
//   그 안의 바구니·+1·광채 연출이 학생에게 전혀 안 보였음("포인트가 늘어나는 게 안 보여").
//   숫자 표시는 뒤쪽의 '떠 있는 미러 바구니'(#vc-basket-float, 0.7초 틱)가 담당하고,
//   여기서는 ①연출을 화면 전체 오버레이로 옮겨 어느 모드에서든 보이게 ②숫자 동기화만 한다.
function vcLocalBoxVisible(){
    var box = document.getElementById('vc-local-box');
    if (!box) return false;
    try { return box.offsetWidth > 0 && box.offsetHeight > 0; } catch(e){ return false; }
}
// 연출 기준점 — 내 박스 안 바구니가 보이면 그것, 숨겨졌으면 떠 있는 미러 바구니
function vcVisibleBasket(){
    var b = document.querySelector('#vc-local-box .vc-point-basket');
    try { if (b && b.getBoundingClientRect().width > 0) return b; } catch(e){}
    var f = document.getElementById('vc-basket-float');
    try { if (f && f.getBoundingClientRect().width > 0) return f; } catch(e){}
    return b || f || null;
}
// 모든 바구니(박스 안 + 떠 있는 미러) 숫자 동기화
function vcSyncBasketCounts(){
    try {
        var n = String(window._vcSessionPoints || 0);
        document.querySelectorAll('#vc-local-box .vc-point-basket .vpb-count, #vc-basket-float .vpb-count').forEach(function(c){
            c.textContent = n;
        });
    } catch(e){}
}
function vcEnsurePointBasket(){
    if (vcIsTeacherRole()) return null; // 선생님 화면엔 표시 안 함
    const box = document.getElementById('vc-local-box');
    if (!box) return null;
    let basket = box.querySelector('.vc-point-basket');
    if (basket) return basket;
    box.style.position = box.style.position || 'relative';
    basket = document.createElement('div');
    basket.className = 'vc-point-basket';
    basket.title = '🧺 내 포인트 바구니 — 이번 수업에서 선생님께 받은 칭찬 포인트';
    basket.setAttribute('aria-label', '내 포인트 바구니');
    basket.innerHTML = '<span class="vpb-icon">🧺</span><span class="vpb-count">' + String(window._vcSessionPoints || 0) + '</span>';
    box.appendChild(basket);
    try { vcApplyPraiseCompact(); } catch(e){}
    return basket;
}
function vcSpawnConfetti(box){
    if (!box) return;
    const colors = ['#fbbf24','#f472b6','#60a5fa','#34d399','#a78bfa'];
    const rect = box.getBoundingClientRect();
    for (let i = 0; i < 14; i++){
        const piece = document.createElement('span');
        piece.className = 'vc-confetti-piece';
        piece.textContent = ['⭐','🎉','✨'][i % 3];
        piece.style.left = (rect.left + rect.width * Math.random()) + 'px';
        piece.style.color = colors[i % colors.length];
        piece.style.setProperty('--vc-confetti-drift', (Math.random()*80-40) + 'px');
        piece.style.animationDuration = (0.9 + Math.random()*0.6) + 's';
        document.body.appendChild(piece);
        setTimeout(() => piece.remove(), 1700);
    }
}
// 🔓 앱 전역 공유 AudioContext 확보 + 첫 사용자 상호작용 때 미리 unlock.
//   (fix 2026-07-05) 예전엔 vcPlayPointChime 이 매번 new AudioContext() 를 만들어,
//   브라우저 자동재생 정책상 두 번째 호출부터 suspended 로 생성돼 소리가 안 났다
//   ("처음 한 번만 남"). 공유 컨텍스트 1개를 재사용하고, 아래 unlock 리스너로
//   미리 running 상태로 만들어 두면 원격 신호로 트리거돼도 매번 재생된다.
function vcGetSharedAC(){
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try {
        if (!window._gameAC) window._gameAC = new AC();
        if (window._gameAC.state === 'suspended') { try { window._gameAC.resume(); } catch(_){} }
        return window._gameAC;
    } catch(_) { return null; }
}
(function _vcInstallAudioUnlock(){
    if (window._vcAudioUnlockBound) return; window._vcAudioUnlockBound = true;
    function unlock(){ try { vcGetSharedAC(); } catch(_){} }
    ['pointerdown','touchstart','keydown','click'].forEach(function(ev){
        try { document.addEventListener(ev, unlock, { passive: true, capture: true }); } catch(_){}
    });
})();
// 🔔 "딩동댕" — 밝고 경쾌한 3음 상승 차임 + 반짝이는 배음(학생 동기부여용, 크게).
function vcPlayPointChime(){
    try {
        const ac = vcGetSharedAC(); if (!ac) return;
        const master = ac.createGain();
        master.gain.value = 0.9;                    // 전체를 크게
        master.connect(ac.destination);
        // 딩(도)–동(미)–댕(솔↑) 상승 3화음, 각 음에 옥타브 반짝임 배음
        const notes = [ 659.25, 830.61, 1046.50 ];  // E5 · G#5 · C6 (밝은 장3화음 상승)
        notes.forEach((freq, i) => {
            const t0 = ac.currentTime + i * 0.13;
            // 본음 (삼각파 = 따뜻하고 통통 튐)
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = 'triangle'; o.frequency.value = freq;
            o.connect(g); g.connect(master);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
            o.start(t0); o.stop(t0 + 0.45);
            // 반짝임 배음 (한 옥타브 위, 사인파, 살짝 작게)
            const o2 = ac.createOscillator(), g2 = ac.createGain();
            o2.type = 'sine'; o2.frequency.value = freq * 2;
            o2.connect(g2); g2.connect(master);
            g2.gain.setValueAtTime(0.0001, t0);
            g2.gain.exponentialRampToValueAtTime(0.18, t0 + 0.012);
            g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
            o2.start(t0); o2.stop(t0 + 0.32);
        });
        // 마지막 "댕"에 반짝 셔틀 글리산도(짧게 위로 스윽)
        const tS = ac.currentTime + notes.length * 0.13;
        const sp = ac.createOscillator(), sg = ac.createGain();
        sp.type = 'sine'; sp.connect(sg); sg.connect(master);
        sp.frequency.setValueAtTime(1046, tS);
        sp.frequency.exponentialRampToValueAtTime(2093, tS + 0.18);
        sg.gain.setValueAtTime(0.0001, tS);
        sg.gain.exponentialRampToValueAtTime(0.22, tS + 0.02);
        sg.gain.exponentialRampToValueAtTime(0.0001, tS + 0.3);
        sp.start(tS); sp.stop(tS + 0.32);
    } catch(e){}
}
// ✨ 바구니 기준으로 큰 광채 연출 — 폭발 링 + 박스 번쩍 + 별가루 방사 + 바구니 빛남 + 큰 +1
function vcBigSparkleBurst(box, basket){
    if (!box) return;
    box.style.position = box.style.position || 'relative';
    var br = box.getBoundingClientRect();
    // 바구니 중심(박스 상대 좌표). 바구니 없으면 좌상단 근처.
    var cx = 46, cy = 30;
    if (basket){ var kr = basket.getBoundingClientRect(); cx = (kr.left - br.left) + kr.width/2; cy = (kr.top - br.top) + kr.height/2; }
    // 1) 박스 전체 금빛 번쩍
    var flash = document.createElement('div'); flash.className = 'vc-glow-flash';
    box.appendChild(flash); setTimeout(function(){ flash.remove(); }, 900);
    // 2) 폭발 링(2겹)
    for (var r = 0; r < 2; r++){
        (function(delay){
            setTimeout(function(){
                var ring = document.createElement('div'); ring.className = 'vc-burst-ring';
                ring.style.left = cx + 'px'; ring.style.top = cy + 'px';
                box.appendChild(ring); setTimeout(function(){ ring.remove(); }, 780);
            }, delay);
        })(r * 120);
    }
    // 3) 별가루 방사 (사방)
    var glyphs = ['✨','⭐','🌟','💫'];
    for (var i = 0; i < 14; i++){
        var sp = document.createElement('span'); sp.className = 'vc-sparkle';
        sp.textContent = glyphs[i % glyphs.length];
        var ang = (Math.PI * 2 * i / 14) + Math.random()*0.5;
        var dist = 60 + Math.random()*70;
        sp.style.left = cx + 'px'; sp.style.top = cy + 'px';
        sp.style.setProperty('--dx', Math.cos(ang)*dist + 'px');
        sp.style.setProperty('--dy', Math.sin(ang)*dist + 'px');
        sp.style.setProperty('--dr', (Math.random()*360-180) + 'deg');
        sp.style.fontSize = (18 + Math.random()*16) + 'px';
        box.appendChild(sp);
        (function(el){ setTimeout(function(){ el.remove(); }, 1000); })(sp);
    }
    // 4) 바구니 빛남 + 두근
    if (basket){
        basket.classList.remove('vpb-glow','vpb-bump');
        void basket.offsetWidth;                 // 리플로우로 애니메이션 재시작 보장
        basket.classList.add('vpb-glow','vpb-bump');
        setTimeout(function(){ basket.classList.remove('vpb-glow','vpb-bump'); }, 980);
    }
    // 5) 큰 +1 튀어오름 (바구니 위)
    var fly = document.createElement('span'); fly.className = 'vpb-fly-big'; fly.textContent = '+1';
    fly.style.left = Math.max(6, cx - 14) + 'px'; fly.style.top = (cy - 10) + 'px';
    box.appendChild(fly); setTimeout(function(){ fly.remove(); }, 1100);
}
// 학생 본인 화면에서: 신호 수신 → 자기 계정 uid로 포인트 적립 API 직접 호출 + 축하 연출
function vcCelebratePoint(awardId, fromName){
    const u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    const basket = vcEnsurePointBasket();
    vcPlayPointChime();
    const localBox = document.getElementById('vc-local-box');
    // 📱 fix (2026-07-13) — 내 박스가 숨겨진 화면(세로폰)에선 박스 기준 연출이 전부 안 보였음.
    //   화면 전체 고정 오버레이에 광채·별가루를 그려 '어느 화면 모드에서든' 반드시 보이게.
    const boxVisible = vcLocalBoxVisible();
    if (boxVisible) {
        vcSpawnConfetti(localBox);
        try { vcBigSparkleBurst(localBox, basket); } catch(e){}
    } else {
        var ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:100003;pointer-events:none;';
        document.body.appendChild(ov);
        vcSpawnConfetti(ov);                                   // 화면 전체에 색종이
        // 광채·별가루·+1 은 '보이는 바구니'(떠 있는 미러 포함) 위치 기준으로
        var anchor = null;
        try { anchor = vcVisibleBasket(); if (anchor && !(anchor.getBoundingClientRect().width > 0)) anchor = null; } catch(e){}
        try { vcBigSparkleBurst(ov, anchor); } catch(e){}
        setTimeout(function(){ try { ov.remove(); } catch(e){} }, 1500);
    }
    if (!u || !u.uid) { console.warn('[point-award] 로그인 정보 없음 — 로컬 연출만 표시'); return; }
    fetch('/api/points/earn-by-rule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: u.uid, token: (function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })(), student_name: u.name || vcUsername, rule_code: 'teacher_praise_point', meta: { room: vcRoomId, awardId, from: fromName } })
    }).then(r => r.json()).then(d => {
        if (d.ok) {
            window._vcSessionPoints = (window._vcSessionPoints || 0) + (d.rule?.amount || 1);
            vcSyncBasketCounts();   // 박스 안 + 떠 있는 바구니 모두 갱신
        }
        try { vcConn && vcConn.send({ type: 'point-award-ack', data: { awardId, ok: !!d.ok, error: d.error } }); } catch(e){}
        if (typeof refreshPointsChip === 'function') refreshPointsChip(true);
    }).catch(() => {
        try { vcConn && vcConn.send({ type: 'point-award-ack', data: { awardId, ok: false, error: 'network' } }); } catch(e){}
    });
}

/** 비디오 박스에 '분리/복귀' 버튼 + 드래그 기능 부여 */
function vcAddDetachButton(box) {
    if (!box || box.querySelector('.video-detach-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'video-detach-btn';
    btn.title = '독립 창으로 분리';
    btn.textContent = '⇱';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        vcToggleDetach(box, btn);
    });
    box.appendChild(btn);
}

/** 비디오 박스를 독립 팝아웃 창으로 분리 / 그리드로 복귀 */
function vcToggleDetach(box, btn) {
    if (box.classList.contains('detached')) {
        // 복귀
        box.classList.remove('detached');
        box.style.left = box.style.top = box.style.width = box.style.height = '';
        const grid = document.getElementById('vc-video-grid');
        if (grid) {
            // 🧑‍🏫 분리창에서 그리드로 복귀할 때도 상대 타일은 내 타일 위로
            if (box.id !== 'vc-local-box' && typeof vcInsertBoxTeacherFirst === 'function') vcInsertBoxTeacherFirst(grid, box);
            else grid.appendChild(box);
        }
        btn.textContent = '⇱';
        btn.title = '독립 창으로 분리';
    } else {
        // 분리 — body 로 이동 후 fixed 위치
        const rect = box.getBoundingClientRect();
        document.body.appendChild(box);
        box.classList.add('detached');
        // 기존 그리드 위치 근처에서 시작
        let left = rect.left, top = rect.top;
        // 화면 밖이면 기본 좌표
        if (left < 0 || top < 0 || left > window.innerWidth - 100) {
            left = window.innerWidth - 320;
            top = 80 + (document.querySelectorAll('.video-box.detached').length - 1) * 30;
        }
        box.style.left = left + 'px';
        box.style.top  = top + 'px';
        btn.textContent = '⇲';
        btn.title = '그리드로 복귀';
        vcMakeDraggable(box);
    }
}

/** 분리된 비디오 박스 드래그로 이동 */
function vcMakeDraggable(box) {
    if (box.__dragBound) return;
    box.__dragBound = true;
    let startX = 0, startY = 0, origL = 0, origT = 0, dragging = false;
    box.addEventListener('pointerdown', (e) => {
        if (!box.classList.contains('detached')) return;
        // 버튼/컨트롤 클릭 시 드래그 제외
        if (e.target.closest('.video-detach-btn')) return;
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        const r = box.getBoundingClientRect();
        origL = r.left; origT = r.top;
        box.setPointerCapture(e.pointerId);
    });
    box.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const nx = Math.max(0, Math.min(window.innerWidth - 60,  origL + (e.clientX - startX)));
        const ny = Math.max(0, Math.min(window.innerHeight - 40, origT + (e.clientY - startY)));
        box.style.left = nx + 'px';
        box.style.top  = ny + 'px';
    });
    box.addEventListener('pointerup',   () => { dragging = false; });
    box.addEventListener('pointercancel', () => { dragging = false; });
}

/* ============================================================
 * 🚨 본인 비디오 박스 — 카메라 오류 안내 placeholder
 *   getUserMedia 실패 또는 비디오 트랙 0개일 때 검은 화면 대신
 *   명확한 오류 안내 + [🔄 카메라 다시 시도] 버튼 표시
 * ============================================================ */
window.vcShowLocalPlaceholder = function(kind, errMsg) {
    const box = document.getElementById('vc-local-box');
    if (!box) return;
    const old = box.querySelector('.vc-local-placeholder');
    if (old) old.remove();
    const ph = document.createElement('div');
    ph.className = 'vc-local-placeholder';
    ph.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#1e293b,#0f172a);color:#fff;padding:14px;text-align:center;z-index:4;border-radius:inherit;gap:8px;font-size:12px;line-height:1.5;';
    const isEn = miIsEn();
    const heads = {
        'camera-off':  isEn ? '📷 Camera is off'           : '📷 카메라가 꺼져 있어요',
        'camera-fail': isEn ? '⚠️ Camera access failed'    : '⚠️ 카메라를 사용할 수 없어요',
        'all-fail':    isEn ? '🚫 No camera or microphone' : '🚫 카메라·마이크 모두 사용 불가'
    };
    const hints = {
        'camera-off':  isEn ? 'Click below to try starting the camera again'                                 : '아래 버튼을 눌러 카메라를 다시 켜보세요',
        'camera-fail': isEn ? 'Check browser permission OR another app (Zoom, Teams) using the camera'       : '브라우저 주소창의 🔒/📷 아이콘에서 권한을 허용하거나, 다른 앱(줌·팀즈)이 카메라를 점유 중인지 확인하세요',
        'all-fail':    isEn ? 'Check device permissions in your OS settings'                                  : '브라우저 권한 또는 OS 설정에서 카메라·마이크 접근 권한을 확인해 주세요'
    };
    const icon = kind === 'camera-off' ? '📷' : kind === 'camera-fail' ? '⚠️' : '🚫';
    ph.innerHTML =
        '<div style="font-size:34px;line-height:1">' + icon + '</div>' +
        '<div style="font-weight:700;font-size:13.5px;color:#fbbf24">' + (heads[kind]||'') + '</div>' +
        '<div style="color:#cbd5e1;max-width:240px">' + (hints[kind]||'') + '</div>' +
        (errMsg ? '<div style="font-size:10.5px;color:#94a3b8;max-width:240px;opacity:0.85">' + errMsg + '</div>' : '') +
        '<button type="button" class="vc-local-retry-btn" style="margin-top:6px;padding:8px 18px;border:0;border-radius:99px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 8px 18px -8px rgba(124,58,237,0.55)">🔄 ' + (isEn?'Retry camera':'카메라 다시 시도') + '</button>';
    box.appendChild(ph);
    const btn = ph.querySelector('.vc-local-retry-btn');
    if (btn) btn.onclick = () => vcRetryCamera();
};
window.vcHideLocalPlaceholder = function() {
    const box = document.getElementById('vc-local-box');
    if (!box) return;
    const ph = box.querySelector('.vc-local-placeholder');
    if (ph) ph.remove();
};
window.vcRetryCamera = async function() {
    const box = document.getElementById('vc-local-box');
    const btn = box && box.querySelector('.vc-local-retry-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 시도 중…'; btn.style.opacity = '0.7'; }
    try {
        // 기존 트랙 정리 (다음 시도에서 권한이 잡히도록)
        if (typeof vcLocalStream !== 'undefined' && vcLocalStream && vcLocalStream.getVideoTracks) {
            vcLocalStream.getVideoTracks().forEach(t => { try { t.stop(); } catch(e){} });
        }
        const newStream = await acquireLocalMedia({ video: true, audio: true });
        const v = document.getElementById('vc-local-video');
        if (v) v.srcObject = newStream;
        vcLocalStream = newStream;
        // 모든 PC sender 의 비디오 트랙 교체 (참가자가 재시도된 영상을 보게)
        const newVid = newStream.getVideoTracks()[0];
        if (newVid && typeof vcPeerConnections === 'object' && vcPeerConnections) {
            Object.values(vcPeerConnections).forEach(pc => {
                try {
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
                    if (sender) sender.replaceTrack(newVid);
                } catch(e){}
            });
        }
        if (newStream.getVideoTracks().length > 0) {
            vcHideLocalPlaceholder();
            // 🔁 (2026-07-24) 권한 없이 입장했던 피어는 video sender 자체가 없어 위 replaceTrack 이
            //   아무 일도 하지 않는다 → 그런 피어만 재협상해 지금 확보한 카메라를 실제로 흘려보낸다.
            try {
                var _rn = window.vcRenegotiateMissing && window.vcRenegotiateMissing('video');
                if (_rn) console.warn('[vc] 카메라 재시도 → ' + _rn + '개 피어 재협상');
            } catch (_) {}
            console.log('[vc] 카메라 재시도 성공');
        } else {
            vcShowLocalPlaceholder('camera-off', '카메라 트랙이 여전히 없음');
        }
    } catch(e) {
        console.warn('[vc] 카메라 재시도 실패:', e);
        vcShowLocalPlaceholder('camera-fail', (typeof describeMediaError === 'function') ? describeMediaError(e) : (e && e.message || String(e)));
    }
};

/** 비디오 박스에 소리·화면 상태 아이콘 + 음량 미터 부착 */
/* 🩹 fix (2026-07-12) — 모바일 얼굴 잘림 방지 스마트핏.
   휴대폰 세로 카메라(세로 영상)가 가로 타일에 object-fit:cover 로 들어가면
   위아래가 크게 잘려 얼굴 대신 벽/천장만 보임 (가상배경 캔버스도 카메라 비율이라 동일).
   → 영상과 타일의 방향이 다르거나 비율차가 크면 contain 으로 전환해 얼굴 전체 표시.
   (letterbox 여백은 가상배경 CSS 프레임/타일 배경이 채워줌) */
function vcSmartFitVideo(v){
  try {
    if (!v || !v.videoWidth || !v.videoHeight) return;
    var box = v.closest('.video-box'); if (!box) return;
    var bw = box.clientWidth, bh = box.clientHeight; if (!bw || !bh) return;
    var vr = v.videoWidth / v.videoHeight, br = bw / bh;
    // 🖼 (2026-07-14 사장님 지시) 세로폰에서 '상대(교사 등) 타일'은 무조건 꽉 채움(cover).
    //   PC 교사의 16:9 영상이 세로 타일에 contain 으로 들어가면 위아래 검은띠로 작게 보였음
    //   ("교사 화면도 학생처럼 꽉차게"). 내 타일(vc-local-box)은 기존 잘림방지 로직 유지.
    try {
      if (box.id !== 'vc-local-box' && matchMedia('(max-width:920px) and (orientation:portrait)').matches) {
        v.style.setProperty('object-fit', 'cover', 'important');
        return;
      }
    } catch(e){}
    // 🩹 fix (2026-07-13) — 가상배경(세그멘테이션) 켜진 내 타일은 무조건 contain.
    //   가상배경 캔버스는 카메라 원본 비율이라, 세로로 긴 미리보기 타일에 cover 로 넣으면
    //   얼굴이 확대돼 아래(턱·목)가 잘림. 여백은 타일 배경 프레임이 채우므로 전체 표시가 우선.
    var vbgOn = (box.id === 'vc-local-box') && (typeof vcBg !== 'undefined') && vcBg && vcBg.mode && vcBg.mode !== 'off';
    // 일반 타일 임계값도 1.6→1.35 로 낮춰 애매한 비율차의 잘림까지 contain 처리
    var mismatch = vbgOn || ((vr < 1) !== (br < 1)) || (Math.max(vr, br) / Math.min(vr, br) > 1.35);
    // inline !important 라야 ph49 의 stylesheet !important(cover 강제)를 이김
    v.style.setProperty('object-fit', mismatch ? 'contain' : 'cover', 'important');
  } catch(e){}
}
function vcInstallSmartFit(v){
  if (!v) return;
  if (!v.__smartFit) {
    v.__smartFit = true;
    v.addEventListener('loadedmetadata', function(){ vcSmartFitVideo(v); });
    v.addEventListener('resize', function(){ vcSmartFitVideo(v); }); // 영상 해상도 변경 시
    // 타일 크기 변경(1/2·전체·PIP 버튼 등)에도 재계산
    try {
      var box = v.closest('.video-box');
      if (box && !box.__smartFitRO && window.ResizeObserver) {
        box.__smartFitRO = new ResizeObserver(function(){ vcSmartFitVideo(v); });
        box.__smartFitRO.observe(box);
      }
    } catch(e){}
  }
  vcSmartFitVideo(v);
}
function vcSmartFitAll(){
  try {
    document.querySelectorAll('.video-box video').forEach(function(v){ vcInstallSmartFit(v); });
  } catch(e){}
}
window.addEventListener('resize', function(){ setTimeout(vcSmartFitAll, 150); });
window.addEventListener('orientationchange', function(){ setTimeout(vcSmartFitAll, 350); });

function attachStreamMonitor(box, stream) {
    if (!box || !stream) return;
    try { vcInstallSmartFit(box.querySelector('video')); } catch(e){}
    let status = box.querySelector('.video-status');
    if (!status) {
        status = document.createElement('div');
        status.className = 'video-status';
        status.innerHTML =
            '<span class="vs-icon vs-cam" title="화면">📷</span>' +
            '<span class="vs-icon vs-mic" title="소리">🎤</span>' +
            '<span class="vol-meter">' + '<span></span>'.repeat(6) + '</span>';
        box.appendChild(status);
    }
    const camEl = status.querySelector('.vs-cam');
    const micEl = status.querySelector('.vs-mic');
    const bars  = status.querySelectorAll('.vol-meter span');
    const isLocal = box.id === 'vc-local-box';

    // 🥭 (2026-07-13) 내 타일의 📷/🎤 = 눌러서 켜고 끄기 (사장님 요청)
    if (isLocal && !status.__tapWired) {
        status.__tapWired = true;
        camEl.title = '카메라 켜기/끄기';
        micEl.title = '마이크 켜기/끄기';
        // 🙈 (2026-07-14 사장님 지시) 얼굴 화면 숨기기 — 📷 왼쪽에 원터치 버튼.
        //    내 화면에서만 숨김(상대에겐 계속 송출) → 콘텐츠가 전체 화면 차지.
        if (!status.querySelector('.vs-hide')) {
            const hideEl = document.createElement('span');
            hideEl.className = 'vs-icon vs-hide';
            hideEl.textContent = '🙈';
            hideEl.title = miIsEn()
                ? 'Hide faces (still in class)' : '얼굴 화면 숨기기 (수업은 계속 참여)';
            hideEl.addEventListener('click', function(e){
                e.stopPropagation();
                try { vcFacesHide(); } catch(_){}
            });
            status.insertBefore(hideEl, camEl);
        }
        camEl.addEventListener('click', function(e){
            e.stopPropagation();
            try { vcToggleCam(); } catch(_){}
            syncIcons();
        });
        micEl.addEventListener('click', function(e){
            e.stopPropagation();
            try { vcToggleMic(); } catch(_){}          // async — 트랙 재획득이 있을 수 있음
            setTimeout(syncIcons, 120);                 // 토글 반영 후 아이콘 갱신
        });
    }

    function syncIcons() {
        const v = stream.getVideoTracks()[0];
        const a = stream.getAudioTracks()[0];
        const vOn = v && v.enabled && !v.muted;
        const aOn = a && a.enabled && !a.muted;
        // 아이콘은 📷/🎤 그대로 두고, 꺼짐이면 .off(빨간 ✖ 겹침)로 표시
        camEl.textContent = '📷';
        camEl.classList.toggle('off', !vOn);
        micEl.textContent = '🎤';
        micEl.classList.toggle('off', !aOn);
        // 내 카메라 꺼짐 = 타일 화면을 덮개로 가림 (아이콘·이름표는 덮개 위)
        if (isLocal) {
            box.classList.toggle('cam-off', !vOn);
            if (!vOn) {
                let cov = box.querySelector('.vc-cam-cover');
                if (!cov) {
                    cov = document.createElement('div');
                    cov.className = 'vc-cam-cover';
                    cov.innerHTML = '<span class="cc-ico">📷</span><span class="cc-txt"></span>';
                    box.insertBefore(cov, status);
                }
                const txt = cov.querySelector('.cc-txt');
                if (txt) txt.textContent = miIsEn() ? 'Camera off' : '카메라 꺼짐';
            }
        }
    }
    syncIcons();

    /* 🧹 (2026-07-24) 감시 루프 중복 등록 방지 — 이 함수는 재협상·unmute·재연결 때마다 다시 불린다.
       예전엔 부를 때마다 400ms 인터벌 + AudioContext + rAF 루프가 '한 세트씩 더' 생겼고,
       여러 루프가 같은 DOM(.vol-meter, .cam-off)에 동시에 써대며 토글을 반복할수록 깜빡임이 심해졌다.
       (Chrome 은 AudioContext 개수 상한이 있어 몇 번 반복하면 음량 막대가 아예 죽기도 했다.)
       → 박스당 루프는 항상 한 세트만. 스트림이 바뀌면 옛 세트를 정리하고 새로 건다. */
    /* 🔴 (2026-07-24 재점검) 중복 판정 키에 '오디오 트랙 id' 까지 넣을 것.
       처음엔 MediaStream 객체 동일성만 봤는데, 이 코드베이스는 스트림을 제자리에서 변형한다
       (마이크를 나중에 얻으면 같은 스트림에 트랙만 추가됨).
       그래서 '마이크 없이 입장 → 음량분석 실패 → 나중에 마이크 복구' 경로에서
       같은 스트림이라는 이유로 재등록이 막혀 **그 학생 음량 막대가 수업 끝까지 죽어 있었다.** */
    const _at0 = (stream.getAudioTracks && stream.getAudioTracks()[0]) || null;
    const monKey = (stream.id || '') + '|' + (_at0 ? _at0.id : 'noaudio');
    if (box.__vsMon) {
        if (box.__vsMon.key === monKey) return;                 // 스트림+오디오트랙 동일 = 재등록 불필요
        try { clearInterval(box.__vsMon.iconInt); } catch(e){}
        box.__vsMon.stop = true;
        try { box.__vsMon.ctx && box.__vsMon.ctx.close(); } catch(e){}
        box.__vsMon = null;
    }
    const mon = { key: monKey, stream: stream, stop: false, iconInt: null, ctx: null,
                  talking: false, dead: false, soundAt: Date.now() };
    box.__vsMon = mon;

    mon.iconInt = setInterval(() => {
        if (mon.stop || !box.isConnected) { clearInterval(mon.iconInt); return; }
        syncIcons();
    }, 400);

    // 음량 분석 (Web Audio API)
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        mon.ctx = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        function loop() {
            if (mon.stop || !box.isConnected) {
                try { ctx.close(); } catch(e) {}
                if (box.__vsMon === mon) box.__vsMon = null;
                return;
            }
            analyser.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            const avg = sum / data.length; // 0~255
            const a = stream.getAudioTracks()[0];
            const muted = !(a && a.enabled);
            const level = muted ? 0 : Math.min(bars.length, Math.floor(avg / 8));
            bars.forEach((b, i) => b.classList.toggle('on', i < level));
            /* 🟢🔇 (2026-08-07 강사 건의 1) "학생이 말할 때 초록 표시가 보이면 문제가 학생 쪽인지 우리 쪽인지 안다"
               ① 말하는 동안 타일 테두리 초록  ② 마이크는 켜져 있는데 8초 넘게 무음이면 «소리 안 들림» 배지.
               둘 다 «상태가 바뀔 때만» DOM 을 건드린다 — 매 프레임 쓰기 없음(수업 부하 0). */
            const talking = level >= 2;
            if (talking !== mon.talking) { mon.talking = talking; box.classList.toggle('vc-talking', talking); }
            if (!isLocal) {
                const _now = Date.now();
                if (muted || talking) mon.soundAt = _now;
                const dead = !muted && (_now - (mon.soundAt || _now) > 8000);
                if (dead !== mon.dead) { mon.dead = dead; vcMarkNoSound(box, dead); }
            }
            requestAnimationFrame(loop);
        }
        loop();
    } catch(e) {
        // 오디오 트랙이 없으면 createMediaStreamSource 가 던진다. 이때 만들어 둔 AudioContext 를
        // 닫지 않으면 브라우저의 AudioContext 개수 상한을 갉아먹는다(누수). (2026-07-24 재점검)
        try { if (mon.ctx) { mon.ctx.close(); mon.ctx = null; } } catch(_) {}
        console.warn('음량 분석 실패:', e);
    }
}

/* 🔇 (2026-08-07 강사 건의 1) "마이크는 켜져 있는데 소리가 안 들어온다"를 타일 위에 그대로 적는다.
   [왜 필요한가] 강사가 가장 답답해하는 순간은 «학생이 말을 안 하는 건지, 마이크가 죽은 건지» 모를 때다.
   음소거(🎤 ✖)와 «켜져 있는데 무음»은 완전히 다른 상황인데 화면에서 구분이 안 됐다.
   문구는 한/영 두 벌 — 강사 다수가 필리핀이다. */
function vcMarkNoSound(box, on) {
    if (!box) return;
    let b = box.querySelector('.vc-nosound-badge');
    if (!on) { if (b) b.remove(); return; }
    if (b) return;
    try { if (getComputedStyle(box).position === 'static') box.style.position = 'relative'; } catch (_) {}
    const en = (typeof getLang === 'function' && getLang() === 'en');
    const uid = (box.id || '').replace('vc-video-', '');
    /* 강사에게는 «누를 수 있는» 배지로 준다 — 이 한 번의 클릭이 학생 브라우저에서 마이크를
       다시 잡게 한다(건의 1의 "학생 기기 설정을 바꾸고 싶다"에 대한 가장 가벼운 답).
       학생·관찰자에게는 그냥 안내 문구. */
    const staff = (typeof vcIsStaffNow === 'function') ? vcIsStaffNow() : false;
    b = document.createElement(staff && uid ? 'button' : 'div');
    b.className = 'vc-nosound-badge';
    b.textContent = staff && uid
        ? (en ? '🔇 No sound · Tap to fix' : '🔇 소리 없음 · 눌러서 고치기')
        : (en ? '🔇 No sound coming in' : '🔇 소리가 안 들어와요');
    b.title = en
        ? 'Mic is on but nothing is heard. Tapping asks their browser to pick up the microphone again.'
        : '마이크는 켜져 있는데 소리가 없어요. 누르면 학생 브라우저가 마이크를 다시 잡습니다.';
    if (staff && uid) {
        b.type = 'button';
        b.addEventListener('click', function (e) { e.stopPropagation(); vcRequestMicFix(uid, b); });
    }
    box.appendChild(b);
}

/* 🎧 (2026-08-07 강사 건의 1) "보다처럼 학생 PC·태블릿 설정을 우리가 바꿀 수 있으면 좋겠다"
   기기 설정창을 통째로 원격 조작하는 것은 무겁고 위험하다(권한·사생활). 대신 실제로 막히는
   지점 하나만 원격으로 푼다 — «마이크를 다시 잡기». 현장 문제의 대부분이 이것이다:
   학생이 다른 앱이 마이크를 물고 있거나, 권한 팝업을 놓쳤거나, 장치를 갈아 끼운 경우.
   강사→학생 요청 1건, 학생→강사 결과 1건. 폴링 없음. */
window.vcRequestMicFix = function (uid, btn) {
    if (!uid) return;
    const en = (typeof getLang === 'function' && getLang() === 'en');
    try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-fix', data: { targetUserId: uid, what: 'mic' } }); } catch (_) {}
    if (btn) { btn.disabled = true; btn.textContent = en ? '🎧 Asking…' : '🎧 요청했어요…'; }
    try { if (typeof showToast === 'function') showToast(en ? '🎧 Asked the student to pick up the mic again' : '🎧 학생에게 마이크를 다시 잡도록 요청했어요'); } catch (_) {}
    /* 답이 없어도 8초 뒤엔 다시 누를 수 있게 되돌린다 — 학생이 오래된 화면이면 답이 안 온다 */
    setTimeout(function () {
        if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = en ? '🔇 No sound · Tap to fix' : '🔇 소리 없음 · 눌러서 고치기'; }
    }, 8000);
};

/* ══════════════════════════════════════════════════════════════════
   🎛 (2026-08-10) 장치 도우미 — BODA(2019 설치형)의 「User Management ▸ Device control」을 웹으로.
   강사가 학생 타일의 🎛 버튼을 누르면: 학생 기기의 카메라·마이크·스피커 목록을 받아 보고,
   골라 주면 학생 브라우저가 그 자리에서 갈아끼운다(검증된 vcSwitchMic/vcSetCamDevice 경로).
   [원칙]
   · 설치 없음 — 전부 브라우저 표준(enumerateDevices/replaceTrack/setSinkId). WS 로 JSON 몇 줄뿐.
   · 몰래 없음 — 목록 요청·교체 모두 학생 화면에 토스트가 뜬다.
   · 음소거 해제 없음 — 장치를 바꿔도 켬/끔 상태와 강사 잠금은 그대로.
   · 스피커는 setSinkId 미지원 기기(iOS 사파리)가 있어 sinkOk 로 미리 알리고 패널에서 잠근다.
   서버 게이트는 video-call-room.ts 의 device-fix 와 같은 자리 — 강사/관리자 role 만 보낼 수 있다.
   ══════════════════════════════════════════════════════════════════ */

/* ── 학생 쪽: 내 장치 목록·현재 선택을 강사에게 보낸다 ── */
async function vcDevHelpGather() {
    var out = { cams: [], mics: [], spks: [] };
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return out;
    var list = await navigator.mediaDevices.enumerateDevices();
    var c = 0, m = 0, s = 0;
    list.forEach(function (d) {
        if (!d.deviceId || d.deviceId === 'communications') return;   // 윈도우 가짜 중복 항목 제외 (vc-dock 과 동일)
        var label = String(d.label || '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*/i, '').trim().slice(0, 60);
        if (d.kind === 'videoinput'  && out.cams.length < 15) out.cams.push({ id: d.deviceId, label: label || ('Camera '  + (++c)) });
        if (d.kind === 'audioinput'  && out.mics.length < 15) out.mics.push({ id: d.deviceId, label: label || ('Mic '     + (++m)) });
        if (d.kind === 'audiooutput' && out.spks.length < 15) out.spks.push({ id: d.deviceId, label: label || ('Speaker ' + (++s)) });
    });
    return out;
}
async function vcDevHelpSendList() {
    try {
        var devs = await vcDevHelpGather();
        var cur = { cam: '', mic: '', spk: (typeof vcSavedSpkId === 'function' && vcSavedSpkId()) || 'default', camSaved: '', micSaved: '' };
        /* 가상배경·화면공유 중엔 송출 트랙이 캔버스라 deviceId 가 목록에 없는 임의 값이다(vc-dock 주석 참고)
           → 저장된 선택(camSaved/micSaved)을 같이 보내 강사 패널이 폴백으로 쓴다. */
        try { var vt = vcLocalStream && vcLocalStream.getVideoTracks()[0]; if (vt && vt.getSettings) cur.cam = vt.getSettings().deviceId || ''; } catch (_) {}
        try { var at = vcLocalStream && vcLocalStream.getAudioTracks()[0]; if (at && at.getSettings) cur.mic = at.getSettings().deviceId || ''; } catch (_) {}
        try { cur.camSaved = (typeof vcSavedCamId === 'function' && vcSavedCamId()) || ''; } catch (_) {}
        try { cur.micSaved = (typeof vcSavedMicId === 'function' && vcSavedMicId()) || ''; } catch (_) {}
        if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-list', data: {
            fromUserId: vcUserId, devices: devs, current: cur,
            sinkOk: ('setSinkId' in HTMLMediaElement.prototype)
        } });
    } catch (e) { console.warn('[dev-help] 목록 전송 실패:', e); }
}

/* ── 강사 쪽: 학생 타일의 🎛 버튼 + 장치 패널 ── */
function vcDevHelpEnsureCss() {
    if (document.getElementById('vc-devhelp-css')) return;
    var st = document.createElement('style');
    st.id = 'vc-devhelp-css';
    st.textContent =
        '.vc-devhelp-btn{position:absolute;top:40px;right:8px;z-index:8;background:rgba(15,23,42,.72);color:#fff;border:1px solid rgba(148,163,184,.35);border-radius:999px;padding:4px 9px;font-size:13px;line-height:1;cursor:pointer;}' +
        '.vc-devhelp-btn:hover{background:rgba(16,185,129,.85);}' +
        '#vc-devhelp-panel{position:fixed;right:16px;bottom:96px;z-index:2600;width:min(320px,calc(100vw - 24px));background:#0f172a;border:1px solid rgba(148,163,184,.35);border-radius:14px;box-shadow:0 18px 50px -12px rgba(0,0,0,.6);color:#e2e8f0;font-size:13px;padding:12px 14px;}' +
        '#vc-devhelp-panel h4{margin:0 0 8px;font-size:14px;display:flex;align-items:center;gap:6px;}' +
        /* ⚠ flex 에서 space-between 금지(사이드바 hover 사고) — flex-start + margin-left:auto 로 오른쪽 정렬 */
        '#vc-devhelp-panel .dh-x{margin-left:auto;background:none;border:0;color:#94a3b8;font-size:15px;cursor:pointer;padding:2px 4px;}' +
        '#vc-devhelp-panel .dh-row{display:flex;align-items:center;gap:8px;margin:7px 0;}' +
        '#vc-devhelp-panel .dh-row label{flex:0 0 92px;color:#cbd5e1;font-weight:700;}' +
        '#vc-devhelp-panel .dh-row select{flex:1;min-width:0;background:#1e293b;color:#f1f5f9;border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:6px 8px;font-size:12.5px;}' +
        '#vc-devhelp-panel .dh-row select:disabled{opacity:.45;}' +
        '#vc-devhelp-panel .dh-status{margin-top:8px;padding:7px 9px;border-radius:8px;background:rgba(148,163,184,.12);color:#cbd5e1;line-height:1.45;min-height:30px;}' +
        '#vc-devhelp-panel .dh-note{margin-top:4px;font-size:11px;color:#94a3b8;}' +
        '#vc-devhelp-panel .dh-refresh{background:rgba(37,99,235,.25);border:1px solid #3b82f6;color:#dbeafe;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;}';
    document.head.appendChild(st);
}
/* JS 로 그리는 글자는 data-ko/data-en 도 «같이» 갱신해야 i18n-sweep 이 살아 있다 (CLAUDE.md 함정 표) */
function vcDevHelpTxt(el, ko, en) {
    if (!el) return;
    el.setAttribute('data-ko', ko); el.setAttribute('data-en', en);
    el.textContent = (typeof getLang === 'function' && getLang() === 'en') ? en : ko;
}
function vcDevHelpStatus(ko, en) {
    var p = document.getElementById('vc-devhelp-panel');
    if (p) vcDevHelpTxt(p.querySelector('.dh-status'), ko, en);
}
function vcDevHelpNote(ko, en) {
    var p = document.getElementById('vc-devhelp-panel');
    if (!p) return;
    var el = p.querySelector('.dh-note');
    vcDevHelpTxt(el, ko, en);
    el.style.display = ko ? '' : 'none';
}
function vcDevHelpClose() {
    var p = document.getElementById('vc-devhelp-panel'); if (p) p.remove();
    if (window.__vcDevHelp) clearTimeout(window.__vcDevHelp.timer);
    window.__vcDevHelp = null;
}
window.vcDevHelpClose = vcDevHelpClose;
function vcDevHelpRequest() {
    var st = window.__vcDevHelp, p = document.getElementById('vc-devhelp-panel');
    if (!st || !p) return;
    p.querySelectorAll('select').forEach(function (s) { s.disabled = true; s.innerHTML = ''; });
    vcDevHelpStatus('📡 상대 장치 목록을 요청했어요…', '📡 Asking them for their devices…');
    vcDevHelpNote('', '');
    try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-list-req', data: { targetUserId: st.uid } }); } catch (_) {}
    clearTimeout(st.timer);
    st.timer = setTimeout(function () {
        vcDevHelpStatus('⚠ 응답이 없어요 — 상대 화면이 예전 버전이거나 연결이 불안정할 수 있어요. 🔄 로 다시 시도하세요.',
                        '⚠ No response — they may be on an older page or have a bad connection. Try 🔄 again.');
    }, 10000);
}
window.vcOpenDevHelp = function (uid, name) {
    if (!uid) return;
    vcDevHelpEnsureCss();
    var p = document.getElementById('vc-devhelp-panel');
    if (!p) {
        p = document.createElement('div');
        p.id = 'vc-devhelp-panel';
        var rows = [
            { k: 'cam', ko: '📷 카메라', en: '📷 Camera' },
            { k: 'mic', ko: '🎙 마이크', en: '🎙 Microphone' },
            { k: 'spk', ko: '🔊 스피커', en: '🔊 Speaker' }
        ].map(function (d) {
            return '<div class="dh-row"><label data-ko="' + d.ko + '" data-en="' + d.en + '">' + d.ko + '</label><select data-kind="' + d.k + '"></select></div>';
        }).join('');
        p.innerHTML = '<h4>🎛 <span class="dh-title"></span><button type="button" class="dh-x" aria-label="close">✕</button></h4>'
            + rows
            + '<div class="dh-status"></div><div class="dh-note" style="display:none"></div>'
            + '<div style="margin-top:8px"><button type="button" class="dh-refresh">🔄 <span data-ko="목록 새로고침" data-en="Refresh list">목록 새로고침</span></button></div>';
        p.querySelector('.dh-x').onclick = vcDevHelpClose;
        p.querySelector('.dh-refresh').onclick = vcDevHelpRequest;
        p.querySelectorAll('select').forEach(function (sel) {
            sel.onchange = function () { vcDevHelpApply(sel.getAttribute('data-kind'), sel.value); };
        });
        document.body.appendChild(p);
        try { if (window.applyI18n) window.applyI18n(p); } catch (_) {}
    }
    window.__vcDevHelp = { uid: uid, name: name || '' };
    vcDevHelpTxt(p.querySelector('.dh-title'), '장치 도우미 — ' + (name || '참가자'), 'Device Helper — ' + (name || 'Participant'));
    vcDevHelpRequest();
};
function vcDevHelpApply(kind, deviceId) {
    var st = window.__vcDevHelp, p = document.getElementById('vc-devhelp-panel');
    if (!st || !p || !deviceId) return;
    try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'device-set', data: { targetUserId: st.uid, kind: kind, deviceId: deviceId } }); } catch (_) {}
    p.querySelectorAll('select').forEach(function (s) { s.disabled = true; });
    vcDevHelpStatus('⏳ 적용 중…', '⏳ Applying…');
    clearTimeout(st.timer);
    st.timer = setTimeout(function () {
        p.querySelectorAll('select').forEach(function (s) { s.disabled = false; });
        vcDevHelpStatus('⚠ 결과 응답이 없어요 — 🔄 새로고침으로 상태를 다시 확인해 주세요.', '⚠ No result came back — press 🔄 to re-check.');
    }, 10000);
}
function vcDevHelpOnList(data) {
    var st = window.__vcDevHelp, p = document.getElementById('vc-devhelp-panel');
    if (!st || !p || !data || data.fromUserId !== st.uid) return;
    clearTimeout(st.timer);
    var devs = data.devices || {};
    var cur = data.current || {};
    var map = { cam: [devs.cams || [], cur.cam, cur.camSaved], mic: [devs.mics || [], cur.mic, cur.micSaved], spk: [devs.spks || [], cur.spk, ''] };
    p.querySelectorAll('select').forEach(function (sel) {
        var k = sel.getAttribute('data-kind');
        var arr = map[k][0];
        sel.innerHTML = '';
        arr.forEach(function (d) {
            var o = document.createElement('option');
            o.value = d.id; o.textContent = d.label || String(d.id).slice(0, 8);
            sel.appendChild(o);
        });
        /* 지금 쓰는 장치 → 저장된 선택 순서로, 목록에 실제로 있는 첫 후보를 선택(vc-dock 과 같은 규칙) */
        var want = [map[k][1], map[k][2]];
        for (var i = 0; i < want.length; i++) {
            if (!want[i]) continue;
            var hit = false;
            for (var j = 0; j < sel.options.length; j++) if (sel.options[j].value === want[i]) { hit = true; break; }
            if (hit) { sel.value = want[i]; break; }
        }
        sel.disabled = !arr.length || (k === 'spk' && data.sinkOk === false);
    });
    if (data.sinkOk === false) vcDevHelpNote('ℹ 이 기기는 스피커 원격 변경을 지원하지 않아요 (iPhone·iPad 등).', 'ℹ This device cannot switch speakers remotely (iPhone/iPad etc.).');
    vcDevHelpStatus('✅ 목록을 받았어요 — 고르면 상대 기기에 바로 적용돼요.', "✅ Got the list — picking one applies instantly on their device.");
}
function vcDevHelpOnResult(data) {
    var st = window.__vcDevHelp, p = document.getElementById('vc-devhelp-panel');
    if (!st || !p || !data || data.fromUserId !== st.uid) return;
    clearTimeout(st.timer);
    p.querySelectorAll('select').forEach(function (s) { s.disabled = false; });
    var lbl = data.label ? ' (' + data.label + ')' : '';
    if (data.ok && data.reason === 'deferred')
        vcDevHelpStatus('🖥 상대가 화면 공유 중 — 공유가 끝나면 새 카메라로 바뀌어요.', '🖥 They are screen-sharing — the new camera applies when it ends.');
    else if (data.ok)
        vcDevHelpStatus('✅ 바꿨어요' + lbl, '✅ Changed' + lbl);
    else if (data.reason === 'nosink')
        vcDevHelpStatus('⚠ 이 기기는 스피커 원격 변경이 안 돼요 (iPhone·iPad 등).', '⚠ This device cannot switch speakers remotely (iPhone/iPad etc.).');
    else
        vcDevHelpStatus('⚠ 실패 — 상대 화면에 원인 안내가 떴어요 (권한 차단·다른 앱 점유 등). 확인을 부탁하세요.',
                        '⚠ Failed — they saw the reason on their screen (permission blocked or another app using it). Ask them to check.');
}
/* 참가자 타일 우측(💬 아래)에 🎛 버튼 — 보는 사람은 강사·관리자만.
   🎛 (2026-08-12 강사 요청) 예전엔 «학생 박스에만» 붙였는데(vcBoxIsStudent),
   재택 강사의 카메라·헤드셋이 고장났을 때 관리자·다른 강사가 도와줄 길이 없었다.
   → 강사 타일에도 붙인다. 서버는 어차피 «보내는 쪽이 강사·관리자» 일 때만 릴레이하고,
     받는 쪽은 targetUserId 가 자기일 때만 응답하므로 학생이 악용할 길은 그대로 막혀 있다.
   ⚠️ 내 타일(vc-local-box)에는 안 붙인다 — 자기 장치는 아래 독의 장치 메뉴로 바꾼다. */
function vcAddDevBtn(box, uid) {
    try {
        if (!box || !uid || uid === 'demoteacher') return;
        if (box.id === 'vc-local-box') return;
        if (!(typeof vcIsStaffNow === 'function' && vcIsStaffNow())) return;
        if (box.querySelector('.vc-devhelp-btn')) return;
        vcDevHelpEnsureCss();
        var en = (typeof getLang === 'function' && getLang() === 'en');
        var btn = document.createElement('button');
        btn.className = 'vc-devhelp-btn';
        btn.type = 'button';
        btn.textContent = '🎛';
        btn.title = en ? "Device helper — see and switch this participant's camera/mic/speaker"
                       : '장치 도우미 — 이 참가자의 카메라·마이크·스피커를 보고 바꿔 줍니다';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var lbl = box.querySelector('.video-label');
            window.vcOpenDevHelp(uid, ((lbl && lbl.textContent) || '').trim());
        });
        box.style.position = box.style.position || 'relative';
        box.appendChild(btn);
    } catch (_) {}
}

/** 참가자 퇴장 시 비디오 및 연결 제거 */
/* 🇵🇭 (2026-07-24) 순단(dropped) 유령 타일 정리 시간 — 이 시간 안에 재접속하지 않으면 타일을 치운다.
   서버는 재접속마다 '새 userId' 를 발급하므로, 옛 타일을 그냥 두면 영원히 남는다.
   반대로 즉시 지우면 상대가 '갑자기 화면에서 사라진' 것처럼 보인다(사장님이 신고한 그 증상).
   → 잠깐 '재연결 중'으로 남겨 두되, 반드시 시간제한을 건다. */
const VC_GHOST_TILE_MS = 20000;
/** 순단된 참가자 타일을 지우지 않고 '재연결 중' 상태로 표시 */
function vcMarkPeerReconnecting(box) {
    if (!box) return;
    box.dataset.vcGhost = '1';
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
    let ov = box.querySelector('.vc-reconn-hint');
    if (!ov) {
        ov = document.createElement('div');
        ov.className = 'vc-reconn-hint';
        ov.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;'
            + 'background:rgba(15,23,42,.86);color:#93c5fd;font-size:13px;font-weight:700;text-align:center;line-height:1.4;padding:8px;z-index:5;pointer-events:none;';
        box.appendChild(ov);
    }
    const en = miIsEn();
    ov.innerHTML = '🔄<span>' + (en ? 'Reconnecting…<br>(please wait a moment)' : '재연결 중…<br>(잠시만 기다려 주세요)') + '</span>';
    clearTimeout(box.__ghostTimer);
    box.__ghostTimer = setTimeout(function(){
        try { if (box.dataset.vcGhost === '1') { box.remove(); vcUpdateGridCount(); } } catch(_){}
    }, VC_GHOST_TILE_MS);
}
/** 재접속한 참가자가 새 타일로 들어오면, 남아 있던 '재연결 중' 유령 타일을 즉시 정리 */
function vcSweepGhostTiles() {
    try {
        document.querySelectorAll('.video-box[data-vc-ghost="1"]').forEach(function(b){
            clearTimeout(b.__ghostTimer); b.remove();
        });
        vcUpdateGridCount();
    } catch(_){}
}
window.vcSweepGhostTiles = vcSweepGhostTiles;

function vcRemovePeer(userId, reason) {
    const pc = vcPeerConnections[userId];
    if (pc) { pc.close(); delete vcPeerConnections[userId]; }
    try { delete vcPendingCandidates[userId]; } catch(_){}  // fix (2026-07-05) 버퍼된 ICE 후보 정리
    try { delete vcRemoteStreams[userId]; } catch(_){}   // fix (2026-06-01) 원격 스트림도 정리
    try { if (window.vcRemoteCamOff) delete window.vcRemoteCamOff[userId]; } catch(_){}  // 📷 카메라 상태 기록도 정리
    const box = document.getElementById(`vc-video-${userId}`);
    // 🇵🇭 스스로 나간 게 아니라 '끊긴' 것이면 타일을 바로 지우지 않는다 (위 주석 참고)
    if (box && reason && reason !== 'left') {
        // 🔴 (2026-07-24 재점검) 접두사를 'vc-video-' 와 겹치지 않게 할 것.
        //   처음엔 'vc-video-ghost-' 로 지었는데, 저장소 곳곳이 id.replace('vc-video-','') 나
        //   [id^="vc-video-"] 로 참가자를 찾는다. 그래서 유령이 '진짜 참가자'로 잡혀
        //   개별채팅 대상칩·칭찬 버튼·고착 워치독·녹화 합성까지 오염됐다.
        box.id = 'vcghost-' + userId;
        vcMarkPeerReconnecting(box);
        try { const aux1 = document.getElementById('vc-aud-' + userId); if (aux1) { aux1.srcObject = null; aux1.remove(); } } catch(_){}
        vcUpdateGridCount();
        return;
    }
    if (box) box.remove();
    // 🔊 보조 오디오 경로도 함께 정리 (남으면 다음 입장 때 옛 스트림 무음 재생)
    try { const aux = document.getElementById('vc-aud-' + userId); if (aux) { aux.srcObject = null; aux.remove(); } } catch(_){}
    vcUpdateGridCount();
}

/**
 * 비디오 그리드의 참가자 수(data-count)를 현재 DOM의 video-box 개수로 갱신.
 * CSS `#vc-video-grid[data-count="N"]` 선택자가 세로/가로 모드 레이아웃을 결정.
 */
function vcUpdateGridCount() {
    const grid = document.getElementById('vc-video-grid');
    if (!grid) return;
    // detached(팝아웃) 상태의 박스는 그리드 밖에 있으므로 실제 자식 중 video-box만 카운트
    const n = grid.querySelectorAll(':scope > .video-box').length;
    grid.setAttribute('data-count', String(Math.min(n, 9)));
    try { vcMarkPipPrimary(grid); } catch(e){}
}

// 🥭 (2026-07-13) PIP에는 '상대방 1명'만 — 사장님 요청.
//   PIP 작은 창(세로폰 video-pip 모드의 우상단 창, 데스크톱 오버레이 PIP)에 참가자
//   비디오가 전부 쌓여 나오던 것을, 대표 1명(내가 학생이면 선생님, 그 외엔 첫 원격
//   참가자)만 남기고 숨긴다. 숨김 자체는 CSS(<style id="vc-pip-single-counterpart">)와
//   vcSyncPipVideos()가 이 클래스를 보고 처리하므로, 여기서는 마킹만 담당.
//   역할(data-role)이 늦게 도착해도 아래 폴링이 1.2초 주기로 다시 골라 자가교정한다.
function vcMarkPipPrimary(grid){
    grid = grid || document.getElementById('vc-video-grid');
    if (!grid) return;
    const boxes = Array.from(grid.querySelectorAll(':scope > .video-box'));
    const candidates = boxes.filter(b => b.id !== 'vc-local-box');
    const primary = candidates.find(b => (b.dataset && b.dataset.role) === 'teacher') || candidates[0] || null;
    boxes.forEach(b => b.classList.toggle('vc-pip-primary', b === primary));
}
setInterval(function(){
    if (document.body && document.body.classList.contains('vc-in-call')) {
        try { vcMarkPipPrimary(); } catch(e){}
    }
}, 1200);

/* fix (2026-07-12) — 📱 세로 카메라 얼굴 잘림 방지:
 * 휴대폰(세로)이 보내는 portrait 영상이 가로/정사각 박스에 object-fit:cover 로
 * 크롭되어 얼굴 위아래가 잘리던 문제. 각 <video>의 실제 해상도(videoWidth/Height)를
 * 보고 세로 영상이면 박스에 .vid-portrait 를 달아 CSS(<style id="vid-portrait-fix">)가
 * contain(얼굴 전체 표시)으로 전환하게 한다.
 * 휴대폰을 가로로 돌리면 트랙 해상도가 가로로 바뀌며 'resize' 이벤트로 자동 복귀. */
function vcWatchVideoAspect(v){
    if (!v || v.__aspectWatch) return;
    v.__aspectWatch = true;
    var upd = function(){
        var box = v.closest ? v.closest('.video-box') : null;
        if (!box || !v.videoWidth || !v.videoHeight) return;
        box.classList.toggle('vid-portrait', v.videoHeight > v.videoWidth);
    };
    v.addEventListener('loadedmetadata', upd);
    v.addEventListener('resize', upd);   // 트랙 교체·회전 시 해상도 변경 감지
    upd();
}
(function(){
    var sweep = function(){
        try {
            document.querySelectorAll('#vc-video-grid video, .video-pane video, .vc-pip-body video, .video-box video')
                .forEach(vcWatchVideoAspect);
        } catch(e){}
    };
    var arm = function(){
        sweep();
        var grid = document.getElementById('vc-video-grid');
        if (grid && !grid.__aspectMO) {
            grid.__aspectMO = new MutationObserver(sweep);
            grid.__aspectMO.observe(grid, { childList: true, subtree: true });
        }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
})();

/** 다자간 통화 방 나가기 */
async function vcLeaveRoom() {
    // 🧹 (2026-07-24 재점검) 남아 있는 '재연결 중' 유령 타일 + 종료 안내 배너 정리.
    //   안 지우면 SPA 로 홈에 갔다가 곧바로 재입장했을 때 지난 수업의 잔재가 새 화면에 남는다.
    try { vcSweepGhostTiles(); } catch(_) {}
    try { vcDevHelpClose(); } catch(_) {}   // 🎛 장치 도우미 패널 — 다음 수업에 남지 않게
    try { const _n = document.getElementById('vc-conn-notice'); if (_n) _n.remove(); } catch(_) {}
    // ── 자동 녹화 중이면 먼저 중지하고 R2 업로드 완료까지 대기 ──
    let vcRecResult = null;
    try {
        if (window.MangoV3 && typeof window.MangoV3.stopRecording === 'function') {
            console.log('[vcLeaveRoom] 녹화 중지 시도 (업로드 완료까지 대기)...');
            vcRecResult = await window.MangoV3.stopRecording();
            console.log('[vcLeaveRoom] 녹화 중지 결과:', vcRecResult);
        }
    } catch (e) {
        console.warn('[vcLeaveRoom] 녹화 중지/업로드 예외:', e);
    }

    // ⭐ 교사 전용 — 수업 종료 직후 AI 코칭 카드(잘한점/개선점 한·영). 학생에겐 안 뜸.
    //    (2026-07-22) 관리자/매니저/경영자에겐 억제 — 관리자 임베드(openLiveClass·mypage 수업입장)가
    //    vc_role=teacher 를 강제하고 이름도 '교사 …'라서 vcIsTeacherRole/이름 휴리스틱으로는 구분 불가.
    //    쿠키 세션 /api/admin/me 의 role 이 권위: teacher 외(hq·staff·franchise·branch·agency)면 카드 없음.
    //    세션이 없거나(401)·네트워크 오류면 기존 교사 판정을 그대로 따른다(실교사 카드 보장).
    try {
        var _fbRole = '';
        // 🎭 (2026-08-08) 저장된 역할은 주인(uid) 확인을 거친 값만 쓴다
        try { _fbRole = (window.vcMyRole || (window.vcRoleStored ? window.vcRoleStored() : '') || '') + ''; } catch(_){}
        var _isTeacher = (typeof vcIsTeacherRole === 'function') ? vcIsTeacherRole()
            : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
        if (_fbRole === 'admin') _isTeacher = false;   // 메인사이트 admin 역할도 코칭 대상 아님
        // 🚪 (2026-07-29) 회의방(meet-*)은 수업이 아니다 → 교사 AI 수업코칭 카드를 띄우지 않는다.
        if (window.__vcIsMeetingRoom && window.__vcIsMeetingRoom()) _isTeacher = false;
        if (_isTeacher && window.MangoTeacherFeedback && vcRoomId) {
            var _recId = (typeof recordingId !== 'undefined' && recordingId) ? recordingId
                : (vcRecResult && vcRecResult.recording_id) || null;
            var _tUid = '';
            try { var _u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null; if (_u) _tUid = _u.uid || _u.id || ''; } catch(_){}
            var _fbOpts = {
                room_id: vcRoomId,
                teacher_name: (typeof vcUsername !== 'undefined' ? vcUsername : ''),
                teacher_uid: _tUid,
                recording_id: _recId,
                lang: 'en'
            };
            // 방 정리를 막지 않도록 비동기로 확인 후 표시
            (async function(){
                try {
                    var _mr = await fetch('/api/admin/me', { credentials: 'include' });
                    if (_mr && _mr.ok) {
                        var _mj = await _mr.json().catch(function(){ return null; });
                        if (_mj && _mj.ok && _mj.role && _mj.role !== 'teacher') {
                            console.log('[teacher-feedback] 관리자 세션(role=' + _mj.role + ') — 코칭 카드 생략');
                            return;
                        }
                    }
                } catch(_){}
                window.MangoTeacherFeedback.show(_fbOpts);
            })();
        }
    } catch (e) { console.warn('[teacher-feedback] hook:', e); }

    Object.keys(vcPeerConnections).forEach(id => {
        vcPeerConnections[id].close();
        const el = document.getElementById(`vc-video-${id}`);
        if (el) el.remove();
    });
    vcPeerConnections = {};
    vcRemoteStreams = {};
    // 의도적 퇴장을 서버에 명시(leave-room) — close 프레임이 유실돼도 다른 참가자에게
    // 'dropped'(60초 유예)가 아닌 'left'(정상 퇴장)로 전달되게 한다.
    if (vcConn) { try { vcConn.send({ type: 'leave-room', data: {} }); } catch(_){} }
    if (vcConn) vcConn.close();
    if (vcLocalStream) {
        vcLocalStream.getTracks().forEach(t => t.stop());
        vcLocalStream = null;
    }
    // Wake Lock 해제 (+ 비디오 루프 폴백, 보조 오디오, 소리 배너도 함께 정리)
    if (wakeLock) { wakeLock.release(); wakeLock = null; console.log('[wakeLock] 해제됨'); }
    try { stopWakeVideoFallback(); } catch(_) {}
    try { document.querySelectorAll('audio[id^="vc-aud-"]').forEach(a => { a.srcObject = null; a.remove(); }); } catch(_) {}
    try { vcToggleSoundBanner(false); } catch(_) {}
    vcConn = null;
    window.vcConn = null;
    try { window.vcStopPdfPoll && window.vcStopPdfPoll(); window._vcShownPdfKey = ''; window._vcShownPdfUrl = ''; } catch(_){}  // fix (2026-06-02) 폴링 중지+표시상태 초기화
    // ── fix v28 (2026-05-27) — ✕ 버튼 → 홈 강제 이동 안전망 ──
    try {
        const cm = document.getElementById('vc-chat-messages');
        if (cm) cm.innerHTML = '';
    } catch(e){ console.warn('[vcLeaveRoom] chat clear:', e); }
    document.body.classList.remove('vc-in-call');
    try { vcHideReconnecting(); } catch(_) {}   // 통화 종료 시 재연결 배너 정리

    // 관찰자 모드 해제 시 UI 복원
    if (vcIsObserver) {
        vcIsObserver = false;
        window._vcObserverMode = false;
        const localBox = document.getElementById('vc-local-box');
        if (localBox) localBox.style.display = '';
        const toolbar = document.getElementById('vc-bottom-toolbar');
        if (toolbar) toolbar.style.display = '';
    }

    // 1차 — SPA view 전환 시도
    try { showView('view-home'); } catch(e){ console.warn('[vcLeaveRoom] showView fail:', e); }

    // 🚀 수업 종료 → 다음 활동(복습퀴즈 추천) 메뉴 — 홈 전환이 정착된 뒤 표시
    //   (교사는 위 AI 코칭 카드가 뜨므로 학생용 흐름 메뉴는 생략)
    var _flowIsTeacher = (typeof vcIsTeacherRole === 'function') ? vcIsTeacherRole()
        : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
    if (!/[?&](room|r)=/.test(location.search) && !_flowIsTeacher) {
        setTimeout(function(){ try { window.MangoFlow && MangoFlow.open('class'); } catch(_){} }, 700);
    }

    // 2차 — 0.4초 뒤에도 홈 화면이 안 보이면 강제로 홈 URL 로 이동
    setTimeout(() => {
        try {
            const stillInCall = document.body.classList.contains('vc-in-call');
            const viewHome = document.getElementById('view-home');
            const homeVisible = !!(viewHome && viewHome.classList.contains('active') && viewHome.offsetParent !== null);
            const hasRoomParam = /[?&](room|r)=/.test(location.search);
            if (stillInCall || !homeVisible || hasRoomParam) {
                console.warn('[vcLeaveRoom] SPA 전환 실패 감지 — 홈으로 강제 이동');
                location.href = '/';
            }
        } catch(e) {
            console.warn('[vcLeaveRoom] 안전망 오류 — 강제 이동:', e);
            try { location.href = '/'; } catch(_){}
        }
    }, 400);
}

/** 마이크 / 카메라 토글 — 진단·복구 강화 */
async function vcToggleMic() {
    // 🔇 선생님이 전체 음소거를 켠 동안 학생은 마이크를 다시 켤 수 없음
    if (window.__vcMicLockedByTeacher && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin') {
        try { if (typeof showToast === 'function') showToast((localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang')) === 'en' ? '🔇 Teacher muted everyone' : '🔇 선생님이 전체 음소거를 켰어요'); } catch(_){}
        return;
    }
    if (!vcLocalStream) {
        alert('수업 입장 후에 마이크를 사용할 수 있습니다.');
        return;
    }
    let audioTracks = vcLocalStream.getAudioTracks();

    // 🎤 오디오 트랙이 없으면 재획득 시도
    if (audioTracks.length === 0) {
        console.warn('[mic] 오디오 트랙 없음 — 재획득 시도');
        try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });
            const newTrack = audioStream.getAudioTracks()[0];
            if (newTrack) {
                vcLocalStream.addTrack(newTrack);
                audioTracks = [newTrack];
                // 모든 PeerConnection에 오디오 senders 추가/교체
                if (typeof vcPeerConnections === 'object') {
                    Object.values(vcPeerConnections).forEach(pc => {
                        try {
                            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                            if (sender) sender.replaceTrack(newTrack);
                            else pc.addTrack(newTrack, vcLocalStream);
                        } catch (e) { console.warn('[mic] PC 오디오 추가 실패:', e); }
                    });
                }
                console.log('[mic] ✅ 마이크 재획득 완료');
                vcMicOn = true; window.vcMicOn = true; // 처음 켜진 상태로 (독 표시도 함께 맞춤)
            }
        } catch (e) {
            const reason = (e && e.name === 'NotAllowedError') ? '브라우저에서 마이크 권한이 차단되었습니다. 주소창 좌측 자물쇠 아이콘 → 마이크 → 허용으로 변경 후 재시도해 주세요.' :
                          (e && e.name === 'NotFoundError') ? '연결된 마이크 장치를 찾을 수 없습니다. 마이크가 PC에 제대로 연결되어 있는지 확인해 주세요.' :
                          '마이크 접근 실패: ' + (e && e.message || e);
            alert('🎤 ' + reason);
            return;
        }
    }

    // 토글
    vcMicOn = !vcMicOn;
    // ⚠️ (2026-07-24) `let vcMicOn` 은 window 프로퍼티를 만들지 않는다. 그래서 하단 독의 sync()가
    //   보는 window.vcMicOn 이 계속 undefined 였고, 마이크를 꺼도 독 버튼이 빨갛게 변하지 않았다.
    //   → 사용자는 "안 눌렸나?" 하고 계속 다시 누르게 되고, 그때마다 재렌더가 겹쳐 화면이 깜빡였다.
    window.vcMicOn = vcMicOn;
    audioTracks.forEach(t => t.enabled = vcMicOn);
    const btn = document.getElementById('vc-btn-mic');
    if (btn) {
        btn.className = `ctrl-btn ${vcMicOn ? 'on' : 'off'}`;
        btn.textContent = vcMicOn ? '🎤' : '🔇';
    }
    // 레벨 미터 시작/중지
    if (vcMicOn) startMicLevelMeter();
    else stopMicLevelMeter();
}

/* 🗑 (2026-08-10 사장님 지시) 왼쪽 아래에 떠 있던 «🎤 내 마이크» 음량 미터 제거.
   (id 는 CLAUDE.md 1-3 참고 — 여기 적으면 «부활 금지» 하니스 가드가 이 주석에 걸린다)
   얼굴 타일의 음량 막대(attachStreamMonitor — 말하면 초록 칸이 차오르는 그것)와 중복이라
   화면만 어지럽혔다. 가운데→왼쪽(236px)으로 두 번 옮겨 온 역사가 있는 위젯인데, 자리 문제가
   아니라 «두 개일 필요가 없는 것»이었다. 다시 살리지 말 것(CLAUDE.md 1-3 등재).
   호출부(마이크 토글·장치 교체·자가치유 등 5곳)는 그대로 두고 함수만 무동작으로 남긴다 —
   호출부까지 걷어내면 병합 반경만 커진다. 옛 구현은 git history (이 커밋 직전) 에 있다. */
let _micMeterCtx = null, _micMeterTimer = null, _micMeterEl = null;
function startMicLevelMeter() { return; }
function stopMicLevelMeter() {
    if (_micMeterTimer) { clearInterval(_micMeterTimer); _micMeterTimer = null; }
    if (_micMeterEl) { _micMeterEl.remove(); _micMeterEl = null; }
}

/* ===== 🎙 마이크 장치 선택 드롭다운 ===== */
const VC_MIC_PREF_KEY = 'mangoi_vc_mic_id';
function vcSavedMicId(){ try { return localStorage.getItem(VC_MIC_PREF_KEY) || ''; } catch(e){ return ''; } }

/** 드롭다운에 현재 마이크 목록 채우기 */
async function vcPopulateMicSelect() {
    const sel = document.getElementById('vc-mic-select');
    if (!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'communications');
        let activeId = '';
        try {
            const at = (window.vcLocalStream && vcLocalStream.getAudioTracks) ? vcLocalStream.getAudioTracks()[0] : null;
            if (at && at.getSettings) activeId = at.getSettings().deviceId || '';
        } catch(e){}
        const saved = vcSavedMicId();
        if (!mics.length) { sel.innerHTML = '<option value="">마이크 없음</option>'; return; }
        sel.innerHTML = '';
        mics.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = d.deviceId;
            let label = d.label || ('마이크 ' + (i+1));
            label = label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*/i, '').trim();
            opt.textContent = '🎙 ' + label;
            if (d.deviceId === activeId || (!activeId && d.deviceId === saved)) opt.selected = true;
            sel.appendChild(opt);
        });
    } catch (e) { console.warn('[mic-select] 목록 조회 실패:', e); }
}

/** 선택한 마이크로 전환 — 모든 통화 연결에 즉시 반영 */
async function vcSwitchMic(deviceId) {
    if (!deviceId) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        const newTrack = stream.getAudioTracks()[0];
        if (!newTrack) throw new Error('오디오 트랙 없음');
        newTrack.enabled = (typeof vcMicOn === 'undefined') ? true : vcMicOn;
        if (!window.vcLocalStream) vcLocalStream = new MediaStream();
        vcLocalStream.getAudioTracks().forEach(old => { try { old.stop(); } catch(e){} try { vcLocalStream.removeTrack(old); } catch(e){} });
        vcLocalStream.addTrack(newTrack);
        if (typeof vcPeerConnections === 'object' && vcPeerConnections) {
            Object.values(vcPeerConnections).forEach(pc => {
                try {
                    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                    if (sender) sender.replaceTrack(newTrack);
                    else pc.addTrack(newTrack, vcLocalStream);
                } catch(e) { console.warn('[mic-switch] sender 교체 실패:', e); }
            });
        }
        try { localStorage.setItem(VC_MIC_PREF_KEY, deviceId); } catch(e){}
        try { stopMicLevelMeter(); } catch(e){}
        if (typeof vcMicOn === 'undefined' || vcMicOn) { try { startMicLevelMeter(); } catch(e){} }
        await vcPopulateMicSelect();
        console.log('[mic-switch] ✅ 마이크 전환 완료:', newTrack.label);
        return true;    // 🎛 (2026-08-10) 장치 도우미(원격 설정)가 결과를 강사에게 보고할 때 쓴다
    } catch (e) {
        console.error('[mic-switch] 실패:', e);
        const msg = (e && e.name === 'NotAllowedError') ? '브라우저 마이크 권한이 차단되어 있습니다.' :
                    (e && e.name === 'NotFoundError') ? '선택한 마이크를 찾을 수 없습니다.' :
                    '마이크 전환 실패: ' + (e && e.message || e);
        alert('🎙 ' + msg);
        try { await vcPopulateMicSelect(); } catch(e2){}
        return false;
    }
}
window.vcSwitchMic = vcSwitchMic;
window.vcPopulateMicSelect = vcPopulateMicSelect;

/* ══════════════════════════════════════════════════════════════════
   ⚙️ (2026-08-06) 설정 팝업(vc-dock.js)이 부르던 함수들 — 여태 '아예 없었다'.
   vc-dock 의 call() 은 `typeof window[name]==='function'` 일 때만 부르고 아니면 조용히 넘어간다.
   그래서 카메라를 바꿔도, 마이크를 바꿔도, 잡음 제거를 눌러도 **화면만 바뀌고 아무 일도 안 일어났다**.
   (같은 사고가 화질 버튼에서 한 번 있었고 그때 vcSetQuality 만 만들어 막았다 — 12905줄 주석 참고)
   여기서 나머지를 전부 실제 동작에 연결한다.
   ══════════════════════════════════════════════════════════════════ */
const VC_CAM_PREF_KEY = 'mangoi_vc_cam_id';
function vcSavedCamId(){ try { return localStorage.getItem(VC_CAM_PREF_KEY) || ''; } catch(e){ return ''; } }
window.vcSavedCamId = vcSavedCamId;

/** 🎙 설정 팝업의 마이크 드롭다운 — 이미 완성돼 있던 vcSwitchMic 에 연결만 하면 된다. */
window.vcSetMicDevice = function(deviceId){
    if (!deviceId) return;
    return vcSwitchMic(deviceId);
};

/** 📷 선택한 카메라로 전환 — 모든 통화 연결에 즉시 반영(재협상 없음).
 *  vcHealLocalVideo 의 교체 절차를 그대로 따른다(검증된 경로). */
window.vcSetCamDevice = async function(deviceId){
    if (!deviceId) return;
    try { localStorage.setItem(VC_CAM_PREF_KEY, deviceId); } catch(e){}
    /* 🖥 화면 공유 중에는 지금 갈아끼우지 않는다 — 지금 송출 중인 트랙은 '화면'이라
       여기서 카메라로 바꾸면 학생 화면에서 공유가 끊긴다. 선택만 저장해 두고 공유가 끝나면 적용된다. */
    if (window.__vcScreenSharing) {
        try { if (typeof showToast === 'function') showToast('📷 화면 공유가 끝나면 새 카메라로 바뀝니다.'); } catch(e){}
        return 'deferred';   // 🎛 장치 도우미: "지금은 못 바꾸고 공유 끝나면 적용" 을 강사에게 그대로 알린다
    }
    const mobile = window.matchMedia('(max-width: 920px)').matches
                   || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    const size = mobile
        ? { width: { ideal: 640, max: 1280 }, height: { ideal: 480, max: 720 }, frameRate: { ideal: 15, max: 20 } }
        : { width: { ideal: 1280, max: 1280 }, height: { ideal: 720, max: 720 }, frameRate: { ideal: 24, max: 30 } };
    let stream = null;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({ deviceId: { exact: deviceId } }, size) });
    } catch (e1) {
        /* 해상도 제약이 안 맞는 캠(예: 고정 해상도 USB 캠)은 위 요청이 OverconstrainedError 로 죽는다.
           장치 지정만 남기고 한 번 더 — 여기서 실패해야 진짜 실패다. */
        console.warn('[cam-switch] 제약 완화 재시도:', e1 && e1.name);
        try { stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } }); }
        catch (e2) {
            console.error('[cam-switch] 실패:', e2);
            const msg = (e2 && e2.name === 'NotAllowedError') ? '브라우저 카메라 권한이 차단되어 있습니다.'
                      : (e2 && e2.name === 'NotFoundError' || e2 && e2.name === 'OverconstrainedError') ? '선택한 카메라를 찾을 수 없습니다. 케이블을 다시 꽂고 목록을 새로고침해 주세요.'
                      : (e2 && (e2.name === 'NotReadableError' || e2.name === 'TrackStartError')) ? '다른 앱(Zoom·Teams·카메라 앱 등)이 이 카메라를 쓰고 있습니다. 그 앱을 끄고 다시 선택해 주세요.'
                      : '카메라 전환 실패: ' + ((e2 && e2.message) || e2);
            alert('📷 ' + msg);
            return false;
        }
    }
    const newTrack = stream.getVideoTracks()[0];
    if (!newTrack) { alert('📷 선택한 카메라에서 영상 트랙을 얻지 못했습니다.'); return false; }
    newTrack.enabled = (typeof vcCamOn === 'undefined') ? true : !!vcCamOn;   // 카메라 OFF 상태 존중
    if (!vcLocalStream) vcLocalStream = new MediaStream();
    vcLocalStream.getVideoTracks().forEach(old => {
        try { old.stop(); } catch(e){}          // 옛 카메라의 LED·점유를 확실히 반납
        try { vcLocalStream.removeTrack(old); } catch(e){}
    });
    vcLocalStream.addTrack(newTrack);
    // 내 미리보기
    try {
        const lv = document.getElementById('vc-local-video');
        if (lv) { lv.srcObject = vcLocalStream; const p = lv.play(); if (p && p.catch) p.catch(()=>{}); }
    } catch(e){}
    // 모든 피어 sender 교체 — 재협상 없이 상대 화면이 그 자리에서 바뀐다
    Object.values(vcPeerConnections || {}).forEach(pc => {
        try {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(newTrack).catch(()=>{});
            else pc.addTrack(newTrack, vcLocalStream);
        } catch (e) { console.warn('[cam-switch] sender 교체 실패:', e); }
    });
    /* 🎨 가상배경이 켜져 있으면 송출은 합성 캔버스다. 원본 카메라만 바꾸면 캔버스는 죽은 옛 트랙을
       계속 그려 화면이 얼어 버린다 → 같은 모드로 파이프라인을 새 카메라 위에 다시 세운다. */
    try {
        if (typeof vcBg !== 'undefined' && vcBg && vcBg.mode && vcBg.mode !== 'off' && typeof window.vcSetBackground === 'function') {
            const m = vcBg.mode;
            await window.vcSetBackground('off');
            await window.vcSetBackground(m);
        }
    } catch (e) { console.warn('[cam-switch] 가상배경 재적용 실패:', e); }
    try { __vcCamMutedTicks = 0; } catch(e){}   // 자가치유가 교체 직후를 '이상'으로 오인하지 않게
    console.log('[cam-switch] ✅ 카메라 전환 완료:', newTrack.label);
    try { if (typeof showToast === 'function') showToast('📷 ' + (newTrack.label || '카메라') + ' 로 바꿨어요.'); } catch(e){}
    return true;    // 🎛 (2026-08-10) 장치 도우미(원격 설정) 결과 보고용
};

/* 🔊 (2026-08-10 장치 도우미) 스피커(출력 장치) 전환 — 지금 재생 중인 모든 원격 소리에 적용.
   setSinkId 는 크롬·엣지·파이어폭스(116+)만 지원, iOS 사파리는 아예 없다 → 미지원이면 false.
   새로 생기는 원격 타일·보조 오디오는 만들 때 vcApplySavedSink 로 같은 스피커를 물려받는다. */
const VC_SPK_PREF_KEY = 'mangoi_vc_spk_id';
function vcSavedSpkId(){ try { return localStorage.getItem(VC_SPK_PREF_KEY) || ''; } catch(e){ return ''; } }
window.vcSetSpkDevice = async function(deviceId){
    if (!deviceId) return false;
    if (!('setSinkId' in HTMLMediaElement.prototype)) return false;
    try { localStorage.setItem(VC_SPK_PREF_KEY, deviceId); } catch(e){}
    let okAny = false, failAny = false;
    const els = document.querySelectorAll('#vc-video-grid video, audio[id^="vc-aud-"]');
    for (const el of els) {
        if (el.closest && el.closest('#vc-local-box')) continue;   // 내 미리보기는 영구 음소거 — 건드릴 이유 없음
        try { await el.setSinkId(deviceId); okAny = true; }
        catch (e) { failAny = true; console.warn('[spk-switch] setSinkId 실패:', e && e.name); }
    }
    // 타일이 아직 없어도(수업 초반) 저장은 됐고 이후 타일이 물려받으므로 성공으로 친다
    const ok = !failAny || okAny;
    if (ok) console.log('[spk-switch] ✅ 스피커 전환:', deviceId === 'default' ? '기본 장치' : deviceId.slice(0, 8) + '…');
    return ok;
};
/* 새로 만들어지는 <video>·<audio> 가 저장된 스피커 선택을 물려받게 한다(원격 타일 생성부에서 호출). */
function vcApplySavedSink(el){
    try {
        const id = vcSavedSpkId();
        if (!id || !el || typeof el.setSinkId !== 'function') return;
        const p = el.setSinkId(id); if (p && p.catch) p.catch(()=>{});
    } catch(e){}
}

/** 🔇 잡음 제거 on/off — 살아있는 트랙에 먼저 적용하고, 안 먹는 브라우저는 재획득으로 확실히 반영 */
window.vcSetNoiseSuppression = async function(on){
    on = !!on;
    try { localStorage.setItem('mangoi_vc_noise', on ? '1' : '0'); } catch(e){}
    const track = vcLocalStream && vcLocalStream.getAudioTracks ? vcLocalStream.getAudioTracks()[0] : null;
    if (!track) return;
    try {
        await track.applyConstraints({ echoCancellation: true, autoGainControl: true, noiseSuppression: on });
        const s = (track.getSettings && track.getSettings()) || {};
        if (s.noiseSuppression === on) { console.log('[noise] 잡음 제거 →', on); return; }
    } catch (e) { console.warn('[noise] applyConstraints 실패, 재획득으로 적용:', e && e.name); }
    // applyConstraints 를 무시하는 브라우저 대비 — 같은 장치를 새 제약으로 다시 잡아 교체
    try {
        const id = (track.getSettings && track.getSettings().deviceId) || vcSavedMicId();
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: Object.assign({ echoCancellation: true, autoGainControl: true, noiseSuppression: on }, id ? { deviceId: { exact: id } } : {})
        });
        const nt = stream.getAudioTracks()[0];
        if (!nt) return;
        nt.enabled = track.enabled;
        vcLocalStream.getAudioTracks().forEach(old => { try { old.stop(); } catch(e){} try { vcLocalStream.removeTrack(old); } catch(e){} });
        vcLocalStream.addTrack(nt);
        Object.values(vcPeerConnections || {}).forEach(pc => {
            try {
                const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                if (sender) sender.replaceTrack(nt).catch(()=>{});
            } catch(e){}
        });
        console.log('[noise] 재획득으로 적용 →', on);
    } catch (e) { console.warn('[noise] 재획득 실패:', e); }
};

/** 🌫 배경 흐림 — 가상배경 엔진에 이미 'blur' 모드가 있다. 스위치를 거기에 연결만 한다. */
window.vcSetBackgroundBlur = function(on){
    try {
        if (typeof window.vcSetBackground !== 'function') return;
        window.vcSetBackground(on ? 'blur' : 'off');
    } catch (e) { console.warn('[blur]', e); }
};
try {
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
        navigator.mediaDevices.addEventListener('devicechange', function(){ try { vcPopulateMicSelect(); } catch(e){} });
    }
} catch(e){}

/** 🛠 마이크 진단·재설정 도구 — 사용자가 직접 트러블슈팅 가능 */
window.vcDiagnoseMic = async function() {
    let report = '🎤 마이크 진단 보고서\n\n';
    // 1. 권한 상태
    try {
        const perm = await navigator.permissions.query({ name: 'microphone' });
        report += '권한: ' + (perm.state === 'granted' ? '✅ 허용됨' : perm.state === 'denied' ? '❌ 차단됨' : '⏳ 대기중') + '\n';
    } catch { report += '권한: (확인 불가)\n'; }
    // 2. 디바이스 목록
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(d => d.kind === 'audioinput');
        report += `\n연결된 마이크: ${mics.length}개\n`;
        mics.forEach((d, i) => report += `  ${i+1}. ${d.label || '(이름 없음)'} ${d.deviceId === 'default' ? '⭐기본' : ''}\n`);
        if (mics.length === 0) {
            report += '❌ 마이크가 시스템에 연결되어 있지 않습니다!\n';
        }
    } catch (e) { report += '디바이스 목록 조회 실패: ' + e.message + '\n'; }
    // 3. 현재 통화 오디오 트랙
    if (vcLocalStream) {
        const at = vcLocalStream.getAudioTracks();
        report += `\n현재 오디오 트랙: ${at.length}개\n`;
        at.forEach((t, i) => report += `  ${i+1}. ${t.label || '(label없음)'} - enabled:${t.enabled} muted:${t.muted} state:${t.readyState}\n`);
    } else {
        report += '\n현재 통화 스트림 없음\n';
    }
    // 4. 자동 복구 시도
    report += '\n[자동 복구 시도]\n';
    try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true } });
        const t = s.getAudioTracks()[0];
        report += '✅ 마이크 재획득 성공: ' + (t.label || '(label없음)') + '\n';
        if (vcLocalStream) {
            // 기존 오디오 트랙 정리
            vcLocalStream.getAudioTracks().forEach(old => { try { old.stop(); } catch{}; vcLocalStream.removeTrack(old); });
            vcLocalStream.addTrack(t);
            // PC sender 교체
            if (typeof vcPeerConnections === 'object') {
                Object.values(vcPeerConnections).forEach(pc => {
                    try {
                        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio');
                        if (sender) sender.replaceTrack(t);
                        else pc.addTrack(t, vcLocalStream);
                    } catch {}
                });
            }
            vcMicOn = true;
            window.vcMicOn = true;   // 🔴 (2026-07-24 재점검) 이걸 빼먹으면 상단 툴바는 초록인데
                                     //   하단 독은 빨간 채로 굳는다(독의 아이콘 캐시가 그 상태를 고착시킴).
            const btn = document.getElementById('vc-btn-mic');
            if (btn) { btn.className = 'ctrl-btn on'; btn.textContent = '🎤'; }
            startMicLevelMeter();
            report += '✅ 통화에 새 마이크 트랙 적용 완료\n';
        } else {
            try { s.getTracks().forEach(x => x.stop()); } catch{}
        }
    } catch (e) {
        report += '❌ 재획득 실패: ' + e.name + ' - ' + e.message + '\n';
        if (e.name === 'NotAllowedError') {
            report += '\n👉 해결 방법:\n';
            report += '1. 주소창 좌측 자물쇠/방패 아이콘 클릭\n';
            report += '2. "마이크" 권한을 [허용]으로 변경\n';
            report += '3. 페이지 새로고침\n';
        } else if (e.name === 'NotFoundError') {
            report += '\n👉 PC에 마이크가 연결되어 있는지 확인하고 다시 시도해 주세요.\n';
        }
    }
    alert(report);
};
/** 📷 (2026-07-24) 내 카메라 상태를 상대에게 알린다.
 *  수신측은 이 신호가 있어야 '상대가 껐다'(정상)와 '회선이 나빠 영상만 죽었다'(장애)를
 *  구분할 수 있다. 신호가 없으면 자가복구 워치독이 정상 상태를 장애로 오인해 재협상을 반복한다.
 *  reason: 'user'=사용자가 버튼으로 끔 / 'aao'=회선이 약해 시스템이 음성전용으로 내림 */
function vcBroadcastCamState(camOn, reason) {
    try {
        if (window.vcConn && typeof vcConn.send === 'function') {
            // ⚠️ 서버(video-call-room.ts)는 data 를 손대지 않고 그대로 중계한다.
            //   보내는 쪽이 자기 userId 를 실어 주지 않으면 받는 쪽이 '누가 껐는지' 를 알 수 없다.
            vcConn.send({ type: 'cam-state', data: { userId: vcUserId, camOn: !!camOn, reason: reason || 'user' } });
        }
    } catch (_) {}
}

function vcToggleCam() {
    if (!vcLocalStream) return;
    vcCamOn = !vcCamOn;
    window.vcCamOn = vcCamOn;   // ⚠️ 독 sync() 가 보는 값 — 위 vcToggleMic 주석 참고 (2026-07-24)
    vcLocalStream.getVideoTracks().forEach(t => t.enabled = vcCamOn);
    const btn = document.getElementById('vc-btn-cam');
    btn.className = `ctrl-btn ${vcCamOn ? 'on' : 'off'}`;
    btn.textContent = vcCamOn ? '📷' : '🚫';
    vcBroadcastCamState(vcCamOn, 'user');
}

/** 탭 전환 (event 인자가 없어도 안전하게 동작) */
function vcSwitchTab(tabName, evt) {
    // 🔴 (2026-07-31) 게임 탭을 벗어날 때 게임 iframe 을 실제로 해제한다.
    //   이 함수는 .active 클래스만 토글하므로, 게임을 켠 채 교재/칠판 탭으로 가면 화면에서만
    //   사라지고 iframe 은 DOM 에 그대로 남았다. 3D 게임(탱크대전·3D배틀·P-38)은 WebGL 컨텍스트와
    //   AudioContext 를 잡고 있어 숨겨진 뒤에도 그 자원을 계속 점유한다(게임을 여러 번 바꿨다면 누적).
    //   → 탭을 떠나면 src 를 비우고 제거해 자원을 확실히 반납한다. 게임 탭으로 돌아오면
    //     gameInit()/gameSwitchMode() 가 #game-area 를 다시 그리므로 복구는 기존 경로로 이뤄진다.
    if (tabName !== 'game') {
        try {
            const gf = document.getElementById('game-suite-frame');
            if (gf) {
                try { gf.src = 'about:blank'; } catch (_) {}   // 내부 문서 먼저 정리 → WebGL/오디오 반납
                gf.remove();
                const ga = document.getElementById('game-area');
                if (ga) ga.dataset.needsRestore = '1';          // 돌아왔을 때 다시 그려야 함을 표시
            }
        } catch (_) {}
    }
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`tab-${tabName}`);
    if (panel) panel.classList.add('active');
    // 게임 탭으로 (다시) 들어왔고 위에서 해제한 상태면 현재 모드로 복구
    if (tabName === 'game') {
        try {
            const ga = document.getElementById('game-area');
            if (ga && ga.dataset.needsRestore === '1') {
                delete ga.dataset.needsRestore;
                if (typeof _gameIsClassActive === 'function' && _gameIsClassActive()) {
                    if (typeof _gameRenderBlocked === 'function') _gameRenderBlocked();
                } else if (typeof gameNextRound === 'function') {
                    gameNextRound();
                }
            }
        } catch (_) {}
    }
    // 클릭 이벤트가 있으면 그 버튼을, 없으면 onclick 속성 매칭으로 active 처리
    const e = evt || (typeof event !== 'undefined' ? event : null);
    if (e && e.target && e.target.classList && e.target.classList.contains('tab-btn')) {
        e.target.classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn').forEach(b => {
            if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(`'${tabName}'`)) b.classList.add('active');
        });
    }
    if (tabName === 'whiteboard') wbResize();
    // 🔒 배경 탭 진입 시 잠금 UI 갱신 — 강사는 잠금 버튼 노출, 학생은 잠금 중이면
    //   (얼굴꾸미기 그리드가 이 진입 때 늦게 생성되므로) 타일 비활성화를 재적용
    if (tabName === 'bg') {
        setTimeout(function(){
            try {
                if (typeof vcPerfRender === 'function') vcPerfRender();   // 🎚️ 품질 버튼 상태 반영
                if (typeof vcBgLockBtnRender === 'function') vcBgLockBtnRender();
                var _staff = (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
                if (!_staff && window.__vcBgLockedByTeacher && typeof vcBgLockApply === 'function') vcBgLockApply(true);
            } catch(e){}
        }, 0);
    }
    // 🥭 Phase 41 — 게임 탭 진입 시 자동 시작
    if (tabName === 'game' && typeof gameInit === 'function') {
      if (!_gameState.started) gameInit();
    }
    // 🧠 복습퀴즈일 때는 얼굴(비디오) 영역을 숨기고 퀴즈가 화면 전체를 차지하게
    const _mainRow = document.getElementById('vc-main-row');
    if (_mainRow) _mainRow.classList.toggle('content-full', tabName === 'review-quiz');
    // 어떤 화면 크기·레이아웃에서도 확실히 숨기도록 상단 영상 패널에 인라인 강제 적용
    try {
      var _vp = document.getElementById('vc-video-pane');
      if (_vp) {
        if (tabName === 'review-quiz') _vp.style.setProperty('display', 'none', 'important');
        else _vp.style.removeProperty('display');
      }
    } catch(e){}
    // 🧠 복습퀴즈 탭 진입 시 자동 로드 (이 수업 교재/레벨/레슨 매칭)
    if (tabName === 'review-quiz' && typeof rqvOnEnter === 'function') rqvOnEnter();
    // 🗣️ AI 웜업 탭 — 첫 진입 시에만 iframe 로드 (수업방 room id + 오늘 교재/레벨/레슨 연동)
    // 🧑‍🎓 (2026-08-12 Melca 피드백) 수업 중 «학생 단독» 웜업은 게임과 같은 정책으로 차단.
    //   강사가 tab-sync 로 열어 준 «강사 주도 웜업» 은 허용(웜업은 수업 중 강사 도구이기도 하다).
    //   강사가 다른 탭으로 옮기면 허가도 끝난다(tab-sync 수신부가 __vcWarmupTeacherLed 갱신).
    if (tabName === 'warmup' && typeof _warmupStudentBlocked === 'function' && _warmupStudentBlocked()) {
        _warmupRenderBlocked();
    } else if (tabName === 'warmup') {
        if (typeof _warmupClearBlocked === 'function') _warmupClearBlocked();
        const wf = document.getElementById('vc-warmup-frame');
        if (wf && !wf.getAttribute('src')) {
            const wp = new URLSearchParams();
            try { if (vcRoomId) wp.set('room', vcRoomId); } catch(e){}
            try { const bk = window.__mangoiCurrentBookId || window.__mangoiLastVideoBook || ''; if (bk) wp.set('textbook', String(bk)); } catch(e){}
            try { const lv = localStorage.getItem('mangoi_current_level') || ''; if (lv) wp.set('level', lv); } catch(e){}
            try { const ln = parseInt(localStorage.getItem('mangoi_current_lesson')||'0',10); if (ln) wp.set('lesson', String(ln)); } catch(e){}
            const wq = wp.toString();
            wf.src = '/warmup.html' + (wq ? '?' + wq : '');
        }
    }
    // 📡 (2026-07-14) 교사 주도 탭 동기화 — 교사가 탭(칠판/동영상/교재 등)을 바꾸면
    //   학생 화면도 같은 탭으로 따라오게 방송. (예전엔 탭 전환 메시지 자체가 없어서
    //   교재/동영상 '내용 공유' 때만 학생이 따라오고, 맨몸 탭 전환은 학생에게 안 보였음)
    //   _vcTabSyncApplying = 학생이 수신 적용 중일 때 재방송(루프) 방지 플래그.
    try {
        if (!window._vcTabSyncApplying
            && (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin')
            && document.body.classList.contains('vc-in-call')
            && typeof vcConn !== 'undefined' && vcConn) {
            vcConn.send({ type: 'tab-sync', data: { tab: tabName } });
            console.log('[tab-sync] 교사 탭 방송:', tabName);
        }
    } catch(e){}
}

// 🥭 (2026-07-05) 상단 탭바 전체 공통 토글 상태 — "콘텐츠(칠판/동영상/학생게임/배경/웜업/퀴즈) 영역"을
//   누르면 펼쳐지고, 이미 펼쳐진 같은 탭을 다시 누르면 접히게(카메라 화면 위주로 복귀).
//   교재도구/필기도구 칩(mango-tools-dock.js)도 이 상태를 같이 사용.
//   🔧 (2026-07-05) 칠판 전용 도구줄(펜/지우개/색상 등)은 제거 — 필기도구 칩과 중복이라
//     화면만 좁아짐. 칠판도 다른 탭과 동일하게 "펼침/접힘"만 한다.
window.vcIsContentCollapsed = function(){
    var pane = document.getElementById('vc-content-pane');
    return !!(pane && pane.classList.contains('vc-content-collapsed'));
};
window.vcSetContentCollapsed = function(collapsed){
    var pane = document.getElementById('vc-content-pane');
    var row = document.getElementById('vc-main-row');
    if (pane) pane.classList.toggle('vc-content-collapsed', collapsed);
    if (row) row.classList.toggle('vc-content-hidden', collapsed);
    // 🔧 (2026-07-16) 수업 화면으로 접을 때(=콘텐츠 숨김)는 복습퀴즈 전체화면이 얼굴(영상) 영역을
    //   숨겨둔 흔적(content-full 클래스 + #vc-video-pane 인라인 display:none)을 반드시 원복한다.
    //   안 하면 콘텐츠(퀴즈)도 숨고 얼굴도 숨어 화면이 하얗게 나온다.
    if (collapsed) {
        if (row) row.classList.remove('content-full');
        try { var _vp = document.getElementById('vc-video-pane'); if (_vp) _vp.style.removeProperty('display'); } catch(e){}
    }
};
// 🔧 (2026-07-16) 복습퀴즈 '← 수업으로' 전용 복귀 — 얼굴 영역을 되살리고,
//   복습퀴즈 직전에 보던 콘텐츠(교재/칠판 등)가 있으면 그걸 함께 복원(얼굴+교재 분할),
//   없으면 얼굴 위주(콘텐츠 접기). 어느 경우든 '하얀 화면'이 되지 않게 보장한다.
window.vcReviewQuizBackToClass = function(){
    var row = document.getElementById('vc-main-row');
    if (row) row.classList.remove('content-full');
    try { var _vp = document.getElementById('vc-video-pane'); if (_vp) _vp.style.removeProperty('display'); } catch(e){}
    var prev = window._vcTabBeforeReviewQuiz;
    if (prev && prev !== 'review-quiz' && document.getElementById('tab-' + prev)) {
        vcSetContentCollapsed(false);
        vcSwitchTab(prev);              // 얼굴 + 이전 콘텐츠(교재 등) 분할로 복귀
    } else {
        vcSetContentCollapsed(true);    // 이전 콘텐츠 없음 → 얼굴 위주 (video-pane 원복은 위에서 보장)
        try { document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); }); } catch(e){}
    }
};
// 칠판/동영상/학생게임/배경화면/AI웜업/복습퀴즈 — 다른 탭이면 전환+펼치기, 이미 보이는 같은 탭이면 접기.
//   🔧 (2026-07-15) 칠판(whiteboard)은 예외 — 다시 눌러도 접지 않음.
//     사장님 요청: 칠판을 클릭하면 (전체 얼굴 화면으로 접히지 말고) 항상 '얼굴 + 칠판' 화면이 나오게.
window.vcToggleContentTab = function(tabName){
    // 🎯 집중 모드 — 선생님이 잠근 동안 학생은 탭 변경/접기 불가.
    //   (교사 tab-sync 수신·pdf/video 공유 적용은 vcSwitchTab 직행이라 막히지 않음)
    if (window.__vcFocusLockedByTeacher && window.vcMyRole !== 'teacher' && window.vcMyRole !== 'admin') {
        try { if (typeof showToast === 'function') showToast((localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang')) === 'en' ? '🎯 Focus mode — follow your teacher' : '🎯 집중 모드예요 — 선생님 화면을 따라가요'); } catch(_){}
        return;
    }
    // 🔧 (2026-07-16) 복습퀴즈로 들어갈 때, 지금 보고 있던 콘텐츠 탭(교재/칠판 등)을 기억한다.
    //   '← 수업으로' 복귀 시 그 콘텐츠를 얼굴과 함께 되살리기 위함. (콘텐츠가 접혀 있었으면 기억 안 함)
    if (tabName === 'review-quiz') {
        try {
            var _cur = document.querySelector('.tab-panel.active');
            var _curId = _cur && _cur.id ? _cur.id.replace('tab-', '') : '';
            window._vcTabBeforeReviewQuiz = (_curId && _curId !== 'review-quiz' && !vcIsContentCollapsed()) ? _curId : '';
        } catch(e){ window._vcTabBeforeReviewQuiz = ''; }
    }
    var panel = document.getElementById('tab-' + tabName);
    var alreadyShowing = panel && panel.classList.contains('active') && !vcIsContentCollapsed();
    // 📖 (2026-08-20) 교재도 칠판처럼 다시 눌러도 안 접는다
    if (alreadyShowing && tabName !== 'whiteboard' && tabName !== 'pdf') {
        vcSetContentCollapsed(true);
    } else {
        vcSetContentCollapsed(false);
        vcSwitchTab(tabName);
    }
};

/* ============================================================
 * 🎨 가상 배경 엔진 (MediaPipe Selfie Segmentation)
 * - lazy-load MediaPipe (3MB 모델 첫 클릭 시점에)
 * - getUserMedia 카메라 → segmentation → canvas 합성
 * - canvas.captureStream() → WebRTC sender.replaceTrack
 *   → 모든 참가자에게 가상 배경 적용된 영상 전달
 * ============================================================ */
const vcBg = {
  mode: 'off',           // 'off' | 'blur' | 'space' | 'forest' | ...
  mpLoaded: false,
  mpLoading: false,
  segmenter: null,
  canvas: null,
  ctx: null,
  bgImg: null,           // 현재 배경 이미지 (HTMLCanvasElement)
  bgImgKey: null,
  rafId: null,
  processedStream: null,
  originalVideoTrack: null,
  isProcessing: false,
  hiddenVideo: null,     // segmenter 입력 전용 숨겨진 비디오 (원본 카메라)
  sending: false,        // 동시 send() 방지 플래그
  lastVideoTime: -1,     // 동일 프레임 중복 송신 방지
};
try { window.vcBg = vcBg; } catch(_){}  // 절전 핸들러(백그라운드 정지)에서 참조하도록 노출

// 모바일 판별 (경량화 분기에서 공용으로 사용) — 한 번 계산 후 캐시
function vcIsMobileDevice(){
  if (vcBg._mobile === undefined) {
    vcBg._mobile = window.matchMedia('(max-width: 920px)').matches
      || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }
  return vcBg._mobile;
}
/* ═══════════════════════════════════════════════════════════════════════════
   🎚️ vcPerf — 영상효과 자동 품질 등급 (2026-08-01)
   ───────────────────────────────────────────────────────────────────────────
   왜 필요한가: 가상배경과 얼굴꾸미기를 같이 켜면 비용이 '더해지는' 게 아니라
   '직렬로 쌓인다'. idx-x6.js fxLoop 는 vcBg.canvas 를 입력으로 받으므로
     카메라 → ①세그멘테이션 모델 → 합성 → ②얼굴검출 모델 → 합성 → captureStream 재인코딩
   이 매 프레임 돌아간다. 그래서 하나만 켜면 견디는 PC가 둘 다 켜면 무너진다
   (강사 신고: "배경 + 가면 쓰면 PC가 버벅인다").
   지금까지는 PC 성능과 무관하게 항상 같은 설정으로 돌렸다(적응 로직 0건).

   이 관리자는 '실제로 얼마나 버거운지'를 측정해 등급을 자동으로 내리고,
   여유가 생기면 올린다. 선택은 기기에 저장돼 다음 수업은 맞는 등급으로 시작한다.
   ⚠️ 어떤 등급에서도 기능을 끄지 않는다 — 가볍게만 만든다(즐거움 유지가 목적).
      단 회복 불가 수준(치명)일 때만 수업을 지키려고 가상배경을 자동으로 끈다.
   ═══════════════════════════════════════════════════════════════════════════ */
window.vcPerf = (function(){
  var KEY = 'mangoi_vc_perf';           // {level:int, manual:bool}
  // segEvery : 세그멘테이션 처리 간격(프레임) — 배경 경계는 몸 움직임을 따라가야 해 20Hz 근처 유지
  // faceEvery: 얼굴검출 간격(프레임) — 얼굴은 천천히 움직여 8Hz 로도 충분(매 프레임 보간이 메움)
  var TIERS = [
    { name:'상',   segEvery:3, faceEvery:7,  width:640, fps:20, erosion:4, feather:true  },
    { name:'중',   segEvery:4, faceEvery:8,  width:512, fps:15, erosion:2, feather:true  },
    { name:'하',   segEvery:6, faceEvery:10, width:400, fps:12, erosion:0, feather:false },
    { name:'최하', segEvery:8, faceEvery:12, width:320, fps:10, erosion:0, feather:false }
  ];
  var st = { level:0, manual:false };
  try {
    var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw.level === 'number') { st.level = Math.min(TIERS.length-1, Math.max(0, raw.level)); st.manual = !!raw.manual; }
    else if (vcIsMobileDevice()) st.level = 2;      // 휴대폰은 중간부터 시작(첫 인상 보호)
  } catch(e){}
  function save(){ try { localStorage.setItem(KEY, JSON.stringify({level:st.level, manual:st.manual})); } catch(e){} }

  // ── 측정: 우리 작업이 프레임 예산을 얼마나 먹는지 + 루프가 실제 몇 fps 도는지
  var busyMs = 0, frames = 0, winStart = 0, badRun = 0, goodRun = 0, lastChange = 0, deadRun = 0;
  function now(){ return performance.now(); }
  function evaluate(){
    var t = now(), span = t - winStart;
    if (span < 2000) return;
    var ratio = busyMs / span;                 // 0~1, 우리 작업 점유율
    var fps   = frames / (span/1000);
    busyMs = 0; frames = 0; winStart = t;
    api.lastRatio = +ratio.toFixed(2); api.lastFps = Math.round(fps);
    // 치명: 루프가 10fps 미만 → 수업 자체가 위험. 등급과 무관하게 가상배경을 끈다.
    if (fps > 0 && fps < 10) { deadRun++; if (deadRun >= 3) { deadRun = 0; api._rescue(); return; } }
    else deadRun = 0;
    if (st.manual) return;                     // 사람이 직접 고른 등급은 건드리지 않는다
    if (t - lastChange < 6000) return;          // 6초 내 재조정 금지(요동 방지)
    if (ratio > 0.55 || (fps > 0 && fps < 22)) { badRun++; goodRun = 0; }
    else if (ratio < 0.25 && fps > 45)         { goodRun++; badRun = 0; }
    else { badRun = 0; goodRun = 0; }
    if (badRun >= 2 && st.level < TIERS.length-1) { st.level++; badRun = 0; lastChange = t; save(); api._notify('down'); }
    else if (goodRun >= 3 && st.level > 0)       { st.level--; goodRun = 0; lastChange = t; save(); api._notify('up'); }
  }
  var api = {
    tiers: TIERS,
    lastRatio: 0, lastFps: 0,
    get level(){ return st.level; },
    get manual(){ return st.manual; },
    get: function(){ return TIERS[st.level] || TIERS[0]; },
    /** 무거운 블록 앞뒤로 감싸 호출: var s=vcPerf.begin(); ... vcPerf.end(s); */
    begin: function(){ if (!winStart) winStart = now(); return now(); },
    end: function(t0){ busyMs += (now() - t0); },
    /** 루프 1회마다 호출 — 실제 프레임레이트 측정 */
    tick: function(){ if (!winStart) winStart = now(); frames++; evaluate(); },
    /** 강사가 직접 고름(0~3). null 이면 자동으로 복귀 */
    set: function(lv){
      if (lv === null || lv === undefined) {
        // '자동'으로 되돌릴 때는 기기 기본값에서 다시 찾게 한다.
        //   (등급을 그대로 두면 '최하'를 골랐던 강사가 자동으로 바꿔도 계속 최하에 머문다 —
        //    평가는 효과가 돌아갈 때만 일어나므로 스스로 올라오는 데 오래 걸린다)
        st.manual = false;
        st.level = vcIsMobileDevice() ? 2 : 0;
        badRun = 0; goodRun = 0; deadRun = 0;
      }
      else { st.level = Math.min(TIERS.length-1, Math.max(0, lv|0)); st.manual = true; }
      lastChange = now(); save(); api._apply();
      api._toast(st.manual ? ('영상효과 품질: ' + TIERS[st.level].name + ' (직접 선택)')
                           : '영상효과 품질: 자동');
    },
    /** 등급 변경을 실제 파이프라인에 반영 — 캔버스 크기·송출 fps 는 재시작이 필요하다 */
    _apply: function(){
      try { if (typeof vcBgApplyTier === 'function') vcBgApplyTier(); } catch(e){}
      try { if (window.vcFx && typeof window.vcFx._applyTier === 'function') window.vcFx._applyTier(); } catch(e){}
    },
    _notify: function(dir){
      api._apply();
      var t = TIERS[st.level];
      api._toast(dir === 'down'
        ? ('이 컴퓨터에 맞춰 영상효과를 가볍게 조정했어요 (' + t.name + ')')
        : ('여유가 생겨 영상효과 품질을 올렸어요 (' + t.name + ')'));
    },
    /** 치명 상황: 수업을 지키기 위해 가상배경만 끈다(얼굴꾸미기는 남긴다) */
    _rescue: function(){
      try {
        if (typeof vcBg !== 'undefined' && vcBg && vcBg.mode && vcBg.mode !== 'off') {
          if (typeof vcSetBg === 'function') vcSetBg('off');
          else { vcBg.mode = 'off'; vcBg.isProcessing = false; }
          api._toast('컴퓨터가 많이 느려져 가상배경을 잠시 껐어요. 얼굴 꾸미기는 그대로 쓸 수 있어요.');
          return;
        }
      } catch(e){}
      st.level = TIERS.length-1; save(); api._apply();
    },
    _toast: function(msg){
      try {
        if (typeof vcToast === 'function') { vcToast(msg); return; }
        var el = document.getElementById('vc-perf-toast');
        if (!el) {
          el = document.createElement('div'); el.id = 'vc-perf-toast';
          el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:96px;z-index:2147483001;'
            + 'background:rgba(15,23,42,.94);color:#e2e8f0;border:1px solid rgba(148,163,184,.35);'
            + 'border-radius:12px;padding:10px 16px;font-size:13px;font-weight:600;max-width:80vw;'
            + 'text-align:center;pointer-events:none;opacity:0;transition:opacity .25s';
          document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = '1';
        clearTimeout(el._h); el._h = setTimeout(function(){ el.style.opacity = '0'; }, 3800);
      } catch(e){}
    }
  };
  return api;
})();

/** 🎚️ 영상효과 품질 버튼 렌더 (배경 탭 상단). 자동 + 4단계. */
function vcPerfRender(){
  var wrap = document.getElementById('vc-perf-btns');
  if (!wrap || !window.vcPerf) return;
  var en = (typeof getLang === 'function' && getLang() === 'en');
  var LBL_EN = ['High','Medium','Low','Lowest'];
  var items = [{ lv:null, label: en ? 'Auto' : '자동' }];
  vcPerf.tiers.forEach(function(t, i){ items.push({ lv:i, label: en ? LBL_EN[i] : t.name }); });
  var cur = vcPerf.manual ? vcPerf.level : null;
  wrap.innerHTML = items.map(function(it){
    var on = (it.lv === cur);
    return '<button type="button" onclick="vcPerfPick(' + (it.lv === null ? 'null' : it.lv) + ')" '
      + 'style="border:1px solid ' + (on ? '#fbbf24' : 'rgba(148,163,184,.35)') + ';border-radius:7px;'
      + 'padding:4px 11px;font-size:11.5px;font-weight:700;cursor:pointer;'
      + 'background:' + (on ? 'rgba(251,191,36,.2)' : 'transparent') + ';'
      + 'color:' + (on ? '#fbbf24' : '#94a3b8') + '">' + it.label + '</button>';
  }).join('');
  var hint = document.getElementById('vc-perf-hint');
  if (hint) {
    if (vcPerf.manual) {
      hint.textContent = en ? ('Fixed at "' + LBL_EN[vcPerf.level] + '" on this computer')
                            : ('이 컴퓨터에서 ‘' + vcPerf.tiers[vcPerf.level].name + '’ 로 고정');
    } else {
      hint.textContent = en ? ('Auto (now: ' + LBL_EN[vcPerf.level] + ') — lowers itself when this computer struggles')
                            : ('자동 (현재 ' + vcPerf.tiers[vcPerf.level].name + ') — 버거워지면 알아서 낮춥니다');
    }
  }
}
function vcPerfPick(lv){ try { vcPerf.set(lv); vcPerfRender(); } catch(e){} }
window.vcPerfRender = vcPerfRender; window.vcPerfPick = vcPerfPick;

// 처리 캔버스 목표 가로폭 — 카메라가 720p여도 여기로 축소해서 CPU·인코딩 부하↓
//   세그멘테이션 모델 입력은 256px라 캔버스를 키워도 화질 이득이 거의 없고 부하만 늘어남
//   (2026-08-01) 고정값 → vcPerf 등급값. 휴대폰은 480 을 상한으로 둔다.
function vcBgTargetWidth(){
  var w = (window.vcPerf ? vcPerf.get().width : 640);
  return vcIsMobileDevice() ? Math.min(480, w) : w;
}
// 가상배경 출력(캔버스) 트랙에 적용할 캡처 fps — 실제 처리 fps와 맞춰 중복 프레임 인코딩 방지
function vcBgCaptureFps(){
  var f = (window.vcPerf ? vcPerf.get().fps : 20);
  return vcIsMobileDevice() ? Math.min(12, f) : f;
}
/** 등급이 바뀌면 캔버스 크기를 즉시 다시 맞춘다(다음 프레임부터 적용) */
function vcBgApplyTier(){
  try {
    if (!vcBg || !vcBg.canvas || !vcBg.hiddenVideo || !vcBg.hiddenVideo.videoWidth) return;
    var vw = vcBg.hiddenVideo.videoWidth, vh = vcBg.hiddenVideo.videoHeight;
    var cw = Math.min(vw, vcBgTargetWidth()), ch = Math.round(cw * vh / vw);
    if (vcBg.canvas.width !== cw) {
      vcBg.canvas.width = cw; vcBg.canvas.height = ch;
      if (vcBg.maskCanvas) { vcBg.maskCanvas.width = cw; vcBg.maskCanvas.height = ch; }
    }
  } catch(e){}
}

// --- 1) 테마별 배경 이미지 (실제 사진 파일 → 한 번 로드 후 캐시) ---
const VC_BG_IMAGES = {
  galaxy:     '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/galaxy.jpg',     // 우주 - 안드로메다 은하
  desert:     '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/desert.jpg',     // 사막 - 낙타와 석양
  underwater: '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/underwater.jpg', // 바닷속 - 산호초 + 거북이
  beach:      '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/beach.jpg',      // 바닷가 - 석양과 조개
  jungle:     '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/jungle.jpg',     // 정글 - 열대우림 + 새 + 원숭이
  fireplace:  '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/fireplace.jpg',  // 벽난로 - 따뜻한 거실
  angkor:     '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/angkor.jpg',     // 앙코르와트 - 캄보디아 유적
  planet:     '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/planet.jpg',     // 외계행성 - 장가계풍 우주 풍경
  spaceship:  '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/spaceship.jpg',  // 우주선 조종실
  disney:     '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/disney.jpg',     // 디즈니랜드 - 메인스트리트 + 성
  library:    '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/library.jpg',    // 서재 - 원목 책장
  tajmahal:   '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/tajmahal.jpg',   // 타지마할 - 인도
  pyramid:    '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/pyramid.jpg',    // 피라미드 - 기자
  antarctica: '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/antarctica.jpg', // 남극 - 빙하 + 펭귄
  folkvillage:'/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/%EB%AF%BC%EC%86%8D%EC%B4%8C.jpg', // 민속촌 - 한국 전통 마을
  spacegame:  '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/%EC%9A%B0%EC%A3%BC%EA%B2%8C%EC%9E%84.jpg', // 우주게임 - 우주선 전투 콕핏
  roman:      '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/%EA%B3%A0%EB%8C%80%EB%A1%9C%EB%A7%88.jpg', // 고대 로마 거리 - 시장·신전·병사
  versailles: '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/%EB%B2%A0%EB%A5%B4%EC%82%AC%EC%9D%B4%EC%9C%A0%EA%B6%81%EC%A0%84.jpg', // 베르사이유 궁전 - 거울의 방, 궁정 인물
  mythhero:   '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/%EC%8B%A0%ED%99%94%EC%98%81%EC%9B%85.jpg', // 신화 영웅 - 설원의 전투
  jurassic:   '/img/%EB%B0%B0%EA%B2%BD%ED%99%94%EB%A9%B4/%EC%A5%AC%EB%9D%BC%EC%8B%9D%ED%8C%8C%ED%81%AC.webp', // 쥬라식파크 - 공룡(티라노)과 정글
};
const _vcBgCache = {}; // theme → HTMLImageElement (loaded)

function vcLoadBgImage(theme){
  // 이미 로드된 캐시 반환
  if (_vcBgCache[theme] && _vcBgCache[theme].complete && _vcBgCache[theme].naturalWidth > 0) {
    return Promise.resolve(_vcBgCache[theme]);
  }
  const url = VC_BG_IMAGES[theme];
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // canvas 사용을 위해 (동일 origin이라 사실상 무관)
    img.onload = () => { _vcBgCache[theme] = img; resolve(img); };
    img.onerror = (e) => { console.warn('[vc-bg] 이미지 로드 실패:', url, e); resolve(null); };
    img.src = url;
  });
}

// 합성에서 동기적으로 가져갈 수 있도록 미리 로드된 캐시만 리턴
function vcGetBgImageSync(theme){
  return _vcBgCache[theme] || null;
}

// --- 2) MediaPipe 스크립트 lazy 로드 ---
// ph163 (2026-07-23) — jsdelivr → 자체 서빙(/vendor/mediapipe/).
//   pdf.js(ph254) 와 같은 '자체 서버 우선, 실패 시에만 CDN 폴백' 방식을 그대로 따른다.
//   · 필리핀 저속 회선에서 도메인 하나(DNS+TLS)를 통째로 줄인다.
//   · 배경효과는 wasm 5.7MB + tflite 를 더 받는다. 그 경로가 전부 같은 오리진이 된다.
//   ⚠️ vcBg.mpBase 는 아래 vcInitBgEngine 의 locateFile 이 그대로 쓴다.
//      스크립트를 어디서 받았든 '같은 곳'에서 wasm 을 받아야 버전이 어긋나지 않는다.
const VC_MP_LOCAL = '/vendor/mediapipe/';
const VC_MP_CDN   = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1632777926/';
function vcLoadMediaPipe(){
  if (vcBg.mpLoaded) return Promise.resolve();
  if (vcBg.mpLoading) return vcBg.mpLoading;
  const inject = (base, crossOrigin) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = base + 'selfie_segmentation.js';
    if (crossOrigin) s.crossOrigin = 'anonymous';
    s.onload  = () => { vcBg.mpBase = base; vcBg.mpLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('MediaPipe 로드 실패: ' + base));
    document.head.appendChild(s);
  });
  vcBg.mpLoading = inject(VC_MP_LOCAL, false).catch(() => {
    console.warn('[ph163] 로컬 MediaPipe 실패 → CDN 폴백');
    return inject(VC_MP_CDN, true);
  }).catch(() => {
    throw new Error('MediaPipe 로드 실패. 네트워크 확인 후 다시 시도해 주세요.');
  });
  return vcBg.mpLoading;
}

// --- 3) Segmenter 초기화 ---
async function vcInitBgEngine(){
  if (vcBg.segmenter) return;
  if (typeof SelfieSegmentation === 'undefined') throw new Error('MediaPipe 로드 안됨');
  vcBg.segmenter = new SelfieSegmentation({
    // ph163 — 스크립트를 실제로 받아온 곳(vcBg.mpBase)에서 wasm·tflite 도 받는다.
    //   로컬에서 받았으면 로컬, CDN 폴백이었으면 CDN. 둘을 섞으면 버전이 어긋난다.
    locateFile: (f) => (vcBg.mpBase || VC_MP_LOCAL) + f
  });
  // Phase 7m: 가장자리 품질 우선 - modelSelection 0 (general, 256x256, 정밀한 edge)
  //   ↳ 멈춤 방지는 vcBgRenderLoop 의 프레임 throttle (skipNext) 로 해결
  // 🔋 모바일은 경량 landscape 모델(1, 144x256)로 전환해 발열·CPU 절감 → 연결 안정
  vcBg.segmenter.setOptions({ modelSelection: vcIsMobileDevice() ? 1 : 0, selfieMode: false });
  vcBg.segmenter.onResults(vcOnSegResults);
  await vcBg.segmenter.initialize();
  // 합성 캔버스
  if (!vcBg.canvas) {
    vcBg.canvas = document.createElement('canvas');
    vcBg.canvas.width = 1280; vcBg.canvas.height = 720;
    vcBg.ctx = vcBg.canvas.getContext('2d');
  }
  // Phase 7m: 마스크 전용 오프스크린 캔버스 (erosion + feather 처리용)
  if (!vcBg.maskCanvas) {
    vcBg.maskCanvas = document.createElement('canvas');
    vcBg.maskCanvas.width = 1280; vcBg.maskCanvas.height = 720;
    vcBg.maskCtx = vcBg.maskCanvas.getContext('2d');
  }
}

// --- 4) Segmentation 결과 합성 콜백 ---
//     Phase 7m: 번짐 제거를 위한 정밀 마스크 후처리
//     ① 오프스크린 마스크 캔버스에서 강한 contrast(2.4) 로 회색 전이 구간 제거 → binary 마스크
//     ② erosion 효과: 마스크를 destination-in 으로 1~2px 축소하여 머리/어깨 주위 halo 제거
//     ③ 가벼운 blur(0.6px) 로 마지막 anti-aliasing → 자연스러운 경계
//     ④ 사람 영상에 미세한 saturate/brightness 보정으로 배경과 톤 매칭
function vcOnSegResults(results){
  const ctx = vcBg.ctx;
  const w = vcBg.canvas.width, h = vcBg.canvas.height;
  const mctx = vcBg.maskCtx;

  // === Step A: 오프스크린에서 마스크 정제 ===
  mctx.save();
  mctx.clearRect(0, 0, w, h);
  // 1) 마스크 원본을 강한 contrast 로 그려서 회색 전이 → 거의 binary
  //    contrast(2.4) 가 alpha 0.3~0.7 의 halo 영역을 0 또는 1 로 강제
  mctx.filter = 'contrast(2.4) brightness(1.08)';
  mctx.drawImage(results.segmentationMask, 0, 0, w, h);
  mctx.filter = 'none';
  // 2) Erosion (마스크 축소) - 같은 마스크를 1px 씩 4방향 shift 한 후 destination-in
  //    겹치는 부분만 살아남아 가장자리가 안쪽으로 1px 잠식됨 → halo 제거
  mctx.globalCompositeOperation = 'destination-in';
  mctx.filter = 'contrast(2.4) brightness(1.08)';
  // 🔋 모바일은 가로 2방향만 erosion (4→2 패스, drawImage 비용 절반) → 발열·끊김 완화
  // (2026-08-01) vcPerf 등급으로 패스 수를 조절 — filter 가 걸린 drawImage 는 프레임당 비용이
  //   가장 큰 항목이라, 낮은 등급에서 4→2→0 으로 줄이는 것이 체감 효과가 크다.
  //   0 패스여도 위의 contrast(2.4) binary 마스크는 그대로라 인물은 정상적으로 잘린다
  //   (머리·어깨 주변 halo 가 조금 남을 뿐 — 멈추는 것보다 낫다).
  var _ero = window.vcPerf ? vcPerf.get().erosion : (vcIsMobileDevice() ? 2 : 4);
  if (_ero >= 2) {
    mctx.drawImage(results.segmentationMask, -1, 0, w, h);
    mctx.drawImage(results.segmentationMask, 1, 0, w, h);
  }
  if (_ero >= 4 && !vcIsMobileDevice()) {
    mctx.drawImage(results.segmentationMask, 0, -1, w, h);
    mctx.drawImage(results.segmentationMask, 0, 1, w, h);
  }
  if (_ero === 0) {
    // 축소 패스를 아예 건너뛸 때는 마스크 자체를 한 번은 그려야 destination-in 이 유효하다
    mctx.drawImage(results.segmentationMask, 0, 0, w, h);
  }
  mctx.filter = 'none';
  mctx.globalCompositeOperation = 'source-over';
  mctx.restore();

  // === Step B: 본 캔버스 합성 ===
  ctx.save();
  ctx.clearRect(0, 0, w, h);

  // 1) 정제된 마스크를 약간의 feather 와 함께 그리기 (자연스러운 anti-alias)
  //    (2026-08-01) 낮은 등급에서는 feather 를 끈다 — blur 필터 drawImage 1패스 절약
  var _fea = window.vcPerf ? vcPerf.get().feather : true;
  if (_fea) ctx.filter = 'blur(0.6px)';
  ctx.drawImage(vcBg.maskCanvas, 0, 0, w, h);
  ctx.filter = 'none';

  // 2) 마스크된 영역에 사람 영상 채움 (source-in)
  //    saturate/brightness 미세 보정으로 배경과 톤 조화
  ctx.globalCompositeOperation = 'source-in';
  ctx.filter = 'saturate(1.04) brightness(1.0)';
  ctx.drawImage(results.image, 0, 0, w, h);
  ctx.filter = 'none';

  // 3) 배경 깔기 (destination-over)
  ctx.globalCompositeOperation = 'destination-over';
  if (vcBg.mode === 'blur') {
    ctx.filter = 'blur(14px)';
    ctx.drawImage(results.image, 0, 0, w, h);
    ctx.filter = 'none';
  } else if (vcBg.mode !== 'off') {
    const img = vcGetBgImageSync(vcBg.mode);
    if (img && img.complete && img.naturalWidth > 0) {
      const ir = img.naturalWidth / img.naturalHeight;
      const cr = w / h;
      let sx, sy, sw, sh;
      if (ir > cr) { sh = img.naturalHeight; sw = sh * cr; sx = (img.naturalWidth - sw) / 2; sy = 0; }
      else { sw = img.naturalWidth; sh = sw / cr; sx = 0; sy = (img.naturalHeight - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    } else {
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.restore();
}

// --- 5) 처리 루프 (숨겨진 카메라 비디오 → segmenter) ---
//     ⚠ segmenter 입력은 반드시 별도 hiddenVideo (원본 카메라) - 자기참조 루프 방지
//     ⚠ busy 플래그 + currentTime 체크 - WASM "memory access out of bounds" 방지
async function vcBgRenderLoop(){
  if (!vcBg.isProcessing) return;
  const v = vcBg.hiddenVideo;
  // Phase 7m: 모델이 무거워진 만큼 3 프레임마다 1번 처리 (CPU 66% 절약 → 멈춤 방지)
  //   ↳ 화상통화에선 20fps 정도면 충분히 자연스러움
  // 🔥 모바일은 발열 절감을 위해 더 드물게 처리 (휴대폰 6프레임당 1회 ≈ 10fps, PC 3프레임당 1회)
  if (vcBg._mobile === undefined) {
    vcBg._mobile = window.matchMedia('(max-width: 920px)').matches
      || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  }
  vcBg.frameTick = (vcBg.frameTick || 0) + 1;
  // (2026-08-01) 고정 3/6 → vcPerf 등급값. 이 루프가 실제 몇 fps 도는지도 여기서 측정한다.
  if (window.vcPerf) vcPerf.tick();
  const _tier = window.vcPerf ? vcPerf.get() : null;
  const _everyN = _tier ? (vcBg._mobile ? Math.max(6, _tier.segEvery) : _tier.segEvery)
                        : (vcBg._mobile ? 6 : 3);
  const shouldProcess = (vcBg.frameTick % _everyN === 0);
  if (shouldProcess && v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0
      && vcBg.segmenter && !vcBg.sending) {
    vcBg.sending = true;
    const _t0 = window.vcPerf ? vcPerf.begin() : 0;   // ⏱ 모델 추론 + 합성(onResults) 시간 측정
    try {
      await vcBg.segmenter.send({ image: v });
      vcBg.frameCount = (vcBg.frameCount || 0) + 1;
    } catch(e) {
      vcBg.errorCount = (vcBg.errorCount || 0) + 1;
      if (vcBg.errorCount < 5) console.warn('[vc-bg] send 실패 (계속 진행):', e && e.message || e);
    } finally {
      if (window.vcPerf) vcPerf.end(_t0);
      vcBg.sending = false;
    }
  }
  vcBg.rafId = requestAnimationFrame(vcBgRenderLoop);
}

// --- 5-b) 숨겨진 카메라 비디오 준비 (원본 스트림 → segmenter 입력) ---
//     ⚠ 너무 작은 사이즈(1x1)면 브라우저가 렌더링 최적화로 빈 프레임 → WASM 에러
//     실 사이즈 (320x240) 로 두고 left:-9999px 로 화면 밖에 배치
async function vcEnsureHiddenVideo(){
  if (!vcBg.hiddenVideo) {
    const hv = document.createElement('video');
    hv.autoplay = true; hv.muted = true; hv.playsInline = true;
    hv.setAttribute('playsinline', '');
    hv.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:320px;height:240px;visibility:hidden;pointer-events:none';
    document.body.appendChild(hv);
    vcBg.hiddenVideo = hv;
  }
  // 항상 최신 vcLocalStream 으로 갱신 (카메라 토글 후에도 안전)
  if (vcBg.hiddenVideo.srcObject !== vcLocalStream) {
    vcBg.hiddenVideo.srcObject = vcLocalStream;
  }
  try { await vcBg.hiddenVideo.play(); } catch(e) {}
  // 비디오 메타데이터 + 첫 프레임 로딩 대기
  if (vcBg.hiddenVideo.videoWidth === 0 || vcBg.hiddenVideo.readyState < 2) {
    await new Promise((resolve) => {
      const ok = () => {
        if (vcBg.hiddenVideo.videoWidth > 0 && vcBg.hiddenVideo.readyState >= 2) {
          vcBg.hiddenVideo.removeEventListener('loadeddata', ok);
          vcBg.hiddenVideo.removeEventListener('canplay', ok);
          resolve();
        }
      };
      vcBg.hiddenVideo.addEventListener('loadeddata', ok);
      vcBg.hiddenVideo.addEventListener('canplay', ok);
      setTimeout(resolve, 2500); // 안전 타임아웃 2.5초
    });
  }
  // 캔버스 사이즈 = 카메라 비율 유지하되 목표 가로폭(PC 640 / 모바일 480)으로 축소
  //   → 720p 그대로 합성/인코딩하던 것 대비 픽셀 수 1/4~1/9 로 줄어 CPU·전력·대역폭 대폭 절감
  if (vcBg.canvas && vcBg.hiddenVideo.videoWidth > 0) {
    const vw = vcBg.hiddenVideo.videoWidth, vh = vcBg.hiddenVideo.videoHeight;
    const target = vcBgTargetWidth();
    const cw = Math.min(vw, target);
    const ch = Math.round(cw * vh / vw);
    vcBg.canvas.width = cw;   vcBg.canvas.height = ch;
    if (vcBg.maskCanvas) { vcBg.maskCanvas.width = cw; vcBg.maskCanvas.height = ch; }
  }
}

// --- 6) 캔버스 → MediaStreamTrack → 모든 peer 의 sender 에 replaceTrack ---
function vcSwapVideoTrack(newTrack){
  // 🎭 얼굴 액세서리(vcFx)가 활성화돼 있으면, fx 캔버스가 최종 송신 소스다.
  //   이때 vcBg(가상배경)가 자체적으로 부르는 트랙 교체는 무시 → fx가 sender 를 계속 점유.
  //   (fx 가 vcBg.canvas 를 읽어 합성하므로 배경 변경은 그대로 반영됨)
  if (window.vcFx && window.vcFx.active && !window.__vcFxInternalSwap) return;
  // 가상배경 캔버스 트랙은 카메라 원본보다 인코딩이 무겁다 → 교체 직후 sender 파라미터 재적용
  //   · degradationPreference 'maintain-framerate' : 부하 시 화질·해상도를 먼저 낮춰 끊김(프레임 드랍) 방지 = 실시간성 우선
  //   · maxBitrate / maxFramerate 상한 : 인코더 풀가동 차단 → CPU·전력·대역폭 절감
  const isBgTrack = !!(vcBg.processedStream && newTrack
    && vcBg.processedStream.getVideoTracks()[0] === newTrack);
  const mobile = vcIsMobileDevice();
  // 모든 PeerConnection 의 video sender 교체
  if (typeof vcPeerConnections === 'object' && vcPeerConnections) {
    Object.values(vcPeerConnections).forEach(pc => {
      try {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (!sender) return;
        sender.replaceTrack(newTrack);
        if (sender.getParameters) {
          const params = sender.getParameters();
          if (!params.encodings || !params.encodings.length) params.encodings = [{}];
          params.encodings[0].maxBitrate   = (mobile ? 500 : 1000) * 1000;
          params.encodings[0].maxFramerate = isBgTrack ? (mobile ? 12 : 20) : (mobile ? 15 : 24);
          /* 🎞 (2026-08-11) 원본 복귀 시에도 프레임 우선으로 통일 — 예전엔 가상배경일 때만
             프레임을 지키고 원본은 'balanced' 라, 배경을 끄는 순간 끊김이 다시 시작됐다. */
          params.degradationPreference = 'maintain-framerate';
          sender.setParameters(params).catch(e => console.warn('[vc-bg] setParameters:', e));
        }
      } catch(e){ console.warn('[vc-bg] replaceTrack 실패:', e); }
    });
  }
}

// ── 🔒 학생 가상배경 변경 잠금 (2026-07-20) ─────────────────────────────
//   강사가 배경 탭의 잠금 버튼을 누르면 DO 릴레이('bg-lock' — 서버가 소켓 role 로
//   강사/관리자만 허용)로 모든 학생의 배경/얼굴꾸미기 변경이 잠긴다.
//   잠금 상태는 DO storage 에 저장되어 늦게 입장·재접속한 학생에게도 적용되고,
//   방이 비거나 새 수업 첫 입장 시 자동 해제된다.
window.__vcBgLockOn = false;            // 강사 화면: 내가 켠 잠금 상태
window.__vcBgLockedByTeacher = false;   // 학생 화면: 선생님이 잠갔는지
function _vcBgLockEn(){ try { return (localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang')) === 'en'; } catch(_) { return false; } }
function _vcBgLockIsStaff(){ return window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'; }
function _vcBgLockMsg(locked){
  return locked
    ? (_vcBgLockEn() ? '🔒 Teacher locked background changes' : '🔒 선생님이 배경화면 변경을 잠갔어요')
    : (_vcBgLockEn() ? '🔓 Background changes are available again' : '🔓 배경화면 변경이 다시 가능해요');
}

// 강사 버튼: 노출 여부(강사/관리자만) + 라벨·색 갱신
window.vcBgLockBtnRender = function(){
  var btn = document.getElementById('vc-bg-lock-btn');
  if (!btn) return;
  var staff = _vcBgLockIsStaff() || ((typeof vcIsTeacherRole === 'function') && vcIsTeacherRole());
  btn.style.display = staff ? 'inline-flex' : 'none';
  if (!staff) return;
  var on = !!window.__vcBgLockOn;
  var ko = on ? '🔓 학생 배경 변경 잠금 해제' : '🔒 학생 배경 변경 잠금';
  var en = on ? '🔓 Unlock student backgrounds' : '🔒 Lock student backgrounds';
  btn.setAttribute('data-ko', ko); btn.setAttribute('data-en', en);
  btn.textContent = _vcBgLockEn() ? en : ko;
  btn.style.background = on ? '#dc2626' : '#16a34a';
};

// 강사: 잠금 토글 → 서버로 방송 (연결 순단 중엔 재연결 큐가 재전송)
window.vcBgLockToggle = function(){
  window.__vcBgLockOn = !window.__vcBgLockOn;
  window.vcBgLockBtnRender();
  try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'bg-lock', data: { locked: window.__vcBgLockOn } }); } catch(_){}
  try {
    if (typeof showToast === 'function') showToast(window.__vcBgLockOn
      ? (_vcBgLockEn() ? '🔒 Student background changes locked' : '🔒 학생 배경 변경을 잠갔어요')
      : (_vcBgLockEn() ? '🔓 Student background changes unlocked' : '🔓 학생 배경 변경 잠금을 해제했어요'));
  } catch(_){}
};

// 학생: 잠금 적용/해제 — 배경·얼굴꾸미기 타일 비활성화 + 안내 문구.
//   얼굴꾸미기 타일은 탭 첫 진입 때 늦게 생성되므로, 배경 탭 진입 시(vcSwitchTab)
//   재적용 + vcSetFace 함수 래퍼 가드로 이중 방어한다.
window.vcBgLockApply = function(locked){
  locked = !!locked;
  var changed = window.__vcBgLockedByTeacher !== locked;
  window.__vcBgLockedByTeacher = locked;
  document.querySelectorAll('.vc-bg-tile, .vc-fx-tile').forEach(function(b){
    b.disabled = locked;
    b.style.opacity = locked ? '0.4' : '';
    b.style.cursor = locked ? 'not-allowed' : 'pointer';
  });
  var status = document.getElementById('vc-bg-status');
  if (status) status.textContent = locked
    ? (_vcBgLockEn() ? '🔒 Teacher locked background changes' : '🔒 선생님이 배경화면 변경을 잠갔어요')
    : (_vcBgLockEn() ? 'Click any background to apply' : '원하는 배경을 클릭하세요');
  if (changed) { try { if (typeof showToast === 'function') showToast(_vcBgLockMsg(locked)); } catch(_){} }
  // 얼굴꾸미기 진입점(idx-x6.js 의 vcSetFace)도 1회 래핑해 잠금 가드
  if (!window.__vcSetFaceLockWrapped && typeof window.vcSetFace === 'function') {
    var _origSetFace = window.vcSetFace;
    window.vcSetFace = function(){
      if (window.__vcBgLockedByTeacher && !_vcBgLockIsStaff()) {
        try { if (typeof showToast === 'function') showToast(_vcBgLockMsg(true)); } catch(_){}
        return;
      }
      return _origSetFace.apply(this, arguments);
    };
    window.__vcSetFaceLockWrapped = true;
  }
};

// ── 🎤/🎯 수업 통제 칩 2종: 전체 음소거(mic-lock)·집중 모드(focus-lock) (2026-07-21) ──
//   bg-lock 과 동일 구조 — 서버(DO)가 role 검증·storage 저장·늦은 입장 재전송·빈 방 자동 해제.
//   칩은 상단 탭바(.tab-bar)에 상주, 강사/관리자에게만 노출.
window.__vcMicLockOn = false;      window.__vcMicLockedByTeacher = false;
window.__vcFocusLockOn = false;    window.__vcFocusLockedByTeacher = false;

window.vcClassLockChipsRender = function(){
  var staff = _vcBgLockIsStaff() || ((typeof vcIsTeacherRole === 'function') && vcIsTeacherRole());
  var en = _vcBgLockEn();
  /* 👥 (2026-08-12 Shas 3번) 「학생 제어」 이름표 — 아래 세 칩이 무엇을 하는 묶음인지 알려 준다.
     칩들과 «똑같은 조건» 으로 켜고 끈다. 따로 두면 학생 화면에 이름표만 남는다. */
  var sctl = document.getElementById('vc-studentctl-label');
  if (sctl) sctl.style.display = staff ? 'inline-flex' : 'none';
  var mic = document.getElementById('vc-miclock-btn');
  if (mic) {
    mic.style.display = staff ? 'inline-flex' : 'none';
    if (staff) {
      var mOn = !!window.__vcMicLockOn;
      var mKo = mOn ? '🔊 전체 음소거 해제' : '🎤 전체 음소거';
      var mEn = mOn ? '🔊 Unmute all' : '🎤 Mute all';
      mic.setAttribute('data-ko', mKo); mic.setAttribute('data-en', mEn);
      mic.textContent = en ? mEn : mKo;
      mic.style.background = mOn ? '#dc2626' : '#16a34a';
    }
  }
  /* 📖 (2026-07-29) 교재 라이브러리 바로가기 — 강사·관리자에게만.
     드롭다운 안에 숨어 있어 "다른 교재를 못 찾겠다"는 제보가 나온 입구를 상단에 노출한다. */
  var lib = document.getElementById('vc-lib-open-btn');
  if (lib) {
    lib.style.display = staff ? 'inline-flex' : 'none';
    if (staff) {
      var lKo = '📖 교재 고르기', lEn = '📖 Choose Textbook';
      lib.setAttribute('data-ko', lKo); lib.setAttribute('data-en', lEn);
      lib.textContent = en ? lEn : lKo;
    }
  }
  /* ✋ (2026-07-28 Kaye 9번) 학생 필기 잠금 버튼도 같은 시점에 함께 갱신 */
  try { if (typeof vcRenderDrawLockChip === 'function') vcRenderDrawLockChip(); } catch(_){}
  /* 🖥 (2026-07-30 Kaye 4번) 내 화면 공유 버튼도 함께 갱신 */
  try { if (typeof vcRenderScreenShareChip === 'function') vcRenderScreenShareChip(); } catch(_){}
  /* 📚 (2026-08-12 Melca 7·8번) 교재도구 바의 강사 전용 버튼도 같은 시점에 함께 —
     역할이 확정되는 모든 경로가 이 함수를 부르므로 여기 한 곳이면 전부 덮인다. */
  try { if (typeof vcRenderTextbookControls === 'function') vcRenderTextbookControls(); } catch(_){}
  /* 🎬 (2026-08-12 Melca) 동영상 툴바의 강사 전용 버튼도 같은 시점에 */
  try { if (typeof vcRenderVideoControls === 'function') vcRenderVideoControls(); } catch(_){}
  var fc = document.getElementById('vc-focuslock-btn');
  if (fc) {
    fc.style.display = staff ? 'inline-flex' : 'none';
    if (staff) {
      var fOn = !!window.__vcFocusLockOn;
      var fKo = fOn ? '🎯 집중 모드 해제' : '🎯 집중 모드';
      var fEn = fOn ? '🎯 End focus mode' : '🎯 Focus mode';
      fc.setAttribute('data-ko', fKo); fc.setAttribute('data-en', fEn);
      fc.textContent = en ? fEn : fKo;
      fc.style.background = fOn ? '#dc2626' : '#16a34a';
    }
  }
};

/* 🌐 (2026-08-08) 언어를 바꾸면 수업 통제 칩 4종을 다시 그린다.
   data-ko/data-en 만으로도 글자는 바뀌지만, 이 칩들은 «상태(잠금/공유중)에 따라 라벨과 색이
   같이 바뀌는» 버튼이라 그리는 주체를 하나로 두는 편이 안전하다. */
try {
  window.addEventListener('mangoi:langchange', function(){
    try { if (typeof window.vcClassLockChipsRender === 'function') window.vcClassLockChipsRender(); } catch(_){}
    /* 🎯 집중 모드 띠도 글자를 갈아 끼운다 — textContent 로 그린 것이라
       data-ko/data-en 루프가 못 고친다(CLAUDE.md 의 «JS 로 그린 라벨» 함정). */
    try {
      if (document.getElementById('vc-focus-badge')) {
        var _fs = (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin');
        window.vcFocusBadge(_fs ? !!window.__vcFocusLockOn : !!window.__vcFocusLockedByTeacher, _fs);
      }
    } catch(_){}
  });
} catch(_){}

window.vcMicLockToggle = function(){
  window.__vcMicLockOn = !window.__vcMicLockOn;
  window.vcClassLockChipsRender();
  try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'mic-lock', data: { locked: window.__vcMicLockOn } }); } catch(_){}
  try {
    if (typeof showToast === 'function') showToast(window.__vcMicLockOn
      ? (_vcBgLockEn() ? '🔇 All students muted' : '🔇 학생 전체 음소거를 켰어요')
      : (_vcBgLockEn() ? '🔊 All students unmuted' : '🔊 전체 음소거를 해제했어요'));
  } catch(_){}
};

/* ✋ (2026-07-28 강사 피드백 Kaye 9번) "학생이 교재·칠판에 낙서한다 — 교사가 막을 수 있게(Boda 처럼)"
   전체 음소거(vcMicLockToggle) 와 똑같은 방식: 상태를 켜고 학생들에게 방송한다.
   학생 쪽은 pointerdown 게이트와 'pdf-drawlock' 수신으로 막힌다(양쪽 이중 방어). */
window.vcDrawLockToggle = function(){
  window.__pdfStudentDrawLock = !window.__pdfStudentDrawLock;
  try { if (typeof vcRenderDrawLockChip === 'function') vcRenderDrawLockChip(); } catch(_){}
  try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'pdf-drawlock', data: { on: !!window.__pdfStudentDrawLock } }); } catch(_){}
  try {
    if (typeof showToast === 'function') showToast(window.__pdfStudentDrawLock
      ? (_vcBgLockEn() ? 'Student drawing locked' : '학생 필기를 잠갔어요')
      : (_vcBgLockEn() ? 'Student drawing unlocked' : '학생 필기를 다시 허용했어요'));
  } catch(_){}
};
/* 버튼 모양 갱신 — 잠금이면 빨강, 아니면 초록 */
window.vcRenderDrawLockChip = function(){
  var btn = document.getElementById('vc-drawlock-btn');
  if (!btn) return;
  /* 교사 판정은 옆 칩(전체 음소거)과 같은 방식을 쓴다 — 한쪽만 다르면 한 버튼만 안 보이는 사고가 난다. */
  var isT = false;
  try {
    isT = (typeof _vcBgLockIsStaff === 'function' && _vcBgLockIsStaff())
       || (typeof vcIsTeacherRole === 'function' && vcIsTeacherRole())
       || window.vcMyRole === 'teacher' || window.vcMyRole === 'admin';
  } catch(_) { isT = (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'); }
  btn.style.display = isT ? 'inline-flex' : 'none';       // 교사·관리자에게만 보인다
  var on = !!window.__pdfStudentDrawLock;
  var en = (typeof _vcBgLockEn === 'function') ? _vcBgLockEn() : false;
  btn.style.background = on ? '#dc2626' : '#16a34a';
  /* 🌐 라벨을 data-ko/data-en 에도 남긴다 — 언어를 바꾸면 applyLang 이 이 두 벌로 다시 쓴다.
     (없으면 EN 으로 그려진 뒤 KO 로 돌아와도 'Lock drawing' 인 채 굳는다 — 2026-08-08 제보) */
  /* 🌐 (2026-08-10) 라벨을 «상태» 가 아니라 «누르면 일어나는 일» 로 바꾼다.
     초록 「학생 필기 허용」은 상태 표시로 읽혀, 강사들이 기능이 없는 줄 알았다. */
  var _dKo = on ? '🔒 필기 잠김 — 풀기' : '✋ 학생 필기 잠그기';
  var _dEn = on ? '🔒 Locked — unlock' : '✋ Lock student drawing';
  btn.setAttribute('data-ko', _dKo); btn.setAttribute('data-en', _dEn);
  btn.textContent = en ? _dEn : _dKo;
};

window.vcFocusLockToggle = function(){
  window.__vcFocusLockOn = !window.__vcFocusLockOn;
  window.vcClassLockChipsRender();
  /* 🎯 (Shas 4번) 강사 자신에게도 «켜져 있다» 를 계속 보여 준다 — 칩 색만으로는
     눌렀는지 알기 어려워 「아무 변화가 없다」는 제보가 나왔다. */
  try { window.vcFocusBadge(window.__vcFocusLockOn, true); } catch(_){}
  try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type: 'focus-lock', data: { locked: window.__vcFocusLockOn } }); } catch(_){}
  try {
    if (typeof showToast === 'function') showToast(window.__vcFocusLockOn
      ? (_vcBgLockEn() ? '🎯 Focus mode ON — students follow you' : '🎯 집중 모드 시작 — 학생이 화면을 못 바꿔요')
      : (_vcBgLockEn() ? '🎯 Focus mode OFF' : '🎯 집중 모드를 해제했어요'));
  } catch(_){}
};

// 학생: 전체 음소거 적용/해제 — 현재 마이크 상태 기억 후 강제 off, 해제 시 원복.
//   window.vcMicOn=false 로 두므로 자가치유(vcHealLocalMic)·복귀 재점검(vcResumeClassSession)·
//   하단 독(1.5초 주기 sync)이 자연히 잠금을 존중/반영한다.
window.vcMicLockApply = function(locked){
  locked = !!locked;
  var changed = window.__vcMicLockedByTeacher !== locked;
  window.__vcMicLockedByTeacher = locked;
  try {
    if (locked) {
      if (window.__vcMicPrevOn === undefined) window.__vcMicPrevOn = (window.vcMicOn !== false);
      window.vcMicOn = false;
      if (window.vcLocalStream) vcLocalStream.getAudioTracks().forEach(function(t){ t.enabled = false; });
      try { if (typeof stopMicLevelMeter === 'function') stopMicLevelMeter(); } catch(_){}
      // 🛡 잠금 수신 시점에 아직 스트림이 없던 학생(입장 직후)도 확실히 음소거되도록 상시 집행
      if (!window.__vcMicLockTimer) window.__vcMicLockTimer = setInterval(function(){
        try {
          if (!window.__vcMicLockedByTeacher) { clearInterval(window.__vcMicLockTimer); window.__vcMicLockTimer = null; return; }
          if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') return;
          window.vcMicOn = false;
          if (window.vcLocalStream) vcLocalStream.getAudioTracks().forEach(function(t){ if (t.enabled) t.enabled = false; });
        } catch(_){}
      }, 2000);
    } else if (changed) {
      var prev = (window.__vcMicPrevOn === undefined) ? true : !!window.__vcMicPrevOn;
      window.__vcMicPrevOn = undefined;
      window.vcMicOn = prev;
      if (window.vcLocalStream) vcLocalStream.getAudioTracks().forEach(function(t){ t.enabled = prev; });
      try { if (prev && typeof startMicLevelMeter === 'function') startMicLevelMeter(); } catch(_){}
    }
    // 상단 툴바 마이크 버튼 UI 동기화 (독은 sync 주기가 알아서 반영)
    var on = (window.vcMicOn !== false);
    var btn = document.getElementById('vc-btn-mic');
    if (btn) { btn.className = 'ctrl-btn ' + (on ? 'on' : 'off'); btn.textContent = on ? '🎤' : '🔇'; }
  } catch(_){}
  if (changed) {
    try {
      if (typeof showToast === 'function') showToast(locked
        ? (_vcBgLockEn() ? '🔇 Teacher muted everyone' : '🔇 선생님이 전체 음소거를 켰어요')
        : (_vcBgLockEn() ? '🔊 You can unmute now' : '🔊 이제 마이크를 켤 수 있어요'));
    } catch(_){}
  }
};

// 학생: 집중 모드 적용/해제 — 실제 차단은 vcToggleContentTab/vcMobileTabSwitch 가드가 수행
/* 🎯 (2026-08-12 강사 Shas 4번) 「Focus Mode 를 눌렀는데 아무런 변화가 없다」
   기능은 멀쩡히 돌고 있었다 — 학생의 탭 전환(vcToggleContentTab·vcMobileTabSwitch)과
   채팅 자동열기를 막는다. 문제는 **그 사실이 화면 어디에도 남지 않는 것**이었다.
   토스트는 몇 초 뒤 사라지고, 켠 «뒤에» 들어온 학생은 그마저도 못 본다.
   그래서 강사에게는 눌러도 아무 일이 없는 버튼으로 보였다.
   → 켜져 있는 «동안» 계속 떠 있는 띠를 둔다. 강사와 학생에게 각각 다른 말로.
   ⚠️ pointer-events:none — 수업 화면 위에 뜨므로 클릭을 절대 가로채면 안 된다.
      (예전에 «보이는데 눌리지 않는 유령 창» 사고가 있었다) */
window.vcFocusBadge = function(on, forStaff){
  try {
    var old = document.getElementById('vc-focus-badge');
    if (old) old.remove();
    if (!on) return;
    var en = false;
    try { en = (typeof getLang === 'function' && getLang() === 'en'); } catch(_){}
    var box = document.createElement('div');
    box.id = 'vc-focus-badge';
    box.style.cssText = 'position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:2147482000;'
      + 'pointer-events:none;max-width:min(520px,94vw);padding:7px 16px;border-radius:999px;'
      + 'font-size:12.5px;font-weight:800;line-height:1.4;text-align:center;white-space:nowrap;'
      + 'overflow:hidden;text-overflow:ellipsis;'
      + 'background:rgba(180,83,9,.94);border:1px solid #fbbf24;color:#fef3c7;'
      + 'box-shadow:0 8px 24px -8px rgba(0,0,0,.5)';
    box.textContent = forStaff
      ? (en ? '🎯 Focus mode ON — students cannot switch tabs'
            : '🎯 집중 모드 켜짐 — 학생은 화면을 바꿀 수 없어요')
      : (en ? '🎯 Focus mode — follow your teacher’s screen'
            : '🎯 집중 모드 — 선생님 화면을 따라가요');
    document.body.appendChild(box);
  } catch(_){}
};
window.vcFocusLockApply = function(locked){
  locked = !!locked;
  var changed = window.__vcFocusLockedByTeacher !== locked;
  window.__vcFocusLockedByTeacher = locked;
  /* 띠는 «상태» 다 — changed 와 무관하게 항상 맞춘다.
     늦게 들어온 학생은 서버가 재전송해 주는데, 그때 changed 는 true 지만
     새로고침·재입장으로 값이 같은 채 들어오는 경우도 있어 여기서 한 번 더 맞춘다. */
  try { window.vcFocusBadge(locked, false); } catch(_){}
  if (changed) {
    try {
      if (typeof showToast === 'function') showToast(locked
        ? (_vcBgLockEn() ? '🎯 Focus mode — follow your teacher' : '🎯 집중 모드 시작 — 선생님 화면을 따라가요')
        : (_vcBgLockEn() ? '🎯 Focus mode ended' : '🎯 집중 모드가 끝났어요'));
    } catch(_){}
  }
};

// --- 7) 메인 진입점 ---
window.vcSetBackground = async function(mode){
  // 🔒 선생님이 잠근 동안 학생은 배경 변경 불가 (타일 disabled 를 우회하는 호출도 차단)
  if (window.__vcBgLockedByTeacher && !_vcBgLockIsStaff()) {
    try { if (typeof showToast === 'function') showToast(_vcBgLockMsg(true)); } catch(_){}
    return;
  }
  // 활성 타일 표시
  document.querySelectorAll('.vc-bg-tile').forEach(t => {
    if (t.getAttribute('data-bg') === mode) {
      t.classList.add('vc-bg-active');
      t.style.borderColor = '#fbbf24';
    } else {
      t.classList.remove('vc-bg-active');
      t.style.borderColor = '#334155';
    }
  });
  const status = document.getElementById('vc-bg-status');
  vcBg.mode = mode;

  // 카메라 트랙 확보
  const camTrack = vcLocalStream && vcLocalStream.getVideoTracks()[0];
  if (!camTrack) {
    if (status) status.textContent = '⚠ 카메라가 꺼져 있어 가상 배경을 적용할 수 없습니다.';
    return;
  }

  // OFF: 원본 카메라로 복귀 + CSS 프레임도 제거
  if (mode === 'off') {
    vcBg.isProcessing = false;
    if (vcBg.rafId) { cancelAnimationFrame(vcBg.rafId); vcBg.rafId = null; }
    const v = document.getElementById('vc-local-video');
    if (v) {
      v.srcObject = vcLocalStream;
      v.style.borderRadius = '';
      v.style.boxShadow = '';
      v.style.filter = '';
      try { vcInstallSmartFit(v); } catch(_){}
    }
    const box = document.getElementById('vc-local-box');
    if (box) {
      box.style.background = '';
      box.style.padding = '';
      box.style.borderRadius = '';
    }
    const camTrk = vcLocalStream && vcLocalStream.getVideoTracks()[0];
    if (camTrk) vcSwapVideoTrack(camTrk);
    if (status) status.textContent = '원본 카메라 사용 중';
    return;
  }

  // ★ Phase 7k: CSS 프레임 즉시 적용 (검정화면 절대 방지)
  //   먼저 비디오 컨테이너에 CSS background 적용 → 사용자가 즉시 시각적 변화 확인
  //   AI 처리는 그 위에 best-effort 로 시도 → 실패해도 CSS 프레임이 보임
  const vcLocalBox = document.getElementById('vc-local-box');
  // fix (2026-07-12) — 모바일 타일은 작아서 12px 프레임이 얼굴 영역을 잡아먹음 → 6px
  const _bgFramePad = vcIsMobileDevice() ? '6px' : '12px';
  if (vcLocalBox && mode !== 'blur' && VC_BG_IMAGES[mode]) {
    vcLocalBox.style.background = "url('" + VC_BG_IMAGES[mode] + "') center/cover";
    vcLocalBox.style.padding = _bgFramePad;
    vcLocalBox.style.borderRadius = '14px';
    // 비디오 자체에 살짝 그림자 + 둥근 테두리로 자연스럽게
    const innerV = document.getElementById('vc-local-video');
    if (innerV) {
      innerV.style.borderRadius = '10px';
      innerV.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
    }
  } else if (vcLocalBox && mode === 'blur') {
    vcLocalBox.style.background = '#1e293b';
    vcLocalBox.style.padding = _bgFramePad;
    vcLocalBox.style.borderRadius = '14px';
    const innerV = document.getElementById('vc-local-video');
    if (innerV) innerV.style.filter = 'blur(0)';
  }
  // vcBg.mode 가 방금 세팅됐으니 스마트핏 즉시 재계산 → 가상배경 타일은 contain 으로 전환(얼굴 잘림 방지)
  try { vcSmartFitVideo(document.getElementById('vc-local-video')); } catch(_){}
  if (status) {
    const names = { blur:'흐림', galaxy:'우주', desert:'사막', underwater:'바닷속', beach:'바닷가', jungle:'정글', fireplace:'벽난로', angkor:'앙코르와트', jurassic:'쥬라식파크' };
    status.textContent = '✅ ' + (names[mode]||mode) + ' 배경 프레임 적용됨 (AI 처리 시도 중…)';
  }

  // 첫 적용: MediaPipe 로드 + 엔진 init + 배경 이미지 + 원본 트랙 보관 (best-effort)
  try {
    await vcLoadMediaPipe();
    await vcInitBgEngine();
    await vcEnsureHiddenVideo();
    if (mode !== 'blur' && VC_BG_IMAGES[mode]) {
      await vcLoadBgImage(mode);
    }
  } catch(e) {
    if (status) status.textContent = '✅ ' + (({blur:'흐림',galaxy:'우주',desert:'사막',underwater:'바닷속',beach:'바닷가',jungle:'정글'})[mode]||mode) + ' 배경 (CSS 프레임 모드 - AI 처리 미사용)';
    console.warn('[vc-bg] MediaPipe 로드 실패, CSS 프레임 모드 유지:', e);
    return;
  }

  // 원본 트랙 보관 (Off 시 복귀용)
  if (!vcBg.originalVideoTrack) vcBg.originalVideoTrack = camTrack;

  // 처리 시작
  vcBg.isProcessing = true;
  if (!vcBg.rafId) vcBgRenderLoop();

  // 첫 프레임 즉시 한 번 그려서 검정 화면 방지 (RAF 첫 콜백 전 대기 시간 동안)
  try {
    await vcBg.segmenter.send({ image: vcBg.hiddenVideo });
  } catch(e) { console.warn('[vc-bg] 초기 프레임 송신 실패:', e); }

  // 캔버스 스트림 생성 → 로컬 비디오에 연결 + sender 교체
  if (!vcBg.processedStream) {
    // 🔋 캡처 fps 상한(PC 20 / 모바일 12) — 실제 처리 fps와 맞춰 같은 프레임 중복 인코딩 방지
    vcBg.processedStream = vcBg.canvas.captureStream(vcBgCaptureFps());
    // 오디오 트랙도 합쳐서 보내야 함 (영상만 바꿈, 오디오는 원본 유지)
    const audioTrack = vcLocalStream.getAudioTracks()[0];
    if (audioTrack) vcBg.processedStream.addTrack(audioTrack);
  }
  const v = document.getElementById('vc-local-video');
  if (v) {
    v.srcObject = vcBg.processedStream;
    // 모바일 자동재생 정책: srcObject 교체 후 play() 필수 (안 하면 정지 프레임)
    v.muted = true; v.setAttribute('playsinline','');
    try { const _p=v.play(); if(_p&&_p.catch) _p.catch(()=>{}); } catch(_){}
    try { vcInstallSmartFit(v); } catch(_){}
  }
  const newVideoTrack = vcBg.processedStream.getVideoTracks()[0];
  if (newVideoTrack) vcSwapVideoTrack(newVideoTrack);

  if (status) {
    const names = { blur:'흐림', galaxy:'우주', desert:'사막', underwater:'바닷속', beach:'바닷가', jungle:'정글', fireplace:'벽난로', angkor:'앙코르와트', jurassic:'쥬라식파크' };
    status.textContent = '✅ ' + (names[mode]||mode) + ' 배경 적용 중 — 모든 참가자에게 보입니다';
  }

  // Phase 7k: 2초 후 AI 처리 잘 되면 메시지 업그레이드, 안되면 CSS 프레임 모드 유지
  vcBg.frameCount = 0;
  vcBg.errorCount = 0;
  setTimeout(() => {
    if (vcBg.mode !== mode) return; // 사용자가 다른 배경으로 바꿈
    const nameMap = {blur:'흐림',galaxy:'우주',desert:'사막',underwater:'바닷속',beach:'바닷가',jungle:'정글'};
    const niceName = nameMap[mode] || mode;
    if ((vcBg.frameCount || 0) > 0) {
      // AI 처리 성공 - 진짜 가상배경
      if (status) status.textContent = '✅ ' + niceName + ' AI 가상배경 적용 중 (모든 참가자에게 보임)';
    } else {
      // AI 실패 - CSS 프레임만 유지 (검정화면 X, 본인+상대 모두 raw 카메라 + 본인 화면 프레임)
      if (status) status.textContent = '✅ ' + niceName + ' 배경 프레임 (본인 화면만 - AI 처리 불가)';
      vcBg.isProcessing = false;
      if (vcBg.rafId) { cancelAnimationFrame(vcBg.rafId); vcBg.rafId = null; }
      // srcObject는 raw 카메라 유지, CSS 프레임만 표시
    }
  }, 2000);
};

// 🥭 Phase 41 — 학생게임 (오늘의 교재 vocab 기반 두 가지 미니게임)
const _GAME_VOCAB = [
  // [영문 문장, 한국어 번역, 단어 분리]
  { en: 'I love mango fruit.',           ko: '나는 망고 과일을 좋아해요.',         words: ['I','love','mango','fruit'] },
  { en: 'She is reading a book.',        ko: '그녀는 책을 읽고 있어요.',           words: ['She','is','reading','a','book'] },
  { en: 'We go to school every day.',    ko: '우리는 매일 학교에 가요.',           words: ['We','go','to','school','every','day'] },
  { en: 'My dog is very cute.',          ko: '내 강아지는 매우 귀여워요.',         words: ['My','dog','is','very','cute'] },
  { en: 'The sun is shining brightly.',  ko: '태양이 밝게 빛나고 있어요.',         words: ['The','sun','is','shining','brightly'] },
  { en: 'He plays soccer on Sundays.',   ko: '그는 일요일에 축구를 해요.',         words: ['He','plays','soccer','on','Sundays'] },
  { en: 'I like to eat pizza.',          ko: '나는 피자 먹는 것을 좋아해요.',     words: ['I','like','to','eat','pizza'] },
  { en: 'They are good friends.',        ko: '그들은 좋은 친구입니다.',           words: ['They','are','good','friends'] },
  // 🎢 상위 난이도(6~7단계)용 — 더 길고 어려운 문장
  { en: 'My family went to the beach last summer.',       ko: '우리 가족은 지난여름 해변에 갔어요.',       words: ['My','family','went','to','the','beach','last','summer'] },
  { en: 'She wants to be a famous scientist someday.',    ko: '그녀는 언젠가 유명한 과학자가 되고 싶어해요.', words: ['She','wants','to','be','a','famous','scientist','someday'] },
  { en: 'We should always be kind to our friends.',       ko: '우리는 친구들에게 항상 친절해야 해요.',     words: ['We','should','always','be','kind','to','our','friends'] },
  { en: 'The students are studying English together now.',ko: '학생들은 지금 함께 영어를 공부하고 있어요.', words: ['The','students','are','studying','English','together','now'] }
];
const _GAME_WORDS = [
  { en:'apple', ko:'사과' }, { en:'book', ko:'책' }, { en:'cat', ko:'고양이' },
  { en:'dog', ko:'강아지' }, { en:'flower', ko:'꽃' }, { en:'hello', ko:'안녕' },
  { en:'school', ko:'학교' }, { en:'water', ko:'물' }, { en:'sun', ko:'태양' },
  { en:'moon', ko:'달' }, { en:'star', ko:'별' }, { en:'love', ko:'사랑' },
  // 🎢 상위 난이도(6~7단계)용 — 더 길고 어려운 단어
  { en:'beautiful', ko:'아름다운' }, { en:'delicious', ko:'맛있는' }, { en:'important', ko:'중요한' },
  { en:'together', ko:'함께' }, { en:'adventure', ko:'모험' }, { en:'vacation', ko:'방학' }
];
const _gameState = { mode: 'pizza', score: 0, correct: 0, wrong: 0, current: null, started: false, balloonTimer: null, _queued: null };

// 🎯 목표: 10개 정답 → 결과 화면 (student-games.html 허브와 동일 규칙)
const GAME_GOAL = 10;

/* ════════════════════════════════════════════════════════════════════
   🧠 학습 강화 엔진 (student-games.html 허브와 동일 규칙 — index 탭 이식본)
   · 오답 재노출(간격반복)·콤보·하트·부활·이중부호화·선학습·보스·내용어·섀도잉·최고기록
   · index 탭은 영어 전용 + 라운드 타이머 없음 → _glang()='en', _stopRoundTimer 가드
   ════════════════════════════════════════════════════════════════════ */
function _glang(){ try{ return (typeof GAME_LANG!=='undefined' && GAME_LANG) ? GAME_LANG : 'en'; }catch(_){ return 'en'; } }
function _safeStopTimer(){ try{ if(typeof _stopRoundTimer==='function') _stopRoundTimer(); }catch(_){} }
// ── 숙련도(약점) 저장 ──
function _MKEY(){ return 'mangoi_game_mastery_' + _glang(); }
function _loadMastery(){ try{ return JSON.parse(localStorage.getItem(_MKEY())||'{}')||{}; }catch(_){ return {}; } }
function _saveMastery(m){ try{ localStorage.setItem(_MKEY(), JSON.stringify(m)); }catch(_){} }
var _missQueue = [], _seenItems = {};
function _itemId(kind, item){ try{ return String((item&&item.en)||''); }catch(_){ return ''; } }
function _recordResult(kind, item, correct){
  try{
    if(!item) return; var id=_itemId(kind,item); if(!id) return;
    var m=_loadMastery(), rec=m[id]||{w:0,r:0};
    if(correct){ rec.r++; var qi=_missQueue.findIndex(function(x){return x.id===id;}); if(qi>=0) _missQueue.splice(qi,1); }
    else { rec.w++; if(!_missQueue.some(function(x){return x.id===id;})) _missQueue.push({kind:kind,id:id,item:item}); }
    m[id]=rec; _saveMastery(m);
    _queueProgress(id, (item&&item.ko)||'', correct);   // 🧠 서버 학습기록(교사 약점분석) — 수업중 탭도 동일
  }catch(_){}
}
/* ── 🧠 서버 학습기록 전송(수업 중 게임 탭) — 로그인 학생만, 배치+sendBeacon ── */
var _progressQueue=[];
function _gameUid(){ try{ return (window.MangoiGameVocab && MangoiGameVocab.getUserId())||''; }catch(_){ return ''; } }
function _queueProgress(item, ko, correct){ if(!item||!_gameUid()) return; _progressQueue.push({item:item,ko:ko||'',correct:!!correct}); if(_progressQueue.length>=25) _flushProgress(false); }
function _flushProgress(useBeacon){
  try{ var uid=_gameUid(); if(!uid||!_progressQueue.length) return;
    var body=JSON.stringify({ user_id:uid, lang:_glang(), events:_progressQueue.splice(0,_progressQueue.length) });
    if(useBeacon && navigator.sendBeacon){ navigator.sendBeacon('/api/games/progress', new Blob([body],{type:'application/json'})); }
    else { fetch('/api/games/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:body,keepalive:true}).catch(function(){}); }
  }catch(_){}
}
function _saveShadowScore(item, ko, score){
  try{ var uid=_gameUid(); if(!uid||!item) return;
    fetch('/api/games/shadow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:uid,lang:_glang(),item:item,ko:ko||'',score:Math.round(score*100)}),keepalive:true}).catch(function(){});
  }catch(_){}
}
setInterval(function(){ if(_progressQueue.length) _flushProgress(false); }, 20000);
window.addEventListener('pagehide', function(){ _flushProgress(true); });
var _seededMiss=false;
function _seedMissFromServer(){
  if(_seededMiss) return; var uid=_gameUid(); if(!uid) return; _seededMiss=true;
  fetch('/api/games/weak?user_id='+encodeURIComponent(uid)+'&lang='+_glang()+'&limit=20').then(function(r){return r.ok?r.json():null;}).then(function(d){
    if(!d||!d.ok||!d.weak) return;
    d.weak.forEach(function(w){ var id=w.item; if(!id) return;
      var inW=_GAME_WORDS.find(function(x){return x.en===id;}), inV=_GAME_VOCAB.find(function(x){return x.en===id;});
      if(inW){ if(!_missQueue.some(function(x){return x.id===id&&x.kind==='word';})) _missQueue.push({kind:'word',id:id,item:inW}); }
      else if(inV){ if(!_missQueue.some(function(x){return x.id===id&&x.kind==='sent';})) _missQueue.push({kind:'sent',id:id,item:inV}); }
    });
  }).catch(function(){});
}
setTimeout(_seedMissFromServer, 2000);
function _pickFrom(pool, kind){
  try{ if(!pool||!pool.length) return null;
    var q=_missQueue.filter(function(x){return x.kind===kind;});
    if(q.length && Math.random()<0.45){ var pk=q[Math.floor(Math.random()*q.length)]; return pool.find(function(p){return _itemId(kind,p)===pk.id;})||pk.item; }
  }catch(_){}
  return pool[Math.floor(Math.random()*pool.length)];
}
// 🛡️ 중국어 문장 분절 무결성 보정: words 이어붙인 게 원문 한자와 다르면(글자 누락) 낱글자로 복구.
//   병음·뜻과 안 맞는 깨진 문장 방지. 한자 없는(영어) 문장은 그대로 통과.
function _zhSafeWords(sent){
  try{
    var cjk = String(sent && sent.en || '').match(/[㐀-鿿]/g);
    if(!cjk || !cjk.length) return sent;
    var ws = Array.isArray(sent.words) ? sent.words.map(String) : [];
    // 한자만 뽑아 비교(student-games.html 과 동일) — 구두점 포함 분절(문단 문장 등)도 통과
    var wcjk = (ws.join('').match(/[㐀-鿿]/g) || []).join('');
    if(wcjk !== cjk.join('')) sent.words = cjk;
  }catch(_){}
  return sent;
}
function _nextVocab(){ return _zhSafeWords(_pickFrom(_stageVocab(),'sent')); }
function _nextWord(){ return _pickFrom(_stageWords(),'word'); }
function _pickWords(n){
  var pool=_stageWords(), picks=[], q=_missQueue.filter(function(x){return x.kind==='word';});
  _gameShuffle(q).slice(0,Math.ceil(n/2)).forEach(function(pk){ var f=pool.find(function(p){return _itemId('word',p)===pk.id;})||pk.item; if(f&&f.ko&&f.en&&!picks.some(function(p){return p.en===f.en;})) picks.push(f); });
  _gameShuffle(pool).forEach(function(w){ if(picks.length<n&&!picks.some(function(p){return p.en===w.en;})) picks.push(w); });
  return picks.slice(0,n);
}
// ── 콤보 ──
var _combo=0, _comboBest=0;
function _comboMult(){ return _combo>=6?3:_combo>=3?2:1; }
function _bumpCombo(){
  _combo++; if(_combo>_comboBest) _comboBest=_combo;
  var el=document.getElementById('game-combo');
  if(el){ if(_combo>=2){ el.style.display=''; el.textContent='🔥'+_combo+(_comboMult()>1?(' ×'+_comboMult()):''); } else el.style.display='none'; }
  if(_combo>=3){ _comboPopup(_combo); _comboSound(_combo); }
  return _comboMult();
}
function _resetCombo(){ _combo=0; var el=document.getElementById('game-combo'); if(el) el.style.display='none'; }
function _comboSound(n){
  try{ var AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
    if(!window._gameAC) window._gameAC=new AC(); var ac=window._gameAC; if(ac.state==='suspended'){ try{ac.resume();}catch(_){} }
    var t=ac.currentTime, base=440+Math.min(n,10)*55, o=ac.createOscillator(), g=ac.createGain(); o.type='triangle';
    o.frequency.setValueAtTime(base,t); o.frequency.exponentialRampToValueAtTime(base*1.5,t+0.12);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.45,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+0.22);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t+0.24);
  }catch(_){}
}
function _comboPopup(n){
  try{ var area=document.getElementById('game-area'); if(!area) return;
    if(getComputedStyle(area).position==='static') area.style.position='relative';
    var el=document.createElement('div'); el.textContent='🔥 '+n+' COMBO'+(_comboMult()>1?(' ×'+_comboMult()):'');
    el.style.cssText='position:absolute;top:15%;left:50%;transform:translate(-50%,-50%) scale(.5);z-index:40;font-size:clamp(22px,5vmin,46px);font-weight:900;font-style:italic;color:#fff;text-shadow:0 0 14px #fb7185,0 3px 8px rgba(0,0,0,.6);-webkit-text-stroke:1.5px #be123c;pointer-events:none;transition:transform .18s,opacity .5s';
    area.appendChild(el); requestAnimationFrame(function(){ el.style.transform='translate(-50%,-50%) scale(1.12)'; });
    setTimeout(function(){ el.style.opacity='0'; el.style.transform='translate(-50%,-95%) scale(1)'; },480);
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); },1050);
  }catch(_){}
}
// ── 하트 ──
var _HEARTS_MAX=3, _hearts=_HEARTS_MAX;
function _renderHearts(){ var el=document.getElementById('game-hearts'); if(!el) return; var s=''; for(var i=0;i<_HEARTS_MAX;i++) s+=(i<_hearts?'❤️':'🤍'); el.textContent=s; }
function _loseHeart(){ _hearts=Math.max(0,_hearts-1); _renderHearts(); return _hearts<=0; }
// ── 정답/오답 공용 ──
/* 🎉 재미 요소 — 색종이 폭죽 + 🥭 망고 마스코트 반응 (수업중 게임탭도 동일) */
(function(){
  if(document.getElementById('_funfx-style')) return;
  var st=document.createElement('style'); st.id='_funfx-style';
  st.textContent='@keyframes _confFall{0%{transform:translateY(-10px) rotate(0);opacity:1}100%{transform:translateY(340px) rotate(720deg);opacity:0}}@keyframes _mascotPop{0%{transform:translateY(60px) scale(.4);opacity:0}18%{transform:translateY(-10px) scale(1.12);opacity:1}32%{transform:translateY(0) scale(1)}82%{transform:translateY(0) scale(1);opacity:1}100%{transform:translateY(30px) scale(.8);opacity:0}}@keyframes _mascotShake{0%,100%{transform:rotate(0)}25%{transform:rotate(-12deg)}75%{transform:rotate(12deg)}}@keyframes _bubblePop{0%{transform:scale(.3);opacity:0}30%{transform:scale(1.08);opacity:1}85%{opacity:1}100%{opacity:0}}#_mascot{position:fixed;right:14px;bottom:14px;z-index:60;pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:4px}#_mascot .face{filter:drop-shadow(0 5px 10px rgba(0,0,0,.5))}#_mascot .face img{width:clamp(64px,13vmin,104px);height:auto;display:block}#_mascot .bubble{background:#fff;color:#0b1b3a;font-weight:800;font-size:clamp(13px,2.4vmin,17px);padding:6px 14px;border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,.35);white-space:nowrap;order:-1;position:relative}#_mascot .bubble::after{content:"";position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);border:7px solid transparent;border-top-color:#fff;border-bottom:0}';
  document.head.appendChild(st);
})();
function _confettiBurst(n, big){
  try{ var area=document.getElementById('game-area'); if(!area) return;
    if(getComputedStyle(area).position==='static') area.style.position='relative';
    var W=area.clientWidth||360, colors=['#f43f5e','#fbbf24','#34d399','#38bdf8','#a855f7','#f97316','#ec4899'], bits=['🎉','⭐','✨','🎊','💫'];
    for(var i=0;i<n;i++){ (function(k){ var useEmoji=big&&(k%4===0), el=document.createElement('div'), left=Math.random()*W, dur=1100+Math.random()*900, delay=Math.random()*180;
      if(useEmoji){ el.textContent=bits[k%bits.length]; el.style.cssText='position:absolute;top:-10px;left:'+left+'px;font-size:'+(16+Math.random()*14)+'px;z-index:50;pointer-events:none'; }
      else { var sz=7+Math.random()*8; el.style.cssText='position:absolute;top:-10px;left:'+left+'px;width:'+sz+'px;height:'+(sz*0.6)+'px;background:'+colors[k%colors.length]+';border-radius:2px;z-index:50;pointer-events:none'; }
      el.style.animation='_confFall '+dur+'ms cubic-bezier(.25,.7,.4,1) '+delay+'ms forwards'; area.appendChild(el);
      setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, dur+delay+120); })(i); }
  }catch(_){}
}
var _MASCOT_MSG={ good:['좋아요! 👍','잘했어! 😄','멋져요! ✨','정답! 🎯'], combo:['콤보 대단해! 🔥','불타오른다! 🔥','연속 정답! ⚡','천재인데? 🌟'], boss:['보스 격파! 👊','이겼다! 🏆','역시 최고! 💪'], win:['다 깼어요! 🎉','완벽해요! 🏅','너무 잘했어! 🎊'], wrong:['괜찮아, 다시! 💪','아쉽다! 힘내요 🙂','거의 다 왔어! 👊'] };
var _mascotTimer=null;
function _mascot(kind){
  try{ var msgs=_MASCOT_MSG[kind]||_MASCOT_MSG.good, msg=msgs[Math.floor(Math.random()*msgs.length)];
    var old=document.getElementById('_mascot'); if(old&&old.parentNode) old.parentNode.removeChild(old);
    var box=document.createElement('div'); box.id='_mascot'; var dur=(kind==='win'?2600:kind==='boss'?2200:1600);
    box.innerHTML='<div class="bubble" style="animation:_bubblePop '+dur+'ms ease forwards">'+msg+'</div><div class="face" style="animation:'+(kind==='wrong'?'_mascotShake .5s ease 2':'_mascotShake .4s ease 3')+'"><img src="/img/mango-char.png" alt="망고아이"></div>';
    box.style.animation='_mascotPop '+dur+'ms ease forwards'; document.body.appendChild(box);
    if(_mascotTimer) clearTimeout(_mascotTimer); _mascotTimer=setTimeout(function(){ if(box.parentNode) box.parentNode.removeChild(box); }, dur+80);
  }catch(_){}
}
function _celebrate(kind){
  if(kind==='win'){ _confettiBurst(64,true); _mascot('win'); }
  else if(kind==='boss'){ _confettiBurst(44,true); _mascot('boss'); }
  else if(kind==='combo'){ _confettiBurst(22,false); _mascot('combo'); }
  else if(kind==='wrong'){ _mascot('wrong'); }
  else { _confettiBurst(10,false); if(Math.random()<0.5) _mascot('good'); }
}
function _onCorrect(kind, item, base){
  _recordResult(kind,item,true); var mult=_bumpCombo(), gain=base*mult, boss=false;
  if(_gameState.boss){ boss=true; gain*=2; _gameState.boss=false; }
  _gameState.score+=gain; _gameState.correct++; _renderHearts();
  _celebrate(boss?'boss':(_combo>=3?'combo':'good'));   // 🎉 축하 연출
  return { gain:gain, mult:mult, boss:boss };
}
function _onWrong(kind, item, oncePerRound){
  _recordResult(kind,item,false); _resetCombo(); _gameState.wrong++;
  if(oncePerRound && _gameState.current){ if(_gameState.current._penalized){ try{_celebrate('wrong');}catch(_){} return false; } _gameState.current._penalized=true; }
  try{ _celebrate('wrong'); }catch(_){}
  var dead=_loseHeart(); if(dead){ setTimeout(_reviveChance,700); return true; } return false;
}
// ── 보스 ──
function _bossVocab(){
  var pool=_GAME_VOCAB.filter(function(v){return v.words&&v.words.length>=3;}); if(!pool.length) pool=_GAME_VOCAB.slice();
  pool=pool.slice().sort(function(a,b){return (b.words?b.words.length:0)-(a.words?a.words.length:0);});
  var top=pool.slice(0,Math.min(3,pool.length)); return top[Math.floor(Math.random()*top.length)]||_nextVocab();
}
function _bossBannerHtml(){ return '<div style="text-align:center;margin-bottom:12px"><span style="display:inline-block;background:linear-gradient(135deg,#dc2626,#7f1d1d);color:#fff;font-weight:800;font-size:clamp(14px,2.2vmin,18px);padding:7px 20px;border-radius:999px;box-shadow:0 0 22px rgba(220,38,38,.7),0 0 0 2px rgba(248,113,113,.5) inset">👹 보스 문제! · 점수 2배 · 집중!</span></div>'; }
// ── 이모지 이중부호화 ──
var _EMOJI = { 'apple':'🍎','banana':'🍌','dog':'🐶','cat':'🐱','book':'📖','sun':'☀️','moon':'🌙','star':'⭐','water':'💧','pizza':'🍕','soccer':'⚽','school':'🏫','flower':'🌸','fruit':'🍑','mango':'🥭','car':'🚗','fish':'🐟','bird':'🐦','tree':'🌳','house':'🏠','friend':'🧑‍🤝‍🧑','friends':'🧑‍🤝‍🧑','rain':'🌧️','snow':'❄️','milk':'🥛','egg':'🥚','rice':'🍚','ball':'⚽','love':'❤️','happy':'😊','run':'🏃','eat':'🍽️','pig':'🐷','cake':'🍰','sea':'🌊','mountain':'⛰️' };
function _emojiFor(item, kind){
  try{ if(!item) return '';
    if(kind==='word'){ var k=String(item.en||'').toLowerCase(); return _EMOJI[item.en]||_EMOJI[k]||''; }
    var ws=item.words||[]; for(var i=0;i<ws.length;i++){ var e=_EMOJI[ws[i]]||_EMOJI[String(ws[i]).toLowerCase()]; if(e) return e; }
  }catch(_){} return '';
}
// ── 내용어 vs 기능어 ──
var _EN_FUNC=['the','is','are','am','was','were','be','to','on','in','at','of','a','an','and','or','it','he','she','we','they','i','you','my','your','this','that','with','for'];
function _isContentWord(w){ try{ var lw=String(w).toLowerCase(); return String(w).length>2 && _EN_FUNC.indexOf(lw)<0; }catch(_){ return true; } }
// ── 선학습 플래시 ──
function _isNew(item, kind){ try{ if(!item) return false; var id=_itemId(kind,item); if(_seenItems[id]) return false; var rec=_loadMastery()[id]; return !rec||(rec.r||0)<1; }catch(_){ return false; } }
function _preteachThen(item, kind, cb){
  try{
    if(!item || !_isNew(item,kind)){ cb(); return; }
    _seenItems[_itemId(kind,item)]=1; var area=document.getElementById('game-area'); if(!area){ cb(); return; }
    var em=_emojiFor(item,kind), sub=item.ko?'<div style="font-size:18px;color:#e2e8f0;margin-top:10px">'+item.ko+'</div>':'';
    area.innerHTML='<div style="text-align:center;max-width:600px;margin:auto;padding:24px">'
      +'<div style="display:inline-block;background:rgba(56,189,248,.14);border:1px solid rgba(56,189,248,.5);color:#7dd3fc;font-size:13px;font-weight:700;padding:4px 14px;border-radius:999px;margin-bottom:16px">✨ 새 '+(kind==='sent'?'문장':'단어')+' 미리보기</div>'
      +(em?'<div style="font-size:54px;margin-bottom:8px">'+em+'</div>':'')
      +'<div style="font-size:clamp(24px,4vmin,44px);font-weight:800;color:#fbbf24">'+item.en+'</div>'+sub
      +'<div style="font-size:12px;color:#64748b;margin-top:16px">🔊 듣고 기억해요 · 잠시 후 시작!</div></div>';
    try{ window.gameSpeak && gameSpeak(item.en); }catch(_){}
    setTimeout(cb, 1800);
  }catch(_){ cb(); }
}
// ── 부활 & 게임오버 & 복습 ──
function _say(enc){ try{ window.gameSpeak && gameSpeak(decodeURIComponent(enc)); }catch(_){} }
function _reviveChance(){
  _safeStopTimer(); if(_gameState.balloonTimer){ clearInterval(_gameState.balloonTimer); _gameState.balloonTimer=null; }
  // 부활 단어: ①이번 판에 틀린 '단어' 우선 → ②없으면(문장게임 등) 스테이지 단어 풀에서 무작위(+직전 제외).
  //   예전엔 후보 없을 때 정렬 풀 [0](항상 같은 단어=풍경)만 나오던 버그 → 무작위+직전 제외로 수정.
  var missed=_missQueue.filter(function(x){return x.kind==='word'&&x.item&&x.item.ko;}).map(function(x){return x.item;});
  var pool=missed.length?missed:_stageWords().filter(function(w){return w.ko;});
  if(!pool.length) pool=_GAME_WORDS.filter(function(w){return w.ko;});
  if(pool.length>1 && window._reviveLast){ var _f=pool.filter(function(w){return w.en!==window._reviveLast;}); if(_f.length) pool=_f; }
  var target=pool.length?pool[Math.floor(Math.random()*pool.length)]:null;
  if(!target){ _hearts=1; _renderHearts(); gameNextRound(); return; }
  window._reviveLast=target.en; window._reviveTarget=target;
  var wrongs=_gameShuffle(_GAME_WORDS.filter(function(w){return w.en!==target.en&&w.ko;})).slice(0,3), opts=_gameShuffle([target].concat(wrongs)), em=_emojiFor(target,'word');
  try{ window.gameSpeak && gameSpeak(target.en); }catch(_){}
  var html='<div style="text-align:center;width:100%;max-width:860px;margin:0 auto;padding:clamp(16px,3vw,40px)">'
    +'<div style="font-size:clamp(56px,10vw,104px);line-height:1;margin-bottom:8px">💗</div><div style="font-size:clamp(30px,5.5vw,54px);font-weight:800;color:#fb7185;margin-bottom:8px">부활 찬스!</div>'
    +'<div style="font-size:clamp(15px,2.6vw,24px);color:#94a3b8;margin-bottom:clamp(18px,3vw,28px)">이 단어의 뜻을 맞히면 하트가 부활해요</div>'
    +'<div style="font-size:clamp(44px,9vw,88px);line-height:1.1;font-weight:800;color:#fbbf24;margin-bottom:clamp(18px,3vw,26px)">'+(em?em+' ':'')+target.en+'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:clamp(12px,2vw,20px);max-width:680px;margin:0 auto">';
  opts.forEach(function(o){ html+='<button onclick="_reviveAnswer(\''+encodeURIComponent(o.en)+'\')" style="padding:clamp(20px,3vw,30px) clamp(12px,2vw,20px);background:linear-gradient(135deg,#f43f5e,#be123c);color:#fff;border:0;border-radius:14px;font-size:clamp(19px,3vw,28px);font-weight:700;cursor:pointer">'+o.ko+'</button>'; });
  html+='</div></div>'; var area=document.getElementById('game-area'); if(area) area.innerHTML=html;
}
function _reviveAnswer(enc){
  var picked=decodeURIComponent(enc), t=window._reviveTarget||{}, fb=document.getElementById('game-feedback');
  if(picked===t.en){ _hearts=1; _renderHearts(); _recordResult('word',t,true); if(fb) fb.innerHTML='<span style="color:#10b981">💗 부활! 하트 회복</span>'; try{ window.gameSpeak && gameSpeak(t.en); }catch(_){} setTimeout(gameNextRound,900); }
  else { _gameOver(); }
}
function _reviewPanelHtml(){
  try{
    var seen={}, items=[];
    _missQueue.forEach(function(x){ if(x.kind==='word'&&x.item&&!seen[x.item.en]){ seen[x.item.en]=1; items.push(x.item); } });
    _missQueue.forEach(function(x){ if(x.kind==='sent'&&x.item&&!seen[x.item.en]){ seen[x.item.en]=1; items.push({en:x.item.en,ko:x.item.ko||'',_sent:true}); } });
    if(!items.length) return '';
    var rows=items.slice(0,6).map(function(w){ var em=w._sent?'📝':(_emojiFor(w,'word')||'🔤');
      return '<div style="display:flex;align-items:center;gap:10px;background:rgba(15,23,42,.6);border:1px solid #334155;border-radius:10px;padding:8px 12px;margin:5px 0">'
        +'<button onclick="_say(\''+encodeURIComponent(w.en)+'\')" style="background:rgba(16,185,129,.2);border:1px solid rgba(16,185,129,.5);color:#86efac;border-radius:8px;padding:6px 11px;cursor:pointer;font-size:16px">🔊</button>'
        +'<div style="text-align:left;flex:1"><div style="font-weight:700;color:#f1f5f9">'+em+' '+w.en+'</div>'+(w.ko?'<div style="font-size:12px;color:#94a3b8">'+w.ko+'</div>':'')+'</div></div>'; }).join('');
    return '<div style="margin-top:12px;text-align:left"><div style="font-size:13px;color:#fbbf24;font-weight:700;margin-bottom:6px;text-align:center">📚 오늘 복습할 항목 (🔊 눌러 다시 들어요)</div>'+rows+'</div>';
  }catch(_){ return ''; }
}
function _gameOver(){
  _safeStopTimer(); if(_gameState.balloonTimer){ clearInterval(_gameState.balloonTimer); _gameState.balloonTimer=null; } try{ _flushProgress(false); }catch(_){} _gameState.started=false;
  var tot=_gameState.correct+_gameState.wrong, acc=tot>0?Math.round(100*_gameState.correct/tot):0, area=document.getElementById('game-area');
  if(area) area.innerHTML='<div style="text-align:center;max-width:560px;margin:0 auto;padding:20px">'
    +'<div style="font-size:52px;margin-bottom:6px">💪</div><div style="font-size:26px;font-weight:800;color:#fbbf24;margin-bottom:4px">아깝다! 다시 도전해요</div>'
    +'<div style="font-size:14px;color:#94a3b8;margin-bottom:6px">정답 '+_gameState.correct+'개 · 점수 '+_gameState.score+' · 정확도 '+acc+'% · 최고 콤보 🔥'+_comboBest+'</div>'
    +_reviewPanelHtml()
    +'<div style="margin-top:18px"><button onclick="gameInit()" style="padding:14px 28px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;border-radius:12px;font-size:17px;font-weight:800;cursor:pointer">🔄 다시 도전</button></div></div>';
}
// ── 🎤 따라 말하기(섀도잉) ──
/* 🗣 (2026-07-23) 따라 말하기 채점 — 업계 표준(Azure·Speechace)처럼 기준 문장과 **단어 단위로 정렬**해
   누락·치환을 구분하는 js/mangoi-speak-score.js 를 쓴다. 예전 방식(아래 _shadowScore)은 "목표 단어가
   몇 개 들렸나"라서 "I have a dog" 에 "I have a cat" 이라고 해도 통과했다.
   모듈이 아직 안 실려 있으면 예전 방식으로 조용히 되돌아간다. */
function _shadowGrade(said, target){
  try{
    if(window.MangoiScore){
      var g = MangoiScore.grade(said, target);
      return { sc: g.accuracy, pass: g.pass, tip: g.tip || '' };
    }
  }catch(_){}
  var s = _shadowScore(said, target);
  return { sc: s, pass: s >= 0.6, tip: '' };
}
function _shadowScore(said, target){
  try{ var norm=function(s){ return String(s).toLowerCase().replace(/[.,!?]/g,'').trim(); };
    var tw=norm(target).split(/\s+/).filter(Boolean), sw=norm(said).split(/\s+/); if(!tw.length) return 0;
    var h=0; tw.forEach(function(w){ if(sw.indexOf(w)>=0) h++; }); return h/tw.length;
  }catch(_){ return 0; }
}
/* 🎤 (2026-07-23) 음성인식 미지원 환경용 따라 말하기 채점 — 녹음 → 서버 Whisper 전사 → 같은 기준으로 채점.
   앱 WebView·카카오 인앱 브라우저·구형 iOS 에는 SpeechRecognition 이 아예 없어서, 수업 중 발음 채점을
   전혀 못 받고 있었다. 녹음 길이는 우리가 통제하므로(말 시작까지 대기 → 조용해지면 종료) 잘림도 없다. */
function _shadowViaWhisper(text, fb){
  var giveUp=function(msg){
    if(fb) fb.innerHTML='<span style="color:#38bdf8">'+(msg||'🔊 잘 듣고 소리내어 따라 말해보세요!')+'</span>';
    _gameState._advTimer=setTimeout(gameNextRound,2400);
  };
  if(!window.MangoiVoice || !MangoiVoice.supported()){ giveUp(); return; }
  MangoiVoice.record({
    firstMs:9000, silenceMs:2200, maxMs:15000,
    onState:function(s){
      if(!fb) return;
      if(s==='waiting')       fb.innerHTML='<span style="color:#fbbf24">🎤 따라 말해보세요… (천천히 해도 괜찮아요)</span>';
      else if(s==='speaking') fb.innerHTML='<span style="color:#fbbf24">🎤 듣고 있어요…</span>';
      else if(s==='thinking') fb.innerHTML='<span style="color:#94a3b8">🎧 발음 확인 중…</span>';
    }
  }).then(function(said){
    if(!said){ giveUp('🎤 소리가 잘 안 들렸어요 — 다음 문제로…'); return; }
    var g=_shadowGrade(said,text), sc=g.sc;
    if(fb) fb.innerHTML=g.pass
      ? '<span style="color:#10b981">👍 발음 좋아요! ('+Math.round(sc*100)+'점)</span>'
      : '<span style="color:#f59e0b">🔁 거의 됐어요!'+(g.tip?' <b>'+g.tip+'</b>':'')+' 🔊 다시 듣고 도전</span>';
    try{ var _s=_gameState.current&&_gameState.current.sentence; _saveShadowScore(text,(_s&&_s.ko)||'',sc); }catch(_){}   // 🎤 발음점수 서버 저장
    _gameState._advTimer=setTimeout(gameNextRound,1700);
  }).catch(function(){ giveUp(); });
}
function gameShadow(enc){
  var text=decodeURIComponent(enc), fb=document.getElementById('game-feedback');
  if(_gameState._advTimer){ clearTimeout(_gameState._advTimer); _gameState._advTimer=null; }
  /* 🔇 (2026-07-23) 예전에는 낭독 시작 850ms 뒤에 무조건 마이크를 켰다.
     → AI가 정답 문장을 읽는 도중에 마이크가 열려, 음성인식이 **AI 목소리를 학생 발화로**
       받아 적었다(말도 안 했는데 통과되거나, 학생 말과 뒤섞임).
     이제 낭독이 끝나면 시작하고, 낭독 종료 신호가 유실될 때를 대비해 상한도 둔다. */
  var _shadowGo=null, _shadowFired=false;
  var _afterSpeak=function(){ if(_shadowFired) return; _shadowFired=true;
    try{ if(window.MangoiTTS && MangoiTTS.stop) MangoiTTS.stop(); }catch(_){}   // 혹시 남은 낭독 정지
    try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(_){}
    if(_shadowGo) _shadowGo(); };
  try{ window.gameSpeak && gameSpeak(text, function(){ setTimeout(_afterSpeak, 250); }); }catch(_){}
  setTimeout(_afterSpeak, Math.max(3000, String(text).length*120));   // 낭독 종료 신호 유실 대비 상한
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  // 🎤 (2026-07-23) 음성인식이 없는 환경(앱 WebView·카카오 인앱 브라우저·구형 iOS)에서도
  //    발음 채점을 받게 한다 — 녹음해서 서버 Whisper 로 전사(학습 게임 허브와 동일 방식).
  //    예전에는 "잘 듣고 따라 말해보세요"만 띄우고 넘어가 수업 중 채점이 아예 없었다.
  if(!SR){ _shadowGo=function(){ _shadowViaWhisper(text, fb); }; return; }
  _shadowGo=function(){
    try{ var rec=new SR(); rec.lang=(_glang()==='zh'?'zh-CN':'en-US'); rec.interimResults=true; rec.maxAlternatives=3; rec.continuous=true;
      // 🎤 말 중간에 숨 쉬어도 안 끊기게: 4.5초 강제 종료를 없애고, "말이 끝나고 조용해지면" 우리가 종료.
      //    발음이 충분히 맞으면 즉시 통과, 아니면 침묵(SILENCE_MS)까지 기다렸다가 마지막 인식으로 채점.
      if(fb) fb.innerHTML='<span style="color:#fbbf24">🎤 따라 말해보세요… (듣는 중)</span>'; var done=false, said='', _base='', _sil=null;
      var SILENCE_MS=2500;                 // 마지막 말 이후 이 시간(ms) 조용하면 종료 → 긴 문장도 끝까지 말할 시간 확보
      function arm(){ if(_sil) clearTimeout(_sil); _sil=setTimeout(function(){ try{ rec.stop(); }catch(_){} }, SILENCE_MS); }
      function evaluate(){
        if(done) return; done=true; if(_sil) clearTimeout(_sil);
        var g=_shadowGrade(said,text), sc=g.sc;
        if(fb) fb.innerHTML=g.pass
          ? '<span style="color:#10b981">👍 발음 좋아요! ('+Math.round(sc*100)+'점)</span>'
          : '<span style="color:#f59e0b">🔁 거의 됐어요!'+(g.tip?' <b>'+g.tip+'</b>':'')+' 🔊 다시 듣고 도전</span>';
        try{ var _s=_gameState.current&&_gameState.current.sentence; _saveShadowScore(text,(_s&&_s.ko)||'',sc); }catch(_){}   // 🎤 발음점수 서버 저장
        _gameState._advTimer=setTimeout(gameNextRound,1700);
      }
      rec.onstart=function(){ arm(); };
      rec.onresult=function(e){
        if(done) return;
        var _s=''; for(var i=0;i<e.results.length;i++) _s+=(e.results[i][0].transcript||'')+' ';
        // 브라우저가 세션을 끊고 다시 시작했으면 앞 세션에서 들은 것(_base) 뒤에 잇는다
        said=(_base? _base+' ' : '')+_s;
        if(_shadowGrade(said,text).pass){ evaluate(); try{ rec.stop(); }catch(_){} return; }   // 충분히 맞음 → 즉시 통과
        if(fb) fb.innerHTML='<span style="color:#fbbf24">🎤 …(듣는 중) "'+said.trim()+'"</span>';
        arm();                             // 말할 때마다 종료 타이머 리셋
      };
      rec.onerror=function(){ if(_sil) clearTimeout(_sil); if(!done){ done=true; if(fb) fb.innerHTML='<span style="color:#94a3b8">🎤 마이크를 못 썼어요 — 다음 문제로…</span>'; _gameState._advTimer=setTimeout(gameNextRound,1500); } };
      rec.onend=function(){ if(_sil) clearTimeout(_sil); if(!done){ if(said.trim()) evaluate(); else if(!_gameState._advTimer){ _gameState._advTimer=setTimeout(gameNextRound,1500); } } };
      /* 🎤 (2026-07-23) 안드로이드 크롬은 continuous 를 무시하고 첫 확정 결과 뒤 세션을 스스로 닫는다.
         그 종료를 "말을 마쳤다"로 보고 채점하면 조각("I like")으로 채점된다.
         → 우리가 stop() 을 안 불렀으면 지금까지 들은 것을 유지한 채 다시 듣는다. */
      try{ if(typeof MangoiSTT!=='undefined') MangoiSTT.harden(rec, {
        isDone: function(){ return done; },
        beforeRestart: function(){ _base = said.trim(); },
        onRestart: arm
      }); }catch(_h){}
      rec.start();
    }catch(_){ _gameState._advTimer=setTimeout(gameNextRound,1700); }
  };
  // 음성인식 미지원 브라우저는 위 폴백에서 이미 처리됨
}

// 🎢 난이도(스테이지) 1~7 — 10문제 클리어 시 자동 상승 (허브와 동일 규칙, localStorage 공유)
// 단계가 오를수록: 풍선 낙하 빨라짐(6~7단계는 훨씬 빠름) + 더 길고 어려운 문장/단어 구간에서 출제
const GAME_STAGE_MAX = 7;
const GAME_STAGE_MULT = { 1:0.5, 2:0.75, 3:1, 4:1.4, 5:1.9, 6:2.5, 7:3.2 };
var GAME_STAGE = (function(){ try{ var v=parseInt(localStorage.getItem('mangoi_game_stage'),10); return (v>=1&&v<=GAME_STAGE_MAX)?v:1; }catch(_){ return 1; } })();
function setGameStage(st){
  if(!(st>=1&&st<=GAME_STAGE_MAX)) st=1;
  GAME_STAGE = st;
  try{ localStorage.setItem('mangoi_game_stage', String(st)); }catch(_){}
  var el=document.getElementById('game-stage'); if(el) el.textContent = st;
}
function _stagePool(arr, key, minN){
  var sorted = arr.slice().sort(function(a,b){ return key(a)-key(b); });
  var n = sorted.length, lo = Math.floor((GAME_STAGE-1)/GAME_STAGE_MAX*n), hi = Math.ceil(GAME_STAGE/GAME_STAGE_MAX*n);
  var need = Math.min(minN||4, n);
  while(hi-lo < need){ if(lo>0) lo--; if(hi<n) hi++; }
  return sorted.slice(lo,hi);
}
function _stageVocab(){ return _stagePool(_GAME_VOCAB, function(v){ return (v.words?v.words.length:0)*100 + v.en.length; }, 3); }
function _stageWords(){ return _stagePool(_GAME_WORDS, function(w){ return w.en.length*10 + ((w.ko&&w.ko.length)||0); }, 6); }
function _gameCheckGoal() {
  if (_gameState.correct < GAME_GOAL) return false;
  setTimeout(_gameShowResult, 1100);
  return true;
}
function _gameShowResult() {
  if (_gameState.balloonTimer) { clearInterval(_gameState.balloonTimer); _gameState.balloonTimer = null; }
  try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(_){}
  try{ _flushProgress(false); }catch(_){}   // 🧠 결과 화면에서 학습기록 서버 전송
  try{ _celebrate('win'); setTimeout(function(){ _confettiBurst(50,true); }, 500); }catch(_){}   // 🎉 클리어 대축하
  const tot = _gameState.correct + _gameState.wrong;
  const acc = tot > 0 ? Math.round(100 * _gameState.correct / tot) : 100;
  const stars = acc >= 90 ? '⭐⭐⭐' : acc >= 70 ? '⭐⭐' : '⭐';
  // 🏅 개인 최고기록
  let _bestBadge = '';
  try{
    const bk = 'mangoi_game_best_' + _glang() + '_' + _gameState.mode + '_' + GAME_STAGE;
    const prev = parseInt(localStorage.getItem(bk) || '0', 10) || 0;
    if(_gameState.score > prev){ localStorage.setItem(bk, String(_gameState.score)); _bestBadge = '<div style="margin-top:8px;font-size:16px;color:#fbbf24;font-weight:800">🎉 신기록 달성! (이전 최고 ' + prev + '점)</div>'; }
    else { _bestBadge = '<div style="margin-top:8px;font-size:13px;color:#94a3b8">🏅 이 단계 최고기록 ' + prev + '점</div>'; }
  }catch(_){}
  const _comboBadge = (_comboBest>=3 ? '<div style="margin-top:8px;font-size:15px;color:#fb7185;font-weight:800">🔥 최고 콤보 ' + _comboBest + '연속!</div>' : '');
  // 🎢 다음 난이도 도전 버튼 — 최고 단계(5)면 처음부터
  const nextStageBtn = GAME_STAGE < GAME_STAGE_MAX
    ? '<button onclick="setGameStage(' + (GAME_STAGE+1) + ');gameInit()" style="margin-top:20px;padding:12px 26px;background:linear-gradient(135deg,#f43f5e,#be123c);color:#fff;border:0;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(244,63,94,0.45)">🔥 다음 난이도 ⭐' + (GAME_STAGE+1) + ' 도전!</button>'
    : '<button onclick="setGameStage(1);gameInit()" style="margin-top:20px;padding:12px 26px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border:0;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(139,92,246,0.45)">👑 전 단계 클리어! ⭐1부터 다시</button>';
  const area = document.getElementById('game-area');
  if (area) area.innerHTML =
    '<div style="text-align:center;max-width:520px;margin:0 auto;padding:20px">' +
      '<div style="font-size:52px;margin-bottom:6px">🏆</div>' +
      '<div style="font-size:26px;font-weight:800;color:#fbbf24;margin-bottom:4px">난이도 ⭐' + GAME_STAGE + ' 클리어!</div>' +
      '<div style="font-size:22px;margin-bottom:14px">' + stars + '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
        '<div style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.35);border-radius:12px;padding:10px 18px"><div style="font-size:12px;color:#94a3b8">점수</div><div style="font-size:22px;font-weight:800;color:#fbbf24">' + _gameState.score + '</div></div>' +
        '<div style="background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);border-radius:12px;padding:10px 18px"><div style="font-size:12px;color:#94a3b8">정답</div><div style="font-size:22px;font-weight:800;color:#10b981">' + _gameState.correct + '</div></div>' +
        '<div style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:12px;padding:10px 18px"><div style="font-size:12px;color:#94a3b8">오답</div><div style="font-size:22px;font-weight:800;color:#ef4444">' + _gameState.wrong + '</div></div>' +
        '<div style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);border-radius:12px;padding:10px 18px"><div style="font-size:12px;color:#94a3b8">정확도</div><div style="font-size:22px;font-weight:800;color:#38bdf8">' + acc + '%</div></div>' +
      '</div>' + _comboBadge + _bestBadge + _reviewPanelHtml() +
      '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' + nextStageBtn +
      '<button onclick="gameInit()" style="margin-top:20px;padding:12px 26px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 4px 14px rgba(16,185,129,0.4)">🔄 같은 단계 다시</button></div>' +
    '</div>';
  const fb = document.getElementById('game-feedback');
  if (fb) fb.innerHTML = '<span style="color:#fbbf24">🏆 ⭐' + GAME_STAGE + ' 단계 달성!</span>';
}

// 📚 로그인 학생의 교재/레벨 맞춤 어휘로 교체 (game-vocab.js 동적 로드 — 실패/비로그인 시 기본 어휘 유지)
(function(){
  try{
    // 🔊 원어민 TTS 모듈도 함께 로드 (클라우드 Deepgram 음성)
    var t = document.createElement('script'); t.src = '/js/game-tts.js'; t.async = true;
    document.head.appendChild(t);
    var s = document.createElement('script'); s.src = '/js/game-vocab.js'; s.async = true;
    s.onload = function(){
      if(!window.MangoiGameVocab) return;
      MangoiGameVocab.load().then(function(d){
        if(!d) return;
        window._STUDENT_VOCAB = d;
        if(d.sentences.length >= 3){ _GAME_VOCAB.length = 0; d.sentences.forEach(function(x){ _GAME_VOCAB.push(x); }); }
        if(d.words.length >= 6){ _GAME_WORDS.length = 0; d.words.forEach(function(x){ _GAME_WORDS.push(x); }); }
      });
    };
    document.head.appendChild(s);
  }catch(_){}
})();

// 🔤 영어 어휘 은행(en_vocab)으로 기본 어휘 강화 — 학생 교재 데이터 없을 때 폴백을 풍부하게
(function(){
  try{
    fetch('/api/games/en-vocab').then(function(r){ return r.ok?r.json():null; }).then(function(d){
      if(!d || !d.ok) return;
      if(window._STUDENT_VOCAB && _STUDENT_VOCAB.sentences && _STUDENT_VOCAB.sentences.length>=3) return;   // 학생 교재 어휘가 있으면 유지
      (d.sentences||[]).forEach(function(s){ if(s&&s.en&&s.words&&s.words.length>=2 && !_GAME_VOCAB.some(function(v){return v.en===s.en;})) _GAME_VOCAB.push(s); });
      (d.words||[]).forEach(function(w){ if(w&&w.en&&w.ko && !_GAME_WORDS.some(function(x){return x.en===w.en;})) _GAME_WORDS.push(w); });
    }).catch(function(){});
  }catch(_){}
})();

// 🥭 Phase 48 — 수업 중(2명 이상) 인지 체크 → 게임 차단
function _gameIsClassActive() {
  const el = document.getElementById('vc-user-count');
  const count = el ? parseInt(el.textContent, 10) || 0 : 0;
  // 2명 이상 = 나 + 교사 (또는 다른 참가자) 가 있음
  return count >= 2;
}

// 🧑‍🎓 (2026-08-12 Melca 피드백) AI 웜업 — 수업 중 «학생 단독» 사용 차단.
//   강사 제안: "게임과 같은 제한을 — 수업 전이나 후에 이용해 주세요 경고".
//   게임(Phase 48)과 같은 판정(참가자 2명 이상 = 수업 중)을 쓰되,
//   강사가 tab-sync 로 열어 준 «강사 주도 웜업» 은 허용한다 — 웜업은 원래
//   수업 중 강사가 학생 입 풀기용으로 쓰는 도구이기도 하기 때문(탭바 진입 시 room 연동).
function _warmupStudentBlocked() {
  if (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin') return false;
  if (window.__vcWarmupTeacherLed) return false;          // 강사가 열어 준 것 — 허용
  if (!document.body.classList.contains('vc-in-call')) return false;  // 수업 화면 밖(/warmup.html 단독)은 별개
  return _gameIsClassActive();
}

function _warmupRenderBlocked() {
  const panel = document.getElementById('tab-warmup');
  if (!panel) return;
  const wf = document.getElementById('vc-warmup-frame');
  if (wf) wf.style.display = 'none';
  let bl = document.getElementById('vc-warmup-blocked');
  if (!bl) {
    bl = document.createElement('div');
    bl.id = 'vc-warmup-blocked';
    bl.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px';
    bl.innerHTML =
      '<div style="font-size:72px;margin-bottom:16px">🚫</div>' +
      '<div style="font-size:21px;font-weight:800;color:#ef4444;margin-bottom:12px" data-ko="수업 중에는 사용할 수 없습니다." data-en="Cannot use during class.">수업 중에는 사용할 수 없습니다.</div>' +
      '<div style="font-size:15px;color:#cbd5e1;line-height:1.6" data-ko="수업 전이나 후에 이용해 주세요." data-en="Please use it before or after class.">수업 전이나 후에 이용해 주세요.</div>' +
      '<div style="margin-top:20px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:12px 18px;font-size:12.5px;color:#fca5a5;max-width:420px">' +
        '💡 <span data-ko="선생님이 웜업 화면을 열어 주시면 함께 쓸 수 있어요." data-en="You can use it together when your teacher opens the warm-up screen.">선생님이 웜업 화면을 열어 주시면 함께 쓸 수 있어요.</span>' +
      '</div>';
    panel.appendChild(bl);
  }
  bl.style.display = 'flex';
}

function _warmupClearBlocked() {
  const bl = document.getElementById('vc-warmup-blocked');
  if (bl) bl.style.display = 'none';
  const wf = document.getElementById('vc-warmup-frame');
  if (wf) wf.style.display = '';
}

function _gameRenderBlocked() {
  // 풍선 등 진행 중이던 타이머 정리
  if (_gameState.balloonTimer) { clearInterval(_gameState.balloonTimer); _gameState.balloonTimer = null; }
  const html =
    '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:380px;text-align:center;padding:30px">' +
      '<div style="font-size:88px;margin-bottom:18px;animation:pulse 2s ease-in-out infinite">🚫</div>' +
      '<div style="font-size:22px;font-weight:700;color:#ef4444;margin-bottom:14px" data-ko="수업시간에는 할 수 없습니다." data-en="Cannot play during class.">수업시간에는 할 수 없습니다.</div>' +
      '<div style="font-size:16px;color:#cbd5e1;margin-bottom:24px;line-height:1.6" data-ko="수업 전이나 후에 해주세요." data-en="Please play before or after class.">수업 전이나 후에 해주세요.</div>' +
      '<div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:14px 20px;font-size:13px;color:#fca5a5;max-width:420px">' +
        '💡 <span data-ko="현재 수업이 진행 중이에요. 게임은 교사가 없을 때만 플레이할 수 있습니다." data-en="A class is in progress. Games can only be played when no teacher is present.">현재 수업이 진행 중이에요. 게임은 교사가 없을 때만 플레이할 수 있습니다.</span>' +
      '</div>' +
      '<div style="margin-top:18px;font-size:11px;color:#64748b">🟢 <span data-ko="현재 참여자" data-en="Participants">현재 참여자</span>: ' +
        (document.getElementById('vc-user-count')?.textContent || '?') + '<span data-ko="명" data-en="">명</span></div>' +
    '</div>' +
    '<style>@keyframes pulse { 0%,100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.1); opacity: 1; } }</style>';
  const area = document.getElementById('game-area');
  if (area) area.innerHTML = html;
  const fb = document.getElementById('game-feedback');
  if (fb) fb.innerHTML = '<span style="color:#ef4444">🚫 수업 중 — 게임 잠금</span>';
}

function gameInit() {
  // 🥭 Phase 48 — 수업 중이면 차단
  if (_gameIsClassActive()) { _gameRenderBlocked(); return; }
  setGameStage(GAME_STAGE);            // 🎢 난이도 표시 동기화
  _gameState.started = true;
  _gameState.score = 0; _gameState.correct = 0; _gameState.wrong = 0;
  _hearts = _HEARTS_MAX; _renderHearts();      // 💗 하트 리셋
  _combo = 0; _comboBest = 0; _resetCombo();   // 🔥 콤보 리셋 (미스큐는 세션 유지 = 약점 이어짐)
  _gameState.boss = false;                     // 👹 보스 리셋
  _gameUpdateScore();
  gameNextRound();
}

// ⚡ 게임 속도(난이도) 선택 — 허브(student-games.html) SPEED_LEVELS 와 같은 7단계, GAME_STAGE 로 반영 (2026-07-13)
var GAME_SPEED_LEVELS = [
  { lvl:1, ico:'🐢', ko:'아주 천천히', en:'Very Slow' },
  { lvl:2, ico:'🚶', ko:'천천히',     en:'Slow' },
  { lvl:3, ico:'🙂', ko:'보통',       en:'Normal' },
  { lvl:4, ico:'🏃', ko:'빨리',       en:'Fast' },
  { lvl:5, ico:'🚀', ko:'아주 빨리',  en:'Very Fast' },
  { lvl:6, ico:'⚡', ko:'초고속',     en:'Super Fast' },
  { lvl:7, ico:'🔥', ko:'극한',       en:'Extreme' }
];
function _gameSpeedName(s){ return miIsEn() ? s.en : s.ko; }
function gameSpeedLabelSync(){
  var cur = GAME_SPEED_LEVELS[(GAME_STAGE || 1) - 1] || GAME_SPEED_LEVELS[2];
  var el = document.getElementById('game-speed-cur');
  if (el) el.innerHTML = cur.ico + ' <span data-ko="' + cur.ko + '" data-en="' + cur.en + '">' + _gameSpeedName(cur) + '</span>';
}
function gameSpeedMenuToggle(e){
  if (e) e.stopPropagation();
  var menu = document.getElementById('game-speed-menu');
  if (!menu) return;
  if (menu.style.display === 'flex') { menu.style.display = 'none'; return; }
  // 열 때마다 현재 단계 하이라이트를 새로 그림 (언어 전환도 반영)
  menu.innerHTML = GAME_SPEED_LEVELS.map(function(s, i){
    var on = (s.lvl === GAME_STAGE);
    return '<button type="button" onclick="gameSetSpeed(' + s.lvl + ')" ' +
      'style="padding:10px 16px;background:' + (on ? '#10b981' : 'transparent') + ';color:' + (on ? '#fff' : '#94a3b8') + ';border:0;' +
      (i ? 'border-top:1px solid rgba(71,85,105,.5);' : '') +
      'cursor:pointer;font-size:13px;font-weight:600;text-align:left;width:100%">' + s.ico + ' ' + _gameSpeedName(s) + '</button>';
  }).join('');
  menu.style.display = 'flex';
}
function gameSetSpeed(lvl){
  if (!(lvl >= 1 && lvl <= GAME_STAGE_MAX)) lvl = 3;
  setGameStage(lvl);                                                          // 낙하속도·출제 구간 = GAME_STAGE (localStorage 'mangoi_game_stage' 허브 공유)
  try{ localStorage.setItem('mangoi_game_speed', String(lvl)); }catch(_){}    // 허브 ⚡속도 표시와 동기화
  gameSpeedLabelSync();
  var menu = document.getElementById('game-speed-menu');
  if (menu) menu.style.display = 'none';
  // 진행 중이면 새 라운드부터 즉시 새 속도 적용 (풍선 낙하속도는 라운드 시작 때 계산됨)
  if (_gameState.started) gameNextRound();
}
document.addEventListener('click', function (ev) {
  var menu = document.getElementById('game-speed-menu');
  if (menu && menu.style.display === 'flex' && !ev.target.closest('.vc-game-speed-wrap')) menu.style.display = 'none';
});
try{ gameSpeedLabelSync(); }catch(_){}   // 첫 로드: 저장된 단계로 라벨 맞춤

// ⋮ 게임 선택 드롭다운 열기/닫기 (2026-07-12)
function gameMenuToggle(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('game-mode-menu');
  if (!menu) return;
  menu.style.display = (menu.style.display === 'none' || !menu.style.display) ? 'flex' : 'none';
}
// 메뉴 밖 아무 곳이나 누르면 닫힘
document.addEventListener('click', function (ev) {
  const menu = document.getElementById('game-mode-menu');
  if (menu && menu.style.display !== 'none' && !ev.target.closest('.vc-game-menu-wrap')) menu.style.display = 'none';
});

function gameSwitchMode(mode) {
  _gameState.mode = mode;
  // 풍선 게임 정지 (전환 시 타이머 클리어)
  if (_gameState.balloonTimer) { clearInterval(_gameState.balloonTimer); _gameState.balloonTimer = null; }
  // 모드 토글 활성화 표시
  ['brick','match','fill','balloon','fish','shooter','battle3d','tetris','langace','p383d','tank','pizza'].forEach(m => {   // 'shoot'는 'shooter'(슈팅+말하기 통합)로 흡수
    const btn = document.getElementById('game-mode-' + m);
    if (!btn) return;
    btn.style.background = mode === m ? '#10b981' : 'transparent';
    btn.style.color = mode === m ? '#fff' : '#94a3b8';
  });
  // ⋮ 메뉴 라벨을 현재 게임명으로 갱신 + 메뉴 닫기
  const _selBtn = document.getElementById('game-mode-' + mode);
  const _cur = document.getElementById('game-menu-cur');
  if (_selBtn && _cur) _cur.innerHTML = _selBtn.innerHTML;
  const _menu = document.getElementById('game-mode-menu');
  if (_menu) _menu.style.display = 'none';
  // 🥭 Phase 48 — 수업 중이면 차단
  if (_gameIsClassActive()) { _gameRenderBlocked(); return; }
  gameNextRound();
}

// 🎨 게임 모드별 컬러풀 배경 테마 적용 (student-games.html 와 동기화)
var _GAME_THEME_MAP = { brick:'theme-brick', match:'theme-match', fill:'theme-fill', balloon:'theme-balloon',
  shoot:'theme-shoot', fish:'theme-fish', shooter:'theme-shooter', battle3d:'theme-battle3d' };
function _gameApplyTheme(area, mode){
  if(!area) return;
  Object.keys(_GAME_THEME_MAP).forEach(function(m){ area.classList.remove(_GAME_THEME_MAP[m]); });
  area.classList.remove('themed');
  var cls = _GAME_THEME_MAP[mode]; if(cls) area.classList.add(cls);
  // 카드형(브릭/매칭/빈칸/풍선)만 떠다니는 장식 레이어 표시 — iframe 게임은 아이프레임이 덮음
  if(mode==='brick'||mode==='match'||mode==='fill'||mode==='balloon') area.classList.add('themed');
}

function gameNextRound() {
  // 🥭 Phase 48 — 수업 중이면 차단
  if (_gameIsClassActive()) { _gameRenderBlocked(); return; }
  document.getElementById('game-feedback').textContent = '';
  if(_gameState._advTimer){ clearTimeout(_gameState._advTimer); _gameState._advTimer = null; }   // 🎤 섀도잉 대기 정리
  // 슈팅/낚시(iframe)는 패딩 0, 카드형 모드는 기본 패딩 복원
  const _ga = document.getElementById('game-area');
  if (_ga) _ga.style.padding = (_gameState.mode === 'shoot' || _gameState.mode === 'fish' || _gameState.mode === 'shooter' || _gameState.mode === 'battle3d' || _gameState.mode === 'tetris' || _gameState.mode === 'langace' || _gameState.mode === 'tank' || _gameState.mode === 'pizza') ? '0' : '24px';
  _gameApplyTheme(_ga, _gameState.mode);
  var _mode = _gameState.mode;
  // 🧠 약점 우선 선뽑기 + 새 항목 선학습 + 👹 보스(문장게임 5번째)
  if (_mode === 'brick' || _mode === 'fill') {
    var _boss = (_gameState.correct === 4 && _gameState.correct < GAME_GOAL);
    _gameState.boss = _boss;
    var _s = _boss ? _bossVocab() : _nextVocab(); _gameState._queued = _s;
    _preteachThen(_boss ? null : _s, 'sent', function(){ if(_mode==='brick') gameRenderBrick(); else gameRenderFill(); });
    return;
  } else if (_mode === 'balloon') {
    var _w = _nextWord(); _gameState._queued = _w;
    _preteachThen(_w, 'word', function(){ gameRenderBalloon(); });
    return;
  }
  _gameState._queued = null;
  if (_gameState.mode === 'brick') gameRenderBrick();
  else if (_gameState.mode === 'match') gameRenderMatch();
  else if (_gameState.mode === 'fill') gameRenderFill();
  else if (_gameState.mode === 'balloon') gameRenderBalloon();
  else if (_gameState.mode === 'shoot') _gameRenderSuite('shoot');
  else if (_gameState.mode === 'fish') _gameRenderSuite('fish');
  else if (_gameState.mode === 'shooter') _gameRenderShooter();
  else if (_gameState.mode === 'battle3d') _gameRenderBattle3d();
  else if (_gameState.mode === 'tetris') _gameRenderTetris();
  else if (_gameState.mode === 'langace') _gameRenderLangace();
  else if (_gameState.mode === 'p383d') _gameRenderP383d();
  else if (_gameState.mode === 'tank') _gameRenderTank();
  else if (_gameState.mode === 'pizza') _gameRenderPizza();
}

// 🥭 슈팅+말하기 / 낚시+말하기 — english-mastery-suite.html 를 iframe 으로 임베드.
// 오늘의 교재 문장을 URL 파라미터로 주입하고, 미션 완료 시 점수를 공유 풋터에 반영.
function _gameRenderSuite(which) {
  // ⚠ 이 모드는 '교사 주도 발음 드릴'(Audio→말하기 3회→Admin Pass)이므로 수업 중에도 사용 가능 — 일반 미니게임의 수업 차단을 적용하지 않음.
  const v = (_gameState.current && _gameState.current.sentence)
            || _GAME_VOCAB[Math.floor(Math.random() * _GAME_VOCAB.length)];
  _gameState.current = { sentence: v, picked: [] };
  const lang = miIsEn() ? 'en' : 'ko';
  const src = '/english-mastery-suite.html?game=' + which
            + '&sentence=' + encodeURIComponent(v.en)
            + (v.ko ? '&ko=' + encodeURIComponent(v.ko) : '')
            + '&lang=' + lang;
  const area = document.getElementById('game-area');
  if (!area) return;
  // mic/autoplay 권한 위임 필수 — 말하기 미션(webkitSpeechRecognition)과 TTS 동작에 필요
  area.style.padding = '0';
  area.innerHTML =
    '<iframe id="game-suite-frame" src="' + src + '" ' +
    'allow="microphone; autoplay; speaker-selection" ' +
    'style="width:100%;height:100%;min-height:440px;border:0;display:block;background:#081227"></iframe>';
  const fb = document.getElementById('game-feedback');
  if (fb) fb.innerHTML = (lang === 'en')
    ? '<span style="color:#94a3b8">🎤 Order the words → listen → speak 3×</span>'
    : '<span style="color:#94a3b8">🎤 단어 순서 → 발음 듣기 → 3번 말하기</span>';
}

// ⚔️ 3D 배틀 — battle-3d.html 임베드 (레슨 보스전, 자체 단어/문장 퀴즈 + 3D 캐릭터/배지). 수업 중엔 gameNextRound 상단에서 차단됨.
function _gameRenderBattle3d() {
  const area = document.getElementById('game-area');
  if (!area) return;
  area.style.padding = '0';
  area.innerHTML =
    '<iframe id="game-suite-frame" src="/battle-3d.html" ' +
    'allow="microphone; autoplay; speaker-selection" ' +
    'style="width:100%;height:100%;min-height:440px;border:0;display:block;background:#070b16"></iframe>';
  const fb = document.getElementById('game-feedback');
  if (fb) fb.innerHTML = '<span style="color:#94a3b8">⚔️ 레슨 보스와 퀴즈 대결 → 3D 공격 + 배지 보상</span>';
}

// 🎮/✈️ 학생게임 임베드 언어 — 게임 허브(student-games.html)와 공유하는 학생의 선택 언어
function _gameEmbedLang(){ try{ return localStorage.getItem('mangoi_game_lang')==='zh' ? 'zh' : 'en'; }catch(_){ return 'en'; } }

// 🎮 단어 테트리스 — student-game-tetris.html 임베드(정통 테트리스 + 어순대로 3문장 완성, 영/중)
function _gameRenderTetris() {
  const area = document.getElementById('game-area');
  if (!area) return;
  area.style.padding = '0';
  area.innerHTML =
    '<iframe id="game-suite-frame" src="/student-game-tetris.html?v=2&glang=' + _gameEmbedLang() + '" ' +
    'allow="microphone; autoplay; speaker-selection" ' +
    'style="width:100%;height:100%;min-height:440px;border:0;display:block;background:#0b0f1e"></iframe>';
  const fb = document.getElementById('game-feedback');
  if (fb) fb.innerHTML = '<span style="color:#94a3b8">🎮 단어 조각으로 3문장 완성! 사이사이 도형은 쌓아서 줄 지우기</span>';
}

// ✈️ B-17 폭격기 — student-game-language-ace.html 임베드(문장 어순대로 제로센 격추 → 발음, 영/중)
function _gameRenderLangace() {
  const area = document.getElementById('game-area');
  if (!area) return;
  area.style.padding = '0';
  area.innerHTML =
    '<iframe id="game-suite-frame" src="/student-game-language-ace.html?v=5&glang=' + _gameEmbedLang() + '&goal=10" ' +
    'allow="microphone; autoplay; speaker-selection" ' +
    'style="width:100%;height:100%;min-height:440px;border:0;display:block;background:#0a0f14"></iframe>';
  const fb = document.getElementById('game-feedback');
  if (fb) fb.innerHTML = '<span style="color:#94a3b8">✈️ P-38로 출격! 문장 어순대로 단어 실은 제로센을 격추하세요</span>';
}

// 🛩️ P-38 3D 조종석 — student-game-p38-3d.html 임베드(실물 조종석 1인칭 + 실사 적기 + 무전 듣기/말하기)
//    위 2D 탑뷰(langace)와 병행 운영한다. 저사양·저학년은 2D 가 낫고, WebGL 불가 기기는 게임이 알아서 2D 로 안내한다.
function _gameRenderP383d() {
  const area = document.getElementById('game-area');
  if (!area) return;
  area.style.padding = '0';
  area.innerHTML =
    '<iframe id="game-suite-frame" src="/student-game-p38-3d.html?v=1&glang=' + _gameEmbedLang() + '&goal=10" ' +
    'allow="microphone; autoplay; speaker-selection" ' +
    'style="width:100%;height:100%;min-height:440px;border:0;display:block;background:#0a0f14"></iframe>';
  const fb = document.getElementById('game-feedback');
  if (fb) fb.innerHTML = '<span style="color:#94a3b8">🛩️ 실물 조종석에 앉아 출격! 무전으로 들은 단어를 하늘에서 찾아 격추하세요</span>';
}

// 🍕 문법 피자 마스터 — student-game-grammar-pizza.html 임베드(실사 재료를 문장 어순대로 도우에 올리기 + 문법 성분 배지 + 듣기·말하기)
function _gameRenderPizza() {
  const area = document.getElementById('game-area');
  if (!area) return;
  area.style.padding = '0';
  area.innerHTML =
    '<iframe id="game-suite-frame" src="/student-game-grammar-pizza.html?v=16&glang=' + _gameEmbedLang() + '" ' +
    'allow="microphone; autoplay; speaker-selection" ' +
    'style="width:100%;height:100%;min-height:440px;border:0;display:block;background:#a5713a"></iframe>';
  const fb = document.getElementById('game-feedback');
  if (fb) fb.innerHTML = '<span style="color:#94a3b8">🍕 실사 재료를 문장 어순대로 도우에 올려 피자를 완성하세요</span>';
}

// 🛡️ 셔먼 탱크대전 — student-game-tank-battle.html 임베드(독일 전차를 어순대로 격파 → 발음, 영/중)
function _gameRenderTank() {
  const area = document.getElementById('game-area');
  if (!area) return;
  area.style.padding = '0';
  area.innerHTML =
    '<iframe id="game-suite-frame" src="/student-game-tank-battle.html?v=3&glang=' + _gameEmbedLang() + '&goal=10" ' +
    'allow="microphone; autoplay; speaker-selection" ' +
    'style="width:100%;height:100%;min-height:440px;border:0;display:block;background:#0a0f14"></iframe>';
  const fb = document.getElementById('game-feedback');
  if (fb) fb.innerHTML = '<span style="color:#94a3b8">🛡️ 셔먼으로 출격! 독일 전차를 문장 어순대로 격파하세요</span>';
}

// 🚀 슈팅+말하기(통합) — student-game-shooter.html 임베드. 오늘 교재 문장 주입 + 원어민 음성 + 총별 효과음
//    + 문장 완성 후 🎤 3회 말하기 미션 (구 english-mastery-suite shoot 의 말하기 엔진 이식·융합).
function _gameRenderShooter() {
  const v = (_gameState.current && _gameState.current.sentence)
            || _GAME_VOCAB[Math.floor(Math.random() * _GAME_VOCAB.length)];
  _gameState.current = { sentence: v, picked: [] };
  const lang = miIsEn() ? 'en' : 'ko';
  const src = '/student-game-shooter.html?sentence=' + encodeURIComponent(v.en) + '&lang=' + lang;
  const area = document.getElementById('game-area');
  if (!area) return;
  area.style.padding = '0';
  area.innerHTML =
    '<iframe id="game-suite-frame" src="' + src + '" ' +
    'allow="microphone; autoplay; speaker-selection" ' +
    'style="width:100%;height:100%;min-height:440px;border:0;display:block;background:#081227"></iframe>';
  const fb = document.getElementById('game-feedback');
  if (fb) fb.innerHTML = (lang === 'en')
    ? '<span style="color:#94a3b8">🚀 Shoot the words in order → listen → speak 3×!</span>'
    : '<span style="color:#94a3b8">🚀 단어를 순서대로 쏘고 → 원어민 듣고 → 🎤 3번 말하기! (총·소리 선택 가능)</span>';
}

// iframe(영어 마스터리 게임) → 부모: 미션 완료 시 공유 점수 반영
window.addEventListener('message', function (ev) {
  const d = ev && ev.data;
  if (!d || typeof d !== 'object' || !d.type) return;
  if (d.type === 'mangoi-game-complete') {
    _gameState.score += (d.score || 0);
    _gameState.correct += 1;
    if (typeof _gameUpdateScore === 'function') _gameUpdateScore();
    const fb = document.getElementById('game-feedback');
    if (fb) fb.innerHTML = '<span style="color:#10b981;font-weight:700">🌟 미션 완료! +' + (d.score || 0) + '</span>';
  }
});

function _gameShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function _gameUpdateScore() {
  document.getElementById('game-score').textContent = _gameState.score;
  document.getElementById('game-correct').textContent = _gameState.correct;
  document.getElementById('game-wrong').textContent = _gameState.wrong;
}

// 🔊 원어민 발음 (TTS) — 자연스러운 음성 우선, 옛 로봇 음성 회피 (english-mastery-suite 와 동일 로직)
var _gameEnVoice = null;
function _gameScoreVoice(v){
  var n=(v.name||'').toLowerCase(), lang=(v.lang||'').toLowerCase(), s=0;
  if(lang==='en-us') s+=40; else if(lang==='en-gb'||lang==='en-au') s+=28;
  else if(lang.slice(0,2)==='en') s+=18; else s-=120;
  if(/natural|neural/.test(n)) s+=70;
  if(/google/.test(n)) s+=60;
  if(/\b(aria|jenny|guy|ava|emma|libby|michelle|jane|nova|sara|brian|christopher)\b/.test(n)) s+=48;
  if(/\b(samantha|alex|allison|ava|tom|siri|nicky|evan|joelle|nathan)\b/.test(n)) s+=46;
  if(/online/.test(n)) s+=24;
  if(/premium|enhanced|plus/.test(n)) s+=24;
  if(v.localService===false) s+=30;
  if(/zira|david|mark|hazel|george|susan|catherine|linda|richard|sean|heera|ravi/.test(n)) s-=55;
  if(/desktop|compact|espeak|pico|microsoft server/.test(n)) s-=45;
  if(/zarvox|albert|bahh|bells|boing|bubbles|cellos|trinoids|whisper|wobble|jester|organ|superstar|bad news|good news|deranged|hysterical|pipe|ralph|fred|junior|kathy/.test(n)) s-=90;
  return s;
}
function _gamePickVoice(){
  try{
    var vs=window.speechSynthesis.getVoices(); if(!vs.length) return;
    var en=vs.filter(function(v){ return (v.lang||'').slice(0,2).toLowerCase()==='en'; });
    if(!en.length){ _gameEnVoice=null; return; }   // 영어 음성 없으면 시스템 en-US 기본에 맡김
    var best=null, bs=-1e9;
    en.forEach(function(v){ var sc=_gameScoreVoice(v); if(sc>bs){ bs=sc; best=v; } });
    _gameEnVoice=best;
  }catch(_){}
}
try{ if(window.speechSynthesis){ _gamePickVoice(); window.speechSynthesis.onvoiceschanged=_gamePickVoice; } }catch(_){}
// 🔊 원어민 발음: 클라우드 TTS(Deepgram Aura-1, game-tts.js) 우선 → 실패 시 브라우저 보이스 폴백
window.gameSpeak = function(text, onend){ try{ if(!text){ if(onend) onend(); return; }
  // 🔊 (2026-07-23) onend 를 통과시킨다 — 따라 말하기가 "낭독이 끝난 뒤"에 마이크를 켜야
  //    AI 목소리를 학생 발화로 받아 적지 않는다. 기존 호출부(인자 1개)는 그대로 동작.
  if(window.MangoiTTS){ MangoiTTS.speak(text, null, onend||null); return; }
  if(!_gameEnVoice) _gamePickVoice(); var u=new SpeechSynthesisUtterance(String(text)); u.lang=(_gameEnVoice&&_gameEnVoice.lang)||'en-US'; u.rate=0.95; u.pitch=1.02; if(_gameEnVoice) u.voice=_gameEnVoice; if(onend){ var _f=false, _fin=function(){ if(!_f){ _f=true; onend(); } }; u.onend=_fin; u.onerror=_fin; setTimeout(_fin, 6000); } window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);}catch(_){ if(onend) onend(); } };
// 🔊 라운드 시작 자동 2회 듣기 — 문장/단어가 나오면 무조건 먼저 두 번 들려줌 (들어야 맞추니까)
window.gameSpeakTwice = function(text){ try{ if(!text) return;
  if(window.MangoiTTS){ MangoiTTS.speak(text, null, function(){ setTimeout(function(){ try{ MangoiTTS.speak(text); }catch(_){} }, 380); }); return; }
  gameSpeak(text); setTimeout(function(){ try{ gameSpeak(text); }catch(_){} }, Math.max(2200, String(text).length*110));
}catch(_){} };
window.gameSpeakBuilt = function(){ try{ var pk=(_gameState.current&&_gameState.current.picked)||[]; if(pk.length){ gameSpeak(pk.join(' ')); return; } var s=_gameState.current&&_gameState.current.sentence; if(s&&s.en) gameSpeak(s.en); }catch(_){} };   // 아직 안 골랐으면 정답 문장 발음
window.gameSpeakTarget = function(){ try{ var s=_gameState.current&&_gameState.current.sentence; if(s&&s.en) gameSpeak(s.en); }catch(_){} };   // 🎧 듣기형(번역 없음) 문제의 문장 듣기
window.gameSpeakAnswer = function(){ try{ var a=_gameState.current&&_gameState.current.answer; if(a) gameSpeak(a); }catch(_){} };   // 🎈 풍선 등 정답 단어 발음 듣기

/* 📖 단어 뜻 말풍선 — 브릭을 누르면 한국어 뜻을 보여주고 발음 재생 (student-games.html 이식본, index 탭은 영어 전용) */
var _EN_FUNC_KO = { i:'나는', you:'너, 당신', he:'그는', she:'그녀는', we:'우리는', they:'그들은', it:'그것',
  a:'하나의 (관사)', an:'하나의 (관사)', the:'그 (관사)', is:'~이다, 있다', are:'~이다, 있다', am:'~이다',
  was:'~였다', were:'~였다', be:'~이다', to:'~로, ~하기 위해', of:'~의', in:'~안에', on:'~위에, ~(요일)에',
  at:'~에서', and:'그리고', but:'그러나', or:'또는', my:'나의', your:'너의', his:'그의', her:'그녀의',
  our:'우리의', their:'그들의', this:'이(것)', that:'저(것)', with:'~와 함께', for:'~을 위해',
  not:'~않다', do:'하다', does:'하다', did:'했다', can:'~할 수 있다', will:'~할 것이다', should:'~해야 한다',
  have:'가지고 있다', has:'가지고 있다', very:'매우', every:'모든, 매~' };
var _wordHintCache = {};
function _lookupWordLocal(word){
  try{
    var lw = String(word).toLowerCase();
    var hit = (_GAME_WORDS||[]).find(function(x){ return x && x.ko && String(x.en||'').toLowerCase()===lw; });
    if(hit) return { ko:hit.ko, pinyin:hit.pinyin||'' };
    if(_glang()!=='zh' && _EN_FUNC_KO[lw]) return { ko:_EN_FUNC_KO[lw], pinyin:'' };
  }catch(_){}
  return null;
}
function _escWordHtml(s){ return String(s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
var _hintTimer = null;
function _removeWordHint(){ var el=document.getElementById('brick-word-hint'); if(el) el.remove(); if(_hintTimer){ clearTimeout(_hintTimer); _hintTimer=null; } }
function _fillWordHint(el, word, def){
  el.innerHTML =
    '<div style="font-size:18px">' + _escWordHtml(word) +
      (def && def.pinyin ? ' <span style="font-weight:600;color:#b45309">[' + _escWordHtml(def.pinyin) + ']</span>' : '') + '</div>' +
    '<div style="font-size:15px;color:#92400e">' + (def ? _escWordHtml(def.ko) : '뜻 찾는 중…') + '</div>' +
    '<div style="font-size:11px;color:#b45309;opacity:.75;margin-top:2px">👆 누르면 다시 발음</div>';
}
function _brickShowWordHint(btn, word){
  try{
    _removeWordHint();
    var d = document.createElement('div');
    d.id = 'brick-word-hint'; d.dataset.word = word;
    d.style.cssText = 'position:fixed;z-index:2147483000;max-width:80vw;padding:10px 18px;border-radius:14px;' +
      'background:linear-gradient(135deg,#fffbeb,#fef3c7);color:#78350f;border:2px solid #f59e0b;' +
      'box-shadow:0 12px 28px rgba(0,0,0,0.35);font-weight:700;text-align:center;cursor:pointer;line-height:1.35';
    d.onclick = function(ev){ ev.stopPropagation(); try{ window.gameSpeak && gameSpeak(word); }catch(_){} };
    _fillWordHint(d, word, _lookupWordLocal(word));
    document.body.appendChild(d);
    var r = btn.getBoundingClientRect();
    var half = Math.min(d.offsetWidth/2, window.innerWidth/2 - 8);
    var cx = Math.max(8 + half, Math.min(window.innerWidth - 8 - half, r.left + r.width/2));
    d.style.left = cx + 'px';
    if(r.top - d.offsetHeight - 12 > 8){ d.style.top = (r.top - 8) + 'px'; d.style.transform = 'translate(-50%,-100%)'; }
    else { d.style.top = (r.bottom + 8) + 'px'; d.style.transform = 'translate(-50%,0)'; }
    _resolveWordHint(word, function(def){
      var el = document.getElementById('brick-word-hint');
      if(el && el.dataset.word === word) _fillWordHint(el, word, def || { ko:'뜻을 찾지 못했어요', pinyin:'' });
    });
    _hintTimer = setTimeout(_removeWordHint, 3500);
  }catch(_){}
}
function _resolveWordHint(word, cb){
  var key = _glang() + ':' + String(word).toLowerCase();
  if(_wordHintCache[key]){ cb(_wordHintCache[key]); return; }
  var local = _lookupWordLocal(word);
  if(local){ _wordHintCache[key] = local; cb(local); return; }
  try{ var ss = JSON.parse(sessionStorage.getItem('mangoi_word_defs')||'{}');
    if(ss[key]){ _wordHintCache[key]=ss[key]; cb(ss[key]); return; } }catch(_){}
  var sentEn = '';
  try{ sentEn = (_gameState.current && _gameState.current.sentence && _gameState.current.sentence.en) || ''; }catch(_){}
  fetch('/api/games/define?word=' + encodeURIComponent(word) + '&lang=' + _glang() + '&sent=' + encodeURIComponent(sentEn))
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(dd){
      if(!dd || !dd.ok || !dd.ko){ cb(null); return; }
      var v = { ko: dd.ko, pinyin: dd.pinyin || '' };
      _wordHintCache[key] = v;
      try{ var s2 = JSON.parse(sessionStorage.getItem('mangoi_word_defs')||'{}'); s2[key]=v; sessionStorage.setItem('mangoi_word_defs', JSON.stringify(s2)); }catch(_){}
      cb(v);
    }).catch(function(){ cb(null); });
}

// 🧱 게임 1: 문장 벽돌 — 영어 단어 브릭을 순서대로 클릭해서 문장 완성
function gameRenderBrick() {
  _removeWordHint();   // 이전 라운드 단어 뜻 말풍선 정리
  const sentence = _zhSafeWords(_gameState._queued || _nextVocab());   // 🧠 약점 우선(+중국어 분절 보정)
  _gameState._queued = null;
  _gameState.current = { sentence, picked: [] };
  try{ window.gameSpeakTwice && gameSpeakTwice(sentence.en); }catch(_){}   // 🔊 자동 2회 듣기
  const shuffled = _gameShuffle(sentence.words);
  // 교재 문장에 한국어 번역이 없으면 듣기 문제로 전환 (🔊 버튼으로 문장 듣고 순서 조립)
  const promptBlock = sentence.ko
    ? '<div class="gko-cap">📝 한국어 번역</div>' +
      '<div class="gko-txt">' + sentence.ko + '</div>'
    : '<div class="gko-cap">🎧 오늘 교재 문장을 듣고 순서대로 만들어 보세요</div>' +
      '<button onclick="gameSpeakTarget()" class="gko-listen" style="font-size:clamp(18px,2.6vmin,32px);padding:14px 26px">🔊 문장 듣기</button>';
  let html =
    (_gameState.boss ? _bossBannerHtml() : '') +
    '<div style="text-align:center;margin-bottom:24px">' + promptBlock + '</div>' +
    '<div style="text-align:center;margin-bottom:18px">' +
      '<div class="gko-cap">🎯 영어로 만들어보세요 (단어 클릭)</div>' +
      '<div id="brick-built" style="min-height:54px;background:rgba(15,23,42,0.7);border:2px dashed #475569;border-radius:12px;padding:12px;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center">' +
        '<span style="color:#64748b;font-size:14px" id="brick-empty">아래 단어 브릭을 클릭하세요...</span>' +
      '</div>' +
    '</div>' +
    '<div id="brick-pool" style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:18px">';
  shuffled.forEach((w, i) => {
    // 🎨 내용어=선명한 파랑 / 기능어=흐린 회색
    var _bg = _isContentWord(w) ? 'linear-gradient(135deg,#3b82f6,#1d4ed8);box-shadow:0 4px 12px rgba(59,130,246,0.4)'
                                : 'linear-gradient(135deg,#64748b,#475569);box-shadow:0 4px 12px rgba(100,116,139,0.3)';
    html += '<button class="brick-btn" data-word="' + w + '" data-idx="' + i + '" onclick="gameBrickPick(this)" ' +
      'style="padding:10px 18px;background:' + _bg + ';color:#fff;border:0;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;transition:transform 0.15s">' + w + '</button>';
  });
  html += '</div>' +
    '<div style="text-align:center;display:flex;gap:10px;justify-content:center">' +
      '<button onclick="gameBrickReset()" style="padding:8px 18px;background:rgba(148,163,184,0.2);color:#cbd5e1;border:0;border-radius:8px;cursor:pointer;font-size:13px">↩ 다시</button>' +
      '<button onclick="gameSpeakBuilt()" class="gko-listen">🔊 발음 듣기</button>' +
      '<button onclick="gameBrickCheck()" style="padding:10px 24px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:0;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;box-shadow:0 4px 12px rgba(16,185,129,0.4)">✅ 확인</button>' +
    '</div>';
  document.getElementById('game-area').innerHTML = html;
}

function gameBrickPick(btn) {
  const word = btn.dataset.word;
  _gameState.current.picked.push(word);
  try{ window.gameSpeak && gameSpeak(word); }catch(_){}
  try{ _brickShowWordHint(btn, word); }catch(_){}   // 📖 한국어 뜻 말풍선
  btn.style.opacity = '0.3'; btn.disabled = true;
  const built = document.getElementById('brick-built');
  const empty = document.getElementById('brick-empty');
  if (empty) empty.remove();
  const span = document.createElement('span');
  span.textContent = word;
  span.style.cssText = 'padding:8px 16px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1f2937;border-radius:8px;font-size:15px;font-weight:700';
  built.appendChild(span);
}

function gameBrickReset() {
  gameRenderBrick();
}
function _brickRedrawBuilt(goodCount){
  var built=document.getElementById('brick-built'); if(!built) return;
  var picked=_gameState.current.picked; built.innerHTML='';
  if(!picked.length){ var e=document.createElement('span'); e.id='brick-empty'; e.style.cssText='color:#64748b;font-size:14px'; e.textContent='아래 단어 브릭을 클릭하세요...'; built.appendChild(e); return; }
  picked.forEach(function(w,i){ var sp=document.createElement('span'); sp.textContent=w; var ok=(i<goodCount);
    sp.style.cssText='padding:8px 16px;border-radius:8px;font-size:15px;font-weight:700;'+(ok?'background:linear-gradient(135deg,#10b981,#059669);color:#fff':'background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#1f2937'); built.appendChild(sp); });
}
function gameBrickCheck() {
  const sent = _gameState.current.sentence;
  const picked = _gameState.current.picked;
  const target = sent.words;
  const fb = document.getElementById('game-feedback');
  const full = picked.length === target.length && picked.every((w, i) => w === target[i]);
  if (full) {
    const r = _onCorrect('sent', sent, 10);
    fb.innerHTML = '<span style="color:#10b981">' + (r.boss?'👹 보스 격파! ':'✅ 정답! ') + '+' + r.gain + '점' + (r.mult>1?(' 🔥×'+r.mult):'') + '</span>';
    _brickRedrawBuilt(picked.length);
    try{ window.gameSpeak && gameSpeak(sent.en); }catch(_){}
    _gameUpdateScore();
    if(!_gameCheckGoal()){
      fb.innerHTML += ' <button onclick="gameShadow(\'' + encodeURIComponent(sent.en) + '\')" style="margin-left:8px;padding:5px 12px;background:linear-gradient(135deg,#0ea5e9,#0369a1);color:#fff;border:0;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">🎤 따라 말하기</button>';
      _gameState._advTimer = setTimeout(gameNextRound, 2800);
    }
    return;
  }
  // 부드러운 오답: 맞은 접두부 초록 고정 + 틀린 꼬리만 되돌림
  let good = 0; while(good < picked.length && good < target.length && picked[good] === target[good]) good++;
  const removed = picked.slice(good);
  _gameState.current.picked = picked.slice(0, good);
  removed.forEach(function(w){ var btns=document.querySelectorAll('.brick-btn'); for(var i=0;i<btns.length;i++){ if(btns[i].disabled && btns[i].dataset.word===w){ btns[i].disabled=false; btns[i].style.opacity='1'; break; } } });
  _brickRedrawBuilt(good);
  const dead = _onWrong('sent', sent, true);
  _gameUpdateScore();
  if(dead) return;
  fb.innerHTML = good>0
    ? '<span style="color:#f59e0b">거의 다 왔어요! 초록은 그대로, 다음 칸을 다시 골라보세요</span>'
    : '<span style="color:#f59e0b">첫 단어부터 다시 생각해볼까요? 🔊 발음 듣기가 힌트!</span>';
}

// 🧩 게임 2: 단어 매칭 — 한영 카드 페어 매칭
function gameRenderMatch() {
  const pool = _pickWords(6); // 🧠 약점 단어 우선 포함
  const cards = [];
  pool.forEach((w, i) => {
    cards.push({ id: 'k' + i, type: 'ko', text: w.ko, pairId: i });
    cards.push({ id: 'e' + i, type: 'en', text: w.en, pairId: i });
  });
  const shuffled = _gameShuffle(cards);
  _gameState.current = { cards: shuffled, flipped: [], matched: new Set(), pool: pool };
  let html =
    '<div style="text-align:center;margin-bottom:18px">' +
      '<div style="font-size:13px;color:#94a3b8">🧩 한국어와 영어 카드 짝을 찾으세요!</div>' +
    '</div>' +
    '<div id="match-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;max-width:600px;margin:0 auto">';
  shuffled.forEach((c, i) => {
    const bg = c.type === 'ko' ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'linear-gradient(135deg,#f59e0b,#ea580c)';
    html += '<div class="match-card" data-idx="' + i + '" data-pair="' + c.pairId + '" data-type="' + c.type + '" data-text="' + c.text + '" onclick="gameMatchFlip(this)" ' +
      'style="aspect-ratio:1.4;background:' + bg + ';border-radius:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,0.3);transition:transform 0.2s">' +
      '<span style="font-size:28px">?</span></div>';
  });
  html += '</div>' +
    '<div style="text-align:center;margin-top:18px;font-size:12px;color:#94a3b8">남은 페어: <b id="match-remaining" style="color:#fbbf24">' + pool.length + '</b></div>';
  document.getElementById('game-area').innerHTML = html;
}

function gameMatchFlip(card) {
  if (card.dataset.flipped === '1' || card.dataset.matched === '1') return;
  if (_gameState.current.flipped.length >= 2) return;
  card.dataset.flipped = '1';
  card.innerHTML = '<span style="font-size:18px;padding:8px;text-align:center">' + card.dataset.text + '</span>';
  card.style.transform = 'scale(1.05)';
  if (card.dataset.type === 'en') { try{ window.gameSpeak && gameSpeak(card.dataset.text); }catch(_){} }
  _gameState.current.flipped.push(card);
  if (_gameState.current.flipped.length === 2) {
    const [a, b] = _gameState.current.flipped;
    if (a.dataset.pair === b.dataset.pair && a.dataset.type !== b.dataset.type) {
      // 매치
      const _witem = (_gameState.current.pool && _gameState.current.pool[parseInt(a.dataset.pair,10)]) || { en:(a.dataset.type==='en'?a.dataset.text:b.dataset.text) };
      setTimeout(() => {
        a.dataset.matched = '1'; b.dataset.matched = '1';
        a.style.opacity = '0.5'; b.style.opacity = '0.5';
        a.style.transform = ''; b.style.transform = '';
        _gameState.current.matched.add(a.dataset.pair);
        const r = _onCorrect('word', _witem, 5);
        _gameState.current.flipped = [];
        _gameUpdateScore();
        const total = _gameState.current.cards.length / 2;
        const remEl = document.getElementById('match-remaining');
        if (remEl) remEl.textContent = (total - _gameState.current.matched.size);
        document.getElementById('game-feedback').innerHTML = '<span style="color:#10b981">✅ 매치! +' + r.gain + '점' + (r.mult>1?(' 🔥×'+r.mult):'') + '</span>';
        if (_gameCheckGoal()) return;                         // 🎯 10개 정답 → 결과 화면
        if (_gameState.current.matched.size === total) {
          document.getElementById('game-feedback').innerHTML = '<span style="color:#fbbf24">🏆 완료! 다음 게임으로...</span>';
          setTimeout(gameNextRound, 2000);
        }
      }, 400);
    } else {
      // 미스매치
      const _enCard = (a.dataset.type==='en') ? a : b;
      const _wwitem = (_gameState.current.pool && _gameState.current.pool[parseInt(_enCard.dataset.pair,10)]) || { en:_enCard.dataset.text };
      const _dead = _onWrong('word', _wwitem);
      _gameUpdateScore();
      if(_dead){ _gameState.current.flipped = []; return; }
      document.getElementById('game-feedback').innerHTML = '<span style="color:#ef4444">❌ 다시</span>';
      setTimeout(() => {
        a.dataset.flipped = '0'; b.dataset.flipped = '0';
        a.innerHTML = '<span style="font-size:28px">?</span>';
        b.innerHTML = '<span style="font-size:28px">?</span>';
        a.style.transform = ''; b.style.transform = '';
        _gameState.current.flipped = [];
      }, 800);
    }
  }
}

// 🥭 Phase 46 — 게임 3: 🔤 빈칸 채우기 (Fill the Blank)
//   문장의 한 단어를 빈칸으로 만들고, 4개 옵션 중 정답 클릭
function gameRenderFill() {
  const sent = _zhSafeWords(_gameState._queued || _nextVocab());   // 🧠 약점 우선(+중국어 분절 보정)
  _gameState._queued = null;
  // 무작위 단어 하나를 빈칸 ___ 으로 (관사·be동사 빼고 의미 단어 우선)
  const meaningfulIdx = sent.words.findIndex(w => w.length > 2 && !['the','is','are','am','was','were','to','on','in','at','of'].includes(w.toLowerCase()));
  const blankIdx = meaningfulIdx >= 0 ? meaningfulIdx : Math.floor(sent.words.length / 2);
  const answer = sent.words[blankIdx];
  // 오답 3개 — 다른 문장의 단어들에서
  const allWords = _GAME_VOCAB.flatMap(s => s.words).filter(w => w.toLowerCase() !== answer.toLowerCase() && w.length > 2);
  const wrongs = _gameShuffle(allWords).slice(0, 3);
  const options = _gameShuffle([answer, ...wrongs]);
  _gameState.current = { answer, sentence: sent };
  try{ window.gameSpeakTwice && gameSpeakTwice(sent.en); }catch(_){}   // 🔊 자동 2회 듣기
  // 🎨 내용어 밝게 / 기능어 흐리게 → 문장 구조가 눈에 보임
  const maskedHtml = sent.words.map((w, i) =>
    i === blankIdx
      ? '<span style="background:#dc2626;color:#fff;padding:4px 28px;border-radius:10px;letter-spacing:3px;margin:0 6px">___</span>'
      : '<span style="color:' + (_isContentWord(w) ? '#f8fafc;font-weight:700' : '#64748b;font-weight:400') + '">' + w + '</span>'
  ).join(' ');
  // 교재 문장에 한국어 번역이 없으면 힌트 대신 🔊 문장 듣기 버튼 제공
  const fillHint = sent.ko
    ? '<div class="gko-cap">📝 한국어 번역</div>' +
      '<div class="gko-txt">' + sent.ko + '</div>'
    : '<button onclick="gameSpeakTarget()" class="gko-listen" style="font-size:clamp(18px,2.6vmin,32px);padding:14px 26px">🔊 문장 듣기 (힌트)</button>';
  let html =
    (_gameState.boss ? _bossBannerHtml() : '') +
    '<div style="text-align:center;margin-bottom:26px">' + fillHint + '</div>' +
    '<div style="text-align:center;margin-bottom:30px">' +
      '<div class="gko-cap">🎯 빈칸에 들어갈 단어를 고르세요</div>' +
      '<div class="fill-sentence" style="font-size:clamp(28px,6vw,48px);font-weight:700;color:#f1f5f9;padding:26px 34px;background:rgba(15,23,42,0.7);border:2px solid #475569;border-radius:16px;display:inline-block;line-height:1.6;max-width:94%">' +
        maskedHtml +
      '</div>' +
      '<div class="gko-note">밝은 단어 = 뜻 핵심 · 흐린 단어 = 문법 기능어</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:18px;max-width:820px;margin:0 auto;width:94%">';
  options.forEach(opt => {
    html += '<button onclick="gameFillCheck(\'' + opt + '\', this)" ' +
      'style="padding:28px 20px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border:0;border-radius:16px;font-size:clamp(24px,5vw,36px);font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(139,92,246,0.4);transition:all 0.15s">' + opt + '</button>';
  });
  html += '</div>' +
    '<div style="text-align:center;margin-top:18px"><button onclick="gameSpeakTarget()" class="gko-listen">🔊 발음 듣기</button></div>';
  document.getElementById('game-area').innerHTML = html;
}

function gameFillCheck(picked, btn) {
  const correct = picked.toLowerCase() === _gameState.current.answer.toLowerCase();
  const fb = document.getElementById('game-feedback');
  const sent = _gameState.current.sentence;
  if (correct) {
    btn.style.background = 'linear-gradient(135deg,#10b981,#059669)';
    btn.style.transform = 'scale(1.05)';
    const r = _onCorrect('sent', sent, 8);
    const em = _emojiFor(sent, 'sent');
    fb.innerHTML = '<span style="color:#10b981">' + (em?em+' ':'') + (r.boss?'👹 보스 격파! ':'✅ 정답! ') + '+' + r.gain + '점' + (r.mult>1?(' 🔥×'+r.mult):'') + '</span>';
    try{ window.gameSpeak && sent && gameSpeak(sent.en); }catch(_){}
    _gameUpdateScore();
    if(!_gameCheckGoal()){
      fb.innerHTML += ' <button onclick="gameShadow(\'' + encodeURIComponent(sent.en) + '\')" style="margin-left:8px;padding:5px 12px;background:linear-gradient(135deg,#0ea5e9,#0369a1);color:#fff;border:0;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">🎤 따라 말하기</button>';
      _gameState._advTimer = setTimeout(gameNextRound, 2600);
    }
  } else {
    btn.style.background = 'linear-gradient(135deg,#dc2626,#991b1b)';
    btn.style.opacity = '0.4';
    btn.disabled = true;
    try{ window.gameSpeak && gameSpeak(picked); }catch(_){}
    const dead = _onWrong('sent', sent, true);
    _gameUpdateScore();
    if(dead) return;
    fb.innerHTML = '<span style="color:#ef4444">❌ 다시! 다른 단어를 골라보세요</span>';
  }
}

// 🥭 Phase 46 — 게임 4: 🎈 풍선 터뜨리기 (Balloon Pop)
//   한국어 단어 표시 → 영어 풍선 4개가 위에서 아래로 떨어짐 → 정답 클릭
function gameRenderBalloon() {
  const word = _gameState._queued || _nextWord();   // 🧠 약점 우선
  _gameState._queued = null;
  // 오답 3개
  const wrongs = _gameShuffle(_GAME_WORDS.filter(w => w.en !== word.en)).slice(0, 3);
  const balloons = _gameShuffle([word, ...wrongs]);
  _gameState.current = { answer: word.en, popped: false, word: word };
  try{ window.gameSpeakTwice && gameSpeakTwice(word.en); }catch(_){}   // 🔊 단어도 자동 2회 듣기
  const _em = _emojiFor(word, 'word');
  let html =
    '<div style="text-align:center;margin-bottom:14px">' +
      '<div class="gko-cap">🎈 한국어 뜻에 맞는 영어 풍선을 클릭!</div>' +
      '<div class="gko-txt">' + (_em?_em+' ':'') + word.ko + '</div>' +
      '<div style="margin-top:10px"><button onclick="gameSpeakAnswer()" class="gko-listen">🔊 발음 듣기</button></div>' +
    '</div>' +
    '<div id="balloon-stage" style="position:relative;flex:1;min-height:300px;background:linear-gradient(180deg,#7dd3fc 0%,#38bdf8 48%,#bae6fd 100%);border-radius:14px;overflow:hidden;border:2px solid #bae6fd">';
  // 4개 풍선 — 가로 위치 분산, 시작 top 랜덤
  const colors = [
    {bg:'linear-gradient(135deg,#ef4444,#b91c1c)', shadow:'rgba(239,68,68,0.6)', solid:'#ef4444'},
    {bg:'linear-gradient(135deg,#3b82f6,#1d4ed8)', shadow:'rgba(59,130,246,0.6)', solid:'#3b82f6'},
    {bg:'linear-gradient(135deg,#10b981,#047857)', shadow:'rgba(16,185,129,0.6)', solid:'#10b981'},
    {bg:'linear-gradient(135deg,#f59e0b,#d97706)', shadow:'rgba(245,158,11,0.6)', solid:'#f59e0b'}
  ];
  // 🎈 따로따로 랜덤 낙하: 풍선마다 시작 높이·속도·좌우 흔들림을 다르게
  html += '<style>@keyframes balloonSway{from{transform:translateX(calc(var(--sway,1px) * -1))}to{transform:translateX(var(--sway,1px))}}</style>';
  balloons.forEach((b, i) => {
    const left = 4 + i * 22 + (Math.random() * 8 - 4); // 열 유지 + 소폭 랜덤 지터
    const startTop = -80 - Math.random() * 320;        // 각자 다른 높이에서 등장(대각선 X)
    const spd = 0.55 + Math.random() * 0.9;            // 낙하 속도 배율 제각각 (0.55~1.45)
    const sway = (Math.random() * 2.2 + 0.8).toFixed(2);
    const swayT = (Math.random() * 1.6 + 1.4).toFixed(2);
    const c = colors[i];
    html += '<div class="balloon" data-en="' + b.en + '" data-color="' + c.solid + '" data-spd="' + spd.toFixed(3) + '" onclick="gameBalloonPop(this)" ' +
      'style="position:absolute;top:' + startTop + 'px;left:' + left + '%;--sway:' + sway + 'px;animation:balloonSway ' + swayT + 's ease-in-out infinite alternate;width:90px;height:110px;' +
      'background:' + c.bg + ';border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;' +
      'box-shadow:0 8px 30px ' + c.shadow + ', inset -10px -10px 30px rgba(0,0,0,0.2);' +
      'display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;cursor:pointer;' +
      'transition:transform 0.2s">' +
      b.en +
      '<div style="position:absolute;bottom:-30px;left:50%;width:2px;height:30px;background:rgba(255,255,255,0.3);transform:translateX(-50%)"></div>' +
      '</div>';
  });
  html += '</div>' +
    '<div style="text-align:center;margin-top:10px;font-size:12px;color:#94a3b8">⏱ 풍선이 바닥에 닿기 전에 정답을 클릭!</div>';
  document.getElementById('game-area').innerHTML = html;

  // 풍선 애니메이션 — 매 50ms 마다 top + 1.5px
  let elapsed = 0;
  const SPEED = 3.5 * (GAME_STAGE_MULT[GAME_STAGE] || 1);   // 🎢 난이도 단계에 따라 낙하 속도 변화
  if (_gameState.balloonTimer) clearInterval(_gameState.balloonTimer);
  _gameState.balloonTimer = setInterval(() => {
    if (_gameState.current.popped) return;
    elapsed += 50;
    const stage = document.getElementById('balloon-stage');
    if (!stage) { clearInterval(_gameState.balloonTimer); return; }
    const balloons = stage.querySelectorAll('.balloon');
    let allFell = false;
    const bottomY = Math.max(220, stage.clientHeight - 120);   // 바닥선: 늘어난 스테이지 높이에 맞춤(student-games.html과 동일 패턴)
    balloons.forEach(bl => {
      const top = parseFloat(bl.style.top);
      const spd = parseFloat(bl.dataset.spd) || 1;   // 🎈 풍선마다 다른 속도로 따로따로 낙하
      const newTop = top + SPEED * spd;
      bl.style.top = newTop + 'px';
      if (newTop > bottomY) allFell = true;
    });
    if (allFell && !_gameState.current.popped) {
      _gameState.current.popped = true;
      clearInterval(_gameState.balloonTimer);
      const dead = _onWrong('word', _gameState.current.word);
      _gameUpdateScore();
      document.getElementById('game-feedback').innerHTML = '<span style="color:#ef4444">❌ 놓쳤어요! 정답: ' + _gameState.current.answer + '</span>';
      if(!dead) setTimeout(gameNextRound, 1500);
    }
  }, 50);
}

// 🎈 풍선 터지는 효과음 — 날카로운 노이즈 버스트 + 저음 펀치("펑!")
function gameBalloonPopSound(){
  try{
    var AC = window.AudioContext||window.webkitAudioContext; if(!AC) return;
    if(!window._gameAC) window._gameAC = new AC();
    var ac = window._gameAC; if(ac.state==='suspended'){ try{ ac.resume(); }catch(_){} }
    var t = ac.currentTime;
    // 리미터(컴프레서)+메이크업 게인 → 훨씬 크되 클리핑 방지
    var comp=ac.createDynamicsCompressor(); try{comp.threshold.value=-12;comp.knee.value=6;comp.ratio.value=16;comp.attack.value=0.001;comp.release.value=0.25;}catch(_){}
    var mk=ac.createGain(); mk.gain.value=2.5; comp.connect(mk); mk.connect(ac.destination);
    // (1) 날카로운 노이즈 버스트(더 크게)
    var dur=0.2, len=Math.floor(ac.sampleRate*dur), buf=ac.createBuffer(1,len,ac.sampleRate), d=buf.getChannelData(0);
    for(var i=0;i<len;i++){ d[i]=(Math.random()*2-1)*Math.pow(1-i/len,1.4); }
    var src=ac.createBufferSource(); src.buffer=buf;
    var hp=ac.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=500;
    var ng=ac.createGain(); ng.gain.setValueAtTime(0.0001,t); ng.gain.exponentialRampToValueAtTime(1.7,t+0.004); ng.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    src.connect(hp); hp.connect(ng); ng.connect(comp); src.start(t); src.stop(t+dur);
    // (2) 저음 펀치(더 크게)
    var o=ac.createOscillator(), og=ac.createGain();
    o.type='sine'; o.frequency.setValueAtTime(440,t); o.frequency.exponentialRampToValueAtTime(60,t+0.13);
    og.gain.setValueAtTime(0.0001,t); og.gain.exponentialRampToValueAtTime(1.5,t+0.004); og.gain.exponentialRampToValueAtTime(0.0001,t+0.17);
    o.connect(og); og.connect(comp); o.start(t); o.stop(t+0.2);
    // (3) '팡' 미드 크랙
    var o2=ac.createOscillator(), og2=ac.createGain();
    o2.type='triangle'; o2.frequency.setValueAtTime(900,t); o2.frequency.exponentialRampToValueAtTime(180,t+0.08);
    og2.gain.setValueAtTime(0.0001,t); og2.gain.exponentialRampToValueAtTime(0.9,t+0.004); og2.gain.exponentialRampToValueAtTime(0.0001,t+0.1);
    o2.connect(og2); og2.connect(comp); o2.start(t); o2.stop(t+0.12);
  }catch(_){}
}
// 🎈 풍선 터질 때 산산조각: 고무 조각+가루 파편이 사방으로 흩어지며 페이드아웃 + 살짝 플래시
function gameBalloonBurst(stage, cx, cy, color){
  try{
    if(!stage) return; var frags=[], N=22;
    for(var i=0;i<N;i++){
      var el=document.createElement('div'), shard=(i%3!==0), sz=shard?(6+Math.random()*11):(3+Math.random()*4);
      el.style.cssText='position:absolute;left:'+cx+'px;top:'+cy+'px;width:'+sz+'px;height:'+(shard?(sz*0.66):sz)+'px;background:'+color+';'+(shard?('border-radius:'+(Math.random()<0.5?'2px':'50% 50% 0 50%')):'border-radius:50%')+';pointer-events:none;will-change:transform,opacity;box-shadow:0 0 5px '+color+';z-index:6';
      stage.appendChild(el);
      var ang=Math.random()*Math.PI*2, sp=3.5+Math.random()*8.5;
      frags.push({el:el,x:cx,y:cy,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp-2.5,rot:Math.random()*360,vrot:(Math.random()-0.5)*44});
    }
    var fr=0, MAX=44;
    (function step(){ fr++; var p=fr/MAX;
      for(var i=0;i<frags.length;i++){ var f=frags[i]; f.vy+=0.6; f.x+=f.vx; f.y+=f.vy; f.rot+=f.vrot;
        f.el.style.transform='translate('+(f.x-cx)+'px,'+(f.y-cy)+'px) rotate('+f.rot+'deg)'; f.el.style.opacity=String(Math.max(0,1-p*1.05)); }
      if(fr<MAX){ requestAnimationFrame(step); } else { for(var j=0;j<frags.length;j++){ var e=frags[j].el; if(e.parentNode) e.parentNode.removeChild(e); } }
    })();
    var fl=document.createElement('div'); fl.style.cssText='position:absolute;left:'+(cx-45)+'px;top:'+(cy-45)+'px;width:90px;height:90px;border-radius:50%;background:radial-gradient(circle,'+color+'cc,transparent 70%);pointer-events:none;z-index:5;opacity:0.85';
    stage.appendChild(fl); var ff=0;
    (function flStep(){ ff++; fl.style.opacity=String(Math.max(0,0.85*(1-ff/14))); fl.style.transform='scale('+(1+ff*0.14)+')'; if(ff<14){ requestAnimationFrame(flStep); } else if(fl.parentNode){ fl.parentNode.removeChild(fl); } })();
  }catch(_){}
}
function gameBalloonPop(bl) {
  if (_gameState.current.popped) return;
  _gameState.current.popped = true;
  const en = bl.dataset.en;
  gameBalloonPopSound();                                                  // ① 먼저 크게 "펑!" 터지는 소리
  setTimeout(function(){ try{ window.gameSpeak && gameSpeak(en); }catch(_){} }, 320);  // ② 그다음 원어민 발음
  const correct = en === _gameState.current.answer;
  try{ var _bst=document.getElementById('balloon-stage'); if(_bst){ var _cx=bl.offsetLeft+bl.offsetWidth/2, _cy=bl.offsetTop+bl.offsetHeight/2; gameBalloonBurst(_bst,_cx,_cy,bl.dataset.color||'#ef4444'); } }catch(_){}  // 산산조각 파편
  bl.style.animation = 'none';   // 흔들림 애니메이션 해제 → 아래 scale 팝이 적용되도록
  bl.style.transform = 'scale(1.3)';
  bl.style.opacity = '0';
  if (_gameState.balloonTimer) clearInterval(_gameState.balloonTimer);
  if (correct) {
    const r = _onCorrect('word', _gameState.current.word, 7);
    document.getElementById('game-feedback').innerHTML = '<span style="color:#10b981">🎉 풍! +' + r.gain + '점' + (r.mult>1?(' 🔥×'+r.mult):'') + '</span>';
    _gameUpdateScore();
    if(!_gameCheckGoal()) setTimeout(gameNextRound, 1200);   // 🎯 10개 정답 → 결과 화면
  } else {
    const dead = _onWrong('word', _gameState.current.word);
    _gameUpdateScore();
    document.getElementById('game-feedback').innerHTML = '<span style="color:#ef4444">❌ 아쉬워요! 정답: ' + _gameState.current.answer + '</span>';
    if(!dead) setTimeout(gameNextRound, 1500);
  }
}

// 영상 패널 크기 조절 (1/4, 1/2, 3/4, 전체)
function vcSetVideoSize(size, btn) {
    const row = document.getElementById('vc-main-row');
    if (!row) return;
    // 🔧 (2026-07-12) pip/facepip/solo 도 함께 제거 → 사이즈바(vcSetVideoSize)와
    //   화면모드(vcScreenSet: pip/facepip/solo)가 상호배타. 예전엔 pip 를 안 지워서
    //   'video-pip + video-threequarter' 조합이 생겨 세로 레이아웃이 깨졌다.
    row.classList.remove('video-quarter', 'video-half', 'video-threequarter', 'video-full', 'video-free', 'video-pip', 'video-facepip', 'video-solo');
    // 자유 크기 모드에서 빠져나올 때 떠있던 인라인 위치/크기 제거 → 기본 분할 레이아웃 복귀
    try {
        const _vp = document.getElementById('vc-video-pane');
        if (_vp) ['top','left','width','height'].forEach(p => _vp.style.removeProperty(p));
    } catch(_){}
    row.classList.add('video-' + size);
    document.querySelectorAll('.video-size-bar button').forEach(b => {
      // PIP 버튼은 active 토글에서 제외
      if (b.id !== 'vc-pip-btn') b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
    // 칠판 캔버스가 보이면 새 폭에 맞춰 크기 조정
    setTimeout(() => { if (typeof wbResize === 'function') wbResize(); }, 280);
}

/* ⤡ 자유 크기 모드 — 영상 패널을 떠다니는 창으로 만들어 가로·세로 모두 드래그로 조절.
   - 제목줄(.video-size-bar) 드래그 = 이동
   - 우하단 그립(#vc-vp-grip) 드래그 = 크기 조절
   - 마우스/터치 공용(pointer 이벤트), 위치·크기 localStorage 저장 */
function vcClampNum(v, min, max){ return Math.max(min, Math.min(max, v)); }

function vcApplyFreeBox(box){
    const pane = document.getElementById('vc-video-pane');
    if (!pane) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.round(vcClampNum(box.width, 150, vw * 0.96));
    const h = Math.round(vcClampNum(box.height, 120, vh * 0.90));
    const left = Math.round(vcClampNum(box.left, 0, Math.max(0, vw - w)));
    const top  = Math.round(vcClampNum(box.top, 56, Math.max(56, vh - h)));
    // inline + important 로 적용해 모바일 미디어쿼리의 !important 규칙까지 확실히 덮어씀
    pane.style.setProperty('width',  w + 'px', 'important');
    pane.style.setProperty('height', h + 'px', 'important');
    pane.style.setProperty('left',   left + 'px', 'important');
    pane.style.setProperty('top',    top + 'px', 'important');
}

function vcRestoreFreeBox(){
    let box = { top: 90, left: 12, width: 300, height: 230 };
    try { const s = JSON.parse(localStorage.getItem('vc_free_box') || 'null'); if (s && s.width) box = s; } catch(_){}
    vcApplyFreeBox(box);
}

function vcSaveFreeBox(){
    const pane = document.getElementById('vc-video-pane');
    if (!pane) return;
    const r = pane.getBoundingClientRect();
    try { localStorage.setItem('vc_free_box', JSON.stringify({ top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) })); } catch(_){}
}

// 현재 보이는 크기/위치 그대로 '자유(떠있는 창)' 모드로 전환 (점프 방지)
function vcEnterFreeFromCurrent(){
    const row = document.getElementById('vc-main-row');
    const pane = document.getElementById('vc-video-pane');
    if (!row || !pane) return;
    const r = pane.getBoundingClientRect();
    row.classList.remove('video-quarter','video-half','video-threequarter','video-full');
    row.classList.add('video-free');
    document.querySelectorAll('.video-size-bar button').forEach(b => { if (b.id !== 'vc-pip-btn') b.classList.remove('active'); });
    const fb = document.getElementById('vc-free-btn'); if (fb) fb.classList.add('active');
    vcApplyFreeBox({ left: r.left, top: r.top, width: r.width, height: r.height });
    setTimeout(() => { if (typeof wbResize === 'function') wbResize(); }, 280);
}

let _vcFreeBound = false;
function vcAttachFreeHandlers(){
    if (_vcFreeBound) return; _vcFreeBound = true;
    const row  = document.getElementById('vc-main-row');
    const pane = document.getElementById('vc-video-pane');
    if (!pane || !row) return;
    const bar  = pane.querySelector('.video-size-bar');
    const grip = document.getElementById('vc-vp-grip');
    let mode = null, sx = 0, sy = 0, sLeft = 0, sTop = 0, sW = 0, sH = 0;

    function start(e, m){
        mode = m; sx = e.clientX; sy = e.clientY;
        const r = pane.getBoundingClientRect();
        sLeft = r.left; sTop = r.top; sW = r.width; sH = r.height;
        e.preventDefault();
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', end);
        document.addEventListener('pointercancel', end);
    }
    function move(e){
        if (!mode) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (mode === 'move')           vcApplyFreeBox({ left: sLeft + dx, top: sTop + dy, width: sW, height: sH });
        else if (mode === 'resize-ne') vcApplyFreeBox({ left: sLeft, top: sTop + dy, width: sW + dx, height: sH - dy }); // 우상단 그립: 위로 끌면 커짐
        else                           vcApplyFreeBox({ left: sLeft, top: sTop, width: sW + dx, height: sH + dy });
        e.preventDefault();
    }
    function end(){
        if (!mode) return;
        mode = null; vcSaveFreeBox();
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', end);
        document.removeEventListener('pointercancel', end);
    }

    // 그립(우상단)은 어느 모드에서나 동작 — 자유 모드가 아니면 현재 크기 그대로 자유 모드로 전환 후 리사이즈
    if (grip) grip.addEventListener('pointerdown', e => {
        if (!row.classList.contains('video-free')) vcEnterFreeFromCurrent();
        start(e, 'resize-ne');
    });
    // 제목줄 드래그 이동은 자유 모드일 때만
    if (bar)  bar.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return; // 버튼 클릭은 이동으로 가로채지 않음
        if (!row.classList.contains('video-free')) return;
        start(e, 'move');
    });
    // 브라우저 창 크기가 바뀌면 화면 밖으로 나간 창 보정
    window.addEventListener('resize', () => {
        if (!row.classList.contains('video-free')) return;
        const r = pane.getBoundingClientRect();
        vcApplyFreeBox({ left: r.left, top: r.top, width: r.width, height: r.height });
    });
}
// 그립은 정적 DOM이므로 즉시 바인딩(통화 진입 전이라도 안전)
try { vcAttachFreeHandlers(); } catch(_){}

window.vcToggleFreeResize = function(btn){
    const row = document.getElementById('vc-main-row');
    const pane = document.getElementById('vc-video-pane');
    if (!row || !pane) return;
    const turnOn = !row.classList.contains('video-free');
    row.classList.remove('video-quarter', 'video-half', 'video-threequarter', 'video-full', 'video-free');
    document.querySelectorAll('.video-size-bar button').forEach(b => { if (b.id !== 'vc-pip-btn') b.classList.remove('active'); });
    if (turnOn){
        row.classList.add('video-free');
        if (btn) btn.classList.add('active');
        vcRestoreFreeBox();
        vcAttachFreeHandlers();
    } else {
        ['top','left','width','height'].forEach(p => pane.style.removeProperty(p));
        const hb = document.querySelector('.video-size-bar button[onclick*="half"]');
        vcSetVideoSize('half', hb);
    }
    setTimeout(() => { if (typeof wbResize === 'function') wbResize(); }, 280);
};

// fix (2026-06-02) — 휴대폰 가로(landscape)로 들어오면 기본 영상 크기를 '3/4'로.
//   세로/PC 또는 사용자가 전체·솔로를 고른 경우는 건드리지 않음.
window.vcApplyDefaultVideoSize = function(){
    try {
        var isMobile = window.matchMedia && window.matchMedia('(max-width: 1024px)').matches;
        var isLandscape = window.matchMedia && window.matchMedia('(orientation: landscape)').matches;
        if (!(isMobile && isLandscape)) return;
        var row = document.getElementById('vc-main-row');
        if (!row) return;
        if (row.classList.contains('video-full') || row.classList.contains('video-solo')) return;
        var btn = document.querySelector('.video-size-bar button[onclick*="threequarter"]');
        vcSetVideoSize('threequarter', btn);
    } catch(_){}
};
// 회전 시에도 가로면 3/4 기본 재적용
try {
    window.addEventListener('orientationchange', function(){
        setTimeout(function(){ if (document.body.classList.contains('vc-in-call')) window.vcApplyDefaultVideoSize(); }, 350);
    });
} catch(_){}

/* 📌 PIP — 참가자 비디오를 콘텐츠 위에 띄우는 오버레이 토글.
   "다른 사람들이 잘 보이지 않아" 문제 해결.
   - 좌측 영상 패널의 모든 비디오 트랙을 참조하여 srcObject 만 복제 (별도 스트림 X)
   - 새 참가자가 들어와도 vcSyncPipVideos() 가 자동 동기화 (1초 폴링)
   - 헤더 드래그 이동 + 모서리 리사이즈 (CSS resize:both)
   - localStorage 위치·크기 저장 → 다음 입장 시 복원 */
let _vcPipActive = false;
let _vcPipSyncTimer = null;
// Phase 7l: 솔로 모드 - 본인 영상만 보이게 (다른 참가자 숨김)
window.vcSoloMode = false;
window.vcToggleSolo = function(btn){
  window.vcSoloMode = !window.vcSoloMode;
  const grid = document.getElementById('vc-video-grid');
  const localBox = document.getElementById('vc-local-box');
  if (window.vcSoloMode) {
    // 다른 모든 참가자 비디오 숨김 (본인 box 외)
    if (grid) {
      grid.querySelectorAll('.video-box').forEach(box => {
        if (box.id !== 'vc-local-box') box.style.display = 'none';
      });
    }
    // 본인 박스 풀사이즈
    if (localBox) {
      localBox.style.gridColumn = '1 / -1';
      localBox.style.gridRow = '1 / -1';
    }
    if (btn) { btn.style.background = 'rgba(168,85,247,.6)'; btn.style.color = '#fff'; }
  } else {
    if (grid) {
      grid.querySelectorAll('.video-box').forEach(box => { box.style.display = ''; });
    }
    if (localBox) { localBox.style.gridColumn = ''; localBox.style.gridRow = ''; }
    if (btn) { btn.style.background = 'rgba(168,85,247,.25)'; btn.style.color = '#d8b4fe'; }
  }
};

function vcTogglePip(btn) {
  const overlay = document.getElementById('vc-pip-overlay');
  if (!overlay) return;
  _vcPipActive = !_vcPipActive;
  overlay.classList.toggle('show', _vcPipActive);
  if (btn) btn.classList.toggle('active', _vcPipActive);
  else {
    const b = document.getElementById('vc-pip-btn');
    if (b) b.classList.toggle('active', _vcPipActive);
  }
  if (_vcPipActive) {
    vcRestorePipPos();
    vcSyncPipVideos();
    if (_vcPipSyncTimer) clearInterval(_vcPipSyncTimer);
    _vcPipSyncTimer = setInterval(vcSyncPipVideos, 1500);
    vcAttachPipDrag();
  } else {
    if (_vcPipSyncTimer) { clearInterval(_vcPipSyncTimer); _vcPipSyncTimer = null; }
    // 비디오 정리 — srcObject 참조 끊어 메모리 회수
    document.querySelectorAll('#vc-pip-body video').forEach(v => v.srcObject = null);
  }
}

/* 📌 (2026-07-13) PIP 이용 안내 — "PIP 화면 적극 이용 권장" 지시.
   숨어 있는 "📌 PIP" 버튼을 사용자가 스스로 찾기 어렵다는 피드백에 따라,
   수업 입장 후 상대방 영상이 처음 잡히는 순간 버튼을 펄스시키고 말풍선으로
   용도를 설명한다. 수업(세션)당 1회, 누적 3번까지만 보여주고 그 뒤엔 침묵. */
(function(){
  var KEY = 'mangoi_pip_tip_cnt';
  var shownThisCall = false;
  var style = document.createElement('style');
  style.textContent =
    '@keyframes vcPipNudge{0%,100%{box-shadow:0 0 0 0 rgba(252,211,77,.75)}50%{box-shadow:0 0 0 9px rgba(252,211,77,0)}}' +
    '#vc-pip-btn.vc-pip-nudge{animation:vcPipNudge 1.1s ease-in-out 5}' +
    '.vc-pip-tip{position:fixed;z-index:2147483000;max-width:250px;padding:10px 14px;border-radius:12px;' +
    'background:#1f2937;color:#fde68a;font-size:13px;font-weight:600;line-height:1.45;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.5);cursor:pointer;border:1px solid rgba(252,211,77,.5)}';
  document.head.appendChild(style);
  setInterval(function(){
    try {
      if (!document.body || !document.body.classList.contains('vc-in-call')) { shownThisCall = false; return; }
      if (shownThisCall || (typeof _vcPipActive !== 'undefined' && _vcPipActive)) return;
      var cnt = parseInt(localStorage.getItem(KEY) || '0', 10);
      if (cnt >= 3) return;
      var remote = 0;
      try { remote = Object.keys(window.vcPeerConnections || {}).length; } catch(e){}
      if (!remote) return;                                    // 상대가 들어와야 PIP 가 의미 있음
      var btn = document.getElementById('vc-pip-btn');
      if (!btn) return;
      var r = btn.getBoundingClientRect();
      if (!r.width || !r.height) return;                      // 버튼이 안 보이는 레이아웃(모바일 등)이면 안내 생략
      shownThisCall = true;
      localStorage.setItem(KEY, String(cnt + 1));
      btn.classList.add('vc-pip-nudge');
      var tip = document.createElement('div');
      tip.className = 'vc-pip-tip';
      var en = miIsEn();
      tip.textContent = en
        ? '📌 Try PIP! Keep the other person\'s face in a small floating window while you view the textbook.'
        : '📌 PIP를 눌러보세요! 교재를 보면서도 상대방 얼굴을 작은 창으로 계속 띄워둘 수 있어요.';
      tip.style.left = Math.max(8, Math.min(window.innerWidth - 260, r.left - 40)) + 'px';
      tip.style.top = (r.bottom + 10) + 'px';
      document.body.appendChild(tip);
      var gone = false;
      function cleanup(){ if (gone) return; gone = true; try { tip.remove(); btn.classList.remove('vc-pip-nudge'); } catch(e){} }
      tip.addEventListener('click', function(){ cleanup(); try { vcTogglePip(); } catch(e){} });
      setTimeout(cleanup, 12000);
    } catch(e){}
  }, 3000);
})();

/* 좌측 video-pane 의 비디오를 PIP 영역에 복제 (참조만, 스트림 추가 안 함)
   🥭 (2026-07-13) PIP에는 '상대방 1명'만 — 전체 복제 대신 vc-pip-primary(대표 상대방)
   비디오 하나만 복제한다. 내 화면·다른 참가자는 PIP에 넣지 않음(사장님 요청). */
function vcSyncPipVideos() {
  const body = document.getElementById('vc-pip-body');
  if (!body) return;
  try { vcMarkPipPrimary(); } catch(e){}
  let sources = Array.from(document.querySelectorAll('#vc-video-grid .video-box.vc-pip-primary video'));
  if (!sources.length) {
    // 마킹 전 폴백: 내 박스를 제외한 첫 원격 비디오 1개만
    sources = Array.from(document.querySelectorAll('#vc-video-grid video'))
      .filter(v => { const b = v.closest ? v.closest('.video-box') : null; return b && b.id !== 'vc-local-box'; })
      .slice(0, 1);
  }
  if (sources.length === 0) {
    body.innerHTML = '<div class="vc-pip-empty">'
      + (miIsEn()
          ? 'Other participants appear here'
          : '다른 참가자가 들어오면 여기에 표시됩니다')
      + '</div>';
    return;
  }
  // 기존 비디오 box 의 id 모음
  const existing = new Map();
  body.querySelectorAll('.video-box').forEach(b => existing.set(b.dataset.src, b));
  // 새로운 set 만들기
  const liveIds = new Set();
  sources.forEach(srcVideo => {
    const id = srcVideo.id || srcVideo.parentElement?.id || ('v_' + Math.random().toString(36).slice(2,8));
    liveIds.add(id);
    let box = existing.get(id);
    if (!box) {
      box = document.createElement('div');
      box.className = 'video-box';
      box.dataset.src = id;
      const v = document.createElement('video');
      v.autoplay = true; v.playsInline = true; v.muted = srcVideo.muted;
      box.appendChild(v);
      const labelSrc = srcVideo.parentElement?.querySelector('.video-label');
      const lbl = document.createElement('span');
      lbl.className = 'video-label';
      lbl.textContent = labelSrc ? labelSrc.textContent : (srcVideo.id || '참가자');
      box.appendChild(lbl);
      // empty placeholder 제거
      const empty = body.querySelector('.vc-pip-empty');
      if (empty) empty.remove();
      body.appendChild(box);
    }
    // srcObject 동기화 (참조 같으면 무동작)
    const v = box.querySelector('video');
    if (v.srcObject !== srcVideo.srcObject) v.srcObject = srcVideo.srcObject;
  });
  // 사라진 트랙 box 제거
  existing.forEach((box, id) => { if (!liveIds.has(id)) box.remove(); });
  // 모두 사라졌으면 empty
  if (body.children.length === 0) {
    body.innerHTML = '<div class="vc-pip-empty">'
      + (miIsEn()
          ? 'Other participants appear here'
          : '다른 참가자가 들어오면 여기에 표시됩니다')
      + '</div>';
  }
}

/* 헤더 드래그 + 위치/크기 저장 */
function vcAttachPipDrag() {
  const overlay = document.getElementById('vc-pip-overlay');
  const header = document.getElementById('vc-pip-header');
  if (!overlay || !header || header.dataset.dragBound) return;
  header.dataset.dragBound = '1';
  let dragging = false, sx=0, sy=0, ox=0, oy=0;
  header.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    const rect = overlay.getBoundingClientRect();
    ox = rect.left; oy = rect.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const nx = Math.max(8, Math.min(window.innerWidth - 80, ox + (e.clientX - sx)));
    const ny = Math.max(8, Math.min(window.innerHeight - 80, oy + (e.clientY - sy)));
    overlay.style.right = 'auto'; overlay.style.bottom = 'auto';
    overlay.style.left = nx + 'px'; overlay.style.top = ny + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    vcSavePipPos();
  });
  // 리사이즈는 CSS resize:both 가 처리 — ResizeObserver 로 저장만
  if (window.ResizeObserver) {
    new ResizeObserver(() => vcSavePipPos()).observe(overlay);
  }
}
function vcSavePipPos() {
  const overlay = document.getElementById('vc-pip-overlay');
  if (!overlay) return;
  try {
    localStorage.setItem('mangoi_pip_pos', JSON.stringify({
      left: overlay.style.left, top: overlay.style.top,
      width: overlay.style.width, height: overlay.style.height
    }));
  } catch {}
}
function vcRestorePipPos() {
  const overlay = document.getElementById('vc-pip-overlay');
  if (!overlay) return;
  try {
    const raw = localStorage.getItem('mangoi_pip_pos');
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.left)   overlay.style.left   = p.left;
    if (p.top)    overlay.style.top    = p.top;
    if (p.width)  overlay.style.width  = p.width;
    if (p.height) overlay.style.height = p.height;
    if (p.left || p.top) { overlay.style.right = 'auto'; overlay.style.bottom = 'auto'; }
  } catch {}
}

function updateUserCount(count) {
    window._vcJoinUserCount = count || 0;   // ★ (2026-07-20) 입장 자동 교재 로드가 '혼자/합류' 구분에 사용
    document.getElementById('vc-user-count').textContent = count || 0;
    // 🥭 Phase 48 — 게임 탭이 열려있고 수업이 시작되면 즉시 차단 화면
    const gameTab = document.getElementById('tab-game');
    if (gameTab && gameTab.classList.contains('active')) {
      if ((count || 0) >= 2 && typeof _gameRenderBlocked === 'function') {
        _gameRenderBlocked();
      } else if ((count || 0) < 2 && typeof gameInit === 'function' && typeof _gameState !== 'undefined') {
        // 수업 종료 (혼자 남음) → 게임 자동 재시작 (선택사항: 사용자 의도일 가능성)
        if (_gameState.started === false) gameInit();
      }
    }
    // 🧑‍🎓 (2026-08-12 Melca) AI 웜업도 게임과 같은 정책 — 학생이 먼저 열어 두고 있어도
    //   강사가 입장하면(참가자 ≥2) 즉시 잠그고, 수업이 끝나 혼자 남으면 다시 푼다.
    try {
      const wuTab = document.getElementById('tab-warmup');
      if (wuTab && wuTab.classList.contains('active') && typeof _warmupStudentBlocked === 'function') {
        if (_warmupStudentBlocked()) _warmupRenderBlocked();
        else _warmupClearBlocked();
      }
    } catch(e){}
}

/* ================================================================
   6. 칠판 (화이트보드)
   ──────────────────────────────────────────────────────────────────
   Canvas API를 사용한 실시간 공유 드로잉.
   좌표를 0~1 범위로 정규화하여 화면 크기가 달라도 동일하게 표시됩니다.
================================================================ */
let wbTool = 'pen';
let wbDrawing = false;
let wbLastX = 0, wbLastY = 0;
let wbSnapshot = null;
// ✨ AI 도형 정리: 펜 자유선을 깔끔한 도형/축으로 자동 변환 (기본 꺼짐 — 펜은 기존대로, 버튼으로 켬)
let wbAiMode = false;
let wbAiPoints = null;   // 현재 펜 획의 점 배열 [[x,y],...] (AI 모드)
// ✍️ AI 글자(손글씨 인식): 기본 꺼짐(정확도 편차 큼). 켜면 멈춘 뒤 자동 OCR.
let wbOcrMode = false;
let wbOcrPending = [];    // OCR 대기 중인 획들 [{points:[[x,y]],color,size}]
let wbOcrTimer = null;

function wbSetTool(tool) {
    wbTool = tool;
    document.querySelectorAll('.wb-toolbar button').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
}

/* 🔴 (2026-07-31) 칠판 포인터 표시 — 보내는 쪽(self)·받는 쪽 모두 이 함수로 그린다.
   1.6초 동안 갱신이 없으면 사라진다(교재 레이저와 동일). */
let _wbPtrTimers = {};
function wbReceivePointer(d) {
    var canvas = document.getElementById('wb-canvas');
    var wrap = canvas && canvas.parentElement;
    if (!canvas || !wrap) return;
    // 점은 wrap 기준 절대배치 — wrap 이 static 이면 엉뚱한 곳에 붙는다
    try { if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative'; } catch (_) {}
    var key = 'mgWbLaser_' + (d.self ? 'me_' : '') + String(d.name || 'x').replace(/[^a-zA-Z0-9가-힣]/g, '_');
    var dot = document.getElementById(key);
    if (d.hide) { if (dot) dot.remove(); return; }
    if (!dot) {
        var c  = d.color || '#ef4444';
        var op = d.self ? '.5' : '.85';
        dot = document.createElement('div');
        dot.id = key;
        dot.style.cssText = 'position:absolute;z-index:50;pointer-events:none;transform:translate(-50%,-50%);transition:left .05s linear,top .05s linear;';
        dot.innerHTML = '<span class="laser-core"></span><span class="laser-name"></span>';
        wrap.appendChild(dot);
        dot.querySelector('.laser-core').style.cssText = 'display:block;width:16px;height:16px;border-radius:50%;background:' + c + ';box-shadow:0 0 10px 3px ' + c + ';opacity:' + op + ';';
        dot.querySelector('.laser-name').style.cssText = 'position:absolute;left:14px;top:-2px;white-space:nowrap;font-size:11px;font-weight:700;color:#fff;background:' + c + ';padding:1px 6px;border-radius:8px;opacity:' + op + ';';
        dot.querySelector('.laser-name').textContent = d.name || '';
    }
    dot.style.left = (d.x * canvas.clientWidth) + 'px';
    dot.style.top  = (d.y * canvas.clientHeight) + 'px';
    if (_wbPtrTimers[key]) clearTimeout(_wbPtrTimers[key]);
    _wbPtrTimers[key] = setTimeout(function(){ var n = document.getElementById(key); if (n) n.remove(); }, 1600);
}

/* 🖍 (2026-08-08 강사 피드백 — Ana③ · Kes① 「학생 펜이 강사 화면에 안 보인다」)
   ─────────────────────────────────────────────────────────────────────────────
   [진짜 원인] 칠판은 «즉시 그리기» 캔버스라 **획 기록이 하나도 없었다**.
     교재(pdf-anno)는 pdfAnnotations[page] 에 획을 쌓아 두고 다시 그리는데,
     칠판은 받은 선을 캔버스에 칠하고 끝이었다. 그래서 캔버스가 한 번이라도
     리셋되면 학생이 그린 것이 **통째로** 사라졌다. 리셋되는 길이 세 갈래였다:
       ① `wbResize()` 가 window resize 마다 `canvas.width = ...` 를 **무조건** 대입.
          HTML 규격상 **같은 값을 넣어도 캔버스는 지워진다.** 수업은 입장 시
          자동 전체화면(vcGoFullscreen)에 들어가는데, 전체화면 진입·해제는 둘 다
          resize 를 쏜다 → 그 순간 판서가 백지가 된다.
       ② 칠판 탭이 숨어 있으면 `wrap.clientWidth === 0` → 버퍼가 0×0 이 된다.
          강사가 교재 탭에 있는 동안 학생이 그리면, 돌아왔을 때 아무것도 없다.
       ③ 강사가 칠판을 한 번도 안 열었으면 캔버스는 기본 300×150 이다.
          학생의 정규화 좌표(0~1)가 그 작은 버퍼에 그려지고, 나중에 탭을 열어
          크기가 맞춰지는 순간 `putImageData` 는 **확대하지 않으므로**
          학생 글씨가 왼쪽 위 구석에 1/3 크기로 뭉쳐 있었다.
   [해결] 획을 정규화 좌표로 기록하고, 크기가 바뀔 때마다 **다시 그린다.**
     교재 쪽과 같은 구조가 되어 리사이즈·탭 전환·전체화면 어디서도 안 지워진다.
   ⚠️ 기록은 «화면에 실제로 칠한 것» 과 1:1 이어야 한다 — 보내는 쪽·받는 쪽
      양쪽에서 같은 자리(그리는 지점)에 남긴다. 한쪽만 남기면 다시 그릴 때 어긋난다. */
window.wbOps = window.wbOps || [];
const WB_OPS_MAX = 40000;          // 90분 수업 실사용 한도. 넘으면 오래된 것부터 버린다(백지보다 낫다)
function wbRecord(op) {
    try {
        window.wbOps.push(op);
        if (window.wbOps.length > WB_OPS_MAX) window.wbOps.splice(0, window.wbOps.length - WB_OPS_MAX);
    } catch (_) {}
}
function wbClearOps() { try { window.wbOps.length = 0; } catch (_) { window.wbOps = []; } }
/** 기록된 획 한 개를 지금 캔버스 크기에 맞춰 그린다 */
function wbDrawOp(ctx, W, H, op) {
    if (!op) return;
    if (op.k === 'seg')    { wbPaintSeg(ctx, W, H, op.d); return; }
    if (op.k === 'stroke') { wbPaintStroke(ctx, W, H, op.d); return; }
    if (op.k === 'shape')  { try { wbRenderShape(ctx, op.d.shape, W, H, op.d.color || '#000', op.d.size || 3); } catch (_) {} return; }
    if (op.k === 'text')   { wbPaintText(ctx, W, H, op.d); return; }
}
/** 기록 전체를 다시 그린다 — 크기가 바뀌어도 비율이 유지된다 */
function wbRedrawAll() {
    const canvas = document.getElementById('wb-canvas');
    if (!canvas || !canvas.width || !canvas.height) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ops = window.wbOps || [];
    for (let i = 0; i < ops.length; i++) wbDrawOp(ctx, canvas.width, canvas.height, ops[i]);
}
window.wbRedrawAll = wbRedrawAll;

/* ── 실제 칠하기(순수 함수) — 수신·재그리기 양쪽이 같은 코드를 쓴다 ── */
function wbPaintSeg(ctx, W, H, data) {
    if (!data) return;
    const fx = data.fromX * W, fy = data.fromY * H;
    const tx = data.toX * W,   ty = data.toY * H;
    ctx.beginPath();
    ctx.strokeStyle = data.tool === 'eraser' ? '#ffffff' : data.color;
    ctx.lineWidth = data.tool === 'eraser' ? data.size * 3 : data.size;
    ctx.lineCap = 'round';
    if (data.tool === 'pen' || data.tool === 'eraser' || data.tool === 'line') {
        ctx.moveTo(fx, fy); ctx.lineTo(tx, ty);
    } else if (data.tool === 'rect') {
        ctx.rect(fx, fy, tx - fx, ty - fy);
    } else if (data.tool === 'circle') {
        const rx = Math.abs(tx - fx) / 2, ry = Math.abs(ty - fy) / 2;
        ctx.ellipse(fx + (tx - fx) / 2, fy + (ty - fy) / 2, rx, ry, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
}
function wbPaintStroke(ctx, W, H, data) {
    if (!data || !data.points) return;
    ctx.save();
    ctx.strokeStyle = data.color || '#000'; ctx.lineWidth = data.size || 3;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    data.points.forEach((p, i) => { const x = p[0] * W, y = p[1] * H; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
    ctx.restore();
}
function wbPaintText(ctx, W, H, data) {
    if (!data || !data.text) return;
    /* 글자 크기도 캔버스 높이에 대한 비율로 기록해 둔다(rel). 옛 메시지엔 rel 이 없으므로
       그때는 예전처럼 px 를 그대로 쓴다 — 상대 버전이 낮아도 글자가 사라지지 않는다. */
    const fontSize = data.rel ? Math.max(8, data.rel * H) : (data.fontSize || 24);
    ctx.save();
    ctx.font = '700 ' + fontSize + 'px MangoiHanSC,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';
    ctx.fillStyle = data.color || '#000000';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(data.text, data.x * W, data.y * H);
    ctx.restore();
}

function wbResize() {
    const canvas = document.getElementById('wb-canvas');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    if (!wrap) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    // 🔴 탭이 숨어 있으면 0 이 온다. 0 을 대입하면 판서가 통째로 사라진다 → 그냥 두고 나중에 맞춘다.
    if (!(w > 0 && h > 0)) return;
    // 🔴 같은 값이라도 대입하면 캔버스가 지워진다(HTML 규격) → 실제로 달라졌을 때만 손댄다.
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    // AI 프리뷰 레이어도 같은 크기로
    const ai = document.getElementById('wb-ai-layer');
    if (ai) { ai.width = w; ai.height = h; }
    wbRedrawAll();   // 지워진 자리에 기록을 새 크기로 다시 그린다
}

function wbInit() {
    const canvas = document.getElementById('wb-canvas');
    const ctx = canvas.getContext('2d');

    // 🩹 (2026-06-19) 펜이 안 그려지는 문제 수정:
    //   canvas 에 width/height 속성이 없어 드로잉 버퍼가 기본 300x150 으로 남으면,
    //   화면엔 크게 보여도 좌표가 버퍼 밖이라 잉크가 안 보임. 표시 크기에 맞춰 자동 보정(내용 보존).
    function wbFitCanvas() {
        const wrap = canvas.parentElement; if (!wrap) return;
        const w = wrap.clientWidth, h = wrap.clientHeight;
        if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
            canvas.width = w; canvas.height = h;
            const ai = document.getElementById('wb-ai-layer'); if (ai) { ai.width = w; ai.height = h; }
            /* 🖍 (2026-08-08) 예전엔 putImageData 로 픽셀을 그대로 옮겼다. 그런데 putImageData 는
               **확대·축소를 하지 않는다** — 300×150(칠판을 한 번도 안 연 상태) 에서 900×600 으로
               커지는 순간 학생 글씨가 왼쪽 위 구석에 작게 뭉쳤다. 정규화 기록으로 다시 그리면
               크기가 어떻게 바뀌어도 같은 자리·같은 비율로 살아난다. */
            wbRedrawAll();
        }
    }
    window.wbFitCanvas = wbFitCanvas;
    try { new ResizeObserver(() => wbFitCanvas()).observe(canvas.parentElement); } catch (_) {}
    wbFitCanvas();
    /* 🖍 칠판 탭이 뒤늦게 보이게 될 때(교재 ↔ 칠판 전환) 크기를 맞추고 다시 그린다.
       숨어 있는 동안 도착한 학생 획이 «보이는 순간» 화면에 나타나야 한다. */
    try {
        var _wbTabHost = document.getElementById('tab-whiteboard') || canvas.parentElement;
        new MutationObserver(function(){ setTimeout(function(){ wbFitCanvas(); wbRedrawAll(); }, 30); })
            .observe(_wbTabHost, { attributes: true, attributeFilter: ['class', 'style'] });
    } catch (_) {}

    /* 🔴 (2026-07-31 강사 요청) 칠판 레이저 포인터 ───────────────────────────────
       칠판엔 잉크를 남기지 않고 위치만 상대 화면에 점으로 보낸다.
       교재 쪽(pdfBindLaser)과 같은 규칙 — 터치·펜은 화면에 닿아 있을 때만, 마우스는 그냥 움직여도.
       보내는 사람 화면에도 흐리게 같이 그려서 "학생에게 나가고 있다"를 눈으로 확인하게 한다. */
    var _wbPtrSent = 0, _wbPtrDown = false;
    function wbPtrIdentity() {
        try { if (typeof pdfMyIdentity === 'function') return pdfMyIdentity(); } catch (_) {}
        return { name: (window.vcUsername || ''), color: '#ef4444' };
    }
    function wbPtrTrack(e) {
        if (wbTool !== 'pointer') return;
        if (e.pointerType && e.pointerType !== 'mouse' && !_wbPtrDown) return;
        var now = Date.now();
        if (now - _wbPtrSent < 45) return;              // 송신 스로틀
        _wbPtrSent = now;
        var r = canvas.getBoundingClientRect();
        if (!r.width) return;
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        var me = wbPtrIdentity();
        wbReceivePointer({ x: x, y: y, name: me.name, color: me.color, self: true });
        if (vcConn) { try { vcConn.send({ type: 'whiteboard-pointer', data: { x: x, y: y, name: me.name, color: me.color } }); } catch (_) {} }
    }
    canvas.addEventListener('pointerdown', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') { _wbPtrDown = true; wbPtrTrack(e); }
    });
    canvas.addEventListener('pointerup',     function () { _wbPtrDown = false; });
    canvas.addEventListener('pointercancel', function () { _wbPtrDown = false; });
    canvas.addEventListener('pointermove', wbPtrTrack);
    canvas.addEventListener('pointerleave', function () {
        _wbPtrDown = false;
        if (wbTool !== 'pointer') return;
        var me = wbPtrIdentity();
        wbReceivePointer({ hide: true, name: me.name, self: true });
        if (vcConn) { try { vcConn.send({ type: 'whiteboard-pointer', data: { hide: true, name: me.name } }); } catch (_) {} }
    });

    canvas.addEventListener('mousedown', e => {
        if (wbTool === 'pointer') return;   // 포인터 모드에선 칠판에 아무것도 그리지 않는다
        /* ✋ (2026-08-07 Kaye 1번) "학생이 «보드»와 교재에 여전히 그린다"
           교재(pdf-anno)에는 2026-07-28 에 잠금 게이트를 넣었는데 칠판에는 «아예 없었다».
           터치·펜 입력도 전부 이 mousedown 으로 합성돼 들어오므로 여기 한 곳이면 전부 막힌다. */
        if (window.__pdfStudentDrawLock && !(typeof vcIsStaffNow === 'function' ? vcIsStaffNow()
                : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'))) {
            e.preventDefault();
            if (!window.__wbLockToastAt || Date.now() - window.__wbLockToastAt > 4000) {
                window.__wbLockToastAt = Date.now();
                var _wen = (typeof getLang === 'function' && getLang() === 'en');
                if (typeof mangoToast === 'function') mangoToast(_wen ? 'The teacher has locked drawing.' : '선생님이 필기를 잠갔어요.');
            }
            return;
        }
        wbFitCanvas();   // 그리기 직전 버퍼 크기 보정(불일치 시에만 → 내용 유지)
        // ph268: 텍스트 도구 — 클릭 위치에 input 띄우기
        if (wbTool === 'text') {
            e.preventDefault();
            const rect2 = canvas.getBoundingClientRect();
            const cx = e.clientX - rect2.left;
            const cy = e.clientY - rect2.top;
            const color = document.getElementById('wb-color').value;
            const size = parseInt(document.getElementById('wb-size').value) || 3;
            const fontSize = Math.max(16, size * 8);
            const old = document.getElementById('ph268-wb-textinput');
            if (old) old.remove();
            const inp = document.createElement('input');
            inp.id = 'ph268-wb-textinput';
            inp.type = 'text';
            inp.placeholder = '타자 후 Enter';
            inp.style.cssText = 'position:absolute;z-index:99999;left:' + e.clientX + 'px;top:' + (e.clientY - fontSize) + 'px;font-size:' + fontSize + 'px;color:' + color + ';background:rgba(255,255,255,0.95);border:2px dashed ' + color + ';padding:2px 6px;border-radius:4px;font-family:inherit;font-weight:700;outline:none;min-width:120px';
            document.body.appendChild(inp);
            inp.focus();
            function commit(){
                const txt = inp.value.trim();
                inp.remove();
                if (!txt) return;
                // 🖍 글자 크기도 «캔버스 높이에 대한 비율»(rel)을 함께 실어 보낸다 —
                //    px 만 보내면 화면 크기가 다른 상대(휴대폰)에서 글자만 엉뚱하게 크거나 작다.
                const _txtData = { text: txt, x: cx / canvas.width, y: cy / canvas.height, color, fontSize,
                                   rel: canvas.height ? (fontSize / canvas.height) : 0 };
                wbRecord({ k: 'text', d: _txtData });
                ctx.save();
                ctx.font = '700 ' + fontSize + 'px MangoiHanSC,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';
                ctx.fillStyle = color;
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(txt, cx, cy);
                ctx.restore();
                // 공유
                if (vcConn) {
                    try { vcConn.send({ type: 'whiteboard-text', data: _txtData }); } catch(_){}
                }
            }
            inp.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
                else if (ev.key === 'Escape') { inp.remove(); }
            });
            inp.addEventListener('blur', commit);
            return;
        }
        wbDrawing = true;
        const rect = canvas.getBoundingClientRect();
        wbLastX = e.clientX - rect.left;
        wbLastY = e.clientY - rect.top;
        if (['line','rect','circle'].includes(wbTool)) {
            wbSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
        // ✨ AI 모드 펜: 점 수집 시작 (메인 캔버스/전송은 mouseup 에서 정리 후 한 번에)
        if (wbTool === 'pen' && (wbAiMode || wbOcrMode)) { wbAiPoints = [[wbLastX, wbLastY]]; }
    });

    canvas.addEventListener('mousemove', e => {
        if (!wbDrawing) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const color = document.getElementById('wb-color').value;
        const size = parseInt(document.getElementById('wb-size').value);

        // ✨ AI 모드 펜: 메인 캔버스에 그리지 않고 점만 모아 프리뷰 레이어에 표시
        if (wbTool === 'pen' && (wbAiMode || wbOcrMode) && wbAiPoints) {
            wbAiPoints.push([x, y]);
            wbAiPreview(color, size);
            wbLastX = x; wbLastY = y;
            return;
        }

        if (wbTool === 'pen' || wbTool === 'eraser') {
            ctx.beginPath();
            ctx.moveTo(wbLastX, wbLastY);
            ctx.lineTo(x, y);
            ctx.strokeStyle = wbTool === 'eraser' ? '#ffffff' : color;
            ctx.lineWidth = wbTool === 'eraser' ? size * 3 : size;
            ctx.lineCap = 'round';
            ctx.stroke();

            // 정규화된 좌표를 서버로 전송 (다른 참가자에게 공유) + 내 기록에도 남긴다
            const _seg = {
                tool: wbTool,
                fromX: wbLastX / canvas.width,
                fromY: wbLastY / canvas.height,
                toX: x / canvas.width,
                toY: y / canvas.height,
                color, size
            };
            wbRecord({ k: 'seg', d: _seg });   // 🖍 내 획도 기록해야 리사이즈 후 남는다
            if (vcConn) vcConn.send({ type: 'whiteboard-draw', data: _seg });
            wbLastX = x; wbLastY = y;
        } else if (wbSnapshot) {
            ctx.putImageData(wbSnapshot, 0, 0);
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.beginPath();
            if (wbTool === 'line') {
                ctx.moveTo(wbLastX, wbLastY);
                ctx.lineTo(x, y);
            } else if (wbTool === 'rect') {
                ctx.rect(wbLastX, wbLastY, x - wbLastX, y - wbLastY);
            } else if (wbTool === 'circle') {
                const rx = Math.abs(x - wbLastX) / 2;
                const ry = Math.abs(y - wbLastY) / 2;
                ctx.ellipse(wbLastX + (x - wbLastX)/2, wbLastY + (y - wbLastY)/2, rx, ry, 0, 0, Math.PI*2);
            }
            ctx.stroke();
        }
    });

    canvas.addEventListener('mouseup', e => {
        // ✨ AI 모드 펜: 모은 점을 도형/축으로 인식해 정리 후 메인 캔버스에 그리고 공유
        if (wbDrawing && wbTool === 'pen' && (wbAiMode || wbOcrMode) && wbAiPoints) {
            try { wbFinalizeAiStroke(); } catch (err) { console.warn('[wb-ai] finalize 실패, 원본 잉크로 폴백', err); try { wbCommitRawStroke(); } catch(_){} }
            wbDrawing = false; wbAiPoints = null; wbSnapshot = null;
            return;
        }
        if (wbDrawing && ['line','rect','circle'].includes(wbTool)) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const _fig = {
                tool: wbTool,
                fromX: wbLastX / canvas.width, fromY: wbLastY / canvas.height,
                toX: x / canvas.width, toY: y / canvas.height,
                color: document.getElementById('wb-color').value,
                size: parseInt(document.getElementById('wb-size').value)
            };
            /* 🖍 도형은 미리보기(putImageData 스냅샷)로만 그려져 있어 «확정된 도형» 이 기록에 없었다.
               기록에 남겨야 다시 그릴 때 살아난다. 스냅샷 방식이라 화면엔 이미 그려져 있다. */
            wbRecord({ k: 'seg', d: _fig });
            if (vcConn) vcConn.send({ type: 'whiteboard-draw', data: _fig });
        }
        wbDrawing = false;
        wbSnapshot = null;
    });

    // 모바일/펜 입력 — (2026-06-19) 합성 마우스 이벤트(touch→mouse)가 폰에서 불안정해 칠판 필기가 안 되던 문제 수정.
    //   Pointer Events 로 통일(터치·펜만 처리, 마우스는 위의 네이티브 mouse 핸들러가 담당 → 데스크톱 중복 방지).
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch(_){}
      canvas.dispatchEvent(new MouseEvent('mousedown', { clientX:e.clientX, clientY:e.clientY }));
    }, {passive:false});
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') return;
      if (!wbDrawing) return;
      e.preventDefault();
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX:e.clientX, clientY:e.clientY }));
    }, {passive:false});
    canvas.addEventListener('pointerup', e => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      canvas.dispatchEvent(new MouseEvent('mouseup', {}));
    }, {passive:false});
    canvas.addEventListener('pointercancel', () => { canvas.dispatchEvent(new MouseEvent('mouseup', {})); });

    window.addEventListener('resize', wbResize);
    // 교재 자동 fit — 패널 크기가 바뀌면(가로 회전·영상폭 1/4·1/2·3/4 변경·인콜 진입 등)
    // 1·2페이지 모드 모두 화면에 꽉 차게 다시 렌더. (기존엔 2페이지 모드에서만 재렌더돼 작게 남았음)
    (function(){
      var t = null, lastW = 0, lastH = 0;
      function refit(force){
        if (!pdfDoc) return;
        var w = document.getElementById('pdf-scroll-wrap');
        if (!w) return;
        var cw = w.clientWidth, ch = w.clientHeight;
        if (!force && cw === lastW && ch === lastH) return;   // 실제 크기 변화 없으면 무시(루프 방지)
        lastW = cw; lastH = ch;
        clearTimeout(t);
        t = setTimeout(function(){ try { pdfRender(); } catch(_){} }, 120);
      }
      window.pdfRefit = refit;
      window.addEventListener('resize', function(){ refit(); });
      window.addEventListener('orientationchange', function(){ setTimeout(function(){ refit(true); }, 250); });
      if (window.ResizeObserver) {
        try {
          var wrapEl = document.getElementById('pdf-scroll-wrap');
          if (wrapEl) new ResizeObserver(function(){ refit(); }).observe(wrapEl);
        } catch(_){}
      }
    })();
}

/* ================================================================
   ✨ 칠판 AI 도형/축 정리 (1단계 — 클라이언트 기하 인식)
   ──────────────────────────────────────────────────────────────────
   펜으로 그린 자유선을 직선·사각형·원/타원·삼각형·좌표축으로 자동 변환.
   인식 실패(곡선/글씨)는 원본 잉크 그대로 유지. AI 끄면 기존 동작과 동일.
   결과는 whiteboard-shape / whiteboard-stroke 로 상대에게 동기화.
================================================================ */
/* ✨ (2026-07-30 강사 피드백 Kaye 11번) "AI 도구의 도형·쓰기가 작동하지 않는다"
   [원인] 두 기능은 만들어져 있지만 `wbTool === 'pen'` 일 때만 동작한다(17402·17414·17466행).
          형광펜·지우개·텍스트 등 다른 도구가 선택돼 있으면 버튼을 켜도 아무 일이 없고,
          버튼에는 그 설명이 없어 "고장"으로 보였다.
   [해결] 켤 때 펜이 아니면 자동으로 펜으로 바꿔 준다 — 켜면 바로 되게.
   ⚠️ wbSetTool() 은 내부에서 event.target 을 쓰므로 프로그램에서 부르면 오류가 난다 → 직접 처리. */
function wbEnsurePenForAi(){
  try {
    if (typeof wbTool !== 'undefined' && wbTool === 'pen') return false;
    wbTool = 'pen';
    document.querySelectorAll('.wb-toolbar button').forEach(function(b){ b.classList.remove('active'); });
    var pen = document.querySelector('.wb-toolbar button[onclick*="wbSetTool(\'pen\')"]');
    if (pen) pen.classList.add('active');
    return true;
  } catch(_) { return false; }
}
function wbToggleAi(btn){
  wbAiMode = !wbAiMode;
  var switched = wbAiMode ? wbEnsurePenForAi() : false;
  // 칠판·교재 양쪽 토글 버튼 상태 동기화
  ['wb-ai-btn','pdf-ai-btn'].forEach(id => { const b = document.getElementById(id); if (b) b.classList.toggle('active', wbAiMode); });
  var _en = (typeof getLang === 'function' && getLang() === 'en');
  try {
    if (typeof showToast === 'function') showToast(
      wbAiMode
        ? (switched ? (_en ? 'AI Shapes on - switched to the pen' : '✨ AI 도형 정리 켜짐 — 펜으로 바꿨어요')
                    : (_en ? 'AI Shapes on - draw with the pen' : '✨ AI 도형 정리 켜짐 (펜으로 그리세요)'))
        : (_en ? 'AI Shapes off' : 'AI 도형 정리 꺼짐 (자유 필기)'));
  } catch(_){}
}

// OCR 대기 중인 획들만 프리뷰 레이어에 표시
function wbDrawPending(){
  const ai = document.getElementById('wb-ai-layer');
  if (!ai) return;
  const c = ai.getContext('2d');
  c.clearRect(0, 0, ai.width, ai.height);
  if (!wbOcrPending || wbOcrPending.length === 0) return;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.globalAlpha = 0.7;
  for (const s of wbOcrPending){
    c.strokeStyle = s.color; c.lineWidth = s.size;
    c.beginPath();
    s.points.forEach((p, i) => { if (i === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]); });
    c.stroke();
  }
  c.restore();
}
// 진행 중 펜 획 + 대기 중 손글씨를 프리뷰 레이어에 표시
function wbAiPreview(color, size){
  const ai = document.getElementById('wb-ai-layer');
  if (!ai) return;
  wbDrawPending();
  if (!wbAiPoints) return;
  const c = ai.getContext('2d');
  c.save();
  c.strokeStyle = color; c.globalAlpha = 0.45;
  c.lineWidth = size; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  wbAiPoints.forEach((p, i) => { if (i === 0) c.moveTo(p[0], p[1]); else c.lineTo(p[0], p[1]); });
  c.stroke();
  c.restore();
}

// 인식 실패 시: 원본 자유선을 메인 캔버스에 그리고 상대에게 전송
function wbCommitRawStroke(){
  const canvas = document.getElementById('wb-canvas');
  const ctx = canvas.getContext('2d');
  const ai = document.getElementById('wb-ai-layer');
  if (ai) ai.getContext('2d').clearRect(0, 0, ai.width, ai.height);
  if (!wbAiPoints || wbAiPoints.length === 0) return;
  const color = document.getElementById('wb-color').value;
  const size = parseInt(document.getElementById('wb-size').value) || 3;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = size; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  wbAiPoints.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
  ctx.stroke();
  ctx.restore();
  const pn = wbAiPoints.map(p => [p[0] / canvas.width, p[1] / canvas.height]);
  wbRecord({ k: 'stroke', d: { points: pn, color, size } });   // 🖍 리사이즈 후에도 남게
  if (vcConn) { try { vcConn.send({ type: 'whiteboard-stroke', data: { points: pn, color, size } }); } catch(_){} }
}

// 펜 획 마무리 — 도형 인식(도형 모드) 후 정리, 아니면 OCR 대기 또는 원본 잉크
function wbFinalizeAiStroke(){
  const canvas = document.getElementById('wb-canvas');
  const ctx = canvas.getContext('2d');
  const color = document.getElementById('wb-color').value;
  const size = parseInt(document.getElementById('wb-size').value) || 3;
  const shape = wbAiMode ? wbDetectShape(wbAiPoints, canvas.width, canvas.height) : null;
  if (shape) {
    wbRenderShape(ctx, shape, canvas.width, canvas.height, color, size);
    wbRecord({ k: 'shape', d: { shape, color, size } });   // 🖍 리사이즈 후에도 남게
    if (vcConn) { try { vcConn.send({ type: 'whiteboard-shape', data: { shape, color, size } }); } catch(_){} }
    const names = { line:'직선', rect:'사각형', ellipse:'원', triangle:'삼각형', axes:'좌표축' };
    try { if (typeof showToast === 'function') showToast('✨ ' + (names[shape.t] || '도형') + '(으)로 정리했어요'); } catch(_){}
    wbDrawPending();   // 남은 대기 손글씨만 다시 표시
  } else if (wbOcrMode) {
    // ✍️ 손글씨 후보 — 대기열에 넣고 멈춤 감지 후 OCR
    wbOcrPending.push({ points: wbAiPoints.slice(), color, size });
    wbDrawPending();
    wbScheduleOcr();
  } else {
    wbCommitRawStroke();
  }
}

// ── ✍️ 손글씨 → 글자 (Workers AI OCR) ──
function wbToggleOcr(btn){
  wbOcrMode = !wbOcrMode;
  var switched = wbOcrMode ? wbEnsurePenForAi() : false;   // 펜일 때만 동작 → 켜면 펜으로 바꿔 준다
  if (btn) btn.classList.toggle('active', wbOcrMode);
  if (!wbOcrMode){
    if (wbOcrTimer){ clearTimeout(wbOcrTimer); wbOcrTimer = null; }
    if (wbOcrPending.length){ wbCommitPendingAsInk(wbOcrPending); wbOcrPending = []; wbDrawPending(); }
  }
  var _en = (typeof getLang === 'function' && getLang() === 'en');
  try {
    if (typeof showToast === 'function') showToast(
      wbOcrMode
        ? (switched ? (_en ? 'AI Text on - switched to the pen. Write, then pause.' : '✍️ 손글씨 인식 켜짐 — 펜으로 바꿨어요 (쓰고 잠시 멈추면 변환)')
                    : (_en ? 'AI Text on - write with the pen, then pause' : '✍️ 손글씨 인식 켜짐 (펜으로 쓰고 잠시 멈추면 변환)'))
        : (_en ? 'AI Text off' : '손글씨 인식 꺼짐'));
  } catch(_){}
}
function wbScheduleOcr(){
  if (wbOcrTimer) clearTimeout(wbOcrTimer);
  wbOcrTimer = setTimeout(function(){ wbRunOcr().catch(()=>{}); }, 1700);
}
// 대기 획들을 원본 잉크로 확정(메인 캔버스) + 상대 전송
function wbCommitPendingAsInk(pending){
  const canvas = document.getElementById('wb-canvas');
  const ctx = canvas.getContext('2d');
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of pending){
    ctx.strokeStyle = s.color; ctx.lineWidth = s.size;
    ctx.beginPath();
    s.points.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.stroke();
    const pn = s.points.map(p => [p[0] / canvas.width, p[1] / canvas.height]);
    wbRecord({ k: 'stroke', d: { points: pn, color: s.color, size: s.size } });   // 🖍 리사이즈 후에도 남게
    if (vcConn) { try { vcConn.send({ type: 'whiteboard-stroke', data: { points: pn, color: s.color, size: s.size } }); } catch(_){} }
  }
  ctx.restore();
}
async function wbRunOcr(){
  wbOcrTimer = null;
  if (!wbOcrPending.length) return;
  const pending = wbOcrPending; wbOcrPending = [];   // 스냅샷 — 이후 입력은 새 그룹
  let minX=1e9, minY=1e9, maxX=-1e9, maxY=-1e9;
  for (const s of pending) for (const p of s.points){
    if (p[0]<minX) minX=p[0]; if (p[1]<minY) minY=p[1];
    if (p[0]>maxX) maxX=p[0]; if (p[1]>maxY) maxY=p[1];
  }
  const pad = 14;
  minX-=pad; minY-=pad; maxX+=pad; maxY+=pad;
  const bw = Math.max(1, maxX-minX), bh = Math.max(1, maxY-minY);
  // 정규화 렌더: 글씨 높이를 일정(280px)하게 키우고 여백·굵은 획으로 가독성↑ → 인식률↑
  const targetH = 280;
  let isc = targetH / bh;
  if (bw*isc > 2000) isc = 2000 / bw;        // 가로가 너무 길면 제한
  const padPx = Math.round(targetH*0.18);
  const off = document.createElement('canvas');
  off.width = Math.round(bw*isc) + padPx*2;
  off.height = Math.round(bh*isc) + padPx*2;
  const oc = off.getContext('2d');
  oc.fillStyle = '#ffffff'; oc.fillRect(0, 0, off.width, off.height);
  oc.strokeStyle = '#000000'; oc.lineWidth = Math.max(7, targetH*0.05); oc.lineCap = 'round'; oc.lineJoin = 'round';
  for (const s of pending){
    oc.beginPath();
    s.points.forEach((p, i) => { const x = padPx + (p[0]-minX)*isc, y = padPx + (p[1]-minY)*isc; if (i===0) oc.moveTo(x,y); else oc.lineTo(x,y); });
    oc.stroke();
  }
  let text = '';
  try {
    const blob = await new Promise(res => off.toBlob(res, 'image/png'));
    if (blob){
      const resp = await fetch('/api/wb-ocr', { method:'POST', headers:{ 'Content-Type':'image/png' }, body: blob });
      const j = await resp.json();
      text = (j && j.text) ? String(j.text).trim() : '';
    }
  } catch(_){ text = ''; }
  const canvas = document.getElementById('wb-canvas');
  const ctx = canvas.getContext('2d');
  if (text){
    const fontSize = Math.max(18, Math.min(64, bh*0.7));
    const color = (pending[0] && pending[0].color) || '#000';
    const tx = minX + pad, ty = minY + pad;
    ctx.save();
    ctx.font = '700 ' + fontSize + 'px MangoiHanSC,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';
    ctx.fillStyle = color; ctx.textBaseline = 'top';
    ctx.fillText(text, tx, ty);
    ctx.restore();
    const _ocrData = { text, x: tx/canvas.width, y: (ty+fontSize)/canvas.height, color, fontSize,
                       rel: canvas.height ? (fontSize / canvas.height) : 0 };
    wbRecord({ k: 'text', d: _ocrData });   // 🖍 리사이즈 후에도 남게
    if (vcConn) { try { vcConn.send({ type:'whiteboard-text', data:_ocrData }); } catch(_){} }
    try { if (typeof showToast === 'function') showToast('✍️ “' + text + '” 로 인식'); } catch(_){}
  } else {
    wbCommitPendingAsInk(pending);
  }
  wbDrawPending();
}

// ── 기하 헬퍼 ──
function wbDist(a, b){ return Math.hypot(a[0]-b[0], a[1]-b[1]); }
function wbPerp(p, a, b){
  const dx = b[0]-a[0], dy = b[1]-a[1];
  const L2 = dx*dx + dy*dy;
  if (L2 === 0) return wbDist(p, a);
  let t = ((p[0]-a[0])*dx + (p[1]-a[1])*dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy));
}
function wbRDP(pts, eps){
  if (pts.length < 3) return pts.slice();
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length-1; i++){
    const d = wbPerp(pts[i], pts[0], pts[pts.length-1]);
    if (d > dmax){ dmax = d; idx = i; }
  }
  if (dmax > eps){
    const left = wbRDP(pts.slice(0, idx+1), eps);
    const right = wbRDP(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length-1]];
}
function wbAngleDeg(a, b, c){
  const v1 = [a[0]-b[0], a[1]-b[1]], v2 = [c[0]-b[0], c[1]-b[1]];
  const m1 = Math.hypot(v1[0], v1[1]), m2 = Math.hypot(v2[0], v2[1]);
  if (m1 === 0 || m2 === 0) return 0;
  let cos = (v1[0]*v2[0] + v1[1]*v2[1]) / (m1*m2);
  cos = Math.max(-1, Math.min(1, cos));
  return Math.acos(cos) * 180 / Math.PI;
}
function wbLooksRect(simp){
  const c = simp.slice(0, simp.length-1); // 닫힘 중복 제거
  if (c.length < 4) return false;
  let ok = 0;
  for (let i = 0; i < c.length; i++){
    const a = c[(i-1+c.length)%c.length], b = c[i], d = c[(i+1)%c.length];
    if (Math.abs(wbAngleDeg(a, b, d) - 90) < 25) ok++;
  }
  return ok >= Math.min(4, c.length);
}

// ── 개선된 인식 헬퍼: 리샘플링 + 경로길이 + 다각형 면적 ──
function wbPathLen(p){ let L=0; for (let i=1;i<p.length;i++) L+=wbDist(p[i-1],p[i]); return L; }
function wbResample(p, n){
  if (p.length < 2) return p.slice();
  const src = p.map(q => [q[0], q[1]]);   // 복사(원본 보존)
  const L = wbPathLen(src), step = L/(n-1);
  if (L === 0) return src;
  const out = [src[0]]; let d = 0;
  for (let i=1;i<src.length;i++){
    let seg = wbDist(src[i-1], src[i]);
    while (d+seg >= step && out.length < n){
      const t = (step-d)/seg;
      const nx = src[i-1][0] + t*(src[i][0]-src[i-1][0]);
      const ny = src[i-1][1] + t*(src[i][1]-src[i-1][1]);
      out.push([nx, ny]); src[i-1] = [nx, ny]; seg = wbDist(src[i-1], src[i]); d = 0;
    }
    d += seg;
  }
  while (out.length < n) out.push(src[src.length-1]);
  return out;
}
function wbPolyArea(p){ let a=0; for (let i=0;i<p.length;i++){ const j=(i+1)%p.length; a+=p[i][0]*p[j][1]-p[j][0]*p[i][1]; } return Math.abs(a)/2; }
function wbHasArrowHead(raw, start, end, diag){
  const n = raw.length; if (n < 8) return false;
  const tail = raw.slice(Math.max(0, n - Math.round(n*0.22)));
  let maxOff = 0; for (const p of tail){ const d = wbPerp(p, start, end); if (d > maxOff) maxOff = d; }
  return maxOff > diag*0.06 && maxOff < diag*0.30;
}

// 점 배열 → 정규화된 도형 객체(또는 null) — 민감/견고 버전(면적 기반 원형도)
function wbDetectShape(rawPts, W, H){
  if (!rawPts || rawPts.length < 5) return null;
  const pts = wbResample(rawPts, 64);
  let minX=1e9, minY=1e9, maxX=-1e9, maxY=-1e9;
  for (const p of pts){
    if (p[0]<minX) minX=p[0]; if (p[1]<minY) minY=p[1];
    if (p[0]>maxX) maxX=p[0]; if (p[1]>maxY) maxY=p[1];
  }
  const w = maxX-minX, h = maxY-minY, diag = Math.hypot(w, h);
  if (diag < 22) return null;
  const aspect = Math.min(w,h) / Math.max(w,h);
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
  const start = pts[0], end = pts[pts.length-1];
  const closed = wbDist(start, end) < diag*0.32;
  const norm = (x, y) => [x/W, y/H];

  // 직선 / 화살표 (열림 + 직선성)
  let dev = 0; for (const p of pts){ const d = wbPerp(p, start, end); if (d > dev) dev = d; }
  if (!closed && dev/diag < 0.12){
    const a = norm(start[0], start[1]), b = norm(end[0], end[1]);
    if (wbHasArrowHead(rawPts, start, end, diag)) return { t:'arrow', x1:a[0], y1:a[1], x2:b[0], y2:b[1] };
    return { t:'line', x1:a[0], y1:a[1], x2:b[0], y2:b[1] };
  }

  const simp = wbRDP(pts, diag*0.045);
  const N = simp.length;

  if (!closed){
    // 좌표축 (ㄱ/L자: 코너 1개, ~90°, 두 팔 충분히 김)
    if (N === 3){
      const ang = wbAngleDeg(simp[0], simp[1], simp[2]);
      const l1 = wbDist(simp[0], simp[1]), l2 = wbDist(simp[1], simp[2]);
      if (Math.abs(ang-90) < 34 && l1 > diag*0.28 && l2 > diag*0.28){
        const o = simp[1], a1 = simp[0], a2 = simp[2];
        const horiz = Math.abs(a1[0]-o[0]) > Math.abs(a2[0]-o[0]) ? a1 : a2;
        const vert  = horiz === a1 ? a2 : a1;
        const oo = norm(o[0], o[1]);
        return { t:'axes', ox:oo[0], oy:oo[1], hx:horiz[0]/W, vy:vert[1]/H };
      }
    }
    return null;
  }

  // 닫힌 도형: "실제 꺾이는 코너(예각) 개수"로 분류 — 사각형이 원으로 오인되지 않도록
  const area = wbPolyArea(pts), peri = wbPathLen(pts);
  const circ = peri > 0 ? (4*Math.PI*area)/(peri*peri) : 0;
  const poly = simp.slice(0, Math.max(1, simp.length - 1)); // 닫힘 중복 제거 → 고유 코너
  const sharp = wbSharpCorners(poly, 150);                  // 꺾임 > 30°(=각<150°) 인 코너만
  const sc = sharp.length;

  // 삼각형 (꺾이는 코너 3개)
  if (sc === 3){
    const p = sharp.map(q => norm(q[0], q[1]));
    return { t:'triangle', pts:[p[0], p[1], p[2]] };
  }
  // 사각형 (꺾이는 코너 4개 — 직각이면 bbox 사각형, 아니면 기울어진 4각형)
  if (sc === 4){
    let ok = 0;
    for (let i = 0; i < 4; i++){
      const a = sharp[(i+3)%4], b = sharp[i], c = sharp[(i+1)%4];
      if (Math.abs(wbAngleDeg(a, b, c) - 90) < 30) ok++;
    }
    if (ok >= 3){ const o = norm(minX, minY); return { t:'rect', x:o[0], y:o[1], w:w/W, h:h/H }; }
    const q = sharp.map(p2 => norm(p2[0], p2[1]));
    return { t:'quad', pts:q };
  }
  // 원/타원 (날카로운 코너가 거의 없고 둥근 정도면)
  if (sc <= 2 && circ > 0.62){
    const o = norm(cx, cy);
    if (aspect > 0.80){ const r = (w+h)/4; return { t:'ellipse', cx:o[0], cy:o[1], rx:r/W, ry:r/H }; }
    return { t:'ellipse', cx:o[0], cy:o[1], rx:(w/2)/W, ry:(h/2)/H };
  }
  // 5각 이상이라도 충분히 둥글면 타원으로 보정
  if (sc >= 5 && circ > 0.74){ const o = norm(cx, cy); return { t:'ellipse', cx:o[0], cy:o[1], rx:(w/2)/W, ry:(h/2)/H }; }
  return null;
}
// 다각형 꼭짓점 중 "꺾임이 큰(예각) 코너"만 추림 (각 < maxAngle)
function wbSharpCorners(poly, maxAngle){
  const out = [];
  const n = poly.length;
  if (n < 3) return poly.slice();
  for (let i = 0; i < n; i++){
    const a = poly[(i-1+n)%n], b = poly[i], c = poly[(i+1)%n];
    if (wbAngleDeg(a, b, c) < maxAngle) out.push(b);
  }
  return out;
}

// 정규화 도형 객체를 캔버스에 렌더 (로컬/원격 공통)
function wbRenderShape(ctx, s, W, H, color, size){
  ctx.save();
  ctx.strokeStyle = color || '#000'; ctx.lineWidth = size || 3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.t === 'line'){
    ctx.beginPath(); ctx.moveTo(s.x1*W, s.y1*H); ctx.lineTo(s.x2*W, s.y2*H); ctx.stroke();
  } else if (s.t === 'arrow'){
    ctx.beginPath(); ctx.moveTo(s.x1*W, s.y1*H); ctx.lineTo(s.x2*W, s.y2*H); ctx.stroke();
    wbArrowHead(ctx, s.x1*W, s.y1*H, s.x2*W, s.y2*H, size || 3);
  } else if (s.t === 'rect'){
    ctx.strokeRect(s.x*W, s.y*H, s.w*W, s.h*H);
  } else if (s.t === 'quad'){
    ctx.beginPath();
    ctx.moveTo(s.pts[0][0]*W, s.pts[0][1]*H);
    for (let i=1;i<s.pts.length;i++) ctx.lineTo(s.pts[i][0]*W, s.pts[i][1]*H);
    ctx.closePath(); ctx.stroke();
  } else if (s.t === 'ellipse'){
    ctx.beginPath(); ctx.ellipse(s.cx*W, s.cy*H, Math.max(1, s.rx*W), Math.max(1, s.ry*H), 0, 0, Math.PI*2); ctx.stroke();
  } else if (s.t === 'triangle'){
    ctx.beginPath();
    ctx.moveTo(s.pts[0][0]*W, s.pts[0][1]*H);
    ctx.lineTo(s.pts[1][0]*W, s.pts[1][1]*H);
    ctx.lineTo(s.pts[2][0]*W, s.pts[2][1]*H);
    ctx.closePath(); ctx.stroke();
  } else if (s.t === 'axes'){
    const ox = s.ox*W, oy = s.oy*H, hx = s.hx*W, vy = s.vy*H;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(hx, oy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, vy); ctx.stroke();
    wbArrowHead(ctx, ox, oy, hx, oy, size || 3);
    wbArrowHead(ctx, ox, oy, ox, vy, size || 3);
  }
  ctx.restore();
}
function wbArrowHead(ctx, fx, fy, tx, ty, size){
  const ang = Math.atan2(ty-fy, tx-fx);
  const len = Math.max(9, size*3);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - len*Math.cos(ang-0.42), ty - len*Math.sin(ang-0.42));
  ctx.moveTo(tx, ty);
  ctx.lineTo(tx - len*Math.cos(ang+0.42), ty - len*Math.sin(ang+0.42));
  ctx.stroke();
}

/* 🖍 (2026-08-08) 수신 4종은 «칠하기 + 기록» 으로 통일한다.
   기록이 없으면 캔버스가 한 번만 리셋돼도(전체화면·탭 전환·창 크기) 학생 획이 영영 사라진다.
   칠하는 코드는 wbPaint* 하나만 쓴다 — 재그리기와 수신이 갈라지면 «다시 그리니 모양이 다른»
   어긋남이 난다. 화면이 아직 0×0(칠판 탭이 숨음)이어도 **기록은 반드시 남긴다.** */
// 상대가 정리한 도형 수신
function wbReceiveShape(data){
  if (!data || !data.shape) return;
  wbRecord({ k: 'shape', d: data });
  const canvas = document.getElementById('wb-canvas');
  if (!canvas || !canvas.width) return;
  try { wbRenderShape(canvas.getContext('2d'), data.shape, canvas.width, canvas.height, data.color || '#000', data.size || 3); } catch(_){}
}
// 상대의 원본 자유선 수신
function wbReceiveStroke(data){
  if (!data || !data.points) return;
  wbRecord({ k: 'stroke', d: data });
  const canvas = document.getElementById('wb-canvas');
  if (!canvas || !canvas.width) return;
  wbPaintStroke(canvas.getContext('2d'), canvas.width, canvas.height, data);
}

/** 다른 참가자의 드로잉을 수신하여 그립니다 */
function wbReceiveDraw(data) {
    if (!data) return;
    wbRecord({ k: 'seg', d: data });
    const canvas = document.getElementById('wb-canvas');
    if (!canvas || !canvas.width) return;   // 칠판 탭이 아직 안 열림 → 기록만. 열리는 순간 다시 그려진다
    wbPaintSeg(canvas.getContext('2d'), canvas.width, canvas.height, data);
}

function wbReceiveClear() {
    wbClearOps();
    const canvas = document.getElementById('wb-canvas');
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

/** 다른 참가자의 칠판 텍스트를 수신하여 그립니다 (송신만 있고 수신 누락이던 버그 수정) */
function wbReceiveText(data) {
    if (!data || !data.text) return;
    wbRecord({ k: 'text', d: data });
    const canvas = document.getElementById('wb-canvas');
    if (!canvas || !canvas.width) return;
    wbPaintText(canvas.getContext('2d'), canvas.width, canvas.height, data);
}

function wbClear() {
    /* ✋ (2026-08-10) 「학생 필기 잠금」이 그리기만 막고 «전체 지우기» 는 그대로 열려 있었다.
       낙서보다 나쁜 장난이다 — 학생이 버튼 한 번으로 선생님 판서를 통째로 지운다.
       그리기 게이트(mousedown)와 똑같은 판정을 쓴다. */
    if (window.__pdfStudentDrawLock && !(typeof vcIsStaffNow === 'function' ? vcIsStaffNow()
            : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'))) {
        var _cen = (typeof getLang === 'function' && getLang() === 'en');
        if (typeof mangoToast === 'function') mangoToast(_cen ? 'The teacher has locked drawing.' : '선생님이 필기를 잠갔어요.');
        return;
    }
    wbReceiveClear();
    if (vcConn) vcConn.send({ type: 'whiteboard-clear', data: {} });
}

function wbSave() {
    const canvas = document.getElementById('wb-canvas');
    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = canvas.toDataURL();
    link.click();
}

/* ================================================================
   7. PDF 공유
================================================================ */
let pdfDoc = null, pdfPageNum = 1, pdfCurrentId = null, pdfPagesPerView = 1;
let pdfZoom = 1;                          // 사용자 줌 배율
let pdfDrawTool = 'none';                 // 'none' | 'pen' | 'eraser'
let pdfAnnotations = {};                  // { [pageNum]: [strokes] }
                                          // stroke = { tool, color, size, points: [[nx,ny], ...] (정규화 0~1) }

// 파일 확장자/MIME으로 이미지 여부 판별
function pdfIsImageFile(fileOrName, mimeType) {
    const name = (typeof fileOrName === 'string') ? fileOrName : (fileOrName && fileOrName.name) || '';
    const mt = mimeType || (fileOrName && fileOrName.type) || '';
    if (mt === 'image/jpeg' || mt === 'image/png') return true;
    const lower = name.toLowerCase();
    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
}

// 이미지 1장을 PDF.js 호환 document 객체로 래핑 (numPages=1, getPage 제공)
async function pdfBuildImageDoc(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const W = img.naturalWidth || img.width;
            const H = img.naturalHeight || img.height;
            const fakeDoc = {
                numPages: 1,
                _isImage: true,
                getPage: async (n) => ({
                    getViewport: ({ scale }) => ({ width: W * scale, height: H * scale }),
                    render: ({ canvasContext, viewport }) => ({
                        promise: new Promise((res) => {
                            canvasContext.drawImage(img, 0, 0, viewport.width, viewport.height);
                            res();
                        })
                    })
                })
            };
            resolve(fakeDoc);
        };
        img.onerror = (e) => reject(new Error('이미지 로드 실패: ' + url));
        img.src = url;
    });
}

// 📎 모든 파일 공유 업로드 (워드·엑셀·PPT·한글·ZIP 등) — 렌더링 대신 다운로드 링크로 학생에게 공유
// 📎 업로드 버튼 클릭 → 숨겨진 파일 입력 강제 트리거 (label 방식보다 확실. 콘솔 로그로 클릭 등록 여부 판별)
function triggerUpload(kind) {
    /* 📚 (2026-08-12 Melca 8번) 올린 파일은 곧바로 반 전체에 공유된다 → 강사·관리자만. */
    if (!window.vcCanControlTextbook()) { window.vcTextbookDenied(); return; }
    var id = (kind === 'pdf') ? 'pdf-upload' : 'file-share-upload';
    var el = document.getElementById(id);
    try { console.log('[업로드] 버튼 클릭 →', kind, '| 입력요소 존재:', !!el); } catch(_){}
    if (!el) { alert('업로드 입력을 찾지 못했습니다.\n새로고침(Ctrl+Shift+R) 후 다시 시도해 주세요.'); return; }
    try {
        el.value = '';
        el.click();
        try { console.log('[업로드] 파일 선택창 열기 요청 완료'); } catch(_){}
    } catch(e) {
        try { console.error('[업로드] 파일창 열기 실패', e); } catch(_){}
        alert('파일 선택창 열기 실패: ' + (e && e.message || e));
    }
}
window.triggerUpload = triggerUpload;

async function fileShareUpload(input) {
    try { console.log('[업로드] fileShareUpload 실행 (파일 선택됨)'); } catch(_){}
    const file = input.files && input.files[0];
    if (!file) return;
    /* 📚 (2026-08-12 Melca 8번) 워드·엑셀·ZIP 등은 아래에서 «다운로드 카드» 로 반 전체에
       뿌려진다 — pdfUpload 를 안 거치는 별도 길이라 여기도 따로 막는다. */
    if (!window.vcCanControlTextbook()) { window.vcTextbookDenied(); return; }
    // 📄 PDF·JPG·PNG 는 교재 뷰어(pdf.js)가 화면에 바로 그릴 수 있다 → 다운로드 카드 대신 교재로 렌더.
    //    드래그앤드롭 dropzone(위 initPdfDropzone)과 동일한 라우팅. 📎 파일 버튼으로 올려도 교재 스크린에 즉시 표시된다.
    //    (워드·엑셀·PPT·한글·ZIP 등 렌더 불가 파일만 아래 다운로드 공유 경로로 내려간다)
    if (/\.(pdf|jpe?g|png)$/.test((file.name || '').toLowerCase())) {
        try { pdfUpload({ files: [file], value: '' }); } catch(e) { console.error('교재 뷰어 로드 실패:', e); }
        input.value = '';
        return;
    }
    if (location.protocol === 'file:') {
        alert('파일 공유는 서버가 필요합니다. https://webrtc-unified-platform.navy111p.workers.dev/ 로 접속해 주세요.');
        input.value = ''; return;
    }
    if (file.size > 50 * 1024 * 1024) { alert('파일이 너무 큽니다 (최대 50MB).'); input.value=''; return; }
    let hideToast = null;
    try { if (typeof showToast === 'function') { showToast('📎 파일 업로드 중… (' + file.name + ')'); } } catch(_){}
    try {
        const qs = new URLSearchParams({ roomId: (typeof vcRoomId!=='undefined'?vcRoomId:'') || '', filename: file.name || 'file' }).toString();
        const res = await fetch('/api/video-call/upload-file?' + qs, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file
        });
        const result = await res.json();
        if (result && result.success && result.url) {
            const info = { name: file.name || 'file', url: result.url, size: result.size || file.size };
            fileShareNotice(info, true);   // 내 화면에도 표시
            try { if (vcConn) vcConn.send({ type: 'file-share', data: info }); } catch(_){}
        } else {
            alert('파일 공유 실패: ' + ((result && result.error) || '알 수 없는 오류'));
        }
    } catch(e) { console.error('파일 공유 실패:', e); alert('파일 공유 실패: ' + e.message); }
    input.value = '';
}

// 공유 파일 알림 카드 (보낸 쪽·받은 쪽 공통). mine=true 면 "보냄", false 면 "받음".
function fileShareNotice(info, mine) {
    try {
        var host = document.getElementById('file-share-notices');
        if (!host) {
            host = document.createElement('div');
            host.id = 'file-share-notices';
            host.style.cssText = 'position:fixed;right:14px;bottom:88px;z-index:2147483000;display:flex;flex-direction:column;gap:8px;max-width:min(320px,86vw)';
            document.body.appendChild(host);
        }
        var kb = info.size ? (info.size >= 1048576 ? (info.size/1048576).toFixed(1)+'MB' : Math.max(1,Math.round(info.size/1024))+'KB') : '';
        var el = document.createElement('div');
        el.style.cssText = 'background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid rgba(245,158,11,0.5);border-radius:14px;padding:12px 14px;color:#e6edf6;box-shadow:0 12px 30px rgba(0,0,0,0.45);font-size:13.5px;line-height:1.5';
        var esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); };
        el.innerHTML = '<div style="font-weight:800;color:#fbbf24;margin-bottom:4px">'+(mine?'📤 파일 공유됨':'📎 받은 파일')+'</div>'
            + '<div style="word-break:break-all;margin-bottom:8px">'+esc(info.name)+(kb?' <span style="color:#94a3b8">('+kb+')</span>':'')+'</div>'
            + '<div style="display:flex;gap:8px">'
            + '<a href="'+esc(info.url)+'" target="_blank" rel="noopener" style="flex:1;text-align:center;padding:8px 10px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#052e16;border-radius:10px;text-decoration:none;font-weight:800;font-size:13px">⬇ 다운로드</a>'
            + '<button style="padding:8px 12px;background:transparent;border:1px solid rgba(148,163,184,0.4);color:#cbd5e1;border-radius:10px;font-size:13px;cursor:pointer">✕</button>'
            + '</div>';
        el.querySelector('button').addEventListener('click', function(){ el.remove(); });
        host.appendChild(el);
        // 30초 뒤 자동 숨김
        setTimeout(function(){ try{ el.remove(); }catch(_){}} , 45000);
    } catch(_){}
    // ➕ 큰 교재 화면(뷰어) 한가운데에도 크게 표시 — 사장님이 흰 화면만 봐도 바로 알 수 있게
    try { fileShareShowInViewer(info, mine); } catch(_){}
}

// 공유된 파일을 교재 뷰어(큰 흰 화면) 한가운데에 크게 카드로 표시.
//   워드·엑셀·PPT 등은 브라우저가 렌더할 수 없으므로 "다운로드해서 열기" 안내 카드로 보여준다.
function fileShareShowInViewer(info, mine) {
    var wrap = document.getElementById('pdf-scroll-wrap') || document.querySelector('#tab-pdf .pdf-container');
    if (!wrap) return;
    var esc = function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); };
    var kb = info.size ? (info.size >= 1048576 ? (info.size/1048576).toFixed(1)+'MB' : Math.max(1,Math.round(info.size/1024))+'KB') : '';
    var name = (info.name||'').toLowerCase();
    var icon = '📎';
    if (/\.(docx?|hwp)$/.test(name)) icon='📝';
    else if (/\.(xlsx?|csv)$/.test(name)) icon='📊';
    else if (/\.(pptx?)$/.test(name)) icon='📽️';
    else if (/\.(zip|rar|7z)$/.test(name)) icon='🗂️';
    var box = document.getElementById('file-share-viewer-card');
    if (!box) {
        box = document.createElement('div');
        box.id = 'file-share-viewer-card';
        box.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;'
            + 'width:min(420px,88%);background:linear-gradient(160deg,#fffdf7,#fef3c7);border:2px solid #f59e0b;'
            + 'border-radius:22px;padding:26px 24px;text-align:center;box-shadow:0 24px 60px -18px rgba(180,120,20,0.55);'
            + 'font-family:inherit;color:#3f2d16';
        // wrap 이 static 이면 absolute 기준을 잡기 위해 relative 부여
        try { var cs = getComputedStyle(wrap); if (cs.position === 'static') wrap.style.position = 'relative'; } catch(_){}
        wrap.appendChild(box);
    }
    box.innerHTML =
        '<div style="font-size:60px;line-height:1;margin-bottom:8px">'+icon+'</div>'
        + '<div style="font-size:15px;font-weight:800;color:#b45309;margin-bottom:4px">'+(mine?'파일을 공유했어요':'선생님이 파일을 보냈어요')+'</div>'
        + '<div style="font-size:18px;font-weight:900;word-break:break-all;margin-bottom:2px">'+esc(info.name)+'</div>'
        + (kb?'<div style="font-size:13px;color:#a98a54;margin-bottom:16px">'+kb+'</div>':'<div style="margin-bottom:16px"></div>')
        + '<a href="'+esc(info.url)+'" target="_blank" rel="noopener" download style="display:inline-block;padding:15px 30px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border-radius:14px;text-decoration:none;font-weight:900;font-size:17px;box-shadow:0 8px 20px -6px rgba(217,119,6,0.6)">⬇ 열기 / 다운로드</a>'
        + '<div style="margin-top:14px"><button type="button" style="background:transparent;border:1px solid #e8d3a8;color:#8a6d3b;border-radius:10px;padding:8px 16px;font-size:13px;cursor:pointer">닫기</button></div>'
        + '<div style="margin-top:10px;font-size:11.5px;color:#a98a54;line-height:1.5">워드·엑셀·PPT는 화면에 바로 안 열려요.<br>위 버튼으로 내려받아 열어주세요.</div>';
    box.style.display = 'block';
    box.querySelector('button').addEventListener('click', function(){ box.style.display='none'; });
}
window.fileShareUpload = fileShareUpload;
window.fileShareNotice = fileShareNotice;
window.fileShareShowInViewer = fileShareShowInViewer;

// 📥 드래그앤드롭 — 교재 도구 영역에 파일을 끌어다 놓으면 자동 업로드/공유
//    PDF·JPG·PNG → 교재 뷰어로 로드, 그 외(워드·엑셀·PPT·한글·ZIP 등) → 파일 공유(다운로드)
(function initPdfDropzone(){
  function setup(){
    var zone = document.querySelector('#tab-pdf .pdf-container') || document.getElementById('tab-pdf');
    if (!zone || zone._dropReady) return;
    zone._dropReady = true;
    ['dragenter','dragover'].forEach(function(ev){ zone.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); zone.style.outline='3px dashed #f59e0b'; zone.style.outlineOffset='-6px'; }); });
    ['dragleave','drop'].forEach(function(ev){ zone.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); zone.style.outline=''; }); });
    zone.addEventListener('drop', function(e){
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      /* 📚 (2026-08-12 Melca 8번) 끌어다 놓기도 붙여넣기와 같은 입구다 — 같이 막는다. */
      if (!window.vcCanControlTextbook()) { window.vcTextbookDenied(); return; }
      var ln = (f.name||'').toLowerCase();
      if (/\.(pdf|jpe?g|png)$/.test(ln)) { try { pdfUpload({ files:[f], value:'' }); } catch(_){} }
      else { try { fileShareUpload({ files:[f], value:'' }); } catch(_){} }
    });
  }
  try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup); else setup(); } catch(_){}
  setTimeout(setup, 1500); setTimeout(setup, 4000);
})();

// 교재 파일 1개 업로드 → { pdfId, url, kind, name } (실패 시 throw)
//   FormData는 일부 프리뷰(iframe postMessage 브릿지) 환경에서 DataCloneError를 일으키므로
//   raw 바이너리(Blob)로 전송하고 메타데이터는 쿼리스트링으로 넘긴다.
async function pdfUploadOne(file) {
    const lowerName = (file.name || '').toLowerCase();
    const qs = new URLSearchParams({
        roomId: vcRoomId || '',
        filename: file.name || 'upload'
    }).toString();

    // 브라우저가 빈 type을 주는 경우 확장자로 보정
    let sendType = file.type;
    if (!sendType) {
        if (lowerName.endsWith('.pdf')) sendType = 'application/pdf';
        else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) sendType = 'image/jpeg';
        else if (lowerName.endsWith('.png')) sendType = 'image/png';
        else sendType = 'application/octet-stream';
    }

    const res = await fetch('/api/video-call/upload-pdf?' + qs, {
        method: 'POST',
        headers: { 'Content-Type': sendType },
        body: file
    });
    const result = await res.json();
    if (!result.success || !result.url) {
        throw new Error(result.error || '알 수 없는 오류');
    }
    return {
        pdfId: result.url.replace('/api/video-call/pdf/', ''),
        url: result.url,
        kind: result.kind || (pdfIsImageFile(file) ? 'image' : 'pdf'),
        name: file.name || 'upload'
    };
}

// 📁 교재 업로드 — (2026-07-22, 강사 피드백 #4) 여러 장 동시 선택 지원.
//   올린 파일들을 _libSequence(◀▶ 화살표 시퀀스)로 묶어 두면 교사가 화살표만으로 넘기고,
//   넘길 때마다 기존 _pdfGoSeqFile 이 학생에게 자동 공유한다 — 공유 경로를 새로 만들 필요가 없다.
async function pdfUpload(input) {
    const files = Array.prototype.slice.call(input.files || []);
    try { console.log('[업로드] pdfUpload 실행 — 선택된 파일', files.length + '개'); } catch(_){}
    if (!files.length) return;
    /* 📚 (2026-08-12 Melca 8번) 업로드가 모이는 «마지막 길목». 버튼·붙여넣기·드래그를 각각
       막아 뒀지만, 입구가 셋이나 되므로 여기에도 한 겹 둔다(하나를 놓쳐도 새지 않게). */
    if (!window.vcCanControlTextbook()) { window.vcTextbookDenied(); return; }

    // file:// 프로토콜로 직접 열면 서버 API 호출이 불가능 → 사용자에게 명확히 안내
    if (location.protocol === 'file:') {
        alert('교재 업로드는 서버가 필요합니다.\n\nhttps://webrtc-unified-platform.navy111p.workers.dev/ 로 접속하거나\n로컬에서 "npx wrangler dev" 로 실행해 주세요.\n\n(현재 file:// 로 열려 있어 업로드가 동작하지 않습니다.)');
        input.value = '';
        return;
    }

    // 클라이언트측 확장자 검증 — 교재 뷰어가 렌더할 수 있는 것만 교재로 올린다
    const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    const isAllowed = f => allowedExts.some(e => String(f.name || '').toLowerCase().endsWith(e));
    const okFiles = files.filter(isAllowed);
    const badFiles = files.filter(f => !isAllowed(f));
    input.value = '';

    // 워드·엑셀·PPT 등은 교재 화면에 못 여므로 '파일 공유'(다운로드)로 넘겨줌 — 기존 동작 유지
    if (badFiles.length) {
        const names = badFiles.map(f => f.name || '').join(', ');
        const okShare = confirm('교재 화면에 바로 못 여는 파일이 있어요 (' + names + ').\n\n대신 학생이 내려받을 수 있게 "파일 공유"로 올릴까요?\n\n(워드·엑셀·PPT·한글·ZIP 등은 이렇게 공유합니다.)');
        if (okShare) badFiles.forEach(f => { try { fileShareUpload({ files: [f], value: '' }); } catch(_){} });
        if (!okFiles.length) return;
    }

    // 페이지 순서 = 파일명 자연 정렬 ("1-2" 가 "1-10" 보다 앞. 사전순이면 1-10 이 먼저 와 버린다)
    okFiles.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));

    /* ⏱ (2026-08-08 강사 피드백 — Teacher Ana ② 「교재 업로드가 장수에 따라 오래 걸린다」)
       [원인] 예전엔 `for … await` 로 **한 장씩 차례로** 올렸다. 그래서 걸리는 시간이 딱
              «장수 × (왕복시간 + 전송시간)» 이었다 — 신고 문장 그대로다.
              필리핀 회선은 왕복만 0.3~1초라, 20장이면 전송이 끝나도 왕복에서만 수십 초를 버린다.
       [해결] 3장씩 겹쳐 올린다. 전송 대기 시간이 서로 가려져 왕복 비용이 1/3 로 줄어든다.
       ⚠️ 3인 이유 — 더 늘리면 **강사의 업로드 대역을 다 먹어** 같은 회선을 쓰는 수업 영상이
          끊긴다. 수업 중 업로드라는 점이 일반 파일 업로드와 다르다. 속도보다 수업이 우선이다.
       ⚠️ 순서는 반드시 지킨다 — 결과를 «완료 순서» 로 담으면 교재 장 순서가 뒤섞인다.
          인덱스 자리에 넣고 마지막에 빈 자리를 걷어낸다(파일명 자연정렬은 위에서 끝났다). */
    const UPLOAD_PARALLEL = 3;
    const slots = new Array(okFiles.length).fill(null);
    const failed = [];
    let _next = 0, _done = 0;
    async function _uploadWorker() {
        while (true) {
            const i = _next++;
            if (i >= okFiles.length) return;
            const f = okFiles[i];
            try {
                slots[i] = await pdfUploadOne(f);
            } catch (e) {
                console.error('업로드 실패:', f.name, e);
                failed.push((f.name || '') + ' (' + (e && e.message || e) + ')');
            }
            _done++;
            if (okFiles.length > 1) _pdfToast('📤 업로드 중 ' + _done + '/' + okFiles.length + ' — ' + (f.name || ''));
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(UPLOAD_PARALLEL, okFiles.length) }, _uploadWorker)
    );
    const uploaded = slots.filter(Boolean);

    if (!uploaded.length) {
        alert('업로드에 실패했습니다:\n' + failed.join('\n'));
        return;
    }

    // ◀▶ 화살표가 이 묶음을 넘기도록 시퀀스 교체.
    //   (교체하지 않으면 직전에 열어 둔 라이브러리 시퀀스가 남아 화살표가 엉뚱한 교재로 튄다)
    window._libSequence = uploaded.map(u => ({ id: 'up_' + u.pdfId, url: u.url, kind: u.kind, name: u.name }));
    window._libSeqIdx = 0;

    const first = uploaded[0];
    pdfCurrentId = first.pdfId;
    await pdfLoad(first.url, first.kind);
    try { window._vcShownPdfName = first.name; } catch(_){}
    // 학생에게 공유 — vcShareTextbook 은 표시상태(_vcShownPdfKey)까지 맞춰줘서 폴링 중복 로드가 없다
    if (typeof window.vcShareTextbook === 'function') {
        window.vcShareTextbook(first.pdfId, first.url, first.kind, first.name, true);
    } else if (vcConn) {
        vcConn.send({ type: 'pdf-share', data: { pdfId: first.pdfId, url: first.url, currentPage: 1, kind: first.kind } });
    }

    if (uploaded.length > 1) _pdfToast('✅ ' + uploaded.length + '장 올렸어요 — ◀ ▶ 로 넘기세요 (' + uploaded.length + ' pages · use ◀ ▶)');
    if (failed.length) _pdfToast('⚠️ ' + failed.length + '장은 실패했어요');
}

// 📋 클립보드 이미지 붙여넣기 (2026-07-22, 강사 피드백 #6)
//   프리토킹 중 구글에서 "이미지 복사"한 그림을 Ctrl+V 로 바로 교재 화면에 띄우고 학생에게 공유.
//   · 클립보드에 '이미지 파일'이 있을 때만 가로챈다 → 텍스트 붙여넣기는 전혀 방해하지 않는다.
//   · 채팅 입력창 등에 커서가 있으면 양보한다.
(function vcEnableImagePaste(){
    function isTypingTarget(el){
        if (!el || !el.tagName) return false;
        var t = el.tagName.toUpperCase();
        return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable === true;
    }
    document.addEventListener('paste', function(ev){
        var dt = ev.clipboardData;
        if (!dt) return;
        // 수업에 들어와 있을 때만 (업로드 API 가 roomId 를 요구한다)
        if (!vcRoomId) return;
        if (isTypingTarget(ev.target) || isTypingTarget(document.activeElement)) return;

        var items = dt.items ? Array.prototype.slice.call(dt.items) : [];
        var imgItem = null;
        for (var i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && /^image\//i.test(items[i].type || '')) { imgItem = items[i]; break; }
        }
        if (!imgItem) {
            // 이미지가 아니라 URL/텍스트만 복사한 경우 — 구글에선 '이미지 복사'를 눌러야 그림이 담긴다
            var txt = '';
            try { txt = dt.getData('text/plain') || ''; } catch(_){}
            if (/^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?|$)/i.test(txt.trim())) {
                _pdfToast('📋 이미지 주소만 복사됐어요 — 그림에 오른쪽 클릭 → "이미지 복사"로 다시 해주세요 · Use "Copy image", not "Copy image address"');
            }
            return;   // 텍스트 붙여넣기는 절대 가로채지 않는다
        }

        var blob = imgItem.getAsFile();
        if (!blob) return;
        /* 📚 (2026-08-12 Melca 8번) 「학생이 보드에 파일을 직접 붙여넣을 수 있다」
           맞다. 붙여넣기는 업로드로 끝나지 않고 아래에서 pdf-share 까지 쏘므로,
           학생이 허가 없이 **반 전체 화면을 자기 그림으로 갈아치울 수 있었다.**
           ⚠️ 그림일 때만 여기까지 온다 — 글자 붙여넣기는 위에서 이미 빠져나가므로
              학생의 평범한 붙여넣기에 잔소리가 붙지 않는다. */
        if (!window.vcCanControlTextbook()) { window.vcTextbookDenied(); return; }
        ev.preventDefault();

        var ext = /png/i.test(blob.type) ? '.png' : '.jpg';
        var file = new File([blob], 'paste-' + Date.now() + ext, { type: blob.type || 'image/png' });
        _pdfToast('📋 붙여넣은 그림 올리는 중… · Pasting image…');

        pdfUploadOne(file).then(function(u){
            // 지금 보던 교재 바로 뒤에 끼워 넣는다 → ◀ 로 원래 페이지에 그대로 돌아갈 수 있다
            var seq = (window._libSequence && window._libSequence.length) ? window._libSequence : [];
            var at = seq.length ? (window._libSeqIdx || 0) + 1 : 0;
            var entry = { id: 'paste_' + u.pdfId, url: u.url, kind: u.kind, name: u.name };
            seq.splice(at, 0, entry);
            window._libSequence = seq;
            window._libSeqIdx = at;

            pdfCurrentId = u.pdfId;
            try { if (typeof vcSwitchTab === 'function') vcSwitchTab('pdf'); } catch(_){}
            return Promise.resolve(pdfLoad(u.url, u.kind)).then(function(){
                try { window._vcShownPdfName = u.name; } catch(_){}
                if (typeof window.vcShareTextbook === 'function') window.vcShareTextbook(u.pdfId, u.url, u.kind, u.name, true);
                else if (vcConn) vcConn.send({ type: 'pdf-share', data: { pdfId: u.pdfId, url: u.url, currentPage: 1, kind: u.kind } });
                _pdfToast('✅ 붙여넣은 그림을 학생에게 띄웠어요 (◀ 로 교재 복귀) · Image shared — press ◀ to go back');
            });
        }).catch(function(e){
            console.error('[paste] 이미지 업로드 실패', e);
            _pdfToast('❌ 붙여넣기 실패: ' + (e && e.message || e));
        });
    }, true);
})();

async function pdfLoad(url, kind) {
    // fix (2026-06-01) — 현재 교재 URL 기억 (다운로드 버튼용)
    try { window._vcCurrentPdfUrl = url; window._vcCurrentPdfKind = kind || ''; } catch(_){}
    // kind가 지정되지 않았으면 URL/MIME으로 추정 (레거시 호출 호환)
    if (!kind) {
        // HEAD 시도: Content-Type을 보고 판단
        try {
            const head = await fetch(url, { method: 'HEAD' });
            const ct = (head.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('image/')) kind = 'image';
            else kind = 'pdf';
        } catch(_) {
            kind = pdfIsImageFile(url) ? 'image' : 'pdf';
        }
    }

    if (kind === 'image') {
        pdfDoc = await pdfBuildImageDoc(url);
    } else {
        /* 📕 PDF.js 는 여기서 «처음» 받는다(2026-08-09 지연 로딩). 홈 첫 화면에선 안 받는다.
           ensurePdfJs() 가 workerSrc 까지 세팅해 주고, 이미 받아 뒀으면 즉시 돌아온다. */
        await window.ensurePdfJs();
        /* workerSrc 는 로드 시점(자체 서버 우선)에 이미 설정됨 — 비어 있을 때만 보강 */
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) pdfjsLib.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.js?v=3.11.174';
        /* ⏱ (2026-08-08 강사 피드백 — Belle ① 「수업을 열 때 로딩이 지연된다」)
           pdf.js 의 기본값은 «열자마자 파일 전체를 내려받기»(disableAutoFetch:false) 다.
           34과짜리 교재는 수십 MB 라, 필리핀 회선에서는 **1페이지를 보기까지 전체 전송을 기다린다.**
           → 스트리밍 + 필요한 조각만(Range) 받게 바꾼다. 첫 페이지가 눈에 띄게 빨리 뜬다.
           ⚠️ 서버가 Range 를 못 받아 주면 pdf.js 가 알아서 통짜 다운로드로 되돌아간다 — 안전한 변경이다.
           ⚠️ disableAutoFetch 를 켜면 «뒤 페이지로 훌쩍 뛸 때» 그 조각을 그때 받는다.
              그래서 아래 pdfRender 에서 **다음 페이지를 미리 받아 둔다**(체감 지연 제거). */
        pdfDoc = await pdfjsLib.getDocument({
            url: url,
            rangeChunkSize: 131072,     // 128KB — 조각이 너무 작으면 왕복이 늘어 오히려 느리다
            disableAutoFetch: true,
            disableStream: false
        }).promise;
    }
    /* 📝 (2026-07-21) 새 교재를 열면 이전 교재의 필기를 비운다 — 교사 피드백
       원인: pdfAnnotations 는 {페이지번호: 획들} 로만 저장된다. 교재가 '이미지 여러 장'
             (라이브러리 시퀀스)이면 파일이 바뀌어도 페이지 번호가 똑같이 1 이라
             이전 장에 그린 필기가 다음 장에 그대로 다시 그려졌다.
       같은 파일을 다시 여는 경우(재공유·재렌더)는 지우지 않는다. */
    try {
        if (window._pdfAnnoDocKey !== url) {
            window._pdfAnnoDocKey = url;
            pdfAnnotations = {};
            ['pdf-anno', 'pdf-anno-2'].forEach(function (id) {
                var a = document.getElementById(id);
                if (a) { try { a.getContext('2d').clearRect(0, 0, a.width, a.height); } catch (e) {} }
            });
        }
    } catch (e) {}
    pdfPageNum = 1;
    pdfRender();
    /* ⚡ (2026-08-12 마이마이 ②) 현재 파일 렌더가 자리 잡은 뒤 시퀀스의 다음 파일을 미리 받는다 */
    setTimeout(function () { try { _pdfPrefetchNextSeq(); } catch (_) {} }, 1200);
}

// fix (2026-06-01) — 현재 화면의 교재 파일 다운로드
async function vcDownloadCurrentTextbook() {
    var url = window._vcCurrentPdfUrl;
    if (!url) { alert('다운로드할 교재가 없습니다. 먼저 교재를 띄워주세요.'); return; }
    try {
        var resp = await fetch(url);
        var blob = await resp.blob();
        var ext = (window._vcCurrentPdfKind === 'image') ? 'jpg' : (url.split('.').pop().split('?')[0] || 'pdf');
        if (ext.length > 5) ext = (blob.type.indexOf('pdf') >= 0 ? 'pdf' : 'jpg');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '교재_' + Date.now() + '.' + ext;
        document.body.appendChild(a); a.click();
        setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch(e) {
        // CORS/네트워크 실패 시 새 탭으로 열기 (사용자가 직접 저장)
        try { window.open(url, '_blank'); } catch(_){ alert('다운로드 실패: ' + (e.message||e)); }
    }
}
window.vcDownloadCurrentTextbook = vcDownloadCurrentTextbook;

async function pdfLoadRemote(pdfId, page, kind) {
    pdfCurrentId = pdfId;
    await pdfLoad(`/api/video-call/pdf/${pdfId}`, kind);
    pdfPageNum = page || 1;
    pdfRender();
}

/* ⚡ (2026-07-21) 교재 이전/다음 지연 해소 — 교사 피드백 반영
   기존 문제: 클릭할 때마다 이전 렌더를 취소하지 않고 새 렌더를 시작 → 렌더가 겹겹이 쌓여
             연속으로 누를수록 점점 느려짐. 캔버스도 매번 재할당(clear+realloc).
   해결: ① 진행 중이면 "최신 1회만" 예약하고 즉시 반환(중간 페이지는 건너뜀)
        ② 진행 중이던 PDF.js RenderTask 를 cancel
        ③ 세대(seq) 토큰으로 늦게 끝난 렌더 결과는 폐기
        ④ 캔버스 크기가 같으면 재할당 대신 clear 만 (재할당 비용 제거) */
let _pdfRenderSeq = 0, _pdfRendering = false, _pdfPendingRender = false;
let _pdfTask1 = null, _pdfTask2 = null;
function _pdfFitCanvas(canvas, w, h) {
    const W = Math.max(1, Math.floor(w)), H = Math.max(1, Math.floor(h));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    else { try { canvas.getContext('2d').clearRect(0, 0, W, H); } catch (e) {} }
}
async function pdfRender() {
    if (!pdfDoc) return;
    if (_pdfRendering) { _pdfPendingRender = true; return; }   // 연속 클릭 → 마지막 상태로 1회만
    _pdfRendering = true;
    const _seq = ++_pdfRenderSeq;
    try { if (_pdfTask1) _pdfTask1.cancel(); } catch (e) {}
    try { if (_pdfTask2) _pdfTask2.cancel(); } catch (e) {}
    try {
        await _pdfRenderInner(_seq);
    } catch (e) {
        if (!(e && (e.name === 'RenderingCancelledException' || /cancel/i.test(e.message || '')))) {
            console.warn('[pdfRender]', e && e.message);
        }
    } finally {
        _pdfRendering = false;
        if (_pdfPendingRender) { _pdfPendingRender = false; setTimeout(pdfRender, 0); }
    }
}
async function _pdfRenderInner(_seq) {
    if (!pdfDoc) return;
    const wrap = document.getElementById('pdf-scroll-wrap');
    /* 📝 (2026-07-21) 렌더 시작 시점의 페이지 번호를 고정한다.
       연속 클릭 시 pdfRender() 는 코얼레싱으로 즉시 반환(=_pdfRenderSeq 그대로)하지만
       pdfPageNum 은 이미 바뀌어 있어, 진행 중이던 렌더가 '옛 페이지 그림 + 새 페이지 필기'
       로 어긋나게 그리던 문제. 아래에서 pdfPageNum 대신 _pg 만 쓴다. */
    const _pg = pdfPageNum;
    const page1 = await pdfDoc.getPage(_pg);
    if (_seq !== _pdfRenderSeq) return;   // 더 최신 렌더가 시작됨 → 폐기
    const baseVp = page1.getViewport({ scale: 1 });
    let baseScale;
    if (pdfPagesPerView === 2) {
        const availW = (wrap ? wrap.clientWidth : 800) - 40;
        const availH = (wrap ? wrap.clientHeight : 600) - 16;
        const halfW = (availW - 12) / 2;
        baseScale = Math.min(halfW / baseVp.width, availH / baseVp.height);
        if (!isFinite(baseScale) || baseScale <= 0) baseScale = 1.2;
    } else {
        // ph258: 1페이지 모드도 칠판 영역에 정확히 fit (가로/세로 중 작은 비율로)
        const availW = (wrap ? wrap.clientWidth : 800) - 24;
        const availH = (wrap ? wrap.clientHeight : 600) - 16;
        baseScale = Math.min(availW / baseVp.width, availH / baseVp.height);
        if (!isFinite(baseScale) || baseScale <= 0) baseScale = 1.0;
    }
    const scale = baseScale * pdfZoom * (window._pdfDPR||1);

    // 1번 페이지
    const canvas1 = document.getElementById('pdf-canvas');
    const vp1 = page1.getViewport({ scale });
    _pdfFitCanvas(canvas1, vp1.width, vp1.height);
    _pdfTask1 = page1.render({ canvasContext: canvas1.getContext('2d'), viewport: vp1 });
    await _pdfTask1.promise;
    _pdfTask1 = null;
    if (_seq !== _pdfRenderSeq) return;
    pdfSyncAnnoCanvas('pdf-anno', canvas1, _pg);

    // 2번 페이지
    const canvas2 = document.getElementById('pdf-canvas-2');
    const wrap2 = document.getElementById('pdf-page-wrap-2');
    if (pdfPagesPerView === 2 && _pg + 1 <= pdfDoc.numPages) {
        const page2 = await pdfDoc.getPage(_pg + 1);
        if (_seq !== _pdfRenderSeq) return;
        const vp2 = page2.getViewport({ scale });
        _pdfFitCanvas(canvas2, vp2.width, vp2.height);
        wrap2.style.display = '';
        _pdfTask2 = page2.render({ canvasContext: canvas2.getContext('2d'), viewport: vp2 });
        await _pdfTask2.promise;
        _pdfTask2 = null;
        if (_seq !== _pdfRenderSeq) return;
        pdfSyncAnnoCanvas('pdf-anno-2', canvas2, _pg + 1);
    } else {
        wrap2.style.display = 'none';
    }
    // ph251: 시퀀스 모드면 "현재 파일 / 전체 파일" 로 표시 (이미지 1개씩일 때 1/N 보장)
    let info;
    const seq = window._libSequence;
    if (seq && seq.length > 0) {
        const seqIdx = (window._libSeqIdx || 0) + 1;
        const seqTotal = seq.length;
        if (pdfDoc.numPages > 1) {
            // PDF 가 여러 페이지인 경우: "📄 3/47 · p2/12"
            info = pdfPagesPerView === 2 && pdfPageNum + 1 <= pdfDoc.numPages
                ? `📚 ${seqIdx}/${seqTotal} · p${pdfPageNum}-${pdfPageNum+1}/${pdfDoc.numPages}`
                : `📚 ${seqIdx}/${seqTotal} · p${pdfPageNum}/${pdfDoc.numPages}`;
        } else {
            // 이미지/1페이지 PDF: "📚 3 / 47"
            info = `📚 ${seqIdx} / ${seqTotal}`;
        }
    } else {
        info = pdfPagesPerView === 2 && pdfPageNum + 1 <= pdfDoc.numPages
            ? `${pdfPageNum}-${pdfPageNum + 1} / ${pdfDoc.numPages}`
            : `${pdfPageNum} / ${pdfDoc.numPages}`;
    }
    document.getElementById('pdf-page-info').textContent = info;
    document.getElementById('pdf-zoom-info').textContent = Math.round(pdfZoom * 100) + '%';

    /* ⏱ (2026-08-08 Belle ① 「페이지를 넘길 때 로딩이 지연된다」)
       다음 페이지를 **미리** 받아 둔다. pdf.js 는 한 번 받은 페이지를 캐시하므로
       실제로 넘길 때는 화면에 그리는 일만 남는다 — 회선이 느릴수록 차이가 크다.
       ⚠️ await 하지 않는다. 여기서 기다리면 «지금 페이지» 표시가 그만큼 늦어져 본말이 뒤집힌다.
       ⚠️ 실패는 조용히 넘긴다 — 미리 받기는 «있으면 좋은 것» 이지 없으면 안 되는 것이 아니다. */
    try {
        const _ahead = pdfPagesPerView === 2 ? 2 : 1;
        const _n = _pg + _ahead;
        if (_n <= pdfDoc.numPages) pdfDoc.getPage(_n).catch(function(){});
        if (pdfPagesPerView === 2 && _n + 1 <= pdfDoc.numPages) pdfDoc.getPage(_n + 1).catch(function(){});
    } catch (_) {}
}

// 주석 캔버스를 PDF 캔버스 크기에 맞추고 저장된 주석 다시 그림
function pdfSyncAnnoCanvas(annoId, pdfCanvas, pageNum) {
    const anno = document.getElementById(annoId);
    if (!anno) return;
    anno.width = pdfCanvas.width;
    anno.height = pdfCanvas.height;
    anno.style.width = pdfCanvas.style.width || (pdfCanvas.width + 'px');
    anno.style.height = pdfCanvas.style.height || (pdfCanvas.height + 'px');
    anno.dataset.page = pageNum;
    pdfRedrawAnno(anno, pageNum);
    pdfBindAnnoEvents(annoId);
    pdfApplyIdentity();   // 역할별 기본색 + 필기자 범례 (1회)
}

function pdfRedrawAnno(anno, pageNum) {
    const ctx = anno.getContext('2d');
    ctx.clearRect(0, 0, anno.width, anno.height);
    const strokes = pdfAnnotations[pageNum] || [];
    strokes.forEach(s => pdfDrawStroke(ctx, anno.width, anno.height, s));
}

function pdfDrawStroke(ctx, w, h, s) {
    // ✨ AI 정리된 도형 타입 그리기 (직선/사각형/원/삼각형/축)
    if (s.tool === 'shape' && s.shape) {
        wbRenderShape(ctx, s.shape, w, h, s.color || '#ef4444', s.size || 3);
        return;
    }
    // ph265: 텍스트 타입 그리기
    if (s.tool === 'text' && s.text) {
        ctx.save();
        const fs = s.fontSize || 28;
        ctx.font = '700 ' + fs + 'px MangoiHanSC,-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
        ctx.fillStyle = s.color || '#ef4444';
        ctx.textBaseline = 'alphabetic';
        // 가독성을 위한 흰 외곽선
        ctx.lineWidth = Math.max(2, fs * 0.08);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(s.text, s.x * w, s.y * h);
        ctx.fillText(s.text, s.x * w, s.y * h);
        ctx.restore();
        return;
    }
    if (!s.points || s.points.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    // 🖍 형광펜 — 반투명·굵게 (글자가 비쳐 보이도록)
    if (s.tool === 'highlighter') {
        ctx.globalAlpha = 0.32;
        ctx.lineWidth = s.size * 5;
    } else {
        ctx.lineWidth = s.size;
    }
    ctx.strokeStyle = s.color;
    ctx.beginPath();
    s.points.forEach((p, i) => {
        const x = p[0] * w, y = p[1] * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
}

// 줌
/* 🔍 (2026-07-28 강사 피드백) 확대·축소가 "눌러도 아무 일이 없다"던 원인 중 하나:
   화면을 그리는 코드는 이 파일의 `pdfZoom`(let) 을 읽는데, 손가락 확대(핀치)와 더블탭은
   `window.pdfZoom` 에 값을 넣고 있었다. let 으로 선언한 변수는 window 의 속성이 아니어서
   둘은 서로 다른 값이다 → 핀치로 확대해도 렌더에 반영되지 않았다.
   이제 값을 바꾸는 길을 이 함수 하나로 모아 두 곳이 같은 값을 쓰게 한다. */
function pdfSetZoom(z) {
    var n = Number(z);
    if (!isFinite(n)) return pdfZoom;
    pdfZoom = Math.max(0.05, Math.min(5, n));
    if (pdfDoc) pdfRender();
    return pdfZoom;
}
window.pdfSetZoom = pdfSetZoom;
window.pdfGetZoom = function(){ return pdfZoom; };
function pdfZoomIn()  { pdfSetZoom(pdfZoom + 0.1); }
function pdfZoomOut() { pdfSetZoom(pdfZoom - 0.1); }
function pdfZoomReset() { pdfSetZoom(1); }

// 그리기 도구 전환
function pdfSetDrawTool(t, btn) {
    pdfDrawTool = t;
    document.querySelectorAll('.pdf-anno-bar button').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    // pointer-events 토글: 'none'이면 PDF를 자유롭게 스크롤, 그 외엔 그리기 모드
    document.querySelectorAll('.pdf-anno').forEach(a => a.classList.toggle('active', t !== 'none'));
}

function pdfApplyClear(pages) {
    pages.forEach(p => { delete pdfAnnotations[p]; });
    // ➡️ 콕 찍기 표시는 캔버스가 아니라 DOM 이라 지우기에서 따로 걷어내야 한다
    document.querySelectorAll('[id^="mgArrow_"]').forEach(n => n.remove());
    document.querySelectorAll('.pdf-anno').forEach(anno => {
        const p = parseInt(anno.dataset.page);
        if (pages.includes(p)) anno.getContext('2d').clearRect(0, 0, anno.width, anno.height);
    });
}
function pdfClearAnno() {
    const pages = pdfPagesPerView === 2 ? [pdfPageNum, pdfPageNum + 1] : [pdfPageNum];
    pdfApplyClear(pages);
    // 🔄 상대에게 지우기 전송
    pdfAnnoSend('pdf-anno-clear', { pages });
}

// 주석 캔버스 그리기 이벤트
function pdfBindAnnoEvents(annoId) {
    const anno = document.getElementById(annoId);
    if (!anno || anno._bound) return;
    anno._bound = true;
    let drawing = false, currentStroke = null;
    function pos(e) {
        const r = anno.getBoundingClientRect();
        return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    }
    anno.addEventListener('pointerdown', (e) => {
        if (pdfDrawTool === 'none') return;
        /* ✋ (2026-07-28 강사 피드백 Kaye 9번) "학생이 칠판·교재에 낙서한다 — 교사가 막을 수 있게"
           교사가 잠그면 학생 쪽 그리기를 여기서 멈춘다. 교사·관리자 자신은 영향 없음. */
        if (window.__pdfStudentDrawLock && !(typeof vcIsStaffNow === 'function' ? vcIsStaffNow()
                : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'))) {
            e.preventDefault();
            if (!window.__pdfLockToastAt || Date.now() - window.__pdfLockToastAt > 4000) {
                window.__pdfLockToastAt = Date.now();
                var _en = (typeof getLang === 'function' && getLang() === 'en');
                if (typeof mangoToast === 'function') {
                    mangoToast(_en ? 'The teacher has locked drawing.' : '선생님이 필기를 잠갔어요.');
                }
            }
            return;
        }
        /* ➡️ (2026-07-31) 콕 찍기 — 잉크를 남기지 않고 '머무는 표시'만 찍는다.
           레이저는 손을 떼면 사라져서, 한 곳을 가리키며 설명하는 동안 유지가 안 된다는
           강사 요청에서 나온 도구. 다음에 찍거나 '지우기'를 누를 때까지 그 자리에 남는다. */
        if (pdfDrawTool === 'arrow') {
            e.preventDefault();
            const _r  = anno.getBoundingClientRect();
            const _me = pdfMyIdentity();
            const _d  = {
                page: parseInt(anno.dataset.page),
                x: (e.clientX - _r.left) / _r.width,
                y: (e.clientY - _r.top)  / _r.height,
                name: _me.name, color: _me.color, sticky: true
            };
            pdfReceivePointer(_d);              // 내 화면에도 즉시 표시
            pdfAnnoSend('pdf-pointer', _d);     // 상대 화면에 전송
            return;
        }
        const color = document.getElementById('pdf-anno-color').value;
        const size  = parseInt(document.getElementById('pdf-anno-size').value) || 3;
        const pageNum = parseInt(anno.dataset.page);
        // ph265: 텍스트 도구 — 클릭 위치에 input 띄우기
        if (pdfDrawTool === 'text') {
            e.preventDefault();
            const rect = anno.getBoundingClientRect();
            const fontSize = Math.max(14, size * 6);
            // 기존 input 있으면 제거
            const old = document.getElementById('ph265-textinput');
            if (old) old.remove();
            const inp = document.createElement('input');
            inp.id = 'ph265-textinput';
            inp.type = 'text';
            inp.placeholder = '타자 입력 후 Enter';
            inp.style.cssText = 'position:absolute;z-index:99999;left:' + e.clientX + 'px;top:' + (e.clientY - fontSize) + 'px;font-size:' + fontSize + 'px;color:' + color + ';background:rgba(255,255,255,0.92);border:2px dashed ' + color + ';padding:2px 6px;border-radius:4px;font-family:inherit;font-weight:700;outline:none;min-width:120px';
            document.body.appendChild(inp);
            inp.focus();
            const px = (e.clientX - rect.left) / rect.width;
            const py = (e.clientY - rect.top) / rect.height;
            function commit(){
                const txt = inp.value.trim();
                inp.remove();
                if (!txt) return;
                if (!pdfAnnotations[pageNum]) pdfAnnotations[pageNum] = [];
                const tstroke = { tool:'text', text:txt, color:color, size:size, x:px, y:py, fontSize:fontSize };
                pdfAnnotations[pageNum].push(tstroke);
                pdfRedrawAnno(anno, pageNum);
                // 🔄 상대에게 텍스트 주석 전송
                pdfAnnoSend('pdf-anno-text', { page: pageNum, stroke: tstroke });
            }
            inp.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
                else if (ev.key === 'Escape') { inp.remove(); }
            });
            inp.addEventListener('blur', commit);
            return;
        }
        drawing = true;
        anno.setPointerCapture(e.pointerId);
        const sid = pdfNewStrokeId();
        const p0 = pos(e);
        // _t = 마지막으로 점이 찍힌 시각 — ✨ 사라지는 펜이 이 값으로 수명을 잰다
        currentStroke = { tool: pdfDrawTool, color, size, points: [p0], _id: sid, _t: Date.now() };
        if (!pdfAnnotations[pageNum]) pdfAnnotations[pageNum] = [];
        pdfAnnotations[pageNum].push(currentStroke);
        // 🔄 상대에게 획 시작 전송 (id 로 이어붙임)
        pdfAnnoSend('pdf-anno-start', { page: pageNum, id: sid, tool: pdfDrawTool, color, size, point: p0 });
    });
    anno.addEventListener('pointermove', (e) => {
        if (!drawing || !currentStroke) return;
        const pt = pos(e);
        currentStroke.points.push(pt);
        currentStroke._t = Date.now();          // ✨ 사라지는 펜 수명 갱신
        const pageNum = parseInt(anno.dataset.page);
        pdfRedrawAnno(anno, pageNum);
        // 🔄 상대에게 좌표 추가 전송
        pdfAnnoSend('pdf-anno-point', { page: pageNum, id: currentStroke._id, point: pt });
    });
    function endDraw() {
        // ✨ AI 도형 정리: 펜 자유선을 도형/축으로 자동 변환 (실패 시 원본 유지)
        if (drawing && currentStroke && currentStroke.tool === 'pen' && wbAiMode) {
            try { pdfTryBeautify(anno, currentStroke); } catch (e) { console.warn('[pdf-ai] 도형 정리 실패', e); }
        }
        drawing = false; currentStroke = null;
    }
    anno.addEventListener('pointerup', endDraw);
    anno.addEventListener('pointerleave', endDraw);
    anno.addEventListener('pointercancel', endDraw);
    // 🔴 레이저 포인터 — '보기' 모드에서 마우스 위치를 상대에게 점으로 표시
    pdfBindLaser(anno);
}

/* ================================================================
   7a. 교재 위 양방향 판서 — 실시간 동기화 (교사·학생 모두 그리기 가능)
   ──────────────────────────────────────────────────────────────────
   - pdf-anno-start/point/text/clear/undo : 그리기 동기화
   - pdf-pointer : 레이저 포인터(보기 모드)
   - 필기자 구분 : 역할별 기본 색(교사=빨강, 학생=파랑)
================================================================ */
function pdfAnnoSend(type, data) {
    try { if (typeof vcConn !== 'undefined' && vcConn) vcConn.send({ type, data }); } catch(_){}
}
function pdfNewStrokeId() {
    return (vcUsername || 'u') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}
// 현재 사용자 식별(역할/이름/색)
function pdfMyIdentity() {
    var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    /* 🎭 (2026-08-08 Ana ①) 여기서 낡은 'teacher' 를 집으면 **학생 펜이 강사와 같은 빨강** 이 된다.
       "학생이 그린 게 안 보인다" 는 신고에는 «구분이 안 된다» 도 섞여 있다 → 주인 확인을 거친다. */
    var role = (u && u.role) || (window.vcRoleStored ? window.vcRoleStored() : '') || 'student';
    var name = vcUsername || (u && u.name) || '참가자';
    var color = (role === 'teacher' || role === 'admin') ? '#ef4444' : '#2563eb';
    return { role: role, name: name, color: color };
}
// 역할별 기본 필기색 적용 + 범례 표시 (입장 시 1회)
let _pdfIdentityApplied = false;
function pdfApplyIdentity() {
    if (_pdfIdentityApplied) return;
    var me = pdfMyIdentity();
    var colorInput = document.getElementById('pdf-anno-color');
    // 사용자가 아직 색을 바꾸지 않았으면(=기본 빨강) 역할 색으로 초기화
    if (colorInput && colorInput.value.toLowerCase() === '#ef4444') colorInput.value = me.color;
    var legend = document.getElementById('pdf-anno-legend');
    if (legend) {
        legend.innerHTML =
            '<span style="display:inline-flex;align-items:center;gap:3px"><span style="width:10px;height:10px;border-radius:50%;background:#ef4444;display:inline-block"></span>선생님</span>' +
            '<span style="display:inline-flex;align-items:center;gap:3px"><span style="width:10px;height:10px;border-radius:50%;background:#2563eb;display:inline-block"></span>학생</span>';
    }
    // ↩ Ctrl+Z / Cmd+Z 되돌리기 (텍스트 입력 중이 아닐 때만)
    document.addEventListener('keydown', function(e){
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
            var tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
            if (!pdfDoc) return;   // 교재가 떠 있을 때만 되돌리기
            e.preventDefault();
            pdfAnnoUndo();
        }
    });

    /* ⌨️ (2026-07-21) 교재 페이지 넘기기 = 키보드 화살표 — 교사 피드백 반영
       ← / PageUp = 이전,  → / PageDown = 다음.
       입력창·채팅에 타이핑 중이거나 조합키(Ctrl/Alt/Meta)면 무시 → 기존 단축키와 충돌 없음. */
    document.addEventListener('keydown', function(e){
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'PageUp' && e.key !== 'PageDown') return;
        if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
        /* 🔒 강사/관리자만 — 교재 페이지는 수업 전체에 방송되므로 학생이 화살표로
           반 전체의 교재를 넘겨버릴 수 있었다(2026-07-21 화살표 기능 추가 시 생긴 구멍).
           버튼은 원래 강사 UI 안에만 있어 노출되지 않았지만, 키보드는 화면 어디서나 먹는다.
           ⌨️ (2026-08-07 Kaye 2번 "키보드로 교재가 안 넘어간다") 정확일치 대신 정본 판정을 쓴다 —
              로비로 입장한 강사는 vcMyRole 이 비어 있어 여기서 조용히 걸렸다. */
        if (!(typeof vcIsStaffNow === 'function' ? vcIsStaffNow()
              : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'))) return;
        if (!pdfDoc) return;                       // 교재가 떠 있을 때만
        var t = e.target || {};
        var tag = (t.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
        e.preventDefault();
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') pdfPrevPage();
        else pdfNextPage();
    });

    /* 🖱 (2026-07-28 강사 피드백 — Farrah 선생님)
       "매번 확대 버튼을 누르지 않고 마우스 휠로 크기를 바꾸고, 마우스로 페이지를 넘기고 싶다"
         · Ctrl(맥은 ⌘) + 휠  → 확대·축소  (모든 프로그램에서 쓰는 방식이라 헷갈리지 않음)
         · 그냥 휠            → 다음/이전 페이지  (요청하신 동작)
       안전장치는 화살표 키와 같다 — 교재 페이지는 반 전체에 방송되므로 교사·관리자만 동작한다.
       확대된 상태(1.05배 초과)에서는 그냥 휠을 페이지 넘김에 쓰지 않는다 —
       확대해 놓고 화면을 위아래로 움직여 봐야 하기 때문이다. */
    try {
        var _pw = document.getElementById('pdf-scroll-wrap');
        if (_pw && !_pw.__wheelBound) {
            _pw.__wheelBound = true;
            var _wheelAt = 0;
            _pw.addEventListener('wheel', function(e){
                /* 화살표 키와 같은 정본 판정 — 한쪽만 고치면 «키보드는 되는데 휠은 안 되는» 어긋남이 난다 */
                if (!(typeof vcIsStaffNow === 'function' ? vcIsStaffNow()
                      : (window.vcMyRole === 'teacher' || window.vcMyRole === 'admin'))) return;
                if (!pdfDoc) return;
                if (e.ctrlKey || e.metaKey) {            // 확대·축소
                    e.preventDefault();
                    pdfSetZoom(pdfZoom + (e.deltaY < 0 ? 0.1 : -0.1));
                    return;
                }
                if (pdfZoom > 1.05) return;              // 확대 중 = 위아래로 움직이는 게 맞다
                var now = Date.now();
                if (now - _wheelAt < 320) return;        // 한 번 굴릴 때 한 장만
                _wheelAt = now;
                e.preventDefault();
                if (e.deltaY > 0) pdfNextPage(); else pdfPrevPage();
            }, { passive: false });
        }
    } catch(e){}
    _pdfIdentityApplied = true;
}

// 페이지 번호 → 현재 표시 중인 주석 캔버스 element
function pdfAnnoElForPage(page) {
    var el = null;
    document.querySelectorAll('.pdf-anno').forEach(function(a){
        if (parseInt(a.dataset.page) === page) el = a;
    });
    return el;
}
// 원격 진행 중인 획을 id 로 빠르게 잇기 위한 캐시
let _pdfRemoteStrokes = {};

/* 🔔 (2026-08-12 Melca) 받은 판서가 «지금 내 화면에 없는 페이지» 면 예전엔 조용히 사라졌다
   (획은 pdfAnnotations 에 쌓이지만 화면엔 영영 안 보임) — "잠금을 풀어도 학생 필기가 안 보인다"
   신고의 실제 원인 중 하나. 강사에게 어느 페이지인지 알려 준다(8초 스로틀). */
function _pdfAnnoOffPageNotify(page){
    try {
        if (window.__pdfAnnoReplaying) return;
        if (typeof window.vcCanControlTextbook === 'function' && !window.vcCanControlTextbook()) return;
        var now = Date.now();
        if (window.__pdfAnnoOffPageAt && now - window.__pdfAnnoOffPageAt < 8000) return;
        window.__pdfAnnoOffPageAt = now;
        var en = (typeof getLang === 'function' && getLang() === 'en');
        if (typeof showToast === 'function') showToast(en
            ? ('✍️ A student is writing on page ' + page + ' — turn to that page to see it.')
            : ('✍️ 학생이 ' + page + '쪽에 필기하고 있어요 — 그 페이지로 넘기면 보여요.'));
    } catch(_){}
}
function pdfReceiveAnnoStart(d) {
    if (!pdfAnnotations[d.page]) pdfAnnotations[d.page] = [];
    var stroke = { tool: d.tool, color: d.color, size: d.size, points: [d.point], _id: d.id, _t: Date.now() };
    pdfAnnotations[d.page].push(stroke);
    _pdfRemoteStrokes[d.id] = stroke;
    var el = pdfAnnoElForPage(d.page);
    if (el) pdfRedrawAnno(el, d.page);
    else _pdfAnnoOffPageNotify(d.page);
}
function pdfReceiveAnnoPoint(d) {
    var stroke = _pdfRemoteStrokes[d.id];
    if (!stroke) {
        // start 를 놓친 경우 보강 생성
        if (!pdfAnnotations[d.page]) pdfAnnotations[d.page] = [];
        stroke = { tool: 'pen', color: '#ef4444', size: 3, points: [], _id: d.id };
        pdfAnnotations[d.page].push(stroke);
        _pdfRemoteStrokes[d.id] = stroke;
    }
    stroke.points.push(d.point);
    stroke._t = Date.now();                    // ✨ 사라지는 펜: 받는 쪽도 같은 기준으로 수명 계산
    var el = pdfAnnoElForPage(d.page);
    if (el) pdfRedrawAnno(el, d.page);
}
function pdfReceiveAnnoText(d) {
    if (!pdfAnnotations[d.page]) pdfAnnotations[d.page] = [];
    pdfAnnotations[d.page].push(d.stroke);
    var el = pdfAnnoElForPage(d.page);
    if (el) pdfRedrawAnno(el, d.page);
}
function pdfReceiveAnnoClear(d) {
    pdfApplyClear(d.pages || []);
}
function pdfReceiveAnnoUndo(d) {
    pdfApplyUndo(d.page);
}

// ✨ 교재 펜 자유선 → 도형/축 자동 정리 (로컬)
function pdfTryBeautify(anno, stroke) {
    if (!stroke.points || stroke.points.length < 5) return;
    const W = anno.width, H = anno.height;
    const pxPts = stroke.points.map(p => [p[0] * W, p[1] * H]);
    const shape = wbDetectShape(pxPts, W, H);
    if (!shape) return;
    const pageNum = parseInt(anno.dataset.page);
    const arr = pdfAnnotations[pageNum];
    if (!arr) return;
    const shapeStroke = { tool: 'shape', shape, color: stroke.color, size: stroke.size, _id: stroke._id };
    const idx = arr.indexOf(stroke);
    if (idx >= 0) arr[idx] = shapeStroke; else arr.push(shapeStroke);
    pdfRedrawAnno(anno, pageNum);
    // 상대에게도 같은 id 의 획을 도형으로 교체하도록 전송
    pdfAnnoSend('pdf-anno-shape', { page: pageNum, id: stroke._id, shape, color: stroke.color, size: stroke.size });
    try {
        if (typeof showToast === 'function') {
            const n = { line:'직선', rect:'사각형', ellipse:'원', triangle:'삼각형', axes:'좌표축' };
            showToast('✨ ' + (n[shape.t] || '도형') + '(으)로 정리');
        }
    } catch(_){}
}
// 상대가 정리한 교재 도형 수신 — 같은 id 의 (스트리밍된) 원본 획을 도형으로 교체
function pdfReceiveAnnoShape(d) {
    if (!pdfAnnotations[d.page]) pdfAnnotations[d.page] = [];
    const arr = pdfAnnotations[d.page];
    const shapeStroke = { tool: 'shape', shape: d.shape, color: d.color, size: d.size, _id: d.id };
    let replaced = false;
    for (let i = 0; i < arr.length; i++) { if (arr[i]._id === d.id) { arr[i] = shapeStroke; replaced = true; break; } }
    if (!replaced) arr.push(shapeStroke);
    if (typeof _pdfRemoteStrokes !== 'undefined') delete _pdfRemoteStrokes[d.id];
    const el = pdfAnnoElForPage(d.page);
    if (el) pdfRedrawAnno(el, d.page);
}

// 되돌리기 — 현재 페이지의 마지막 획 제거(로컬) + 전송
function pdfApplyUndo(page) {
    var arr = pdfAnnotations[page];
    if (!arr || arr.length === 0) return;
    arr.pop();
    var el = pdfAnnoElForPage(page);
    if (el) pdfRedrawAnno(el, page);
}
function pdfAnnoUndo() {
    var pages = pdfPagesPerView === 2 ? [pdfPageNum + 1, pdfPageNum] : [pdfPageNum];
    // 내용이 있는 가장 최근 페이지부터 1개 되돌림
    for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        if (pdfAnnotations[p] && pdfAnnotations[p].length > 0) {
            pdfApplyUndo(p);
            pdfAnnoSend('pdf-anno-undo', { page: p });
            return;
        }
    }
}

/* ── 레이저 포인터 / 콕 찍기 ────────────────────────────────────────
   🔴 (2026-07-31 강사 요청 "포인터를 넣어주세요")
   레이저 포인터 자체는 예전부터 있었다. 그런데 아래 세 가지 때문에 사실상 못 쓰는 기능이었다.
     1) 켜는 버튼이 없었다 — "보기 모드에서 마우스를 움직이면 된다"를 우연히 알아내야 했다.
        → 툴바의 '보기'를 '🔴 포인터'로 승격해 입구를 만들었다(HTML 쪽).
     2) mousemove 만 듣고 있었다 — 태블릿·휴대폰으로 수업하는 강사는 아예 동작하지 않았다.
        → pointermove 로 바꿨다. 터치는 hover 가 없으므로 '손가락을 대고 움직일 때'만 보낸다.
     3) 보내는 사람 화면에는 아무것도 안 보였다 — 학생에게 나가고 있는지 확인할 방법이 없어
        "안 되네요"로 이어졌다. → 자기 화면에도 흐리게(로컬 에코) 같이 그린다.
   콕 찍기(sticky)는 같은 pdf-pointer 통로를 쓰되 자동으로 사라지지 않는 표시다. */
let _pdfLaserSend = 0;
function pdfBindLaser(anno) {
    if (!anno || anno._laserBound) return;
    anno._laserBound = true;
    var wrap = anno.parentElement;
    var touchDown = false;   // 터치·펜은 화면에 닿아 있을 때만 추적 (마우스는 그냥 움직여도 됨)

    // '보기(포인터)' 모드에서는 anno 가 pointer-events:none 이라 wrap 에서 좌표를 추적
    function track(e) {
        if (pdfDrawTool !== 'none') return;            // 그리기 중엔 레이저 끔
        if (e.pointerType && e.pointerType !== 'mouse' && !touchDown) return;
        var now = Date.now();
        if (now - _pdfLaserSend < 45) return;          // 송신 스로틀
        _pdfLaserSend = now;
        var r = anno.getBoundingClientRect();
        if (r.width === 0) return;
        var x = (e.clientX - r.left) / r.width;
        var y = (e.clientY - r.top) / r.height;
        if (x < 0 || x > 1 || y < 0 || y > 1) return;
        var page = parseInt(anno.dataset.page);
        var me = pdfMyIdentity();
        pdfReceivePointer({ page: page, x: x, y: y, name: me.name, color: me.color, self: true });
        pdfAnnoSend('pdf-pointer', { page: page, x: x, y: y, name: me.name, color: me.color });
    }
    function release() { touchDown = false; }

    wrap.addEventListener('pointerdown', function(e){
        if (e.pointerType && e.pointerType !== 'mouse') { touchDown = true; track(e); }
    });
    wrap.addEventListener('pointerup', release);
    wrap.addEventListener('pointercancel', release);
    wrap.addEventListener('pointermove', track);
    wrap.addEventListener('pointerleave', function(){
        touchDown = false;
        var page = parseInt(anno.dataset.page);
        var me = pdfMyIdentity();
        pdfReceivePointer({ page: page, hide: true, name: me.name, self: true });
        pdfAnnoSend('pdf-pointer', { page: page, hide: true, name: me.name });
    });
}
let _pdfLaserTimers = {};
function pdfReceivePointer(d) {
    var page = d.page;
    var el = pdfAnnoElForPage(page);
    if (!el) return;
    var wrap = el.parentElement;
    var safe = String(d.name || 'x').replace(/[^a-zA-Z0-9가-힣]/g, '_');
    /* 레이저(따라다니다 사라짐) / 콕 찍기(그 자리에 머무름) / 내 화면용 에코는 서로 다른 요소로 관리.
       같은 id 를 쓰면 내 에코가 상대 표시를 덮어써서 둘 중 하나가 사라진다. */
    var key = (d.sticky ? 'mgArrow_' : 'mgLaser_') + (d.self ? 'me_' : '') + safe;
    var dot = document.getElementById(key);
    if (d.hide) { if (dot) dot.remove(); return; }
    if (!dot) {
        var c  = d.color || '#ef4444';
        var op = d.self ? '.5' : '.85';   // 내 화면에 보이는 내 포인터는 흐리게 = "나가고 있다"는 확인용
        dot = document.createElement('div');
        dot.id = key;
        dot.style.cssText = 'position:absolute;z-index:50;pointer-events:none;transform:translate(-50%,-50%);transition:left .05s linear,top .05s linear;';
        dot.innerHTML = '<span class="laser-core"></span><span class="laser-name"></span>';
        wrap.appendChild(dot);
        // 콕 찍기는 '속이 빈 굵은 링' — 꽉 찬 레이저 점과 한눈에 구분되고, 링 중심이 정확히 찍은 지점이다
        dot.querySelector('.laser-core').style.cssText = d.sticky
            ? 'display:block;box-sizing:border-box;width:26px;height:26px;border-radius:50%;border:3px solid ' + c + ';box-shadow:0 0 0 2px rgba(255,255,255,.55),0 0 8px 2px ' + c + ';opacity:' + op + ';'
            : 'display:block;width:16px;height:16px;border-radius:50%;background:' + c + ';box-shadow:0 0 10px 3px ' + c + ';opacity:' + op + ';';
        dot.querySelector('.laser-name').style.cssText = 'position:absolute;left:' + (d.sticky ? 20 : 14) + 'px;top:-2px;white-space:nowrap;font-size:11px;font-weight:700;color:#fff;background:' + c + ';padding:1px 6px;border-radius:8px;opacity:' + op + ';';
        dot.querySelector('.laser-name').textContent = d.name || '';
    }
    // wrap 이 anno 캔버스와 같은 크기라고 가정(top:0,left:0 오버레이)
    dot.style.left = (d.x * el.clientWidth) + 'px';
    dot.style.top  = (d.y * el.clientHeight) + 'px';
    if (_pdfLaserTimers[key]) { clearTimeout(_pdfLaserTimers[key]); delete _pdfLaserTimers[key]; }
    // 레이저만 자동 소멸. 콕 찍기는 다음에 찍거나 🗑 지우기 전까지 남는다(그게 이 도구의 목적).
    if (!d.sticky) {
        _pdfLaserTimers[key] = setTimeout(function(){ var x = document.getElementById(key); if (x) x.remove(); }, 1600);
    }
}

/* ✨ 사라지는 펜 — 그린 뒤 일정 시간이 지난 획을 양쪽 화면에서 함께 걷어낸다.
   전용 메시지를 새로 만들지 않고 '마지막으로 점이 찍힌 시각(_t)' 하나로 각자 지운다.
   보내는 쪽은 그릴 때, 받는 쪽은 점을 받을 때 _t 를 갱신하므로 두 화면이 거의 동시에 사라진다. */
const PDF_VANISH_MS = 3000;
setInterval(function(){
    if (typeof pdfDoc === 'undefined' || !pdfDoc) return;      // 교재가 떠 있을 때만 (평소 비용 0)
    if (typeof pdfAnnotations === 'undefined' || !pdfAnnotations) return;
    var now = Date.now(), touched = [];
    Object.keys(pdfAnnotations).forEach(function(p){
        var arr = pdfAnnotations[p];
        if (!arr || !arr.length) return;
        for (var i = arr.length - 1; i >= 0; i--) {
            var s = arr[i];
            if (s && s.tool === 'vanish' && s._t && now - s._t > PDF_VANISH_MS) {
                arr.splice(i, 1);
                if (touched.indexOf(p) < 0) touched.push(p);
            }
        }
    });
    touched.forEach(function(p){
        var el = pdfAnnoElForPage(parseInt(p));
        if (el) pdfRedrawAnno(el, parseInt(p));
    });
}, 500);

// 한 번에 보일 페이지 수 변경 (1 또는 2)
function pdfSetPagesPerView(n, btn) {
    pdfPagesPerView = n;
    document.querySelectorAll('.pdf-view-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    if (pdfDoc) pdfRender();
}

// PDF 팬(스크롤) — 위/오른쪽 툴바에서 호출
function pdfPan(dx, dy) {
    const wrap = document.getElementById('pdf-scroll-wrap');
    if (!wrap) return;
    wrap.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
}

/* 🔄 (2026-07-29 실사고 — 중국어 강사 "화면이 계속 튀고, 첫 페이지만 보인다")
   [문제] 3초마다 도는 교재 폴링(vcStartPdfPoll)은 서버의 pdfState.currentPage 와
          _vcShownPdfKey(=url|page) 를 비교해, 다르면 pdfGoToPage() 로 강제로 맞춘다.
          그런데 로컬에서 페이지를 넘길 때(pdfNextPage/pdfPrevPage/pdfGoToPage) 이 키를
          아무도 갱신하지 않았다. 그래서 한 장 넘길 때마다 3초 안에 폴링이 "어긋났다"고
          판단해 다시 렌더 → 화면이 주기적으로 튄다.
          브로드캐스트가 안 나가는 상황이면 서버는 계속 1페이지라, 넘겨도 3초 뒤 1페이지로
          되돌려져 "첫 페이지밖에 안 보인다"가 된다. 두 증상이 같은 원인이다.
   [해결] 페이지가 바뀌면 표시 중 키도 즉시 같이 갱신해 폴링이 '이미 동기화됨'으로 보게 한다. */
function _pdfSyncShownKey() {
    try {
        var u = String(window._vcShownPdfUrl || '');
        if (!u) return;   // 공유 중인 교재가 없으면 폴링도 관여하지 않음
        window._vcShownPdfKey = u + '|' + ((typeof pdfPageNum !== 'undefined' && pdfPageNum) ? pdfPageNum : 1);
    } catch (e) {}
}
window._pdfSyncShownKey = _pdfSyncShownKey;

function pdfGoToPage(num) { pdfPageNum = num; pdfRender(); _pdfSyncShownKey(); }
// ph250: 시퀀스 자동 이동 — 마지막 페이지에서 [다음] → 다음 파일 자동 로드
function _pdfToast(msg) {
    if (typeof window.showToast === 'function') { try { window.showToast(msg); } catch(_){} }
}
// fix (2026-07-12) — 시퀀스 안에서 현재 표시 중인 파일 위치를 맞춤 (다른 기기가 넘겨도 인덱스 유지)
function pdfSyncSeqIdx(url) {
    if (!(window._libSequence && window._libSequence.length)) return;
    var u = String(url || '');
    if (!u) return;
    for (var i = 0; i < window._libSequence.length; i++) {
        var su = String(window._libSequence[i].url || '');
        if (!su) continue;
        if (u === su || (su.charAt(0) === '/' && u.indexOf(su) >= 0)) { window._libSeqIdx = i; return; }
    }
}
window.pdfSyncSeqIdx = pdfSyncSeqIdx;
// fix (2026-07-12) — 화살표 '자가 복구': 파일 시퀀스(_libSequence)는 원래 교재 라이브러리를 연
//   그 세션에만 존재 → 새 기기/학생/재접속은 화살표가 조용히 죽어 있었음.
//   현재 교재 이름("[교재] 레슨 / 파일")에서 책 이름을 뽑아 서버에서 그 책의 전체 파일 목록을
//   즉석으로 다시 만들어, 어느 기기에서든 화살표가 동작하게 한다.
async function pdfEnsureSequence() {
    if (window._libSequence && window._libSequence.length > 1) return true;
    var nm = window._vcShownPdfName || '';
    var cur = String(window._vcShownPdfUrl || window._vcCurrentPdfUrl || '');
    // 이름이 없으면(옛 방 상태) 현재 URL의 파일 id로 메타데이터 조회해서 이름 복구
    if (!/^\[[^\]]+\]/.test(nm)) {
        var idm = cur.match(/\/api\/textbook-files\/(\d+)\/raw/);
        if (idm) {
            try {
                var mr = await fetch('/api/textbook-files/' + idm[1], { cache: 'no-store' });
                var md = await mr.json();
                if (md && md.ok && md.item && md.item.name) { nm = md.item.name; window._vcShownPdfName = nm; }
            } catch(_){}
        }
    }
    var m = nm.match(/^\[([^\]]+)\]/);
    var book = m ? m[1].trim() : '';
    if (!book) return false;
    try {
        var r = await fetch('/api/textbook-files?book=' + encodeURIComponent(book) + '&limit=20000', { cache: 'no-store' });
        var d = await r.json();
        var items = (d && d.items) || [];
        if (!items.length) return false;
        var cmp = function(a, b){ return String(a||'').localeCompare(String(b||''), undefined, { numeric:true, sensitivity:'base' }); };
        // "[교재] 레슨 / 파일" 파싱 → 레슨·파일명 자연 정렬 (라이브러리 buildBookSequence 와 동일 순서)
        var parsed = [];
        items.forEach(function(it){
            if (it.kind !== 'image' && it.kind !== 'pdf') return;
            var lesson = '미분류', fileName = it.name || '';
            var mm = fileName.match(/^\[([^\]]+)\]\s*(.*)$/);
            if (mm) {
                var rest = mm[2] || '';
                var slash = rest.indexOf('/');
                if (slash >= 0) { lesson = rest.slice(0, slash).trim() || '미분류'; fileName = rest.slice(slash + 1).trim() || it.name; }
                else fileName = rest.trim() || it.name;
            }
            parsed.push({ id: 'srv_' + it.id, url: it.url, kind: it.kind, lesson: lesson, file: fileName, name: it.name });
        });
        parsed.sort(function(a, b){ return cmp(a.lesson, b.lesson) || cmp(a.file, b.file); });
        var seq = parsed.map(function(x){ return { id: x.id, url: x.url, kind: x.kind, name: x.name }; });
        if (!seq.length) return false;
        window._libSequence = seq;
        window._libSeqIdx = 0;
        pdfSyncSeqIdx(cur);
        // URL 매칭 실패 시 이름으로 한 번 더
        if (window._libSeqIdx === 0 && nm) {
            for (var j = 0; j < seq.length; j++) { if (seq[j].name === nm) { window._libSeqIdx = j; break; } }
        }
        console.log('[pdfEnsureSequence] 서버에서 시퀀스 재구성:', book, seq.length + '개 / 현재 ' + (window._libSeqIdx + 1));
        return seq.length > 1;
    } catch(e) { console.warn('[pdfEnsureSequence]', e); return false; }
}
/* ⚡ (2026-08-12 마이마이 ②) 「책이 다음 장으로 안 넘어가고 랙이 걸린다」 — 남은 원인.
   1장=1파일 교재에서는 ◀▶ 의 대부분이 «다음 파일 통째 교체» 라 매번 새 다운로드였다.
   /raw 응답은 immutable 캐시이므로, 시퀀스의 다음 파일을 미리 받아 두면 넘김이 캐시에서 뜬다.
   ⚠️ 수업 회선(WebRTC)과 경쟁하지 않게: 동시 1개만, 20MB 초과는 건너뛴다.
      받다 만 응답은 캐시에 안 남으므로 blob() 으로 끝까지 받는다.

   📊 (2026-08-13) 운영 DB 를 실제로 세어 보고 «한 장만 미리 받는» 것을 넓힌다.
      textbook_files 38,922개 중 **38,860개(99.84%)가 JPG** 이고 PDF 는 62개뿐이다
      (PDF 는 SIU BOOKS 58 · Shake it up 4). 즉 마이마이가 5번 반복한 「PDF 가 느리다」는
      대부분 **PDF 가 아니라 «1장=1파일 JPG 를 넘길 때마다 새로 받는 것»** 이었다.
      JPG 한 장은 작으므로 앞 3장을 미리 받아도 회선 부담이 크지 않다. 뒤로 넘기는 경우가
      있어 **이전 1장**도 받아 둔다. 20MB 상한과 «동시 1개» 는 그대로 지킨다(순차 처리).
      → 이래도 느리면 남은 원인은 회선이지 코드가 아니다(측정값을 문서에 남겼다). */
const PDF_PREFETCH_AHEAD = 3;    // 앞으로 몇 장
const PDF_PREFETCH_BEHIND = 1;   // 뒤로 몇 장
let _pdfPrefetchBusy = false;
window._pdfPrefetchedUrls = window._pdfPrefetchedUrls || Object.create(null);
function _pdfPrefetchNextSeq() {
    try {
        var seq = window._libSequence;
        if (!seq || seq.length < 2) return;
        if (_pdfPrefetchBusy) return;
        var cur = window._libSeqIdx || 0;
        // 가까운 것부터: 다음 1·2·3장 → 이전 1장
        var targets = [];
        for (var a = 1; a <= PDF_PREFETCH_AHEAD; a++) targets.push(cur + a);
        for (var b = 1; b <= PDF_PREFETCH_BEHIND; b++) targets.push(cur - b);
        var queue = [];
        targets.forEach(function (i) {
            var f = seq[i];
            if (!f || !f.url) return;
            if (window._pdfPrefetchedUrls[f.url]) return;
            queue.push(f.url);
        });
        if (!queue.length) return;
        _pdfPrefetchBusy = true;
        // 순차로 하나씩 — 동시에 여러 개를 받으면 수업 회선(WebRTC)과 경쟁한다
        var step = function () {
            var u = queue.shift();
            if (!u) { _pdfPrefetchBusy = false; return; }
            fetch(u).then(function (r) {
                if (!r.ok) return null;
                var len = parseInt(r.headers.get('content-length') || '0', 10);
                if (len > 20 * 1024 * 1024) { try { if (r.body) r.body.cancel(); } catch (_) {} return null; }
                return r.blob();
            }).then(function (blob) {
                if (blob) window._pdfPrefetchedUrls[u] = 1;
                step();
            }).catch(function () { step(); });
        };
        step();
    } catch (_) { _pdfPrefetchBusy = false; }
}
// fix (2026-07-12) — 시퀀스 파일 이동. selectFromTextbookLibrary 는 교재 라이브러리 모달을
//   한 번 연 세션에서만 정의됨(IDB 로드 콜백 내부) → 새 기기/학생용 직접 로드 폴백 필수.
function _pdfGoSeqFile(f) {
    /* 📖 (2026-08-12 Melca 7번) 이건 «페이지» 가 아니라 «교재 파일» 을 통째로 바꾸는 길이다
       (아래에서 vcShareTextbook 을 쏜다). 학생이 첫 페이지에서 ◀ 를 한 번 누르면 반 전체의
       교재가 이전 파일로 갈아치워졌다 — 페이지 넘김보다 반경이 훨씬 크다. */
    if (!window.vcCanControlTextbook()) { window.vcTextbookDenied(); return; }
    if (typeof window.selectFromTextbookLibrary === 'function') {
        window.selectFromTextbookLibrary(f.id, f.url, f.kind, f.name);
        return;
    }
    try { if (typeof vcSwitchTab === 'function') vcSwitchTab('pdf'); } catch(_){}
    Promise.resolve(pdfLoad(f.url, f.kind)).then(function(){
        if (typeof window.vcShareTextbook === 'function') window.vcShareTextbook('lib_' + f.id, f.url, f.kind, f.name);
        _pdfToast('📚 ' + (f.name || '교재 이동'));
    }).catch(function(e){
        console.warn('[_pdfGoSeqFile] 로드 실패', e);
        _pdfToast('❌ 교재 로드 실패');
    });
}
/* 연속으로 넘길 때 상대방에게 매번 쏘면 신호가 폭주 → 마지막 페이지만 150ms 뒤 1회 전송 */
let _pdfBcTimer = null;
function _pdfBroadcastPage() {
    // 🔄 (2026-07-29) 넘긴 즉시 표시 키를 맞춘다 — 전송(150ms 디바운스)을 기다리는 사이
    //   폴링이 끼어들어 이전 페이지로 되돌리는 것을 막는다. vcConn 이 없어도 갱신한다.
    _pdfSyncShownKey();
    window._vcPdfLocalNavAt = Date.now();   // 방금 '내가' 넘겼다는 표시 — 폴링이 끌어가지 못하게
    /* 📖 (2026-08-12 Melca 7번) 「펜 권한을 주면 강사가 페이지를 못 넘긴다」의 진짜 원인.
       페이지 이동은 방 전체에 방송되는데 **보내는 쪽 검사가 없었다.** 그래서 학생이 ◀▶ 를
       누르면 강사 화면도 함께 끌려갔고, 강사에게는 «내가 넘겼는데 되돌아온다 = 제어권을
       빼앗겼다» 로 보였다. 키보드(←→)와 휠은 이미 강사 전용이었는데 **버튼만 뚫려 있었다**
       — 「버튼은 강사 UI 안에만 있다」는 옛 가정이 교재도구 바가 공용이 되면서 깨진 것.
       ⚠️ 학생의 «내 화면에서만» 넘겨보기는 그대로 둔다(위 렌더는 이미 끝났다).
          막는 것은 방송뿐이다 — 수업을 방해하지 않으면서 제어권만 강사에게 돌려준다. */
    if (!window.vcCanControlTextbook()) return;
    if (!vcConn) return;
    if (_pdfBcTimer) clearTimeout(_pdfBcTimer);
    _pdfBcTimer = setTimeout(function () {
        _pdfBcTimer = null;
        try { vcConn.send({ type: 'pdf-page-change', data: { currentPage: pdfPageNum } }); } catch (e) {}
    }, 150);
}
async function pdfPrevPage() {
    if (pdfDoc && pdfPageNum > 1) {
        pdfPageNum = Math.max(1, pdfPageNum - pdfPagesPerView);
        pdfRender();
        _pdfBroadcastPage();
        return;
    }
    // 첫 페이지 → 시퀀스의 이전 파일로 (시퀀스가 없으면 서버에서 재구성 — 새 기기/학생도 동작)
    if (!(window._libSequence && window._libSequence.length > 1)) {
        var ok = await pdfEnsureSequence();
        if (!ok) { _pdfToast('📚 첫 페이지입니다'); return; }
    }
    var idx = window._libSeqIdx || 0;
    if (idx > 0) {
        var prev = window._libSequence[idx - 1];
        window._libSeqIdx = idx - 1;
        console.log('[ph250] 이전 파일로 자동 이동:', prev.name);
        _pdfGoSeqFile(prev);
        return;
    }
    _pdfToast('📚 첫 페이지입니다');
}
async function pdfNextPage() {
    if (pdfDoc && pdfPageNum < pdfDoc.numPages) {
        pdfPageNum = Math.min(pdfDoc.numPages, pdfPageNum + pdfPagesPerView);
        pdfRender();
        _pdfBroadcastPage();
        // ⚡ 마지막 페이지에 닿으면 다음 «파일» 을 미리 받아 둔다 — 다음 클릭이 파일 교체이므로
        if (pdfPageNum >= pdfDoc.numPages) { try { _pdfPrefetchNextSeq(); } catch (_) {} }
        return;
    }
    // 마지막 페이지 → 시퀀스의 다음 파일로 (시퀀스가 없으면 서버에서 재구성 — 새 기기/학생도 동작)
    if (!(window._libSequence && window._libSequence.length > 1)) {
        var ok2 = await pdfEnsureSequence();
        if (!ok2) { _pdfToast('📚 마지막 페이지입니다'); return; }
    }
    var idx2 = window._libSeqIdx || 0;
    if (idx2 < window._libSequence.length - 1) {
        var next = window._libSequence[idx2 + 1];
        window._libSeqIdx = idx2 + 1;
        console.log('[ph250] 다음 파일로 자동 이동:', next.name);
        _pdfGoSeqFile(next);
        return;
    }
    _pdfToast('📚 마지막 파일입니다');
}
/* 📑 (2026-08-07 마이마이 ⑦) 교재 페이지 목록 — 「목록에서 바로 고르기」.
   두 가지가 «페이지» 라 둘 다 담는다:
     ① 파일 시퀀스(_libSequence) — 장마다 파일이 하나인 교재(옛 시스템의 Slide1…Slide24 와 같은 것)
     ② 지금 열려 있는 PDF 의 내부 페이지(pdfDoc.numPages)
   ⚠️ 페이지 이동은 **기존 함수만** 쓴다(_pdfGoSeqFile · pdfGoToPage + _pdfBroadcastPage).
      여기서 직접 렌더·전송을 하면 학생 화면과 어긋나는 두 번째 경로가 생긴다. */
function pdfClosePageList(){
    var p = document.getElementById('pdf-pagelist');
    if (p) p.remove();
}
/* 📄 (2026-08-14 마이마이 8/13 남은 요청) 「쪽 번호가 파일 이름에 안 보인다 — BODA 처럼 되게」
   ═════════════════════════════════════════════════════════════════════════════
   [무엇이 문제였나] 자료실 파일의 이름은 «[BTS 6 Korea (Bedroom, living room)] 미분류 레슨 / Slide12.JPG»
      처럼 **앞부분이 전부 같다.** 목록은 한 줄짜리(말줄임)라 화면에는 어느 줄이나
      「1. [BTS 6 Korea (Bedroom, li…」 만 보였다 — 정작 몇 쪽인지는 잘려 나갔다.
      마이마이가 스크린샷에 파랗게 동그라미 친 것이 이 «똑같이 잘린 줄» 이다.
   [고침] 줄에는 **끝의 쪽 이름만** 남긴다(Slide12.JPG). 책 이름은 어차피 모든 줄이 같아서
      알려 주는 것이 없다. 전체 이름은 title(마우스를 올리면 뜨는 풍선)에 그대로 둔다.
   ⚠️ 파일 이름을 못 알아볼 때만 「12쪽 / Page 12」로 대신한다 — 빈 줄을 만들지 않는다. */
function _pdfShortPageName(full, idx, en){
    var s = String(full || '').trim();
    // 「… / 파일이름」 — 마지막 슬래시 뒤가 진짜 쪽 이름이다
    var slash = s.lastIndexOf('/');
    if (slash >= 0) s = s.slice(slash + 1).trim();
    // 앞에 [교재명] 이 남아 있으면(슬래시가 없던 경우) 그것도 뗀다
    s = s.replace(/^\[[^\]]*\]\s*/, '').trim();
    if (!s) s = (en ? 'Page ' : '') + (idx + 1) + (en ? '' : '쪽');
    return s;
}
function _pdfEscAttr(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
}
async function pdfTogglePageList(){
    var exist = document.getElementById('pdf-pagelist');
    if (exist){ exist.remove(); return; }
    var en = miIsEn();
    var panel = document.createElement('div');
    panel.id = 'pdf-pagelist';
    /* 📐 (2026-08-13 마이마이 8/13 ②) 「고르면 창이 바로 닫힌다 · 크기를 못 늘린다」
       ─────────────────────────────────────────────────────────────────────
       ① 크기 조절 — resize:both. 브라우저가 드래그로 width/height 를 인라인에 쓰므로
          max-height 로 묶으면 세로가 안 늘어난다 → height 로 주고 max-* 는 화면 밖 방지용만.
          resize 는 overflow 가 visible 이 아니어야 동작한다(아래 overflow:hidden 유지).
       ② 고른 크기를 기억한다 — 매 수업마다 다시 늘리게 하지 않는다(localStorage).
       실측: 위의 «관련 영상» 알약이 두 줄이면 100~156 을 쓴다 → 4px 겹쳤다. 172 로 내린다. */
    var _sz = { w: 236, h: 0 };
    try {
        var _saved = JSON.parse(localStorage.getItem('mangoi_pagelist_size') || 'null');
        if (_saved && _saved.w > 0) _sz = _saved;
    } catch (_) {}
    panel.style.cssText = 'position:fixed;left:12px;top:172px;z-index:9600;'
        + 'width:' + Math.max(200, Math.min(_sz.w, window.innerWidth - 24)) + 'px;'
        + (_sz.h > 0 ? 'height:' + Math.max(160, Math.min(_sz.h, window.innerHeight - 190)) + 'px;'
                     : 'height:min(58vh,520px);')
        + 'min-width:200px;min-height:160px;max-width:92vw;max-height:82vh;resize:both;'
        + 'display:flex;flex-direction:column;background:rgba(15,23,42,.97);border:1.5px solid rgba(56,189,248,.5);'
        + 'border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);color:#e2e8f0;font-size:12.5px;overflow:hidden';
    panel.innerHTML = '<div style="display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.25);font-weight:800;color:#7dd3fc">'
        + '<span style="flex:1">📑 ' + (en ? 'Pages' : '페이지 목록') + '</span>'
        + '<button type="button" onclick="pdfClosePageList()" style="background:transparent;border:0;color:#94a3b8;font-size:16px;cursor:pointer;padding:0 4px" aria-label="close">✕</button></div>'
        + '<div id="pdf-pagelist-body" style="overflow-y:auto;padding:6px"><div style="padding:14px;color:#94a3b8">'
        + (en ? 'Loading…' : '불러오는 중…') + '</div></div>';
    document.body.appendChild(panel);
    /* 늘린 크기를 기억한다 — 창을 다시 열 때 그 크기로 뜬다.
       ResizeObserver 가 없는 옛 브라우저에서는 그냥 저장을 건너뛴다(크기 조절 자체는 동작). */
    try {
        if (window.ResizeObserver) {
            var _ro = new ResizeObserver(function(){
                try {
                    if (!panel.isConnected) return;
                    localStorage.setItem('mangoi_pagelist_size',
                        JSON.stringify({ w: Math.round(panel.offsetWidth), h: Math.round(panel.offsetHeight) }));
                } catch (_) {}
            });
            _ro.observe(panel);
        }
    } catch (_) {}

    // 시퀀스가 없으면 서버에서 다시 만든다(새 기기·재접속에서도 목록이 나오게 — 화살표 자가복구와 같은 길)
    try { await pdfEnsureSequence(); } catch(_){}

    var body = document.getElementById('pdf-pagelist-body');
    if (!body) return;
    var seq = window._libSequence || [];
    var curIdx = window._libSeqIdx || 0;
    var html = '';
    var rowCss = 'display:block;width:100%;text-align:left;padding:8px 10px;margin-bottom:3px;border-radius:8px;'
        + 'border:1px solid transparent;background:rgba(30,41,59,.7);color:#cbd5e1;font-size:12px;cursor:pointer;'
        + 'font-family:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    var onCss = 'background:rgba(56,189,248,.22);border-color:rgba(56,189,248,.6);color:#fff;font-weight:800';

    /* 🗑 (2026-08-11 마이마이 ④) 「교재를 잘못 골랐을 때 올린 페이지를 뺄 수 있게 해 주세요」
       ───────────────────────────────────────────────────────────────────────────
       ⚠️ 이 목록의 교재는 **모든 강사가 함께 쓰는 자료**다(BTS 한 종류만 28,555개).
          서버에서 지우면 다른 선생님 수업까지 깨진다 → **서버 파일은 절대 건드리지 않는다.**
          여기서 빼는 것은 «지금 내 화면에 열려 있는 목록»(window._libSequence) 뿐이다.
       [그래서 무엇이 해결되나] 잘못 연 책을 통째로 비우고 바로 옳은 책을 열 수 있다 —
          그게 요청의 실제 목적이다(«in case we select a wrong book»).
       [학생 화면] 학생은 교사가 공유(pdf-share)한 것만 본다. 내 목록 정리는 학생 화면을
          건드리지 않고, 다음에 옳은 교재를 열면 그때 따라온다. */
    var delCss = 'flex:0 0 auto;width:26px;height:26px;border-radius:7px;border:1px solid rgba(148,163,184,.35);'
        + 'background:rgba(30,41,59,.9);color:#94a3b8;font-size:12px;cursor:pointer;padding:0;line-height:1';
    var rowCssFlex = rowCss.replace('margin-bottom:3px;', '').replace('display:block;width:100%;', 'display:block;');
    if (seq.length > 1){
        for (var i = 0; i < seq.length; i++){
            var nmFull = String(seq[i].name || ((en ? 'Page ' : '페이지 ') + (i + 1)));
            var nm = _pdfShortPageName(nmFull, i, en);
            html += '<div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">'
                 + '<button type="button" data-seq="' + i + '" title="' + _pdfEscAttr(nmFull) + '" style="flex:1;min-width:0;' + rowCssFlex + (i === curIdx ? ';' + onCss : '') + '">'
                 + (i + 1) + '. ' + nm.replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]); })
                 + '</button>'
                 + '<button type="button" data-del="' + i + '" title="'
                 + (en ? 'Remove from my list (the file is not deleted)' : '내 목록에서 빼기 (파일은 지워지지 않습니다)')
                 + '" style="' + delCss + '">✕</button>'
                 + '</div>';
        }
        html += '<button type="button" data-clearseq="1" style="display:block;width:100%;margin:6px 0 2px;padding:8px;'
             + 'border-radius:8px;border:1px solid rgba(239,68,68,.45);background:rgba(239,68,68,.12);color:#fca5a5;'
             + 'font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit">🗑 '
             + (en ? 'Wrong book? Clear this list' : '교재를 잘못 골랐나요? 목록 비우기') + '</button>';
    }
    // 현재 파일이 여러 쪽짜리 PDF 면 그 안쪽 페이지도 이어서 보여준다
    if (typeof pdfDoc !== 'undefined' && pdfDoc && pdfDoc.numPages > 1){
        if (html) html += '<div style="margin:8px 4px 4px;font-size:11px;color:#94a3b8;font-weight:700">'
            + (en ? 'Inside this file' : '이 파일 안의 쪽') + '</div>';
        for (var p2 = 1; p2 <= pdfDoc.numPages; p2++){
            html += '<button type="button" data-page="' + p2 + '" style="' + rowCss
                 + (p2 === pdfPageNum ? ';' + onCss : '') + '">' + (en ? 'Page ' : '') + p2
                 + (en ? '' : '쪽') + ' / ' + pdfDoc.numPages + '</button>';
        }
    }
    if (!html){
        body.innerHTML = '<div style="padding:14px;color:#94a3b8;line-height:1.6">'
            + (en ? 'Open a textbook first — the page list appears here.'
                  : '먼저 교재를 열어 주세요. 그러면 여기에 페이지 목록이 나옵니다.') + '</div>';
        return;
    }
    body.innerHTML = html;
    body.querySelectorAll('[data-seq]').forEach(function(b){
        b.addEventListener('click', function(){
            var i = parseInt(this.getAttribute('data-seq'), 10);
            var f = (window._libSequence || [])[i];
            if (!f) return;
            window._libSeqIdx = i;
            try { _pdfGoSeqFile(f); } catch(e){ console.warn('[pagelist]', e); }
            /* 📌 (2026-08-13 마이마이 8/13 ②) 「고르면 창이 바로 닫힌다 — 닫을 때까지 두면 안 되나요」
               → 닫지 않는다. 대신 «지금 보는 쪽» 강조만 옮긴다(BODA 처럼 목록을 띄워 두고 넘긴다).
                 닫는 길은 헤더의 [✕] 하나뿐 — 실수로 사라지지 않는다. */
            _pdfPageListMark(this, 'seq');
        });
    });
    /* 🗑 한 줄 빼기 — 목록(내 화면)에서만. 서버 요청을 보내지 않는다(위 주석 참고). */
    body.querySelectorAll('[data-del]').forEach(function(b){
        b.addEventListener('click', function(ev){
            ev.stopPropagation();
            var i = parseInt(this.getAttribute('data-del'), 10);
            var s = window._libSequence || [];
            if (!s.length || i < 0 || i >= s.length) return;
            s.splice(i, 1);
            /* 보고 있던 위치를 잃지 않게 맞춘다 —
               앞쪽을 빼면 한 칸 당기고, 끝을 빼면 마지막으로 물린다. */
            var cur = window._libSeqIdx || 0;
            if (i < cur) cur--;
            window._libSeqIdx = Math.max(0, Math.min(cur, s.length - 1));
            try { if (typeof showToast === 'function') showToast(en
                ? '🗑 Removed from your list (the file is still in the library)'
                : '🗑 내 목록에서 뺐어요 (자료실의 파일은 그대로예요)'); } catch(_){}
            pdfClosePageList(); pdfTogglePageList();   // 번호를 다시 매겨 그린다
        });
    });
    /* 🗑 통째로 비우기 — 「교재를 잘못 골랐다」의 실제 해결책. 되돌릴 수 없는 일이 아니라
       (다시 고르면 된다) 확인 한 번만 받는다. */
    body.querySelectorAll('[data-clearseq]').forEach(function(b){
        b.addEventListener('click', function(){
            var msg = en
                ? 'Clear this textbook from your list?\n\nThe file is NOT deleted — it stays in the library and other teachers are not affected.'
                : '이 교재를 내 목록에서 비울까요?\n\n파일은 지워지지 않습니다 — 자료실에 그대로 있고 다른 선생님께도 영향이 없습니다.';
            if (!window.confirm(msg)) return;
            window._libSequence = [];
            window._libSeqIdx = 0;
            try { if (typeof showToast === 'function') showToast(en
                ? '🗑 List cleared — pick the right textbook now'
                : '🗑 목록을 비웠어요 — 이제 옳은 교재를 골라 주세요'); } catch(_){}
            pdfClosePageList();
            try { if (typeof openTextbookLibrary === 'function') openTextbookLibrary(); } catch(_){}
        });
    });
    body.querySelectorAll('[data-page]').forEach(function(b){
        b.addEventListener('click', function(){
            var n = parseInt(this.getAttribute('data-page'), 10);
            if (!n) return;
            pdfGoToPage(n);
            try { _pdfBroadcastPage(); } catch(_){}     // 학생 화면도 같은 쪽으로
            _pdfPageListMark(this, 'page');            // 닫지 않는다 — 위 data-seq 주석 참고
        });
    });
}
/* 📑 (2026-08-13) 목록을 열어 둔 채 쓰기 위한 «강조만 옮기기».
   ⚠️ 다시 그리지(pdfTogglePageList) 않는다 — 스크롤 위치와 사용자가 늘린 창 크기가 초기화된다.
      같은 갈래(seq ↔ 파일 목록 / page ↔ 파일 안쪽 쪽)끼리만 강조를 옮긴다. */
function _pdfPageListMark(btn, group){
    try {
        var panel = document.getElementById('pdf-pagelist');
        if (!panel || !btn) return;
        var onParts = ['background:rgba(56,189,248,.22)', 'border-color:rgba(56,189,248,.6)', 'color:#fff', 'font-weight:800'];
        panel.querySelectorAll('[data-' + group + ']').forEach(function(o){
            o.style.background = 'rgba(30,41,59,.7)';
            o.style.borderColor = 'transparent';
            o.style.color = '#cbd5e1';
            o.style.fontWeight = '';
        });
        onParts.forEach(function(p){
            var kv = p.split(':');
            btn.style.setProperty(kv[0], kv.slice(1).join(':'));
        });
        btn.scrollIntoView({ block: 'nearest' });
    } catch (_) {}
}
window.pdfTogglePageList = pdfTogglePageList;
window.pdfClosePageList = pdfClosePageList;

function pdfStopShare() {
    /* 📚 (2026-08-12 Melca 7번) 학생이 누르면 **반 전체의 교재가 사라진다** — 강사·관리자만. */
    if (!window.vcCanControlTextbook()) { window.vcTextbookDenied(); return; }
    pdfDoc = null;
    pdfCurrentId = null;
    document.getElementById('pdf-canvas').getContext('2d').clearRect(0, 0, 9999, 9999);
    document.getElementById('pdf-page-info').textContent = '-';
    if (vcConn) vcConn.send({ type: 'pdf-stop-share', data: {} });
}
function pdfClearRemote() {
    pdfDoc = null; pdfCurrentId = null;
    document.getElementById('pdf-canvas').getContext('2d').clearRect(0, 0, 9999, 9999);
    document.getElementById('pdf-page-info').textContent = '-';
}

/* ================================================================
   7b. 동영상 플레이어 (YouTube URL 또는 업로드 파일)
   ──────────────────────────────────────────────────────────────────
   - URL 또는 파일로 동영상 재생
   - 📌 미니 버튼: 플로팅 창으로 분리해서 칠판·PDF 보면서 동시 시청
================================================================ */
let vpIsFloating = false;

function vpExtractYouTubeId(url) {
    const re = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/;
    const m = url.match(re);
    return m ? m[1] : null;
}

// 🆕 빨간 YouTube 버튼 — 칠판화면에 미니 YouTube(검색 + 자동 재생) UI 표시
//   1) 주소창(vp-url) 에 'www.youtube.com' 자동 입력
//   2) 칠판(vp-stage) 에 즉시 YouTube 패널을 그리고 인기/추천 영상을 자동 재생
//   3) 패널 안 검색칸에 영상 URL 또는 ID를 붙여넣으면 즉시 임베드 재생
//   * youtube.com 메인 페이지는 X-Frame-Options 정책으로 iframe 직접 임베드가 불가능하므로
//     "사용 가능한 YouTube 영상"을 칠판에 자동으로 띄우는 형태로 구현
function vpOpenYouTube() {
    const urlInput = document.getElementById('vp-url');
    let raw = (urlInput?.value || '').trim();

    // 1) URL 입력칸이 비어있으면 www.youtube.com 자동 입력 (주소창에 표시)
    if (!raw) {
        if (urlInput) urlInput.value = 'www.youtube.com';
        raw = 'www.youtube.com';
    }

    // 입력에 YouTube 영상 ID/URL 이 들어있으면 → 기존 vpLoadUrl 로 위임 (그 영상을 바로 재생)
    const directId = (typeof vpExtractYouTubeId === 'function') ? vpExtractYouTubeId(raw) : null;
    if (directId) { vpLoadUrl(); return; }

    // 2) 칠판화면(vp-stage)에 YouTube 미니 브라우저 패널 렌더
    const stage = (typeof vpIsFloating !== 'undefined' && vpIsFloating)
        ? document.getElementById('vp-floating-body')
        : document.getElementById('vp-stage');
    if (!stage) return;

    const isEn = miIsEn();

    // 추천 영상 (embed 친화적 · 영어교육/동요/명강연 위주, 평생 안정된 인기 영상으로 선정)
    const featured = [
        { id: 'XqZsoesa55w', ko: '🦈 Baby Shark',          en: '🦈 Baby Shark' },
        { id: '_UR-l3QI2nE', ko: '🎵 Super Simple Songs',  en: '🎵 Super Simple Songs' },
        { id: 'iG9CE55wbtY', ko: '🎓 TED · 켄 로빈슨',     en: '🎓 TED · Ken Robinson' },
        { id: 'arj7oStGLkU', ko: '✨ TED-Ed 추천',         en: '✨ TED-Ed Pick' },
        { id: 'kJQP7kiw5Fk', ko: '🎶 Despacito',           en: '🎶 Despacito' },
        { id: '9bZkp7q19f0', ko: '🕺 Gangnam Style',       en: '🕺 Gangnam Style' },
        { id: 'JGwWNGJdvx8', ko: '🎤 Shape of You',        en: '🎤 Shape of You' },
        { id: 'OPf0YbXqDm0', ko: '🎷 Uptown Funk',         en: '🎷 Uptown Funk' }
    ];

    stage.innerHTML = `
        <div style="display:flex;flex-direction:column;height:100%;width:100%;background:#0f0f0f;color:#fff;overflow:hidden">
          <div style="padding:10px 12px;background:#212121;display:flex;gap:8px;align-items:center;border-bottom:1px solid #303030;flex-wrap:wrap;flex-shrink:0">
            <svg width="36" height="25" viewBox="0 0 159 110" style="flex-shrink:0">
              <path d="M154 17.5c-1.82-6.73-7.07-12-13.8-13.8C128.2 0 79.5 0 79.5 0S30.8 0 18.7 3.7C12 5.5 6.7 10.8 4.9 17.5 1.2 29.6 1.2 55 1.2 55s0 25.4 3.7 37.5c1.82 6.73 7.07 12 13.8 13.8C30.8 110 79.5 110 79.5 110s48.7 0 60.8-3.7c6.73-1.82 12-7.07 13.8-13.8 3.7-12.1 3.7-37.5 3.7-37.5s0-25.4-3.7-37.5z" fill="#ff0000"/>
              <path d="M64 78V32l40 23z" fill="#fff"/>
            </svg>
            <input id="vp-yt-search" type="text" placeholder="${isEn?'Paste YouTube URL or search query':'YouTube 주소 또는 검색어 입력'}"
                   style="flex:1;min-width:160px;padding:9px 14px;border-radius:99px;border:1px solid #404040;background:#121212;color:#fff;font-size:13.5px;outline:none" />
            <button id="vp-yt-go" style="padding:9px 16px;border:0;border-radius:99px;background:linear-gradient(135deg,#ff0000,#cc0000);color:#fff;font-weight:700;cursor:pointer;font-size:12.5px;white-space:nowrap;box-shadow:0 4px 12px rgba(255,0,0,.35)">🔍 ${isEn?'Play / Search':'재생 / 검색'}</button>
            <button id="vp-yt-open" style="padding:9px 14px;border:1px solid #404040;border-radius:99px;background:transparent;color:#fff;font-weight:600;cursor:pointer;font-size:12px;white-space:nowrap">🔗 ${isEn?'New tab':'새 탭'}</button>
          </div>
          <div id="vp-yt-player" style="flex:1;min-height:0;position:relative;background:#000"></div>
          <div id="vp-yt-rail" style="background:#181818;border-top:1px solid #303030;padding:8px 10px;display:flex;gap:8px;overflow-x:auto;flex-shrink:0">
            ${featured.map(v => `
              <button class="vp-yt-tile" data-vid="${v.id}" style="flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:6px;background:transparent;border:1px solid #303030;border-radius:8px;cursor:pointer;color:#fff;width:128px;transition:all .15s">
                <img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" style="width:116px;height:65px;object-fit:cover;border-radius:5px;background:#000;display:block" loading="lazy" onerror="this.style.background='#222';this.style.height='65px'" />
                <span style="font-size:10.5px;color:#ddd;font-weight:600;width:116px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left">${isEn?v.en:v.ko}</span>
              </button>
            `).join('')}
          </div>
        </div>`;

    const searchInput = document.getElementById('vp-yt-search');
    const playerBox   = document.getElementById('vp-yt-player');
    const goBtn       = document.getElementById('vp-yt-go');
    const openBtn     = document.getElementById('vp-yt-open');

    // 🎯 패널 안에서 영상 재생 — ID/URL 이면 embed, 검색어면 새 탭 + 안내
    const playInPlayer = (queryOrUrl) => {
        const q = (queryOrUrl || '').trim();
        if (!q) return;
        playerBox.innerHTML = '';
        const ytId = (typeof vpExtractYouTubeId === 'function' ? vpExtractYouTubeId(q) : null)
                  || (/^[a-zA-Z0-9_-]{11}$/.test(q) ? q : null);

        if (ytId) {
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#000';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.allowFullscreen = true;
            iframe.setAttribute('playsinline', '');
            iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&playsinline=1`;
            playerBox.appendChild(iframe);
            // 다른 참가자에게도 자동 공유
            if (typeof vcConn !== 'undefined' && vcConn) {
                try { vcConn.send({ type: 'video-share', data: { url: `https://www.youtube.com/watch?v=${ytId}`, type: 'youtube' } }); } catch(e){}
            }
        } else {
            // 검색어 → YouTube 검색 결과는 iframe 차단되므로 안내 + 새 탭 자동 열기
            playerBox.innerHTML = `
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;color:#fff;background:linear-gradient(180deg,#0a0a0a,#1a0000)">
                <div style="font-size:48px;margin-bottom:14px">🔎</div>
                <div style="font-size:15px;font-weight:700;margin-bottom:6px">${isEn?'Searching YouTube for':'YouTube 검색'}: "${q}"</div>
                <div style="font-size:12px;color:#aaa;max-width:380px;line-height:1.55;margin-bottom:18px">${isEn?'YouTube blocks search inside iframes. The search has been opened in a new tab — copy a video URL and paste it above to play here.':'YouTube 검색은 보안 정책상 칠판 안에 직접 표시되지 않습니다. 새 탭에서 검색이 자동으로 열렸어요 — 원하는 영상의 주소를 복사해 위 입력칸에 붙여 넣으면 칠판에서 바로 재생됩니다.'}</div>
                <button onclick="window.open('https://www.youtube.com/results?search_query=${encodeURIComponent(q)}','_blank','noopener')" style="padding:12px 26px;background:#ff0000;color:#fff;border:0;border-radius:99px;cursor:pointer;font-size:14px;font-weight:700;box-shadow:0 8px 22px rgba(255,0,0,.4)">🔗 ${isEn?'Open search again':'새 탭에서 다시 열기'}</button>
              </div>`;
            try { window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), '_blank', 'noopener'); } catch(e){}
        }
    };

    goBtn.onclick = () => {
        const v = (searchInput.value || '').trim();
        if (!v) { window.open('https://www.youtube.com','_blank','noopener'); return; }
        const u = document.getElementById('vp-url'); if (u) u.value = v;
        playInPlayer(v);
    };
    searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') goBtn.click(); });
    openBtn.onclick = () => window.open('https://www.youtube.com','_blank','noopener');

    // 추천 영상 타일 → 즉시 재생
    document.querySelectorAll('.vp-yt-tile').forEach(t => {
        t.onclick = () => {
            const vid = t.getAttribute('data-vid');
            const u = document.getElementById('vp-url');
            if (u) u.value = `https://www.youtube.com/watch?v=${vid}`;
            playInPlayer(vid);
        };
        t.onmouseenter = () => { t.style.background = '#272727'; t.style.borderColor = '#555'; };
        t.onmouseleave = () => { t.style.background = 'transparent'; t.style.borderColor = '#303030'; };
    });

    // 🎬 자동 재생: 첫 번째 추천 영상을 칠판에 바로 표시 → "YouTube 가 자동으로 칠판에 나오게" 충족
    playInPlayer(featured[0].id);
}

function vpLoadUrl() {
    let url = (document.getElementById('vp-url').value || '').trim();
    if (!url) { alert('URL을 입력하세요.'); return; }
    // 프로토콜 누락 시 https:// 자동 보정
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const stage = vpIsFloating ? document.getElementById('vp-floating-body') : document.getElementById('vp-stage');
    stage.innerHTML = '';

    const ytId = vpExtractYouTubeId(url);
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    const isVideoFile = /\.(mp4|webm|ogg|mov|m4v|mkv)(\?.*)?$/i.test(url);

    // 동영상 URL을 다른 참가자에게 공유
    window._vcShownVideoUrl = url;   // 발신자 자신은 폴링이 다시 로드하지 않도록 기록
    if (vcConn) {
        vcConn.send({ type: 'video-share', data: { url: url, type: ytId ? 'youtube' : vimeoMatch ? 'vimeo' : isVideoFile ? 'file' : 'web' } });
    }

    if (ytId) {
        // YouTube (enablejsapi=1 → 진행위치 읽기·일시정지 제어 가능)
        const iframe = document.createElement('iframe');
        iframe.id = 'vp-yt-frame';
        iframe.className = 'vp-yt';
        iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.allowFullscreen = true;
        iframe.setAttribute('playsinline', '');
        stage.appendChild(iframe);
    } else if (vimeoMatch) {
        // Vimeo
        const iframe = document.createElement('iframe');
        iframe.src = `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
        iframe.allow = 'autoplay; fullscreen; picture-in-picture';
        iframe.allowFullscreen = true;
        stage.appendChild(iframe);
    } else if (isVideoFile) {
        // 직접 동영상 파일
        const vid = document.createElement('video');
        vid.src = url;
        vid.controls = true;
        vid.autoplay = true;
        vid.playsInline = true;
        stage.appendChild(vid);
    } else if (vpIsUnembeddableYouTube(url)) {
        /* 🎬 (2026-07-28 실사고) 유튜브 주소인데 영상 ID 가 없으면(메인·검색결과·재생목록)
           유튜브가 iframe 임베드를 거부해 '깨진 문서 아이콘'만 남는다.
           강사는 왜 안 되는지 알 수 없어 수업 중에 그대로 멈춰 있었다 → 이유와 해법을 화면에 직접 알려준다. */
        vpRenderUnplayable(stage, url);
    } else {
        // 일반 웹사이트 → vpRenderWebUrl 공통 헬퍼 사용 (vpLoadUrlRemote 와 동일 동작)
        vpRenderWebUrl(stage, url);
    }
}

/** 유튜브 주소이지만 '영상 하나'가 아니어서 수업 화면에 띄울 수 없는 경우인지 판정.
 *  (메인 페이지 · 검색 결과 · 재생목록 · 채널 등 — 전부 유튜브가 임베드를 거부한다) */
function vpIsUnembeddableYouTube(url) {
    var host = '';
    try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return false; }
    if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return false;
    return !vpExtractYouTubeId(url);   // 영상 ID 가 뽑히면 embed 로 정상 재생되므로 여기 해당 없음
}

/** 재생할 수 없는 주소일 때 '왜 안 되는지 + 어떻게 하면 되는지' 를 한/영으로 보여준다.
 *  깨진 문서 아이콘만 남기지 않는 것이 목적. */
function vpRenderUnplayable(stage, url) {
    var en = false;
    try { en = (localStorage.getItem('mangoi_lang') || localStorage.getItem('mango_lang')) === 'en'; } catch (e) {}
    var box = document.createElement('div');
    box.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:#0f172a;color:#e2e8f0;';
    var sample = 'https://www.youtube.com/watch?v=XXXXXXXXXXX';
    box.innerHTML =
        '<div style="font-size:40px;line-height:1">🎬</div>'
      + '<div style="font-size:17px;font-weight:800;color:#fff">'
      + (en ? 'This address cannot be played here' : '이 주소는 수업 화면에서 재생할 수 없어요')
      + '</div>'
      + '<div style="font-size:13.5px;line-height:1.7;max-width:560px;color:#cbd5e1">'
      + (en
          ? 'YouTube does not allow its home page, search results or playlists to be shown inside another page.<br>Please paste the address of <b>one video</b> — it must contain the video id.'
          : '유튜브는 메인 페이지·검색 결과·재생목록을 다른 화면 안에 띄우는 것을 허용하지 않아요.<br><b>영상 하나</b>의 주소를 붙여넣어 주세요 — 주소 안에 영상 번호가 들어 있어야 해요.')
      + '</div>'
      + '<div style="font-family:MangoiHanSC,Consolas,monospace;font-size:12.5px;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:9px 14px;color:#93c5fd;word-break:break-all;max-width:560px">' + sample + '</div>'
      + '<div style="display:flex;gap:9px;flex-wrap:wrap;justify-content:center">'
      + '<button type="button" data-act="open" style="padding:10px 20px;background:#ff0000;color:#fff;border:0;border-radius:99px;font-weight:800;font-size:13px;cursor:pointer">'
      + (en ? '🔗 Open in a new tab' : '🔗 새 탭에서 열기') + '</button>'
      + '<button type="button" data-act="back" style="padding:10px 20px;background:#fbbf24;color:#1a1a1a;border:0;border-radius:99px;font-weight:800;font-size:13px;cursor:pointer">'
      + (en ? '📚 Back to Class' : '📚 바로 수업으로') + '</button>'
      + '</div>';
    try { box.querySelector('[data-act="open"]').onclick = function () { window.open(url, '_blank', 'noopener'); }; } catch (e) {}
    try { box.querySelector('[data-act="back"]').onclick = function () { if (typeof vpBackToClass === 'function') vpBackToClass(); }; } catch (e) {}
    stage.appendChild(box);
}

/** 일반 웹사이트 URL 을 iframe 으로 렌더링하는 공통 헬퍼.
 *   - vpLoadUrl (호스트 발신) 과 vpLoadUrlRemote (참가자 수신) 양쪽에서 동일 사용.
 *   - sameOrigin URL 은 차단 감지 OFF, cross-origin 은 8초 타임아웃 후 fallback.
 *   - 모바일 LTE 환경 고려, X-Frame-Options 막힐 일 없는 same-origin 신뢰.
 */
function vpRenderWebUrl(stage, url) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;background:#0f172a;';

    // 상단 주소 바 + 컨트롤
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;padding:8px 10px;background:#1e293b;border-bottom:1px solid #334155;font-size:12px;color:#cbd5e1;flex:0 0 auto;flex-wrap:wrap;';
    bar.innerHTML = `<span style="flex:1 1 100%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🌐 ${url}</span>
        <button type="button" data-act="open" style="padding:6px 12px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;white-space:nowrap;">🔗 새 탭에서 열기</button>`;
    bar.querySelector('[data-act="open"]').onclick = () => window.open(url, '_blank', 'noopener');

    const frameBox = document.createElement('div');
    frameBox.style.cssText = 'position:relative;flex:1 1 auto;min-height:300px;background:#fff;';

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals');

    let sameOrigin = false;
    try { sameOrigin = (new URL(url).host === location.host); } catch {}

    const loading = document.createElement('div');
    loading.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0f172a;color:#94a3b8;font-size:13px;gap:10px;';
    loading.innerHTML = `<div style="width:36px;height:36px;border:3px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:vp-spin 0.8s linear infinite;"></div>
        <div>로딩 중… <span style="color:#64748b;">(${url.replace(/^https?:\/\//,'').slice(0,40)})</span></div>`;

    const makeBlockedNotice = () => {
        loading.remove();
        const notice = document.createElement('div');
        notice.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;padding:24px;text-align:center;';
        notice.innerHTML = `<div style="font-size:48px;margin-bottom:14px;">🚫</div>
            <div style="font-size:15px;margin-bottom:8px;font-weight:600;">이 사이트는 화면 안에 띄울 수 없습니다</div>
            <div style="font-size:12px;color:#94a3b8;margin-bottom:20px;max-width:420px;line-height:1.5;">보안 정책으로 iframe 임베드를 차단한 사이트입니다. 새 탭에서 여세요.</div>
            <button type="button" style="padding:10px 22px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">🔗 새 탭에서 열기</button>`;
        notice.querySelector('button').onclick = () => window.open(url, '_blank', 'noopener');
        frameBox.appendChild(notice);
    };

    let loaded = false;
    const blockTimer = sameOrigin ? null : setTimeout(() => { if (!loaded) makeBlockedNotice(); }, 8000);
    iframe.addEventListener('load', () => {
        loaded = true;
        if (blockTimer) clearTimeout(blockTimer);
        loading.remove();
        if (!sameOrigin) {
          try {
              const doc = iframe.contentDocument;
              if (doc && doc.body && doc.body.children.length === 0 && doc.URL === 'about:blank') {
                  makeBlockedNotice();
              }
          } catch {}
        }
    });

    frameBox.appendChild(iframe);
    frameBox.appendChild(loading);
    wrapper.appendChild(bar);
    wrapper.appendChild(frameBox);
    stage.appendChild(wrapper);
}

/** 원격에서 동영상 URL을 수신했을 때 로컬에서 재생 (WebSocket 재전송 안 함)
 *  ⚠ 수신자는 클릭(사용자 제스처) 없이 코드가 영상을 띄우므로, 소리 켠 자동재생은
 *    브라우저 정책이 차단 → 첫 장면(썸네일)에서 멈춰 보였음.
 *    → 음소거 자동재생(허용됨)으로 일단 '재생'시키고 🔊 버튼으로 소리를 켜게 함. */
function vpLoadUrlRemote(url) {
    if (!url) return;
    window._vcShownVideoUrl = url;   // 폴링 중복 로드 방지 키
    document.getElementById('vp-url').value = url;
    const stage = vpIsFloating ? document.getElementById('vp-floating-body') : document.getElementById('vp-stage');
    stage.innerHTML = '';

    const ytId = vpExtractYouTubeId(url);
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    const isVideoFile = /\.(mp4|webm|ogg|mov|m4v|mkv)(\?.*)?$/i.test(url);
    // 🎬 (2026-08-12 Melca 피드백) 공유받은 영상은 «학생이 조작 불가» — 강사만 재생을 제어.
    //   컨트롤 숨김(controls=0)만으로는 화면 클릭 일시정지가 남으므로 iframe 자체를
    //   pointer-events:none 으로 잠근다. 「🔊 소리 켜기」 버튼은 iframe 밖 오버레이라 그대로 산다.
    const _vpViewerLocked = (typeof window.vcCanControlTextbook === 'function' && !window.vcCanControlTextbook());

    if (ytId) {
        const iframe = document.createElement('iframe');
        iframe.id = 'vp-yt-frame';
        iframe.className = 'vp-yt';
        iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&rel=0&playsinline=1&enablejsapi=1${_vpViewerLocked ? '&controls=0&disablekb=1&fs=0' : ''}&origin=${encodeURIComponent(location.origin)}`;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.allowFullscreen = !_vpViewerLocked;
        iframe.setAttribute('playsinline', '');
        if (_vpViewerLocked) iframe.style.pointerEvents = 'none';
        stage.appendChild(iframe);
        vpAddSoundOverlay(stage, 'youtube');
    } else if (vimeoMatch) {
        const iframe = document.createElement('iframe');
        iframe.src = `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1&muted=1`;
        iframe.allow = 'autoplay; fullscreen; picture-in-picture';
        iframe.allowFullscreen = !_vpViewerLocked;
        if (_vpViewerLocked) iframe.style.pointerEvents = 'none';
        stage.appendChild(iframe);
        vpAddSoundOverlay(stage, 'vimeo');
    } else if (isVideoFile) {
        const vid = document.createElement('video');
        vid.src = url;
        vid.controls = !_vpViewerLocked;
        vid.autoplay = true;
        vid.muted = true;
        vid.playsInline = true;
        stage.appendChild(vid);
        vpAddSoundOverlay(stage, 'file');
    } else if (vpIsUnembeddableYouTube(url)) {
        // 🎬 (2026-07-28) 발신 측과 동일 처리 — 학생 화면에도 깨진 아이콘 대신 이유를 보여준다.
        vpRenderUnplayable(stage, url);
    } else {
        // 🩹 옛 코드는 "🔗 새 탭에서 열기" 버튼만 표시 → 수신자가 페이지를 못 봤음.
        //    이제 vpLoadUrl 과 동일하게 iframe 으로 렌더링.
        vpRenderWebUrl(stage, url);
    }
    console.log('[vc] 원격 동영상 수신:', url);
}

/** 🔊 음소거 자동재생 위에 얹는 '소리 켜기' 버튼 — 클릭(제스처) 순간 소리를 살린다. */
function vpAddSoundOverlay(stage, kind) {
    const old = stage.querySelector('.vp-sound-overlay');
    if (old) old.remove();
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'vp-sound-overlay';
    btn.textContent = miIsEn() ? '🔊 Tap for sound' : '🔊 소리 켜기';
    btn.style.cssText = 'position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:30;'
        + 'padding:10px 22px;border:none;border-radius:999px;background:rgba(37,99,235,.95);color:#fff;'
        + 'font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.45);';
    btn.onclick = function () {
        try {
            if (kind === 'youtube') {
                const f = stage.querySelector('iframe');
                if (f && f.contentWindow) {
                    ['unMute', 'playVideo'].forEach(function (fn) {
                        f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: fn, args: [] }), '*');
                    });
                    f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }), '*');
                }
            } else if (kind === 'vimeo') {
                const f = stage.querySelector('iframe');
                if (f && f.contentWindow) {
                    f.contentWindow.postMessage(JSON.stringify({ method: 'setVolume', value: 1 }), '*');
                    f.contentWindow.postMessage(JSON.stringify({ method: 'play' }), '*');
                }
            } else {
                const v = stage.querySelector('video');
                if (v) { v.muted = false; v.volume = 1; v.play().catch(function(){}); }
            }
        } catch (_) {}
        btn.remove();
    };
    stage.appendChild(btn);
}

/** 공유 동영상 적용 공통 경로 — WebSocket 수신·폴링 양쪽에서 사용 (중복 로드 방지) */
window.vcApplySharedVideo = function (vUrl) {
    try {
        if (!vUrl || /^blob:/i.test(vUrl)) return;
        // 🥭 (2026-07-13) 교사가 동영상 공유 → 세로폰 '내용 크게(pip)' 자동 전환
        window.__vcVideoSharing = true;
        try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}
        if (vUrl === window._vcShownVideoUrl) return;   // 이미 같은 영상 표시 중
        vpLoadUrlRemote(vUrl);
        vcSwitchTab('video');
    } catch (e) { console.warn('[vcApplySharedVideo]', e); }
};

/** 원격에서 동영상 공유 중지 수신 */
function vpClearRemote() {
    window._vcShownVideoUrl = '';
    // 🥭 공유 종료 → 세로폰은 다시 '선생님 크게'로 복귀
    window.__vcVideoSharing = false;
    try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch(_){}
    const stage = document.getElementById('vp-stage');
    stage.innerHTML = '<div class="vp-empty">'+(miIsEn()?'🎬 Paste a YouTube URL or upload a video file.':'🎬 YouTube 주소를 붙여넣거나 동영상 파일을 업로드하세요.')+'</div>';
    const body = document.getElementById('vp-floating-body');
    if (body) body.innerHTML = '';
    const floating = document.getElementById('vp-floating');
    if (floating) floating.style.display = 'none';
    vpIsFloating = false;
    document.getElementById('vp-url').value = '';
}

async function vpUploadFile(input) {
    const f = input.files && input.files[0];
    if (!f) return;
    input.value = '';   // 같은 파일을 다시 선택해도 change 가 뜨도록 초기화
    const stage = vpIsFloating ? document.getElementById('vp-floating-body') : document.getElementById('vp-stage');
    const en = miIsEn();
    // 🩹 (2026-07-13) 옛 코드는 URL.createObjectURL(로컬 blob)을 붙여 '올린 사람만 보이는' 재생이었다.
    //   blob: 주소는 다른 참가자가 접근할 수 없다. 이제 서버(R2)에 올린 뒤 그 URL 을
    //   video-share 로 방 전체에 전파 → 학생·강사 누구든 파일 자료를 진짜로 공유할 수 있다.
    const lower = (f.name || '').toLowerCase();
    if (!/\.(mp4|webm|mov|m4v)$/.test(lower)) {
        alert(en ? 'Only MP4 / WEBM / MOV video files can be shared.' : 'MP4 / WEBM / MOV 동영상 파일만 공유할 수 있습니다.');
        return;
    }
    if (f.size > 100 * 1024 * 1024) {
        alert(en ? 'Video is too large (max 100MB).' : '동영상이 너무 큽니다 (최대 100MB).');
        return;
    }
    const mb = Math.max(1, Math.round(f.size / 1024 / 1024));
    stage.innerHTML = '<div class="vp-empty">' + (en ? '⏳ Uploading… (' + mb + 'MB) — it will appear on everyone\'s screen.' : '⏳ 업로드 중… (' + mb + 'MB) — 완료되면 모두의 화면에 나옵니다.') + '</div>';
    let sendType = f.type;
    if (!sendType) {
        if (lower.endsWith('.webm')) sendType = 'video/webm';
        else if (lower.endsWith('.mov')) sendType = 'video/quicktime';
        else if (lower.endsWith('.m4v')) sendType = 'video/x-m4v';
        else sendType = 'video/mp4';
    }
    try {
        const qs = new URLSearchParams({ roomId: vcRoomId || '', filename: f.name || 'video.mp4' }).toString();
        const res = await fetch('/api/video-call/upload-pdf?' + qs, {
            method: 'POST',
            headers: { 'Content-Type': sendType },
            body: f
        });
        const result = await res.json();
        if (!(result && result.success && result.url)) throw new Error((result && result.error) || 'upload failed');
        const abs = location.origin + result.url;
        window._vcShownVideoUrl = abs;   // 발신자 자신은 room-media 폴링이 다시 로드하지 않도록 기록
        if (vcConn) vcConn.send({ type: 'video-share', data: { url: abs, type: 'file' } });
        stage.innerHTML = '';
        const vid = document.createElement('video');
        vid.src = abs;
        vid.controls = true;
        vid.autoplay = true;
        vid.playsInline = true;
        stage.appendChild(vid);
    } catch (e) {
        console.warn('[vpUploadFile] 서버 공유 실패, 로컬 재생 폴백:', e);
        // 실패해도 최소한 본인 화면에서는 재생 (기존 동작 유지)
        stage.innerHTML = '';
        const vid = document.createElement('video');
        vid.src = URL.createObjectURL(f);
        vid.controls = true;
        vid.autoplay = true;
        vid.playsInline = true;
        stage.appendChild(vid);
        alert((en ? 'Upload failed — playing on your screen only: ' : '업로드에 실패해 내 화면에서만 재생됩니다: ') + (e && e.message || e));
    }
}

function vpClear() {
    window._vcShownVideoUrl = '';
    if (vcConn) vcConn.send({ type: 'video-stop-share', data: {} });
    const stage = document.getElementById('vp-stage');
    stage.innerHTML = '<div class="vp-empty">'+(miIsEn()?'🎬 Paste a YouTube URL or upload a video file.':'🎬 YouTube 주소를 붙여넣거나 동영상 파일을 업로드하세요.')+'</div>';
    const body = document.getElementById('vp-floating-body');
    if (body) body.innerHTML = '';
    const floating = document.getElementById('vp-floating');
    if (floating) floating.style.display = 'none';
    vpIsFloating = false;
    const urlInput = document.getElementById('vp-url');
    if (urlInput) urlInput.value = '';
}

/* ── 🆕 (2026-07-12) 동영상 '바로 수업으로' + 진행위치 표시줄 ──────────────
   · vpBackToClass(): 재생 중 영상을 멈추고 칠판(수업) 탭으로 즉시 복귀.
   · 진행위치 표시줄: 유튜브 자체 컨트롤을 안 가리게 스테이지 '아래' 전용 줄로,
     항상 보이게. 업로드 영상=native, 유튜브=IFrame API(실패해도 재생엔 지장 없음). */
function vpBackToClass(){
    // ① 재생 중 미디어 '확실히' 정지 — 스테이지 + 미니(플로팅) 플레이어 모두.
    //   유튜브 임베드는 enablejsapi=1 이 없으면 postMessage 명령이 무시되어
    //   화면만 가려지고 소리가 계속 나오던 버그 → 명령이 안 먹는 iframe 은 src 를 비워 완전 종료.
    ['vp-stage', 'vp-floating-body'].forEach(function(cid){
        var box = document.getElementById(cid);
        if (!box) return;
        box.querySelectorAll('video').forEach(function(v){ try { v.pause(); } catch(e){} });
        box.querySelectorAll('iframe').forEach(function(f){
            var src = String(f.src || '');
            if (src.indexOf('youtube.com/embed') < 0 && src.indexOf('youtube-nocookie.com/embed') < 0) return;
            var paused = false;
            if (f._ytPlayer && f._ytPlayer.pauseVideo) { try { f._ytPlayer.pauseVideo(); paused = true; } catch(e){} }
            if (!paused && src.indexOf('enablejsapi=1') >= 0) {
                try { f.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}','*'); paused = true; } catch(e){}
            }
            if (!paused) { try { f.src = 'about:blank'; } catch(e){} }   // 명령 불가 임베드 → 강제 종료 (소리 즉시 멈춤)
        });
    });
    // ② 수업(교재) 화면으로 복귀
    vpOpenTextbook();
}
window.vpBackToClass = vpBackToClass;

/* '바로 수업으로' 복귀 목적지 — 교재가 화면에 나오게.
   ① 교재가 이미 열려 있음 → 교재(pdf) 탭 전환만
   ② 이 세션에서 본 교재 URL 있음 → 조용히 다시 로드(재공유 없이 내 화면 복원)
   ③ 서버 교재 시퀀스 재구성(pdfEnsureSequence, 새 기기/재접속)으로 현재 파일 로드
   ④ 그래도 교재를 못 찾으면 기존처럼 칠판 */
async function vpOpenTextbook(){
    try { if (typeof vcSetContentCollapsed === 'function') vcSetContentCollapsed(false); } catch(e){}
    var hasDoc = false;
    try { hasDoc = !!pdfDoc; } catch(e){}
    if (hasDoc) { try { vcSwitchTab('pdf'); } catch(e){} return; }
    var url = '';
    try { url = String(window._vcShownPdfUrl || window._vcCurrentPdfUrl || ''); } catch(e){}
    if (url) {
        try { vcSwitchTab('pdf'); } catch(e){}
        try { await pdfLoad(url, window._vcCurrentPdfKind || undefined); return; } catch(e){ console.warn('[vpOpenTextbook] 재로드 실패', e); }
    }
    try {
        if (typeof pdfEnsureSequence === 'function' && await pdfEnsureSequence()) {
            var seq = window._libSequence, i = window._libSeqIdx || 0;
            if (seq && seq[i]) {
                try { vcSwitchTab('pdf'); } catch(e){}
                try { await pdfLoad(seq[i].url, seq[i].kind); return; } catch(e){}
            }
        }
    } catch(e){}
    try { vcToggleContentTab('whiteboard'); } catch(e){}
}
window.vpOpenTextbook = vpOpenTextbook;

(function(){
    var stage = document.getElementById('vp-stage');
    var prog  = document.getElementById('vp-progress');
    if (!stage || !prog) return;
    var fill = document.getElementById('vp-pg-fill');
    var knob = document.getElementById('vp-pg-knob');
    var track= document.getElementById('vp-pg-track');
    var tEl  = document.getElementById('vp-pg-time');
    var timer = null, cur = null, curKind = null;   // cur = <video> 또는 YT.Player

    function fmt(s){ s = Math.max(0, Math.floor(s||0)); var m=Math.floor(s/60), ss=s%60; return m+':'+(ss<10?'0':'')+ss; }
    function paint(t, d){
        d = d||0; t = Math.min(t||0, d);
        var pct = d>0 ? (t/d*100) : 0;
        fill.style.width = pct+'%'; knob.style.left = pct+'%';
        tEl.textContent = fmt(t)+' / '+fmt(d);
    }
    function show(){ prog.classList.add('show'); }
    function hide(){ prog.classList.remove('show'); paint(0,0); }
    function stopTimer(){ if(timer){ clearInterval(timer); timer=null; } }

    function detach(){
        stopTimer();
        if (cur && curKind==='video' && cur._vpUpd){
            cur.removeEventListener('timeupdate', cur._vpUpd);
            cur.removeEventListener('durationchange', cur._vpUpd);
            cur.removeEventListener('loadedmetadata', cur._vpUpd);
        }
        cur = null; curKind = null;
    }

    function attachVideo(v){
        detach(); cur = v; curKind = 'video'; show();
        var upd = function(){ paint(v.currentTime, v.duration); };
        v.addEventListener('timeupdate', upd);
        v.addEventListener('durationchange', upd);
        v.addEventListener('loadedmetadata', upd);
        v._vpUpd = upd; upd();
    }

    function attachYouTube(frame){
        detach(); curKind = 'yt';
        ytReady(function(){
            try {
                var p = new YT.Player(frame, { events: {
                    'onReady': function(){
                        frame._ytPlayer = p; cur = p; curKind = 'yt'; show();
                        stopTimer();
                        timer = setInterval(function(){
                            try { if (p && p.getDuration) paint(p.getCurrentTime(), p.getDuration()); } catch(e){}
                        }, 500);
                    }
                }});
                frame._ytPlayer = p;
            } catch(e){ /* API 실패 → 유튜브 기본 컨트롤로 그냥 재생 */ }
        });
    }

    // 클릭으로 원하는 위치로 이동(seek)
    track.addEventListener('click', function(ev){
        // 🎬 (2026-08-12 Melca 피드백) 수업 중 학생은 재생 위치를 못 움직인다 — 강사만 제어.
        //   "학생이 빨리감기·되감기를 하면 수업을 건너뛸 수 있다 — BODA 처럼 막아 달라."
        if (document.body.classList.contains('vc-in-call')
            && typeof window.vcCanControlTextbook === 'function' && !window.vcCanControlTextbook()) {
            try {
                var _en = (typeof getLang === 'function' && getLang() === 'en');
                if (typeof mangoToast === 'function') mangoToast(_en ? 'Only the teacher can control the video.' : '영상은 선생님만 조작할 수 있어요.');
            } catch(_){}
            return;
        }
        var r = track.getBoundingClientRect();
        var pct = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        if (curKind==='video' && cur && cur.duration) { cur.currentTime = pct*cur.duration; }
        else if (curKind==='yt' && cur && cur.getDuration) { try { cur.seekTo(pct*cur.getDuration(), true); } catch(e){} }
    });

    // YouTube IFrame API 로더 (한 번만)
    var _ytLoading=false, _ytCbs=[];
    function ytReady(cb){
        if (window.YT && window.YT.Player) { cb(); return; }
        _ytCbs.push(cb);
        if (_ytLoading) return;
        _ytLoading = true;
        var prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function(){
            if (typeof prev==='function'){ try{ prev(); }catch(e){} }
            var l=_ytCbs.slice(); _ytCbs=[]; l.forEach(function(f){ try{ f(); }catch(e){} });
        };
        var s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
    }

    // #vp-stage 안 미디어 변화 감시 → 붙이기/떼기
    function scan(){
        var v = stage.querySelector('video');
        var f = stage.querySelector('iframe.vp-yt, iframe[src*="youtube.com/embed"]');
        if (v){ if (!v._vpAttached){ v._vpAttached=true; attachVideo(v); } }
        else if (f){ if (!f._vpAttached){ f._vpAttached=true; attachYouTube(f); } }
        else { detach(); hide(); }
    }
    try { new MutationObserver(scan).observe(stage, {childList:true}); } catch(e){}
    scan();
})();

/** 미니 플레이어 토글: 스테이지 ↔ 플로팅 창 사이에서 미디어 요소를 이동 */
function vpTogglePiP() {
    const stage = document.getElementById('vp-stage');
    const floating = document.getElementById('vp-floating');
    const body = document.getElementById('vp-floating-body');
    if (!vpIsFloating) {
        const media = stage.querySelector('iframe, video');
        if (!media) { alert(miIsEn()?'Load a video first.':'먼저 영상을 불러오세요.'); return; }
        body.innerHTML = '';
        body.appendChild(media);
        floating.style.display = 'flex';
        vpIsFloating = true;
        stage.innerHTML = '<div class="vp-empty">'+(miIsEn()?'📌 Moved to mini player.<br><span style="font-size:0.8rem;color:#475569;">Press ✕ or 📌 again to return.</span>':'📌 미니 플레이어로 이동했습니다.<br><span style="font-size:0.8rem;color:#475569;">✕를 누르거나 다시 📌를 누르면 되돌아옵니다.</span>')+'</div>';
        vpMakeDraggable();
    } else {
        vpFloatingClose();
    }
}

function vpFloatingClose() {
    const stage = document.getElementById('vp-stage');
    const floating = document.getElementById('vp-floating');
    const body = document.getElementById('vp-floating-body');
    const media = body.querySelector('iframe, video');
    if (media) {
        stage.innerHTML = '';
        stage.appendChild(media);
    }
    floating.style.display = 'none';
    vpIsFloating = false;
}

/** 미니 플레이어 헤더 드래그로 위치 이동 */
function vpMakeDraggable() {
    const floating = document.getElementById('vp-floating');
    const header = document.getElementById('vp-floating-header');
    if (floating._dragBound) return;
    floating._dragBound = true;
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    header.addEventListener('pointerdown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        dragging = true;
        try { header.setPointerCapture(e.pointerId); } catch(_){}
        const r = floating.getBoundingClientRect();
        sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
        floating.style.right = 'auto';
        floating.style.bottom = 'auto';
        floating.style.left = ox + 'px';
        floating.style.top = oy + 'px';
    });
    header.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const maxX = window.innerWidth - 80;
        const maxY = window.innerHeight - 40;
        const nx = Math.max(0, Math.min(maxX, ox + e.clientX - sx));
        const ny = Math.max(0, Math.min(maxY, oy + e.clientY - sy));
        floating.style.left = nx + 'px';
        floating.style.top = ny + 'px';
    });
    const end = () => { dragging = false; };
    header.addEventListener('pointerup', end);
    header.addEventListener('pointercancel', end);
}

/* ================================================================
   8. 채팅
================================================================ */
let chatUnread = 0;

/** 🔔 (2026-07-24) 채팅창 '열기' — 멱등(이미 열려 있으면 아무 것도 하지 않음).
 *  vcToggleChat 은 토글이라 자동열기에서 부르면 '열려 있을 때 오히려 닫히는' 사고가 난다.
 *  그래서 열기 전용 함수를 따로 두고 토글은 이걸 재사용한다. */
function vcOpenChat() {
    const panel = document.getElementById('vc-chat-panel');
    if (!panel || panel.classList.contains('open')) return;
    panel.classList.add('open');
    chatUnread = 0;
    try { document.getElementById('vc-chat-badge').classList.add('hidden'); } catch(e){}
    try { vcDockChatBadge(0); } catch(e){}                      // 📱 하단 독 배지도 함께 끔
    try { vcRefreshChatTargets(); } catch(e){}   // 🔒 열 때마다 참가자 칩 최신화
}
window.vcOpenChat = vcOpenChat;

function vcToggleChat() {
    const panel = document.getElementById('vc-chat-panel');
    if (!panel) return;
    if (!panel.classList.contains('open')) { vcOpenChat(); return; }
    panel.classList.remove('open');
}

/** 🔔 (2026-07-24 사장님 지시) 상대가 채팅을 보내면 채팅창을 자동으로 연다 — A안.
 *  수업 흐름을 깨면 안 되는 상황에서는 '열지 않고' 하단 독 채팅 버튼에 빨간 배지+깜빡임만 띄운다.
 *  ⚠️ 여기서 입력칸에 focus() 를 하면 모바일 소프트키보드가 올라와 수업 화면을 한 번 더 덮는다. 절대 금지. */
function vcChatAutoOpen() {
    // 🔕 (2026-07-25 사장님 지시) 자동 열림이 교재 위 필기도구 버튼을 가려서 기본 OFF.
    //    채팅은 접힌 채 두고 배지(상단+하단 독)로만 알린다 — 채팅 버튼을 누르면 그때 열린다.
    //    (배지는 이 함수 호출 전에 이미 켜진다.) 다시 자동으로 열려면 window.VC_CHAT_AUTO_OPEN = true.
    if (window.VC_CHAT_AUTO_OPEN !== true) return;
    const body = document.body;
    if (!body || !body.classList.contains('vc-in-call')) return;   // 수업 중이 아니면 무시
    const panel = document.getElementById('vc-chat-panel');
    if (!panel || panel.classList.contains('open')) return;        // 이미 열려 있음

    // ── 열면 오히려 사고가 나는 상황 ──
    let blocked = null;
    // ① 모바일 세로 + '가로로 돌려주세요' 안내가 아직 안 닫힌 상태.
    //    이때 열면 상위 CSS 가 blur + pointer-events:none 을 걸어 '보이는데 눌리지 않는 유령 창'이 된다.
    //    ⚠️ matchMedia('(orientation:portrait)') 를 그대로 쓰면 뷰포트가 0으로 보고되는 상황
    //       (숨겨진 탭·레이아웃 전)에도 '세로'로 판정돼 PC 에서까지 자동열기가 막힌다.
    //       → 실제 크기를 읽어 0 이면 판정하지 않는다.
    const _vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const _vh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (_vw > 0 && _vw <= 920 && _vh > _vw && !body.classList.contains('vc-orientation-dismissed')) blocked = 'orientation';
    // ② 교사가 건 집중 모드 — 학생 화면을 마음대로 바꾸지 않는 것이 이 모드의 취지
    else if (window.__vcFocusLockedByTeacher === true) blocked = 'focus-lock';
    // ③ 학생이 게임·미션 플레이 중 — 모바일 세로에서 화면 하단 절반을 덮어 마이크 미션을 망친다
    else if (document.getElementById('game-suite-frame')) blocked = 'game';

    if (blocked) {
        try { vcDockChatBadge(chatUnread, true); } catch(e){}      // 대신 독 버튼에서 강하게 알림
        return;
    }
    vcOpenChat();
}
window.vcChatAutoOpen = vcChatAutoOpen;

function vcSendChat() {
    const input = document.getElementById('vc-chat-input');
    const text = input.value.trim();
    if (!text || !vcConn) return;
    // 🔒 개별(1:1) 채팅 — 대상이 지정돼 있으면 그 사람에게만 전송.
    //   D1 영속 저장·@멘션 알림은 생략(개인 대화가 전체 기록/알림에 노출되지 않게).
    if (window.vcChatTarget && window.vcChatTarget.userId) {
        vcConn.send({ type: 'chat-message', data: { message: text, toUserId: window.vcChatTarget.userId } });
        input.value = '';
        return;
    }
    vcConn.send({ type: 'chat-message', data: { message: text } });
    // 🆕 Phase K1: D1에 영속 저장 (실시간 표시는 vcReceiveChat 에코로)
    try {
        fetch('/api/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                room_id: vcRoomId,
                sender_uid: vcUserId,
                sender_name: vcUsername,
                sender_role: (typeof vcIsObserver !== 'undefined' && vcIsObserver) ? 'observer' : 'student',
                message: text,
                // 🔐 학생 참여자 인증(서버가 vc_roster 확인 + sender_uid 위조 방지). 교사/관리자는 쿠키세션으로 통과.
                token: (function(){ try { return localStorage.getItem('mango_token') || ''; } catch(e){ return ''; } })(),
            })
        }).catch(() => {});
    } catch {}
    // 📲 Phase K4: @멘션 자동 푸시 알림톡
    //   "@홍길동" 또는 "@hong" 패턴 감지 → 해당 학생의 카톡으로 알림 발송
    //   조건: demoStudents 에 해당 이름/uid 존재 + 본인은 강사로 판단됨 (관리자 시뮬레이션 또는 강사 로그인)
    try {
        const mentionPattern = /@([A-Za-z0-9가-힣_]+)/g;
        const mentions = [];
        let m;
        while ((m = mentionPattern.exec(text)) !== null) {
            mentions.push(m[1]);
        }
        if (mentions.length > 0) {
            mentions.forEach(name => {
                // demoStudents 에서 이름 또는 uid 매칭
                let student = null;
                if (typeof demoStudents !== 'undefined' && demoStudents) {
                    for (const k in demoStudents) {
                        const s = demoStudents[k];
                        if (k === name || s.name === name || s.uid === name) { student = s; break; }
                    }
                }
                if (!student || !student.phone) return;
                fetch('/api/notify/mention', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mentioned_student_name: student.name,
                        mentioned_phone: student.phone,
                        teacher_name: vcUsername,
                        message_excerpt: text,
                        room_url: location.origin + '/?room=' + vcRoomId,
                    })
                }).then(r=>r.json()).then(d => {
                    if (d.ok) console.log('[k4] 멘션 알림 발송:', name, d.mode);
                }).catch(()=>{});
            });
            // 시각적 피드백 (작은 안내)
            try { vcAddChatSystem('📲 @' + mentions.join(', @') + ' 카톡 알림 발송됨'); } catch{}
        }
    } catch (e) { console.warn('[k4] mention err:', e); }
    input.value = '';
}

function vcReceiveChat(data) {
    const container = document.getElementById('vc-chat-messages');
    const isMine = data.userId === vcUserId;
    const isSystem = data.type === 'system';
    const isDm = !!data.dm;
    const cls = (isSystem ? 'system' : (isMine ? 'mine' : 'other')) + (isDm ? ' dm' : '');
    const time = new Date(data._loadedAt || Date.now()).toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'});

    let html = `<div class="chat-msg ${cls}">`;
    if (!isSystem && !isMine) html += `<div class="msg-sender">${escHtml(data.username)}</div>`;
    // 🔒 개별 메시지 표시 — 내가 보낸 건 "→ 받는사람", 받은 건 "개별 메시지" 태그
    if (isDm) html += `<div class="msg-dm-tag">🔒 ${isMine ? escHtml(data.toUsername || '개별') + ' 에게만' : '나에게만 (개별)'}</div>`;
    html += `<div class="msg-bubble">${escHtml(data.message)}</div>`;
    html += `<div class="msg-time">${time}</div></div>`;
    container.innerHTML += html;
    container.scrollTop = container.scrollHeight;

    // 🔔 안읽음 표시 + 자동열기 (2026-07-24)
    //   조건 4개는 전부 필요하다. 하나라도 빠지면 아래 사고가 난다:
    //     · isMine    — 서버가 보낸사람에게도 에코하므로, 빼면 내가 칠 때마다 창이 열림
    //     · isSystem  — 입·퇴장 안내도 이 함수를 타므로, 빼면 누가 들어올 때마다 창이 열림
    //     · _loadedAt — 입장 시 과거 200개를 다시 그리므로, 빼면 입장하자마자 창이 열림
    //     · open      — 이미 열려 있으면 배지도 자동열기도 불필요
    if (!isMine && !isSystem && !data._loadedAt && !document.getElementById('vc-chat-panel').classList.contains('open')) {
        chatUnread++;
        const badge = document.getElementById('vc-chat-badge');
        badge.textContent = chatUnread;
        badge.classList.remove('hidden');
        // 📱 상단 배지는 640px 이하에서 숨겨져 있어(모바일) 학생이 채팅 온 걸 알 방법이 없었다 → 하단 독에도 표시
        try { vcDockChatBadge(chatUnread, true); } catch(e){}
        try { vcChatAutoOpen(); } catch(e){}
    }
}

// 🆕 Phase K1: 방 입장 시 이전 채팅 200개 로드
async function vcLoadChatHistory() {
    if (!vcRoomId) return;
    try {
        const r = await fetch('/api/chat/messages?room_id=' + encodeURIComponent(vcRoomId) + '&limit=200' + '&token=' + encodeURIComponent((function(){ try { return localStorage.getItem('mango_token')||''; } catch(e){ return ''; } })()));
        const d = await r.json();
        if (!d.ok || !d.rows || !d.rows.length) return;
        const container = document.getElementById('vc-chat-messages');
        if (!container) return;
        // 시스템 로딩 표시
        const banner = document.createElement('div');
        banner.style.cssText = 'text-align:center;font-size:11px;color:#94a3b8;padding:6px;border-bottom:1px dashed rgba(255,255,255,.08);margin-bottom:6px';
        banner.textContent = '─ 이전 채팅 ' + d.rows.length + '개 불러옴 ─';
        container.appendChild(banner);
        for (const m of d.rows) {
            vcReceiveChat({
                userId: m.sender_uid,
                username: m.sender_name || '익명',
                message: m.message,
                type: (m.sender_role === 'system') ? 'system' : 'user',
                _loadedAt: m.sent_at,        // 로드된 메시지 표시
            });
        }
    } catch (e) { console.warn('[vc-chat] history load:', e); }
}

function vcAddChatSystem(message) {
    vcReceiveChat({ type: 'system', message, userId: '_system', username: '시스템' });
}

/* 🧹 (2026-07-24) 채팅 리셋 — 채팅 패널 입력창 아래 '채팅 지우기' 버튼에서 호출.
   화면에 보이는 대화를 그 자리에서 전부 지운다. 상담 내용이 다음 수업까지 남지 않게 하는 것이 목적.
   서버(D1)의 기록 자체는 지우지 않는다 — 실제 학생 데이터라 감사·분쟁 대비로 남겨야 하고,
   어차피 이력 자동 로드를 껐기 때문에 재입장해도 화면에는 다시 나타나지 않는다. */
function vcResetChat() {
    var en = (document.documentElement.lang === 'en');
    if (!confirm(en ? 'Clear the chat shown here?' : '지금 보이는 채팅을 모두 지울까요?')) return;
    try {
        var box = document.getElementById('vc-chat-messages');
        if (box) box.innerHTML = '';
    } catch(e) { console.warn('[vc-chat] reset:', e); }
    // 미읽음 배지도 함께 정리 — 지웠는데 숫자만 남아 있으면 안 지워진 것처럼 보인다
    try {
        var badge = document.getElementById('vc-chat-badge');
        if (badge) { badge.textContent = '0'; badge.classList.add('hidden'); }
    } catch(e) {}
}
window.vcResetChat = vcResetChat;

/* ════════════════════════════════════════════════════════════════
   🔒 개별(1:1) 채팅 — 대상 지정 시스템 (2026-07-14)
   · 채팅 패널 상단 칩([👥 전체] + 참가자별)으로 대상 선택
   · 각 참가자 비디오 박스 우상단 💬 버튼 → 그 사람과 바로 개별 채팅
   · 대상이 방을 나가면 자동으로 전체 채팅으로 복귀
   ════════════════════════════════════════════════════════════════ */
window.vcChatTarget = null;   // null = 전체, {userId, username} = 개별

function vcChatParticipants() {
    const out = [];
    document.querySelectorAll('#vc-video-grid > .video-box').forEach(b => {
        if (!b.id || b.id === 'vc-local-box') return;
        const uid = b.id.replace('vc-video-', '');
        if (!uid || uid === 'demoteacher') return;
        const lbl = b.querySelector('.video-label');
        out.push({ userId: uid, username: (lbl && lbl.textContent) || '참가자' });
    });
    return out;
}

function vcSetChatTarget(userId, username) {
    window.vcChatTarget = userId ? { userId, username: username || '참가자' } : null;
    vcRefreshChatTargets();
    // 패널이 닫혀 있으면 열기 (얼굴 💬 버튼으로 지정했을 때)
    try {
        const panel = document.getElementById('vc-chat-panel');
        if (panel && !panel.classList.contains('open') && typeof vcToggleChat === 'function') vcToggleChat();
    } catch(_) {}
    const input = document.getElementById('vc-chat-input');
    if (input) {
        input.placeholder = window.vcChatTarget
            ? ('🔒 ' + window.vcChatTarget.username + ' 에게만 보내기…')
            : (input.getAttribute(miIsEn() ? 'data-en-ph' : 'data-ko-ph') || '메시지 입력...');
        try { input.focus(); } catch(_) {}
    }
}

function vcRefreshChatTargets() {
    const bar = document.getElementById('vc-chat-target-bar');
    if (!bar) return;
    const people = vcChatParticipants();
    // 대상이 방에서 나갔으면 전체로 자동 복귀
    if (window.vcChatTarget && !people.some(p => p.userId === window.vcChatTarget.userId)) {
        window.vcChatTarget = null;
        const input = document.getElementById('vc-chat-input');
        if (input) input.placeholder = input.getAttribute('data-ko-ph') || '메시지 입력...';
    }
    const cur = window.vcChatTarget;
    bar.innerHTML = '';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'chat-target-chip' + (cur ? '' : ' active');
    all.textContent = '👥 전체';
    all.onclick = function(){ vcSetChatTarget(null); };
    bar.appendChild(all);
    people.forEach(p => {
        const c = document.createElement('button');
        c.type = 'button';
        c.className = 'chat-target-chip dm' + ((cur && cur.userId === p.userId) ? ' active' : '');
        c.textContent = '🔒 ' + p.username;
        c.onclick = function(){ vcSetChatTarget(p.userId, p.username); };
        bar.appendChild(c);
    });
}

/* 비디오 박스 우상단 💬 버튼 — 누르면 그 사람과 개별 채팅 */
function vcAddDmButton(box, userId) {
    try {
        if (!box || !userId || userId === 'demoteacher') return;
        if (box.querySelector('.vc-dm-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'vc-dm-btn';
        btn.type = 'button';
        btn.title = '이 참가자에게만 채팅 (개별 채팅)';
        btn.textContent = '💬';
        btn.addEventListener('click', function(e){
            e.stopPropagation();
            const lbl = box.querySelector('.video-label');
            vcSetChatTarget(userId, (lbl && lbl.textContent) || '참가자');
        });
        box.style.position = box.style.position || 'relative';
        box.appendChild(btn);
    } catch(_) {}
}

/* ================================================================
   유틸리티 함수
================================================================ */

/** 상태 점 업데이트 (초록/빨강/노랑) */
function setStatusDot(id, state) {
    const dot = document.getElementById(id);
    dot.className = `status-dot ${state}`;
}

/** HTML 이스케이프 (XSS 방지) */
function escHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ================================================================
   초기화
================================================================ */
window.addEventListener('DOMContentLoaded', () => {
    wbInit();  // 칠판 이벤트 리스너 등록

    // URL 파라미터로 관찰자 모드 입장 (?observe=roomId)
    const urlParams = new URLSearchParams(window.location.search);
    const observeRoom = urlParams.get('observe');
    if (observeRoom) {
        // 약간 지연 후 관찰자 모드 입장 (UI 초기화 완료 대기)
        setTimeout(() => vcJoinAsObserver(observeRoom), 500);
    }
});

