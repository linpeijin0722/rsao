begin;
create table if not exists public.line_contacts (
 line_user_id text primary key check (line_user_id ~ '^U[0-9a-fA-F]{32}$'),
 display_name text not null,
 picture_url text,
 updated_at timestamptz not null default now()
);
alter table public.line_contacts enable row level security;
revoke all on public.line_contacts from anon, authenticated;
grant all on public.line_contacts to service_role;
commit;
