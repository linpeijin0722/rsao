create table if not exists public.consultation_return_schedules (
  id uuid primary key default gen_random_uuid(),
  booking_no text not null,
  document_id text not null,
  scheduled_for timestamptz not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consultation_return_schedules_due_idx
  on public.consultation_return_schedules(status, scheduled_for);

alter table public.consultation_return_schedules enable row level security;

create or replace function public.touch_consultation_return_schedule()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists consultation_return_schedules_touch on public.consultation_return_schedules;
create trigger consultation_return_schedules_touch
before update on public.consultation_return_schedules
for each row execute function public.touch_consultation_return_schedule();
