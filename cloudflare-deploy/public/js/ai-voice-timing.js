/* Local, bounded voice-stage diagnostics. Never stores text, audio, UID or tokens.
 * No persistence, network request or console logging. snapshot() reports measured
 * client intervals; STT/TTS/LLM round trips include transport, not provider-only time.
 * Missing stages stay null. These measurements do not establish recognition accuracy.
 */
(function () {
  'use strict';
  var rows = [], next = 0;
  var allowed = /^(input_requested|recording_started|recognition_first_result|recognition_last_result|recognition_finished|speech_started|speech_last|recording_stopped|stt_started|stt_finished|stt_failed|input_failed|canceled|llm_started|llm_first_sentence|llm_finished|tts_started|tts_ready|tts_failed|output_started|output_finished)$/;
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function begin(mode, source) {
    var row = { id: ++next, mode: /^(manual|auto|face)$/.test(mode) ? mode : 'manual', source: /^(warmup-browser|warmup-whisper)$/.test(source) ? source : 'ai-friend', stages: {}, stopReason: null, server: {} };
    rows.push(row); if (rows.length > 50) rows.shift();
    return { mark: function (stage, reason) {
      if (!allowed.test(stage)) return;
      if (row.stages.canceled != null) return;
      if (stage === 'speech_last' || stage === 'recognition_last_result' || row.stages[stage] == null) row.stages[stage] = now();
      if (stage === 'recording_stopped' && /^(manual|silence|max_duration|no_speech|canceled)$/.test(reason)) row.stopReason = reason;
    }, server: function (timing) {
      ['server_ms', 'model_ms', 'tries'].forEach(function (key) {
        if (timing && typeof timing[key] === 'number' && isFinite(timing[key]) && timing[key] >= 0) row.server[key] = Math.round(timing[key]);
      });
    } };
  }
  function snapshot() {
    return rows.map(function (row) {
      var s = row.stages;
      function interval(a, b) { return s[a] != null && s[b] != null && s[b] >= s[a] ? Math.round(s[b] - s[a]) : null; }
      return { id: row.id, mode: row.mode, source: row.source, stopReason: row.stopReason, canceled: s.canceled != null,
        serverMs: row.server.server_ms == null ? null : row.server.server_ms,
        modelMs: row.server.model_ms == null ? null : row.server.model_ms,
        modelTries: row.server.tries == null ? null : row.server.tries,
        inputReadyMs: interval('input_requested', 'recording_started'),
        nativeFirstResultMs: interval('recording_started', 'recognition_first_result'),
        nativeResultToStopMs: interval('recognition_last_result', 'recording_stopped'),
        captureMs: interval('recording_started', 'recording_stopped'),
        endOfTurnMs: interval('speech_last', 'recording_stopped'),
        transcriptionRoundTripMs: interval('stt_started', 'stt_finished'),
        firstSentenceRoundTripMs: interval('llm_started', 'llm_first_sentence'),
        responseRoundTripMs: interval('llm_started', 'llm_finished'),
        synthesisRoundTripMs: interval('tts_started', 'tts_ready'),
        playbackStartMs: interval('tts_ready', 'output_started'),
        responseAfterSpeechMs: interval('speech_last', 'output_started'),
        inputToOutputMs: interval('input_requested', 'output_started') };
    });
  }
  window.MangoiVoiceTiming = { begin: begin, snapshot: snapshot, clear: function () { rows = []; } };
})();
