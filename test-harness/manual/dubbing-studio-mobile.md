# Mobile dubbing checks

`dubbing-studio-mobile.cjs` runs the real studio against the same local fixture
server as `dubbing-studio-sandbox.cjs`. Use the fixture and dependency setup from
`dubbing-studio-sandbox.md`; the environment variables are the same.

The default run is **444 cases**: 37 actual episode/role pairs, six scenarios,
and two Android Chrome emulation profiles (Galaxy S9+ and Pixel 7). It uses touch
input, a narrow viewport, the browser's default autoplay policy, real
MediaRecorder/IndexedDB/downloads, and synthetic microphone speech. The final
scenario also rotates between portrait and landscape. It checks that canceled
and completed exports release all their own capture tracks, and that downloaded
videos decode with audible audio in the second half.

```sh
STUDIO_TEST_OUT=work/mobile-results node test-harness/manual/dubbing-studio-mobile.cjs
```

`MOBILE_SMOKE=1` limits the run to Toto/picnic (12 cases across the two profiles).
`STUDIO_WORKERS=1` through `6` controls concurrency. `RESUME=1` resumes passing
keys from the selected output directory; retain the original failure logs.

`dubbing-studio-mobile-recovery.cjs` starts its own fixture server on port 8902.
It first denies microphone permission and verifies the retry after permission is
granted, then runs 200 native recorder cancel/error/retry cycles in one page.
Each cycle checks that both capture tracks have ended, the recording overlay is
hidden, playback is stopped, and the next export can start. Encoder errors are
deliberately injected; this does not claim a hardware encoder failed in a phone.

```sh
STUDIO_TEST_OUT=work/mobile-recovery node test-harness/manual/dubbing-studio-mobile-recovery.cjs
```

These are desktop browser emulations, not physical Galaxy/Pixel devices. An
iPhone user-agent in Chrome does not test Safari. Windows Playwright WebKit
currently lacks getUserMedia, MediaRecorder and canvas captureStream in this
environment, so its iPhone viewport can cover UI/touch/layout and unsupported
API messaging, but cannot validate recording or video export. Real iPhone Safari
and Android hardware microphone, interruptions, and Files/Gallery save behavior
require connected devices and are explicitly unverified by this harness.
