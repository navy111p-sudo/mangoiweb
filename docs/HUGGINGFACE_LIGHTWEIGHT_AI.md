# MangoAI Hugging Face lightweight AI

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
This branch adds the isolated AI gateway and browser helper. It intentionally does not alter the live media path or automatically enable AI during calls.
