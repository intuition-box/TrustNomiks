-- Uniqueness for public.tokens.
--
-- The table shipped with no uniqueness at all: not on coingecko_id, not on the
-- contract address, not on anything but the surrogate primary key. Two
-- contributors adding the same token, a double-submit, or a re-run of any
-- future importer all silently mint a duplicate registry entry, and duplicates
-- are corrosive here: they split a token's claims, its challenges and its
-- on-chain provenance across two rows that each look authoritative.
--
-- Two partial unique indexes, matching how a token is actually identified:
--
--   1. coingecko_id -- one registry entry per CoinGecko coin. Tokenomics is a
--      property of the PROJECT, not of a deployment: Arbitrum's allocation is
--      the same whichever chain you read it on, so a multi-chain token is still
--      one entry. Partial, because coingecko_id is legitimately NULL for a
--      token CoinGecko does not list.
--
--   2. (chain, contract_address) -- one registry entry per deployed contract.
--      Lower-cased on both sides so an EVM address that differs only by
--      checksum casing still collides. Partial, because either column may be
--      NULL on a token whose contract is not yet known.
--
--      Trade-off, deliberate: the registry also holds Solana tokens, whose
--      base58 addresses ARE case-sensitive, so lower() is lossy there. It can
--      only ever produce a FALSE collision (never miss a true duplicate), and
--      that needs two distinct valid addresses differing solely by case, which
--      does not happen. Case-folding every chain is worth catching the very
--      real EVM checksum-casing duplicate.
--
-- No uniqueness on ticker: distinct projects legitimately share one (and this
-- registry already holds tokens whose tickers collide across ecosystems).
--
-- Verified against production before writing: 0 duplicate rows on all three
-- axes, so both indexes build without a data fix.

CREATE UNIQUE INDEX IF NOT EXISTS tokens_coingecko_id_key
  ON public.tokens (coingecko_id)
  WHERE coingecko_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tokens_chain_contract_address_key
  ON public.tokens (lower(chain), lower(contract_address))
  WHERE chain IS NOT NULL AND contract_address IS NOT NULL;

COMMENT ON INDEX public.tokens_coingecko_id_key IS
  'One registry entry per CoinGecko coin. Tokenomics is per project, not per chain deployment.';

COMMENT ON INDEX public.tokens_chain_contract_address_key IS
  'One registry entry per deployed contract. Lower-cased so EVM checksum casing still collides.';
