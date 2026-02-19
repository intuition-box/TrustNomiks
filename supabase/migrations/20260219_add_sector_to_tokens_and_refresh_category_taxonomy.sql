-- Add project sector and align token category taxonomy with parent-child consistency.
-- Safe to run multiple times.

BEGIN;

ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS sector text;

-- Drop existing category/sector checks before backfilling data.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'tokens'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%category%'
        OR pg_get_constraintdef(oid) ILIKE '%sector%'
      )
  LOOP
    EXECUTE format('ALTER TABLE tokens DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

-- Normalize legacy categories to the new taxonomy.
UPDATE tokens
SET category = CASE category
  WHEN 'defi' THEN 'financial'
  WHEN 'gaming' THEN 'open-digital-economy'
  WHEN 'social' THEN 'two-sided-market'
  WHEN 'ai' THEN 'infrastructure'
  WHEN 'depin' THEN 'infrastructure'
  WHEN 'l1' THEN 'infrastructure'
  WHEN 'l2' THEN 'infrastructure'
  WHEN 'other' THEN 'two-sided-market'
  ELSE category
END
WHERE category IN ('defi', 'gaming', 'social', 'ai', 'depin', 'l1', 'l2', 'other');

-- Normalize sector slugs (if any values already exist).
UPDATE tokens
SET sector = replace(lower(btrim(sector)), '_', '-')
WHERE sector IS NOT NULL;

-- Derive/repair category from sector when possible.
UPDATE tokens
SET category = CASE
  WHEN sector IN (
    'asset-management', 'cex', 'dex', 'lending', 'yield-strategy',
    'gambling-prediction', 'derivative-market', 'funding'
  ) THEN 'financial'
  WHEN sector IN (
    'oracle-data', 'artificial-intelligence', 'baas', 'l1', 'l2', 'l0', 'bridge', 'depin'
  ) THEN 'infrastructure'
  WHEN sector IN (
    'advertising', 'content-creation', 'gaming-ecosystem', 'game', 'fan-token', 'metaverse'
  ) THEN 'open-digital-economy'
  WHEN sector IN ('payment-platform', 'rewards', 'memes-token') THEN 'payment'
  WHEN sector IN ('collectible-nft', 'identity-reputation', 'other') THEN 'two-sided-market'
  ELSE category
END
WHERE sector IS NOT NULL;

-- Null-out unsupported values to keep legacy rows valid.
UPDATE tokens
SET category = NULL
WHERE category IS NOT NULL
  AND category NOT IN (
    'open-digital-economy',
    'payment',
    'two-sided-market',
    'infrastructure',
    'financial'
  );

UPDATE tokens
SET sector = NULL
WHERE sector IS NOT NULL
  AND sector NOT IN (
    'asset-management',
    'cex',
    'dex',
    'lending',
    'yield-strategy',
    'gambling-prediction',
    'derivative-market',
    'funding',
    'oracle-data',
    'artificial-intelligence',
    'baas',
    'l1',
    'l2',
    'l0',
    'bridge',
    'depin',
    'advertising',
    'content-creation',
    'gaming-ecosystem',
    'game',
    'fan-token',
    'metaverse',
    'payment-platform',
    'rewards',
    'memes-token',
    'collectible-nft',
    'identity-reputation',
    'other'
  );

ALTER TABLE tokens
ADD CONSTRAINT tokens_category_check
CHECK (
  category IS NULL
  OR category IN (
    'open-digital-economy',
    'payment',
    'two-sided-market',
    'infrastructure',
    'financial'
  )
);

ALTER TABLE tokens
ADD CONSTRAINT tokens_sector_check
CHECK (
  sector IS NULL
  OR sector IN (
    'asset-management',
    'cex',
    'dex',
    'lending',
    'yield-strategy',
    'gambling-prediction',
    'derivative-market',
    'funding',
    'oracle-data',
    'artificial-intelligence',
    'baas',
    'l1',
    'l2',
    'l0',
    'bridge',
    'depin',
    'advertising',
    'content-creation',
    'gaming-ecosystem',
    'game',
    'fan-token',
    'metaverse',
    'payment-platform',
    'rewards',
    'memes-token',
    'collectible-nft',
    'identity-reputation',
    'other'
  )
);

ALTER TABLE tokens
ADD CONSTRAINT tokens_sector_category_consistency_check
CHECK (
  sector IS NULL
  OR (
    category = 'financial'
    AND sector IN (
      'asset-management',
      'cex',
      'dex',
      'lending',
      'yield-strategy',
      'gambling-prediction',
      'derivative-market',
      'funding'
    )
  )
  OR (
    category = 'infrastructure'
    AND sector IN (
      'oracle-data',
      'artificial-intelligence',
      'baas',
      'l1',
      'l2',
      'l0',
      'bridge',
      'depin'
    )
  )
  OR (
    category = 'open-digital-economy'
    AND sector IN (
      'advertising',
      'content-creation',
      'gaming-ecosystem',
      'game',
      'fan-token',
      'metaverse'
    )
  )
  OR (
    category = 'payment'
    AND sector IN (
      'payment-platform',
      'rewards',
      'memes-token'
    )
  )
  OR (
    category = 'two-sided-market'
    AND sector IN (
      'collectible-nft',
      'identity-reputation',
      'other'
    )
  )
);

COMMIT;
