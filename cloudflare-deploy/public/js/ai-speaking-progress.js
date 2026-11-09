/* The server records/evaluates turns. This controller never submits scores or awards. */
(function () {
  'use strict';
  var warmup = /\/warmup\.html$/.test(location.pathname), app = warmup ? 'warmup' : 'friend';
  var sessionId = '', sessionToken = '', starting = null, finishing = null, evaluatingId = '', closed = false, result = null;
  var generation = 0, refreshing = null;
  /* 🔒 오래 쉰 대화는 새 기록으로 — 서버는 같은 학생이 새 대화를 시작할 때 «마지막 활동 뒤 10분» 넘은 대화를 자동 마감한다
     (src/ai-speaking-session.ts closeAbandoned). 그보다 1분 먼저(9분) 여기서 새로 시작해, 서버가 닫았을지 모르는 기록에
     턴을 보내지 않는다(보내면 그 턴·포인트가 조용히 빠진다). 뒤로가기로 되살아난 화면도 이 규칙 하나로 처리된다.
     EN: after 9 idle minutes start a fresh record — the server may auto-close one idle for 10. */
  var IDLE_RESTART_MS = 9 * 60 * 1000, lastActive = 0;
  var card, dialog, trigger;
  function en() {
    try { return String(localStorage.getItem('mangoi_lang') || '').indexOf('en') === 0; } catch (_) { return false; }
  }
  function t(ko, english) { return en() ? english : ko; }
  function token() { try { return localStorage.getItem('mango_token') || ''; } catch (_) { return ''; } }
  function reset() { if(window.AiSpeakingSession&&window.AiSpeakingSession.clear)window.AiSpeakingSession.clear(); generation++; sessionId = ''; sessionToken = ''; lastActive = 0; starting = null; finishing = null; refreshing = null; evaluatingId = ''; closed = false; result = null; queued = null; if (notice) notice.hidden = true; if (card) card.replaceChildren(); }
  async function api(body) {
    var response = await fetch('/api/ai/speaking-progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify(body)
    });
    var data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'progress_unavailable');
    return data;
  }
  async function beforeTurn() {
    if (sessionToken && sessionToken !== token()) reset();
    if (!token()) return {};
    if (closed || (evaluatingId && sessionId === evaluatingId)) reset();
    if (sessionId && lastActive && Date.now() - lastActive > IDLE_RESTART_MS) reset();
    if (!sessionId) {
      if (!starting) {
        sessionToken = token();
        starting = api({ action: 'start', app: app, sourceId: warmup ? String(window.SESSION_ID || '') : undefined });
      }
      var pending = starting, epoch = generation, expectedToken = sessionToken;
      try {
        var started = await pending;
        if (epoch !== generation || expectedToken !== token()) return {};
        if (typeof started.sessionId !== 'string' || !started.sessionId || started.sessionId.length > 100) return {};
        sessionId = started.sessionId;
      } catch (_) { return {}; }
      finally { if (starting === pending) starting = null; }
    }
    lastActive = Date.now();
    return { progress_session: sessionId, progress_turn: crypto.randomUUID() };
  }
  /* ⏳ AI 대답 중(#sendBtn 꺼짐)에 누른 끝내기를 대답이 끝날 때까지 기다렸다 한 번 한다(최대 30초).
     EN: a finish pressed while the AI is replying runs once the reply ends (30 s cap). */
  var queued = null, notice = null, noticeTimer = 0;
  function busy() { var s = document.getElementById('sendBtn'); return !!(s && s.disabled); }
  function note(text, ms) {
    if (!notice) {
      notice = document.createElement('div'); notice.id = 'aiProgressNotice'; notice.setAttribute('role', 'status');
      // 위쪽 가운데 · 눌림을 가리지 않음 · 마이크 안내(#micHint, 아래쪽 z 9999)와 안 겹치고 그 위 · 드로어(99999~)보다 아래
      notice.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 72px);z-index:10000;pointer-events:none;width:max-content;max-width:calc(100% - 32px);box-sizing:border-box;padding:10px 16px;border-radius:12px;background:#1f2937;color:#fff;font-size:14px;line-height:1.4;box-shadow:0 4px 16px rgba(0,0,0,.25)';
      document.body.appendChild(notice);
    }
    clearTimeout(noticeTimer); notice.textContent = text; notice.hidden = !text;
    if (text && ms) noticeTimer = setTimeout(function () { notice.hidden = true; }, ms);
  }
  function afterReply(fn) {
    if (!busy()) { fn(); return; }
    if (queued) { queued.fn = fn; return; }
    var q = queued = { fn: fn }, waited = 0;
    note(t('AI 대답이 끝나면 바로 이어서 할게요…', 'Finishing right after the AI reply…'));
    (function tick() {
      if (queued !== q) return;
      if (!busy()) { queued = null; note(''); try { q.fn(); } catch (_) {} return; }
      waited += 300;
      if (waited >= 30000) { queued = null; note(t('AI 대답이 아직 안 끝났어요. 잠시 뒤 다시 눌러 주세요.', 'The AI reply has not finished. Please press again shortly.'), 5000); return; }
      setTimeout(tick, 300);
    })();
  }
  function message(text, retry) {
    card.replaceChildren();
    var p = document.createElement('p'); p.setAttribute('role', 'status'); p.textContent = text; card.appendChild(p);
    if (retry) {
      var button = document.createElement('button'); button.type = 'button'; button.className = 'ai-progress-retry';
      button.textContent = t('다시 확인', 'Try again'); button.onclick = finish; card.appendChild(button);
    }
  }
  function paint() {
    if (sessionToken && sessionToken !== token()) reset();
    if (result) window.AiSpeakingProgressView.render(card, result, en() ? 'en' : 'ko');
    if (trigger) trigger.textContent = t('학습 결과', 'Results');
    if (dialog) {
      dialog.querySelector('button').textContent = t('닫기', 'Close');
      dialog.setAttribute('aria-label', t('말하기 학습 결과', 'Speaking results'));
    }
  }
  async function finish() {
    if (sessionToken && sessionToken !== token()) reset();
    if (finishing) return finishing;
    // AI 대답 중에 누른 «끝내기» 는 버리지 않고 대답이 끝나면 이어서 한다(2026-11-09 — 예전엔 닫힌 창에 안내만 쓰고 끝났다).
    if (busy()) { afterReply(finish); return; }
    if (dialog && !dialog.open) {
      if (window.FriendAutoTalk) window.FriendAutoTalk.pause();
      if (typeof window.cancelFriendMic === 'function') window.cancelFriendMic();
      if (typeof window.stopSpeakingNow === 'function') window.stopSpeakingNow();
      dialog.showModal();
    }
    if (result) {
      paint();
      if (refreshing) return refreshing;
      var epoch = generation, cached = result, expectedToken = sessionToken, cachedId = sessionId;
      var refresh = (async function () {
        try {
          // Completed-session reads refresh the ledger and vocabulary without awarding or regrading.
          var updated = (await api({ action: 'finish', sessionId: cachedId })).result;
          if (!updated || updated.finishedNormally !== true || updated.lessonId !== cachedId) throw new Error('progress_unavailable');
          if (epoch === generation && cached === result && expectedToken === token() && cachedId === sessionId) {
            result = updated; paint();
          }
        } catch (_) {
          if (epoch === generation && cached === result && expectedToken === token() && cachedId === sessionId) {
            result.weeklyVocabulary = null; paint();
          }
        }
      })();
      refreshing = refresh;
      try { await refresh; } finally { if (refreshing === refresh) refreshing = null; }
      return;
    }
    if (!sessionId) {
      var local = window.AiSpeakingSession && AiSpeakingSession.result(typeof window.wuProgressContext==='function'?wuProgressContext():'');
      if(local && local.turns>0){window.AiSpeakingProgressView.render(card,local,en()?'en':'ko');return;}
      message(t('로그인 후 대화를 나누면 학습 결과를 확인할 수 있어요.', 'Log in and have a conversation to see your results.')); return;
    }
    message(t('확인된 연습 결과를 불러오고 있어요…', 'Loading your confirmed practice results…'));
    evaluatingId = sessionId;
    var requestedId = sessionId, expectedToken = sessionToken, requestedGeneration = generation;
    finishing = (async function () {
      try {
        // Finish reuses the existing point flow; its in-flight request is shared.
        if (warmup && window.__mgWarmupPts) await window.__mgWarmupPts.run();
        var data = await api({ action: 'finish', sessionId: requestedId });
        if (generation !== requestedGeneration || sessionId !== requestedId) return;
        if (token() !== expectedToken || sessionToken !== expectedToken) { reset(); message(t('현재 계정으로 새 대화를 시작해 주세요.', 'Start a new conversation with the current account.')); return; }
        if (!data.result || data.result.finishedNormally !== true || data.result.lessonId !== requestedId) throw new Error('progress_unavailable');
        if(sessionId === requestedId) { result = data.result; closed = true; paint(); }
      } catch (error) {
        if(generation !== requestedGeneration || sessionId !== requestedId) return;
        var texts = {
          auth_required: t('로그인 후 결과를 확인해 주세요.', 'Log in to view your results.'),
          no_completed_turns: t('AI와 대화를 한 번 마친 뒤 확인해 주세요.', 'Complete a conversation turn first.'),
          evaluation_pending: t('평가 중이에요. 잠시 뒤 다시 확인해 주세요.', 'Assessment is in progress. Try again shortly.')
        };
        message(texts[error.message] || t('결과를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'Results are unavailable. Please try again shortly.'), true);
      } finally { if (generation === requestedGeneration && evaluatingId === requestedId) { finishing = null; evaluatingId = ''; } }
    })();
    return finishing;
  }
  function arm() {
    card = document.createElement('section'); card.className = 'ai-progress-card'; card.setAttribute('aria-live', 'polite');
    if (warmup) {
      var host = document.querySelector('#wgSummary .wg-summary-inner');
      if (!host) return;
      host.insertBefore(card, document.getElementById('wgSummaryText'));
    } else {
      dialog = document.createElement('dialog'); dialog.className = 'ai-progress-dialog'; dialog.setAttribute('aria-label', t('말하기 학습 결과', 'Speaking results'));
      var close = document.createElement('button'); close.type = 'button'; close.className = 'ai-progress-close'; close.onclick = function () { dialog.close(); };
      dialog.appendChild(close); dialog.appendChild(card); document.body.appendChild(dialog);
      trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'ai-progress-trigger'; trigger.onclick = finish;
      var next = document.querySelector('.next-bottom');
      if (next) {
        var actions = document.createElement('div'); actions.className = 'ai-progress-actions';
        next.parentNode.insertBefore(actions, next); actions.appendChild(trigger); actions.appendChild(next);
      } else document.body.appendChild(trigger);
    }
    var send = document.getElementById('sendBtn'), finishButton = warmup ? document.getElementById('wgFinish') : trigger;
    if (send && finishButton) new MutationObserver(function () { finishButton.disabled = send.disabled; }).observe(send, { attributes: true, attributeFilter: ['disabled'] });
    paint();
    window.addEventListener('mangoi:lang-changed', paint);
    window.addEventListener('storage', function (event) { if (event.key === 'mango_token' || event.key === null) paint(); });
    document.addEventListener('mangoi:lang-changed', paint);
  }
  window.AiSpeakingProgress = { beforeTurn: beforeTurn, finish: finish, reset: reset, afterReply: afterReply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm); else arm();
})();
