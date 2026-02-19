-- Replace legacy quarterly vesting frequency with yearly.
-- Safe to run multiple times.

BEGIN;

-- Defensive backfill in case legacy rows exist.
UPDATE vesting_schedules
SET frequency = 'yearly'
WHERE frequency = 'quarterly';

-- Recreate check constraint with the new allowed values.
ALTER TABLE vesting_schedules
DROP CONSTRAINT IF EXISTS vesting_schedules_frequency_check;

ALTER TABLE vesting_schedules
ADD CONSTRAINT vesting_schedules_frequency_check
CHECK (
  frequency IN ('daily', 'monthly', 'yearly', 'immediate', 'custom')
);

COMMIT;
