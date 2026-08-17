begin;
create table if not exists public.booking_answer_participants(
 id uuid primary key default gen_random_uuid(),
 answer_id uuid not null references public.booking_consultation_answers(id) on delete cascade,
 profile_id uuid not null references public.consultation_profiles(id) on delete restrict,
 position integer not null,
 unique(answer_id,position)
);
alter table public.booking_answer_participants enable row level security;
commit;
