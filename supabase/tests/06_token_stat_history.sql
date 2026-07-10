-- token_stat_history: the append-only stat ledger and its capture trigger.
-- The trigger must record every tracked change WITHOUT ever interfering with
-- the save path (pre-mortem: a failing AFTER trigger aborts studio saves),
-- skip no-op updates, and stay write-proof from client roles.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000031', 'hist@t.co');

insert into public.tokens (id, name, ticker, status, completeness, created_by)
values ('00000000-0000-0000-0000-0000000000b1', 'HistTok', 'HT', 'draft', 10,
        '00000000-0000-0000-0000-000000000031');

-- INSERT captured: the new token already has its baseline row
select tst.eq(
  (select count(*) from token_stat_history
   where token_id = '00000000-0000-0000-0000-0000000000b1'),
  1::bigint,
  'history: INSERT records the baseline snapshot');

-- Tracked UPDATE (completeness) captured with the NEW value.
-- NOTE: now() is transaction-stable, so rows written inside this test share
-- one recorded_at; assert by content, never by intra-transaction ordering.
update tokens set completeness = 45
where id = '00000000-0000-0000-0000-0000000000b1';
select tst.eq(
  (select count(*) from token_stat_history
   where token_id = '00000000-0000-0000-0000-0000000000b1'),
  2::bigint,
  'history: completeness change appends one row');
select tst.ok(
  exists (select 1 from token_stat_history
          where token_id = '00000000-0000-0000-0000-0000000000b1'
            and completeness = 45),
  'history: the appended row carries the new completeness');

-- Untracked UPDATE (name only) records nothing
update tokens set name = 'HistTok Renamed'
where id = '00000000-0000-0000-0000-0000000000b1';
select tst.eq(
  (select count(*) from token_stat_history
   where token_id = '00000000-0000-0000-0000-0000000000b1'),
  2::bigint,
  'history: untracked change appends nothing');

-- Status change captured (the StatusManager direct-UPDATE path)
update tokens set status = 'in_review'
where id = '00000000-0000-0000-0000-0000000000b1';
select tst.eq(
  (select count(*) from token_stat_history
   where token_id = '00000000-0000-0000-0000-0000000000b1'),
  3::bigint,
  'history: status change appends one row');
select tst.ok(
  exists (select 1 from token_stat_history
          where token_id = '00000000-0000-0000-0000-0000000000b1'
            and status = 'in_review'),
  'history: direct status update is captured');

-- And above all: the save itself succeeded every time (the row moved)
select tst.eq(
  (select status from tokens where id = '00000000-0000-0000-0000-0000000000b1'),
  'in_review',
  'history: the trigger never blocks the token save');

-- Client roles cannot write the ledger (append-only from the trigger only)
set local role authenticated;
set local "test.uid" = '00000000-0000-0000-0000-000000000031';
select tst.throws(
  $$ insert into token_stat_history (token_id, status, completeness)
     values ('00000000-0000-0000-0000-0000000000b1', 'draft', 1) $$,
  'row-level security',
  'history: authenticated INSERT is denied by RLS');

reset role;
rollback;
