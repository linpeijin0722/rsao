begin;
alter table public.bookings add column if not exists paid_at timestamptz;
alter table public.bookings add column if not exists payment_notified_at timestamptz;
create table if not exists public.consultation_profiles(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete cascade,
 relationship text not null default '本人', name text not null, gender text, birth_date date, birth_time time,
 is_lunar boolean not null default false, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.booking_detail_profiles(
 booking_detail_id uuid primary key references public.booking_details(id) on delete cascade,
 profile_id uuid not null references public.consultation_profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);
alter table public.consultation_profiles enable row level security;
alter table public.booking_detail_profiles enable row level security;
commit;
