create table if not exists public.booking_data_submissions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists booking_data_submissions_booking_idx
  on public.booking_data_submissions (booking_id, submitted_at desc);

alter table public.booking_data_submissions enable row level security;
