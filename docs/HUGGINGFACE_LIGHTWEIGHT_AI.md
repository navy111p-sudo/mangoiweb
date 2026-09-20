# MangoAI Hugging Face lightweight AI

## Deployment status and activation hold (2026-09-18 review)

PR #1017 is merged, but its Node/Express files (`modules/`, root `public/`,
`server.js`) are legacy, not the production Cloudflare application. Repository
maintenance rules prohibit modifying or deploying that legacy application.
The Cloudflare deployment does not demonstrate that Hugging Face is active.

Do not enable this PoC or describe an AI-disabled call as an AI safety pass:
- The legacy HTML requests `lightweight-ai.js`, while the file is `ai-lightweight.js`.
- The legacy API lacks caller authentication and request limiting.
- Unknown RTT is permitted, and recording/request overlap is not fully guarded.
- #1017 also changes legacy WebRTC recovery code, despite its original description.

Production integration is a separate change requiring authenticated internal-only
access, a default-off flag, bounded requests, verified active-peer quality and
recording cleanup. Never copy the legacy WebRTC recovery implementation into the
production call path as part of enabling AI.

Acceptance requires evidence of a real HF request and response first, followed by
the same Korea–Philippines call with AI off / five short clips / AI off. Record
audio interruptions, reconnects, RTT, interval packet loss and CPU/memory. Exercise
AI timeout, unavailable service, repeat clicks and degraded call quality. Any
reproducible AI-triggered call interruption blocks activation. These live tests
have not been performed by this code review.

## Goal
Add AI without putting the teacher/student WebRTC call at risk.

## Safety rules
- Never send the live WebRTC video stream to Hugging Face.
- Only process short, user-triggered pronunciation clips (max 2 MB).
- AI requests have a short timeout and fail open: the class continues when AI fails.
- The browser helper skips AI when the peer connection is not connected or RTT is >= 350 ms.
- `HF_API_TOKEN` stays server-side only.

## Environment
- `HF_API_TOKEN`: Hugging Face token. If absent, AI is disabled.
- `HF_ASR_MODEL`: optional ASR model, default `openai/whisper-small`.
- `AI_TIMEOUT_MS`: optional server timeout, default 4500 ms.

## Endpoints
- `GET /api/ai/health`
- `POST /api/ai/pronunciation` with multipart field `audio`

## Rollout
1. Keep this behind a feature flag/UI trigger and test with internal accounts.
2. Measure WebRTC RTT, packet loss, reconnects, CPU and memory before/after.
3. Connect only the existing pronunciation/escape-room action to `MangoAI.LightweightAI.transcribeShortClip()`.
4. If call quality worsens, disable AI without changing the WebRTC path.
5. Add post-class summaries only after pronunciation PoC is stable.

## Important
The sections above describe the PoC design, not verified production behavior.
Production activation remains on hold until the missing controls and live-call
acceptance checks are completed.
