# Teacher payroll date selection

The Pay & deductions card previously displayed only the current month even though the separate class fee summary supported date ranges. Add full-month, 1st–15th, 16th–month-end and custom dates directly to the payroll card. Search applies inclusive dates to totals, deductions, counts and per-lesson details. Monthly dashboard data remains separate from payroll-period results. Existing authenticated monthly API and pay rules are unchanged; at most three calendar months are queried.

Validation: existing fee summary harness (40 checks) and new payroll-period calculation harness passed locally. Browser launch was blocked by the local environment (socket Operation not permitted). A dedicated PR browser workflow runs phone/tablet/desktop and English/Korean checks plus the existing date-summary browser suite. Full typecheck and regression gates run in the repository CI.

Rollback: revert this feature PR through review; no database migration or payroll records were changed.
