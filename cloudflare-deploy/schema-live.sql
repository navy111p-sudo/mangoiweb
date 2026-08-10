-- schema-live.sql — 운영 D1(mango-db)의 «실제» 모양.
--
-- 왜 이 파일이 필요한가
--   여태 스키마의 정본이 없었다. 표는 요청 처리 도중 코드가 만든다
--   (src/*.ts 에 CREATE TABLE IF NOT EXISTS 322개 · ALTER TABLE ADD COLUMN 96개, migrations 폴더 없음).
--   그래서 「지금 DB가 어떤 모양인가」를 알려면 322군데를 다 읽어야 했고,
--   같은 표를 여러 파일이 각자 만드는데 **모양이 서로 달랐다**:
--       students_erp        17벌 (컬럼 3~23개)   ← 운영 실제는 43개
--       class_schedules     14벌 (컬럼 5~16개)
--       student_evaluations  7벌 (컬럼 8~26개)
--
--   왜 위험한가: IF NOT EXISTS 라 **먼저 실행된 CREATE 가 이긴다**.
--   새 DB(개발용·복구본)에서 5컬럼짜리가 먼저 돌면 표가 5컬럼으로 만들어지고,
--   16컬럼을 기대하는 코드가 전부 런타임에 죽는다. 그 CREATE 들은 대부분
--   try{}catch{} 안이라 **조용히** 죽는다. 운영에선 이미 만들어져 있어 증상이 없다 —
--   새 환경에서만 터진다. 즉 **코드로는 이 DB 를 재현할 수 없었다.**
--
-- ⚠️ 손으로 고치지 말 것. 갱신은 test-harness/schema-live-refresh.mjs 로.
--
-- 표 185개 · 인덱스 101개 · 트리거 1개

-- ═══════════════════ 표 ═══════════════════
CREATE TABLE admin_2fa (
       username TEXT PRIMARY KEY,
       secret TEXT NOT NULL,
       enabled INTEGER NOT NULL DEFAULT 0,
       created_at INTEGER NOT NULL,
       enabled_at INTEGER
     );
CREATE TABLE admin_account (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       username TEXT NOT NULL UNIQUE,
       password_hash TEXT NOT NULL,
       name TEXT,
       email TEXT,
       phone TEXT,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL
     , pref_lang TEXT, nationality TEXT);
CREATE TABLE admin_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_uid TEXT NOT NULL, action TEXT NOT NULL, target_room TEXT, target_user TEXT, meta TEXT, ip TEXT, created_at INTEGER NOT NULL);
CREATE TABLE admin_login_history (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       username TEXT NOT NULL,
       ip TEXT,
       user_agent TEXT,
       success INTEGER NOT NULL DEFAULT 0,
       reason TEXT,
       login_at INTEGER NOT NULL
     );
CREATE TABLE admin_menu_hits (day TEXT NOT NULL, card TEXT NOT NULL, role TEXT NOT NULL, via TEXT NOT NULL DEFAULT 'sidebar', label_ko TEXT, hits INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (day, card, role, via));
CREATE TABLE admin_observations (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_uid TEXT NOT NULL, room_id TEXT NOT NULL, reason TEXT, joined_at INTEGER NOT NULL, left_at INTEGER, consumer_ids TEXT, ip TEXT, user_agent TEXT);
CREATE TABLE admin_perms (admin_uid TEXT PRIMARY KEY, can_ghost INTEGER DEFAULT 0, can_whisper INTEGER DEFAULT 0, can_kick INTEGER DEFAULT 0, can_view_alerts INTEGER DEFAULT 1, updated_at INTEGER NOT NULL);
CREATE TABLE admin_scope (username TEXT PRIMARY KEY, scope_type TEXT NOT NULL, scope_value TEXT, updated_at INTEGER);
CREATE TABLE admin_sessions (
       token TEXT PRIMARY KEY,
       username TEXT NOT NULL,
       ip TEXT,
       user_agent TEXT,
       created_at INTEGER NOT NULL,
       expires_at INTEGER NOT NULL,
       last_seen_at INTEGER NOT NULL
     );
CREATE TABLE admin_whispers (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_uid TEXT NOT NULL, room_id TEXT NOT NULL, target_teacher_uid TEXT NOT NULL, message_type TEXT, payload TEXT, urgency TEXT DEFAULT 'normal', sent_at INTEGER NOT NULL, delivered_at INTEGER, read_at INTEGER);
CREATE TABLE agency_pricing (shop_name TEXT PRIMARY KEY, weekly1_price INTEGER NOT NULL, updated_by TEXT, updated_at INTEGER);
CREATE TABLE ai_friend_chats (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, level TEXT, created_at INTEGER NOT NULL);
CREATE TABLE ai_lesson_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, evaluation_id INTEGER, student_uid TEXT, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, recording_id TEXT, recording_url TEXT, lesson_title TEXT, lesson_date TEXT, transcript TEXT, transcript_excerpt TEXT, grammar_errors TEXT, alternatives TEXT, word_freq TEXT, summary_ko TEXT, strengths TEXT, weaknesses TEXT, next_goals TEXT, overall_score INTEGER, speaking_seconds INTEGER, total_words INTEGER, status TEXT DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER);
CREATE TABLE ai_student_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, summary TEXT, strengths TEXT, weaknesses TEXT, recommendations TEXT, risk_level TEXT, raw_response TEXT, model TEXT, generated_at INTEGER NOT NULL);
CREATE TABLE ai_writing_corrections (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, original_text TEXT NOT NULL, corrected_text TEXT, feedback TEXT, level TEXT, score INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE alimtalk_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,            -- 대상 학생 uid (students_erp.user_id)
  parent_phone TEXT,                     -- 수신 학부모 번호 (마스킹 전 원본은 PII 정책 따름)
  template     TEXT,                     -- solapi templateCode (absence_alert 등)
  reason       TEXT,                     -- 발송 사유: 'absence' | 'low_engagement' | 'eval_drop' | 'manual'
  ref_room_id  TEXT,                     -- 연관 수업 room_id (TRIGGERED 엣지)
  ref_date     TEXT,                     -- 연관 수업 날짜 'YYYY-MM-DD'
  message_id   TEXT,                     -- solapi messageId (발송 결과)
  track_token  TEXT,                     -- 클릭추적 토큰(알림톡 버튼 링크 → /api/alimtalk/r?t=)
  send_status  TEXT DEFAULT 'sent',      -- 'sent' | 'failed' | 'skipped'
  sent_at      INTEGER NOT NULL,         -- 발송 시각(ms)
  read_at      INTEGER,                  -- 열람 시각(ms). NULL = 미열람. 버튼 클릭 시 기록
  responded_at INTEGER,                  -- 학부모 반응(재예약·문의 등) 시각(ms). NULL = 무반응
  created_at   INTEGER NOT NULL
);
CREATE TABLE alumni (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT UNIQUE, graduation_year INTEGER, graduation_month INTEGER, current_status TEXT, career_field TEXT, location TEXT, message TEXT, photo_url TEXT, mentor_available INTEGER DEFAULT 0, created_at INTEGER);
CREATE TABLE alumni_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, author_uid TEXT, title TEXT, body TEXT, tags TEXT, likes INTEGER DEFAULT 0, comments_count INTEGER DEFAULT 0, created_at INTEGER);
CREATE TABLE analysis_perf_log (id INTEGER PRIMARY KEY AUTOINCREMENT, task TEXT NOT NULL, ref_id TEXT, duration_ms INTEGER, cache_hit INTEGER DEFAULT 0, status TEXT, detail TEXT, created_at INTEGER NOT NULL);
CREATE TABLE approval_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, req_type TEXT NOT NULL DEFAULT 'expense', requester_username TEXT NOT NULL, requester_name TEXT, title TEXT NOT NULL, body TEXT, category TEXT, amount REAL, currency TEXT DEFAULT 'PHP', spent_at TEXT, file_key TEXT, file_name TEXT, file_ext TEXT, file_size INTEGER, status TEXT NOT NULL DEFAULT 'pending', decided_by TEXT, decided_at INTEGER, decide_memo TEXT, created_at INTEGER NOT NULL);
CREATE TABLE attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT,
  role TEXT,
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  status TEXT DEFAULT 'present',
  date TEXT,
  total_session_ms INTEGER DEFAULT 0
, total_active_ms INTEGER DEFAULT 0, disconnect_count INTEGER DEFAULT 0, gaze_score REAL, gaze_samples INTEGER DEFAULT 0, gaze_forward_samples INTEGER DEFAULT 0, attended_at INTEGER, last_seen_at INTEGER, spk_diag TEXT);
CREATE TABLE attendance_qr_tokens (token TEXT PRIMARY KEY, room_id TEXT NOT NULL, teacher_uid TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used_count INTEGER DEFAULT 0);
CREATE TABLE battle_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, game_type TEXT, joined_at INTEGER, status TEXT DEFAULT 'waiting');
CREATE TABLE battles (id INTEGER PRIMARY KEY AUTOINCREMENT, challenger_uid TEXT, opponent_uid TEXT, game_type TEXT, status TEXT DEFAULT 'pending', challenger_score INTEGER DEFAULT 0, opponent_score INTEGER DEFAULT 0, winner_uid TEXT, reward_points INTEGER DEFAULT 100, game_data TEXT, created_at INTEGER, finished_at INTEGER);
CREATE TABLE bug_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_role TEXT, reporter_uid TEXT, reporter_name TEXT, category TEXT, message TEXT NOT NULL, page_url TEXT, user_agent TEXT, status TEXT DEFAULT 'new', admin_note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER);
CREATE TABLE calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, title TEXT NOT NULL, date TEXT NOT NULL, end_date TEXT, country TEXT, teacher_id TEXT, teacher_name TEXT, color TEXT, note TEXT, source TEXT DEFAULT 'manual', created_at INTEGER NOT NULL);
CREATE TABLE capitown_agencies (id INTEGER PRIMARY KEY, name TEXT NOT NULL, login_id TEXT, manager TEXT, branch TEXT NOT NULL, status TEXT NOT NULL DEFAULT '사용', type TEXT NOT NULL DEFAULT '가맹', margin REAL NOT NULL DEFAULT 0.4, students INTEGER NOT NULL DEFAULT 0, online INTEGER NOT NULL DEFAULT 0, book INTEGER NOT NULL DEFAULT 0, updated_at INTEGER);
CREATE TABLE centers (id INTEGER PRIMARY KEY AUTOINCREMENT, franchise_id INTEGER, name TEXT NOT NULL, country TEXT, address TEXT, manager TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, sender_uid TEXT, sender_name TEXT, sender_role TEXT, message TEXT NOT NULL, sent_at INTEGER NOT NULL, meta TEXT, channel TEXT DEFAULT 'web');
CREATE TABLE class_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, schedule_id INTEGER, room_id TEXT, teacher_name TEXT, student_name TEXT, lesson_date TEXT, lesson_time TEXT, actor TEXT, actor_role TEXT, source TEXT, reason TEXT, detail TEXT, created_at INTEGER NOT NULL);
CREATE TABLE class_no_show (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, schedule_id INTEGER, missing_role TEXT, missing_uid TEXT, student_name TEXT, teacher_name TEXT, lesson_title TEXT, waited_min INTEGER, notified_push INTEGER DEFAULT 0, notified_kakao INTEGER DEFAULT 0, created_at INTEGER NOT NULL, contacted_at INTEGER);
CREATE TABLE class_ratings (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, student_uid TEXT NOT NULL, student_name TEXT, teacher_name TEXT, score INTEGER NOT NULL, tags TEXT, feedback TEXT, rated_date TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(room_id, student_uid, rated_date));
CREATE TABLE class_schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, schedule_kind TEXT NOT NULL DEFAULT 'recurring', class_type TEXT NOT NULL DEFAULT 'regular', day_of_week TEXT, scheduled_date TEXT, start_time TEXT NOT NULL, duration_min INTEGER DEFAULT 30, teacher_id TEXT, status TEXT DEFAULT 'active', source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, notes TEXT);
CREATE TABLE class_waitlist ( id INTEGER PRIMARY KEY AUTOINCREMENT, student_name TEXT, phone TEXT, uid TEXT, teacher_pref TEXT, day_pref TEXT, time_pref TEXT, note TEXT, status TEXT NOT NULL DEFAULT 'waiting', created_at INTEGER NOT NULL, created_by TEXT, resolved_at INTEGER, resolved_by TEXT);
CREATE TABLE community_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, author TEXT, pinned INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE consents (
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
CREATE TABLE counseling_bookings (id INTEGER PRIMARY KEY AUTOINCREMENT, slot_id INTEGER, parent_uid TEXT, parent_name TEXT, parent_phone TEXT, student_uid TEXT, topic TEXT, status TEXT, created_at INTEGER);
CREATE TABLE counseling_slots (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_uid TEXT, date TEXT, start_time TEXT, duration_min INTEGER, available INTEGER, created_at INTEGER, status TEXT DEFAULT 'open');
CREATE TABLE daily_briefings (id INTEGER PRIMARY KEY AUTOINCREMENT, briefing_date TEXT NOT NULL, briefing_text TEXT NOT NULL, stats TEXT, created_at INTEGER NOT NULL);
CREATE TABLE decision_growth_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT NOT NULL, student_uid TEXT NOT NULL, student_name TEXT, events_count INTEGER, axis_choice REAL, axis_reasoning REAL, axis_selfcorrection REAL, axis_register REAL, axis_consistency REAL, judgment_index REAL, delta_index REAL, top_misconceptions TEXT, generated_at INTEGER, UNIQUE(period, student_uid));
CREATE TABLE digest_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT, parent_phone TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);
CREATE TABLE dunning_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, stage TEXT, message TEXT, sent_at INTEGER NOT NULL, status TEXT);
CREATE TABLE emergency_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT, user_id TEXT, target_user_id TEXT,
  event_type TEXT, triggered_at INTEGER NOT NULL, meta TEXT
);
CREATE TABLE en_vocab (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  band TEXT,            
  type TEXT NOT NULL,   
  en TEXT NOT NULL,
  ko TEXT,
  words TEXT,           
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE enroll_holidays (day TEXT PRIMARY KEY, name TEXT, created_by TEXT, created_at INTEGER);
CREATE TABLE enroll_notify_log (uid TEXT NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, sent_at INTEGER, PRIMARY KEY (uid, kind, day));
CREATE TABLE enrollments (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, package TEXT, started_at INTEGER, ended_at INTEGER, monthly_fee_krw INTEGER, status TEXT DEFAULT 'pending', notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, days_of_week TEXT, time TEXT, class_size TEXT, type TEXT, teacher_name TEXT, end_date TEXT);
CREATE TABLE exec_recipients (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL UNIQUE, name TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE families (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_uid TEXT NOT NULL, family_name TEXT NOT NULL, discount_percent INTEGER DEFAULT 10, created_at INTEGER NOT NULL);
CREATE TABLE family_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_uid TEXT, family_name TEXT, discount_percent INTEGER DEFAULT 10, created_at INTEGER);
CREATE TABLE family_members (id INTEGER PRIMARY KEY AUTOINCREMENT, family_id INTEGER, student_uid TEXT, relationship TEXT, created_at INTEGER);
CREATE TABLE feedback_drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT UNIQUE, schedule_id INTEGER, lesson_date TEXT, start_time TEXT, teacher_id TEXT, teacher_name TEXT, student_uid TEXT, student_name TEXT, draft_ko TEXT, draft_en TEXT, final_ko TEXT, final_en TEXT, has_signals INTEGER DEFAULT 0, edited INTEGER DEFAULT 0, status TEXT DEFAULT 'draft', created_at INTEGER NOT NULL, approved_at INTEGER);
CREATE TABLE finance_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL DEFAULT '기타', amount_krw INTEGER NOT NULL, spent_at INTEGER NOT NULL, memo TEXT, source TEXT DEFAULT 'manual', created_at INTEGER NOT NULL);
CREATE TABLE finance_snapshots (snap_date TEXT PRIMARY KEY, income_krw INTEGER NOT NULL DEFAULT 0, expense_krw INTEGER NOT NULL DEFAULT 0, net_krw INTEGER NOT NULL DEFAULT 0, pay_count INTEGER NOT NULL DEFAULT 0, generated_at INTEGER NOT NULL);
CREATE TABLE forbidden_words (id INTEGER PRIMARY KEY AUTOINCREMENT, word TEXT NOT NULL UNIQUE, severity TEXT DEFAULT 'medium', language TEXT DEFAULT 'both', added_by TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE franchises (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, phone TEXT, owner_name TEXT, opened_at TEXT, active INTEGER DEFAULT 1, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE game_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, lang TEXT NOT NULL, item TEXT NOT NULL, ko TEXT, wrong_count INTEGER DEFAULT 0, correct_count INTEGER DEFAULT 0, last_seen INTEGER, updated_at INTEGER, pron_best INTEGER DEFAULT 0, pron_last INTEGER DEFAULT 0, pron_count INTEGER DEFAULT 0, game TEXT DEFAULT '', UNIQUE(user_id, lang, item));
CREATE TABLE game_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL, game TEXT NOT NULL, lang TEXT DEFAULT 'en', started_at INTEGER, ended_at INTEGER, dur_ms INTEGER DEFAULT 0, items INTEGER DEFAULT 0, correct INTEGER DEFAULT 0, wrong INTEGER DEFAULT 0, finished INTEGER DEFAULT 0, coins INTEGER DEFAULT 0, created_at INTEGER);
CREATE TABLE game_stats (
  user_id TEXT PRIMARY KEY,
  nickname TEXT,
  coins_total INTEGER DEFAULT 0,
  coins_week INTEGER DEFAULT 0,
  week_start INTEGER DEFAULT 0,
  updated_at INTEGER
);
CREATE TABLE game_word_defs (id INTEGER PRIMARY KEY AUTOINCREMENT, lang TEXT NOT NULL, word TEXT NOT NULL, ko TEXT, pinyin TEXT, updated_at INTEGER, UNIQUE(lang, word));
CREATE TABLE gem_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, balance_after INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE gift_catalog (id INTEGER PRIMARY KEY AUTOINCREMENT, external_id TEXT, brand TEXT, name TEXT NOT NULL, category TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, thumbnail_url TEXT, stock INTEGER, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, description TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE gift_redemptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, catalog_id INTEGER NOT NULL, gift_name TEXT, gift_brand TEXT, face_value INTEGER NOT NULL, point_price INTEGER NOT NULL, recipient_phone TEXT, recipient_name TEXT, status TEXT NOT NULL DEFAULT 'pending', external_order_id TEXT, external_coupon_code TEXT, error_message TEXT, requested_at INTEGER NOT NULL, sent_at INTEGER, delivered_at INTEGER, failed_at INTEGER, refunded_at INTEGER, txn_spend_id INTEGER, txn_refund_id INTEGER, meta TEXT);
CREATE TABLE holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT, country TEXT NOT NULL, date TEXT NOT NULL,
      name TEXT NOT NULL, source TEXT DEFAULT 'api', UNIQUE(country, date));
CREATE TABLE inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, message TEXT, created_at INTEGER, status TEXT DEFAULT "new", level TEXT, region TEXT, source TEXT, assigned_to TEXT, notes TEXT, contacted_at INTEGER, registered_at INTEGER, registered_uid TEXT, rejected_reason TEXT, updated_at INTEGER, email TEXT, program TEXT);
CREATE TABLE judgment_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id INTEGER UNIQUE, student_uid TEXT NOT NULL, choice_score INTEGER, best_option TEXT, is_optimal INTEGER, reasoning_score INTEGER, reasoning_features_json TEXT, misconception_tag TEXT, feedback_ko TEXT, feedback_en TEXT, model TEXT, cache_hit INTEGER DEFAULT 0, latency_ms INTEGER, raw_json TEXT, schema_ver TEXT, migrated_at INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE judgment_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_uid TEXT UNIQUE, student_uid TEXT NOT NULL, student_name TEXT, room_id TEXT, schedule_id INTEGER, lesson_date TEXT, source TEXT NOT NULL, situation_id TEXT, situation_text TEXT, skill_tag TEXT, options_json TEXT, chosen_option TEXT, chosen_index INTEGER, reasoning_text TEXT, lang TEXT DEFAULT 'en', analyzed INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE kakao_ids (
  user_id TEXT PRIMARY KEY,
  role TEXT, username TEXT, kakao_id TEXT, phone TEXT,
  opted_in_at INTEGER, updated_at INTEGER
);
CREATE TABLE kakao_inbound (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, channel TEXT, sender_phone TEXT, sender_name TEXT, mapped_user_id TEXT, message TEXT NOT NULL, payload TEXT, processed INTEGER DEFAULT 0, room_id TEXT, received_at INTEGER NOT NULL);
CREATE TABLE learning_trend_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, period TEXT NOT NULL, student_uid TEXT NOT NULL, student_name TEXT, attendance_days INTEGER DEFAULT 0, eval_count INTEGER DEFAULT 0, eval_avg REAL, gaze_avg REAL, voice_avg REAL, risk_level TEXT, generated_at INTEGER NOT NULL, UNIQUE(period, student_uid));
CREATE TABLE lesson_insights (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, student_uid TEXT NOT NULL, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, lesson_date TEXT, session_ms INTEGER, active_ms INTEGER, talk_ratio REAL, gaze_score REAL, disconnect_count INTEGER, participation_score REAL, chat_lines INTEGER, chat_words INTEGER, material_source TEXT, overall_score INTEGER, summary_ko TEXT, summary_en TEXT, strengths_ko TEXT, strengths_en TEXT, weaknesses_ko TEXT, weaknesses_en TEXT, next_goals_ko TEXT, next_goals_en TEXT, corrections TEXT, evidence TEXT, status TEXT DEFAULT 'auto', reviewed_by TEXT, reviewed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER, UNIQUE(room_id, student_uid));
CREATE TABLE lesson_late_minutes (schedule_id INTEGER NOT NULL, lesson_date TEXT NOT NULL, minutes INTEGER DEFAULT 0, updated_by TEXT, updated_at INTEGER, PRIMARY KEY (schedule_id, lesson_date));
CREATE TABLE lesson_reminder_log (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT, schedule_id INTEGER, student_uid TEXT, sent_parent INTEGER DEFAULT 0, sent_student INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE level_tests (id INTEGER PRIMARY KEY AUTOINCREMENT, student_user_id TEXT, student_name TEXT NOT NULL, tested_at INTEGER NOT NULL, level TEXT, score REAL, notes TEXT, evaluator TEXT, created_at INTEGER NOT NULL);
CREATE TABLE leveltest_applications (id INTEGER PRIMARY KEY AUTOINCREMENT, student_name TEXT NOT NULL, student_uid TEXT, desired_date TEXT, desired_time TEXT, status TEXT DEFAULT 'pending', ai_score REAL, pron_score REAL, teacher_score REAL, final_level TEXT, assigned_teacher TEXT, source TEXT, note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, teacher_rubric TEXT, evaluated_by TEXT, evaluated_at INTEGER, phone TEXT, student_email TEXT, assigned_teacher_id TEXT, assigned_teacher_phone TEXT, assigned_teacher_email TEXT, assigned_reason TEXT, teacher_seen_at INTEGER, teacher_confirmed_at INTEGER, recommended_textbook TEXT, next_class_guide TEXT, result_notified_at INTEGER, schedule_id INTEGER);
CREATE TABLE leveltest_reminder_log (id INTEGER PRIMARY KEY AUTOINCREMENT, app_id INTEGER NOT NULL, kind TEXT NOT NULL, sent INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE mango_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, title_en TEXT, youtube_url TEXT NOT NULL, youtube_id TEXT NOT NULL, thumbnail_url TEXT, level TEXT, lesson_no INTEGER, category TEXT, description TEXT, description_en TEXT, duration_sec INTEGER, sort_order INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE marketing_campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_type TEXT, segment TEXT, tone TEXT, channel TEXT, headline TEXT, body TEXT, cta TEXT, variants_json TEXT, hashtags TEXT, audience_total INTEGER DEFAULT 0, audience_reachable INTEGER DEFAULT 0, model TEXT, created_at INTEGER NOT NULL);
CREATE TABLE microlearn_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, parent_phone TEXT, content TEXT NOT NULL, channel TEXT, sent_at INTEGER NOT NULL, status TEXT);
CREATE TABLE mini_toeic_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER, question_id INTEGER, selected_answer TEXT, is_correct INTEGER, answered_at INTEGER);
CREATE TABLE mini_toeic_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, user_id TEXT, started_at INTEGER, finished_at INTEGER, score INTEGER, listening_score INTEGER, reading_score INTEGER, status TEXT DEFAULT 'in_progress');
CREATE TABLE mini_toeic_exams (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, level TEXT, listening_count INTEGER, reading_count INTEGER, duration_min INTEGER, status TEXT DEFAULT 'active', created_by TEXT, created_at INTEGER);
CREATE TABLE mini_toeic_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER, section TEXT, ord INTEGER, question_text TEXT, choice_a TEXT, choice_b TEXT, choice_c TEXT, choice_d TEXT, correct_answer TEXT, audio_url TEXT, image_url TEXT, points INTEGER DEFAULT 5, created_at INTEGER);
CREATE TABLE misconception_taxonomy (code TEXT PRIMARY KEY, label_ko TEXT, label_en TEXT, dimension TEXT, description TEXT, sort_order INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, updated_at INTEGER);
CREATE TABLE mod_notify_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, dedup_key TEXT UNIQUE,
      student_id TEXT NOT NULL, student_name TEXT, segment TEXT, attend_rate REAL,
      parent_phone TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), sent_at TEXT);
CREATE TABLE mod_tb_video_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT, textbook_id TEXT NOT NULL, video_id TEXT NOT NULL,
      unit_no INTEGER, quiz_id TEXT, UNIQUE(textbook_id, video_id, unit_no));
CREATE TABLE mod_textbooks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, isbn TEXT, level TEXT,
      unit_count INTEGER DEFAULT 0, meta_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE mod_videos (
      id TEXT PRIMARY KEY, youtube_url TEXT NOT NULL, youtube_id TEXT, title TEXT,
      lesson_no INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE monthly_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, period TEXT NOT NULL, ai_text TEXT, metrics_json TEXT, access_token TEXT NOT NULL, status TEXT DEFAULT 'draft', sent_to_student INTEGER DEFAULT 0, sent_to_parent INTEGER DEFAULT 0, sent_log TEXT, created_at INTEGER NOT NULL, sent_at INTEGER, approval_status TEXT DEFAULT 'pending', approved_by TEXT, approved_at INTEGER, ai_draft_comment_ko TEXT, ai_draft_comment_en TEXT, ai_draft_tip_ko TEXT, ai_draft_tip_en TEXT, teacher_name TEXT, UNIQUE(student_uid, period));
CREATE TABLE mt_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id INTEGER NOT NULL, question_id INTEGER NOT NULL, selected_answer TEXT, is_correct INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE mt_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL, user_id TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, score INTEGER, listening_score INTEGER, reading_score INTEGER, correct_count INTEGER, total_questions INTEGER);
CREATE TABLE mt_exams (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, level TEXT DEFAULT 'A1', listening_count INTEGER DEFAULT 5, reading_count INTEGER DEFAULT 5, duration_min INTEGER DEFAULT 20, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE mt_questions (id INTEGER PRIMARY KEY AUTOINCREMENT, exam_id INTEGER NOT NULL, section TEXT NOT NULL, question_text TEXT NOT NULL, choice_a TEXT, choice_b TEXT, choice_c TEXT, choice_d TEXT, correct_answer TEXT NOT NULL, audio_url TEXT, image_url TEXT, points INTEGER DEFAULT 5, source TEXT DEFAULT 'manual', created_at INTEGER NOT NULL);
CREATE TABLE notification_queue (   id INTEGER PRIMARY KEY AUTOINCREMENT,   type TEXT NOT NULL,   title TEXT,   body TEXT,   meta TEXT,   channel TEXT DEFAULT 'kakao_memo',   status TEXT DEFAULT 'pending',   created_at INTEGER NOT NULL,   sent_at INTEGER,   error TEXT );
CREATE TABLE nps_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, score INTEGER, comment TEXT, channel TEXT, created_at INTEGER, ym TEXT, student_name TEXT, parent_phone TEXT);
CREATE TABLE org_nodes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id       INTEGER,                 -- 상위 노드(=[:PARENT_OF] 역방향). 루트(HQ)=NULL
  type            TEXT NOT NULL,           -- 'hq' | 'branch' | 'agency'  (지사본사=franchise는 branch로 통합)
  name            TEXT NOT NULL,           -- 표시명 (예: '망고아이본사', '서울강남지사', '강남대리점')
  match_key       TEXT,                    -- students_erp 연결 키:
                                           --   agency → students_erp.shop_name 값
                                           --   branch → students_erp.franchise 값(LIKE 'key%')
                                           --   hq     → NULL(전체)
  commission_rate REAL NOT NULL DEFAULT 0.15, -- 이 노드가 "상위(부모)"에게 내는 본사 수수료율 0.15~0.18. HQ=0
  path            TEXT,                    -- 머티리얼라이즈드 패스 '/1/4/9/' (서브트리 prefix 스캔용)
  depth           INTEGER NOT NULL DEFAULT 0, -- 루트=0
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES org_nodes(id)
);
CREATE TABLE org_settlement_ledger (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id          INTEGER NOT NULL,        -- 정산 주체 org_nodes.id
  node_type        TEXT,                    -- 스냅샷 시점 타입(감사용)
  node_name        TEXT,                    -- 스냅샷 시점 표시명(감사용)
  period           TEXT NOT NULL,           -- 'YYYY-MM'
  gross_revenue    INTEGER NOT NULL DEFAULT 0, -- 서브트리 총 매출(KRW)
  commission_rate  REAL NOT NULL DEFAULT 0,    -- 적용 수수료율(스냅샷)
  hq_fee           INTEGER NOT NULL DEFAULT 0, -- 상위로 올린 본사 수수료(KRW)
  net_settlement   INTEGER NOT NULL DEFAULT 0, -- 정산액 = gross - hq_fee (KRW)
  pay_count        INTEGER NOT NULL DEFAULT 0, -- 결제 건수(감사/대사용)
  status           TEXT NOT NULL DEFAULT 'closed', -- 'closed' | 'paid' | 'void'
  checksum         TEXT,                    -- 무결성 해시(원자료 변조 감지용; 선택)
  closed_at        INTEGER NOT NULL,        -- 마감 시각(ms)
  closed_by        TEXT,                    -- 마감 관리자 username
  UNIQUE(node_id, period)
);
CREATE TABLE parent_chat_log (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT, user_message TEXT, ai_reply TEXT, escalated INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE payment_orders (
         order_id TEXT PRIMARY KEY,
         uid TEXT,
         program TEXT,
         amount INTEGER NOT NULL,
         status TEXT NOT NULL DEFAULT 'pending',
         payment_key TEXT,
         method TEXT,
         payer_name TEXT,
         student_name TEXT,
         created_at INTEGER NOT NULL,
         paid_at INTEGER,
         fail_reason TEXT,
         raw TEXT
       , phone TEXT, enroll_json TEXT);
CREATE TABLE payment_overdue_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, days_overdue INTEGER, amount_krw INTEGER, parent_phone TEXT, status TEXT, error_message TEXT, sent_at INTEGER NOT NULL);
CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, amount INTEGER, due_at INTEGER, paid_at INTEGER, status TEXT);
CREATE TABLE payroll_deduction_rules (code TEXT PRIMARY KEY, label_ko TEXT, label_en TEXT, rule_type TEXT DEFAULT 'per_lesson', amount REAL DEFAULT 0, enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, updated_at INTEGER);
CREATE TABLE payroll_levels (code TEXT PRIMARY KEY, label_ko TEXT, label_en TEXT, rate_per_20min REAL DEFAULT 0, sort_order INTEGER DEFAULT 0, updated_at INTEGER);
CREATE TABLE payroll_meta (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER);
CREATE TABLE payroll_settings (id INTEGER PRIMARY KEY CHECK(id=1), php_krw REAL DEFAULT 24, updated_at INTEGER);
CREATE TABLE payslips (   id INTEGER PRIMARY KEY AUTOINCREMENT,   teacher_id INTEGER NOT NULL,   year INTEGER NOT NULL,   month INTEGER NOT NULL,   status TEXT,   class_count INTEGER,   rate_per_10min_php REAL,   monthly_salary_php REAL,   weighted_total REAL,   grade TEXT,   finalized_at INTEGER NOT NULL,   finalized_by TEXT, period TEXT, payment_krw INTEGER, payment_php REAL, minutes_taught INTEGER, evaluation_score REAL, bonus_krw INTEGER DEFAULT 0, deduction_krw INTEGER DEFAULT 0, paid INTEGER DEFAULT 0,   UNIQUE(teacher_id, year, month) );
CREATE TABLE point_awards (award_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, room_id TEXT, credited_at INTEGER NOT NULL);
CREATE TABLE point_expiry_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, kind TEXT NOT NULL, due_at INTEGER, amount INTEGER, created_at INTEGER NOT NULL, UNIQUE(user_id, kind, due_at));
CREATE TABLE point_rule_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, rule_code TEXT NOT NULL, amount INTEGER NOT NULL, triggered_at INTEGER NOT NULL, txn_id INTEGER, meta TEXT, occurred_at INTEGER);
CREATE TABLE point_rules (code TEXT PRIMARY KEY, label TEXT NOT NULL, amount INTEGER NOT NULL, cooldown_sec INTEGER DEFAULT 0, daily_cap INTEGER, enabled INTEGER DEFAULT 1, description TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE point_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, student_name TEXT, type TEXT NOT NULL, amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, reason TEXT, rule_code TEXT, redemption_id INTEGER, actor_id TEXT, actor_name TEXT, created_at INTEGER NOT NULL, meta TEXT);
CREATE TABLE popup_announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'mixed', body_html TEXT, image_url TEXT, video_url TEXT, link_url TEXT, link_text TEXT, width INTEGER DEFAULT 480, height INTEGER DEFAULT 360, width_mobile INTEGER, height_mobile INTEGER, position TEXT DEFAULT 'center', priority INTEGER DEFAULT 0, start_at INTEGER, end_at INTEGER, enabled INTEGER DEFAULT 1, dismiss_options TEXT DEFAULT 'today,7days', target_filter TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, view_count INTEGER DEFAULT 0, click_count INTEGER DEFAULT 0);
CREATE TABLE popup_dismissals (popup_id INTEGER NOT NULL, user_id TEXT NOT NULL, dismissed_at INTEGER NOT NULL, dismissed_until INTEGER NOT NULL, PRIMARY KEY (popup_id, user_id));
CREATE TABLE popup_events (   id INTEGER PRIMARY KEY AUTOINCREMENT,   popup_id INTEGER NOT NULL,   event_type TEXT NOT NULL, close_kind TEXT,   user_id TEXT, page TEXT, channel TEXT, user_agent TEXT,   created_at INTEGER NOT NULL );
CREATE TABLE popup_views (id INTEGER PRIMARY KEY AUTOINCREMENT, popup_id INTEGER NOT NULL, user_id TEXT, viewed_at INTEGER NOT NULL, clicked INTEGER DEFAULT 0, click_target TEXT, user_agent TEXT);
CREATE TABLE popups (   id INTEGER PRIMARY KEY AUTOINCREMENT,   title TEXT NOT NULL,   body_html TEXT, image_url TEXT, link_url TEXT,   link_target TEXT DEFAULT '_blank',   popup_type TEXT DEFAULT 'modal',   channels TEXT DEFAULT '["WEB","MOBILE","APP"]',   audience TEXT DEFAULT '["all"]',   pages TEXT DEFAULT '["*"]',   start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,   priority INTEGER DEFAULT 0,   width INTEGER DEFAULT 480, height INTEGER,   position TEXT DEFAULT 'center', pos_x INTEGER, pos_y INTEGER,   show_today_close INTEGER DEFAULT 1,   show_week_close INTEGER DEFAULT 1,   background TEXT DEFAULT '#ffffff',   status TEXT DEFAULT 'active',   views INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0, closes INTEGER DEFAULT 0,   created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL );
CREATE TABLE push_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT NOT NULL, body TEXT, url TEXT, icon TEXT, badge TEXT, tag TEXT, queued_at INTEGER NOT NULL, fetched_at INTEGER);
CREATE TABLE push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT, auth TEXT, ua TEXT, enabled INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE recording_parts ( recording_id INTEGER NOT NULL, part_number INTEGER NOT NULL, r2_key TEXT NOT NULL, upload_id TEXT NOT NULL, etag TEXT NOT NULL, size_bytes INTEGER, created_at INTEGER NOT NULL, PRIMARY KEY (recording_id, part_number) );
CREATE TABLE recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL, teacher_id TEXT, teacher_name TEXT,
  filename TEXT, participant_ids TEXT, participant_names TEXT,
  consented_user_ids TEXT,
  started_at INTEGER, ended_at INTEGER, duration_ms INTEGER,
  size_bytes INTEGER, expires_at INTEGER, storage TEXT,
  status TEXT DEFAULT 'recording'
, file_url TEXT);
CREATE TABLE referral_codes (code TEXT PRIMARY KEY, uid TEXT NOT NULL UNIQUE, created_at INTEGER);
CREATE TABLE referrals (id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_uid TEXT NOT NULL, referred_uid TEXT NOT NULL, code TEXT, status TEXT DEFAULT 'pending', reward_points INTEGER DEFAULT 0, created_at INTEGER, UNIQUE(referrer_uid, referred_uid));
CREATE TABLE retention_messages (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       user_id TEXT NOT NULL, phone TEXT, category TEXT, channel TEXT,
       message TEXT, status TEXT, detail TEXT, sent_at INTEGER NOT NULL
     );
CREATE TABLE retention_settings (
       id INTEGER PRIMARY KEY CHECK(id=1),
       auto_enabled INTEGER DEFAULT 0, daily_cap INTEGER DEFAULT 20,
       resend_gap_days INTEGER DEFAULT 30, link_url TEXT, updated_at INTEGER
     );
CREATE TABLE review_quiz_results (id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL, user_id TEXT NOT NULL, user_name TEXT, score INTEGER NOT NULL, total INTEGER NOT NULL, answers TEXT, created_at INTEGER NOT NULL, detail TEXT);
CREATE TABLE review_quiz_rewards (award_id TEXT PRIMARY KEY, user_id TEXT, amount INTEGER, created_at INTEGER);
CREATE TABLE review_quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT, questions TEXT NOT NULL, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER, level TEXT, textbook TEXT, lesson_no INTEGER, source TEXT DEFAULT 'manual', draw TEXT, lang TEXT);
CREATE TABLE reward_limits (
  teacher_id TEXT NOT NULL, date TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (teacher_id, date)
);
CREATE TABLE rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id TEXT, student_id TEXT, room_id TEXT,
  type TEXT, value TEXT, message TEXT,
  issued_at INTEGER NOT NULL, expires_at INTEGER,
  status TEXT DEFAULT 'active'
);
CREATE TABLE room_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, alert_type TEXT NOT NULL, severity TEXT, detail TEXT, triggered_at INTEGER NOT NULL, acknowledged_by TEXT, acknowledged_at INTEGER, auto_action TEXT);
CREATE TABLE room_members (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, user_id TEXT NOT NULL, user_name TEXT, role TEXT NOT NULL, invited_at INTEGER NOT NULL, invited_by TEXT, UNIQUE(room_id, user_id));
CREATE TABLE room_tokens (jti TEXT PRIMARY KEY, room_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, issued_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked INTEGER DEFAULT 0, consumed_at INTEGER, ip TEXT, user_agent TEXT);
CREATE TABLE saved_posters (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, config TEXT NOT NULL, width INTEGER DEFAULT 1080, height INTEGER DEFAULT 1080, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE schedule_change_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER, request_type TEXT DEFAULT 'postpone', requester_role TEXT DEFAULT 'teacher', requester_name TEXT, teacher_name TEXT, student_name TEXT, orig_date TEXT, orig_time TEXT, new_date TEXT, new_time TEXT, reason TEXT, status TEXT DEFAULT 'pending', decided_by TEXT, decided_at INTEGER, decide_memo TEXT, created_at INTEGER NOT NULL, fee_type TEXT, minutes_before INTEGER, requester_uid TEXT);
CREATE TABLE settlement_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pay_id TEXT UNIQUE, channel TEXT NOT NULL,
      branch_id TEXT NOT NULL, branch_name TEXT, period TEXT NOT NULL,
      gross_amount INTEGER NOT NULL, pg_fee INTEGER NOT NULL, net_amount INTEGER NOT NULL,
      hq_rate REAL NOT NULL DEFAULT 0.15, hq_fee INTEGER NOT NULL, branch_payout INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', paid_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE student_badges (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, badge_code TEXT NOT NULL, awarded_at INTEGER NOT NULL, UNIQUE(user_id, badge_code));
CREATE TABLE student_consultations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, consult_at INTEGER NOT NULL, channel TEXT, counselor TEXT, topic TEXT, content TEXT, follow_up_at INTEGER, status TEXT DEFAULT 'open', created_at INTEGER NOT NULL);
CREATE TABLE student_evaluations (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, eval_at INTEGER NOT NULL, eval_type TEXT, level TEXT, score_speaking REAL, score_listening REAL, score_reading REAL, score_writing REAL, score_total REAL, evaluator TEXT, comment TEXT, next_goal TEXT, created_at INTEGER NOT NULL, score_overall REAL, parent_notified INTEGER DEFAULT 0, student_uid TEXT, student_name TEXT, teacher_uid TEXT, teacher_name TEXT, room_id TEXT, lesson_title TEXT, lesson_date TEXT, score_participation INTEGER, score_comprehension INTEGER, score_homework INTEGER, score_attitude INTEGER, score_grammar REAL, score_vocab REAL, strengths TEXT, improvements TEXT, weaknesses TEXT, next_goals TEXT, teacher_comment TEXT, parent_notified_at INTEGER, viewed_by_parent INTEGER DEFAULT 0, viewed_at INTEGER, updated_at INTEGER, notify_pending INTEGER, notify_phone TEXT);
CREATE TABLE student_extensions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, prev_end_date TEXT, new_end_date TEXT NOT NULL, months_added INTEGER, reason TEXT, created_by TEXT, created_at INTEGER NOT NULL);
CREATE TABLE student_inquiries (id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_no TEXT NOT NULL, name TEXT NOT NULL, contact TEXT NOT NULL, email TEXT, program TEXT, message TEXT NOT NULL, status TEXT DEFAULT 'new', memo TEXT, ip_address TEXT, user_agent TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, responded_at INTEGER, responded_by TEXT);
CREATE TABLE student_org_override (
  user_id     TEXT PRIMARY KEY,            -- students_erp.user_id
  org_node_id INTEGER NOT NULL,            -- 강제 귀속 대리점 노드
  reason      TEXT,
  updated_at  INTEGER NOT NULL
);
CREATE TABLE student_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, paid_at INTEGER, period_start TEXT, period_end TEXT, amount_krw INTEGER NOT NULL, method TEXT, memo TEXT, status TEXT DEFAULT 'paid', created_at INTEGER NOT NULL);
CREATE TABLE student_points (user_id TEXT PRIMARY KEY, student_name TEXT, balance INTEGER NOT NULL DEFAULT 0, lifetime_earned INTEGER NOT NULL DEFAULT 0, lifetime_spent INTEGER NOT NULL DEFAULT 0, last_earned_at INTEGER, last_spent_at INTEGER, updated_at INTEGER NOT NULL);
CREATE TABLE student_pw_reset (user_id TEXT PRIMARY KEY, code_hash TEXT, expires_at INTEGER, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, first_sent_at INTEGER, created_at INTEGER);
CREATE TABLE student_retention (
       user_id TEXT PRIMARY KEY,
       member_id INTEGER,
       start_date TEXT,
       end_date TEXT,
       last_class TEXT,
       days_inactive INTEGER,
       days_to_expiry INTEGER,
       category TEXT,
       contacted INTEGER DEFAULT 0,
       contacted_at INTEGER,
       updated_at INTEGER NOT NULL
     , phone TEXT, age INTEGER);
CREATE TABLE student_streaks (student_uid TEXT PRIMARY KEY, current_streak INTEGER DEFAULT 0, longest_streak INTEGER DEFAULT 0, last_check_date TEXT, gems INTEGER DEFAULT 0, total_gems_earned INTEGER DEFAULT 0, updated_at INTEGER);
CREATE TABLE student_textbook_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, textbook_id INTEGER, textbook_name TEXT, level TEXT, started_at INTEGER, ended_at INTEGER, progress_pct INTEGER DEFAULT 0, status TEXT DEFAULT 'active', created_at INTEGER NOT NULL);
CREATE TABLE student_traits (
       user_id TEXT PRIMARY KEY,
       gender TEXT, mbti TEXT, interests TEXT, personality TEXT,
       source TEXT, updated_at INTEGER NOT NULL
     );
CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, korean_name TEXT, english_name TEXT, status TEXT DEFAULT '정상', signup_date TEXT, end_date TEXT, created_at INTEGER, school TEXT, grade TEXT, kakao_id TEXT, parent_kakao_id TEXT, address TEXT, birth_date TEXT, notes TEXT, username TEXT, login_id TEXT, payment_type TEXT, classes_per_week INTEGER, points INTEGER DEFAULT 0, student_phone TEXT, parent_phone TEXT, teacher_phone TEXT, shop_name TEXT, hq_name TEXT, branch1_name TEXT, branch2_name TEXT, franchise TEXT, updated_at INTEGER, student_id TEXT, phone TEXT, center TEXT, password_hash TEXT, last_login_at INTEGER, student_name TEXT, parent_name TEXT, parent_user_id TEXT, level TEXT, textbook TEXT, program TEXT, source TEXT, email TEXT, age TEXT, wf_verified_at INTEGER);
CREATE TABLE subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, student_name TEXT, plan TEXT, amount INTEGER, status TEXT DEFAULT 'active', next_billing_at INTEGER, last_billed_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, billing_key TEXT, customer_key TEXT, fail_count INTEGER DEFAULT 0, teacher_id TEXT, weekly INTEGER, minutes INTEGER);
CREATE TABLE supervisor_assignments (id INTEGER PRIMARY KEY AUTOINCREMENT, mentor_uid TEXT, junior_uid TEXT, room_id TEXT, status TEXT DEFAULT 'active', start_at INTEGER, end_at INTEGER, created_at INTEGER);
CREATE TABLE teacher_account_links (username TEXT PRIMARY KEY, teacher_id TEXT NOT NULL, teacher_name TEXT, linked_by TEXT, linked_at INTEGER);
CREATE TABLE teacher_class_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, teacher_uid TEXT, teacher_name TEXT, student_name TEXT, duration_min INTEGER, metrics_json TEXT, feedback_ko TEXT, feedback_en TEXT, source TEXT, created_at INTEGER NOT NULL, UNIQUE(room_id));
CREATE TABLE teacher_evaluations (   id INTEGER PRIMARY KEY AUTOINCREMENT,   teacher_id INTEGER NOT NULL,   year INTEGER NOT NULL,   month INTEGER NOT NULL,   score_instruction REAL,   score_retention REAL,   score_punctuality REAL,   score_admin REAL,   score_contribution REAL,   weighted_total REAL,   grade TEXT,   strengths TEXT,   improvements TEXT,   evaluator TEXT,   evaluated_at INTEGER,   UNIQUE(teacher_id, year, month) );
CREATE TABLE teacher_feedbacks (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, room_id TEXT, attendance_id INTEGER, teacher_name TEXT, class_at INTEGER NOT NULL, rating INTEGER, summary TEXT, content TEXT, action_items TEXT, created_at INTEGER NOT NULL);
CREATE TABLE teacher_legacy_accounts (username TEXT PRIMARY KEY, teacher_name TEXT, teacher_id TEXT, roster_matched INTEGER DEFAULT 0, source TEXT, created_at INTEGER, last_login_at INTEGER);
CREATE TABLE teacher_mbti (teacher_uid TEXT PRIMARY KEY, teacher_name TEXT, mbti TEXT, hobby TEXT, teaching_style TEXT, intro TEXT, updated_at INTEGER, photo_url TEXT);
CREATE TABLE teacher_monthly_classes (   id INTEGER PRIMARY KEY AUTOINCREMENT,   teacher_id INTEGER NOT NULL,   year INTEGER NOT NULL,   month INTEGER NOT NULL,   class_count INTEGER NOT NULL DEFAULT 0,   notes TEXT,   updated_at INTEGER NOT NULL,   UNIQUE(teacher_id, year, month) );
CREATE TABLE teacher_outages (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_username TEXT NOT NULL, reporter_name TEXT, teacher_name TEXT, kind TEXT NOT NULL DEFAULT 'power', expected_min INTEGER, memo TEXT, affected_count INTEGER DEFAULT 0, affected_text TEXT, status TEXT NOT NULL DEFAULT 'active', started_at INTEGER NOT NULL, resolved_at INTEGER, resolved_by TEXT);
CREATE TABLE teacher_payroll (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER NOT NULL, teacher_name TEXT, year INTEGER NOT NULL, month INTEGER NOT NULL, lesson_count INTEGER DEFAULT 0, total_minutes INTEGER DEFAULT 0, fee_per_10min INTEGER DEFAULT 0, calculated_amount INTEGER DEFAULT 0, adjusted_amount INTEGER, paid_amount INTEGER, status TEXT DEFAULT 'pending', paid_at INTEGER, memo TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deduction_total INTEGER DEFAULT 0, final_amount INTEGER, UNIQUE(teacher_id, year, month));
CREATE TABLE teacher_payroll_auto (
       teacher_id INTEGER NOT NULL,
       teacher_name TEXT,
       year INTEGER NOT NULL,
       month INTEGER NOT NULL,
       completed_classes INTEGER DEFAULT 0,
       total_classes INTEGER DEFAULT 0,
       pay_php INTEGER DEFAULT 0,
       updated_at INTEGER NOT NULL, paid INTEGER DEFAULT 0, paid_at INTEGER,
       PRIMARY KEY (teacher_id, year, month)
     );
CREATE TABLE teacher_praises (id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_uid TEXT NOT NULL, teacher_name TEXT, star_rating INTEGER NOT NULL, praise_text TEXT, category TEXT, ip_hash TEXT, created_at INTEGER NOT NULL);
CREATE TABLE teacher_pricing (teacher_id TEXT PRIMARY KEY, rate_pct INTEGER NOT NULL DEFAULT 100, note TEXT, updated_by TEXT, updated_at INTEGER);
CREATE TABLE teacher_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, korean_name TEXT NOT NULL, english_name TEXT, email TEXT, phone TEXT, kakao_id TEXT, dob TEXT, gender TEXT, image_url TEXT, intro_video_url TEXT, active_region TEXT, origin_region TEXT, fee_per_10min INTEGER, group_name TEXT, status TEXT DEFAULT '활동중', join_date TEXT, leave_date TEXT, education TEXT, career TEXT, certifications TEXT, available_days TEXT, available_hours TEXT, bank_name TEXT, bank_account TEXT, notes TEXT, created_at INTEGER NOT NULL, updated_at INTEGER, mbti TEXT, level TEXT, nationality TEXT, linked_teacher_id INTEGER);
CREATE TABLE teacher_vacations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id TEXT NOT NULL, teacher_name TEXT,
      start_date TEXT NOT NULL, end_date TEXT NOT NULL, type TEXT DEFAULT 'vacation', memo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(teacher_id, start_date, end_date));
CREATE TABLE teachers (   id INTEGER PRIMARY KEY AUTOINCREMENT,   user_id TEXT,   name TEXT NOT NULL,   center_id INTEGER,   rank TEXT,   hourly_rate_php INTEGER,   status TEXT,   years INTEGER,   rate_per_10min_php REAL,   active INTEGER DEFAULT 1,   created_at INTEGER NOT NULL,   updated_at INTEGER NOT NULL );
CREATE TABLE textbook_files (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT NOT NULL, mime TEXT, ext TEXT, size_bytes INTEGER, r2_key TEXT NOT NULL, textbook_id INTEGER, level TEXT, unit_no INTEGER, description TEXT, uploaded_by TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE textbooks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, level TEXT, units INTEGER, isbn TEXT, publisher TEXT, notes TEXT, active INTEGER DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, video_url TEXT, video_type TEXT DEFAULT 'preview', video_title TEXT);
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT UNIQUE NOT NULL, username TEXT, password_hash TEXT, name TEXT, phone TEXT, email TEXT, level TEXT, age TEXT, source TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_login_at INTEGER, status TEXT DEFAULT 'active');
CREATE TABLE ux_events (day TEXT NOT NULL, key TEXT NOT NULL, uid TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, key, uid));
CREATE TABLE vc_quality (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, room TEXT, uid TEXT, name TEXT, role TEXT, avg_loss REAL, max_loss REAL, avg_rtt REAL, aao INTEGER, samples INTEGER);
CREATE TABLE vc_roster (room_id TEXT NOT NULL, peer_id TEXT NOT NULL, account_uid TEXT NOT NULL, name TEXT, role TEXT, updated_at INTEGER NOT NULL, PRIMARY KEY (room_id, peer_id));
CREATE TABLE video_subtitles (id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT, lang TEXT, srt_content TEXT, created_at INTEGER);
CREATE TABLE vocab_guest_trial (uid TEXT NOT NULL, trial_day INTEGER NOT NULL, started_at INTEGER NOT NULL, PRIMARY KEY (uid, trial_day));
CREATE TABLE vocab_quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, question TEXT NOT NULL, options TEXT NOT NULL, correct_index INTEGER NOT NULL, hint TEXT, source_word TEXT, quiz_type TEXT, completed INTEGER DEFAULT 0, user_answer INTEGER, is_correct INTEGER, created_at INTEGER NOT NULL, completed_at INTEGER);
CREATE TABLE vocab_review_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, vocab_id INTEGER, correct INTEGER NOT NULL, reviewed_at INTEGER NOT NULL);
CREATE TABLE vocab_rewards (award_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT, amount INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE vocab_synonyms (id INTEGER PRIMARY KEY AUTOINCREMENT, vocab_id INTEGER NOT NULL, synonym TEXT NOT NULL, meaning_ko TEXT, example TEXT, created_at INTEGER NOT NULL);
CREATE TABLE vocabulary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, word TEXT NOT NULL, korean TEXT, example TEXT, level INTEGER DEFAULT 0, next_review_at INTEGER NOT NULL, last_reviewed_at INTEGER, correct_count INTEGER DEFAULT 0, wrong_count INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE voice_coaching (id INTEGER PRIMARY KEY AUTOINCREMENT, student_uid TEXT NOT NULL, student_name TEXT, target_text TEXT, transcribed_text TEXT, accuracy_score INTEGER, pronunciation_score INTEGER, fluency_score INTEGER, ai_feedback TEXT, suggestion TEXT, audio_url TEXT, created_at INTEGER NOT NULL, avg_logprob REAL, no_speech_prob REAL, speech_rate REAL, max_gap REAL, acoustic_used INTEGER, azure_accuracy REAL, azure_fluency REAL, azure_completeness REAL, azure_used INTEGER, azure_diag TEXT);
CREATE TABLE voice_diary (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, date TEXT, audio_url TEXT, transcript_en TEXT, ai_correction TEXT, ai_encouragement_ko TEXT, score INTEGER, duration_seconds INTEGER, created_at INTEGER);
CREATE TABLE webauthn_credentials (credential_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, public_key TEXT NOT NULL, alg INTEGER NOT NULL, counter INTEGER DEFAULT 0, transports TEXT, device_label TEXT, rp_id TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER);
CREATE TABLE wf_parent_verify (user_id TEXT PRIMARY KEY, code_hash TEXT, expires_at INTEGER, attempts INTEGER DEFAULT 0, sent_count INTEGER DEFAULT 0, first_sent_at INTEGER, created_at INTEGER);
CREATE TABLE zh_passage (id INTEGER PRIMARY KEY AUTOINCREMENT, textbook TEXT NOT NULL, level TEXT, lesson_no INTEGER, title_zh TEXT, title_ko TEXT, page INTEGER, hanzi TEXT NOT NULL, ko TEXT, sentences TEXT, questions TEXT, keywords TEXT, active INTEGER DEFAULT 1, created_at INTEGER, updated_at INTEGER);
CREATE TABLE zh_vocab (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  textbook TEXT,
  level TEXT,
  lesson_no INTEGER,
  type TEXT NOT NULL,
  hanzi TEXT NOT NULL,
  pinyin TEXT,
  ko TEXT,
  words TEXT,
  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- ═══════════════════ 인덱스 ═══════════════════
CREATE INDEX idx_admin_login_history_ip ON admin_login_history(ip, login_at);
CREATE INDEX idx_admin_login_history_user ON admin_login_history(username, login_at);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE INDEX idx_admin_sessions_username ON admin_sessions(username);
CREATE INDEX idx_ai_an_student ON ai_student_analysis(student_uid, generated_at DESC);
CREATE INDEX idx_alerts_room ON room_alerts(room_id, triggered_at);
CREATE INDEX idx_alimtalk_log_reason    ON alimtalk_log(reason, sent_at);
CREATE INDEX idx_alimtalk_log_token     ON alimtalk_log(track_token);
CREATE INDEX idx_alimtalk_log_unread    ON alimtalk_log(read_at, sent_at);
CREATE INDEX idx_alimtalk_log_user_sent ON alimtalk_log(user_id, sent_at);
CREATE INDEX idx_appr_status ON approval_requests(status, created_at);
CREATE INDEX idx_appr_user ON approval_requests(requester_username, created_at);
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_attendance_joined_at ON attendance(joined_at);
CREATE INDEX idx_attendance_room ON attendance(room_id);
CREATE INDEX idx_attendance_user ON attendance(user_id);
CREATE INDEX idx_attendance_user_date ON attendance(user_id, date);
CREATE INDEX idx_audit_admin ON admin_audit_logs(admin_uid, created_at);
CREATE INDEX idx_badges_user ON student_badges(user_id, awarded_at DESC);
CREATE INDEX idx_cal_action ON class_audit_log(action, created_at);
CREATE INDEX idx_cal_created ON class_audit_log(created_at);
CREATE INDEX idx_cal_date ON calendar_events(date);
CREATE INDEX idx_cal_sched ON class_audit_log(schedule_id);
CREATE INDEX idx_chat_room_time ON chat_messages(room_id, sent_at DESC);
CREATE INDEX idx_chat_uid ON ai_friend_chats(student_uid, created_at);
CREATE INDEX idx_class_ratings_teacher ON class_ratings(teacher_name, created_at);
CREATE INDEX idx_class_schedules_date ON class_schedules(scheduled_date);
CREATE INDEX idx_class_schedules_status ON class_schedules(status);
CREATE INDEX idx_class_schedules_user ON class_schedules(user_id);
CREATE INDEX idx_consents_active ON consents(user_id, withdrawn_at);
CREATE INDEX idx_consents_user ON consents(user_id);
CREATE INDEX idx_emergency_time ON emergency_events(triggered_at);
CREATE INDEX idx_en_vocab_active ON en_vocab(active, type);
CREATE INDEX idx_eval_student ON student_evaluations(student_uid, created_at DESC);
CREATE INDEX idx_eval_teacher ON student_evaluations(teacher_uid, created_at DESC);
CREATE INDEX idx_fbd_teacher ON feedback_drafts(teacher_name, lesson_date);
CREATE INDEX idx_fexp_spent ON finance_expenses(spent_at);
CREATE INDEX idx_game_stats_week ON game_stats(coins_week DESC);
CREATE INDEX idx_gs_game_time ON game_sessions(game, ended_at);
CREATE INDEX idx_gs_uid_time ON game_sessions(uid, ended_at);
CREATE INDEX idx_inq_status ON inquiries(status, created_at DESC);
CREATE INDEX idx_ja_export ON judgment_analysis(migrated_at, id);
CREATE INDEX idx_ja_misc ON judgment_analysis(misconception_tag);
CREATE INDEX idx_ja_student ON judgment_analysis(student_uid, created_at);
CREATE INDEX idx_je_pending ON judgment_events(analyzed);
CREATE INDEX idx_je_student ON judgment_events(student_uid, created_at);
CREATE INDEX idx_kkin_phone ON kakao_inbound(sender_phone);
CREATE INDEX idx_kkin_received ON kakao_inbound(received_at DESC);
CREATE INDEX idx_ledger_branch ON settlement_ledger(branch_id, period);
CREATE INDEX idx_lesson_insights_student ON lesson_insights(student_uid, created_at DESC);
CREATE INDEX idx_lts_period ON learning_trend_snapshots(period);
CREATE INDEX idx_menu_hits_day ON admin_menu_hits(day, hits);
CREATE INDEX idx_mkt_created ON marketing_campaigns(created_at DESC);
CREATE INDEX idx_monthly_reports_period ON monthly_reports(period);
CREATE INDEX idx_notif_status_created ON notification_queue(status, created_at);
CREATE INDEX idx_org_nodes_matchkey  ON org_nodes(match_key);
CREATE INDEX idx_org_nodes_parent   ON org_nodes(parent_id);
CREATE INDEX idx_org_nodes_path      ON org_nodes(path);
CREATE INDEX idx_org_nodes_type      ON org_nodes(type, active);
CREATE INDEX idx_outage_status ON teacher_outages(status, started_at);
CREATE INDEX idx_outage_user ON teacher_outages(reporter_username, status);
CREATE INDEX idx_overdue_user ON payment_overdue_log(user_id, sent_at DESC);
CREATE INDEX idx_payment_orders_uid ON payment_orders(uid, created_at);
CREATE INDEX idx_payroll_period ON teacher_payroll(year, month);
CREATE INDEX idx_payslips_period ON payslips(period);
CREATE INDEX idx_perf_task ON analysis_perf_log(task, created_at);
CREATE INDEX idx_popup_events_popup ON popup_events(popup_id, created_at);
CREATE INDEX idx_popup_events_type ON popup_events(event_type, created_at);
CREATE INDEX idx_popups_dates ON popups(start_at, end_at);
CREATE INDEX idx_popups_priority ON popups(priority DESC);
CREATE INDEX idx_popups_status ON popups(status);
CREATE INDEX idx_praise_teacher ON teacher_praises(teacher_uid, created_at DESC);
CREATE INDEX idx_push_queue_ep ON push_queue(endpoint, fetched_at, queued_at DESC);
CREATE INDEX idx_push_user ON push_subscriptions(user_id, enabled);
CREATE INDEX idx_recordings_room ON recordings(room_id);
CREATE INDEX idx_recordings_status_storage ON recordings (status, storage);
CREATE INDEX idx_recordings_teacher ON recordings(teacher_id);
CREATE INDEX idx_recordings_teacher_started ON recordings (teacher_id, started_at DESC);
CREATE INDEX idx_retention_msg_user ON retention_messages(user_id, sent_at);
CREATE INDEX idx_rewards_student ON rewards(student_id, status);
CREATE INDEX idx_room_tokens_room ON room_tokens(room_id, expires_at);
CREATE INDEX idx_rq_results_quiz ON review_quiz_results(quiz_id, created_at DESC);
CREATE INDEX idx_rq_results_user ON review_quiz_results(user_id, created_at DESC);
CREATE INDEX idx_sched_user_date ON class_schedules(user_id, scheduled_date);
CREATE INDEX idx_scr_status ON schedule_change_requests(status, created_at);
CREATE INDEX idx_settle_ledger_node   ON org_settlement_ledger(node_id, period);
CREATE INDEX idx_settle_ledger_period ON org_settlement_ledger(period, node_type);
CREATE INDEX idx_student_org_override_node ON student_org_override(org_node_id);
CREATE INDEX idx_student_payments_status_paid ON student_payments(status, paid_at);
CREATE INDEX idx_student_payments_user_id ON student_payments(user_id);
CREATE INDEX idx_student_retention_cat ON student_retention(category, days_to_expiry);
CREATE INDEX idx_tcf_teacher ON teacher_class_feedback(teacher_uid, created_at);
CREATE INDEX idx_te_year_month ON teacher_evaluations(year, month);
CREATE INDEX idx_teachers_active ON teachers(active);
CREATE INDEX idx_tmc_year_month ON teacher_monthly_classes(year, month);
CREATE INDEX idx_vocab_log_user ON vocab_review_log(user_id, reviewed_at DESC);
CREATE INDEX idx_vocab_user_review ON vocabulary(user_id, next_review_at ASC);
CREATE INDEX idx_voice_student ON voice_coaching(student_uid, created_at DESC);
CREATE INDEX idx_webauthn_uid ON webauthn_credentials(user_id);
CREATE INDEX idx_zh_vocab_lookup ON zh_vocab(level, textbook, active);
CREATE UNIQUE INDEX uq_sched_teacher_slot ON class_schedules(teacher_id, scheduled_date, start_time) WHERE status='active' AND scheduled_date IS NOT NULL AND teacher_id IS NOT NULL;

-- ═══════════════════ 트리거 ═══════════════════
CREATE TRIGGER trg_prl_occurred_at AFTER INSERT ON point_rule_log FOR EACH ROW WHEN NEW.occurred_at IS NULL BEGIN UPDATE point_rule_log SET occurred_at = NEW.triggered_at WHERE id = NEW.id; END;
