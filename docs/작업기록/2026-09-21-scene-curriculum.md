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
- scene_curriculum_ui (지금 이름 scene_curriculum_ui_harness): 56 checks passed.
- existing scene_quest_harness: 354 assertions passed.
- JS syntax check passed.
- Version harness: 4 available local assets matched; 13 unrelated referenced assets missing from the partial checkout. New JS/CSS use v2; no update/bypass flag used. Full CI is still required.
- Browser navigation to local preview was rejected with ERR_BLOCKED_BY_CLIENT. No actual screen/mobile/media-network verification completed.

## Remaining before production
- CI, real browser flow and mobile layout; media reachability and final visual QA.
- Authoritative textbook lesson mapping (current practice sections are not textbook lessons).
- Do not describe 85 sets as 85 verified textbook volumes, or picture coverage as semantic accuracy.

## Follow-up: administrator screenshot and actual catalog
The user showed the existing administrator textbook catalog. The earlier statement that textbook lesson information was unavailable was too broad: the existing public GET /api/textbook-files?group=1 provides the exact published lesson/group names, registered levels and page counts, with hidden groups filtered server-side. The source implementation was verified in api-admin.ts; loadTextbookChoices in student-placement.ts also documents the distinction between umbrella textbook rows and real content names.

Added an independent on-demand registered catalog panel: course → registered level → textbook → actual lesson → original page links. Exact group names are preserved; only the selected lesson page metadata is requested; original files load only after a link click. No admin API, DB write, OCR call, hidden-group bypass, or student profile read was introduced. Numeric book ordering, exact group membership, ID validation, cancellation, 15-second timeout and retry are tested by scene_textbook_catalog_harness (23 checks passed). The registered-level selector does not invent a CEFR equivalence.

Operating-server inspection remains blocked: terminal CONNECT timed out and Cloud Browser returned ERR_BLOCKED_BY_CLIENT for the public catalog endpoint. Thus no live count or source-page contents were verified this turn. Existing generated picture/video practice is explicitly separate: its correspondence to these exact lesson pages has not yet been validated. Users do NOT need to re-upload textbooks merely to obtain catalog names; source reading/OCR and verified content-to-lesson mapping are the remaining tasks.

Previous commit e9e716d full GitHub CI run 35561305639 succeeded before this follow-up. New catalog changes require their own CI result.

---

## 정정 (2026-09-21, 같은 날 나중)

위의 **「4,469 picture-linked forms」는 «그림을 붙인 개수» 이지 «그 낱말을 보여 주는 그림의 개수» 가
아닙니다.** 이 문서가 「These are file-derived counts, not a count of visually verified word definitions」
라고 적어 두긴 했지만, 화면 머리말이 그 숫자를 「그림 연결 단어」로 그대로 보여 주고 있었습니다.

사장님이 「nice」 카드의 가방 사진을 지적하셔서 전수로 재 보니 **그림이 붙은 39,762줄 중 38,475줄(96.8%)이
그 낱말과 무관한 그림**이었고, 더 나아가 **그림 설명 1,511개 중 1,485개(98.3%)는 설명이 아니라 문장을
그대로 붙여 넣은 틀이거나 어느 그림에나 붙는 껍데기**였습니다.

기준을 「그림 설명이 그 낱말을 가리킬 때만 낱말 그림」으로 바꾸고, 근거가 없으면 그 낱말의 교재 예문
자체의 그림만 «상황 그림» 으로, 그것도 없으면 붙이지 않습니다. 숫자도 갈라서 셉니다
(낱말 그림 95 · 상황 그림만 4,157 · 그림 없음 294).

📄 `docs/작업기록/260921_낱말그림_뜻과_안맞는_연결_기준교체.md`
