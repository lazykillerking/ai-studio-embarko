-- BRAINPRINT initial SQLite schema
-- Idempotent migration; never modifies Embarko's _litestream_seq or _litestream_lock tables.

CREATE TABLE IF NOT EXISTS packs (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  visual_theme TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  difficulty TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'published',
  version INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (pack_id) REFERENCES packs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_questions_pack_status
  ON questions(pack_id, status);

CREATE TABLE IF NOT EXISTS daily_sets (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  challenge_date TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(pack_id, challenge_date),
  FOREIGN KEY (pack_id) REFERENCES packs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS population_votes (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  option_index INTEGER NOT NULL CHECK (option_index >= 0 AND option_index <= 3),
  created_at TEXT NOT NULL,
  UNIQUE(device_id, question_id),
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_population_votes_question_option
  ON population_votes(question_id, option_index);

CREATE TABLE IF NOT EXISTS solo_runs (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  challenge_date TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  answer_records TEXT NOT NULL DEFAULT '[]',
  axis_totals TEXT,
  archetype_id TEXT,
  total_points INTEGER NOT NULL DEFAULT 0,
  score_title TEXT,
  verdict_id TEXT,
  scoring_version INTEGER NOT NULL DEFAULT 1,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(device_id, pack_id, challenge_date),
  FOREIGN KEY (pack_id) REFERENCES packs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS crews (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  pack_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('themed', 'mixed')),
  question_ids TEXT NOT NULL,
  creator_device_id TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 12,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crew_members (
  id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  nickname TEXT,
  answers TEXT NOT NULL DEFAULT '{}',
  completed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(crew_id, device_id),
  FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
