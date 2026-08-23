begin;
alter table public.consultation_profiles add column if not exists lunar_birth_text text;
alter table public.consultation_profiles add column if not exists birth_shichen text;
commit;
