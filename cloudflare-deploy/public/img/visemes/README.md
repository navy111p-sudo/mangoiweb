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
