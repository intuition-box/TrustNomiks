-- ============================================================================
-- Minimal SQL test harness for the challenge-domain RPCs (no pgtap dependency).
--
-- Assertions RAISE EXCEPTION on failure. Every test file is run with
-- `psql -v ON_ERROR_STOP=1`, so the first failed assertion aborts psql with a
-- non-zero exit code (turns CI red). See scripts/test-db.sh for the runner and
-- supabase/tests/_bootstrap.sql for the auth/roles/base-table fixture.
--
-- A test simulates an end user with:
--     set role authenticated; select set_config('test.uid', '<uuid>', false);
-- and a service-role caller (for the hardened, service-role-only RPCs) with:
--     set role service_role;
-- auth.uid() (defined in _bootstrap.sql) reads the `test.uid` GUC, so the
-- SECURITY DEFINER RPCs see the simulated caller. Reset with `reset role;`.
-- ============================================================================

create schema if not exists tst;

-- Assert that `stmt` raises an error whose message contains `want`.
create or replace function tst.throws(stmt text, want text, name text)
returns void language plpgsql as $$
declare
  raised boolean := false;
  msg text;
begin
  begin
    execute stmt;
  exception
    when others then
      raised := true;
      msg := sqlerrm;
  end;
  if not raised then
    raise exception 'FAIL: % — expected an error containing "%", but none was raised', name, want;
  elsif position(want in msg) = 0 then
    raise exception 'FAIL: % — expected error containing "%", got "%"', name, want, msg;
  else
    raise notice 'ok: % (raised: %)', name, msg;
  end if;
end $$;

-- Assert that `stmt` runs without raising.
create or replace function tst.lives(stmt text, name text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
    raise notice 'ok: %', name;
  exception
    when others then
      raise exception 'FAIL: % — expected no error, got "%"', name, sqlerrm;
  end;
end $$;

-- Assert a boolean condition is true.
create or replace function tst.ok(cond boolean, name text)
returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'FAIL: % — condition was % (expected true)', name, coalesce(cond::text, 'null');
  end if;
  raise notice 'ok: %', name;
end $$;

-- Assert null-safe equality.
create or replace function tst.eq(a anyelement, b anyelement, name text)
returns void language plpgsql as $$
begin
  if a is not distinct from b then
    raise notice 'ok: %', name;
  else
    raise exception 'FAIL: % — % <> %', name, coalesce(a::text, 'null'), coalesce(b::text, 'null');
  end if;
end $$;

-- The helpers are SECURITY INVOKER, so the dynamic statement inside runs as
-- whatever role the test has assumed (authenticated / service_role / anon).
-- Those roles therefore need access to the harness schema itself.
grant usage on schema tst to anon, authenticated, service_role;
grant execute on all functions in schema tst to anon, authenticated, service_role;
