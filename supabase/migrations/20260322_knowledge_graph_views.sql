-- ============================================================================
-- Knowledge Graph Canonical Projection (V1)
--
-- Read-only views projecting the relational tokenomics data into a semantic
-- graph of atoms, triples, and provenance aligned with the Intuition Protocol.
--
-- ID strategy: UUID-based with semantic prefixes.
--   atom:token:{uuid}   atom:alloc:{uuid}   atom:vest:{uuid}
--   atom:emission:{uuid} atom:source:{uuid}  atom:risk:{uuid}
--   atom:category:{val}  atom:sector:{val}   atom:chain:{val}
--
-- Triples carry claim_group + origin_table + origin_row_id for provenance.
-- No ordinals. No collision. Deterministic from row IDs.
-- ============================================================================

DROP VIEW IF EXISTS kg_triple_sources_v1 CASCADE;
DROP VIEW IF EXISTS kg_triples_v1 CASCADE;
DROP VIEW IF EXISTS kg_atoms_v1 CASCADE;

-- ── kg_atoms_v1 ─────────────────────────────────────────────────────────────
-- Every entity in the knowledge graph.

CREATE VIEW kg_atoms_v1 AS

-- Token atoms
SELECT
  'atom:token:' || t.id::text          AS atom_id,
  'token'::text                        AS atom_type,
  t.name                               AS label,
  t.id                                 AS token_id,
  jsonb_build_object(
    'ticker',       t.ticker,
    'chain',        t.chain,
    'category',     t.category,
    'sector',       t.sector,
    'status',       t.status,
    'completeness', t.completeness,
    'tge_date',     t.tge_date,
    'contract_address', t.contract_address
  )                                    AS metadata
FROM tokens t

UNION ALL

-- Allocation atoms
SELECT
  'atom:alloc:' || a.id::text         AS atom_id,
  'allocation'::text                   AS atom_type,
  COALESCE(a.label, a.segment_type)    AS label,
  a.token_id,
  jsonb_build_object(
    'segment_type', a.segment_type,
    'percentage',   a.percentage,
    'token_amount', a.token_amount,
    'wallet_address', a.wallet_address
  )                                    AS metadata
FROM allocation_segments a

UNION ALL

-- Vesting atoms
SELECT
  'atom:vest:' || v.id::text          AS atom_id,
  'vesting'::text                      AS atom_type,
  'Vesting'::text                      AS label,
  alloc.token_id,
  jsonb_build_object(
    'cliff_months',            v.cliff_months,
    'duration_months',         v.duration_months,
    'frequency',               v.frequency,
    'tge_percentage',          v.tge_percentage,
    'cliff_unlock_percentage', v.cliff_unlock_percentage
  )                                    AS metadata
FROM vesting_schedules v
JOIN allocation_segments alloc ON alloc.id = v.allocation_id

UNION ALL

-- Emission model atoms
SELECT
  'atom:emission:' || e.id::text      AS atom_id,
  'emission'::text                     AS atom_type,
  'Emission'::text                     AS label,
  e.token_id,
  jsonb_build_object(
    'type',                  e.type,
    'annual_inflation_rate', e.annual_inflation_rate,
    'has_burn',              e.has_burn,
    'has_buyback',           e.has_buyback
  )                                    AS metadata
FROM emission_models e

UNION ALL

-- Data source atoms
SELECT
  'atom:source:' || ds.id::text       AS atom_id,
  'data_source'::text                  AS atom_type,
  ds.document_name                     AS label,
  ds.token_id,
  jsonb_build_object(
    'source_type', ds.source_type,
    'url',         ds.url,
    'version',     ds.version,
    'verified_at', ds.verified_at
  )                                    AS metadata
FROM data_sources ds

UNION ALL

-- Risk flag atoms
SELECT
  'atom:risk:' || rf.id::text         AS atom_id,
  'risk_flag'::text                    AS atom_type,
  rf.flag_type                         AS label,
  rf.token_id,
  jsonb_build_object(
    'severity',      rf.severity,
    'is_flagged',    rf.is_flagged,
    'justification', rf.justification
  )                                    AS metadata
FROM risk_flags rf

UNION ALL

-- Taxonomy: categories (deduplicated)
SELECT DISTINCT
  'atom:category:' || t.category       AS atom_id,
  'category'::text                     AS atom_type,
  t.category                           AS label,
  NULL::uuid                           AS token_id,
  '{}'::jsonb                          AS metadata
FROM tokens t WHERE t.category IS NOT NULL

UNION ALL

-- Taxonomy: sectors (deduplicated)
SELECT DISTINCT
  'atom:sector:' || t.sector           AS atom_id,
  'sector'::text                       AS atom_type,
  t.sector                             AS label,
  NULL::uuid                           AS token_id,
  '{}'::jsonb                          AS metadata
FROM tokens t WHERE t.sector IS NOT NULL

UNION ALL

-- Taxonomy: chains (deduplicated)
SELECT DISTINCT
  'atom:chain:' || t.chain             AS atom_id,
  'chain'::text                        AS atom_type,
  t.chain                              AS label,
  NULL::uuid                           AS token_id,
  '{}'::jsonb                          AS metadata
FROM tokens t WHERE t.chain IS NOT NULL;


-- ── kg_triples_v1 ───────────────────────────────────────────────────────────
-- Every fact in the knowledge graph as a first-class triple.
-- Structural relationships AND literal property facts.
--
-- claim_group: aligns with claim_sources.claim_type for provenance mapping.
-- origin_table + origin_row_id: traceable back to the source row.

CREATE VIEW kg_triples_v1 AS

-- ═══════════════════ STRUCTURAL RELATIONSHIPS ═══════════════════════════════

-- Token → Allocation
SELECT 'triple:' || t.id::text || ':has_alloc:' || a.id::text AS triple_id,
  'atom:token:' || t.id::text AS subject_id, 'has Allocation Segment'::text AS predicate,
  'atom:alloc:' || a.id::text AS object_id, NULL::text AS object_literal,
  t.id AS token_id, 'token_identity'::text AS claim_group,
  'allocation_segments'::text AS origin_table, a.id AS origin_row_id
FROM allocation_segments a JOIN tokens t ON t.id = a.token_id

UNION ALL

-- Allocation → Vesting
SELECT 'triple:' || a.id::text || ':has_vest:' || v.id::text,
  'atom:alloc:' || a.id::text, 'has Vesting Schedule',
  'atom:vest:' || v.id::text, NULL,
  a.token_id, 'vesting_schedule', 'vesting_schedules', v.id
FROM vesting_schedules v JOIN allocation_segments a ON a.id = v.allocation_id

UNION ALL

-- Token → Emission
SELECT 'triple:' || t.id::text || ':has_emission:' || e.id::text,
  'atom:token:' || t.id::text, 'has Emission Model',
  'atom:emission:' || e.id::text, NULL,
  t.id, 'emission_model', 'emission_models', e.id
FROM emission_models e JOIN tokens t ON t.id = e.token_id

UNION ALL

-- Token → Data Source
SELECT 'triple:' || t.id::text || ':has_source:' || ds.id::text,
  'atom:token:' || t.id::text, 'has Data Source',
  'atom:source:' || ds.id::text, NULL,
  t.id, 'token_identity', 'data_sources', ds.id
FROM data_sources ds JOIN tokens t ON t.id = ds.token_id

UNION ALL

-- Token → Risk Flag
SELECT 'triple:' || t.id::text || ':has_risk:' || rf.id::text,
  'atom:token:' || t.id::text, 'has Risk Flag',
  'atom:risk:' || rf.id::text, NULL,
  t.id, 'token_identity', 'risk_flags', rf.id
FROM risk_flags rf JOIN tokens t ON t.id = rf.token_id

UNION ALL

-- Token → Category
SELECT 'triple:' || t.id::text || ':has_category:' || t.category,
  'atom:token:' || t.id::text, 'has Category',
  'atom:category:' || t.category, NULL,
  t.id, 'token_identity', 'tokens', t.id
FROM tokens t WHERE t.category IS NOT NULL

UNION ALL

-- Token → Sector
SELECT 'triple:' || t.id::text || ':has_sector:' || t.sector,
  'atom:token:' || t.id::text, 'has Sector',
  'atom:sector:' || t.sector, NULL,
  t.id, 'token_identity', 'tokens', t.id
FROM tokens t WHERE t.sector IS NOT NULL

UNION ALL

-- Token → Chain
SELECT 'triple:' || t.id::text || ':has_chain:' || t.chain,
  'atom:token:' || t.id::text, 'has Chain',
  'atom:chain:' || t.chain, NULL,
  t.id, 'token_identity', 'tokens', t.id
FROM tokens t WHERE t.chain IS NOT NULL

UNION ALL

-- ═══════════════════ TOKEN LITERAL FACTS ════════════════════════════════════

-- Token has contract address
SELECT 'triple:' || t.id::text || ':has_contract_address',
  'atom:token:' || t.id::text, 'has Contract Address',
  NULL, t.contract_address,
  t.id, 'token_identity', 'tokens', t.id
FROM tokens t WHERE t.contract_address IS NOT NULL

UNION ALL

-- Token has TGE date
SELECT 'triple:' || t.id::text || ':has_tge_date',
  'atom:token:' || t.id::text, 'has TGE Date',
  NULL, t.tge_date::text,
  t.id, 'token_identity', 'tokens', t.id
FROM tokens t WHERE t.tge_date IS NOT NULL

UNION ALL

-- Token has status
SELECT 'triple:' || t.id::text || ':has_status',
  'atom:token:' || t.id::text, 'has Status',
  NULL, t.status,
  t.id, 'token_identity', 'tokens', t.id
FROM tokens t

UNION ALL

-- Token has completeness
SELECT 'triple:' || t.id::text || ':has_completeness',
  'atom:token:' || t.id::text, 'has Completeness',
  NULL, t.completeness::text,
  t.id, 'token_identity', 'tokens', t.id
FROM tokens t

UNION ALL

-- ═══════════════════ SUPPLY LITERAL FACTS ═══════════════════════════════════

SELECT 'triple:' || t.id::text || ':has_max_supply',
  'atom:token:' || t.id::text, 'has Max Supply',
  NULL, sm.max_supply::text,
  t.id, 'supply_metrics', 'supply_metrics', sm.id
FROM supply_metrics sm JOIN tokens t ON t.id = sm.token_id WHERE sm.max_supply IS NOT NULL

UNION ALL

SELECT 'triple:' || t.id::text || ':has_initial_supply',
  'atom:token:' || t.id::text, 'has Initial Supply',
  NULL, sm.initial_supply::text,
  t.id, 'supply_metrics', 'supply_metrics', sm.id
FROM supply_metrics sm JOIN tokens t ON t.id = sm.token_id WHERE sm.initial_supply IS NOT NULL

UNION ALL

SELECT 'triple:' || t.id::text || ':has_tge_supply',
  'atom:token:' || t.id::text, 'has TGE Supply',
  NULL, sm.tge_supply::text,
  t.id, 'supply_metrics', 'supply_metrics', sm.id
FROM supply_metrics sm JOIN tokens t ON t.id = sm.token_id WHERE sm.tge_supply IS NOT NULL

UNION ALL

SELECT 'triple:' || t.id::text || ':has_circulating_supply',
  'atom:token:' || t.id::text, 'has Circulating Supply',
  NULL, sm.circulating_supply::text,
  t.id, 'supply_metrics', 'supply_metrics', sm.id
FROM supply_metrics sm JOIN tokens t ON t.id = sm.token_id WHERE sm.circulating_supply IS NOT NULL

UNION ALL

-- ═══════════════════ ALLOCATION LITERAL FACTS ═══════════════════════════════

SELECT 'triple:' || a.id::text || ':has_percentage',
  'atom:alloc:' || a.id::text, 'has Percentage',
  NULL, a.percentage::text,
  a.token_id, 'allocation_segment', 'allocation_segments', a.id
FROM allocation_segments a WHERE a.percentage IS NOT NULL

UNION ALL

SELECT 'triple:' || a.id::text || ':has_token_amount',
  'atom:alloc:' || a.id::text, 'has Token Amount',
  NULL, a.token_amount::text,
  a.token_id, 'allocation_segment', 'allocation_segments', a.id
FROM allocation_segments a WHERE a.token_amount IS NOT NULL

UNION ALL

SELECT 'triple:' || a.id::text || ':has_wallet_address',
  'atom:alloc:' || a.id::text, 'has Wallet Address',
  NULL, a.wallet_address,
  a.token_id, 'allocation_segment', 'allocation_segments', a.id
FROM allocation_segments a WHERE a.wallet_address IS NOT NULL

UNION ALL

-- ═══════════════════ VESTING LITERAL FACTS ══════════════════════════════════

SELECT 'triple:' || v.id::text || ':has_cliff_months',
  'atom:vest:' || v.id::text, 'has Cliff Months',
  NULL, v.cliff_months::text,
  alloc.token_id, 'vesting_schedule', 'vesting_schedules', v.id
FROM vesting_schedules v JOIN allocation_segments alloc ON alloc.id = v.allocation_id
WHERE v.cliff_months IS NOT NULL

UNION ALL

SELECT 'triple:' || v.id::text || ':has_duration_months',
  'atom:vest:' || v.id::text, 'has Duration Months',
  NULL, v.duration_months::text,
  alloc.token_id, 'vesting_schedule', 'vesting_schedules', v.id
FROM vesting_schedules v JOIN allocation_segments alloc ON alloc.id = v.allocation_id
WHERE v.duration_months IS NOT NULL

UNION ALL

SELECT 'triple:' || v.id::text || ':has_frequency',
  'atom:vest:' || v.id::text, 'has Frequency',
  NULL, v.frequency,
  alloc.token_id, 'vesting_schedule', 'vesting_schedules', v.id
FROM vesting_schedules v JOIN allocation_segments alloc ON alloc.id = v.allocation_id
WHERE v.frequency IS NOT NULL

UNION ALL

SELECT 'triple:' || v.id::text || ':has_tge_percentage',
  'atom:vest:' || v.id::text, 'has TGE Percentage',
  NULL, v.tge_percentage::text,
  alloc.token_id, 'vesting_schedule', 'vesting_schedules', v.id
FROM vesting_schedules v JOIN allocation_segments alloc ON alloc.id = v.allocation_id
WHERE v.tge_percentage IS NOT NULL

UNION ALL

SELECT 'triple:' || v.id::text || ':has_cliff_unlock_percentage',
  'atom:vest:' || v.id::text, 'has Cliff Unlock Percentage',
  NULL, v.cliff_unlock_percentage::text,
  alloc.token_id, 'vesting_schedule', 'vesting_schedules', v.id
FROM vesting_schedules v JOIN allocation_segments alloc ON alloc.id = v.allocation_id
WHERE v.cliff_unlock_percentage IS NOT NULL

UNION ALL

-- ═══════════════════ EMISSION LITERAL FACTS ═════════════════════════════════

SELECT 'triple:' || e.id::text || ':has_inflation_rate',
  'atom:emission:' || e.id::text, 'has Annual Inflation Rate',
  NULL, e.annual_inflation_rate::text,
  e.token_id, 'emission_model', 'emission_models', e.id
FROM emission_models e WHERE e.annual_inflation_rate IS NOT NULL

UNION ALL

-- ═══════════════════ SOURCE LITERAL FACTS ═══════════════════════════════════

SELECT 'triple:' || ds.id::text || ':has_url',
  'atom:source:' || ds.id::text, 'has URL',
  NULL, ds.url,
  ds.token_id, 'token_identity', 'data_sources', ds.id
FROM data_sources ds WHERE ds.url IS NOT NULL

UNION ALL

SELECT 'triple:' || ds.id::text || ':has_version',
  'atom:source:' || ds.id::text, 'has Version',
  NULL, ds.version,
  ds.token_id, 'token_identity', 'data_sources', ds.id
FROM data_sources ds WHERE ds.version IS NOT NULL

UNION ALL

SELECT 'triple:' || ds.id::text || ':has_verified_at',
  'atom:source:' || ds.id::text, 'has Verified At',
  NULL, ds.verified_at::text,
  ds.token_id, 'token_identity', 'data_sources', ds.id
FROM data_sources ds WHERE ds.verified_at IS NOT NULL

UNION ALL

-- ═══════════════════ RISK FLAG LITERAL FACTS ════════════════════════════════

SELECT 'triple:' || rf.id::text || ':has_severity',
  'atom:risk:' || rf.id::text, 'has Severity',
  NULL, rf.severity,
  rf.token_id, 'token_identity', 'risk_flags', rf.id
FROM risk_flags rf WHERE rf.severity IS NOT NULL

UNION ALL

SELECT 'triple:' || rf.id::text || ':has_is_flagged',
  'atom:risk:' || rf.id::text, 'is Flagged',
  NULL, rf.is_flagged::text,
  rf.token_id, 'token_identity', 'risk_flags', rf.id
FROM risk_flags rf

UNION ALL

SELECT 'triple:' || rf.id::text || ':has_justification',
  'atom:risk:' || rf.id::text, 'has Justification',
  NULL, rf.justification,
  rf.token_id, 'token_identity', 'risk_flags', rf.id
FROM risk_flags rf WHERE rf.justification IS NOT NULL;


-- ── kg_triple_sources_v1 ────────────────────────────────────────────────────
-- Provenance: which data source attests which claim group.
-- Granularity is claim_type + optional claim_id (claim_group level).
-- Maps to kg_triples_v1.claim_group for triple-level provenance.

CREATE VIEW kg_triple_sources_v1 AS
SELECT
  cs.id                                      AS claim_source_id,
  'atom:source:' || cs.data_source_id::text  AS source_atom_id,
  cs.claim_type,
  cs.claim_id,
  cs.token_id
FROM claim_sources cs;
