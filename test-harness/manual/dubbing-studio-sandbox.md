# Kiki & Toto recording/export sandbox

The browser harness runs the real studio HTML against a local server. It does not
replace MediaRecorder, microphone capture, IndexedDB or browser downloads. External
requests are blocked. Production media URLs resolve to short local fixtures so the
37 actual episode/role combinations can each run six scenarios (222 total):

1. Record all selected lines, reload, export and download.
2. Cancel an export and immediately restart it.
3. Double-click the export button.
4. Cancel during the completion tail and restart.
5. Replace an existing recording.
6. Move to another line while recording and check the original recording key.

Every result checks downloaded video/audio streams and audible audio in the second
half. Merely finding an audio track would miss the restart regression, where an
eight-second video had only 1.3 seconds of audio.

Install Playwright in the usual test environment and provide a Chrome executable
through `CHROME_PATH` if Playwright's bundled Chromium is unavailable. `PW_DIR`
may point to a directory containing `node_modules/playwright`.

Create fixtures in a scratch directory (requires ffmpeg):

```sh
mkdir -p work/studio-fixtures
ffmpeg -y -f lavfi -i testsrc2=size=320x180:rate=20 -t 0.3 -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart work/studio-fixtures/scene.mp4
ffmpeg -y -f lavfi -i sine=frequency=523:duration=0.18:sample_rate=48000 work/studio-fixtures/voice.wav
ffmpeg -y -f lavfi -i sine=frequency=317:duration=20:sample_rate=48000 work/studio-fixtures/speech-mic.wav
ffmpeg -y -i work/studio-fixtures/scene.mp4 -frames:v 1 work/studio-fixtures/poster.jpg
node test-harness/manual/dubbing-studio-sandbox.cjs
```

For speech input, replace `speech-mic.wav` with a continuous speech WAV. Fixtures
and results can be redirected with `STUDIO_TEST_MEDIA` and `STUDIO_TEST_OUT`.
`STUDIO_PUBLIC_ROOT` selects a different checkout's `public` directory.
`CANCEL_ONLY=1` isolates the original restart failure. `RESUME=1` preserves passing
cases in the output directory and reruns unfinished/failed cases; retain the earlier
progress file when diagnosing an initial failure.

The fast CI harness `dubbing_studio_export_harness.mjs` executes the actual inline
callbacks with deliberately reordered completion events and checks that restoring
the old mutable-destination access makes the regression test fail.
