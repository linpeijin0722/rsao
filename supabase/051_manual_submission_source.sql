alter table public.bookings add column if not exists data_submission_source text;
comment on column public.bookings.data_submission_source is 'manual_line: staff confirmed receipt through LINE; null: online or legacy submission';
