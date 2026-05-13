-- D1 Schema for webrtc-unified-platform (Mango API)
CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  username TEXT,
  role TEXT DEFAULT 'student',
  consent_version TEXT DEFAULT 'v1.0',
  recording_consent INTEGER DEFAULT 0,
  voice_analysis_consent INTEGER DEFAULT 0,
  attendance_consent INTEGER DEFAULT 0,
  reward_consent INTEGER DEFAULT 0,
  kakao_consent INTEGER DEFAULT 0,
  guardian_required INTEGER DEFAULT 0,
  guardian_status TEXT,
  guardian_contact TEXT,
  ip_address TEXT,
  user_agent TEXT,
  consented_at INTEGER NOT NULL,
  withdrawn_at INTEGER,
  raw_payload TEXT
);
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id);
CREATE INDEX IF NOT EXISTS idx_consents_active ON consents(user_id, withdrawn_at);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  role TEXT,
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  status TEXT DEFAULT 'present',
  date TEXT,
  total_session_ms INTEGER DEFAULT 0,
  total_active_ms INTEGER DEFAULT 0,
  disconnect_count INTEGER DEFAULT 0,
  gaze_score REAL,
  gaze_samples INTEGER DEFAULT 0,
  gaze_forward_samples INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_attendance_room ON attendance(room_id);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_attendance_joined_at ON attendance(joined_at);

CREATE TABLE IF NOT EXISTS kakao_ids (
  user_id TEXT PRIMARY KEY,
  role TEXT, username TEXT, kakao_id TEXT, phone TEXT,
  opted_in_at INTEGER, updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS emergency_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT, user_id TEXT, target_user_id TEXT,
  event_type TEXT, triggered_at INTEGER NOT NULL, meta TEXT
);
CREATE INDEX IF NOT EXISTS idx_emergency_time ON emergency_events(triggered_at);

CREATE TABLE IF NOT EXISTS rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id TEXT, student_id TEXT, room_id TEXT,
  type TEXT, value TEXT, message TEXT,
  issued_at INTEGER NOT NULL, expires_at INTEGER,
  status TEXT DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_rewards_student ON rewards(student_id, status);

CREATE TABLE IF NOT EXISTS reward_limits (
  teacher_id TEXT NOT NULL, date TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (teacher_id, date)
);

CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL, teacher_id TEXT, teacher_name TEXT,
  filename TEXT, file_url TEXT, participant_ids TEXT, participant_names TEXT,
  consented_user_ids TEXT,
  started_at INTEGER, ended_at INTEGER, duration_ms INTEGER,
  size_bytes INTEGER, expires_at INTEGER, storage TEXT,
  status TEXT DEFAULT 'recording'
);
CREATE INDEX IF NOT EXISTS idx_recordings_room ON recordings(room_id);
CREATE INDEX IF NOT EXISTS idx_recordings_teacher ON recordings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_recordings_teacher_started ON recordings(teacher_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_recordings_status_storage ON recordings(status, storage);
