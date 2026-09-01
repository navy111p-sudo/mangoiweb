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
function vcqRxTick() {
    var Q = window.__vcQ; if (!Q) return;
    var pcs = window.vcPeerConnections || {};
    var ids = Object.keys(pcs);
    Q.p.push(ids.length);
    var prevAll = window.__vcRxPrev || (window.__vcRxPrev = {});
    ids.forEach(function (id) {
        var pc = pcs[id];
        if (!pc || !pc.getReceivers) return;
        pc.getReceivers().forEach(function (r) {
            if (!r || !r.track || !r.getStats) return;
            var kind = r.track.kind;
            if (kind !== 'video' && kind !== 'audio') return;
            r.getStats().then(function (st) {
                st.forEach(function (s) {
                    if (s.type !== 'inbound-rtp') return;
                    var key = id + ':' + kind;
                    var prev = prevAll[key];
                    var lost = s.packetsLost || 0, rec = s.packetsReceived || 0;
                    var dl = Math.max(0, lost - ((prev && prev.lost) || 0));
                    var dr = Math.max(0, rec - ((prev && prev.rec) || 0));
                    if (kind === 'video') {
                        var fz = s.freezeCount || 0;
                        if (prev) {
                            if (dl + dr >= 25) Q.rxv.push(100 * dl / (dl + dr));
                            Q.rxf += Math.max(0, fz - (prev.fz || 0));
                        }
                        prevAll[key] = { lost: lost, rec: rec, fz: fz };
                    } else {
                        var cs = s.concealedSamples || 0, ts = s.totalSamplesReceived || 0;
                        if (prev) {
                            if (dl + dr >= 8) Q.rxa.push(100 * dl / (dl + dr));
                            var dcs = Math.max(0, cs - (prev.cs || 0)), dts = Math.max(0, ts - (prev.ts || 0));
                            /* 메워진 소리 비율 — «끊겨서 브라우저가 만들어 낸 소리» 다.
                               표본이 너무 적으면(무음·DTX) 비율이 튀므로 버린다. */
                            if (dts >= 4000) Q.rxc.push(100 * dcs / dts);
                        }
                        prevAll[key] = { lost: lost, rec: rec, cs: cs, ts: ts };
                    }
                });
            }).catch(function () {});
        });
    });
}

/* 수업 중에만 사는 타이머. 첫 vcQualityAcc() 에서 켜지고 수업이 끝나면 스스로 꺼진다. */
function vcqRxStart() {
    if (window.__vcRxT) return;
    try {
        window.__vcRxT = setInterval(function () {
            if (!document.body || !document.body.classList.contains('vc-in-call')) {
                try { clearInterval(window.__vcRxT); } catch (_) {}
                window.__vcRxT = null; window.__vcRxPrev = {};
                return;
            }
            try { vcqRxTick(); } catch (_) {}
        }, 4000);
    } catch (_) {}
}

function vcQualityAcc(loss, rtt) {
    var Q = window.__vcQ || (window.__vcQ = { s: [], r: [], n: 0, rxv: [], rxa: [], rxc: [], rxf: 0, p: [], sentAt: Date.now() });
    vcqRxStart();
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
            peers: Q.p.length ? Math.max.apply(null, Q.p) : 0
        });
        if (navigator.sendBeacon) navigator.sendBeacon('/api/vc/quality-log', new Blob([body], { type: 'application/json' }));
        else fetch('/api/vc/quality-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (_) {}
    window.__vcQ = { s: [], r: [], n: 0, rxv: [], rxa: [], rxc: [], rxf: 0, p: [], sentAt: Date.now() };
}
