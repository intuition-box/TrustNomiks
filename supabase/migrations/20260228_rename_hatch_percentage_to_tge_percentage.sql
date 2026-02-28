-- Rename hatch_percentage to tge_percentage in vesting_schedules.
-- RENAME COLUMN preserves all existing data.
-- Safe to run multiple times (IF EXISTS guard).

ALTER TABLE vesting_schedules
RENAME COLUMN hatch_percentage TO tge_percentage;
