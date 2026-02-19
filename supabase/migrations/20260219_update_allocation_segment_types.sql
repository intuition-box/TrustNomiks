-- Align allocation segment types with the TrustNomiks asset allocation taxonomy.
-- Safe to run multiple times.

BEGIN;

-- Replace any existing segment_type check constraints with the new one.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'allocation_segments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%segment_type%'
  LOOP
    EXECUTE format('ALTER TABLE allocation_segments DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

-- Backfill legacy segment_type values to the new generic categories.
UPDATE allocation_segments
SET segment_type = CASE segment_type
  WHEN 'team' THEN 'team-founders'
  WHEN 'advisors' THEN 'team-founders'
  WHEN 'investors' THEN 'funding-private'
  WHEN 'private_sale' THEN 'funding-private'
  WHEN 'public_sale' THEN 'funding-public'
  WHEN 'community' THEN 'airdrop'
  WHEN 'ecosystem' THEN 'rewards'
  WHEN 'other' THEN 'marketing'
  ELSE segment_type
END
WHERE segment_type IN (
  'team',
  'advisors',
  'investors',
  'private_sale',
  'public_sale',
  'community',
  'ecosystem',
  'other'
);

-- Ensure existing rows conform to the new enum-like taxonomy.
UPDATE allocation_segments
SET segment_type = 'marketing'
WHERE segment_type IS NULL
   OR btrim(segment_type) = ''
   OR segment_type NOT IN (
     'funding-private',
     'funding-public',
     'team-founders',
     'treasury',
     'marketing',
     'airdrop',
     'rewards',
     'liquidity'
   );

ALTER TABLE allocation_segments
ADD CONSTRAINT allocation_segments_segment_type_check
CHECK (
  segment_type IN (
    'funding-private',
    'funding-public',
    'team-founders',
    'treasury',
    'marketing',
    'airdrop',
    'rewards',
    'liquidity'
  )
);

COMMIT;
