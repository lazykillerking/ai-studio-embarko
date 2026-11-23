-- Migration 003: Rotate today's daily question sets across all packs
DELETE FROM daily_sets WHERE challenge_date = '2026-11-23';
DELETE FROM solo_runs WHERE challenge_date = '2026-11-23';
