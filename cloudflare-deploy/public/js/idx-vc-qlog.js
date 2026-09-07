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
    try { vcqDupTabWatch(); } catch (_) {}   // 👥 같은 계정 둘째 탭(③)
    try { vcqWrapCreatePeer(); } catch (_) {}   // ② 로드 순서상 아직 못 감쌌으면 여기서
    try { vcqWrapAAONotify(); } catch (_) {}    // ④ 같은 이유
    ids.forEach(function (id) {
        var pc = pcs[id];
        try { vcqPathProbe(id, pc); } catch (_) {}   // 🛰 이 연결이 중계인지 직접인지(아래 vcqPathProbe)
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
                            /* 🔊 (2026-09-07) 아래 vcqBufDecide 가 «끊김 대 진짜손실» 을 같은 틱에서
                               봐야 해서 값을 변수로 잡아 둔다. 못 잰 틱은 null — 그때는 세지 않는다. */
                            var apct = (dl + dr >= 8) ? (100 * dl / (dl + dr)) : null;
                            if (apct !== null) Q.rxa.push(apct);
                            var dcs = Math.max(0, cs - (prev.cs || 0)), dts = Math.max(0, ts - (prev.ts || 0));
                            /* 메워진 소리 비율 — «끊겨서 브라우저가 만들어 낸 소리» 다.
                               표본이 너무 적으면(무음·DTX) 비율이 튀므로 버린다. */
                            if (dts >= 4000) {
                                var cpct = 100 * dcs / dts;
                                Q.rxc.push(cpct);
                                try { vcqBufDecide(id, pc, cpct, apct); } catch (_) {}
                            }
                        }
                        prevAll[key] = { lost: lost, rec: rec, cs: cs, ts: ts };
                    }
                });
            }).catch(function () {});
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
/* ══════════════════════════════════════════════════════════════════════════
   🔊 (2026-09-07) «늦어서 버려지는 소리» 에만 지터버퍼 완화를 건다 — vcqBufDecide
   ──────────────────────────────────────────────────────────────────────────
   [지시] 사장님 2026-09-07 「지터버퍼 문턱 넣어줘」.

   [무엇이 문제였나] idx-main.js 에 그 완화(tuneReceiveLatency 의 'buf')는 2026-09-05 에
     이미 들어가 있었다. 그런데 걸리는 조건이 «기준 RTT ≥ 300ms» 또는 «3틱 연속 RTT>450» 뿐이라
     정작 피해자에게 안 닿고 있었다.
     [잰 것 — 2026-09-07 운영 D1 vc_quality, 최근 30일]
       · 경로가 기록된 72건이 **전부 relay**(direct 0). 그중 60건이 turn.cloudflare.com:3478 **tcp**, UDP 0
       · relay 62건: 소리끊김(rx_conceal) **10.24%** vs 진짜 오디오손실(rx_aloss) **0.60%** → **17.2배**
       · 그 62건의 기준 RTT 평균 **281ms**, RTT 300 이상은 **23건(37%)뿐** → **63%가 문턱 미달**
     ⟹ 소리끊김의 약 94%가 «잃어버린 것» 이 아니라 «늦게 와서 버린 것» 인데,
        바로 그 회선들이 완화 대상에서 빠져 있었다. 늦은 것은 기다리면 살아난다.
     [판단 — 측정 아님] TCP 중계라 그렇다고 본다. TCP 는 늦은 조각을 못 버리고 재전송한다.
        손실이 낮은데 끊기는 지문이 그것이다. 다만 «TCP 때문» 을 직접 증명하지는 못했다.

   [그래서 무엇을 바꿨나] 문턱을 RTT 가 아니라 **증상 자체**로 바꾼다 —
     «소리가 끊기는데(conceal 높음) 진짜 손실은 작다(aloss 작음)» 이면 켠다.
     그것이 idx-main.js 의 그 주석이 요구한 전제(conceal ≫ aloss)와 같은 말이고,
     RTT·경로와 무관하게 «기다리면 살아나는» 상황을 직접 가리킨다.
   ⛔ 「relay 면 무조건 켜기」로 하지 않았다 — 중계여도 소리가 멀쩡한 연결이 있고,
      그런 연결에 +300ms 를 얹으면 대화만 굼떠진다(얻는 것 없이).

   [대가] 켜지면 수신 지연이 **+300ms**(window.__vcRxBufMs). 대화 반응이 그만큼 느려진다.
      끊기는 것보다 낫다는 판단은 idx-main.js 의 그 주석에 이미 있다.

   [흔들리지 않게] 3틱(약 12초) 연속 나빠야 켜고, 5틱(약 20초) 연속 좋아야 끈다.
     ⛔ 매 틱 뒤집히게 만들지 말 것 — tuneReceiveLatency 주석이 «재설정 = 소리 튐» 을 경고한다.
     ⚠️ 그 사이 구간(2~4%)에서는 «유지» 다. 그래야 문턱 근처에서 왔다갔다하지 않는다.

   [모르면 안 켠다] 손실을 못 잰 틱(오디오 패킷이 너무 적은 틱)은 세지 않는다.
     +300ms 는 실제 비용이라 «모름» 으로 물리지 않는다.

   [되돌리는 길] window.__vcRxBufMs = 0  → 이 판정이 통째로 꺼지고 예전 동작 그대로.
   ⚠️ idx-main.js 는 이 값을 `pc.__qWantBuf` 한 칸으로만 읽는다(그 파일 blocking 예산이
      81바이트뿐이라 판정을 거기 둘 수 없다). 그 칸 이름이 바뀌면 조용히 헛돈다 —
      감시(vc_latency_tuning_harness)가 양쪽 이름을 대조한다.
   감시: test-harness/vc_latency_tuning_harness.mjs
   ══════════════════════════════════════════════════════════════════════════ */
var VCQ_BUF_ON_CONCEAL  = 4;   // % — 이 이상 끊기면 «나쁜 틱»
var VCQ_BUF_OFF_CONCEAL = 2;   // % — 이 아래로 내려가야 «좋은 틱»
var VCQ_BUF_LATE_RATIO  = 3;   // conceal ≥ aloss×3 이면 «늦어서 버린 것»(실측 17.2배)
var VCQ_BUF_ON_TICKS    = 3;   // 약 12초 연속
var VCQ_BUF_OFF_TICKS   = 5;   // 약 20초 연속
function vcqBufDecide(id, pc, concealPct, alossPct) {
    if (!pc) return;
    try {
        /* 시험 손잡이로 끄면 예전 그대로 — 켜 둔 상태였으면 즉시 되돌린다 */
        if (window.__vcRxBufMs === 0) { pc.__qWantBuf = false; return; }
        if (typeof alossPct !== 'number') return;      // 손실을 못 잰 틱은 세지 않는다
        var S = window.__vcBufS || (window.__vcBufS = {});
        var s = S[id] || (S[id] = { bad: 0, good: 0 });
        if (concealPct >= VCQ_BUF_ON_CONCEAL && concealPct >= alossPct * VCQ_BUF_LATE_RATIO) {
            s.bad++; s.good = 0;
        } else if (concealPct < VCQ_BUF_OFF_CONCEAL) {
            s.good++; s.bad = 0;
        }                                              // 그 사이는 «유지»(히스테리시스)
        if (!pc.__qWantBuf && s.bad >= VCQ_BUF_ON_TICKS) {
            pc.__qWantBuf = true;
            try { console.log('[vc-buf]', id, '소리가 늦어서 버려짐 → 수신 버퍼 완화 켬',
                { conceal: Math.round(concealPct * 10) / 10, aloss: Math.round(alossPct * 10) / 10 }); } catch (_) {}
        } else if (pc.__qWantBuf && s.good >= VCQ_BUF_OFF_TICKS) {
            pc.__qWantBuf = false;
            try { console.log('[vc-buf]', id, '소리가 안정 → 수신 버퍼 완화 끔'); } catch (_) {}
        }
    } catch (_) {}
}

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
                /* 🔊 __vcBufS 도 함께 비운다 — 앞 수업의 «나쁨/좋음» 연속카운트가 넘어가면
                   다음 수업 첫 틱에 곧바로 켜지거나(또는 안 켜지거나) 한다. */
                window.__vcRxT = null; window.__vcRxPrev = {}; window.__vcPeerSilence = {}; window.__vcLowQ = {}; window.__vcPath = {}; window.__vcBufS = {};
                /* 회선 경고의 기준 RTT·연속카운트도 함께 비운다 — 안 비우면 앞 수업의 기준값이
                   다음 수업으로 넘어간다(위 «나쁜 틱에서는 안 올린다» 때문에 «나쁨» 상태도 넘어간다). */
                try { vcqSaveRttBase(); } catch (_) {}   // ② 다음 수업의 «낮게 시작» 근거(7일)
                window.__vcNetSelf = null;
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
