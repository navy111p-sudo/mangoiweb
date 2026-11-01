# mangoi.ai EP02 — dubbing content v3 (cast locked)

The user's approved cast for episode 2 is now:
- **Kai** (`kai`): Korean boy, short neat black hair, teal hoodie
- **Emma** (`emma`): Western girl, blonde hair with coral hairclip, coral sweater
- **Maya** (`maya`): Black girl, two natural curly puff buns, bright yellow astronaut jacket
- **Pip** (`pip`): small lavender alien with three rounded antenna tips, turquoise eyes, orange belt

Characters may differ from episode 1; they **must not change within episode 2**.

## Story and timing

Six scenes, 240 seconds total, **48 English/Korean lines**. Every role gets **exactly two lines per scene**. Provisional line times comply with the 0.3-second minimum line separation and word-count timing rule, but **must be resynchronized to real mouth motion before publication**.

The previous clip-by-scene mapping in `production-manifest.json` is superseded by the actual 16 generation prompts:

| Scene | Clips | Duration |
|---|---|---|
| 1: A Signal From Space | 1, 2, 3 | 45 s |
| 2: The Secret Spaceship | 4, 5, 6 | 45 s |
| 3: The Broken Controls | 7, 8, 9 | 45 s |
| 4: Pip's Secret | 10, 11 | 30 s |
| 5: Escape the Vortex | 12, 13, 14 | 45 s |
| 6: Back to Earth | 15, 16 | 30 s |

## Critical unfinished items

- Sixteen original clips were requested with **Sofia**, a Latina girl, rather than the newly approved **Emma**, a Western girl. They are **reference-only**, not final/approved. Do not silently rename Sofia's voice or on-screen character to Emma without visual correction.
- The 10-second experimental clip `f3a0fce7-ed57-4fee-8659-a0a04a5b6573` also does **not** satisfy the approved final cast.
- Source MP4 URLs are temporary. Actual binaries, merged six scene videos, 48-kHz character voice WAV stems, BGM/SFX stems, thumbnails, and lip-sync quality assurance **remain outstanding**.
- Do not publish or switch on the EP02 card in `/ai-dubbing.html` until all assets and the episode1-equivalent listen → mute-and-record → group-presentation flow are validated.
- Preserve episode 1 and all other site functions.

The 6-scene, 48-line revised `episode.json`, `characters.json`, `video-sources.json`, static validation output, and bilingual script CSV were delivered in the separate conversation ZIP `mangoi_ai_dub002_cast_locked_v3.zip`. This repository note is a production specification, **not proof that those video/audio files have been supplied or integrated**.
