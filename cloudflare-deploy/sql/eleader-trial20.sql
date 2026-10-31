-- Isolated trial only. No seed, password, code, lease start, or production migration.
CREATE TABLE eleader_trial20_owner (
 id INTEGER PRIMARY KEY CHECK(id=1), code_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL, used_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
 session_hash TEXT, auth_hash TEXT, book_id TEXT,
 next_step INTEGER NOT NULL DEFAULT 0 CHECK(next_step BETWEEN 0 AND 21),
 policy TEXT NOT NULL CHECK(policy='adult-trial20-v1')
);
CREATE TABLE eleader_trial20_claims (
 step INTEGER PRIMARY KEY CHECK(step BETWEEN 0 AND 20),
 request_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'reserved'
 CHECK(status IN ('reserved','succeeded','failed','unknown'))
);
CREATE TABLE eleader_trial20_calls (
 step INTEGER NOT NULL CHECK(step BETWEEN 0 AND 20),
 kind TEXT NOT NULL CHECK(kind IN ('stt','chat','tts')),
 request_key TEXT NOT NULL UNIQUE, reserved_nanos INTEGER NOT NULL CHECK(reserved_nanos>0),
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','succeeded','failed','unknown')),
 PRIMARY KEY(step,kind), CHECK(kind='tts' OR step>0)
);

-- Populated only during reviewed isolated setup; no credentials or activation seed.
CREATE TABLE IF NOT EXISTS eleader_trial_site (
 id INTEGER PRIMARY KEY CHECK(id=1),
 database_id TEXT NOT NULL,
 worker_name TEXT NOT NULL CHECK(worker_name='mangoiweb-eleader-ed-trial'),
 account_id TEXT NOT NULL CHECK(account_id='7ae16a3c4bcc84743c70828a5156ebb3'),
 approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN(0,1))
);
