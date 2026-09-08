begin;

alter table public.bookings
  add column if not exists consultation_result_returned_at timestamptz;

comment on column public.bookings.consultation_result_returned_at is
  'Last time consultation results were successfully returned to the LINE user';

commit;
