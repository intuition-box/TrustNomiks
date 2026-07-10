-- save_identity_tx: NULL-safe ownership (the regression fixed during the
-- Resolve Box work — a non-existent token must be FORBIDDEN, never a silent
-- pass), owner-or-moderator authority, the contributor gate, optimistic
-- concurrency, and the A4 moderator-correction audit event.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@t.co'),
  ('00000000-0000-0000-0000-000000000003', 'mod@t.co'),
  ('00000000-0000-0000-0000-000000000004', 'other@t.co');

insert into public.tokens (id, name, ticker, status, created_by) values
  ('00000000-0000-0000-0000-0000000000a1', 'Tok', 'TK', 'validated',
   '00000000-0000-0000-0000-000000000001'),
  -- a3 is owned by 04, who has no linked wallet (owner but not a contributor).
  ('00000000-0000-0000-0000-0000000000a3', 'Tok3', 'T3', 'validated',
   '00000000-0000-0000-0000-000000000004');

-- 01 is the owner AND a contributor; 03 is a moderator (no wallet needed).
insert into public.wallet_links (user_id, wallet_address, chain_id, is_primary, linked_at)
values ('00000000-0000-0000-0000-000000000001',
        '0x1111111111111111111111111111111111111111', 13579, true, now());
insert into public.user_roles (user_id, role, granted_at)
values ('00000000-0000-0000-0000-000000000003', 'moderator', now());

set local role authenticated;

-- NULL-safe ownership: a non-existent token yields FORBIDDEN, not a silent pass
-- (plain `= auth.uid()` would have skipped the check when v_owner is NULL).
set local "test.uid" = '00000000-0000-0000-0000-000000000001';
select tst.throws(
  $$ select save_identity_tx('00000000-0000-0000-0000-0000000000ff',
       '{}'::jsonb, now(), null, null) $$,
  'token not found or not owned',
  'save_identity: unknown token -> FORBIDDEN (NULL-safe ownership)');

-- Neither owner nor moderator -> FORBIDDEN before the contributor gate.
set local "test.uid" = '00000000-0000-0000-0000-000000000003';
-- (03 is a moderator, so use 01's token via a non-owner non-mod instead: 04 on a1)
set local "test.uid" = '00000000-0000-0000-0000-000000000004';
select tst.throws(
  $$ select save_identity_tx('00000000-0000-0000-0000-0000000000a1',
       '{}'::jsonb, (select updated_at from tokens where id='00000000-0000-0000-0000-0000000000a1'),
       null, null) $$,
  'do not own this token',
  'save_identity: non-owner non-moderator -> FORBIDDEN');

-- Owner but NOT a contributor (04 owns a3, no wallet) -> contributor gate blocks.
select tst.throws(
  $$ select save_identity_tx('00000000-0000-0000-0000-0000000000a3',
       '{}'::jsonb, (select updated_at from tokens where id='00000000-0000-0000-0000-0000000000a3'),
       null, null) $$,
  'Contributor role required',
  'save_identity: owner without contributor status -> FORBIDDEN');

-- Owner + contributor, but a stale expected_updated_at -> optimistic-lock CONFLICT.
set local "test.uid" = '00000000-0000-0000-0000-000000000001';
select tst.throws(
  $$ select save_identity_tx('00000000-0000-0000-0000-0000000000a1',
       '{"name":"New","ticker":"TK","chain":null,"contract_address":null,"tge_date":null,"category":null,"sector":null}'::jsonb,
       'epoch'::timestamptz, null, null) $$,
  'modified by another session',
  'save_identity: stale expected_updated_at -> CONFLICT');

-- Owner + contributor + fresh expected_updated_at -> succeeds.
select tst.lives(
  $$ select save_identity_tx('00000000-0000-0000-0000-0000000000a1',
       '{"name":"New","ticker":"TK","chain":null,"contract_address":null,"tge_date":null,"category":null,"sector":null}'::jsonb,
       (select updated_at from tokens where id='00000000-0000-0000-0000-0000000000a1'),
       null, null) $$,
  'save_identity: owner + contributor + fresh timestamp -> succeeds');

-- A4: a moderator correcting a token they do NOT own succeeds and logs a
-- moderator_corrected audit event.
set local "test.uid" = '00000000-0000-0000-0000-000000000003';
select tst.lives(
  $$ select save_identity_tx('00000000-0000-0000-0000-0000000000a1',
       '{"name":"ModFix","ticker":"TK","chain":null,"contract_address":null,"tge_date":null,"category":null,"sector":null}'::jsonb,
       (select updated_at from tokens where id='00000000-0000-0000-0000-0000000000a1'),
       null, null) $$,
  'save_identity: moderator corrects a token they do not own (A4) -> succeeds');
select tst.eq(
  (select count(*)::int from challenge_events
     where token_id = '00000000-0000-0000-0000-0000000000a1'
       and event_type = 'moderator_corrected'
       and actor_id = '00000000-0000-0000-0000-000000000003'),
  1, 'save_identity: moderator correction logs a moderator_corrected event');

rollback;
