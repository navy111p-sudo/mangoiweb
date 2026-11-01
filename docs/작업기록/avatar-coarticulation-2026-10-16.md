# Hundreds of mouth transition shapes

The user requested hundreds of mouth shapes and closer pronunciation matching in AI speaking and friend chat. Added 288 reproducible optical-flow inbetweens to each reviewed nine-pose Emma/Lily/Noah atlas: 297 rendered shapes per actor, 891 total. Source identities and voices are preserved.

Independent portrait generation for every frame was avoided because it changes teeth, jaw and identity between frames. Mouth-only bidirectional optical flow keeps the rest of the portrait fixed. These are intermediate shapes, not hundreds of new phoneme classes. Timing still depends on Rhubarb/PocketSphinx recognition; fallback and three-pose characters remain approximate.

Coarticulation uses audio.currentTime with bounded cue-relative windows. Silence, gaps, pause, buffering and stop stay closed immediately. M/B/P closures cannot open early. Only the active actor's decoded sheet is retained to bound memory. Missing transition assets fall back to reviewed anchors.

Validation: pure timeline tests cover anticipation, release, closure boundaries, gaps and sheet indexing. Real Chromium canvas tests cover three actors, three playback rates and phone/desktop widths, including actual intermediate rendering and delayed asset preparation. Optical-flow D-to-F previews were inspected for all three actors. Full CI and deployment evidence are recorded in the pull request.
