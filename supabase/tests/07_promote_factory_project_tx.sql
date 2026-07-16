-- promote_factory_project_tx: ownership + contributor + optimistic-lock
-- prologue, the from-data 100/100 gate, the token+children mint, the
-- draft→promoted flip, and the read-only lock that follows (trigger on
-- factory_projects, draft-only child write policies). Wrapped in a
-- rolled-back transaction so nothing persists between test files.
begin;

-- Fixtures (as superuser, before we assume a role).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'designer@t.co'),
  ('00000000-0000-0000-0000-000000000032', 'other@t.co');

-- Both users are contributors (linked wallets).
insert into public.wallet_links (user_id, wallet_address, chain_id, is_primary, linked_at)
values
  ('00000000-0000-0000-0000-000000000031',
   '0x3131313131313131313131313131313131313131', 13579, true, now()),
  ('00000000-0000-0000-0000-000000000032',
   '0x3232323232323232323232323232323232323232', 13579, true, now());

-- P1: a COMPLETE design (category+sector, supply, 3 allocations summing 100,
-- vesting on one allocation, emission type + burn) owned by designer.
insert into public.factory_projects (id, name, ticker, category, sector, status, created_by)
values ('00000000-0000-0000-0000-0000000000f1', 'Probe Design', 'PRB',
        'financial', 'dex', 'draft', '00000000-0000-0000-0000-000000000031');

insert into public.factory_supply_metrics (project_id, max_supply, tge_supply)
values ('00000000-0000-0000-0000-0000000000f1', 1000000000, 50000000);

insert into public.factory_allocation_segments (id, project_id, segment_type, label, percentage, token_amount)
values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000f1',
   'team-founders', 'Team', 40, 400000000),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000f1',
   'treasury', 'Treasury', 35, 350000000),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000f1',
   'liquidity', 'Liquidity', 25, 250000000);

insert into public.factory_vesting_schedules
  (allocation_id, cliff_months, duration_months, frequency, tge_percentage, cliff_unlock_percentage)
values ('00000000-0000-0000-0000-0000000000b1', 12, 36, 'monthly', 5, 10);

insert into public.factory_emission_models (project_id, type, has_burn)
values ('00000000-0000-0000-0000-0000000000f1', 'fixed_cap', true);

-- P2: an INCOMPLETE design (2 allocations, no vesting, no emission).
insert into public.factory_projects (id, name, ticker, category, sector, status, created_by)
values ('00000000-0000-0000-0000-0000000000f2', 'Half Design', 'HLF',
        'financial', 'lending', 'draft', '00000000-0000-0000-0000-000000000031');

insert into public.factory_supply_metrics (project_id, max_supply)
values ('00000000-0000-0000-0000-0000000000f2', 500000000);

insert into public.factory_allocation_segments (project_id, segment_type, label, percentage)
values
  ('00000000-0000-0000-0000-0000000000f2', 'team-founders', 'Team', 60),
  ('00000000-0000-0000-0000-0000000000f2', 'treasury', 'Treasury', 40);

set local role authenticated;

-- A foreign contributor cannot promote someone else's design.
set local "test.uid" = '00000000-0000-0000-0000-000000000032';
select tst.throws(
  $$ select promote_factory_project_tx(
       '00000000-0000-0000-0000-0000000000f1',
       (select updated_at from factory_projects
        where id='00000000-0000-0000-0000-0000000000f1'), null, null) $$,
  'FORBIDDEN',
  'promote: foreign contributor -> FORBIDDEN');

-- The owner with a stale expected_updated_at hits the optimistic lock.
set local "test.uid" = '00000000-0000-0000-0000-000000000031';
select tst.throws(
  $$ select promote_factory_project_tx(
       '00000000-0000-0000-0000-0000000000f1',
       now() - interval '1 hour', null, null) $$,
  'CONFLICT',
  'promote: stale expected_updated_at -> CONFLICT');

-- An incomplete design is rejected by the from-data gate.
select tst.throws(
  $$ select promote_factory_project_tx(
       '00000000-0000-0000-0000-0000000000f2',
       (select updated_at from factory_projects
        where id='00000000-0000-0000-0000-0000000000f2'), null, null) $$,
  'INCOMPLETE',
  'promote: incomplete design -> INCOMPLETE');

-- The owner promotes the complete design.
select tst.lives(
  $$ select promote_factory_project_tx(
       '00000000-0000-0000-0000-0000000000f1',
       (select updated_at from factory_projects
        where id='00000000-0000-0000-0000-0000000000f1'), 65,
       '{"identity":0,"supply":15,"allocation":20,"vesting":20}'::jsonb) $$,
  'promote: complete design promotes');

-- The design flipped and points at the minted token.
select tst.eq(
  (select status from factory_projects where id='00000000-0000-0000-0000-0000000000f1'),
  'promoted'::text,
  'promote: design status is promoted');
select tst.ok(
  (select promoted_token_id is not null and promoted_at is not null
   from factory_projects where id='00000000-0000-0000-0000-0000000000f1'),
  'promote: promoted_token_id and promoted_at are set');

-- The minted token mirrors the design (a private draft owned by the caller).
select tst.ok(
  (select count(*) = 1 from tokens t
   join factory_projects p on p.promoted_token_id = t.id
   where p.id='00000000-0000-0000-0000-0000000000f1'
     and t.name='Probe Design' and t.ticker='PRB' and t.status='draft'
     and t.category='financial' and t.sector='dex'
     and t.completeness=65
     and t.created_by='00000000-0000-0000-0000-000000000031'),
  'promote: token row minted as a draft with the design identity');
select tst.eq(
  (select max_supply from supply_metrics where token_id =
    (select promoted_token_id from factory_projects
     where id='00000000-0000-0000-0000-0000000000f1')),
  1000000000::bigint,
  'promote: supply copied (incl. derived tge_supply column)');
select tst.eq(
  (select count(*) from allocation_segments where token_id =
    (select promoted_token_id from factory_projects
     where id='00000000-0000-0000-0000-0000000000f1')),
  3::bigint,
  'promote: three allocation segments copied');
select tst.eq(
  (select count(*) from vesting_schedules vs
   join allocation_segments s on s.id = vs.allocation_id
   where s.token_id =
    (select promoted_token_id from factory_projects
     where id='00000000-0000-0000-0000-0000000000f1')),
  1::bigint,
  'promote: vesting schedule follows its allocation');
select tst.ok(
  (select type='fixed_cap' and has_burn from emission_models where token_id =
    (select promoted_token_id from factory_projects
     where id='00000000-0000-0000-0000-0000000000f1')),
  'promote: emission model copied');

-- Promoting again is rejected: the design is read-only now.
select tst.throws(
  $$ select promote_factory_project_tx(
       '00000000-0000-0000-0000-0000000000f1',
       (select updated_at from factory_projects
        where id='00000000-0000-0000-0000-0000000000f1'), null, null) $$,
  'READONLY',
  'promote: double promote -> READONLY');

-- The save RPCs bounce off the readonly-guard trigger (they all bump the
-- parent's updated_at).
select tst.throws(
  $$ select save_factory_supply_metrics_tx(
       '00000000-0000-0000-0000-0000000000f1',
       '{"max_supply":"2000000000"}'::jsonb,
       (select updated_at from factory_projects
        where id='00000000-0000-0000-0000-0000000000f1'), null, null) $$,
  'READONLY',
  'lock: save RPC on a promoted design -> READONLY');

-- A direct owner UPDATE (the benchmark-panel path) is blocked too.
select tst.throws(
  $$ update factory_projects set notes='vandalism'
     where id='00000000-0000-0000-0000-0000000000f1' $$,
  'READONLY',
  'lock: direct UPDATE on a promoted design -> READONLY');

-- A draft cannot be flipped to promoted outside the RPC.
select tst.throws(
  $$ update factory_projects set status='promoted'
     where id='00000000-0000-0000-0000-0000000000f2' $$,
  'FORBIDDEN',
  'lock: raw status flip on a draft -> FORBIDDEN');

-- Child writes on a promoted design die on the draft-only policies.
select tst.throws(
  $$ insert into factory_allocation_segments (project_id, segment_type, label, percentage)
     values ('00000000-0000-0000-0000-0000000000f1', 'airdrop', 'Sneaky', 1) $$,
  'row-level security',
  'lock: child insert on a promoted design -> RLS');

rollback;
