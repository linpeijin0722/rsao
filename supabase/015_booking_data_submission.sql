begin;
alter table public.bookings add column if not exists data_submitted_at timestamptz;
commit;
