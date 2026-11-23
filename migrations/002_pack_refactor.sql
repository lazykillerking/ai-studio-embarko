-- BRAINPRINT question bank architecture refactor migration
-- Migrates the_mix from a question-owning pack to a virtual mode that aggregates packs.
-- Reassigns existing lv_076..lv_115 questions to social_circuit.
-- Reassigns existing tm_001..tm_015 questions to everyday_life.
-- Updates packs table to establish everyday_life and social_circuit.
-- Idempotent and safe: never drops or modifies Embarko's _litestream_seq or _litestream_lock tables.

-- 1. Ensure new packs exist in packs table
INSERT OR IGNORE INTO packs (id, slug, name, description, visual_theme, status, sort_order, created_at)
VALUES 
  ('everyday_life', 'everyday-life', 'EVERYDAY LIFE', 'General personality and everyday situations', 'everyday_life', 'published', 1, CURRENT_TIMESTAMP),
  ('social_circuit', 'social-circuit', 'SOCIAL CIRCUIT', 'Friendship, dating, relationships and social dynamics', 'social_circuit', 'published', 4, CURRENT_TIMESTAMP);

-- 2. Ensure the_mix pack entry reflects Mode status
INSERT OR IGNORE INTO packs (id, slug, name, description, visual_theme, status, sort_order, created_at)
VALUES
  ('the_mix', 'the-mix', 'THE MIX', 'Everyday dilemmas and instincts across all packs', 'the_mix', 'published', 0, CURRENT_TIMESTAMP);

UPDATE packs
SET name = 'THE MIX',
    description = 'Everyday dilemmas and instincts across all packs',
    sort_order = 0
WHERE id = 'the_mix';

-- 3. Migrate question records to their proper packs
UPDATE questions
SET pack_id = 'social_circuit'
WHERE (id LIKE 'lv_%' OR (id >= 'lv_076' AND id <= 'lv_115'))
  AND pack_id = 'the_mix';

UPDATE questions
SET pack_id = 'everyday_life'
WHERE (id LIKE 'tm_%' OR (id >= 'tm_001' AND id <= 'tm_015'))
  AND pack_id = 'the_mix';

-- 4. Clean up any stale question records referencing the_mix
UPDATE questions
SET pack_id = 'everyday_life'
WHERE pack_id = 'the_mix';
