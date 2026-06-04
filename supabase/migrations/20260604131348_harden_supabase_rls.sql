create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  email text,
  reason text,
  status text not null default 'requested'
    check (status in ('requested', 'reviewing', 'completed', 'denied')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests (status, requested_at desc);

alter table public.account_deletion_requests enable row level security;

revoke all privileges on table public.projects from anon, authenticated;
revoke all privileges on table public.account_deletion_requests from anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update on table public.account_deletion_requests to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and pg_get_function_arguments(p.oid) = ''
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public';
    execute 'revoke execute on function public.rls_auto_enable() from anon';
    execute 'revoke execute on function public.rls_auto_enable() from authenticated';
  end if;
end $$;

drop policy if exists "Users can read their projects" on public.projects;
create policy "Users can read their projects"
  on public.projects
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their projects" on public.projects;
create policy "Users can create their projects"
  on public.projects
  for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their projects" on public.projects;
create policy "Users can update their projects"
  on public.projects
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their projects" on public.projects;
create policy "Users can delete their projects"
  on public.projects
  for delete
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their deletion requests" on public.account_deletion_requests;
drop policy if exists "Admins can read deletion requests" on public.account_deletion_requests;
drop policy if exists "Users and admins can read deletion requests" on public.account_deletion_requests;
create policy "Users and admins can read deletion requests"
  on public.account_deletion_requests
  for select
  using (
    (select auth.uid()) = user_id
    or (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  );

drop policy if exists "Users can create deletion requests" on public.account_deletion_requests;
create policy "Users can create deletion requests"
  on public.account_deletion_requests
  for insert
  with check ((select auth.uid()) = user_id and status = 'requested');

drop policy if exists "Admins can update deletion requests" on public.account_deletion_requests;
create policy "Admins can update deletion requests"
  on public.account_deletion_requests
  for update
  using (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin')
  with check (
    ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    and status in ('requested', 'reviewing', 'completed', 'denied')
  );
