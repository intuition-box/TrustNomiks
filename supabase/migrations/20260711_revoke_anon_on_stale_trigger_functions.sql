-- ============================================================================
-- Revoke default PUBLIC/anon EXECUTE on the challenge stale-marking trigger
-- functions (Supabase advisor 0028, flagged by the concurrent onboarding
-- session).
--
-- These five SECURITY DEFINER functions are invoked ONLY by their AFTER-row
-- triggers on tokens / supply_metrics / emission_models / allocation_segments,
-- never called directly. A new function defaults to GRANT EXECUTE TO PUBLIC
-- (which includes anon), so the advisor flags them as anon-executable definer
-- functions. Triggers fire regardless of EXECUTE grants (the grant only gates
-- a direct CALL), so revoking anon/PUBLIC is safe and changes no behaviour. No
-- GRANT is restated: trigger invocation does not need one.
--
-- The stale helper they call, public.mark_stale_challenges_for_field(...),
-- already had its grants locked down in 20260709_add_challenges_rpcs.sql.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.tokens_draft_stales_challenges() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.supply_metrics_stales_challenges() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.emission_model_stales_challenges() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.token_identity_stales_challenges() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.allocation_segment_stales_challenges() FROM PUBLIC, anon;
