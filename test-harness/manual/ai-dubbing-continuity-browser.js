/* Run in the console on a locally served ai-dubbing.html (or inject this file).
 * Uses real checked-in dub-007 MP4/MP3 media, not generated stand-ins or paid APIs.
 * Six scenes in parallel, three REAL-TIME passes: normal, 400ms voice lag,
 * pause/resume. Inspect window.__continuity after done becomes true.
 * Audio is muted so simultaneous scenes do not overlap in the speakers.
 * This checks decoding/timing/frames, not subjective voice or lip-sync quality.
 */
(async function () {
  const report = window.__continuity = { round: 0, results: [], errors: [], done: false };
  const raw = await (await fetch('/data/dubbing/dub-007.json')).json();
  const ep = MangoiDubCore.normalizeEpisode(raw).episode;
  const grid = document.createElement('div');
  grid.style = 'position:fixed;inset:0;z-index:99999;background:#111;display:grid;grid-template-columns:repeat(3,1fr);align-content:start';
  document.body.append(grid);

  async function scene(sc, round) {
    const v = document.createElement('video');
    v.muted = true; v.style = 'width:100%'; grid.append(v);
    const audios = [];
    const row = { scene: sc.no, round, seen: false, seeksDuringSpeech: [], errors: [], pauseChecks: [] };
    class TestAudio extends Audio {
      constructor() { super(); this.muted = true; audios.push(this); }
    }
    const runner = MangoiDubWatch.create({
      C: MangoiDubCore, opt: { cardMs: 10, endMs: 10 }, Audio: TestAudio,
      video: () => v,
      prepVideo: (el, s) => { el.src = s.video; el.load(); },
      waitVideo: el => new Promise(resolve => {
        if (el.readyState >= 3) return resolve(true);
        el.oncanplaythrough = () => resolve(true); el.onerror = () => resolve(false);
      }),
      route: a => {
        a.addEventListener('seeking', () => {
          const t = a.currentTime;
          if (!a.__injection && sc.lines.some(l => t >= l.start - .12 && t <= l.end + .12))
            row.seeksDuringSpeech.push({ src: a.src, t });
        });
        a.addEventListener('error', () => row.errors.push(a.error && a.error.message));
        return { cut() {} };
      },
      showLine() {}, clearLine() {}, card() {}, onEnd() {},
      onSeen() { row.seen = true; }, tts: () => Promise.resolve(null),
    });
    let injected = false, held = false, timeout;
    const done = runner.start([{ ep, scIdx: sc.no - 1, first: true }]);
    const monitor = setInterval(() => {
      const t = v.currentTime;
      if (round === 2 && !injected && t > sc.lines[0].start + .7) {
        injected = true;
        const a = audios.find(x => x.src.includes('-' + sc.lines[0].speaker + '.'));
        a.__injection = true;
        a.addEventListener('seeked', () => { a.__injection = false; }, { once: true });
        a.currentTime = Math.max(0, a.currentTime - .4);
      }
      if (round === 3 && !held && t > sc.lines[0].start + .7) {
        held = true; runner.pause(); const at = v.currentTime;
        setTimeout(() => {
          row.pauseChecks.push(Math.abs(v.currentTime - at) < .03 && audios.every(a => a.paused));
          runner.resume();
        }, 400);
      }
    }, 50);
    try {
      row.ok = await Promise.race([done, new Promise(r => { timeout = setTimeout(() => r(false), 85000); })]);
      row.frames = v.getVideoPlaybackQuality().totalVideoFrames;
      row.dropped = v.getVideoPlaybackQuality().droppedVideoFrames;
      row.end = v.currentTime;
    } finally {
      clearInterval(monitor); clearTimeout(timeout); runner.stop(); v.remove();
      report.results.push(row);
    }
  }
  try {
    for (let round = 1; round <= 3; round++) {
      report.round = round;
      await Promise.all(ep.scenes.map(sc => scene(sc, round)));
    }
  } catch (e) { report.errors.push(String(e)); }
  finally { report.done = true; grid.remove(); }
})();
