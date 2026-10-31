# Read-only voice provenance / 2026-10-20

EP01 actual runtime path: `POST /api/voice/tts`, `cloudflare-deploy/src/api-games.ts:2531`. Cloudflare Workers AI binding, Deepgram Aura2 English → Aura1 fallback → MeloTTS/device fallback. EP01 Jun=apollo, Mina=thalia, Rex=arcas; no pre-rendered voice stems in manifest. Calling the endpoint may consume Workers AI allocation; no request was sent. These labels are NOT Higgsfield voice IDs.

EP02 owned completed generation history and PR characters.json agree:

| Role | Actual model | Exact voice parameter | Example completed WAV job |
|---|---|---|---|
| Kai | inworld_text_to_speech | Evan (en) | 8bb55f3d-ec22-4199-969f-ca2d99974ad9 |
| Emma | inworld_text_to_speech | Abby (en) | 7dc7a8cb-f9f8-4d25-bcd2-14a8463d4eb1 |
| Maya | inworld_text_to_speech | Amina (en) | 34142688-43ca-4dbb-b9da-8cee4f25512f |
| Pip | inworld_text_to_speech | Pixie (en) | cf3e7ac8-bd7c-4792-b62e-d755e2ab9498 |

`ep02-voice-provenance.json` contains exact authorized WAV URLs and 25 completed jobs (including a duplicate/retry for Pip), with original two-line texts. These are source utterances, not necessarily final 40/45-second timeline stems. Do not reuse mismatched EP02 speech as EP04 dialogue.

Current model search confirms those four voice strings as supported enum values; model description is **Game pipeline only**. This is not permission to invoke an undocumented endpoint. Media agent must verify a supported generation route. New voice generation needs pricing/approval under parent's separate audio-cost restriction. Another preset named Evan in seed_audio is not evidence of acoustic identity with Inworld Evan. Do not silently switch engines or voices.

Commercial-use terms remain subject to the user's provider agreement; ownership/history alone is not a full license audit. No credentials were accessed, no external API called for synthesis, no credits spent.
