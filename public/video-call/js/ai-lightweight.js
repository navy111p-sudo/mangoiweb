// MangoAI lightweight AI helper.
// It never touches the WebRTC MediaStream and only uploads short, explicit clips.
window.MangoAI = window.MangoAI || {};

window.MangoAI.LightweightAI = {
  async canUseAI(peerConnection) {
    if (!peerConnection || peerConnection.connectionState !== 'connected') return false;
    try {
      const stats = await peerConnection.getStats();
      let rtt = null;
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.currentRoundTripTime != null) {
          rtt = report.currentRoundTripTime * 1000;
        }
      });
      // Conservative guard: preserve the class when the route is already slow.
      return rtt == null || rtt < 350;
    } catch (_) {
      return false;
    }
  },

  async transcribeShortClip(audioBlob, peerConnection) {
    const safe = await this.canUseAI(peerConnection);
    if (!safe) return { ok: false, skipped: true, reason: 'class-connection-priority' };
    if (!audioBlob || audioBlob.size > 2 * 1024 * 1024) {
      return { ok: false, skipped: true, reason: 'clip-too-large' };
    }

    const form = new FormData();
    form.append('audio', audioBlob, 'pronunciation.webm');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/ai/pronunciation', {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      return await response.json();
    } catch (_) {
      return { ok: false, skipped: true, reason: 'ai-unavailable' };
    } finally {
      clearTimeout(timer);
    }
  },
};
