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

drop policy if exists "Users can read their projects" on public.projects;
create policy "Users can read their projects"
  on public.projects
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create their projects" on public.projects;
create policy "Users can create their projects"
  on public.projects
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their projects" on public.projects;
create policy "Users can update their projects"
  on public.projects
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their projects" on public.projects;
create policy "Users can delete their projects"
  on public.projects
  for delete
  using (auth.uid() = user_id);
```

Supabase rate-limits repeated signup requests. A `429` response from `/auth/v1/signup`
with a message like "you can only request this after 54 seconds" means the user should
wait for the displayed cooldown before requesting another signup or confirmation email.
When Supabase returns an explicit "user already registered" error, the signup form
shows that the account already exists. With email confirmations enabled, Supabase can
also return a neutral success response for existing confirmed addresses to avoid
revealing which emails are registered; in that case the form keeps the standard
"check your email" confirmation message.

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

The build command writes `supabase-config.json` from those variables. The anon key is public by design; Row-Level Security protects project data.

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
  links, username/email edits, and password updates for the active account.
- Cloud project save/load through Supabase Postgres.
- Local browser storage fallback when logged out.

These Express-only features are not migrated yet:

- Admin user management and audit log UI.
- OIDC/SSO.
- WebSocket collaboration.
- Snapshot share links.
- Cloud component-library API.
