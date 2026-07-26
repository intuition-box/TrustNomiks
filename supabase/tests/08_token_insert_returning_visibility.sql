-- Regression: the screener auto-draft is INSERT ... RETURNING through
-- PostgREST. Under 20260723 alone, readable_token_ids() (STABLE) evaluates
-- RETURNING against the pre-insert snapshot, so the creator cannot read the
-- row they are creating and the whole statement fails 42501. 20260728 adds
-- the row-local own-rows clause that makes this live again.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'draft-contrib@t.co'),
  ('00000000-0000-0000-0000-000000000032', 'draft-viewer@t.co');
insert into public.wallet_links (user_id, wallet_address, chain_id, is_primary, linked_at)
values ('00000000-0000-0000-0000-000000000031',
        '0x3131313131313131313131313131313131313131', 13579, true, now());

set local role authenticated;
set local "test.uid" = '00000000-0000-0000-0000-000000000031';

-- The exact auto-draft shape: insert own draft AND read it back in the same
-- statement. This is what 403'd in production since 20260723.
select tst.lives(
  $$ insert into public.tokens (name, ticker, status, completeness, created_by)
     values ('Draft Probe', 'DRP', 'draft', 10,
             '00000000-0000-0000-0000-000000000031')
     returning id $$,
  'rls: a contributor can INSERT a draft and read it back via RETURNING');

-- The draft must also be visible in a plain follow-up SELECT.
select tst.eq(
  (select count(*)::int from public.tokens
   where ticker = 'DRP'
     and created_by = '00000000-0000-0000-0000-000000000031'),
  1,
  'rls: the fresh draft is visible to its creator afterwards');

-- Negative control: someone else's private draft stays invisible.
set local "test.uid" = '00000000-0000-0000-0000-000000000032';
select tst.eq(
  (select count(*)::int from public.tokens where ticker = 'DRP'),
  0,
  'rls: another user still cannot see the private draft');

-- Negative control: a viewer (no wallet link) still cannot insert at all.
select tst.throws(
  $$ insert into public.tokens (name, ticker, status, completeness, created_by)
     values ('Viewer Draft', 'VWD', 'draft', 10,
             '00000000-0000-0000-0000-000000000032') $$,
  'row-level security',
  'rls: a viewer still cannot insert a token');

rollback;
