-- ============================================================================
-- wallet_links: stop letting any account enumerate everyone's wallets
--
-- SELECT was `USING (true)` for every authenticated user, so any account
-- could read the user_id -> wallet_address mapping of every other user.
-- Attestations are public on-chain, but the link between an app identity and
-- an address is not: it deanonymizes who is behind which wallet.
--
-- Reads are now owner-only. The app's own reads were already scoped to the
-- caller (the contributor gate in the authenticated layout, the wallet-link
-- panel, publish-time wallet verification), so they are unaffected.
--
-- The two legitimately cross-user reads live in the challenge stake
-- evaluation (resolving a publisher's wallet to its user, and resolving
-- stakers' wallets) - a server-side trust computation in
-- api/challenges/[id]/evaluate-threshold. That route now performs them with
-- the service-role client, which is server-only and never reaches the
-- browser; it already used it to call evaluate_stake_threshold_tx. The raw
-- mapping is used to EXCLUDE interested parties from the tally and is never
-- returned to the caller.
--
-- Writes are untouched (they go through the wallet-link RPCs).
--
-- Apply via supabase-write MCP (standing authorization 2026-07-12); no
-- BEGIN/COMMIT wrapper. Verify with the cross-user probe: another user's
-- wallet links must read as zero rows, the caller's own must still resolve.
-- ============================================================================

DROP POLICY IF EXISTS "wallet_links: authenticated can read" ON wallet_links;

CREATE POLICY "wallet_links: owner can read" ON wallet_links
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
