/* The server records/evaluates turns. This controller never submits scores or awards. */
(function () {
  'use strict';
  var warmup = /\/warmup\.html$/.test(location.pathname), app = warmup ? 'warmup' : 'friend';
  var sessionId = '', sessionToken = '', starting = null, finishing = null, evaluatingId = '', closed = false, result = null;
  var generation = 0;
  var card, dialog, trigger;
  function en() {
    try { return String(localStorage.getItem('mangoi_lang') || '').indexOf('en') === 0; } catch (_) { return false; }
  }
  function t(ko, english) { return en() ? english : ko; }
  function token() { try { return localStorage.getItem('mango_token') || ''; } catch (_) { return ''; } }
  function reset() { generation++; sessionId = ''; sessionToken = ''; starting = null; closed = false; result = null; }
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
    if (sessionId && sessionToken !== token()) reset();
    if (closed || (evaluatingId && sessionId === evaluatingId)) reset();
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
    return { progress_session: sessionId, progress_turn: crypto.randomUUID() };
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
    if (result) window.AiSpeakingProgressView.render(card, result, en() ? 'en' : 'ko');
    if (trigger) trigger.textContent = t('학습 결과', 'Results');
    if (dialog) {
      dialog.querySelector('button').textContent = t('닫기', 'Close');
      dialog.setAttribute('aria-label', t('말하기 학습 결과', 'Speaking results'));
    }
  }
  async function finish() {
    if (finishing) return finishing;
    if (document.getElementById('sendBtn')?.disabled) { message(t('AI 응답이 끝난 뒤 결과를 확인해 주세요.', 'Wait for the AI reply before viewing results.')); return; }
    if (dialog && !dialog.open) {
      if (window.FriendAutoTalk) window.FriendAutoTalk.pause();
      if (typeof window.cancelFriendMic === 'function') window.cancelFriendMic();
      if (typeof window.stopSpeakingNow === 'function') window.stopSpeakingNow();
      dialog.showModal();
    }
    if (result) { paint(); return; }
    if (!sessionId) { message(t('로그인 후 대화를 나누면 학습 결과를 확인할 수 있어요.', 'Log in and have a conversation to see your results.')); return; }
    message(t('기록된 대화를 평가하고 있어요…', 'Assessing your recorded conversation…'));
    evaluatingId = sessionId;
    var requestedId = sessionId;
    finishing = (async function () {
      try {
        // Finish reuses the existing point flow; its in-flight request is shared.
        if (warmup && window.__mgWarmupPts) await window.__mgWarmupPts.run();
        var data = await api({ action: 'finish', sessionId: requestedId });
        if (!data.result || data.result.finishedNormally !== true || data.result.lessonId !== requestedId) throw new Error('progress_unavailable');
        if(sessionId === requestedId) { result = data.result; closed = true; paint(); }
      } catch (error) {
        if(sessionId !== requestedId) return;
        var texts = {
          auth_required: t('로그인 후 결과를 확인해 주세요.', 'Log in to view your results.'),
          no_completed_turns: t('AI와 대화를 한 번 마친 뒤 확인해 주세요.', 'Complete a conversation turn first.'),
          evaluation_pending: t('평가 중이에요. 잠시 뒤 다시 확인해 주세요.', 'Assessment is in progress. Try again shortly.')
        };
        message(texts[error.message] || t('결과를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'Results are unavailable. Please try again shortly.'), true);
      } finally { finishing = null; evaluatingId = ''; }
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
    document.addEventListener('mangoi:lang-changed', paint);
  }
  window.AiSpeakingProgress = { beforeTurn: beforeTurn, finish: finish, reset: reset };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm); else arm();
})();
