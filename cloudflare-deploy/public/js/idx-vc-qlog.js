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
function vcqRxTick() {
    var Q = window.__vcQ; if (!Q) return;
    var pcs = window.vcPeerConnections || {};
    var ids = Object.keys(pcs);
    Q.p.push(ids.length);
    var prevAll = window.__vcRxPrev || (window.__vcRxPrev = {});
    try { vcqLowQSelf(); } catch (_) {}   // 📶 내가 저화질로 보내는 중이면 내 타일에 배지
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
                window.__vcRxT = null; window.__vcRxPrev = {}; window.__vcPeerSilence = {}; window.__vcLowQ = {};
                return;
            }
            try { vcqRxTick(); } catch (_) {}
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

/* ① 내 회선이 나쁘다 — 학생·강사 모두에게. 판정은 «내가 보내는 것» 의 손실·RTT 다
   (그게 곧 내 업링크다). ⛔ loss === -1 은 «영상 표본 없음» 이라 판정에 쓰지 않는다. */
function vcNetSelfWatch(loss, rtt) {
    var W = window.__vcNetSelf || (window.__vcNetSelf = { bad: 0, notifiedAt: 0 });
    if (loss === -1) return;                                  // 표본 없음 → 판단 보류
    var bad = (typeof loss === 'number' && loss >= 8) || (typeof rtt === 'number' && rtt >= 400);
    if (!bad) { W.bad = 0; return; }
    W.bad++;
    if (W.bad < 4) return;                                    // 연속 4틱(약 16초) — 스파이크 한 번으로는 안 띄운다
    if (Date.now() - (W.notifiedAt || 0) < 180000) return;    // 3분에 한 번만
    W.notifiedAt = Date.now(); W.bad = 0;
    vcNetNotify('📶 <b>인터넷 연결이 불안정합니다.</b><br>' +
        '<span style="font-weight:500">공유기 가까이 가거나, 유선(랜선)으로 연결하면 좋아집니다.</span><br>' +
        '<span style="font-size:12px;opacity:.85">Your internet looks unstable — move closer to the router or use a cable.</span>');
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
function vcLowQMark(box, on, text) {
    try {
        if (!box) return;
        var el = box.querySelector('.vc-lowq-hint');
        if (!on) { if (el) el.remove(); return; }
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
    var Q = window.__vcQ || (window.__vcQ = { s: [], r: [], n: 0, rxv: [], rxa: [], rxc: [], rxf: 0, p: [], sentAt: Date.now() });
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
            peers: Q.p.length ? Math.max.apply(null, Q.p) : 0
        });
        if (navigator.sendBeacon) navigator.sendBeacon('/api/vc/quality-log', new Blob([body], { type: 'application/json' }));
        else fetch('/api/vc/quality-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (_) {}
    window.__vcQ = { s: [], r: [], n: 0, rxv: [], rxa: [], rxc: [], rxf: 0, p: [], sentAt: Date.now() };
}
