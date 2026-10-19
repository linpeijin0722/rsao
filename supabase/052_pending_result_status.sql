-- Execute BEFORE deploying this update. Safe to run again.
begin;
-- Include the previously missed migration 051.
alter table public.bookings add column if not exists data_submission_source text;
alter table public.bookings add column if not exists consultation_result_returned_at timestamptz;
alter table public.bookings add column if not exists consultation_result_detected_at timestamptz;
comment on column public.bookings.consultation_result_detected_at is
  'First time all current consultation documents were observed in the returned Drive folder; not the actual delivery time.';
notify pgrst, 'reload schema';
commit;
