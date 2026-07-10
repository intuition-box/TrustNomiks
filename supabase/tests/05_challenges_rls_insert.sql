-- Viewer-write hole (review finding #1): the direct INSERT policy on
-- `challenges` was dropped, so an authenticated client can no longer create a
-- challenge straight through PostgREST — the only write path is the
-- SECURITY DEFINER open_challenge_tx, which enforces the wallet + contributor
-- gates. RLS must reject a raw INSERT even from a legitimate contributor.
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

-- Even a contributor writing a well-formed, own-authored row is blocked: there
-- is no INSERT policy, so the write must go through open_challenge_tx.
select tst.throws(
  $$ insert into public.challenges
       (token_id, claim_type, field_key, challenge_type, reason,
        snapshot_value, status, onchain_tx_hashes, created_by)
     values ('00000000-0000-0000-0000-0000000000a1', 'token_identity', 'name',
             'dispute', 'r', '"Old"'::jsonb, 'open', '[]'::jsonb,
             '00000000-0000-0000-0000-000000000002') $$,
  'row-level security',
  'rls: authenticated cannot directly INSERT a challenge (must use the RPC)');

-- SELECT stays open (collaborative read), so the drawer/list still work.
select tst.lives(
  $$ select 1 from public.challenges limit 1 $$,
  'rls: authenticated can still read challenges');

rollback;
