-- REVIEW ONLY. Isolated synthetic DB; never apply to mango-db.
-- Provisioning and initial password setup require separate approval.
CREATE TABLE eleader_trial_lease (
 id INTEGER PRIMARY KEY CHECK(id=1),
 student_uid TEXT NOT NULL CHECK(student_uid='ED'),
 academy_id TEXT NOT NULL CHECK(academy_id='ed-sandbox'),
 issued_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at>issued_at AND expires_at<=issued_at+3600000),
 revoked_at INTEGER
);
-- No INSERT/password/default expiry here. An approved operator must set an
-- absolute window once; login/restart must never extend or recreate this row.
CREATE TABLE eleader_trial_login_limit (
 id INTEGER PRIMARY KEY CHECK(id=1), window_start INTEGER NOT NULL,
 attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 5)
);
CREATE TABLE eleader_trial_voice_budget (
 lease_id INTEGER NOT NULL,
 kind TEXT PRIMARY KEY CHECK(kind IN ('stt','chat','tts')),
 request_key TEXT NOT NULL UNIQUE,
 reserved_nanos INTEGER NOT NULL CHECK(reserved_nanos>0),
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','succeeded','failed','unknown'))
);
