-- resolve_challenge_tx: decision validation, authority (owner or moderator
-- only), and recusal (you cannot resolve your own challenge).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@t.co'),
  ('00000000-0000-0000-0000-000000000002', 'contrib@t.co'),
  ('00000000-0000-0000-0000-000000000003', 'mod@t.co'),
  ('00000000-0000-0000-0000-000000000004', 'other@t.co');

insert into public.tokens (id, name, ticker, status, created_by) values
  ('00000000-0000-0000-0000-0000000000a1', 'Tok', 'TK', 'validated',
   '00000000-0000-0000-0000-000000000001');

-- 03 is a moderator.
insert into public.user_roles (user_id, role, granted_at)
values ('00000000-0000-0000-0000-000000000003', 'moderator', now());

-- A challenge opened by the contributor (02), and one opened by the moderator (03).
insert into public.challenges
  (id, token_id, claim_type, field_key, challenge_type, reason,
   snapshot_value, status, onchain_tx_hashes, created_by)
values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   'token_identity', 'name', 'dispute', 'r', '"Old"'::jsonb, 'open', '[]'::jsonb,
   '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1',
   'token_identity', 'ticker', 'dispute', 'r', '"Old"'::jsonb, 'open', '[]'::jsonb,
   '00000000-0000-0000-0000-000000000003');

set local role authenticated;

-- Invalid decision is rejected up front (before any auth work).
set local "test.uid" = '00000000-0000-0000-0000-000000000001';
select tst.throws(
  $$ select resolve_challenge_tx('00000000-0000-0000-0000-0000000000c1', 'maybe', null) $$,
  'invalid decision', 'resolve: bad decision -> CONFLICT');

-- A random authenticated user (not owner, not moderator) cannot resolve.
set local "test.uid" = '00000000-0000-0000-0000-000000000004';
select tst.throws(
  $$ select resolve_challenge_tx('00000000-0000-0000-0000-0000000000c1', 'accept', null) $$,
  'only the token owner or a moderator',
  'resolve: non-owner non-moderator -> FORBIDDEN');

-- Recusal: the moderator who opened c2 cannot resolve it, despite being a moderator.
set local "test.uid" = '00000000-0000-0000-0000-000000000003';
select tst.throws(
  $$ select resolve_challenge_tx('00000000-0000-0000-0000-0000000000c2', 'accept', null) $$,
  'cannot resolve your own challenge',
  'resolve: challenger (even a moderator) is recused from their own challenge');

-- Unknown challenge -> NOT_FOUND.
select tst.throws(
  $$ select resolve_challenge_tx('00000000-0000-0000-0000-0000000000cf', 'accept', null) $$,
  'NOT_FOUND', 'resolve: unknown challenge -> NOT_FOUND');

-- The token owner resolves the contributor's challenge (c1) successfully.
set local "test.uid" = '00000000-0000-0000-0000-000000000001';
select tst.lives(
  $$ select resolve_challenge_tx('00000000-0000-0000-0000-0000000000c1', 'reject', 'no') $$,
  'resolve: token owner resolves a third-party challenge -> succeeds');
select tst.ok(
  (select status from challenges where id = '00000000-0000-0000-0000-0000000000c1')
    <> 'open',
  'resolve: resolved challenge leaves the open state');

-- A challenge that is no longer open cannot be resolved again.
select tst.throws(
  $$ select resolve_challenge_tx('00000000-0000-0000-0000-0000000000c1', 'accept', null) $$,
  'not open', 'resolve: already-resolved challenge -> CONFLICT');

rollback;
