// Deferred classroom-only annotation receiving/replay. Uses the existing main-script PDF state.


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
function pdfReceivePointerReady(d) {
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
function vcPdfAnnotationGate(msg) {
    if (!/^pdf-anno-(start|point|text|shape|clear|undo|replay)$/.test(msg.type)) return false;
    if (window.__vcPdfShareEpoch && msg.data?.shareEpoch !== window.__vcPdfShareEpoch) return true;
    var ctx = window.__vcPdfAnnoContext;
    if (ctx && !ctx.current()) return true;
    if (typeof msg.data?.annotationSession === 'number' && msg.data.annotationSession !== window.__vcPdfAnnotationSession) return true;
    var url = msg.data && msg.data.documentUrl;
    var expected = ctx ? ctx.url : window._vcCurrentPdfUrl;
    if (url && expected) {
        try { if (new URL(url, location.origin).href !== new URL(expected, location.origin).href) return true; }
        catch (_) { return true; }
    }
    if (ctx && ctx.pending) {
        if (!ctx.failed && Date.now() - ctx.createdAt > 30000) { ctx.failed = true; ctx.queue = []; ctx.bytes = 0; try { showToast('필기 복원이 지연되어 자동 적용을 보류했습니다.'); } catch (_) {} }
        if (ctx.failed) return true;
        var bytes;
        try { bytes = new TextEncoder().encode(JSON.stringify(msg)).byteLength; } catch (_) { return true; }
        if (ctx.queue.length >= 2000 || ctx.bytes + bytes > 4 * 1024 * 1024) {
            ctx.queue = []; ctx.bytes = 0; ctx.failed = true;
            try { showToast('필기가 많아 자동 복원을 보류했습니다.'); } catch (_) {}
            return true;
        }
        ctx.queue.push(msg); ctx.bytes += bytes;
        return true;
    }
    // A failed replacement can leave the previous document visible. The requested
    // URL is not proof that the document was committed by the loader.
    if (ctx) {
        try {
            if (!window._vcCurrentPdfUrl || new URL(window._vcCurrentPdfUrl, location.origin).href !== new URL(ctx.url, location.origin).href) return true;
        } catch (_) { return true; }
    }
    return typeof pdfDoc !== 'undefined' && !pdfDoc;
}

function vcFlushPdfAnnotations() {
    var ctx = window.__vcPdfAnnoContext;
    if (!ctx || !ctx.current()) return;
    if (ctx.pending && Date.now() - ctx.createdAt > 30000) { ctx.failed = true; try { showToast('필기 복원이 지연되어 자동 적용을 보류했습니다.'); } catch (_) {} }
    ctx.pending = false;
    if (ctx.failed) { ctx.queue = []; ctx.bytes = 0; return; }
    var queue = ctx.queue; ctx.queue = []; ctx.bytes = 0;
    queue.forEach(function(msg) { vcHandleMessage(msg); });
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

function vcReplayPdfAnnotations(data) {
    var msg = { data: data };

            try {
                // Unversioned legacy logs have no ACK/revision barrier. Never replay clear/undo
                // over an already populated local document and risk deleting newer work.
                if (typeof msg.data?.annotationSession !== 'number' && Object.keys(pdfAnnotations).some(function(page){ return (pdfAnnotations[page] || []).length > 0; })) {
                    try { showToast('기존 필기를 보호하기 위해 자동 덮어쓰기를 보류했습니다.'); } catch (_) {}
                    return;
                }
                if (typeof msg.data?.annotationSession === 'number') { pdfAnnotations = {}; _pdfRemoteStrokes = {}; }
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
            return;

}

window.__vcPdfAnnotationModuleReady = true;
window.__vcPdfAnnotationModuleLoading = false;
var earlyPdfAnnotations = window.__vcEarlyPdfAnnotations || [];
window.__vcEarlyPdfAnnotations = []; window.__vcEarlyPdfAnnotationBytes = 0;
var earlyPdfExpired = earlyPdfAnnotations.some(function(entry){ return Date.now() - entry.at > 30000; });
if (earlyPdfExpired) { try { showToast('필기 복원이 지연되어 자동 적용을 보류했습니다.'); } catch (_) {} }
if (!window.__vcEarlyPdfAnnotationOverflow && !earlyPdfExpired) earlyPdfAnnotations.forEach(function(entry) {
    var currentUrl = window.__vcPdfAnnoContext?.url || window._vcCurrentPdfUrl;
    try { if (entry.url && currentUrl && new URL(entry.url, location.origin).href !== new URL(currentUrl, location.origin).href) return; } catch (_) { return; }
    if (entry.room === vcRoomId && entry.self === vcUserId && entry.conn === vcConn && entry.account === vcAccountSnapshot()) vcHandleMessage(entry.msg);
});
if (!window.__vcSharedPdfPendingKey) vcFlushPdfAnnotations();

var earlyPdfPointer = window.__vcEarlyPdfPointer; window.__vcEarlyPdfPointer = null;
if (earlyPdfPointer && earlyPdfPointer.room === vcRoomId && earlyPdfPointer.self === vcUserId && earlyPdfPointer.conn === vcConn && earlyPdfPointer.account === vcAccountSnapshot() && earlyPdfPointer.url === window._vcCurrentPdfUrl
    && (earlyPdfPointer.data.sticky || Date.now() - earlyPdfPointer.at < 1600)) pdfReceivePointerReady(earlyPdfPointer.data);
