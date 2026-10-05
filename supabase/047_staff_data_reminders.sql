-- Run the whole file in the correct project's Supabase SQL Editor.
begin;
create table if not exists public.staff_data_reminder_settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 recipient_line_user_id text,
 expected_full_name text not null default '林啟恩',
 expected_line_name text not null default 'Nnn'
);
insert into public.staff_data_reminder_settings(id) values(true) on conflict do nothing;
-- Only bind an unambiguous exact match. No display-name-only fallback.
do $$ declare ids text[]; begin
 select array_agg(distinct line_user_id) into ids from public.customers
 where btrim(full_name)='林啟恩' and btrim(line_display_name)='Nnn' and coalesce(line_user_id,'')<>'';
 if cardinality(ids)=1 then
  update public.staff_data_reminder_settings set recipient_line_user_id=ids[1],enabled=true
  where id=true and recipient_line_user_id is null;
 end if;
end $$;
create table if not exists public.staff_data_reminder_log (
 id uuid primary key default gen_random_uuid(),
 booking_id uuid not null references public.bookings(id) on delete cascade,
 reminder_date date not null,
 recipient_line_user_id text not null,
 status text not null default 'processing' check(status in ('processing','sent','failed','skipped')),
 created_at timestamptz not null default now(), sent_at timestamptz, last_error text,
 unique(booking_id,reminder_date,recipient_line_user_id)
);
alter table public.staff_data_reminder_settings enable row level security;
alter table public.staff_data_reminder_log enable row level security;
revoke all on public.staff_data_reminder_settings,public.staff_data_reminder_log from anon,authenticated;
grant all on public.staff_data_reminder_settings,public.staff_data_reminder_log to service_role;
commit;
-- Check enabled=true and confirm the exact recipient. This does NOT send LINE.
select enabled,expected_full_name,expected_line_name,recipient_line_user_id from public.staff_data_reminder_settings;
-- If not bound, inspect records and correct the customer's full name; do not guess a UID.
select full_name,line_display_name,line_user_id from public.customers
where btrim(full_name)='林啟恩' or btrim(line_display_name)='Nnn';
