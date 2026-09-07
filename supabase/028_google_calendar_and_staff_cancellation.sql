alter table public.bookings
  add column if not exists google_calendar_event_id text;

create index if not exists bookings_google_calendar_event_id_idx
  on public.bookings (google_calendar_event_id)
  where google_calendar_event_id is not null;

comment on column public.bookings.google_calendar_event_id is
  'Google Calendar event id for paid video consultation synchronization';
