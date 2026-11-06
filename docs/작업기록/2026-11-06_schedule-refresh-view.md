# Timetable refresh keeps the working view

- Request: managers refreshing after a postponement lose the date and teacher filter.
- Change: weekly-schedule.html records selected date, day/week view, search, category, sort and free-slot filter in ws-prefixed URL parameters. Startup restores these before loading schedules. Entry presets do not override a restored working view. Search is saved immediately, including clearing the field.
- Choice: URL state keeps separate tabs independent and preserves the view on refresh without storing lesson records or replacing fresh API requests with cached data. Local storage was avoided because multiple schedule tabs would overwrite one another. Existing deep-link and student-mode parameters remain intact.
- Postponement: inspected the existing successful save path; it updates the in-memory slots and renders. No API or database changes were made, and the intermittent postponement display report was not reproduced against live data.
- Validation: TypeScript --noEmit passed. schedule_view_restore_harness.mjs passed (round trip, clearing search, invalid date, other URL parameters, blocked history). Local Chromium demo page: selected October 23, Maria, day view; full reload showed the same date, one Maria row and active day button.
- Full fast suite: run separately; an existing class_room_override_harness.mjs fails with ENOENT because its Windows path contains C:\\C:\\Users. Full outcome recorded in PR/report after completion. No production deployment or live data edits performed.
