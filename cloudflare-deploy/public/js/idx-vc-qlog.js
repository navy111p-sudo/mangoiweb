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

   ⚠️ `vcRoomId` 는 **bare 식별자로만** 읽는다. idx-main.js 의 `let vcRoomId` 라
      `window.vcRoomId` 는 영원히 undefined 다(CLAUDE.md 2장 — 한 달간 방 번호가
      99.7% 비어 있던 사고의 원인). classic script 끼리는 전역 어휘 바인딩을 공유한다.

   🟢 (2026-07-24 비용절감) 30초 → 60초. 이 값은 «강사 회선이 대체로 어떤가» 를 보는
      용도라 1분 요약으로 충분하다. D1 쓰기 2배 감소.
   ═══════════════════════════════════════════════════════════════════════════ */
function vcQualityAcc(loss, rtt) {
    var Q = window.__vcQ || (window.__vcQ = { s: [], r: [], n: 0, sentAt: Date.now() });
    /* loss === -1 은 «영상 표본이 아예 없던 4초» 라는 뜻(위 머리말). 평균에 섞지 않고 센다. */
    if (loss === -1) Q.n = (Q.n || 0) + 1;
    else if (typeof loss === 'number' && isFinite(loss)) Q.s.push(loss);
    if (typeof rtt === 'number' && isFinite(rtt) && rtt > 0) Q.r.push(rtt);
    /* ⚠️ 예전엔 `!Q.s.length` 였다 = 영상 표본이 없으면 영영 안 보냄. 그게 사각지대였다. */
    if (Date.now() - Q.sentAt < 60000 || !(Q.s.length || Q.n)) return;
    try {
        var avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };
        var u = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        var isT = (typeof vcIsTeacherRole === 'function') && vcIsTeacherRole();
        var A = window.__vcAAO || {};
        var body = JSON.stringify({
            room: (vcRoomId || ''),
            uid: (u && u.uid) || '', name: (u && u.name) || '',
            role: isT ? 'teacher' : ((u && u.role) || 'student'),
            /* ⚠️ Math.max.apply(null, []) 는 -Infinity 이고 JSON 에서 null 이 된다.
               표본이 없을 때는 계산하지 않는다(«최대 손실 0%» 라는 거짓말도 하지 않게 novideo 와 함께 읽는다). */
            avg_loss: +avg(Q.s).toFixed(1), max_loss: Q.s.length ? +Math.max.apply(null, Q.s).toFixed(1) : 0,
            avg_rtt: Math.round(avg(Q.r)), aao: A.active ? 1 : 0,
            samples: Q.s.length, novideo: (Q.n || 0)
        });
        if (navigator.sendBeacon) navigator.sendBeacon('/api/vc/quality-log', new Blob([body], { type: 'application/json' }));
        else fetch('/api/vc/quality-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (_) {}
    window.__vcQ = { s: [], r: [], n: 0, sentAt: Date.now() };
}
