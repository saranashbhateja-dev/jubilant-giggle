-- JEE Rush OS authenticated cloud snapshot.
-- Uses Supabase Auth email/password sessions shared between desktop and Android APK.
-- The client must use only the publishable key. Never put a service-role key in the app.

create table if not exists public.jee_rush_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 1000000),
  client_updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

create or replace function public.jee_rush_set_server_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.server_updated_at = now();
  return new;
end;
$$;

drop trigger if exists jee_rush_user_state_set_updated_at on public.jee_rush_user_state;
create trigger jee_rush_user_state_set_updated_at
before insert or update on public.jee_rush_user_state
for each row execute function public.jee_rush_set_server_updated_at();

alter table public.jee_rush_user_state enable row level security;
revoke all on public.jee_rush_user_state from anon, authenticated;
grant select, insert, update, delete on public.jee_rush_user_state to authenticated;

drop policy if exists jee_rush_user_state_select_own on public.jee_rush_user_state;
drop policy if exists jee_rush_user_state_insert_own on public.jee_rush_user_state;
drop policy if exists jee_rush_user_state_update_own on public.jee_rush_user_state;
drop policy if exists jee_rush_user_state_delete_own on public.jee_rush_user_state;

create policy jee_rush_user_state_select_own
on public.jee_rush_user_state for select to authenticated
using ((select auth.uid()) = user_id);

create policy jee_rush_user_state_insert_own
on public.jee_rush_user_state for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy jee_rush_user_state_update_own
on public.jee_rush_user_state for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy jee_rush_user_state_delete_own
on public.jee_rush_user_state for delete to authenticated
using ((select auth.uid()) = user_id);

create index if not exists jee_rush_user_state_updated_at_idx
on public.jee_rush_user_state (server_updated_at desc);

-- Lock down the old no-login sync table if this schema is being applied to the
-- earlier prototype project. It is unused; retain any old row rather than deleting data.
do $$
begin
  if to_regclass('public.jee_rush_state') is not null then
    execute 'drop policy if exists "JEE Rush sync read by sync code" on public.jee_rush_state';
    execute 'drop policy if exists "JEE Rush sync insert by sync code" on public.jee_rush_state';
    execute 'drop policy if exists "JEE Rush sync update by sync code" on public.jee_rush_state';
    execute 'revoke all on public.jee_rush_state from anon, authenticated';
  end if;
end
$$;


-- Enable Postgres Changes for cross-device live updates when the hosted project supports it.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'jee_rush_user_state'
     ) then
    execute 'alter publication supabase_realtime add table public.jee_rush_user_state';
  end if;
end
$$;
