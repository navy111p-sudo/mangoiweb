// idx-main.js — 홈 화면 부분 (2026-08-23 «수업 부분» 을 js/idx-main-vc.js 로 분리)
//
// 왜 갈랐나
//   이 파일 하나가 851KB 였고, 첫 그림을 막는 무게 1,557KB 의 절반이 넘었다.
//   그런데 그 중 약 400KB 는 «수업에 들어간 뒤에만» 쓰는 코드다 —
//   홈만 보는 학생도 그걸 전부 받고 «실행까지» 끝나야 화면이 그려졌다.
//   필리핀 회선에서는 그 시간이 그대로 «홈이 늦게 뜸» 이고, 이 파일에 수업 입장 코드가
//   들어 있어 수업 시작도 그만큼 늦어진다.
//
// 어떻게 갈랐나 — 최상위의 vc* 함수 선언 · window.vc* 대입 · vc 를 직접 가리키는
//   최상위 리스너/타이머를 «통째로» 옮겼다. 본문은 한 글자도 고치지 않았다.
//   옮긴 쪽(idx-main-vc.js)은 defer 로 받는다 = 첫 그림을 막지 않는다.
//   defer 스크립트는 «HTML 파싱이 끝난 뒤, DOMContentLoaded 전에» 실행되므로,
//   사람이 눌러서 시작하는 수업 입장(항상 그 뒤)에는 이미 준비돼 있다.
//
// ⛔ 되돌리려면: 두 파일을 다시 이어 붙이고 index.html 의 태그를 한 줄로 되돌린다.
// ⚠️ 새 vc* 함수는 idx-main-vc.js 에 쓴다. 이 파일 최상위에서 vc* 이름을 «부팅 중에»
//    가리키면 그 순간엔 아직 없어서 ReferenceError 가 난다(실제로 밟았다 — vcManualReconnect).
//    감시: test-harness/manual/vc-split-boot-browser.mjs (사람이 부르는 브라우저 검사)
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

/* 🎯 (2026-08-11 강사 피드백 — "영상이 멈춘다", "렉") 트랙에 «무엇을 찍고 있는지» 를 알려 준다.
   인코더는 이 힌트가 없으면 «화질을 지킬지, 초당 장수를 지킬지» 를 스스로 짐작한다.
   수업 영상은 사람 얼굴·입모양이라 **초당 장수가 먼저**다 — 잠깐 흐려지는 것보다 멈추는 게 나쁘다.
     · 카메라  → 'motion' : 부하가 걸리면 화질을 먼저 낮추고 프레임을 지킨다(끊김 방지)
     · 마이크  → 'speech' : 음악이 아니라 말이라고 알려 주면 잡음억제·인코딩이 대화에 맞춰진다
     · 화면공유는 여기서 건드리지 않는다 — 글자가 뭉개지면 안 되므로 'detail'(vcShareMyScreen 참조)
   ⚠️ 표준 속성이라 미지원 브라우저에서는 그냥 무시된다(예외 없음). */
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

/* ──────────────────────────────────────────────────────────────
   🎤 내 마이크 자가치유 (2026-07-14) — "학생 소리가 안 들려요" 근본 대책 (송신측)
   문제: 모바일에서 앱 전환/화면 꺼짐 시 OS 가 마이크 트랙을 강제 종료(ended)시키는데,
        기존엔 "복구 불가" 로그만 남기고 방치 → 그 뒤로 상대에게 내 소리가 영영 안 감.
   해결: 오디오 트랙이 전부 죽어 있으면 마이크를 다시 획득해 모든 피어의 sender 에
        replaceTrack — 재협상 없이 즉시 소리 복구. (앱 복귀 시 + 5초 감시에서 호출)
   ────────────────────────────────────────────────────────────── */
let __vcMicHealAt = 0;

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
/* 버튼 모양 갱신 — 공유 중이면 빨강 */

/** 앱 복귀 시: 트랙 enable + 비디오 재생 + ICE/WebSocket 복구 */

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
/* 전체 연결 상태를 보고 배너 표시/숨김을 결정 */

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
/* 예전 이름 호환 — 기존 호출부(제스처 언뮤트 등)는 그대로 동작 */

/* <video>의 소리가 브라우저 정책/WebView 버그로 막혔을 때: 오디오 트랙만 뽑아
   숨은 <audio> 엘리먼트로 재생(우회). 비디오는 영구 음소거로 바꿔 이중재생 방지. */

/* 큰 "🔊 소리 켜기" 버튼 — 터치가 필요할 때만 표시. 누르면 모든 원격 소리 살림 */

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
            const outputBlocked = aux ? (aux.muted || aux.paused) : (v.muted || v.paused);
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
            // 매 틱 자동 복구 시도
            try {
                v.volume = 1;
                if (aux) { aux.volume = 1; if (aux.paused) aux.play().catch(()=>{}); }
                else if (v.muted || v.paused) { v.muted = false; if (v.paused) v.play().catch(()=>{}); }
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
let vcMicOn = true;
let vcCamOn = true;
// 하단 독(vc-dock.js)은 window 값을 본다 — 선언과 동시에 한 벌 더 맞춰 둔다 (2026-07-24)
let vcIsObserver = false;       // 관찰자 모드 (수신 전용)

/** 🔒 자동저장 / 🔁 자동로그인 — localStorage 키 */
const VC_AUTH_KEYS = {
  saveId:    'mangoi_vc_save_id',
  autoLogin: 'mangoi_vc_auto_login',
  uid:       'mangoi_vc_uid',
  pw:        'mangoi_vc_pw',
};

/** 체크박스 상태 변경 핸들러 */


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
/* 강사·관리자에게만 연습방 입구를 보여 준다 — 학생 로비를 어지럽히지 않는다. */

/** 페이지 로드 시 — 저장된 ID/PW/방번호 복원 + 자동로그인 처리 */
// 페이지 준비 완료 시·로비 진입 시 복원
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
/** 저장된 역할 — 지금 로그인한 사람의 것일 때만 돌려준다. 아니면 '' */

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

/** 결정론적 room_id 로 실제 입장 (기존 vcJoinRoom 흐름 재사용) */

/** ⏰ 입장 시간 게이트 — 시작 10분 전이 되기 전엔 대기, 열리면 자동 입장 */

/** 👩‍🏫 교사용 — 오늘 여러 수업 중 선택 (선택 → 학생과 같은 방으로 연결) */

// ═══════════════════════════════════════════════════════════════
// ⏳ Phase RM 2단계 — 방 안 '상대 입장 대기' 표시 + 5분 노쇼 알림
//   Phase RM 로 입장(vcEnterResolvedRoom)한 세션에서만 동작. window.vcPeerRoles 를 폴링해
//   상대(내가 학생/관찰=선생님 대기, 내가 선생님=학생 대기) 입장 여부를 판단(기존 핸들러 미변경).
// ═══════════════════════════════════════════════════════════════
var vcWaitTimer = null;

// 🆕 학생 입장 즉시 담당 선생님 호출(푸시/카톡) — no-show 엔드포인트 재사용, 대기 0분(즉시)
// 🆕 시연용 선생님 타일 (실제 강사 미입장 시 데모용). dataset.role='teacher' 라 대기카드가 자동으로 '입장' 처리

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
/** 방금 확보한 스트림을 «한 번만» 가져간다. 살아 있지 않으면 null(호출자가 정상 획득으로 내려감). */

/* 🔁 (2026-07-24) 늦게 허용된 미디어 자동 재협상.
   replaceTrack 은 '이미 만들어진 sender' 가 있을 때만 통한다. 권한 없이 입장했던 피어에는
   해당 kind 의 sender 자체가 없어(m-line 0) 기존 자가치유가 조용히 무력화된다.
   → sender 가 없는 피어만 골라 vcReconnectPeer 로 '지금의 트랙'으로 다시 세운다.
   (vcReconnectPeer 자체가 8초 쿨다운 + glare 회피를 갖고 있어 폭주하지 않음) */

/** 다자간 통화 방 입장 */

// ═══════════════════════════════════════════════════════════════
// 📲 Phase K2~K3 — 수업 시작/종료/요약 자동 알림톡 트리거
// ═══════════════════════════════════════════════════════════════

// 수업 종료 시 호출 (closeVideoCall 등에서 트리거)

// ═══════════════════════════════════════════════════════════════
// 🎁 Phase P5 — 화상수업 입장 → 자동 적립 (attendance + on_time)
// ═══════════════════════════════════════════════════════════════

// 적립 토스트 (화면 상단 중앙에 잠시 표시)

/** 관찰자 모드로 입장 (관리자 전용 — 미디어 없이 수신만) */

/* 👁 (2026-08-11 SID ③) 참관 결과를 «글자로» 말해 준다.
   [고치는 것] 예전에는 붙든 못 붙든 화면이 「연결 중…」 하나였다. 관리자는 고장인지, 기다리면
   되는 건지, 방이 원래 빈 건지 구분할 방법이 없었다. 「안 눌린다 / 로딩이 안 된다」 는 신고의
   절반은 이 «말 없음» 이다.
   [판정] 서버가 보내 주는 사실만 쓴다 — 새로 재지 않는다.
     · existing-users 를 받았고 사람이 있다  → 붙었다(배너 없음, 화면이 곧 뜬다)
     · existing-users 를 받았는데 0명        → 방은 살아 있는데 아무도 없다(고장 아님)
     · 8초가 지나도 아무 응답이 없다          → 참관 자체가 실패 = 다시 시도할 것
   ⚠️ 배너는 «참관 모드에서만» 띄운다. 일반 수업 화면에 뜨면 학생이 겁먹는다. */


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

/** 🔁 영상을 못 주는 피어 목록 — 재시도 대상 선정. (감시 판정과 같은 기준: «살아있는 비디오 트랙») */

/** 🔁 멈춘 피어를 «한 번만» 자동 복구 — TURN 릴레이 강제 + 참가자용 복구 루틴 재사용.
 *  한 번만인 이유: 두 번째도 실패하는 연결은 세 번째도 실패한다. 반복하면 상대(강사) 쪽
 *  업로드에 offer 폭탄만 던지는 꼴이라, 최종 배너를 남기고 사람에게 넘기는 쪽이 맞다. */

/** 참관 화면에 «실제로 재생 중인» 원격 영상이 하나라도 있는가 */

/** 피어 상태를 읽어 «어느 단계에서 멈췄는지» 를 한 줄로 — 배너 괄호 안에 그대로 붙는다.
 *  콘솔을 못 여는 사람도 이 한 줄만 찍어서 보내면 원인 분류가 된다. */

/** 다자간 통화 메시지 처리 */

/** 특정 사용자에 대한 P2P 연결을 생성하고 Offer를 보냅니다. */

/* 🔥🔋 모바일 발열 최소화 — 송신 비디오 코덱·비트레이트·fps 상한 + 백그라운드 절전
   · H.264/VP8(하드웨어 가속 코덱) 우선 → 인코딩을 칩이 대신 처리 = CPU·발열↓
   · 비트레이트·fps 상한 → 인코더가 풀가동하지 않게 함 (발열의 핵심 주범)
   · 휴대폰일 때만 강하게 적용, PC는 화질 우선                                   */

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
/** 모드별 기본 상한 — 적응 로직은 이 값을 기준으로 더 낮추기만 한다.
    '저'는 화상수업 표준인 **360p·15fps** 를 노린다. 얼굴 위주 수업에서는 이 정도면 충분히 또렷하고,
    데이터는 자동(720p)의 1/3 수준으로 떨어진다.
    ⚠️ 더 낮추면(예: 10fps) 눈에 띄게 뚝뚝 끊겨 보인다 — 화질보다 '움직임'이 먼저 상한다. */
/** 설정 팝업이 부르는 함수 (자동/고/저) */

/* 🖥 전체화면 — 기본 켜짐. 설정에서 끄면 기억한다. */
/* 사용자 조작 없이 요청하면 브라우저가 막는다 → 다음 터치/클릭 때 한 번만 다시 시도 */

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
                if (dSent + dLost < 25) return;  // 표본 부족(영상 꺼짐 등) — 판단 보류
                const lossPct = 100 * dLost / (dSent + dLost);
                let step = pc.__qStep || 0;
                if (lossPct > 6 || rtt > 450) {
                    pc.__qGood = 0;
                    if (step < STEPS.length - 1) step++;
                } else if (lossPct < 1.5 && (rtt === 0 || rtt < 250)) {
                    pc.__qGood = (pc.__qGood || 0) + 1;
                    if (pc.__qGood >= 3 && step > 0) { step--; pc.__qGood = 0; }
                } else {
                    pc.__qGood = 0;
                }
                if (step !== (pc.__qStep || 0)) {
                    console.warn('[vc-adapt] 손실률', lossPct.toFixed(1) + '%, RTT', Math.round(rtt) + 'ms → 단계', pc.__qStep || 0, '→', step);
                    pc.__qStep = step;
                    applyStep(pc, step);
                }
                /* 🕐 받는 쪽 지연 — «지금 좋다»고 측정된 연결에서만 낮춘다(위 함수 주석 참조).
                   기준은 화질 단계를 올릴 때와 같은 숫자를 쓴다: 손실 1.5% 미만 + RTT 250ms 미만.
                   한 번이라도 나빠지면 즉시 브라우저 자동으로 되돌아간다 = 끊김이 지연보다 우선. */
                try { tuneReceiveLatency(pc, step === 0 && lossPct < 1.5 && (rtt === 0 || rtt < 250)); } catch (_) {}
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
                    if (alp > 12 || art > 600) { A.sev++; A.good = 0; }     // 오디오 12%↑ 손실/RTT 600ms↑ = 망 붕괴
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
   사용자가 수동으로 카메라를 꺼둔 경우(vcCamOn===false)엔 관여하지 않는다. sev>=3(≈12초)에서 진입, good>=2(≈8초)에서 복구. */
var __vcAAOtoastT = null;

/* 📶 회선품질 로깅 — 적응루프에서 손실/RTT를 누적, 60초마다 요약 1건 전송(fire-and-forget, 통화 무관). 강사별 인터넷 품질 파악용.
   🟢 (2026-07-24 비용절감) 30초 → 60초. 이 값은 '강사 회선이 대체로 어떤가'를 보는 용도라 1분 요약으로 충분하다. D1 쓰기 2배 감소. */

/** RTCPeerConnection을 생성합니다 (다자간 통화용). */

/** Offer 수신 처리 (글레어 방지 포함) */

/** Answer 수신 처리 */

/** remoteDescription 준비 후 버퍼된 ICE 후보 일괄 투입 */

/** ICE Candidate 수신 처리 */

/** 원격 참가자의 비디오를 화면에 추가 */
// 🥭 (2026-07-05) 참가자가 방에 들어오면 '영상이 오기 전이라도' 이름표가 있는 박스를 미리 만든다.
//   → 학생이 카메라를 못 켜거나 P2P가 늦어도, 강사 화면에 학생이 보이고 칭찬 버튼/바구니가 즉시 뜬다.
//   실제 영상은 나중에 vcAddRemoteVideo(ontrack)가 이 박스의 <video>에 srcObject 만 채운다.
/* 🧑‍🏫 (2026-07-14 사장님 지시) 학생 입장 시 '교사 얼굴이 맨 위 + 크게'.
   원격(상대) 타일을 항상 내 박스(#vc-local-box) 앞에 삽입해 어떤 레이아웃에서도
   상대가 위에 오게 한다. (CSS order 규칙과 이중 안전장치) */

// 🌟 (2026-07-04) 실시간 칭찬 포인트 — 강사 화면에서만, 학생(원격) 비디오 박스마다 별 버튼을 붙임
// 🔧 (2026-07-05) 강사 판별 강화 — 로그인 role 뿐 아니라 URL 파라미터(vc_role), localStorage,
//   MangoV3, 그리고 자동입장처럼 로그인이 없을 때를 대비해 '이름 휴리스틱(교사/강사/선생님/teacher)'
//   까지 함께 본다. 하나라도 강사로 판단되면 강사 UI(별 버튼)를 보여준다.
/* 🎭 (2026-08-07) 강사·관리자 판정의 «정본» — 강사 전용 기능은 전부 이걸 쓴다.
   [왜 하나로 묶는가] 예전엔 곳곳이 제각각이었다. 칩 노출은 vcIsTeacherRole 을 OR 로 봤는데
   실제 동작(화면공유 실행·교재 페이지 넘김)은 window.vcMyRole 정확일치만 봤다.
   그래서 «버튼은 보이는데 누르면 선생님만 쓸 수 있다고 거절당하는» 어긋남이 났다. */
/* 🎭 (2026-08-13) 학생 판정의 «정본» — 배터리 절전 등 «학생일 때만» 거는 기능은 전부 이걸 쓴다.
   [왜 별도로 두는가] «강사가 아니면 학생»(!vcIsStaffNow) 판정은 역할이 아직 확정되지 않은
   강사(로그인은 됐지만 role 이 빈 값, vcMyRole 미설정 입장 경로)를 학생으로 오판해
   탭 전환마다 강사 카메라를 꺼 버렸다(필리핀 매니저 재신고 8/10).
   → «확실한 학생»만 true. 역할이 불확실하면 false — 학생 배터리를 조금 못 아끼는 것이
   강사 얼굴이 검게 되는 사고보다 싸다. 역할 추측은 이 정본 안에서만 한다. */

/* 🪞 (2026-08-12 강사 Shas 1번) AI 웜업 — 학생의 대화를 강사 화면에 비춰 준다.
   [무엇이 오해였나] Shas 선생님은 「텍스트 상자로 서로 대화하는 기능」으로 보고,
   보내도 상대에게 안 간다고 하셨다. 실제로 웜업의 대화 상대는 **AI** 다(학생이 영어로
   말하고 AI 가 받아 준다). 그래서 서로에게 안 가는 것이 설계다.
   [그래도 진짜 빈 곳] 강사가 «학생이 지금 뭘 하고 있는지» 확인할 길이 아예 없었다.
   → 학생 화면의 웜업 한 줄 한 줄을 강사에게 중계해 읽기 전용으로 비춘다.
     양방향 채팅을 새로 만들지 않는 이유: 수업 채팅이 이미 그 일을 한다. */
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
/* 학생이 눌렀을 때 «왜 안 되는지» 한 줄로 말해 준다 — 조용히 무시하면 고장으로 읽힌다.
   4초에 한 번만(연타·드래그로 도배되지 않게). */
/* 🙈 반 전체를 움직이는 버튼은 학생에게 아예 보이지 않게 한다.
   (동작 게이트와 «둘 다» 둔다 — 필기 잠금과 같은 이중 방어. 버튼을 지워도 콘솔·단축키로
    함수를 부를 수 있고, 반대로 게이트만 두면 «눌리는데 거절당하는» 버튼이 남는다.) */
/* 🎬 (2026-08-12 Melca 피드백) 동영상 툴바도 교재와 같은 이중 방어.
   "학생이 영상을 빨리감기·되감기 할 수 있다 — BODA 처럼 강사만 재생을 제어하게 해 달라."
   학생에게 숨기는 것: URL 입력·▶ YouTube·🔗 URL 재생·📁 파일 업로드·🗑 닫기(반 전체에 영향).
   남기는 것: 📚 바로 수업으로(자기 화면 탈출)·📌 미니(자기 화면 배치만 바꿈). */
// 🔍 (2026-07-05) 이 원격 박스가 '학생'인지 판별 — 다른 선생님/강사/관찰자는 칭찬 대상에서 제외.
//   역할(dataset.role / vcPeerRoles) + 이름 휴리스틱(교사/강사/선생님/teacher) 둘 다로 거른다.
// 🥭 (2026-07-05) 학생별 이번 수업 누적 지급 개수 (강사 화면 표시용) — targetUserId 별로 셈.
window._vcAwardCounts = window._vcAwardCounts || {};
// uid 한 명의 누적 개수를 얼굴 버튼 배지 + 로스터 칩 배지 양쪽에 반영.
// 🌟 강사 전용 "칭찬 주기" 바 — 영상 레이아웃과 무관하게 학생별 지급 버튼을 항상 노출.
// 🔁 (2026-07-05) 역할이 늦게 정해지거나 박스가 먼저 생겨도 항상 맞도록 —
//   강사면: 내 박스의 바구니 제거 + 모든 원격(학생) 박스에 별 버튼. 학생이면: 별 제거 + 내 박스에 바구니.
// 얼굴 박스가 좁으면(<170px) 별/바구니를 아이콘만 남기는 원형으로 축소해 다른 배지와 안 겹치게.
// + 칭찬 UI(좌상단)가 있는 박스는 분리버튼(원래 좌상단)을 숨겨 좌상단 충돌을 없앤다.
// 안전장치: 수업 중일 때 2초마다 칭찬 UI를 상태에 맞게 재정렬(늦은 role/박스 생성 대비)
setInterval(function(){
    try { if (document.body && document.body.classList.contains('vc-in-call')) vcRefreshPraiseUI(); } catch(e){}
}, 2000);
// 강사가 별 버튼 클릭 → 대상 학생에게만 실시간 신호 전송(브로드캐스트 + targetUserId 필터링).
//   실제 포인트 적립은 "받는 쪽(학생 본인 브라우저)"이 자기 uid로 직접 호출 — 강사 쪽에서
//   학생 계정 uid 를 알 필요가 없어 통화 시그널링 구조를 안 건드리고 안전하게 구현.
// 🌟 (2026-07-05) 학생 입장 시 — (방·피어ID → 내 계정 uid) 서버 등록.
//   선생님이 별을 누르면 서버가 이 매핑으로 대상 학생의 진짜 계정을 찾아 적립하므로,
//   학생 브라우저가 신호를 놓치거나 순간적으로 로그인 정보를 못 읽어도 "전체 포인트"에 확실히 쌓인다.
// 🪪 이 브라우저 탭의 안정 식별자 (재연결/새로고침/모바일 끊김에도 동일).
//   로그인 계정 uid 우선(가장 안정) → 없으면 탭 단위 sessionStorage 랜덤(같은 탭이면 유지).
//   서버 dedup 의 키. 진짜 다른 참가자/다른 기기/다른 탭은 서로 다른 값이라 절대 안 닫힌다.

// 🧺 (2026-07-04) 학생 화면 전용 — 이번 수업에서 받은 포인트 바구니 (본인 로컬 비디오 박스에 표시)
window._vcSessionPoints = window._vcSessionPoints || 0;
// 📱 fix (2026-07-13) — 세로 모바일에선 참가자 2명 이상이면 내 영상 박스가 숨겨져(display:none !important)
//   그 안의 바구니·+1·광채 연출이 학생에게 전혀 안 보였음("포인트가 늘어나는 게 안 보여").
//   숫자 표시는 뒤쪽의 '떠 있는 미러 바구니'(#vc-basket-float, 0.7초 틱)가 담당하고,
//   여기서는 ①연출을 화면 전체 오버레이로 옮겨 어느 모드에서든 보이게 ②숫자 동기화만 한다.
// 연출 기준점 — 내 박스 안 바구니가 보이면 그것, 숨겨졌으면 떠 있는 미러 바구니
// 모든 바구니(박스 안 + 떠 있는 미러) 숫자 동기화
// 🔓 앱 전역 공유 AudioContext 확보 + 첫 사용자 상호작용 때 미리 unlock.
//   (fix 2026-07-05) 예전엔 vcPlayPointChime 이 매번 new AudioContext() 를 만들어,
//   브라우저 자동재생 정책상 두 번째 호출부터 suspended 로 생성돼 소리가 안 났다
//   ("처음 한 번만 남"). 공유 컨텍스트 1개를 재사용하고, 아래 unlock 리스너로
//   미리 running 상태로 만들어 두면 원격 신호로 트리거돼도 매번 재생된다.
(function _vcInstallAudioUnlock(){
    if (window._vcAudioUnlockBound) return; window._vcAudioUnlockBound = true;
    function unlock(){ try { vcGetSharedAC(); } catch(_){} }
    ['pointerdown','touchstart','keydown','click'].forEach(function(ev){
        try { document.addEventListener(ev, unlock, { passive: true, capture: true }); } catch(_){}
    });
})();
// 🔔 "딩동댕" — 밝고 경쾌한 3음 상승 차임 + 반짝이는 배음(학생 동기부여용, 크게).
// ✨ 바구니 기준으로 큰 광채 연출 — 폭발 링 + 박스 번쩍 + 별가루 방사 + 바구니 빛남 + 큰 +1
// 학생 본인 화면에서: 신호 수신 → 자기 계정 uid로 포인트 적립 API 직접 호출 + 축하 연출

/** 비디오 박스에 '분리/복귀' 버튼 + 드래그 기능 부여 */

/** 비디오 박스를 독립 팝아웃 창으로 분리 / 그리드로 복귀 */

/** 분리된 비디오 박스 드래그로 이동 */

/* ============================================================
 * 🚨 본인 비디오 박스 — 카메라 오류 안내 placeholder
 *   getUserMedia 실패 또는 비디오 트랙 0개일 때 검은 화면 대신
 *   명확한 오류 안내 + [🔄 카메라 다시 시도] 버튼 표시
 * ============================================================ */

/** 비디오 박스에 소리·화면 상태 아이콘 + 음량 미터 부착 */
/* 🩹 fix (2026-07-12) — 모바일 얼굴 잘림 방지 스마트핏.
   휴대폰 세로 카메라(세로 영상)가 가로 타일에 object-fit:cover 로 들어가면
   위아래가 크게 잘려 얼굴 대신 벽/천장만 보임 (가상배경 캔버스도 카메라 비율이라 동일).
   → 영상과 타일의 방향이 다르거나 비율차가 크면 contain 으로 전환해 얼굴 전체 표시.
   (letterbox 여백은 가상배경 CSS 프레임/타일 배경이 채워줌) */
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

/* 🎧 (2026-08-07 강사 건의 1) "보다처럼 학생 PC·태블릿 설정을 우리가 바꿀 수 있으면 좋겠다"
   기기 설정창을 통째로 원격 조작하는 것은 무겁고 위험하다(권한·사생활). 대신 실제로 막히는
   지점 하나만 원격으로 푼다 — «마이크를 다시 잡기». 현장 문제의 대부분이 이것이다:
   학생이 다른 앱이 마이크를 물고 있거나, 권한 팝업을 놓쳤거나, 장치를 갈아 끼운 경우.
   강사→학생 요청 1건, 학생→강사 결과 1건. 폴링 없음. */

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

/* ── 강사 쪽: 학생 타일의 🎛 버튼 + 장치 패널 ── */
/* JS 로 그리는 글자는 data-ko/data-en 도 «같이» 갱신해야 i18n-sweep 이 살아 있다 (CLAUDE.md 함정 표) */
/* 참가자 타일 우측(💬 아래)에 🎛 버튼 — 보는 사람은 강사·관리자만.
   🎛 (2026-08-12 강사 요청) 예전엔 «학생 박스에만» 붙였는데(vcBoxIsStudent),
   재택 강사의 카메라·헤드셋이 고장났을 때 관리자·다른 강사가 도와줄 길이 없었다.
   → 강사 타일에도 붙인다. 서버는 어차피 «보내는 쪽이 강사·관리자» 일 때만 릴레이하고,
     받는 쪽은 targetUserId 가 자기일 때만 응답하므로 학생이 악용할 길은 그대로 막혀 있다.
   ⚠️ 내 타일(vc-local-box)에는 안 붙인다 — 자기 장치는 아래 독의 장치 메뉴로 바꾼다. */

/** 참가자 퇴장 시 비디오 및 연결 제거 */
/* 🇵🇭 (2026-07-24) 순단(dropped) 유령 타일 정리 시간 — 이 시간 안에 재접속하지 않으면 타일을 치운다.
   서버는 재접속마다 '새 userId' 를 발급하므로, 옛 타일을 그냥 두면 영원히 남는다.
   반대로 즉시 지우면 상대가 '갑자기 화면에서 사라진' 것처럼 보인다(사장님이 신고한 그 증상).
   → 잠깐 '재연결 중'으로 남겨 두되, 반드시 시간제한을 건다. */
const VC_GHOST_TILE_MS = 20000;
/** 순단된 참가자 타일을 지우지 않고 '재연결 중' 상태로 표시 */
/** 재접속한 참가자가 새 타일로 들어오면, 남아 있던 '재연결 중' 유령 타일을 즉시 정리 */


/**
 * 비디오 그리드의 참가자 수(data-count)를 현재 DOM의 video-box 개수로 갱신.
 * CSS `#vc-video-grid[data-count="N"]` 선택자가 세로/가로 모드 레이아웃을 결정.
 */

// 🥭 (2026-07-13) PIP에는 '상대방 1명'만 — 사장님 요청.
//   PIP 작은 창(세로폰 video-pip 모드의 우상단 창, 데스크톱 오버레이 PIP)에 참가자
//   비디오가 전부 쌓여 나오던 것을, 대표 1명(내가 학생이면 선생님, 그 외엔 첫 원격
//   참가자)만 남기고 숨긴다. 숨김 자체는 CSS(<style id="vc-pip-single-counterpart">)와
//   vcSyncPipVideos()가 이 클래스를 보고 처리하므로, 여기서는 마킹만 담당.
//   역할(data-role)이 늦게 도착해도 아래 폴링이 1.2초 주기로 다시 골라 자가교정한다.
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

/** 마이크 / 카메라 토글 — 진단·복구 강화 */

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

/** 드롭다운에 현재 마이크 목록 채우기 */

/** 선택한 마이크로 전환 — 모든 통화 연결에 즉시 반영 */

/* ══════════════════════════════════════════════════════════════════
   ⚙️ (2026-08-06) 설정 팝업(vc-dock.js)이 부르던 함수들 — 여태 '아예 없었다'.
   vc-dock 의 call() 은 `typeof window[name]==='function'` 일 때만 부르고 아니면 조용히 넘어간다.
   그래서 카메라를 바꿔도, 마이크를 바꿔도, 잡음 제거를 눌러도 **화면만 바뀌고 아무 일도 안 일어났다**.
   (같은 사고가 화질 버튼에서 한 번 있었고 그때 vcSetQuality 만 만들어 막았다 — 12905줄 주석 참고)
   여기서 나머지를 전부 실제 동작에 연결한다.
   ══════════════════════════════════════════════════════════════════ */
const VC_CAM_PREF_KEY = 'mangoi_vc_cam_id';

/** 🎙 설정 팝업의 마이크 드롭다운 — 이미 완성돼 있던 vcSwitchMic 에 연결만 하면 된다. */

/** 📷 선택한 카메라로 전환 — 모든 통화 연결에 즉시 반영(재협상 없음).
 *  vcHealLocalVideo 의 교체 절차를 그대로 따른다(검증된 경로). */

/* 🔊 (2026-08-10 장치 도우미) 스피커(출력 장치) 전환 — 지금 재생 중인 모든 원격 소리에 적용.
   setSinkId 는 크롬·엣지·파이어폭스(116+)만 지원, iOS 사파리는 아예 없다 → 미지원이면 false.
   새로 생기는 원격 타일·보조 오디오는 만들 때 vcApplySavedSink 로 같은 스피커를 물려받는다. */
const VC_SPK_PREF_KEY = 'mangoi_vc_spk_id';
/* 새로 만들어지는 <video>·<audio> 가 저장된 스피커 선택을 물려받게 한다(원격 타일 생성부에서 호출). */

/** 🔇 잡음 제거 on/off — 살아있는 트랙에 먼저 적용하고, 안 먹는 브라우저는 재획득으로 확실히 반영 */

/** 🌫 배경 흐림 — 가상배경 엔진에 이미 'blur' 모드가 있다. 스위치를 거기에 연결만 한다. */
try {
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
        navigator.mediaDevices.addEventListener('devicechange', function(){ try { vcPopulateMicSelect(); } catch(e){} });
    }
} catch(e){}

/** 🛠 마이크 진단·재설정 도구 — 사용자가 직접 트러블슈팅 가능 */
/** 📷 (2026-07-24) 내 카메라 상태를 상대에게 알린다.
 *  수신측은 이 신호가 있어야 '상대가 껐다'(정상)와 '회선이 나빠 영상만 죽었다'(장애)를
 *  구분할 수 있다. 신호가 없으면 자가복구 워치독이 정상 상태를 장애로 오인해 재협상을 반복한다.
 *  reason: 'user'=사용자가 버튼으로 끔 / 'aao'=회선이 약해 시스템이 음성전용으로 내림 */


/** 탭 전환 (event 인자가 없어도 안전하게 동작) */

// 🥭 (2026-07-05) 상단 탭바 전체 공통 토글 상태 — "콘텐츠(칠판/동영상/학생게임/배경/웜업/퀴즈) 영역"을
//   누르면 펼쳐지고, 이미 펼쳐진 같은 탭을 다시 누르면 접히게(카메라 화면 위주로 복귀).
//   교재도구/필기도구 칩(mango-tools-dock.js)도 이 상태를 같이 사용.
//   🔧 (2026-07-05) 칠판 전용 도구줄(펜/지우개/색상 등)은 제거 — 필기도구 칩과 중복이라
//     화면만 좁아짐. 칠판도 다른 탭과 동일하게 "펼침/접힘"만 한다.
// 🔧 (2026-07-16) 복습퀴즈 '← 수업으로' 전용 복귀 — 얼굴 영역을 되살리고,
//   복습퀴즈 직전에 보던 콘텐츠(교재/칠판 등)가 있으면 그걸 함께 복원(얼굴+교재 분할),
//   없으면 얼굴 위주(콘텐츠 접기). 어느 경우든 '하얀 화면'이 되지 않게 보장한다.
// 칠판/동영상/학생게임/배경화면/AI웜업/복습퀴즈 — 다른 탭이면 전환+펼치기, 이미 보이는 같은 탭이면 접기.
//   🔧 (2026-07-15) 칠판(whiteboard)은 예외 — 다시 눌러도 접지 않음.
//     사장님 요청: 칠판을 클릭하면 (전체 얼굴 화면으로 접히지 말고) 항상 '얼굴 + 칠판' 화면이 나오게.

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

/** 🎚️ 영상효과 품질 버튼 렌더 (배경 탭 상단). 자동 + 4단계. */

// 처리 캔버스 목표 가로폭 — 카메라가 720p여도 여기로 축소해서 CPU·인코딩 부하↓
//   세그멘테이션 모델 입력은 256px라 캔버스를 키워도 화질 이득이 거의 없고 부하만 늘어남
//   (2026-08-01) 고정값 → vcPerf 등급값. 휴대폰은 480 을 상한으로 둔다.
// 가상배경 출력(캔버스) 트랙에 적용할 캡처 fps — 실제 처리 fps와 맞춰 중복 프레임 인코딩 방지
/** 등급이 바뀌면 캔버스 크기를 즉시 다시 맞춘다(다음 프레임부터 적용) */

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


// 합성에서 동기적으로 가져갈 수 있도록 미리 로드된 캐시만 리턴

// --- 2) MediaPipe 스크립트 lazy 로드 ---
// ph163 (2026-07-23) — jsdelivr → 자체 서빙(/vendor/mediapipe/).
//   pdf.js(ph254) 와 같은 '자체 서버 우선, 실패 시에만 CDN 폴백' 방식을 그대로 따른다.
//   · 필리핀 저속 회선에서 도메인 하나(DNS+TLS)를 통째로 줄인다.
//   · 배경효과는 wasm 5.7MB + tflite 를 더 받는다. 그 경로가 전부 같은 오리진이 된다.
//   ⚠️ vcBg.mpBase 는 아래 vcInitBgEngine 의 locateFile 이 그대로 쓴다.
//      스크립트를 어디서 받았든 '같은 곳'에서 wasm 을 받아야 버전이 어긋나지 않는다.
const VC_MP_LOCAL = '/vendor/mediapipe/';
const VC_MP_CDN   = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1632777926/';

// --- 3) Segmenter 초기화 ---

// --- 4) Segmentation 결과 합성 콜백 ---
//     Phase 7m: 번짐 제거를 위한 정밀 마스크 후처리
//     ① 오프스크린 마스크 캔버스에서 강한 contrast(2.4) 로 회색 전이 구간 제거 → binary 마스크
//     ② erosion 효과: 마스크를 destination-in 으로 1~2px 축소하여 머리/어깨 주위 halo 제거
//     ③ 가벼운 blur(0.6px) 로 마지막 anti-aliasing → 자연스러운 경계
//     ④ 사람 영상에 미세한 saturate/brightness 보정으로 배경과 톤 매칭

// --- 5) 처리 루프 (숨겨진 카메라 비디오 → segmenter) ---
//     ⚠ segmenter 입력은 반드시 별도 hiddenVideo (원본 카메라) - 자기참조 루프 방지
//     ⚠ busy 플래그 + currentTime 체크 - WASM "memory access out of bounds" 방지

// --- 5-b) 숨겨진 카메라 비디오 준비 (원본 스트림 → segmenter 입력) ---
//     ⚠ 너무 작은 사이즈(1x1)면 브라우저가 렌더링 최적화로 빈 프레임 → WASM 에러
//     실 사이즈 (320x240) 로 두고 left:-9999px 로 화면 밖에 배치

// --- 6) 캔버스 → MediaStreamTrack → 모든 peer 의 sender 에 replaceTrack ---

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

// 강사: 잠금 토글 → 서버로 방송 (연결 순단 중엔 재연결 큐가 재전송)

// 학생: 잠금 적용/해제 — 배경·얼굴꾸미기 타일 비활성화 + 안내 문구.
//   얼굴꾸미기 타일은 탭 첫 진입 때 늦게 생성되므로, 배경 탭 진입 시(vcSwitchTab)
//   재적용 + vcSetFace 함수 래퍼 가드로 이중 방어한다.

// ── 🎤/🎯 수업 통제 칩 2종: 전체 음소거(mic-lock)·집중 모드(focus-lock) (2026-07-21) ──
//   bg-lock 과 동일 구조 — 서버(DO)가 role 검증·storage 저장·늦은 입장 재전송·빈 방 자동 해제.
//   칩은 상단 탭바(.tab-bar)에 상주, 강사/관리자에게만 노출.
window.__vcMicLockOn = false;      window.__vcMicLockedByTeacher = false;
window.__vcFocusLockOn = false;    window.__vcFocusLockedByTeacher = false;


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


/* ✋ (2026-07-28 강사 피드백 Kaye 9번) "학생이 교재·칠판에 낙서한다 — 교사가 막을 수 있게(Boda 처럼)"
   전체 음소거(vcMicLockToggle) 와 똑같은 방식: 상태를 켜고 학생들에게 방송한다.
   학생 쪽은 pointerdown 게이트와 'pdf-drawlock' 수신으로 막힌다(양쪽 이중 방어). */
/* 버튼 모양 갱신 — 잠금이면 빨강, 아니면 초록 */


// 학생: 전체 음소거 적용/해제 — 현재 마이크 상태 기억 후 강제 off, 해제 시 원복.
//   window.vcMicOn=false 로 두므로 자가치유(vcHealLocalMic)·복귀 재점검(vcResumeClassSession)·
//   하단 독(1.5초 주기 sync)이 자연히 잠금을 존중/반영한다.

// 학생: 집중 모드 적용/해제 — 실제 차단은 vcToggleContentTab/vcMobileTabSwitch 가드가 수행
/* 🎯 (2026-08-12 강사 Shas 4번) 「Focus Mode 를 눌렀는데 아무런 변화가 없다」
   기능은 멀쩡히 돌고 있었다 — 학생의 탭 전환(vcToggleContentTab·vcMobileTabSwitch)과
   채팅 자동열기를 막는다. 문제는 **그 사실이 화면 어디에도 남지 않는 것**이었다.
   토스트는 몇 초 뒤 사라지고, 켠 «뒤에» 들어온 학생은 그마저도 못 본다.
   그래서 강사에게는 눌러도 아무 일이 없는 버튼으로 보였다.
   → 켜져 있는 «동안» 계속 떠 있는 띠를 둔다. 강사와 학생에게 각각 다른 말로.
   ⚠️ pointer-events:none — 수업 화면 위에 뜨므로 클릭을 절대 가로채면 안 된다.
      (예전에 «보이는데 눌리지 않는 유령 창» 사고가 있었다) */

// --- 7) 메인 진입점 ---

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

/* ⤡ 자유 크기 모드 — 영상 패널을 떠다니는 창으로 만들어 가로·세로 모두 드래그로 조절.
   - 제목줄(.video-size-bar) 드래그 = 이동
   - 우하단 그립(#vc-vp-grip) 드래그 = 크기 조절
   - 마우스/터치 공용(pointer 이벤트), 위치·크기 localStorage 저장 */




// 현재 보이는 크기/위치 그대로 '자유(떠있는 창)' 모드로 전환 (점프 방지)

let _vcFreeBound = false;
// 그립은 정적 DOM이므로 즉시 바인딩(통화 진입 전이라도 안전)
try { vcAttachFreeHandlers(); } catch(_){}


// fix (2026-06-02) — 휴대폰 가로(landscape)로 들어오면 기본 영상 크기를 '3/4'로.
//   세로/PC 또는 사용자가 전체·솔로를 고른 경우는 건드리지 않음.
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

/* 헤더 드래그 + 위치/크기 저장 */

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
    const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png'];
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
    const scale = baseScale * pdfZoom;

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


/** 🔔 (2026-07-24 사장님 지시) 상대가 채팅을 보내면 채팅창을 자동으로 연다 — A안.
 *  수업 흐름을 깨면 안 되는 상황에서는 '열지 않고' 하단 독 채팅 버튼에 빨간 배지+깜빡임만 띄운다.
 *  ⚠️ 여기서 입력칸에 focus() 를 하면 모바일 소프트키보드가 올라와 수업 화면을 한 번 더 덮는다. 절대 금지. */



// 🆕 Phase K1: 방 입장 시 이전 채팅 200개 로드


/* 🧹 (2026-07-24) 채팅 리셋 — 채팅 패널 입력창 아래 '채팅 지우기' 버튼에서 호출.
   화면에 보이는 대화를 그 자리에서 전부 지운다. 상담 내용이 다음 수업까지 남지 않게 하는 것이 목적.
   서버(D1)의 기록 자체는 지우지 않는다 — 실제 학생 데이터라 감사·분쟁 대비로 남겨야 하고,
   어차피 이력 자동 로드를 껐기 때문에 재입장해도 화면에는 다시 나타나지 않는다. */

/* ════════════════════════════════════════════════════════════════
   🔒 개별(1:1) 채팅 — 대상 지정 시스템 (2026-07-14)
   · 채팅 패널 상단 칩([👥 전체] + 참가자별)으로 대상 선택
   · 각 참가자 비디오 박스 우상단 💬 버튼 → 그 사람과 바로 개별 채팅
   · 대상이 방을 나가면 자동으로 전체 채팅으로 복귀
   ════════════════════════════════════════════════════════════════ */




/* 비디오 박스 우상단 💬 버튼 — 누르면 그 사람과 개별 채팅 */

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

