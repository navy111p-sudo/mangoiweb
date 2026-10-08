-- REVIEW PROPOSAL ONLY. These are SELECT-only diagnostics, NOT an entitlement
-- backfill and NOT permission to run against production. Field names come from
-- cafe24-sync.ts at 27ec8ce. No date/name/amount match establishes paid access.
SELECT status, COUNT(*) AS rows, SUM(amount_krw) AS amount_krw
FROM student_payments GROUP BY status;
SELECT COUNT(*) AS missing_uid FROM student_payments
WHERE user_id IS NULL OR TRIM(user_id) = '';
SELECT COUNT(*) AS missing_period FROM student_payments
WHERE period_start IS NULL OR period_end IS NULL;
SELECT user_id, paid_at, amount_krw, COUNT(*) AS ambiguous_rows
FROM student_payments GROUP BY user_id, paid_at, amount_krw HAVING COUNT(*) > 1;
SELECT COUNT(*) AS cafe24_mirror_rows_without_durable_upstream_id
FROM student_payments WHERE memo LIKE '[cafe24]%';
-- The final count describes rows in a schema without upstream pay_id; it does
-- not say that those customers are unpaid. A new stable mapping needs approval.
