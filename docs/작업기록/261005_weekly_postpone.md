# Weekly postponement and separate request displays

Student postponement now previews and submits one weekly-series request. Approval
validates the saved series snapshot, all destination conflicts and teacher leave,
then commits every schedule update with the request decision in one guarded D1 batch.
Schedule IDs, teacher, time and lesson count stay unchanged. The last date extends
by seven days; other weekdays and earlier lessons stay untouched.

The dated series follows the existing same-student/source/teacher/time/weekday rule.
Undated recurring rows and Cafe24 mirror series are explicitly rejected for this
shortcut; they are not silently approved or converted to guessed dated lessons.
This limitation needs a separate recurring/mirror migration design before expansion.

Student PC/mobile styling is light with larger controls and a dedicated postponement
preview. Change keeps its existing request route. Administrator request lists and
teacher request records separate postponement from change. Teacher records load
when the card is opened, preserving the initial-page request budget.

Validation executed locally:
- weekly_postpone_atomic_harness.mjs: 600 scenarios, zero failures. Real production
  helpers and isolated SQLite; includes leave, conflict, stale state, concurrent edit,
  injected write failure, transaction rollback and duplicate approval protection.
- weekly_postpone_routes_harness.mjs: 200 postponement + 200 change workflows,
  10,204 assertions, zero failures. Actual request/approval/teacher/student/calendar
  handlers with SQLite. Router middleware, production D1 and real WebRTC excluded.
- Existing schedule_move_room_sync_harness.mjs: 174 checks, zero failures,
  including six deliberately broken-source mutations detected by the harness.
- TypeScript check of new weekly helper and shared request modules: passed.
- Edited inline scripts and administrator request JavaScript: syntax checks passed.

Browser launch in the local environment was blocked by socket permissions. The
dedicated PR workflow runs the shipped UI at 390px and 1360px with synthetic API
responses, double-submit checks, success/failure responses and screenshots.
Full repository CI, browser CI and production deployment remain required gates;
the local results above do not claim they have passed.

The first browser run caught a completed-screen overlay remaining active during repeated mode navigation. enterDetail now clears that overlay; browser CI is rerun.
