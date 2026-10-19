begin;
create table if not exists public.line_watchlist (
  line_user_id text primary key,
  display_name text not null,
  note text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.line_watchlist enable row level security;
revoke all on public.line_watchlist from anon,authenticated;
grant all on public.line_watchlist to service_role;
commit;
