-- BRAINPRINT question baseline statistics
-- Stores calibrated base crowd vote distributions for all questions
-- Real player answers are stored in population_votes and layered on top

CREATE TABLE IF NOT EXISTS question_base_stats (
  question_id TEXT PRIMARY KEY,
  base_count_0 INTEGER NOT NULL,
  base_count_1 INTEGER NOT NULL,
  base_count_2 INTEGER NOT NULL,
  base_count_3 INTEGER NOT NULL,
  total_base_votes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_question_base_stats_qid
  ON question_base_stats(question_id);
