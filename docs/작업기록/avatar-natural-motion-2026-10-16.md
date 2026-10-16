# Natural lip closure and release

User requested more natural mouth motion. Existing transitions skipped rest and bilabial closures, creating abrupt jumps at speech boundaries.

- Ease into A/X during the preceding spoken cue (maximum 60 ms), reaching closure by onset.
- Release A/X only after the next spoken cue starts (maximum 50 ms).
- Treat missing cues and first/last boundaries as silence; retain immediate silence/pause/cancel closure.
- Smoothstep easing keeps transitions gentle without adding a wall-clock animation or playback delay.
- Reuse the existing reviewed mouth atlases; no additional generated faces or credits needed.
- Bump AvatarVisemes to v4 in all five consumers and register its asset hash.

Validation: timeline/closure/gap/seek tests and playback/buffering/cancel tests passed locally. Local browser harness skipped because Chromium is unavailable; GitHub browser CI is required before merge. This change improves motion continuity, not phoneme recognition accuracy or a guarantee of perfect perceptual sync.
