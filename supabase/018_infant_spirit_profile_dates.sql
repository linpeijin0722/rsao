begin;
alter table public.consultation_profiles add column if not exists pregnancy_losses jsonb not null default '[]'::jsonb;
commit;
