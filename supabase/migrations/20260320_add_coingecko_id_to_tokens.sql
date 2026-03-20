-- Add coingecko_id column to tokens table for CoinGecko API integration
BEGIN;

ALTER TABLE tokens ADD COLUMN IF NOT EXISTS coingecko_id text;

CREATE INDEX IF NOT EXISTS idx_tokens_coingecko_id ON tokens (coingecko_id) WHERE coingecko_id IS NOT NULL;

COMMIT;
