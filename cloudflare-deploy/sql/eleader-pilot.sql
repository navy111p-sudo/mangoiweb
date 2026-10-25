-- Explicit migration only. Do not run against production without review.
-- Membership links EXISTING identities; this is authorization, not a login system.
CREATE TABLE IF NOT EXISTS eleader_academies (id TEXT PRIMARY KEY, name TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)));
CREATE TABLE IF NOT EXISTS eleader_members (academy_id TEXT NOT NULL REFERENCES eleader_academies(id), kind TEXT NOT NULL CHECK(kind IN ('student','admin')), subject TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','director')), PRIMARY KEY(academy_id,kind,subject), CHECK((kind='student' AND role='student') OR (kind='admin' AND role='director')));
CREATE TABLE IF NOT EXISTS eleader_assignments (academy_id TEXT NOT NULL, student_uid TEXT NOT NULL, unit_id TEXT NOT NULL CHECK(unit_id IN ('pets','day','food')), PRIMARY KEY(academy_id,student_uid,unit_id));
-- No transcript, recording or automated proficiency score. One completion per question.
CREATE TABLE IF NOT EXISTS eleader_progress (academy_id TEXT NOT NULL, student_uid TEXT NOT NULL, unit_id TEXT NOT NULL, question_id TEXT NOT NULL, completed_at INTEGER NOT NULL, PRIMARY KEY(academy_id,student_uid,unit_id,question_id));
-- v2: verified guardian-consent metadata only; no UI can self-grant this authorization.
CREATE TABLE IF NOT EXISTS eleader_consents (academy_id TEXT NOT NULL, student_uid TEXT NOT NULL, policy_version TEXT NOT NULL, voice_processing INTEGER NOT NULL DEFAULT 0 CHECK(voice_processing IN (0,1)), ai_processing INTEGER NOT NULL DEFAULT 0 CHECK(ai_processing IN (0,1)), expires_at INTEGER NOT NULL, revoked_at INTEGER, PRIMARY KEY(academy_id,student_uid));
-- Idempotency/cost budget metadata, no answers/audio. Purged for the student on next use after 24h.
CREATE TABLE IF NOT EXISTS eleader_live_requests (academy_id TEXT NOT NULL, student_uid TEXT NOT NULL, request_id TEXT NOT NULL, action TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(academy_id,student_uid,request_id));
