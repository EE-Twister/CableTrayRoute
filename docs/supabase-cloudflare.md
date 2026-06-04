# Cloudflare Pages + Supabase Deployment

This path keeps the app static on Cloudflare Pages and moves account login plus saved projects to Supabase.

## Supabase Setup

1. Create a Supabase project.
2. In **Authentication > Providers**, enable Email.
3. In **Authentication > URL Configuration**, set the Site URL to your Cloudflare Pages URL.
4. In the SQL editor, run:

```sql
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

revoke all privileges on table public.projects from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;

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

revoke all privileges on table public.account_deletion_requests from anon, authenticated;
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
```

In **Authentication > Providers > Email**, use Supabase's password security
controls to reject weak passwords. Enable leaked password protection when the
project is on a Supabase plan that supports it.

Hosted Admin access uses the Supabase user's `app_metadata.role`. In
**Authentication > Users**, set an administrator's raw app metadata to:

```json
{ "role": "admin" }
```

The hosted Admin page can then review `account_deletion_requests` and move a
request through `requested`, `reviewing`, `completed`, or `denied`. Completing a
request marks workflow status only; delete the Supabase Auth user and associated
records separately after any required export/retention review.

Supabase rate-limits repeated signup requests. A `429` response from `/auth/v1/signup`
with a message like "you can only request this after 54 seconds" means the user should
wait for the displayed cooldown before requesting another signup or confirmation email.
When Supabase returns an explicit "user already registered" error, the signup form
shows that the account already exists. With email confirmations enabled, Supabase can
also return a neutral success response for existing confirmed addresses to avoid
revealing which emails are registered; in that case the form keeps the standard
"check your email" confirmation message.

### Branded Authentication Emails

In **Authentication > Emails**, keep the sender and subject lines branded as
CableTrayRoute. Recommended subjects:

| Template | Subject |
| --- | --- |
| Confirm signup | Confirm your CableTrayRoute account |
| Reset password | Reset your CableTrayRoute password |
| Change email address | Confirm your new CableTrayRoute email |
| Magic Link | Sign in to CableTrayRoute |

Use copy that says "CableTrayRoute account" rather than "Supabase account" and
keeps the action button text direct, such as "Confirm account", "Reset password",
or "Confirm email change".

## Cloudflare Pages Setup

Use these build settings:

| Setting | Value |
| --- | --- |
| Build command | `npm run build:cloudflare` |
| Output directory | `/` |
| Node version | 20 or newer |

Add these Cloudflare Pages environment variables:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon public key |

The build command writes `supabase-config.json` from those variables. The anon key is public by design; Row-Level Security protects project data. Browser project list, summary, load, and delete requests also include the signed-in `user_id` as an explicit REST filter, while Supabase RLS remains the enforcement layer for account ownership.

Generated build output under `dist/` is ignored by Git. Cloudflare Pages runs the build command during deployment, so feature work should not commit generated `dist` artifacts. Use `npm run check:dist-review` before opening review if you want to verify the working tree is free of generated build noise.

## Local Development

By default, `supabase-config.json` is empty, so the app continues to use the bundled Express server auth flow.

To test Supabase locally, either fill `supabase-config.json` temporarily or run:

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_ANON_KEY="your-anon-key"
npm run build:cloudflare
```

## Current Scope

The static Supabase path supports:

- Username creation with email/password signup and login.
- A top navigation account avatar after login, generated from the signed-in
  username or email. The avatar menu links to Account and Logout.
- Account settings with profile, session, workspace summary, quick project
  links, username/email edits, password updates, account data export,
  confirmation-email resend, active-session display, account deletion request
  tracking, and sign-out controls for the active account.
- Cloud project save/load through Supabase Postgres, with My Projects summary
  cards on Home and the Project Dashboard.
- Local browser storage fallback when logged out.

These Express-only features are not migrated yet:

- Admin user management and audit log UI.
- OIDC/SSO.
- WebSocket collaboration.
- Snapshot share links.
- Cloud component-library API.
