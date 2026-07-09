-- ============================================================================
-- Follow-up to 20260709_harden_kg_views_and_function_grants.sql
--
-- Postgres grants EXECUTE on functions to PUBLIC by default, and anon
-- inherits from PUBLIC. Revoking EXECUTE from anon alone (previous
-- migration, §2) therefore had no effect — verified via pg_proc.proacl,
-- which still showed "=X/postgres" (PUBLIC execute) after applying it.
--
-- authenticated and service_role hold explicit EXECUTE grants, so revoking
-- PUBLIC changes nothing for the app or the ops scripts.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION save_allocations_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_supply_metrics_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_emission_model_tx(uuid, jsonb, timestamptz, integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_data_sources_tx(uuid, jsonb, jsonb, timestamptz, integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_vesting_schedules_tx(uuid, text[], jsonb, timestamptz, integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION save_risk_flags_tx(uuid, jsonb, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_visualization_ready(uuid) FROM PUBLIC;
