begin;
create table if not exists public.result_reminder_log (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 reminder_date date not null,
 recipient_line_user_id text not null,
 retry_key uuid not null,
 status text not null check(status in ('sending','sent','skipped','failed','uncertain')),
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 last_error text,
 unique(booking_id,reminder_date,recipient_line_user_id)
);
alter table public.result_reminder_log enable row level security;
revoke all on public.result_reminder_log from public,anon,authenticated;
grant all on public.result_reminder_log to service_role;
commit;
