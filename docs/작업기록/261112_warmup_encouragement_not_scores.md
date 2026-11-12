# AI speaking encouragement must not look like a score

The owner reported that children saw 100/good-job feedback even when their voice was not understood. The deployed warmup page's cheerFly function can display the hundred-points emoji without receiving any audio or evaluation. This reproduces a misleading display, not proof of the reported microphone failure.

Replace that emoji and ability claims in combo milestones with participation encouragement. Label the chip as encouragement and explain that it is not a pronunciation/accuracy score. Preserve combo mechanics, evaluation, recording and rewards.

Validation: warmup_honest_mode_harness passed 134 checks. Full local suite was attempted but this sparse checkout lacks vendor assets and dependencies; GitHub CI remains the merge gate. Browser attempts were blocked by missing bundled Chromium and then the system Chromium socket permission (Operation not permitted). No real-device microphone verification performed.

Avoided changing score thresholds or speech recognition without evidence of the reported failure. Rollback is limited to the warmup display strings.
