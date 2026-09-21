# BTS / SIU visual practice continuation

## Implemented
- Restored and checked the prior local work against remote checkpoint 58f6115.
- 85 existing source practice sets, 4,546 distinct word forms, 4,469 picture-linked forms, 1,406 distinct image assets, 43 distinct video URLs. These are file-derived counts, not a count of visually verified word definitions. Context pictures can be shared across words.
- On-demand manifest and one selected book; at most three books cached; no eager video request. Maximum book JSON 337,652 bytes, gzip 29,688 bytes.
- Cancel stale book requests, retry after 15 seconds, prevent duplicate completion/review reward, blank the selected-book example in quizzes, release hidden video sources. A stalled play promise now falls back after 15 seconds and late completion cannot reopen it.
- Entry card between the hero and original adventure controls. Learner level, course, practice set, word/sentence mode, practice section and challenge difficulty. Easy sentence tasks use one missing word with initial hint; standard uses sentence initials; challenge asks for the full sentence. Learner level orders shorter/longer tasks; explicit difficulty overrides automatic scaffolding. This is a heuristic, not a standardized CEFR assessment or student profile integration.

## Source limitation / lesson mapping
The source files have 100 sentences per named set and no verified textbook lesson boundaries. SIU source topics are known not to match the sentence pool. The new UI identifies SIU as supplementary practice, removes misleading topic titles from its dropdown, and labels source-position groups of 10 as practice sections, explicitly NOT verified textbook lessons. Exact textbook lesson selection remains outstanding and requires an authoritative lesson-to-sentence map. No fabricated lesson or CEFR labels were added. Existing speech-coach data was not changed.

## Verification
- scene_curriculum_harness: 240,285 assertions passed (actual source membership, budgets, cancellation/races, fallback, grading, source-section filtering, easy/standard/challenge answers).
- scene_curriculum_ui: 56 checks passed.
- existing scene_quest_harness: 354 assertions passed.
- JS syntax check passed.
- Version harness: 4 available local assets matched; 13 unrelated referenced assets missing from the partial checkout. New JS/CSS use v2; no update/bypass flag used. Full CI is still required.
- Browser navigation to local preview was rejected with ERR_BLOCKED_BY_CLIENT. No actual screen/mobile/media-network verification completed.

## Remaining before production
- CI, real browser flow and mobile layout; media reachability and final visual QA.
- Authoritative textbook lesson mapping (current practice sections are not textbook lessons).
- Do not describe 85 sets as 85 verified textbook volumes, or picture coverage as semantic accuracy.
