-- Migration 004: Crew Verdict System persistence
-- Idempotent; adds completed_verdict JSON column to crews table if not present.

ALTER TABLE crews ADD COLUMN verdict_payload TEXT;
