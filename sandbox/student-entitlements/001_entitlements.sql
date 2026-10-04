-- PROPOSAL / LOCAL SYNTHETIC SANDBOX ONLY. Not in the application's migration path.
-- Never apply using the repository's default D1 config: it shares production DB.
-- Existing enrollments / payments / schedules / ERP / learning records are untouched.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS student_entitlement_schema (
  version INTEGER PRIMARY KEY CHECK(version = 1), purpose TEXT NOT NULL CHECK(purpose = 'local-synthetic-sandbox')
);
INSERT OR IGNORE INTO student_entitlement_schema VALUES(1, 'local-synthetic-sandbox');
CREATE TABLE IF NOT EXISTS student_entitlement_subjects (
  student_uid TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision >= 0),
  clock_ms INTEGER NOT NULL CHECK(clock_ms >= 0),
  projection_json TEXT NOT NULL CHECK(json_valid(projection_json)),
  projection_hash TEXT NOT NULL,
  last_event_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS student_entitlement_origins (
  origin_id TEXT PRIMARY KEY,
  student_uid TEXT NOT NULL REFERENCES student_entitlement_subjects(student_uid),
  source_system TEXT NOT NULL CHECK(source_system IN ('payment_orders','cafe24_verified','b2b_verified')),
  source_ref TEXT NOT NULL, line_ref TEXT NOT NULL, evidence_ref TEXT NOT NULL,
  product TEXT NOT NULL CHECK(product IN ('paid_ai','video_bundle')),
  currency TEXT NOT NULL CHECK(currency = 'KRW'),
  paid_amount INTEGER NOT NULL CHECK(paid_amount > 0),
  expected_amount INTEGER NOT NULL CHECK(expected_amount = paid_amount),
  settled_at INTEGER NOT NULL CHECK(settled_at >= 0),
  origin_json TEXT NOT NULL CHECK(json_valid(origin_json)),
  UNIQUE(source_system, source_ref, line_ref), UNIQUE(origin_id, student_uid)
);
CREATE TABLE IF NOT EXISTS student_entitlements (
  grant_id TEXT PRIMARY KEY,
  origin_id TEXT NOT NULL,
  student_uid TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('paid_ai','video_bundle')),
  revoked INTEGER NOT NULL CHECK(revoked IN (0,1)),
  purchased_ms INTEGER, remaining_ms INTEGER,
  grant_json TEXT NOT NULL CHECK(json_valid(grant_json)),
  FOREIGN KEY(origin_id, student_uid) REFERENCES student_entitlement_origins(origin_id, student_uid),
  UNIQUE(origin_id),
  CHECK((kind = 'paid_ai' AND purchased_ms IS NOT NULL AND remaining_ms IS NOT NULL
      AND purchased_ms > 0 AND remaining_ms >= 0 AND remaining_ms <= purchased_ms)
    OR (kind = 'video_bundle' AND purchased_ms IS NULL AND remaining_ms IS NULL))
);
CREATE TABLE IF NOT EXISTS student_entitlement_events (
  command_id TEXT PRIMARY KEY,
  student_uid TEXT NOT NULL REFERENCES student_entitlement_subjects(student_uid),
  sequence INTEGER NOT NULL CHECK(sequence > 0), occurred_at INTEGER NOT NULL CHECK(occurred_at >= 0),
  event_type TEXT NOT NULL, command_fingerprint TEXT NOT NULL,
  command_json TEXT NOT NULL CHECK(json_valid(command_json)),
  transitions_json TEXT NOT NULL CHECK(json_valid(transitions_json)),
  projection_hash TEXT NOT NULL, previous_event_hash TEXT NOT NULL, event_hash TEXT NOT NULL,
  UNIQUE(student_uid, sequence)
);
CREATE INDEX IF NOT EXISTS entitlement_event_subject_time ON student_entitlement_events(student_uid, occurred_at);
CREATE INDEX IF NOT EXISTS entitlement_origin_subject ON student_entitlement_origins(student_uid, product);
CREATE TRIGGER IF NOT EXISTS entitlement_events_no_update BEFORE UPDATE ON student_entitlement_events BEGIN
  SELECT RAISE(ABORT, 'entitlement_events_append_only');
END;
CREATE TRIGGER IF NOT EXISTS entitlement_events_no_delete BEFORE DELETE ON student_entitlement_events BEGIN
  SELECT RAISE(ABORT, 'entitlement_events_append_only');
END;
CREATE TRIGGER IF NOT EXISTS entitlement_origins_no_update BEFORE UPDATE ON student_entitlement_origins BEGIN
  SELECT RAISE(ABORT, 'entitlement_origins_immutable');
END;
CREATE TRIGGER IF NOT EXISTS entitlement_origins_no_delete BEFORE DELETE ON student_entitlement_origins BEGIN
  SELECT RAISE(ABORT, 'entitlement_origins_immutable');
END;
-- INSERT OR REPLACE must not bypass immutability when recursive_triggers is off.
CREATE TRIGGER IF NOT EXISTS entitlement_events_no_replace BEFORE INSERT ON student_entitlement_events
WHEN EXISTS(SELECT 1 FROM student_entitlement_events WHERE command_id=NEW.command_id OR (student_uid=NEW.student_uid AND sequence=NEW.sequence)) BEGIN
  SELECT RAISE(ABORT, 'entitlement_events_append_only');
END;
CREATE TRIGGER IF NOT EXISTS entitlement_origins_no_replace BEFORE INSERT ON student_entitlement_origins
WHEN EXISTS(SELECT 1 FROM student_entitlement_origins WHERE origin_id=NEW.origin_id OR (source_system=NEW.source_system AND source_ref=NEW.source_ref AND line_ref=NEW.line_ref)) BEGIN
  SELECT RAISE(ABORT, 'entitlement_origins_immutable');
END;
