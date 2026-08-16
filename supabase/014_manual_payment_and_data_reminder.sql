begin;
alter table public.bookings add column if not exists collection_source text not null default 'gateway';
alter table public.bookings add column if not exists data_reminder_sent_at timestamptz;
commit;
