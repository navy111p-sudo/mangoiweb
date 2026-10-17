# Registered mouth patches

Generated with Higgsfield GPT Image 2.5, 2026-10-16, using the shipped portraits as references.

- Lily atlas job: ec4c2cec-6f04-4237-9349-86a9b8bf4ff9
- Noah atlas job: 825bf0d1-010a-497b-a706-bd50066edf3c
- Emma atlas job: b1bfb747-bdd5-48e5-bac7-ad41a5c3309c
- Jake request 53c481db-b996-43f0-ad4f-1c7d41ba85b2 was rejected by the generation service. Its original assets remain in use; their three existing poses now use the audio cue clock. An additional built-in image editor also rejected the same identity-preserving request.

Each atlas uses row-major X,A,B,C,D,E,F,G,H. Only a registered mouth ellipse changes; hair, eyes, clothing and transparency remain from the original portrait. `tools/build-viseme-poses.py` performs SIFT/RANSAC registration and composites only that ellipse. Full intermediate portraits are not shipped.

Current renderer deliberately substitutes B for G and C for H: the generated F/V tooth contact and L tongue positions have not passed visual QA. These are approximate visemes, not proof of correct articulation.

Emma's base is frame 3.3s of the existing teacher-avatar.mp4, with the same green-removal thresholds as mango-avatar.js. This avoids cutting a closed mouth into the original wide-open still's jaw.

Rhubarb/PocketSphinx through lip-sync-engine 1.0.3 provides audio-derived cue timing. Accuracy is not guaranteed. Initial model loading, unavailable Worker/WASM, malformed/long audio and analysis failures retain existing amplitude animation. Model files are pinned public CDN assets; audio is processed locally and is never uploaded by the analyzer.


## Final refinement (2026-10-16)

The user authorized replacing Emma while retaining her name and voice. Her new fixed portrait/atlas comes from Higgsfield job c4383beb-5118-4ce4-867f-c9f627daedf6. `emma-v2-*` is the active identity; the old Emma assets remain archived for compatibility. Her chooser thumbnail uses the same new face.

Lily F/V refinement: 23ee7c72-9059-40b9-8635-39bf538b0d85. Lily L refinement: ac918213-9b5a-4c01-be51-fd9f4a8f0f58. Noah G/H: 78be6c68-8647-447c-9d48-ea61505dbd7e. New Emma G/H: 74555744-21e5-4f7c-b125-4aa2d18c90db. These were generated using Nano Banana 2.1, then registered and composited with `tools/replace-viseme-patch.py`. Their tooth/lip contact and raised-tongue shapes passed visual review and are now active. This supersedes the earlier G/H substitution note above; it is not a guarantee of phoneme recognition accuracy.

The learning/friend playback paths now await mouth-cue preparation before starting audio. First use may wait for the approximately 37MB model. Errors/timeouts still permit audio playback with approximate fallback animation. Cancellation sequence guards prevent a delayed prepared clip from playing after the user stops it. Existing three-pose characters also follow cue timing, with limited articulation shapes.

## Coarticulation shapes (2026-10-16)

`tools/build-viseme-transitions.py` derives four optical-flow inbetweens for every ordered pair of different anchors. Each of Emma, Lily and Noah has 9 anchors plus 288 inbetweens (297 shapes, 891 across the three actors). This is **not** 297 phonemes or increased recognition vocabulary. `transitions.json` records dimensions, counts and source hashes. Dependencies: Python, Pillow, NumPy, OpenCV (DIS optical flow).

The 18-column transition sheets contain `(from*8 + (to<from ? to : to-1))*4 + step-1`, where `from/to` are XABCDEFGH indices and `step` is 1–4. The renderer samples them from the same audio clock as anchor cues. The coarticulation window is at most 80ms and at most 40% of either neighboring cue. It never crosses silence or an audio gap. M/B/P anchor A remains fully closed until its end; its opening release starts afterward, and transitions into A are omitted. Several generated transitions are consequently never used, deliberately preserving closures and silence.

Only the current actor's transition sheet is retained by the avatar cache. Files total under 2MB compressed; a decoded active sheet uses approximately 23MB at most. Loading errors keep the nine anchor shapes available. Nine-pose analysis and these intermediate shapes still cannot guarantee perceptually exact articulation. Short transitions were visually inspected; the browser harness checks actual transition-sheet drawing at three playback rates and both phone and desktop widths.

## Living face — blink, brow lift, breathing (2026-10-17)

`lily-eyes.webp` / `noah-eyes.webp` are 3-column eye+brow atlases: 0 half-closed, 1 closed, 2 brows raised. Built by `tools/build-eye-patches.py` from Higgsfield Nano Banana 2 generations of the shipped portraits (Lily 163d1697 · 0c8e873b · af0583e5, Noah ba26cb0f · ac1c3061 · ea60c5ee). Only two feathered eye+brow ellipses are composited; every pixel outside them is the original portrait. Registration candidates (nominal scale, SIFT/RANSAC, ECC refinements) are scored by the mean grey difference on the skin ring around the eyes, and the lowest wins — SIFT alone pointed two Noah poses at the background (white/black blobs in the first preview). Final ring errors: Lily 2.09/2.49/4.10, Noah 2.38/2.30/9.40 (grey levels). Changed pixels stay in horizontal tenths 2–4 (eye band).

`mango-avatar.js` v10 draws the tile right after the base portrait (precise and image paths), blinks every 2.2–6 s (sometimes twice), raises brows briefly on loud (wide-mouth) moments while speaking, and adds a CSS breathing animation (`mg-alive`, honours prefers-reduced-motion). The `EYES` rect must equal the rect printed by the builder; `test-harness/avatar_living_face_harness.mjs` cross-checks both.

v11 (2026-10-18) adds `emma-eyes.webp` / `mei-eyes.webp` / `long-eyes.webp` the same way (Emma f959b724 · d288956e · 7e9ab0c5, Mei 89ef7b43 · 34f82c5b · 12a387c3, Long 0f31cafd · 39a04952 · 2c418d57). Emma's rect is in her 512x640 `emma-v2-rest.webp` pixels; Mei and Long use 640x800. Final ring errors: Emma 1.83/5.14/2.63, Mei 1.92/2.85/3.28, Long 1.63/1.88/2.96; changed pixels only in tenths 2–3. The atlases were cut from the closed-mouth portrait; the eye region of the mid/wide mouth frames differs from it by 0 (Emma), at most 9 (Mei) and about 6 on average (Long) grey levels, so the tile also sits on those frames without a visible edge. Only the video characters (Jake, emma_classic) have no eye atlas.

v12 (2026-10-18) adds `jake-eyes.webp` for the video character Jake. No image generation was used (Jake identity generation was rejected before): the three tiles come from Jake's own `hero-avatar.mp4` frames, extracted at 25 fps — base f_081 (3.2 s, the `closed` pose, eyes open), half-closed f_020, closed f_016 (the video's natural blink); the brow tile is the base itself (Jake has no raised-brow art, so `brow:false` turns the brow lift off). Rect [160,207,194,66] is in the 512x512 video pixels. Ring errors 7.14/7.78/0; changed pixels only in tenths 4–5 (eye band). The tile is drawn only while the video is paused on a pose, not seeking and not inside a clip, and only for the `closed`/`medium` poses or the untouched first frame: an eye-region ECC fit puts those within about 1 px of the base, while `wide` (3.5 s) tilts the head about 1° and moves the eyes 2–4 px, so `wide` is skipped (`eyeTiers`). While the video plays (speechSynthesis talk) its own blinks show. Now only `emma_classic` has no eye atlas.
