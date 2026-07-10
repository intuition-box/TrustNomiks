-- Hardening (review findings #1–#4, #6): the server-verified RPCs were revoked
-- from `authenticated` and are service-role only. An authenticated caller must
-- be blocked at the privilege layer (never reaching their logic), while the
-- same call as service_role is not privilege-blocked.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000002', 'contrib@t.co');
insert into public.tokens (id, name, ticker, status, created_by) values
  ('00000000-0000-0000-0000-0000000000a1', 'Tok', 'TK', 'validated',
   '00000000-0000-0000-0000-000000000002');
insert into public.wallet_links (user_id, wallet_address, chain_id, is_primary, linked_at)
values ('00000000-0000-0000-0000-000000000002',
        '0x2222222222222222222222222222222222222222', 13579, true, now());

set local role authenticated;
set local "test.uid" = '00000000-0000-0000-0000-000000000002';

-- All five are EXECUTE-revoked from authenticated.
select tst.throws(
  $$ select confirm_wallet_link_tx('nonce', '00000000-0000-0000-0000-000000000002'::uuid, '0xabc') $$,
  'permission denied', 'harden: confirm_wallet_link_tx denied to authenticated');
select tst.throws(
  $$ select evaluate_stake_threshold_tx('00000000-0000-0000-0000-0000000000c1'::uuid, true, '0', 0, now()) $$,
  'permission denied', 'harden: evaluate_stake_threshold_tx denied to authenticated');
select tst.throws(
  $$ select record_challenge_onchain_tx('00000000-0000-0000-0000-0000000000c1'::uuid,
       '00000000-0000-0000-0000-000000000002'::uuid, '0xtx', 't', 'c', 1, '0', 'dispute') $$,
  'permission denied', 'harden: record_challenge_onchain_tx denied to authenticated');
select tst.throws(
  $$ select record_challenge_supersession_tx('00000000-0000-0000-0000-0000000000c1'::uuid,
       '00000000-0000-0000-0000-000000000002'::uuid, 'nt', 'st', '[]'::jsonb) $$,
  'permission denied', 'harden: record_challenge_supersession_tx denied to authenticated');
select tst.throws(
  $$ select mark_stale_challenges_for_field('00000000-0000-0000-0000-0000000000a1'::uuid,
       'token_identity', null, 'name', '"x"'::jsonb) $$,
  'permission denied', 'harden: mark_stale_challenges_for_field denied to authenticated');

-- Same function as service_role is NOT privilege-blocked (it reaches its body;
-- with no matching open challenge it simply no-ops).
set local role service_role;
select tst.lives(
  $$ select mark_stale_challenges_for_field('00000000-0000-0000-0000-0000000000a1'::uuid,
       'token_identity', null, 'name', '"x"'::jsonb) $$,
  'harden: mark_stale_challenges_for_field runs for service_role');

rollback;
