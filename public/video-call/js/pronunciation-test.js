// Internal-only pronunciation PoC. Records a short copy from the local mic track;
// it does not modify, replace, or pipe the live WebRTC stream.
(() => {
  const button = document.getElementById('ai-pronunciation');
  const status = document.getElementById('ai-pronunciation-status');
  if (!button || !status) return;

  let recording = false;
  let recorder = null;
  let chunks = [];
  let stopTimer = null;

  function show(message) {
    status.textContent = message;
    status.style.display = 'block';
  }

  function firstConnectedPeer() {
    if (typeof peerConnections === 'undefined') return null;
    for (const pc of peerConnections.values()) {
      if (pc.connectionState === 'connected') return pc;
    }
    return null;
  }

  button.addEventListener('click', async () => {
    if (recording && recorder) {
      clearTimeout(stopTimer);
      recorder.stop();
      return;
    }

    const pc = firstConnectedPeer();
    if (!pc) {
      show('AI 발음 테스트: 상대방과 연결된 뒤 사용할 수 있습니다.');
      return;
    }
    if (!localStream || !localStream.getAudioTracks().length) {
      show('AI 발음 테스트: 마이크가 없습니다.');
      return;
    }
    if (!window.MediaRecorder || !window.MangoAI?.LightweightAI) {
      show('AI 발음 테스트: 이 브라우저에서는 사용할 수 없습니다.');
      return;
    }

    const safe = await window.MangoAI.LightweightAI.canUseAI(pc);
    if (!safe) {
      show('현재 수업 연결 품질을 우선합니다. AI 테스트를 건너뜁니다.');
      return;
    }

    // Clone only the microphone track so stopping the recorder cannot stop the class mic.
    const clonedTrack = localStream.getAudioTracks()[0].clone();
    const clipStream = new MediaStream([clonedTrack]);
    chunks = [];
    recorder = new MediaRecorder(clipStream, MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? { mimeType: 'audio/webm;codecs=opus' } : undefined);
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      recording = false;
      button.textContent = '🗣️';
      clonedTrack.stop();
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      show('AI가 짧은 발음을 확인 중입니다…');
      const result = await window.MangoAI.LightweightAI.transcribeShortClip(blob, pc);
      if (result.ok) show(`인식 결과: ${result.text || '(인식된 문장 없음)'}`);
      else if (result.reason === 'class-connection-priority') show('수업 연결 품질을 우선해 AI 처리를 중단했습니다.');
      else if (result.reason === 'ai-disabled') show('서버에서 AI가 아직 활성화되지 않았습니다.');
      else show(`AI 테스트를 완료하지 못했습니다 (${result.reason || 'unknown'}). 수업은 계속됩니다.`);
    };

    recorder.start();
    recording = true;
    button.textContent = '⏹️';
    show('발음을 말하세요. 최대 4초만 녹음합니다. 다시 누르면 바로 종료됩니다.');
    stopTimer = setTimeout(() => { if (recorder && recorder.state === 'recording') recorder.stop(); }, 4000);
  });
})();
