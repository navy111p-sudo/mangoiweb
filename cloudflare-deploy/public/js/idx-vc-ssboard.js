/* ══════════════════════════════════════════════════════════════
   🖥 idx-vc-ssboard.js — 강사 화면 공유를 받는 쪽 «메인 보드»에 크게  (PR #93 이식)
   ──────────────────────────────────────────────────────────────
   [지적] Melca 8/12 p19 — 「강사가 화면 공유를 하면 학생에게는 강사 얼굴 «작은 타일»에만 나온다」
   [방식] screen-share-state(on) 을 받으면 콘텐츠 영역(교재/칠판이 쓰는 #vc-content-pane)에
          동적 패널(#tab-screenshare)을 만들어 강사 타일의 스트림을 크게 띄운다.
          강사 타일은 그대로 남아 «작은 미리보기» 역할(일반 화상회의 UX).
   [왜 별도 defer 파일인가] 원래 PR(2026-08-13)은 idx-main.js 에 150줄을 넣었는데, 그 뒤
          first_paint_budget(첫 화면 blocking 예산)이 거의 꽉 찼다(CLAUDE.md 2장).
          그래서 본문은 여기 두고 idx-main.js 에는 «부르는 줄» 만 남겼다
          (screen-share-state 수신 · tab-sync 수신 · user-left · room-joined · vcCleanupAllPeers).
          이 파일이 아직 안 왔으면 그 줄들은 typeof 검사로 조용히 넘어간다(= 옛 동작: 타일만).
   [주의] ① 보드 <video> 는 반드시 muted — 소리는 강사 타일이 이미 내고 있다(중복 방지)
          ② 스트림은 replaceTrack 이라 타일과 «같은 MediaStream» — srcObject 를 공유하면 끝.
             늦입장·재연결·SFU 전환이면 타일 스트림이 늦게/새로 오므로 켜져 있는 동안 1초마다 동기화.
             ⛔ 상주 타이머 금지 — 공유가 끝나거나 수업(vc-in-call)을 벗어나면 스스로 끈다.
          ③ vcSwitchTab 호출은 _vcTabSyncApplying 로 감싼다 — 공동수업 관리자가 수신했을 때
             자기 role 때문에 tab-sync 를 재방송해 학생 화면을 흔드는 루프 방지
          ④ 타일의 «화면 공유 중» 배지(.vc-ss-badge)·잘림 방지(idx-vc-mobilefix ⑧)는 그대로 둔다.
   [되돌리기] index.html 의 이 파일 <script> 한 줄만 지우면 된다.
   ══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';
    window.__vcSSView = null;   // { uid, prevTab, prevCollapsed, prevMode, timer } — 공유 중일 때만 존재

    function switchTabQuiet(name) {
        var was = window._vcTabSyncApplying; window._vcTabSyncApplying = true;
        try { window.vcSwitchTab(name); } finally { window._vcTabSyncApplying = was; }
    }

    /* 보드 <video> 를 강사 타일의 현재 스트림과 맞춘다(없으면 다음 틱에 다시) */
    window.vcScreenShareViewSync = function () {
        try {
            var st = window.__vcSSView; if (!st) return;
            if (!document.body.classList.contains('vc-in-call')) { window.vcScreenShareViewOff(); return; }
            var bv = document.getElementById('vc-ss-board'); if (!bv) return;
            var tile = document.getElementById('vc-video-' + st.uid);
            var tv = tile && tile.querySelector('video');
            if (tv && tv.srcObject && bv.srcObject !== tv.srcObject) {
                bv.srcObject = tv.srcObject;
                var p = bv.play(); if (p && p.catch) p.catch(function () {});
            } else if (bv.srcObject && bv.paused) {
                var p2 = bv.play(); if (p2 && p2.catch) p2.catch(function () {});
            }
        } catch (_) {}
    };

    window.vcScreenShareViewOn = function (uid) {
        try {
            if (!uid) return;
            if (window.__vcScreenSharing) return;   // 내가 공유자 — 내 미리보기(vc-local-video)가 정본
            var en = (typeof getLang === 'function' && getLang() === 'en');
            /* 늦입장 재알림(resync)이 와도 멱등 — 상태를 덮어쓰지 않는다 */
            if (window.__vcSSView && window.__vcSSView.uid === uid) { window.vcScreenShareViewSync(); return; }
            if (!window.__vcSSView) {
                var cur = document.querySelector('.tab-panel.active');
                var curId = cur && cur.id ? cur.id.replace('tab-', '') : '';
                window.__vcSSView = {
                    uid: uid,
                    prevTab: (curId && curId !== 'screenshare') ? curId : '',
                    prevCollapsed: (typeof window.vcIsContentCollapsed === 'function') ? window.vcIsContentCollapsed() : false,
                    prevMode: '',
                    timer: null
                };
            } else {
                window.__vcSSView.uid = uid;        // 공유자가 바뀐 경우(드묾) — 복귀 상태는 유지
            }
            var pane = document.getElementById('vc-content-pane');
            if (!pane) return;
            var panel = document.getElementById('tab-screenshare');
            if (!panel) {
                panel = document.createElement('div');
                panel.className = 'tab-panel';
                panel.id = 'tab-screenshare';
                panel.style.cssText = 'background:#000;position:relative;padding:0';
                var v = document.createElement('video');
                v.id = 'vc-ss-board';
                v.autoplay = true; v.muted = true;
                v.setAttribute('playsinline', '');
                v.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000;display:block';
                panel.appendChild(v);
                var lb = document.createElement('span');
                lb.id = 'vc-ss-board-label';
                lb.setAttribute('data-ko', '🖥 선생님 화면');
                lb.setAttribute('data-en', "🖥 Teacher's screen");
                lb.style.cssText = 'position:absolute;top:8px;left:8px;z-index:5;padding:3px 10px;border-radius:999px;background:rgba(14,165,233,.92);color:#fff;font-size:12px;font-weight:800;pointer-events:none';
                panel.appendChild(lb);
                pane.appendChild(panel);
            }
            try { var lb2 = document.getElementById('vc-ss-board-label'); if (lb2) lb2.textContent = en ? "🖥 Teacher's screen" : '🖥 선생님 화면'; } catch (_) {}
            try { if (typeof window.vcSetContentCollapsed === 'function') window.vcSetContentCollapsed(false); } catch (_) {}
            /* 참가자 전체 보기(video-full)는 콘텐츠 칸을 숨긴다 — 그대로면 보드가 안 보인다.
               기본 분할(half)로 내리고 공유가 끝나면 되돌린다. */
            try {
                var row = document.getElementById('vc-main-row');
                if (row && row.classList.contains('video-full')) {
                    window.__vcSSView.prevMode = 'full';
                    if (typeof window.vcScreenSet === 'function') window.vcScreenSet('half');
                }
            } catch (_) {}
            switchTabQuiet('screenshare');
            /* 세로폰 — 공유 시작은 최우선(학생이 얼굴 크게를 골랐어도 반반으로). 가로/PC 는 내부에서 무시 */
            try { window.__vcPheroReeval && window.__vcPheroReeval(); } catch (_) {}
            window.vcScreenShareViewSync();
            if (!window.__vcSSView.timer) window.__vcSSView.timer = setInterval(window.vcScreenShareViewSync, 1000);
            console.log('[screen-share] 메인 보드 표시:', uid);
        } catch (e) { console.warn('[screen-share] 메인 보드 표시 실패:', e); }
    };

    window.vcScreenShareViewOff = function () {
        try {
            var st = window.__vcSSView;
            if (!st) return;
            window.__vcSSView = null;
            try { if (st.timer) clearInterval(st.timer); } catch (_) {}
            var panel = document.getElementById('tab-screenshare');
            var bv = document.getElementById('vc-ss-board');
            try { if (bv) bv.srcObject = null; } catch (_) {}
            /* 학생이 그 사이 다른 탭으로 옮겨 갔으면(보드가 안 보이는 상태) 화면은 건드리지 않는다 */
            var showing = panel && panel.classList.contains('active');
            if (showing) {
                if (st.prevTab && document.getElementById('tab-' + st.prevTab)) {
                    switchTabQuiet(st.prevTab);
                    if (typeof window.vcSetContentCollapsed === 'function') window.vcSetContentCollapsed(!!st.prevCollapsed);
                } else {
                    /* 이전 콘텐츠를 모르면 얼굴 위주로(수업 기본 화면) — 하얀 화면 방지 */
                    if (typeof window.vcSetContentCollapsed === 'function') window.vcSetContentCollapsed(true);
                    try { document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); }); } catch (_) {}
                }
                /* 공유 때문에 반반으로 내렸던 «참가자 전체 보기» 를 되돌린다 */
                if (st.prevMode === 'full' && typeof window.vcScreenSet === 'function') { try { window.vcScreenSet('full'); } catch (_) {} }
            }
            if (panel) panel.classList.remove('active');
            console.log('[screen-share] 메인 보드 종료 — 이전 화면 복원:', st.prevTab || '(얼굴 위주)');
        } catch (e) { console.warn('[screen-share] 메인 보드 복원 실패:', e); }
    };
})();
