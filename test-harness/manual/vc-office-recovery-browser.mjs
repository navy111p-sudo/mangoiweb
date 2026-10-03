/* Local-only, real Chromium/RTCPeerConnection audio recovery test.
 * PW_DIR=/tmp/pw node test-harness/manual/vc-office-recovery-browser.mjs
 * Serves the complete shipping office-mode script on an ephemeral localhost port.
 * A deterministic fake microphone feeds an actual sending and receiving WebRTC peer;
 * assertions measure decoded remote PCM, not merely track.enabled or readyState.
 * Chromium has no native "interrupted" state: that one state label is injected over
 * a genuinely suspended AudioContext. suspended/closed and all media are native.
 */
import assert from 'node:assert/strict';
import { requireBrowser } from './_pw.mjs';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium, exe } = requireBrowser();
const source = await readFile(process.env.OFFICE_SOURCE || fileURLToPath(new URL('../../cloudflare-deploy/public/js/idx-vc-officemode.js', import.meta.url)), 'utf8');
const temp = await mkdtemp(join(tmpdir(), 'vc-office-audio-'));
const micFile = join(temp, 'microphone.wav');
const samples = 48000 * 4, wave = Buffer.alloc(44 + samples * 2);
wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22);
wave.writeUInt32LE(48000, 24); wave.writeUInt32LE(96000, 28); wave.writeUInt16LE(2, 32);
wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const t = i / 48000, phase = 2 * Math.PI * (180 * t + 5 * Math.sin(2 * Math.PI * 3 * t));
  const envelope = 0.6 + 0.4 * Math.sin(2 * Math.PI * 4 * t);
  const voice = (Math.sin(phase) + 0.5 * Math.sin(phase * 2) + 0.25 * Math.sin(phase * 4)) / 1.75;
  wave.writeInt16LE(Math.round(18000 * envelope * voice), 44 + i * 2);
}
await writeFile(micFile, wave);
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': req.url === '/office.js' ? 'text/javascript' : 'text/html', 'Cache-Control': 'no-store' });
  res.end(req.url === '/office.js' ? source : '<!doctype html><html><body>Local office audio recovery fixture</body></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, pass = 0;
try {
  browser = await chromium.launch({ executablePath: exe, headless: true, args: [
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking',
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-audio-capture=${micFile}`, '--autoplay-policy=no-user-gesture-required',
  ] });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  await page.goto(origin);
  const result = await page.evaluate(`(async () => {
    const checks = [];
    const check = (value, message, detail) => { if (!value) throw new Error(message + ' ' + JSON.stringify(detail)); checks.push(message); };
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (fn, message) => { for (let i = 0; i < 120; i++) { if (fn()) return; await sleep(25); } throw new Error(message); };
    const NativeContext = window.AudioContext;
    window.__officeContexts = [];
    window.__errors = [];
    window.addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));
    window.AudioContext = function (...args) { const c = new NativeContext(...args); window.__officeContexts.push(c); return c; };
    window.vcIsStaffNow = () => true;
    window.showView = () => {};
    localStorage.setItem('mangoi_vc_office', '1');
    localStorage.setItem('mangoi_vc_mic_id', 'saved-device-preference');
    await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = '/office.js'; script.onload = resolve; script.onerror = reject; document.head.append(script); });
    document.body.classList.add('vc-in-call');
    const measurements = [];
    for (const state of ['suspended', 'interrupted', 'closed']) for (const muted of [false, true]) {
      localStorage.setItem('mangoi_vc_office', '1');
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false });
      window.vcLocalStream = media;
      const selected = media.getAudioTracks()[0].getSettings().deviceId;
      const send = new RTCPeerConnection({ iceServers: [] }), receive = new RTCPeerConnection({ iceServers: [] });
      const remote = new MediaStream();
      receive.ontrack = e => remote.addTrack(e.track);
      const sender = send.addTrack(media.getAudioTracks()[0], media);
      window.vcPeerConnections = { remote: send };
      await send.setLocalDescription(await send.createOffer());
      await waitFor(() => send.iceGatheringState === 'complete', 'sender ICE gathering incomplete');
      await receive.setRemoteDescription(send.localDescription);
      await receive.setLocalDescription(await receive.createAnswer());
      await waitFor(() => receive.iceGatheringState === 'complete', 'receiver ICE gathering incomplete');
      await send.setRemoteDescription(receive.localDescription);
      await waitFor(() => send.connectionState === 'connected' && remote.getAudioTracks().length, 'local WebRTC peers did not connect');
      const monitor = new NativeContext(); await monitor.resume();
      // Keep both measurement graphs connected to an active rendering destination.
      // The zero-gain sink prevents the fixture from playing its microphone aloud.
      const sink = monitor.createGain(); sink.gain.value = 0; sink.connect(monitor.destination);
      const attachMeter = stream => {
        const analyser = monitor.createAnalyser(); analyser.fftSize = 2048;
        monitor.createMediaStreamSource(stream).connect(analyser); analyser.connect(sink);
        return analyser;
      };
      const rawAnalyser = attachMeter(new MediaStream([media.getAudioTracks()[0]]));
      const analyser = attachMeter(remote);
      const measure = async meter => {
        const data = new Float32Array(meter.fftSize); let max = 0;
        for (let i = 0; i < 4; i++) { meter.getFloatTimeDomainData(data); max = Math.max(max, Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length)); await sleep(25); }
        return max;
      };
      const trackInfo = track => track && ({ id: track.id, label: track.label, kind: track.kind,
        enabled: track.enabled, muted: track.muted, readyState: track.readyState, settings: track.getSettings() });
      const stats = async pc => Array.from((await pc.getStats()).values()).filter(s =>
        ['media-source', 'outbound-rtp', 'inbound-rtp', 'remote-inbound-rtp', 'transport', 'codec'].includes(s.type));
      const diagnostics = async () => ({ state, muted, monitorState: monitor.state,
        monitorTime: monitor.currentTime, officeOn: window.vcOfficeModeOn(),
        officeContexts: window.__officeContexts.map(c => ({ state: c.state, currentTime: c.currentTime })),
        localTrack: trackInfo(media.getAudioTracks()[0]), senderTrack: trackInfo(sender.track),
        receiverTracks: remote.getAudioTracks().map(trackInfo),
        sendState: send.connectionState, receiveState: receive.connectionState,
        rawRms: await measure(rawAnalyser), remoteRms: await measure(analyser),
        senderStats: await stats(send), receiverStats: await stats(receive) });
      // Wait for PCM readiness, not a fixed delay after connection/replaceTrack.
      // Require three consecutive windows, keeping the original audible/silent thresholds.
      const waitAudio = async (meter, audible, message, faultStarted) => {
        const deadline = faultStarted === undefined ? performance.now() + 5000 : faultStarted + 900;
        let consecutive = 0, stablePeak = 0, last = null;
        while (performance.now() < deadline) {
          last = await measure(meter);
          if (faultStarted !== undefined && !window.vcOfficeModeOn()) break;
          if (audible ? last > 0.005 : last < 0.0001) {
            consecutive++; stablePeak = Math.max(stablePeak, last);
            if (consecutive >= 3) { checks.push(message); return stablePeak; }
          } else { consecutive = 0; stablePeak = 0; }
        }
        throw new Error(message + ' ' + JSON.stringify({ lastRms: last, consecutive, diagnostics: await diagnostics() }));
      };
      const raw = await waitAudio(rawAnalyser, true, state + ': fake microphone produces real PCM');
      const rawRemote = await waitAudio(analyser, true, state + ': remote peer decodes raw microphone before office mode');
      check(await window.vcSetOfficeMode(true), state + ': office mode enables');
      const processed = media.getAudioTracks()[0], context = window.__officeContexts.at(-1);
      await waitFor(() => sender.track === processed, 'sender did not receive processed audio');
      const before = await waitAudio(analyser, true, state + ': remote peer actually decodes office audio');
      if (muted) { processed.enabled = false; await waitAudio(analyser, false, state + ': remote peer is silent after user mute'); }
      // Block only resume, so native suspension/closure really interrupts the PCM chain.
      context.resume = () => Promise.reject(new Error('test: resume unavailable'));
      const started = performance.now();
      if (state === 'closed') await context.close();
      else {
        await context.suspend();
        if (state === 'interrupted') { Object.defineProperty(context, 'state', { configurable: true, get: () => 'interrupted' }); context.dispatchEvent(new Event('statechange')); }
      }
      const during = await waitAudio(analyser, false, state + ': suspended engine really stops decoded audio before fallback', started);
      await waitFor(() => !window.vcOfficeModeOn(), state + ': office mode did not fall back');
      await waitFor(() => media.getAudioTracks()[0] !== processed && sender.track === media.getAudioTracks()[0], state + ': sender not restored');
      const restored = media.getAudioTracks()[0];
      check(restored.readyState === 'live' && restored.enabled === !muted, state + ': restored track preserves mute');
      check(restored.getSettings().deviceId === selected, state + ': selected microphone is preserved');
      check(restored.getSettings().autoGainControl !== false, state + ': microphone AGC restored');
      check(localStorage.getItem('mangoi_vc_office') === '1' && localStorage.getItem('mangoi_vc_mic_id') === 'saved-device-preference', state + ': saved preferences unchanged');
      const elapsed = performance.now() - started;
      const after = await waitAudio(analyser, !muted, state + ': remote decoded audio recovers only when unmuted');
      const count = window.__officeContexts.length;
      window.showView('view-videocall-call'); await sleep(600);
      check(!window.vcOfficeModeOn() && window.__officeContexts.length === count, state + ': showView cannot automatically re-enable failed mode');
      measurements.push({ state, muted, raw, rawRemote, before, during, after, recoveryMs: Math.round(elapsed) });
      send.close(); receive.close(); await monitor.close(); media.getTracks().forEach(t => t.stop());
    }
    check(window.__errors.length === 0, 'no unhandled resume rejection or peer errors', window.__errors);
    return { checks, measurements, browser: navigator.userAgent };
  })()`);
  for (const message of result.checks) { pass++; console.log(`  ✅ ${message}`); }
  console.log(JSON.stringify({ browser: result.browser, measurements: result.measurements }, null, 2));
  assert.equal(result.measurements.length, 6);
  console.log(`\nPASS ${pass} / FAIL 0`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
