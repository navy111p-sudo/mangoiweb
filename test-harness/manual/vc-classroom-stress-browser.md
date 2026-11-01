# Classroom connection stress verification

Run only against a local checkout. No production credentials, database bindings or real classroom are needed.

## Deterministic faults

`node --test test-harness/vc_ice_fault_stress_harness.mjs`

500 seeded schedules execute the shipped ICE loader in Node VM with a virtual clock. Half start without credentials and fail before recovery. Each schedule also exercises four expired-credential failure/recovery cycles, with 2–20 concurrent callers. Faults: stalled headers, stalled body, HTTP failure, network rejection, malformed JSON and invalid ICE lists. Assertions cover bounded completion, shared requests, preservation of prior configuration, successful retry and deadline cleanup. This is a deterministic model, not a network emulator.

## Sandboxed Chromium

Install playwright-core outside the checkout and set `PW_DIR` to that directory. Set `CHROME_EXECUTABLE` to the installed Chromium/Chrome executable (or use the existing `_pw.mjs` discovery).

Run `node test-harness/manual/vc-classroom-stress-browser.mjs` with:

- `STRESS_OUTPUT`: evidence directory (browser-stress.json).
- `ENTRY_ROUNDS`: entry iterations, default 100.
- `RTC_ROUNDS`: real RTP/ICE restart iterations, default 100.
- `ENTRY_ROLE`: student (default) or teacher. For teacher-only coverage use ENTRY_ROUNDS=50 and RTC_ROUNDS=0.

Chromium sandbox is enabled. Browser-context HTTP routes serve checkout files and synthetic API responses; external HTTP and all WebSockets are denied. No live site or DB request is made by the fixture. This is browser sandboxing and route isolation, not an OS-wide network namespace.

Entry checks execute the shipped page and click its entry control, using fake camera/microphone devices and a mock signaling transport. They verify room resolution, media acquisition, request counts, track ownership and JavaScript errors. They do not assert a real server has admitted both parties.

Transport checks use real RTCPeerConnection instances with no STUN/TURN servers and real synthetic tones. They run the shipped vcTuneAudioSdp function, verify bilateral received packets and nonzero decoded waveform RMS, restart ICE and verify credentials rotate and audio continues. Signaling delays vary from 0 to 120 ms. Every fifth iteration mutes/restores each sender separately and verifies the opposite receiver follows the change. Audio is decoded through WebAudio into a zero-gain destination, not played through the user's speakers.

Chrome 155 in the tested environment reported inbound totalAudioEnergy=0 even while the decoded receiver waveform had RMS about 0.085. Therefore the assertion uses decoded waveform RMS and RTP increments, with mute controls; the raw energy statistic is retained as evidence rather than interpreted as silence.

## Limits

Loopback RTP is not China cross-border routing. Tests do not emulate real packet loss/jitter, real TURN TLS/UDP reachability, device-specific playback/autoplay restrictions, production authentication or live signaling. No number of local passes proves all future classes are disruption-free. Report the tested commit and results alongside those limitations.
