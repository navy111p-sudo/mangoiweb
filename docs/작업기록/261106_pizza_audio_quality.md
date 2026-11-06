# Grammar Pizza listening audio adjustment (2026-11-06)

User reported quiet, unclear English in the pizza listening mission.
The level-one server recording was played at 0.72 speed, and browser fallback preferred Zira before natural voices. These are code findings, not a listening diagnosis.

Changed only the pizza game: speed range 0.90–1.06, natural browser voices first, explicit full media/synthesis volume, and a 1.6 gain followed by a dynamics compressor for server audio. The AudioContext resumes during the user click; unsupported browsers keep plain Audio. Android native TTS and Chinese server routing remain available.

Rejected changing shared TTS/server providers because this report concerns one game and provider changes affect other learning pages. Gain alone would increase clipping risk, so compression follows gain. No production requests, database changes, or deployment were performed.

Validation: pizza_audio_quality_harness.mjs executes the actual page functions with simulated audio nodes; voice selection, speed, gain wiring, stop, unsupported Web Audio fallback and synthesis volume passed. TypeScript noEmit passed. Full fast regression result is recorded in .codex/pizza-audio-verify.log. Actual browser playback and human listening remain unverified; numerical settings do not establish audio quality.

Fast regression completed: PASS 348 / FAIL 2 / SKIP 20, exit 1. Failures: class_room_override_harness.mjs and meet_room_code_harness.mjs both construct an invalid Windows C:\C:\ path and throw ENOENT before assertions. These untouched harnesses were not changed in this task.
