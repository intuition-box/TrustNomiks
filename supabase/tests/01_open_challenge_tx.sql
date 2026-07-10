-- open_challenge_tx: wallet gate (B4), contributor gate, token state, and the
-- update/target-existence guards. All wrapped in a rolled-back transaction so
-- nothing persists between test files.
begin;

-- Fixtures (as superuser, before we assume a role).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@t.co'),
  ('00000000-0000-0000-0000-000000000002', 'contrib@t.co');

insert into public.tokens (id, name, ticker, status, created_by) values
  ('00000000-0000-0000-0000-0000000000a1', 'Tok', 'TK', 'validated',
   '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-0000000000a2', 'Draft', 'DR', 'draft',
   '00000000-0000-0000-0000-000000000001');

-- contrib has a linked wallet -> is_contributor() is true.
insert into public.wallet_links (user_id, wallet_address, chain_id, is_primary, linked_at)
values ('00000000-0000-0000-0000-000000000002',
        '0x1111111111111111111111111111111111111111', 13579, true, now());

set local role authenticated;

-- A caller with no linked wallet (the token owner has none) is blocked by the
-- B4 wallet gate before anything else.
set local "test.uid" = '00000000-0000-0000-0000-000000000001';
select tst.throws(
  $$ select open_challenge_tx(
       '00000000-0000-0000-0000-0000000000a1', 'token_identity', null, 'name',
       'dispute', 'r', null, '"Old"'::jsonb, null, null, null,
       '0x9999999999999999999999999999999999999999') $$,
  'linked wallet is required',
  'open: caller without a linked wallet -> FORBIDDEN (wallet gate)');

-- A contributor whose linked wallet matches succeeds.
set local "test.uid" = '00000000-0000-0000-0000-000000000002';
select tst.lives(
  $$ select open_challenge_tx(
       '00000000-0000-0000-0000-0000000000a1', 'token_identity', null, 'name',
       'dispute', 'r', null, '"Old"'::jsonb, null, null, null,
       '0x1111111111111111111111111111111111111111') $$,
  'open: contributor with matching wallet -> succeeds');

select tst.eq(
  (select count(*)::int from challenges
     where token_id = '00000000-0000-0000-0000-0000000000a1'),
  1, 'open: exactly one challenge row inserted');
select tst.eq(
  (select created_by from challenges
     where token_id = '00000000-0000-0000-0000-0000000000a1' limit 1),
  '00000000-0000-0000-0000-000000000002'::uuid,
  'open: created_by is the caller, not client-supplied');
select tst.eq(
  (select status from challenges
     where token_id = '00000000-0000-0000-0000-0000000000a1' limit 1),
  'open', 'open: new challenge starts open');

-- A draft token cannot be challenged (gate passes, token state rejects).
select tst.throws(
  $$ select open_challenge_tx(
       '00000000-0000-0000-0000-0000000000a2', 'token_identity', null, 'name',
       'dispute', 'r', null, '"Old"'::jsonb, null, null, null,
       '0x1111111111111111111111111111111111111111') $$,
  'drafts cannot be challenged',
  'open: draft token -> FORBIDDEN');

-- Unknown token -> NOT_FOUND (caller still passes the wallet/contributor gates).
select tst.throws(
  $$ select open_challenge_tx(
       '00000000-0000-0000-0000-0000000000ff', 'token_identity', null, 'name',
       'dispute', 'r', null, '"Old"'::jsonb, null, null, null,
       '0x1111111111111111111111111111111111111111') $$,
  'NOT_FOUND', 'open: unknown token -> NOT_FOUND');

-- An update challenge must carry a proposed value.
select tst.throws(
  $$ select open_challenge_tx(
       '00000000-0000-0000-0000-0000000000a1', 'token_identity', null, 'name',
       'update', 'r', null, '"Old"'::jsonb, null, null, null,
       '0x1111111111111111111111111111111111111111') $$,
  'require a proposed value',
  'open: update challenge without proposed_value -> CONFLICT');

-- A row-anchored claim type must target an allocation that belongs to the token.
select tst.throws(
  $$ select open_challenge_tx(
       '00000000-0000-0000-0000-0000000000a1', 'allocation_segment',
       '00000000-0000-0000-0000-0000000000bb', 'percentage',
       'dispute', 'r', null, '"5"'::jsonb, null, null, null,
       '0x1111111111111111111111111111111111111111') $$,
  'target allocation not found',
  'open: allocation challenge with unknown claim_id -> NOT_FOUND');

rollback;
