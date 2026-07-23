/*!
 * 🎤 mangoi-stt.js — 음성인식이 "제멋대로 끊기는" 것을 막아주는 공용 보호막
 *
 * 왜 필요한가 (2026-07-23):
 *   안드로이드 크롬은 `continuous = true` 를 **무시하고** 첫 확정 결과가 나오면 인식 세션을
 *   스스로 닫아 버린다. iOS 사파리도 한 구절마다 끊는다. 화면들은 그 `onend` 를
 *   "학생이 말을 마쳤다"로 착각해서, 한두 마디만 듣고 채점하거나 조각을 그대로 전송했다.
 *   ("10번 하면 6~7번은 말을 안 듣고 꺼진다" — 2026-07-23 제보)
 *
 * 핵심 규칙 한 줄:
 *   **우리가 stop() 을 부르지 않았는데 끝났다면, 그건 끝난 게 아니다.** → 즉시 다시 듣는다.
 *   (침묵 감시 타이머·정답 매칭·사용자의 ⏹ 는 전부 stop() 을 부르므로 정상 종료로 구분된다)
 *
 * 사용법 — 페이지가 onstart/onend/onerror/onresult 를 **다 붙인 다음** 한 줄:
 *   try { if (typeof MangoiSTT !== 'undefined') MangoiSTT.harden(r, { isDone: function(){ return _done; },
 *                                                                    onRestart: armSilence }); } catch(e){}
 *   ⚠️ 인식 객체를 재사용하면서 클릭할 때마다 핸들러를 새로 붙이는 화면은,
 *      **핸들러를 붙인 뒤 매번 harden() 을 다시 불러야 한다**(새 핸들러가 보호막을 덮어쓰므로).
 *      같은 객체에 여러 번 불러도 안전하도록 만들어져 있다.
 *
 * 옵션
 *   isDone()        이미 채점·전송이 끝났으면 true → 재시작하지 않는다 (게임의 _done 등)
 *   beforeRestart() 재시작 직전 훅 — 문장 조립형 화면이 "지금까지 받아쓴 것"을 확정할 때 쓴다.
 *                   (브라우저는 세션마다 results 를 새로 시작하므로, 안 하면 앞 세션 내용이 날아간다)
 *   onRestart()     재시작 직후 훅. ⚠️ 대부분의 화면은 onstart 에서 **침묵 감시 타이머도 켠다**.
 *                   keepState 로 onstart 를 건너뛰면 그 타이머가 안 켜지므로, 여기서 다시 켜 줄 것.
 *   keepState       기본 true — 재시작 때 페이지의 onstart 를 부르지 않는다.
 *                   게임의 onstart 는 보통 _done/_bestHeard 를 초기화하므로, 부르면 지금까지
 *                   들은 것이 지워진다. 세션마다 초기화가 필요한 화면만 false 로.
 *   maxRestarts     기본 6 (안드로이드는 start() 마다 '삐' 소리가 나므로 무한 재시작 금지)
 *   maxMs           기본 60000 — 한 번 말하기의 전체 상한
 */
(function () {
  'use strict';

  function harden(rec, opts) {
    if (!rec) return rec;
    opts = opts || {};

    var st = rec.__mangoiSTT;
    if (!st) {
      st = rec.__mangoiSTT = {
        wantedStop: false, fatal: false, restarts: 0, t0: Date.now(), restarting: false,
        opts: opts, pageStart: null, pageEnd: null, pageErr: null,
      };

      /* stop()/abort() 호출 = "이제 그만 들어도 된다"는 페이지의 의사표시 */
      var origStop = rec.stop && rec.stop.bind(rec);
      var origAbort = rec.abort && rec.abort.bind(rec);
      var origStart = rec.start && rec.start.bind(rec);
      if (origStop) rec.stop = function () { st.wantedStop = true; try { origStop(); } catch (e) {} };
      if (origAbort) rec.abort = function () { st.wantedStop = true; try { origAbort(); } catch (e) {} };
      if (origStart) rec.start = function () {
        if (!st.restarting) { st.wantedStop = false; st.fatal = false; st.restarts = 0; st.t0 = Date.now(); }
        origStart();
      };

      var onStart = function (ev) {
        if (st.restarting && st.opts.keepState !== false) return;   // 재시작 때는 페이지 상태를 지우지 않는다
        if (st.pageStart) st.pageStart.call(rec, ev);
      };
      var onError = function (ev) {
        var e = ev && ev.error;
        // no-speech(아직 말을 못 꺼냄)만 다시 들을 가치가 있다. 권한·기기·중단은 재시작 금지.
        if (e && e !== 'no-speech') st.fatal = true;
        if (st.pageErr) st.pageErr.call(rec, ev);
      };
      var onEnd = function (ev) {
        var o = st.opts, done = false;
        try { done = !!(o.isDone && o.isDone()); } catch (e) {}
        var mayRestart = !st.wantedStop && !st.fatal && !done
                      && st.restarts < (o.maxRestarts || 6)
                      && (Date.now() - st.t0) < (o.maxMs || 60000);
        if (mayRestart) {
          st.restarts++;
          try { if (o.beforeRestart) o.beforeRestart(); } catch (e) {}
          st.restarting = true;
          try {
            rec.start(); st.restarting = false;              // 화면은 계속 '듣는 중' 그대로
            try { if (o.onRestart) o.onRestart(); } catch (e) {}   // 침묵 감시 타이머 재무장
            return;
          } catch (err) { st.restarting = false; }
        }
        if (st.pageEnd) st.pageEnd.call(rec, ev);
      };
      onStart.__mangoiWrap = onError.__mangoiWrap = onEnd.__mangoiWrap = true;
      st.wrapStart = onStart; st.wrapErr = onError; st.wrapEnd = onEnd;
      st.hardened = true;
    }

    /* 매번 최신 옵션(클로저)으로 갱신 — 라운드마다 _done 이 새로 만들어지는 화면 대응 */
    st.opts = opts;

    /* 페이지가 방금 붙인 핸들러를 잡아두고 보호막을 다시 씌운다.
       이미 우리 래퍼가 붙어 있으면(= 페이지가 다시 안 붙였음) 기존에 잡아둔 것을 유지한다. */
    if (!(rec.onstart && rec.onstart.__mangoiWrap)) st.pageStart = rec.onstart || null;
    if (!(rec.onend   && rec.onend.__mangoiWrap))   st.pageEnd   = rec.onend   || null;
    if (!(rec.onerror && rec.onerror.__mangoiWrap)) st.pageErr   = rec.onerror || null;
    rec.onstart = st.wrapStart;
    rec.onerror = st.wrapErr;
    rec.onend = st.wrapEnd;

    rec.__mangoiHardened = true;
    return rec;
  }

  window.MangoiSTT = { harden: harden };
})();
