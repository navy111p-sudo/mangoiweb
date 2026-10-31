# MANGOI WebRTC Reliability Lab

## Goal
Build on the existing v15/fast recovery without replacing it. Separate production observation from destructive network testing.

## Safety rules
- Never inject latency, packet loss, bandwidth limits, disconnects, black frames, or ICE failures into production classes.
- Preserve manual camera-off privacy, AAO, staged recovery, and the current peer-rebuild budget.
- Do not loop restartIce or make full PeerConnection rebuild the first recovery action.
- Any network impairment runner must require an explicit sandbox/test environment flag and test accounts.
- AI may propose code changes, but production merge/deploy remains human-approved.

## Harness dimensions
Every quality session should be classifiable by:
- endpoint role: student / teacher
- teacher network: HOME / OFFICE / UNKNOWN
- path: direct / relay / mixed / unknown
- TURN endpoint/protocol when observable
- server-observed coarse network prefix/ISP/country (existing privacy-preserving fields)
- browser/device/network type when reliably observable

Do not infer HOME/OFFICE from IP alone. Source it from trusted teacher/admin metadata. Until that metadata is wired, record UNKNOWN.

## Existing baseline to preserve
The repository already has:
- receiver-side getStats telemetry and 60-second quality summaries
- receive video freeze/stall detection
- bounded staged recovery and manual-camera-off protection
- direct/relay/TURN path telemetry
- coarse network prefix/ISP/country logging
- WebRTC recovery harnesses and a real Chromium RTCPeerConnection harness

## Phase 1 — production-safe observability
1. Add teacher_network_type = HOME | OFFICE | UNKNOWN to the quality telemetry schema.
2. Populate it only from trusted server-side teacher metadata.
3. Add structured recovery counters/timings to the quality summary: incident count, recovery success, recovery duration, highest recovery level.
4. Extend the admin quality view so HOME and OFFICE can be compared without exposing raw IPs.
5. Add regression tests proving missing metadata remains UNKNOWN and cannot be spoofed by the public quality-log body.

## Phase 2 — sandbox runner
Create a separate sandbox runner that never targets production rooms. Test:
- normal baseline
- latency 100/200/300 ms
- packet loss 1/3/5/10%
- jitter
- bandwidth limitation
- temporary disconnect
- receive video stall/black-frame-like failure
- audio-only survival
- ICE disruption
- relay/TURN path
- staged recovery

Run the same matrix for HOME and OFFICE profiles. Record connect success, freeze duration, audio concealment/loss, recovery success, recovery duration, restartIce count, renegotiation count, rebuild count, and direct/relay path.

## Phase 3 — root-cause classifier
Output evidence, not guesses:
- OBSERVED_FACTS
- HYPOTHESIS
- EVIDENCE
- REQUIRED_VERIFICATION
- PROPOSED_FIX

Useful categories:
STUDENT_NETWORK, HOME_TEACHER_NETWORK, OFFICE_TEACHER_NETWORK, COMMON_WEBRTC, SIGNALING, STUN_TURN, SERVER, INTERNATIONAL_ROUTING, BROWSER_DEVICE, UNKNOWN.

## Acceptance
- Current fast/recovery harness baseline must not regress.
- Manual camera OFF is never overridden.
- Healthy audio must not trigger unnecessary ICE restart/rebuild for video-only stalls.
- No destructive sandbox impairment can execute against a production room.
- HOME/OFFICE is server-trusted, not client-asserted.
- Before/after measurements are attached to the PR before deployment.

This document is the implementation contract for the MANGOI Harness + Sandbox reliability project.
