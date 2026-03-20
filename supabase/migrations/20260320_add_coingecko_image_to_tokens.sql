-- Store CoinGecko thumbnail URL for token logos
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS coingecko_image text;
