begin;

alter table public.consultation_profiles add column if not exists profile_type text not null default 'person';
alter table public.consultation_profiles add column if not exists relationship_detail text;
alter table public.consultation_profiles add column if not exists address text;
alter table public.consultation_profiles add column if not exists zodiac text;
alter table public.consultation_profiles add column if not exists death_date date;
alter table public.consultation_profiles add column if not exists lunar_death_text text;
alter table public.consultation_profiles add column if not exists death_shichen text;
alter table public.consultation_profiles add column if not exists owner_profile_id uuid references public.consultation_profiles(id) on delete set null;
alter table public.consultation_profiles add column if not exists photo_data text;

create table if not exists public.booking_consultation_answers(
  id uuid primary key default gen_random_uuid(),
  booking_detail_id uuid not null references public.booking_details(id) on delete cascade,
  profile_id uuid not null references public.consultation_profiles(id) on delete restrict,
  questions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(booking_detail_id)
);

alter table public.booking_consultation_answers enable row level security;
commit;
